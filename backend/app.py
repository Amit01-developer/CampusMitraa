from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token
from flask_mail import Mail, Message
from werkzeug.security import generate_password_hash, check_password_hash
from auth import login_required, get_current_user
from db import firebase_error, firestore_db as fdb
from datetime import datetime, timedelta
from google.cloud.firestore_v1 import FieldFilter
import firebase_admin
import firebase_admin.auth as fb_auth
from dotenv import load_dotenv
import os
import uuid
import re
import logging
import urllib.request
import json as _json
from functools import wraps
from collections import defaultdict
import time

# ── Load .env FIRST before anything reads os.environ ─────────────────────────
load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)
logger = logging.getLogger('campusmitra')

app = Flask(__name__)
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET', 'campus-mitra-secret-2026')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=7)
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5 MB max request body

# Allow Vercel / Netlify frontend + localhost for development
_allowed_origins = [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    # Vercel wildcard patterns (flask-cors supports regex strings in list)
    r'https://.*\.vercel\.app',
    r'https://.*\.netlify\.app',
]

# Add explicit FRONTEND_URL from env
_frontend_url = os.environ.get('FRONTEND_URL', '').rstrip('/')
if _frontend_url and _frontend_url not in _allowed_origins:
    _allowed_origins.append(_frontend_url)

CORS(app, origins=_allowed_origins, supports_credentials=True)
jwt = JWTManager(app)


@app.route('/', methods=['GET'])
def root():
    return jsonify({
        'service': 'CampusMitra API',
        'status': 'ok',
        'health': '/api/health',
    }), 200

# ── Flask-Mail (Gmail SMTP) ───────────────────────────────────────────────────
_mail_user = os.environ.get('MAIL_USERNAME', '').strip()
_mail_pass = os.environ.get('MAIL_PASSWORD', '').strip().strip('"').strip("'")

app.config['MAIL_SERVER']         = 'smtp.gmail.com'
app.config['MAIL_PORT']           = 587
app.config['MAIL_USE_TLS']        = True
app.config['MAIL_USE_SSL']        = False
app.config['MAIL_USERNAME']       = _mail_user
app.config['MAIL_PASSWORD']       = _mail_pass
app.config['MAIL_DEFAULT_SENDER'] = ('CampusMitra', _mail_user)
mail = Mail(app)

_MAIL_ENABLED = bool(_mail_user and _mail_pass)
ADMIN_EMAIL   = os.environ.get('ADMIN_EMAIL', 'hacktolearn001@gmail.com').strip()

logger.info('Mail enabled: %s | sender: %s | admin: %s', _MAIL_ENABLED, _mail_user, ADMIN_EMAIL)

def _send_rental_emails(rental_data: dict, item_data: dict,
                        borrower_email: str, borrower_name: str,
                        lender_email: str, lender_name: str):
    """Send rental confirmation emails to both borrower and lender."""
    if not _MAIL_ENABLED:
        logger.info('Mail not configured — skipping email notifications')
        return

    item_name   = item_data.get('name', 'Item')
    start_date  = rental_data.get('start_date', '—')
    end_date    = rental_data.get('end_date', '—')
    total_price = rental_data.get('total_price', 0)
    rental_type = rental_data.get('rental_type', 'rent')
    rental_id   = rental_data.get('id', '')
    booking_ref = 'CM-' + str(rental_id)[:8].upper()

    price_str   = f"₹{int(total_price):,}" if total_price else "Free (Borrow)"
    type_label  = "Borrow Request" if rental_type == 'borrow' else "Rental"

    # ── Rules text (same for both emails — all 10 rules) ─────────────────────
    rules_html = """
    <div style="background:#f0fdf4;border:1.5px solid #10b981;border-radius:10px;padding:20px;margin:24px 0">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
        <span style="font-size:1.2rem">📋</span>
        <h3 style="color:#065f46;margin:0;font-size:1rem;font-weight:700">Rental Agreement &amp; Rules</h3>
      </div>
      <p style="color:#374151;font-size:0.85rem;margin:0 0 12px">
        Dono parties (Borrower &amp; Owner) in rules se bound honge:
      </p>
      <ol style="color:#374151;margin:0;padding-left:20px;line-height:2;font-size:0.88rem">
        <li>Borrower ko item <strong>agreed end date</strong> tak return karna hoga.</li>
        <li>Item wapas karte waqt <strong>same condition</strong> mein hona chahiye jisme mila tha.</li>
        <li>Kisi bhi <strong>damage ke liye borrower poori tarah zimmedar</strong> hai aur repair/replacement cost cover karni hogi.</li>
        <li>Security deposit return ke <strong>7 working days</strong> ke andar refund hoga (agar koi damage nahi).</li>
        <li>Rental extend karne ke liye borrower ko <strong>end date se pehle</strong> owner se contact karna hoga aur nayi terms agree karni hongi.</li>
        <li>Item ko kisi <strong>third party ko transfer nahi</strong> kiya ja sakta kisi bhi haalat mein.</li>
        <li>Late return par owner ke discretion se <strong>daily penalty</strong> lag sakti hai.</li>
        <li>Koi bhi <strong>dispute CampusMitra platform</strong> ke through resolve hoga.</li>
        <li>Dono parties ko poore rental period mein <strong>respectful aur professional conduct</strong> maintain karna hoga.</li>
        <li>Ye agreement legally binding nahi hai lekin seedha tumhare <strong>CampusMitra Trust Score</strong> ko affect karega.</li>
      </ol>
      <p style="color:#065f46;font-size:0.82rem;margin:14px 0 0;font-weight:600;border-top:1px solid #a7f3d0;padding-top:12px">
        ✅ Ye email receive karke dono parties in rules ko accept kiya hua maana jayega.
      </p>
    </div>"""

    # ── Email to BORROWER ─────────────────────────────────────────────────────
    borrower_html = f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:32px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:1.6rem">🎓 CampusMitra</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:0.95rem">{type_label} Confirmed!</p>
      </div>
      <div style="padding:32px">
        <p style="color:#374151;font-size:1rem">Hi <strong>{borrower_name}</strong>,</p>
        <p style="color:#374151">Tumhara <strong>{type_label.lower()}</strong> request successfully submit ho gaya hai!</p>

        <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:20px 0">
          <h3 style="color:#1e293b;margin:0 0 16px;font-size:1rem">📦 Rental Details</h3>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#64748b;padding:6px 0;width:40%">Booking ID</td><td style="color:#1e293b;font-weight:600">{booking_ref}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Item</td><td style="color:#1e293b;font-weight:600">{item_name}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Owner</td><td style="color:#1e293b">{lender_name}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Start Date</td><td style="color:#1e293b">{start_date}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">End Date</td><td style="color:#1e293b">{end_date}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Total Amount</td><td style="color:#10b981;font-weight:700">{price_str}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Status</td><td><span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:20px;font-size:0.8rem;font-weight:600">Pending Approval</span></td></tr>
          </table>
        </div>

        {rules_html}

        <p style="color:#64748b;font-size:0.9rem">Owner ke approve karne ke baad tumhe ek aur notification milega.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="{os.environ.get('FRONTEND_URL','')}/borrower-dashboard.html"
             style="background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
            View My Rentals →
          </a>
        </div>
      </div>
      <div style="background:#f8fafc;padding:20px;text-align:center;color:#94a3b8;font-size:0.8rem">
        CampusMitra — Student Rental Marketplace &nbsp;|&nbsp; Ye email automatically bheja gaya hai
      </div>
    </div>"""

    # ── Email to LENDER ───────────────────────────────────────────────────────
    lender_html = f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,#0d9488,#14b8a6);padding:32px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:1.6rem">🎓 CampusMitra</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:0.95rem">New {type_label} Request!</p>
      </div>
      <div style="padding:32px">
        <p style="color:#374151;font-size:1rem">Hi <strong>{lender_name}</strong>,</p>
        <p style="color:#374151">Tumhare item <strong>"{item_name}"</strong> ke liye ek naya {type_label.lower()} request aaya hai!</p>

        <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:20px 0">
          <h3 style="color:#1e293b;margin:0 0 16px;font-size:1rem">📋 Request Details</h3>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#64748b;padding:6px 0;width:40%">Booking ID</td><td style="color:#1e293b;font-weight:600">{booking_ref}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Item</td><td style="color:#1e293b;font-weight:600">{item_name}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Borrower</td><td style="color:#1e293b">{borrower_name}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Start Date</td><td style="color:#1e293b">{start_date}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">End Date</td><td style="color:#1e293b">{end_date}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Total Amount</td><td style="color:#10b981;font-weight:700">{price_str}</td></tr>
          </table>
        </div>

        {rules_html}

        <p style="color:#374151;font-weight:600">⚡ Action Required: Owner Dashboard pe jaake request accept ya reject karo.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="{os.environ.get('FRONTEND_URL','')}/owner-dashboard.html"
             style="background:linear-gradient(135deg,#0d9488,#14b8a6);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
            Review Request →
          </a>
        </div>
      </div>
      <div style="background:#f8fafc;padding:20px;text-align:center;color:#94a3b8;font-size:0.8rem">
        CampusMitra — Student Rental Marketplace &nbsp;|&nbsp; Ye email automatically bheja gaya hai
      </div>
    </div>"""

    # ── Admin summary email ───────────────────────────────────────────────────
    admin_html = f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:32px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:1.6rem">🎓 CampusMitra — Admin Alert</h1>
        <p style="color:rgba(255,255,255,0.75);margin:8px 0 0;font-size:0.9rem">New {type_label} Agreement Created</p>
      </div>
      <div style="padding:32px">
        <p style="color:#374151;font-size:1rem">A new <strong>{type_label}</strong> agreement has been created on CampusMitra.</p>
        <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:20px 0">
          <h3 style="color:#1e293b;margin:0 0 16px;font-size:1rem">📋 Agreement Summary</h3>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#64748b;padding:6px 0;width:40%">Booking ID</td><td style="color:#1e293b;font-weight:600">{booking_ref}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Type</td><td style="color:#1e293b;font-weight:600">{type_label}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Item</td><td style="color:#1e293b;font-weight:600">{item_name}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Borrower</td><td style="color:#1e293b">{borrower_name} &lt;{borrower_email}&gt;</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Owner</td><td style="color:#1e293b">{lender_name} &lt;{lender_email}&gt;</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Start Date</td><td style="color:#1e293b">{start_date}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">End Date</td><td style="color:#1e293b">{end_date}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Total Amount</td><td style="color:#10b981;font-weight:700">{price_str}</td></tr>
            <tr><td style="color:#64748b;padding:6px 0">Status</td><td><span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:20px;font-size:0.8rem;font-weight:600">Pending Approval</span></td></tr>
          </table>
        </div>
        <p style="color:#64748b;font-size:0.85rem">Rental ID: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">{rental_data.get('id','')}</code></p>
      </div>
      <div style="background:#f8fafc;padding:20px;text-align:center;color:#94a3b8;font-size:0.8rem">
        CampusMitra Admin Notification &nbsp;|&nbsp; Ye email automatically bheja gaya hai
      </div>
    </div>"""

    try:
        # Send to borrower (admin CC'd)
        msg_b = Message(
            subject=f"[CampusMitra] {type_label} Confirmed — {item_name} ({booking_ref})",
            recipients=[borrower_email],
            cc=[ADMIN_EMAIL],
            html=borrower_html,
        )
        mail.send(msg_b)

        # Send to lender (admin CC'd)
        msg_l = Message(
            subject=f"[CampusMitra] New {type_label} Request — {item_name} ({booking_ref})",
            recipients=[lender_email],
            cc=[ADMIN_EMAIL],
            html=lender_html,
        )
        mail.send(msg_l)

        # Send dedicated admin summary
        msg_a = Message(
            subject=f"[CampusMitra Admin] New {type_label} — {item_name} | {borrower_name} → {lender_name} ({booking_ref})",
            recipients=[ADMIN_EMAIL],
            html=admin_html,
        )
        mail.send(msg_a)

        logger.info('Rental emails sent: borrower=%s lender=%s admin=%s', borrower_email, lender_email, ADMIN_EMAIL)
    except Exception:
        # Email failure should NOT block the rental — just log it
        logger.exception('Failed to send rental notification emails')


def _send_approval_emails(rental_id: str, rdata: dict):
    """
    Called when owner approves (pending → active).
    Sends a detailed confirmation email to BOTH borrower and owner
    from the admin address — includes product details, dates, payment & rules.
    """
    if not _MAIL_ENABLED:
        logger.info('Mail not configured — skipping approval emails')
        return

    # ── Fetch borrower & lender user docs ────────────────────────────────────
    borrower_doc = fdb.collection('users').document(rdata.get('borrower_id', '')).get()
    lender_doc   = fdb.collection('users').document(rdata.get('lender_id', '')).get()
    borrower     = borrower_doc.to_dict() if borrower_doc.exists else {}
    lender       = lender_doc.to_dict()   if lender_doc.exists   else {}

    borrower_email = borrower.get('email', '')
    borrower_name  = borrower.get('name', 'Borrower')
    lender_email   = lender.get('email', '')
    lender_name    = lender.get('name', 'Owner')

    if not borrower_email or not lender_email:
        logger.warning('Approval email skipped — missing email(s): borrower=%s lender=%s',
                       borrower_email, lender_email)
        return

    # ── Fetch item details ────────────────────────────────────────────────────
    item_doc  = fdb.collection('items').document(rdata.get('item_id', '')).get()
    item_data = item_doc.to_dict() if item_doc.exists else rdata.get('item_snapshot', {})

    item_name    = item_data.get('name', 'Item')
    item_desc    = item_data.get('description', '—')
    item_cond    = item_data.get('condition', '—')
    item_zone    = item_data.get('campus_zone', '—')
    start_date   = rdata.get('start_date', '—')
    end_date     = rdata.get('end_date', '—')
    total_price  = rdata.get('total_price', 0)
    rental_type  = rdata.get('rental_type', 'rent')
    booking_ref  = 'CM-' + str(rental_id)[:8].upper()
    price_str    = f"₹{int(total_price):,}" if total_price else "Free (Borrow)"
    type_label   = "Borrow" if rental_type == 'borrow' else "Rental"
    deposit_amt  = item_data.get('deposit_amount', 0)
    deposit_str  = f"₹{int(deposit_amt):,}" if deposit_amt else "No deposit"

    # ── Shared blocks ─────────────────────────────────────────────────────────
    product_block = f"""
    <div style="background:#f8fafc;border-radius:10px;padding:20px;margin:20px 0;border:1px solid #e2e8f0">
      <h3 style="color:#1e293b;margin:0 0 16px;font-size:1rem;font-weight:700">📦 Product Details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:0.9rem">
        <tr><td style="color:#64748b;padding:7px 0;width:42%">Item Name</td>
            <td style="color:#1e293b;font-weight:600">{item_name}</td></tr>
        <tr><td style="color:#64748b;padding:7px 0">Description</td>
            <td style="color:#374151">{item_desc}</td></tr>
        <tr><td style="color:#64748b;padding:7px 0">Condition</td>
            <td style="color:#1e293b">{item_cond}</td></tr>
        <tr><td style="color:#64748b;padding:7px 0">Campus Zone</td>
            <td style="color:#1e293b">{item_zone}</td></tr>
      </table>
    </div>"""

    payment_block = f"""
    <div style="background:#f0fdf4;border-radius:10px;padding:20px;margin:20px 0;border:1px solid #bbf7d0">
      <h3 style="color:#065f46;margin:0 0 16px;font-size:1rem;font-weight:700">💳 Booking & Payment Summary</h3>
      <table style="width:100%;border-collapse:collapse;font-size:0.9rem">
        <tr><td style="color:#64748b;padding:7px 0;width:42%">Booking ID</td>
            <td style="color:#1e293b;font-weight:700">{booking_ref}</td></tr>
        <tr><td style="color:#64748b;padding:7px 0">Type</td>
            <td style="color:#1e293b">{type_label}</td></tr>
        <tr><td style="color:#64748b;padding:7px 0">Start Date</td>
            <td style="color:#1e293b;font-weight:600">{start_date}</td></tr>
        <tr><td style="color:#64748b;padding:7px 0">End Date</td>
            <td style="color:#1e293b;font-weight:600">{end_date}</td></tr>
        <tr><td style="color:#64748b;padding:7px 0">Rental Amount</td>
            <td style="color:#10b981;font-weight:700;font-size:1rem">{price_str}</td></tr>
        <tr><td style="color:#64748b;padding:7px 0">Security Deposit</td>
            <td style="color:#1e293b">{deposit_str}</td></tr>
        <tr><td style="color:#64748b;padding:7px 0">Status</td>
            <td><span style="background:#dcfce7;color:#166534;padding:3px 12px;border-radius:20px;
                font-size:0.8rem;font-weight:700">✅ APPROVED</span></td></tr>
      </table>
    </div>"""

    rules_block = """
    <div style="background:#fffbeb;border-radius:10px;padding:20px;margin:20px 0;border:1.5px solid #fcd34d">
      <h3 style="color:#92400e;margin:0 0 14px;font-size:1rem;font-weight:700">📋 Rental Agreement Rules</h3>
      <p style="color:#78350f;font-size:0.83rem;margin:0 0 12px">
        Dono parties (Borrower &amp; Owner) in rules se bound hain:
      </p>
      <ol style="color:#374151;margin:0;padding-left:20px;line-height:2;font-size:0.87rem">
        <li>Borrower ko item <strong>agreed end date</strong> tak return karna hoga.</li>
        <li>Item wapas karte waqt <strong>same condition</strong> mein hona chahiye jisme mila tha.</li>
        <li>Kisi bhi <strong>damage ke liye borrower poori tarah zimmedar</strong> hai — repair/replacement cost cover karni hogi.</li>
        <li>Security deposit return ke <strong>7 working days</strong> ke andar refund hoga (agar koi damage nahi).</li>
        <li>Rental extend karne ke liye borrower ko <strong>end date se pehle</strong> owner se contact karna hoga.</li>
        <li>Item ko kisi <strong>third party ko transfer nahi</strong> kiya ja sakta.</li>
        <li>Late return par owner ke discretion se <strong>daily penalty</strong> lag sakti hai.</li>
        <li>Koi bhi <strong>dispute CampusMitra platform</strong> ke through resolve hoga.</li>
        <li>Dono parties ko poore rental period mein <strong>respectful conduct</strong> maintain karna hoga.</li>
        <li>Ye agreement tumhare <strong>CampusMitra Trust Score</strong> ko directly affect karega.</li>
      </ol>
      <p style="color:#92400e;font-size:0.82rem;margin:14px 0 0;font-weight:600;
         border-top:1px solid #fcd34d;padding-top:12px">
        ✅ Ye email receive karke dono parties in rules ko accept kiya hua maana jayega.
      </p>
    </div>"""

    footer = """
    <div style="background:#f8fafc;padding:18px;text-align:center;color:#94a3b8;font-size:0.78rem">
      CampusMitra — Student Rental Marketplace &nbsp;|&nbsp;
      Sent by Admin &lt;hacktolearn001@gmail.com&gt;
    </div>"""

    frontend_url = os.environ.get('FRONTEND_URL', '')

    # ── Email to BORROWER ─────────────────────────────────────────────────────
    borrower_html = f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:620px;margin:0 auto;background:#fff;
         border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,#16a34a,#15803d);padding:32px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:1.6rem">🎓 CampusMitra</h1>
        <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:1rem;font-weight:600">
          🎉 Your {type_label} Request is Approved!
        </p>
      </div>
      <div style="padding:32px">
        <p style="color:#374151">Hi <strong>{borrower_name}</strong>,</p>
        <p style="color:#374151">
          Great news! <strong>{lender_name}</strong> has approved your
          <strong>{type_label.lower()}</strong> request.
          Please review the complete details below.
        </p>
        {product_block}
        {payment_block}
        {rules_block}
        <p style="color:#64748b;font-size:0.88rem;margin-top:8px">
          Owner se directly contact karo pickup ke liye. Koi bhi issue ho toh
          CampusMitra platform ke through resolve karo.
        </p>
        <div style="text-align:center;margin:28px 0">
          <a href="{frontend_url}/borrower-dashboard.html"
             style="background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;
                    padding:13px 32px;border-radius:8px;text-decoration:none;
                    font-weight:700;display:inline-block;font-size:0.95rem">
            View My Rentals →
          </a>
        </div>
      </div>
      {footer}
    </div>"""

    # ── Email to OWNER / LENDER ───────────────────────────────────────────────
    lender_html = f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:620px;margin:0 auto;background:#fff;
         border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,#0d9488,#0f766e);padding:32px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:1.6rem">🎓 CampusMitra</h1>
        <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:1rem;font-weight:600">
          ✅ You Approved a {type_label} Request
        </p>
      </div>
      <div style="padding:32px">
        <p style="color:#374151;font-size:1rem">Hi <strong>{lender_name}</strong>,</p>
        <p style="color:#374151">
          Tumne <strong>{borrower_name}</strong> ka <strong>{type_label.lower()}</strong>
          request approve kar diya hai. Neeche complete agreement details hain.
        </p>
        {product_block}
        {payment_block}
        {rules_block}
        <p style="color:#64748b;font-size:0.88rem;margin-top:8px">
          Borrower se coordinate karo item handover ke liye. Return date pe item
          wapas lena mat bhoolo.
        </p>
        <div style="text-align:center;margin:28px 0">
          <a href="{frontend_url}/owner-dashboard.html"
             style="background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;
                    padding:13px 32px;border-radius:8px;text-decoration:none;
                    font-weight:700;display:inline-block;font-size:0.95rem">
            Manage My Listings →
          </a>
        </div>
      </div>
      {footer}
    </div>"""

    try:
        msg_b = Message(
            subject=f"[CampusMitra] ✅ {type_label} Approved — {item_name} ({booking_ref})",
            sender=(f"CampusMitra Admin", ADMIN_EMAIL),
            recipients=[borrower_email],
            html=borrower_html,
        )
        mail.send(msg_b)

        msg_l = Message(
            subject=f"[CampusMitra] ✅ {type_label} Confirmed — {item_name} ({booking_ref})",
            sender=(f"CampusMitra Admin", ADMIN_EMAIL),
            recipients=[lender_email],
            html=lender_html,
        )
        mail.send(msg_l)

        logger.info('Approval emails sent → borrower=%s owner=%s (rental=%s)',
                    borrower_email, lender_email, rental_id)
    except Exception:
        logger.exception('Failed to send approval emails for rental %s', rental_id)

# ── In-memory rate limiter (per IP, resets every 60 s) ────────────────────────
_rate_store: dict = defaultdict(lambda: {'count': 0, 'reset': time.time() + 60})

def _rate_limit(max_calls: int = 30):
    """Decorator: allow max_calls per IP per 60-second window."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            ip = request.remote_addr or 'unknown'
            bucket = _rate_store[ip]
            now = time.time()
            if now > bucket['reset']:
                bucket['count'] = 0
                bucket['reset'] = now + 60
            bucket['count'] += 1
            if bucket['count'] > max_calls:
                return jsonify({'error': 'Too many requests. Please slow down.'}), 429
            return fn(*args, **kwargs)
        return wrapper
    return decorator

# ── Validation helpers ────────────────────────────────────────────────────────
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

def _validate_email(email: str) -> bool:
    return bool(EMAIL_RE.match(email or ''))

def _validate_date(d: str) -> bool:
    """Return True if d is a valid ISO date string (YYYY-MM-DD)."""
    try:
        datetime.strptime(d, '%Y-%m-%d')
        return True
    except (ValueError, TypeError):
        return False

def _sanitize_str(s, max_len=500) -> str:
    """Strip and truncate a string; return empty string for non-strings."""
    if not isinstance(s, str):
        return ''
    return s.strip()[:max_len]

# ── Serialisers ───────────────────────────────────────────────────────────────
def user_to_dict(uid, data):
    return {
        'id': uid,
        'name': data.get('name'),
        'email': data.get('email'),
        'department': data.get('department'),
        'year': data.get('year'),
        'campus_zone': data.get('campus_zone'),
        'bio': data.get('bio', ''),
        'trust_score': data.get('trust_score', 5.0),
        'is_verified': data.get('is_verified', False),
        'is_approved': data.get('is_approved', True),
        'credits': data.get('credits', 0),
        'referral_code': data.get('referral_code', ''),
        'referral_used': data.get('referral_used', False),
    }

def item_to_dict(doc_id, data, include_owner=True):
    result = {
        'id': doc_id,
        'name': data.get('name'),
        'description': data.get('description'),
        'price': data.get('price'),
        'price_amount': data.get('price_amount'),
        'price_unit': data.get('price_unit', 'day'),
        'condition': data.get('condition', 'Good'),
        'deposit': data.get('deposit'),
        'deposit_amount': data.get('deposit_amount'),
        'is_available': data.get('is_available', True),
        'campus_zone': data.get('campus_zone'),
        'category_id': data.get('category_slug'),
        'category_slug': data.get('category_slug'),
        'image_url': data.get('image_url', ''),
        'created_at': data.get('created_at', ''),
    }
    if include_owner:
        result['owner'] = data.get('owner', {})
    return result

def rental_to_dict(doc_id, data):
    return {
        'id': doc_id,
        'item_id': data.get('item_id'),
        'borrower_id': data.get('borrower_id'),
        'lender_id': data.get('lender_id'),
        'status': data.get('status', 'pending'),
        'rental_type': data.get('rental_type', 'rent'),
        'start_date': data.get('start_date'),
        'end_date': data.get('end_date'),
        'total_price': data.get('total_price'),
        'deposit_amount': data.get('deposit_amount', 0),
        'deposit_status': data.get('deposit_status', 'none'),
        'created_at': data.get('created_at', ''),
        'item': data.get('item_snapshot', {}),
    }

# ── Auth ──────────────────────────────────────────────────────────────────────
@app.route('/api/auth/signup', methods=['POST'])
@_rate_limit(10)
def signup():
    data = request.get_json(silent=True) or {}
    name     = _sanitize_str(data.get('name', ''), 100)
    email    = _sanitize_str(data.get('email', ''), 200).lower()
    password = data.get('password', '')

    if not name or not email or not password:
        return jsonify({'error': 'name, email and password are required'}), 400
    if not _validate_email(email):
        return jsonify({'error': 'Invalid email address'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    try:
        existing = fdb.collection('users').where(filter=FieldFilter('email', '==', email)).limit(1).get()
        if existing:
            return jsonify({'error': 'Email already registered'}), 409

        uid = str(uuid.uuid4())
        user_data = {
            'name': name,
            'email': email,
            'password_hash': generate_password_hash(password),
            'department': _sanitize_str(data.get('department', ''), 100),
            'year': _sanitize_str(data.get('year', ''), 20),
            'campus_zone': _sanitize_str(data.get('campus_zone', ''), 100),
            'trust_score': 5.0,
            'is_verified': email.endswith('.edu'),
            'created_at': datetime.utcnow().isoformat(),
        }
        fdb.collection('users').document(uid).set(user_data)
        token = create_access_token(identity=uid)
        logger.info('New user signed up: %s', email)
        return jsonify({'token': token, 'user': user_to_dict(uid, user_data)}), 201
    except Exception as e:
        logger.exception('signup error')
        return jsonify({'error': 'Signup failed. Please try again.'}), 500


@app.route('/api/auth/google', methods=['POST'])
@_rate_limit(20)
def google_login():
    body = request.get_json(silent=True) or {}
    id_token = body.get('id_token', '').strip()
    if not id_token:
        return jsonify({'error': 'id_token required'}), 400
    try:
        decoded = fb_auth.verify_id_token(id_token, check_revoked=False, clock_skew_seconds=10)
    except fb_auth.ExpiredIdTokenError:
        return jsonify({'error': 'Google token expired. Please sign in again.'}), 401
    except fb_auth.InvalidIdTokenError as e:
        logger.warning('google_login InvalidIdTokenError: %s', e)
        return jsonify({'error': 'Invalid Google token'}), 401
    except Exception as e:
        logger.exception('google_login unexpected error')
        return jsonify({'error': 'Google login failed. Please try again.'}), 500

    email      = decoded.get('email', '').lower()
    name       = decoded.get('name', email.split('@')[0])
    google_uid = decoded.get('uid') or decoded.get('sub')

    if not email:
        return jsonify({'error': 'Google account has no email'}), 400

    try:
        existing = fdb.collection('users').where(filter=FieldFilter('email', '==', email)).limit(1).get()
        if existing:
            doc   = existing[0]
            uid   = doc.id
            udata = doc.to_dict()
        else:
            uid = google_uid or str(uuid.uuid4())
            udata = {
                'name': name,
                'email': email,
                'password_hash': '',
                'department': '',
                'year': '',
                'campus_zone': '',
                'trust_score': 5.0,
                'is_verified': True,
                'created_at': datetime.utcnow().isoformat(),
            }
            fdb.collection('users').document(uid).set(udata)
            logger.info('New Google user created: %s', email)

        token = create_access_token(identity=uid)
        return jsonify({'token': token, 'user': user_to_dict(uid, udata)})
    except Exception:
        logger.exception('google_login db error')
        return jsonify({'error': 'Login failed. Please try again.'}), 500


@app.route('/api/auth/login', methods=['POST'])
@_rate_limit(15)
def login():
    data     = request.get_json(silent=True) or {}
    email    = _sanitize_str(data.get('email', ''), 200).lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    if not _validate_email(email):
        return jsonify({'error': 'Invalid email address'}), 400

    try:
        docs = fdb.collection('users').where(filter=FieldFilter('email', '==', email)).limit(1).get()
        if not docs:
            return jsonify({'error': 'Invalid email or password'}), 401
        doc   = docs[0]
        udata = doc.to_dict()
        if not udata.get('password_hash') or not check_password_hash(udata['password_hash'], password):
            return jsonify({'error': 'Invalid email or password'}), 401
        token = create_access_token(identity=doc.id)
        return jsonify({'token': token, 'user': user_to_dict(doc.id, udata)})
    except Exception:
        logger.exception('login error')
        return jsonify({'error': 'Login failed. Please try again.'}), 500


@app.route('/api/auth/me', methods=['GET'])
@login_required
def me():
    try:
        user = get_current_user()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        return jsonify(user_to_dict(user['id'], user))
    except Exception:
        logger.exception('me error')
        return jsonify({'error': 'Could not fetch user'}), 500


# ── Categories ────────────────────────────────────────────────────────────────
@app.route('/api/categories', methods=['GET'])
def get_categories():
    try:
        docs = fdb.collection('categories').get()
        result = []
        for doc in docs:
            d = doc.to_dict()
            items_docs = fdb.collection('items')\
                .where(filter=FieldFilter('category_slug', '==', d.get('slug')))\
                .where(filter=FieldFilter('is_available', '==', True)).get()
            item_count = len(items_docs)
            prices = [i.to_dict().get('price_amount', 0) for i in items_docs if i.to_dict().get('price_amount')]
            avg_price = round(sum(prices) / len(prices), 0) if prices else 0
            result.append({
                'id': doc.id,
                'slug': d.get('slug'),
                'name': d.get('name'),
                'description': d.get('description'),
                'icon': d.get('icon'),
                'color': d.get('color'),
                'stats': {
                    'totalItems': item_count,
                    'avgPrice': f'₹{int(avg_price)}/day',
                    'availability': 'High' if item_count > 20 else 'Medium' if item_count > 10 else 'Low',
                }
            })
        return jsonify(result)
    except Exception:
        logger.exception('get_categories error')
        return jsonify({'error': 'Could not load categories'}), 500


@app.route('/api/categories/<slug>', methods=['GET'])
def get_category(slug):
    if not re.match(r'^[a-z0-9_-]{1,50}$', slug):
        return jsonify({'error': 'Invalid category slug'}), 400
    try:
        docs = fdb.collection('categories').where(filter=FieldFilter('slug', '==', slug)).limit(1).get()
        if not docs:
            return jsonify({'error': 'Category not found'}), 404
        doc = docs[0]
        d   = doc.to_dict()

        min_price = request.args.get('min_price', type=float)
        max_price = request.args.get('max_price', type=float)
        condition = request.args.get('condition', '').strip()

        items_query = fdb.collection('items')\
            .where(filter=FieldFilter('category_slug', '==', slug))\
            .where(filter=FieldFilter('is_available', '==', True)).get()

        items = [item_to_dict(i.id, i.to_dict()) for i in items_query]
        if min_price is not None:
            items = [i for i in items if i.get('price_amount') and i['price_amount'] >= min_price]
        if max_price is not None:
            items = [i for i in items if i.get('price_amount') and i['price_amount'] <= max_price]
        if condition:
            items = [i for i in items if i.get('condition', '').lower() == condition.lower()]

        item_count = len(items)
        prices     = [i.get('price_amount', 0) for i in items if i.get('price_amount')]
        avg_price  = round(sum(prices) / len(prices), 0) if prices else 0

        return jsonify({
            'id': doc.id,
            'slug': d.get('slug'),
            'name': d.get('name'),
            'description': d.get('description'),
            'icon': d.get('icon'),
            'color': d.get('color'),
            'stats': {
                'totalItems': item_count,
                'avgPrice': f'₹{int(avg_price)}/day',
                'availability': 'High' if item_count > 20 else 'Medium' if item_count > 10 else 'Low',
            },
            'items': items,
        })
    except Exception:
        logger.exception('get_category error slug=%s', slug)
        return jsonify({'error': 'Could not load category'}), 500


# ── Items ─────────────────────────────────────────────────────────────────────
@app.route('/api/items', methods=['GET'])
def get_items():
    try:
        category        = request.args.get('category', '').strip()
        condition       = request.args.get('condition', '').strip()
        available_param = request.args.get('available', 'true').lower()
        filter_available = available_param == 'true'

        q = fdb.collection('items')
        if filter_available:
            q = q.where(filter=FieldFilter('is_available', '==', True))
        if category:
            q = q.where(filter=FieldFilter('category_slug', '==', category))
        if condition:
            q = q.where(filter=FieldFilter('condition', '==', condition))

        docs  = q.get()
        items = [item_to_dict(d.id, d.to_dict()) for d in docs]

        min_price = request.args.get('min_price', type=float)
        max_price = request.args.get('max_price', type=float)
        if min_price is not None:
            items = [i for i in items if i.get('price_amount') and i['price_amount'] >= min_price]
        if max_price is not None:
            items = [i for i in items if i.get('price_amount') and i['price_amount'] <= max_price]

        items.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return jsonify(items)
    except Exception:
        logger.exception('get_items error')
        return jsonify({'error': 'Could not load items'}), 500


@app.route('/api/items/<item_id>', methods=['GET'])
def get_item(item_id):
    if not item_id or len(item_id) > 100:
        return jsonify({'error': 'Invalid item ID'}), 400
    try:
        doc = fdb.collection('items').document(item_id).get()
        if not doc.exists:
            return jsonify({'error': 'Item not found'}), 404
        return jsonify(item_to_dict(doc.id, doc.to_dict()))
    except Exception:
        logger.exception('get_item error id=%s', item_id)
        return jsonify({'error': 'Could not load item'}), 500


@app.route('/api/items', methods=['POST'])
@login_required
def create_item():
    data = request.get_json(silent=True) or {}
    name         = _sanitize_str(data.get('name', ''), 200)
    category_slug = _sanitize_str(data.get('category_slug', ''), 50)
    price        = _sanitize_str(data.get('price', ''), 50)
    description  = _sanitize_str(data.get('description', ''), 1000)

    if not name:
        return jsonify({'error': 'Item name is required'}), 400
    if not category_slug:
        return jsonify({'error': 'category_slug is required'}), 400

    try:
        price_amount = float(data.get('price_amount', 0))
        if price_amount < 0:
            return jsonify({'error': 'price_amount cannot be negative'}), 400
    except (TypeError, ValueError):
        return jsonify({'error': 'price_amount must be a number'}), 400

    try:
        deposit_amount = float(data.get('deposit_amount', 0) or 0)
        if deposit_amount < 0:
            return jsonify({'error': 'deposit_amount cannot be negative'}), 400
    except (TypeError, ValueError):
        deposit_amount = 0.0

    # Validate image_url size (base64 images can be large)
    image_url = data.get('image_url', '')
    if isinstance(image_url, str) and len(image_url) > 4 * 1024 * 1024:
        return jsonify({'error': 'Image too large (max 4 MB)'}), 400

    try:
        user    = get_current_user()
        item_id = str(uuid.uuid4())
        item_data = {
            'name': name,
            'description': description,
            'price': price or f'₹{int(price_amount)}/day',
            'price_amount': price_amount,
            'price_unit': _sanitize_str(data.get('price_unit', 'day'), 20),
            'condition': _sanitize_str(data.get('condition', 'Good'), 50),
            'deposit': _sanitize_str(data.get('deposit', ''), 50),
            'deposit_amount': deposit_amount,
            'is_available': True,
            'campus_zone': _sanitize_str(data.get('campus_zone', user.get('campus_zone', '')), 100),
            'category_slug': category_slug,
            'image_url': image_url,
            'owner_id': user['id'],
            'owner': {
                'id': user['id'],
                'name': user.get('name'),
                'department': user.get('department'),
                'trust_score': user.get('trust_score', 5.0),
            },
            'created_at': datetime.utcnow().isoformat(),
        }
        fdb.collection('items').document(item_id).set(item_data)
        logger.info('Item created: %s by user %s', item_id, user['id'])
        return jsonify(item_to_dict(item_id, item_data)), 201
    except Exception:
        logger.exception('create_item error')
        return jsonify({'error': 'Could not create item'}), 500


@app.route('/api/items/<item_id>', methods=['PUT'])
@login_required
def update_item(item_id):
    if not item_id or len(item_id) > 100:
        return jsonify({'error': 'Invalid item ID'}), 400
    try:
        doc = fdb.collection('items').document(item_id).get()
        if not doc.exists:
            return jsonify({'error': 'Item not found'}), 404
        user = get_current_user()
        if doc.to_dict().get('owner_id') != user['id']:
            return jsonify({'error': 'Not your item'}), 403

        data    = request.get_json(silent=True) or {}
        allowed = ['name', 'description', 'price', 'price_amount', 'price_unit',
                   'condition', 'deposit', 'deposit_amount', 'is_available', 'campus_zone', 'image_url']
        update  = {}
        for k in allowed:
            if k not in data:
                continue
            if k in ('price_amount', 'deposit_amount'):
                try:
                    update[k] = float(data[k])
                except (TypeError, ValueError):
                    return jsonify({'error': f'{k} must be a number'}), 400
            elif k == 'is_available':
                update[k] = bool(data[k])
            elif k == 'image_url':
                v = data[k]
                if isinstance(v, str) and len(v) > 4 * 1024 * 1024:
                    return jsonify({'error': 'Image too large (max 4 MB)'}), 400
                update[k] = v
            else:
                update[k] = _sanitize_str(data[k], 1000)

        if not update:
            return jsonify({'error': 'No valid fields to update'}), 400

        fdb.collection('items').document(item_id).update(update)
        updated = fdb.collection('items').document(item_id).get()
        return jsonify(item_to_dict(updated.id, updated.to_dict()))
    except Exception:
        logger.exception('update_item error id=%s', item_id)
        return jsonify({'error': 'Could not update item'}), 500


@app.route('/api/items/<item_id>', methods=['DELETE'])
@login_required
def delete_item(item_id):
    if not item_id or len(item_id) > 100:
        return jsonify({'error': 'Invalid item ID'}), 400
    try:
        doc = fdb.collection('items').document(item_id).get()
        if not doc.exists:
            return jsonify({'error': 'Item not found'}), 404
        user = get_current_user()
        if doc.to_dict().get('owner_id') != user['id']:
            return jsonify({'error': 'Not your item'}), 403

        # Cancel any pending rentals for this item before deleting
        pending = fdb.collection('rentals')\
            .where(filter=FieldFilter('item_id', '==', item_id))\
            .where(filter=FieldFilter('status', '==', 'pending')).get()
        for r in pending:
            fdb.collection('rentals').document(r.id).update({'status': 'cancelled'})

        fdb.collection('items').document(item_id).delete()
        logger.info('Item deleted: %s by user %s', item_id, user['id'])
        return jsonify({'message': 'Item deleted'})
    except Exception:
        logger.exception('delete_item error id=%s', item_id)
        return jsonify({'error': 'Could not delete item'}), 500


# ── Search ────────────────────────────────────────────────────────────────────
@app.route('/api/search', methods=['GET'])
def search():
    query = _sanitize_str(request.args.get('q', ''), 200).lower()
    if not query or len(query) < 2:
        return jsonify([])
    try:
        docs    = fdb.collection('items').where(filter=FieldFilter('is_available', '==', True)).get()
        results = []
        for d in docs:
            data = d.to_dict()
            name = data.get('name', '').lower()
            desc = data.get('description', '').lower()
            cat  = data.get('category_slug', '').lower()
            if query in name or query in desc or query in cat:
                results.append(item_to_dict(d.id, data))
            if len(results) >= 20:
                break
        return jsonify(results)
    except Exception:
        logger.exception('search error q=%s', query)
        return jsonify({'error': 'Search failed'}), 500


# ── Rentals ───────────────────────────────────────────────────────────────────
VALID_RENTAL_TYPES = {'rent', 'borrow'}
VALID_STATUSES     = {'pending', 'active', 'returned', 'cancelled'}

@app.route('/api/rentals', methods=['POST'])
@login_required
@_rate_limit(20)
def create_rental():
    data    = request.get_json(silent=True) or {}
    item_id = _sanitize_str(data.get('item_id', ''), 100)
    if not item_id:
        return jsonify({'error': 'item_id is required'}), 400

    rental_type = data.get('rental_type', 'rent')
    if rental_type not in VALID_RENTAL_TYPES:
        return jsonify({'error': f'rental_type must be one of {list(VALID_RENTAL_TYPES)}'}), 400

    start_date = _sanitize_str(data.get('start_date', ''), 20)
    end_date   = _sanitize_str(data.get('end_date', ''), 20)
    if not start_date or not end_date:
        return jsonify({'error': 'start_date and end_date are required'}), 400
    if not _validate_date(start_date) or not _validate_date(end_date):
        return jsonify({'error': 'Dates must be in YYYY-MM-DD format'}), 400
    if end_date <= start_date:
        return jsonify({'error': 'end_date must be after start_date'}), 400

    try:
        total_price = float(data.get('total_price', 0) or 0)
        if total_price < 0:
            return jsonify({'error': 'total_price cannot be negative'}), 400
    except (TypeError, ValueError):
        return jsonify({'error': 'total_price must be a number'}), 400

    try:
        item_doc = fdb.collection('items').document(item_id).get()
        if not item_doc.exists:
            return jsonify({'error': 'Item not found'}), 404
        item_data = item_doc.to_dict()

        if not item_data.get('is_available'):
            return jsonify({'error': 'Item is not available for rental right now'}), 409

        user = get_current_user()
        if item_data.get('owner_id') == user['id']:
            return jsonify({'error': 'You cannot rent your own item'}), 400

        rental_id   = str(uuid.uuid4())
        item_deposit_amount = float(item_data.get('deposit_amount', 0) or 0)
        rental_data = {
            'item_id':        item_doc.id,
            'borrower_id':    user['id'],
            'lender_id':      item_data.get('owner_id'),
            'rental_type':    rental_type,
            'status':         'pending',
            'start_date':     start_date,
            'end_date':       end_date,
            'total_price':    total_price,
            'deposit_amount': item_deposit_amount,
            'deposit_status': 'held' if item_deposit_amount > 0 else 'none',
            'created_at':     datetime.utcnow().isoformat(),
            'item_snapshot':  item_to_dict(item_doc.id, item_data, include_owner=False),
        }

        # Write rental + mark item unavailable atomically
        item_ref   = fdb.collection('items').document(item_id)
        rental_ref = fdb.collection('rentals').document(rental_id)
        fdb.collection('rentals').document(rental_id).set(rental_data)
        item_ref.update({'is_available': False})

        logger.info('Rental created: %s item=%s user=%s', rental_id, item_id, user['id'])

        # ── In-app notification to owner ──────────────────────────────────────
        owner_id = item_data.get('owner_id', '')
        if owner_id:
            _create_notification(
                owner_id, 'rental_request',
                f'📦 {user.get("name","Someone")} sent a rental request for "{item_data.get("name","Item")}"!',
                rental_id
            )

        # ── Send email notifications to both parties ─────────────────────────
        try:
            borrower_email = user.get('email', '')
            borrower_name  = user.get('name', 'Borrower')
            owner_id       = item_data.get('owner_id', '')
            lender_doc     = fdb.collection('users').document(owner_id).get() if owner_id else None
            lender_data    = lender_doc.to_dict() if (lender_doc and lender_doc.exists) else {}
            lender_email   = lender_data.get('email', '')
            lender_name    = lender_data.get('name', 'Owner')

            logger.info('Email check — borrower_email=%s lender_email=%s owner_id=%s',
                        borrower_email, lender_email, owner_id)

            if borrower_email and lender_email:
                rental_data['id'] = rental_id  # Add ID for email template
                _send_rental_emails(
                    rental_data, item_data,
                    borrower_email, borrower_name,
                    lender_email, lender_name
                )
            else:
                logger.warning('Email skipped — missing email: borrower=%s lender=%s (owner_id=%s)',
                               borrower_email, lender_email, owner_id)
        except Exception:
            # Email failure should not block rental creation
            logger.exception('Email notification failed for rental %s', rental_id)

        return jsonify(rental_to_dict(rental_id, rental_data)), 201

    except ValueError as ve:
        return jsonify({'error': str(ve)}), 409
    except Exception:
        logger.exception('create_rental error item=%s', item_id)
        return jsonify({'error': 'Could not create rental. Please try again.'}), 500


@app.route('/api/rentals', methods=['GET'])
@login_required
def get_rentals():
    try:
        user  = get_current_user()
        role  = request.args.get('role', 'borrower')
        field = 'lender_id' if role == 'lender' else 'borrower_id'
        docs  = fdb.collection('rentals').where(filter=FieldFilter(field, '==', user['id'])).get()
        rentals = [rental_to_dict(d.id, d.to_dict()) for d in docs]
        # Sort newest first
        rentals.sort(key=lambda r: r.get('created_at', ''), reverse=True)
        return jsonify(rentals)
    except Exception:
        logger.exception('get_rentals error')
        return jsonify({'error': 'Could not load rentals'}), 500


@app.route('/api/rentals/<rental_id>/status', methods=['PUT'])
@login_required
def update_rental_status(rental_id):
    if not rental_id or len(rental_id) > 100:
        return jsonify({'error': 'Invalid rental ID'}), 400
    try:
        doc = fdb.collection('rentals').document(rental_id).get()
        if not doc.exists:
            return jsonify({'error': 'Rental not found'}), 404
        user  = get_current_user()
        rdata = doc.to_dict()
        if rdata.get('lender_id') != user['id'] and rdata.get('borrower_id') != user['id']:
            return jsonify({'error': 'Unauthorized'}), 403

        new_status = (request.get_json(silent=True) or {}).get('status', '')
        if new_status not in VALID_STATUSES:
            return jsonify({'error': f'Status must be one of {list(VALID_STATUSES)}'}), 400

        current_status = rdata.get('status', '')
        # Prevent invalid transitions
        allowed_transitions = {
            'pending':   {'active', 'cancelled'},
            'active':    {'returned', 'cancelled'},
            'returned':  set(),
            'cancelled': set(),
        }
        if new_status not in allowed_transitions.get(current_status, set()):
            return jsonify({'error': f'Cannot transition from "{current_status}" to "{new_status}"'}), 400

        fdb.collection('rentals').document(rental_id).update({'status': new_status})
        if new_status in ('returned', 'cancelled'):
            fdb.collection('items').document(rdata['item_id']).update({'is_available': True})

        # ── Update deposit status based on new rental status ─────────────────
        deposit_update = {}
        if new_status == 'returned':
            deposit_update['deposit_status'] = 'refunded'
        elif new_status == 'cancelled':
            # If cancelled before active, refund deposit; if active→cancelled treat as returned
            deposit_update['deposit_status'] = 'refunded'
        if deposit_update:
            fdb.collection('rentals').document(rental_id).update(deposit_update)

        updated = fdb.collection('rentals').document(rental_id).get()
        logger.info('Rental %s status → %s by user %s', rental_id, new_status, user['id'])

        # ── Send approval email to both parties when owner approves ──────────
        if new_status == 'active':
            try:
                _send_approval_emails(rental_id, rdata)
            except Exception:
                logger.exception('Approval email failed for rental %s', rental_id)

        # ── In-app notifications for status changes ───────────────────────────
        item_name = rdata.get('item_snapshot', {}).get('name', 'Item')
        notif_msgs = {
            'active':    (rdata.get('borrower_id',''), 'rental_approved',  f'🎉 Your rental for "{item_name}" has been approved!'),
            'cancelled': (rdata.get('borrower_id',''), 'rental_cancelled', f'❌ Your rental for "{item_name}" has been cancelled.'),
            'returned':  (rdata.get('lender_id',''),   'rental_returned',  f'✅ "{item_name}" has been marked as returned. Deposit will be processed.'),
        }
        if new_status in notif_msgs:
            uid, ntype, nmsg = notif_msgs[new_status]
            _create_notification(uid, ntype, nmsg, rental_id)
            if new_status == 'active':
                _create_notification(rdata.get('lender_id',''), 'rental_approved',
                    f'✅ You approved the rental for "{item_name}".', rental_id)

        return jsonify(rental_to_dict(updated.id, updated.to_dict()))
    except Exception:
        logger.exception('update_rental_status error id=%s', rental_id)
        return jsonify({'error': 'Could not update rental status'}), 500


@app.route('/api/rentals/<rental_id>/deposit', methods=['PUT'])
@login_required
def update_deposit_status(rental_id):
    """Owner can forfeit deposit (damage claim) or manually mark as refunded."""
    if not rental_id or len(rental_id) > 100:
        return jsonify({'error': 'Invalid rental ID'}), 400
    try:
        doc = fdb.collection('rentals').document(rental_id).get()
        if not doc.exists:
            return jsonify({'error': 'Rental not found'}), 404
        user  = get_current_user()
        rdata = doc.to_dict()

        # Only the lender (owner) can change deposit status
        if rdata.get('lender_id') != user['id']:
            return jsonify({'error': 'Only the item owner can update deposit status'}), 403

        data           = request.get_json(silent=True) or {}
        new_dep_status = data.get('deposit_status', '')
        VALID_DEP      = {'held', 'refunded', 'forfeited'}
        if new_dep_status not in VALID_DEP:
            return jsonify({'error': f'deposit_status must be one of {list(VALID_DEP)}'}), 400

        # Can only change deposit if rental is returned or active
        if rdata.get('status') not in ('returned', 'active'):
            return jsonify({'error': 'Deposit can only be updated for active or returned rentals'}), 400

        fdb.collection('rentals').document(rental_id).update({'deposit_status': new_dep_status})
        updated = fdb.collection('rentals').document(rental_id).get()
        logger.info('Deposit status → %s for rental %s by owner %s', new_dep_status, rental_id, user['id'])
        return jsonify(rental_to_dict(updated.id, updated.to_dict()))
    except Exception:
        logger.exception('update_deposit_status error id=%s', rental_id)
        return jsonify({'error': 'Could not update deposit status'}), 500


# ── Stats ─────────────────────────────────────────────────────────────────────
@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        total_items   = len(fdb.collection('items').get())
        total_users   = len(fdb.collection('users').get())
        rentals_docs  = fdb.collection('rentals').get()
        total_rentals = sum(1 for d in rentals_docs if d.to_dict().get('status') in ('active', 'returned'))
        return jsonify({
            'total_items':   total_items,
            'total_users':   total_users,
            'total_rentals': total_rentals,
            'savings':       total_rentals * 350,
            'satisfaction':  90,
        })
    except Exception:
        logger.exception('get_stats error')
        return jsonify({'error': 'Could not load stats'}), 500


# ── Users ─────────────────────────────────────────────────────────────────────
@app.route('/api/users/<user_id>', methods=['GET'])
def get_user(user_id):
    if not user_id or len(user_id) > 100:
        return jsonify({'error': 'Invalid user ID'}), 400
    try:
        doc = fdb.collection('users').document(user_id).get()
        if not doc.exists:
            return jsonify({'error': 'User not found'}), 404
        udata  = doc.to_dict()
        result = user_to_dict(doc.id, udata)
        items_docs = fdb.collection('items').where(filter=FieldFilter('owner_id', '==', user_id)).get()
        result['items'] = [item_to_dict(d.id, d.to_dict(), include_owner=False) for d in items_docs]
        return jsonify(result)
    except Exception:
        logger.exception('get_user error id=%s', user_id)
        return jsonify({'error': 'Could not load user'}), 500


@app.route('/api/users/me', methods=['PUT'])
@login_required
def update_profile():
    try:
        user    = get_current_user()
        data    = request.get_json(silent=True) or {}
        allowed = ['name', 'department', 'year', 'campus_zone']
        update  = {}
        for k in allowed:
            if k in data:
                update[k] = _sanitize_str(data[k], 200)
        if not update:
            return jsonify({'error': 'No valid fields to update'}), 400
        fdb.collection('users').document(user['id']).update(update)
        updated = fdb.collection('users').document(user['id']).get()
        return jsonify(user_to_dict(updated.id, updated.to_dict()))
    except Exception:
        logger.exception('update_profile error')
        return jsonify({'error': 'Could not update profile'}), 500


# ── Global error handlers ─────────────────────────────────────────────────────
@app.errorhandler(400)
def bad_request(e):
    return jsonify({'error': 'Bad request'}), 400

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({'error': 'Method not allowed'}), 405

@app.errorhandler(413)
def request_too_large(e):
    return jsonify({'error': 'Request body too large (max 5 MB)'}), 413

@app.errorhandler(500)
def internal_error(e):
    logger.exception('Unhandled 500 error')
    return jsonify({'error': 'Internal server error'}), 500


# ── Gemini Chatbot Proxy ──────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_URL = (
    'https://generativelanguage.googleapis.com/v1/models/'
    'gemini-2.5-flash:generateContent?key={key}'
)

CAMPUSMITRA_SYSTEM = (
    "You are CampusMitra Assistant, a helpful AI chatbot for the CampusMitra platform. "
    "CampusMitra is a student-to-student rental marketplace where college students can rent "
    "or borrow items like laptops, textbooks, tools, and formal wear within their campus. "
    "Key features: verified college email required, secure deposits, rated lenders, "
    "categories include Electronics, Textbooks & Study, Tools & Equipment, Clothing & Formal Wear. "
    "Students can list items on the Owner Dashboard and browse/rent on the Borrower Dashboard. "
    "Payments via UPI/card/net banking. "
    "Answer only questions related to CampusMitra. "
    "IMPORTANT: If the user's message ends with '[Please reply in English only]', "
    "you MUST reply entirely in English. "
    "If the message ends with '[Please reply in Hinglish — mix of Hindi and English]', "
    "you MUST reply in Hinglish (a natural mix of Hindi words written in Roman script and English). "
    "Always detect and follow the language instruction at the end of the message. "
    "Keep answers concise, friendly, and helpful. "
    "If asked something unrelated to CampusMitra, politely redirect to platform topics."
)

# ── Rule-based fallback responses (no API key needed) ────────────────────────
# Each tuple: (pattern, hinglish_reply, english_reply)
_FALLBACK_RULES = [
    # CampusMitra kya hai
    (r'kya hai|what is|campusmitra|platform|app|website|ke baare|about',
     "🎓 CampusMitra ek student-to-student rental marketplace hai!\n\n"
     "College students yahan apni cheezein rent ya borrow kar sakte hain — "
     "jaise laptops, textbooks, tools, aur formal wear.\n\n"
     "💡 Idea simple hai: ek student ki padhi hui book doosre student ke kaam aaye, "
     "aur dono ka faida ho!",
     "🎓 CampusMitra is a student-to-student rental marketplace!\n\n"
     "College students can rent or borrow items here — like laptops, textbooks, tools, and formal wear.\n\n"
     "💡 The idea is simple: one student's unused book helps another student, and both benefit!"),

    # Rent / borrow kaise karein
    (r'rent|borrow|kaise|how to|kiraaye|lena|book|reserve',
     "📦 Item rent/borrow karne ke steps:\n\n"
     "1️⃣ Borrower Dashboard pe jao\n"
     "2️⃣ Category ya search se item dhundo\n"
     "3️⃣ Item card pe 'Borrow' ya 'Rent' button click karo\n"
     "4️⃣ Start & end date select karo\n"
     "5️⃣ Payment confirm karo\n\n"
     "✅ Owner approve karega toh rental active ho jaayega!",
     "📦 Steps to rent or borrow an item:\n\n"
     "1️⃣ Go to the Borrower Dashboard\n"
     "2️⃣ Find an item by category or search\n"
     "3️⃣ Click 'Borrow' or 'Rent' on the item card\n"
     "4️⃣ Select start & end dates\n"
     "5️⃣ Confirm payment\n\n"
     "✅ Once the owner approves, your rental becomes active!"),

    # Item list / add kaise karein
    (r'list|add item|apni cheez|sell|lend|owner|dena|upload|post',
     "🏪 Apni cheez list karne ke steps:\n\n"
     "1️⃣ Owner Dashboard pe jao\n"
     "2️⃣ 'Add New Item' button click karo\n"
     "3️⃣ Item ka naam, category, price, condition bharo\n"
     "4️⃣ Photo upload karo (optional)\n"
     "5️⃣ Submit karo — item live ho jaayega!\n\n"
     "💰 Tum khud price set karte ho — per day ya per week.",
     "🏪 Steps to list your item:\n\n"
     "1️⃣ Go to the Owner Dashboard\n"
     "2️⃣ Click 'Add New Item'\n"
     "3️⃣ Fill in name, category, price, and condition\n"
     "4️⃣ Upload a photo (optional)\n"
     "5️⃣ Submit — your item goes live!\n\n"
     "💰 You set your own price — per day or per week."),

    # Categories
    (r'categor|type|kism|electronics|textbook|tool|clothing|formal',
     "📂 CampusMitra ki 4 main categories hain:\n\n"
     "💻 Electronics — laptops, calculators, cameras\n"
     "📚 Textbooks & Study — books, notes, study material\n"
     "🔧 Tools & Equipment — lab tools, sports gear\n"
     "👔 Clothing & Formal Wear — suits, sarees, formal dress\n\n"
     "Har category mein filter bhi hai — price, condition, availability!",
     "📂 CampusMitra has 4 main categories:\n\n"
     "💻 Electronics — laptops, calculators, cameras\n"
     "📚 Textbooks & Study — books, notes, study material\n"
     "🔧 Tools & Equipment — lab tools, sports gear\n"
     "👔 Clothing & Formal Wear — suits, sarees, formal dress\n\n"
     "Each category has filters — price, condition, availability!"),

    # Payment
    (r'payment|pay|paisa|price|cost|kitna|charge|fee|upi|card',
     "💳 Payment ke baare mein:\n\n"
     "• Owner khud price set karta hai (per day/week)\n"
     "• Payment methods: UPI, Debit/Credit Card, Net Banking\n"
     "• Security deposit bhi ho sakta hai (item return pe wapas milta hai)\n"
     "• Total cost = daily price × number of days + deposit\n\n"
     "🔒 Sab transactions secure hain!",
     "💳 About payments:\n\n"
     "• The owner sets the price (per day/week)\n"
     "• Payment methods: UPI, Debit/Credit Card, Net Banking\n"
     "• A security deposit may apply (refunded on item return)\n"
     "• Total cost = daily price × number of days + deposit\n\n"
     "🔒 All transactions are secure!"),

    # Safety / trust
    (r'safe|trust|secure|verified|scam|fake|genuine|bharosa',
     "🛡️ CampusMitra safety features:\n\n"
     "✅ College email verification required\n"
     "⭐ Trust Score system — har user ka rating hota hai\n"
     "📸 Item photos aur condition clearly mentioned\n"
     "🔒 Secure deposit system\n"
     "📋 Rental agreement with start/end dates\n\n"
     "Sirf verified college students hi platform use kar sakte hain!",
     "🛡️ CampusMitra safety features:\n\n"
     "✅ College email verification required\n"
     "⭐ Trust Score system — every user has a rating\n"
     "📸 Item photos and condition clearly listed\n"
     "🔒 Secure deposit system\n"
     "📋 Rental agreement with start/end dates\n\n"
     "Only verified college students can use the platform!"),

    # Signup / login / account
    (r'signup|sign up|register|login|account|email|password|google',
     "👤 Account banana bahut aasaan hai:\n\n"
     "📧 Email/Password se signup karo, ya\n"
     "🔵 Google account se directly login karo\n\n"
     "• College email (.edu) se verify hone pe extra trust badge milta hai\n"
     "• Ek baar login karo, 7 din tak session active rehta hai\n\n"
     "Homepage pe 'Sign Up' button click karo!",
     "👤 Creating an account is easy:\n\n"
     "📧 Sign up with Email/Password, or\n"
     "🔵 Log in directly with your Google account\n\n"
     "• Verifying with a college email (.edu) gives you an extra trust badge\n"
     "• Log in once, stay active for 7 days\n\n"
     "Click 'Sign Up' on the homepage!"),

    # Dashboard
    (r'dashboard|manage|request|accept|reject|status|rental',
     "📊 Dashboard guide:\n\n"
     "🏪 Owner Dashboard:\n"
     "  • Apne listed items manage karo\n"
     "  • Rental requests accept/reject karo\n"
     "  • Item availability toggle karo\n\n"
     "🎒 Borrower Dashboard:\n"
     "  • Saare available items browse karo\n"
     "  • Active aur past rentals track karo\n"
     "  • Pending requests cancel karo",
     "📊 Dashboard guide:\n\n"
     "🏪 Owner Dashboard:\n"
     "  • Manage your listed items\n"
     "  • Accept or reject rental requests\n"
     "  • Toggle item availability\n\n"
     "🎒 Borrower Dashboard:\n"
     "  • Browse all available items\n"
     "  • Track active and past rentals\n"
     "  • Cancel pending requests"),

    # Contact / help / support
    (r'help|support|contact|problem|issue|error|koi dikkat',
     "🆘 Help chahiye?\n\n"
     "• Platform related koi bhi sawaal yahan poochho\n"
     "• Item dhundne mein problem? Search bar use karo\n"
     "• Login issue? 'Forgot Password' try karo\n"
     "• Rental dispute? Owner se directly contact karo\n\n"
     "Main hamesha yahan hoon madad ke liye! 😊",
     "🆘 Need help?\n\n"
     "• Ask any platform-related question right here\n"
     "• Trouble finding an item? Use the search bar\n"
     "• Login issue? Try 'Forgot Password'\n"
     "• Rental dispute? Contact the owner directly\n\n"
     "I'm always here to help! 😊"),

    # Greeting
    (r'^(hi|hello|hey|namaste|hii|helo|namaskar|hy|hlo)\b',
     "👋 Namaste! Main CampusMitra Assistant hoon.\n\n"
     "Aap mujhse poochh sakte ho:\n"
     "• CampusMitra kya hai?\n"
     "• Item kaise rent karein?\n"
     "• Apni cheez kaise list karein?\n"
     "• Payment kaise hoti hai?\n"
     "• Platform safe hai ya nahi?\n\n"
     "Batao, kya jaanna chahte ho? 😊",
     "👋 Hello! I'm the CampusMitra Assistant.\n\n"
     "You can ask me about:\n"
     "• What is CampusMitra?\n"
     "• How to rent an item?\n"
     "• How to list your item?\n"
     "• How does payment work?\n"
     "• Is the platform safe?\n\n"
     "What would you like to know? 😊"),

    # Thanks
    (r'thank|shukriya|dhanyawad|thanks|tysm|ty\b',
     "😊 Khushi hui madad karke!\n\nAur kuch poochna ho toh bata dena. CampusMitra pe happy renting! 🎓",
     "😊 Happy to help!\n\nFeel free to ask anything else. Happy renting on CampusMitra! 🎓"),
]

def _search_items_for_chat(query: str, english: bool = False) -> str:
    """Search Firestore items by name/description and return a formatted reply."""
    try:
        docs = fdb.collection('items').where(filter=FieldFilter('is_available', '==', True)).get()
        q = query.lower()
        results = []
        for d in docs:
            data = d.to_dict()
            name = data.get('name', '').lower()
            desc = data.get('description', '').lower()
            cat  = data.get('category_slug', '').lower()
            if q in name or q in desc or q in cat:
                results.append({
                    'name': data.get('name', ''),
                    'price': data.get('price', ''),
                    'price_amount': data.get('price_amount', 0),
                    'price_unit': data.get('price_unit', 'day'),
                    'condition': data.get('condition', 'Good'),
                    'campus_zone': data.get('campus_zone', ''),
                    'owner': data.get('owner', {}).get('name', 'Unknown'),
                    'id': d.id,
                })
            if len(results) >= 5:
                break

        if not results:
            if english:
                return (
                    f"😕 No items found for '{query}' right now.\n\n"
                    "• Try a different search term\n"
                    "• Browse the Borrower Dashboard\n"
                    "• Or list your own item on the Owner Dashboard!"
                )
            return (
                f"😕 '{query}' se koi item nahi mila abhi.\n\n"
                "• Koi aur naam try karo\n"
                "• Ya Borrower Dashboard pe jaake browse karo\n"
                "• Ya apna item list karo Owner Dashboard pe!"
            )

        if english:
            lines = [f"🔍 Found {len(results)} item(s) for '{query}':\n"]
        else:
            lines = [f"🔍 '{query}' ke liye {len(results)} item(s) mile:\n"]

        for i, item in enumerate(results, 1):
            price_str = f"₹{int(item['price_amount'])}/{item['price_unit']}" if item['price_amount'] else item['price']
            zone = f" • 📍 {item['campus_zone']}" if item['campus_zone'] else ""
            lines.append(
                f"{i}️⃣ *{item['name']}*\n"
                f"   💰 {price_str} • 🏷️ {item['condition']}{zone}\n"
                f"   👤 {item['owner']}"
            )

        if english:
            lines.append("\n➡️ Go to the Borrower Dashboard to rent or borrow!")
        else:
            lines.append("\n➡️ Borrower Dashboard pe jaake rent/borrow karo!")

        return "\n".join(lines)
    except Exception:
        logger.exception('_search_items_for_chat error')
        if english:
            return "😕 Search ran into an issue. Please try again in a moment!"
        return "😕 Search mein kuch problem aayi. Thodi der baad try karo!"


# Search trigger keywords — agar message mein ye words hain toh product search karo
_SEARCH_TRIGGERS = re.compile(
    r'\b(dhundo|dhundna|chahiye|chahie|available|milega|milegi|hai kya|search|find|'
    r'looking for|need|kahan|kaha|show|dikhao|list karo|results|'
    r'laptop|book|calculator|camera|suit|saree|tool|cycle|guitar|'
    r'projector|tripod|drill|blazer|formal|notes|novel|fiction)\b',
    re.IGNORECASE
)

def _fallback_reply(message: str) -> str:
    """Return a rule-based reply, or a default message if no rule matches."""
    # Detect language hint appended by frontend
    is_english = '[Please reply in English only]' in message
    msg = message.lower().strip()
    # Strip the language hint before matching
    msg = re.sub(r'\[please reply in (english only|hinglish.*?)\]', '', msg).strip()

    # ── Product search: trigger keywords ya short unknown query ──────────────
    if _SEARCH_TRIGGERS.search(msg):
        search_q = re.sub(
            r'\b(kya|hai|koi|mujhe|mujhko|chahiye|chahie|available|milega|milegi|'
            r'hai kya|search|find|dhundo|dhundna|looking for|need|kahan|kaha|'
            r'show|dikhao|list karo|results|please|plz|bhai|yaar|ek)\b',
            '', msg, flags=re.IGNORECASE
        ).strip()
        search_q = re.sub(r'\s+', ' ', search_q).strip()
        if len(search_q) >= 2:
            return _search_items_for_chat(search_q, english=is_english)

    for pattern, reply_hi, reply_en in _FALLBACK_RULES:
        if re.search(pattern, msg):
            return reply_en if is_english else reply_hi

    # ── Last resort: try treating the whole message as a product search ───────
    if len(msg) >= 3 and not re.search(
        r'\b(kya|what|how|kaise|kyun|why|when|kab|where|kahan|'
        r'safe|trust|payment|signup|login|dashboard|category|platform)\b', msg
    ):
        result = _search_items_for_chat(msg, english=is_english)
        if "mila" not in result or "mile" in result:
            return result

    if is_english:
        return (
            "🤔 Hmm, that's a bit outside my scope!\n\n"
            "I can help you with:\n"
            "• Searching for items (e.g. 'laptop', 'suit')\n"
            "• How to rent or borrow items\n"
            "• How to list your item\n"
            "• Categories, pricing, and safety\n"
            "• Account and dashboard help\n\n"
            "What would you like to know? 😊"
        )
    return (
        "🤔 Hmm, ye sawaal thoda alag hai!\n\n"
        "Main CampusMitra ke baare mein help kar sakta hoon:\n"
        "• Koi item dhundna ho toh naam likho (e.g. 'laptop', 'suit')\n"
        "• Item rent/borrow karna\n"
        "• Apni cheez list karna\n"
        "• Categories, pricing, safety\n"
        "• Account aur dashboard\n\n"
        "Batao, kya chahiye? 😊"
    )


@app.route('/api/chat', methods=['POST'])
@_rate_limit(30)
def chat():
    body = request.get_json(silent=True) or {}
    message = _sanitize_str(body.get('message', ''), 1000)
    if not message:
        return jsonify({'error': 'message is required'}), 400

    # ── Always check for product search intent first (works with/without API) ─
    msg_lower = message.lower().strip()
    is_english = '[please reply in english only]' in msg_lower
    # Strip language hint before processing
    clean_msg = re.sub(r'\[please reply in (english only|hinglish.*?)\]', '', msg_lower).strip()

    if _SEARCH_TRIGGERS.search(clean_msg):
        search_q = re.sub(
            r'\b(kya|hai|koi|mujhe|mujhko|chahiye|chahie|available|milega|milegi|'
            r'hai kya|search|find|dhundo|dhundna|looking for|need|kahan|kaha|'
            r'show|dikhao|list karo|results|please|plz|bhai|yaar|ek)\b',
            '', clean_msg, flags=re.IGNORECASE
        ).strip()
        search_q = re.sub(r'\s+', ' ', search_q).strip()
        if len(search_q) >= 2:
            return jsonify({'reply': _search_items_for_chat(search_q, english=is_english)})

    # ── If no API key, use rule-based fallback directly ───────────────────────
    if not GEMINI_API_KEY or GEMINI_API_KEY == 'your_gemini_api_key_here':
        return jsonify({'reply': _fallback_reply(message)})

    # ── Try Gemini, fall back to rules on any error ───────────────────────────
    history = body.get('history', [])
    if not isinstance(history, list):
        history = []
    history = history[-10:]

    contents = []
    contents.append({'role': 'user', 'parts': [{'text': CAMPUSMITRA_SYSTEM}]})
    contents.append({'role': 'model', 'parts': [{'text': 'Understood! I am CampusMitra Assistant. How can I help you?'}]})

    for turn in history:
        role = turn.get('role', '')
        text = _sanitize_str(turn.get('text', ''), 500)
        if role in ('user', 'model') and text:
            contents.append({'role': role, 'parts': [{'text': text}]})

    contents.append({'role': 'user', 'parts': [{'text': message}]})

    payload = _json.dumps({
        'contents': contents,
        'generationConfig': {
            'temperature': 0.7,
            'maxOutputTokens': 512,
        }
    }).encode('utf-8')

    try:
        req = urllib.request.Request(
            GEMINI_URL.format(key=GEMINI_API_KEY),
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = _json.loads(resp.read().decode('utf-8'))

        reply = (
            result.get('candidates', [{}])[0]
            .get('content', {})
            .get('parts', [{}])[0]
            .get('text', '')
            .strip()
        )
        if not reply:
            return jsonify({'reply': _fallback_reply(message)})

        return jsonify({'reply': reply})

    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='ignore')
        logger.warning('Gemini HTTPError %s: %s — using fallback', e.code, err_body)
        # Always fall back to rules instead of showing error to user
        return jsonify({'reply': _fallback_reply(message)})
    except Exception:
        logger.exception('chat endpoint error — using fallback')
        return jsonify({'reply': _fallback_reply(message)})


# ══════════════════════════════════════════════════════════════════════════════
# ── ADMIN API ─────────────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

def _admin_required(fn):
    """Decorator: allow only the configured ADMIN_EMAIL."""
    @wraps(fn)
    @login_required
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user or user.get('email', '').lower() != ADMIN_EMAIL.lower():
            return jsonify({'error': 'Admin access required'}), 403
        return fn(*args, **kwargs)
    return wrapper


@app.route('/api/admin/stats', methods=['GET'])
@_admin_required
def admin_stats():
    """Overall platform stats for admin dashboard."""
    try:
        users_docs   = fdb.collection('users').get()
        items_docs   = fdb.collection('items').get()
        rentals_docs = fdb.collection('rentals').get()

        users_list   = [d.to_dict() for d in users_docs]
        items_list   = [d.to_dict() for d in items_docs]
        rentals_list = [d.to_dict() for d in rentals_docs]

        total_revenue = sum(
            r.get('total_price', 0) or 0
            for r in rentals_list
            if r.get('status') in ('active', 'returned')
        )

        return jsonify({
            'total_users':    len(users_list),
            'total_items':    len(items_list),
            'total_rentals':  len(rentals_list),
            'pending_rentals': sum(1 for r in rentals_list if r.get('status') == 'pending'),
            'active_rentals':  sum(1 for r in rentals_list if r.get('status') == 'active'),
            'total_revenue':   total_revenue,
            'pending_approvals': sum(1 for u in users_list if not u.get('is_approved', True)),
        })
    except Exception:
        logger.exception('admin_stats error')
        return jsonify({'error': 'Could not load stats'}), 500


@app.route('/api/admin/users', methods=['GET'])
@_admin_required
def admin_get_users():
    """List all users with their item counts and rental counts."""
    try:
        users_docs   = fdb.collection('users').get()
        items_docs   = fdb.collection('items').get()
        rentals_docs = fdb.collection('rentals').get()

        # Build lookup maps
        items_by_owner   = defaultdict(int)
        for d in items_docs:
            items_by_owner[d.to_dict().get('owner_id', '')] += 1

        rentals_as_borrower = defaultdict(int)
        rentals_as_lender   = defaultdict(int)
        for d in rentals_docs:
            rd = d.to_dict()
            rentals_as_borrower[rd.get('borrower_id', '')] += 1
            rentals_as_lender[rd.get('lender_id', '')] += 1

        result = []
        for doc in users_docs:
            uid  = doc.id
            data = doc.to_dict()
            result.append({
                'id':           uid,
                'name':         data.get('name', ''),
                'email':        data.get('email', ''),
                'department':   data.get('department', ''),
                'year':         data.get('year', ''),
                'campus_zone':  data.get('campus_zone', ''),
                'trust_score':  data.get('trust_score', 5.0),
                'is_verified':  data.get('is_verified', False),
                'is_approved':  data.get('is_approved', True),
                'created_at':   data.get('created_at', ''),
                'items_listed': items_by_owner[uid],
                'rentals_as_borrower': rentals_as_borrower[uid],
                'rentals_as_lender':   rentals_as_lender[uid],
            })

        result.sort(key=lambda u: u.get('created_at', ''), reverse=True)
        return jsonify(result)
    except Exception:
        logger.exception('admin_get_users error')
        return jsonify({'error': 'Could not load users'}), 500


@app.route('/api/admin/users/<user_id>/approve', methods=['PUT'])
@_admin_required
def admin_approve_user(user_id):
    """Approve or suspend a user account."""
    if not user_id or len(user_id) > 100:
        return jsonify({'error': 'Invalid user ID'}), 400
    try:
        doc = fdb.collection('users').document(user_id).get()
        if not doc.exists:
            return jsonify({'error': 'User not found'}), 404

        data       = request.get_json(silent=True) or {}
        is_approved = bool(data.get('is_approved', True))
        fdb.collection('users').document(user_id).update({'is_approved': is_approved})

        udata = doc.to_dict()
        action = 'approved' if is_approved else 'suspended'
        logger.info('Admin %s user %s (%s)', action, user_id, udata.get('email'))

        # Notify user by email
        if _MAIL_ENABLED and udata.get('email'):
            try:
                status_color = '#10b981' if is_approved else '#dc2626'
                status_text  = 'Approved ✅' if is_approved else 'Suspended ❌'
                msg_body = f"""
                <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
                  <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:28px;text-align:center">
                    <h1 style="color:#fff;margin:0;font-size:1.4rem">🎓 CampusMitra</h1>
                    <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:0.9rem">Account Status Update</p>
                  </div>
                  <div style="padding:28px">
                    <p style="color:#374151">Hi <strong>{udata.get('name','User')}</strong>,</p>
                    <p style="color:#374151;margin:12px 0">Tumhara CampusMitra account status update hua hai:</p>
                    <div style="text-align:center;margin:20px 0">
                      <span style="background:{status_color};color:#fff;padding:8px 24px;border-radius:20px;font-weight:700;font-size:1rem">{status_text}</span>
                    </div>
                    {'<p style="color:#374151">Ab tum platform pe freely items rent/borrow kar sakte ho!</p>' if is_approved else '<p style="color:#374151">Agar ye galti se hua hai toh admin se contact karo.</p>'}
                  </div>
                  <div style="background:#f8fafc;padding:16px;text-align:center;color:#94a3b8;font-size:0.8rem">
                    CampusMitra — Student Rental Marketplace
                  </div>
                </div>"""
                mail.send(Message(
                    subject=f"[CampusMitra] Account {status_text} — Action Required",
                    recipients=[udata['email']],
                    html=msg_body,
                ))
            except Exception:
                logger.exception('admin_approve_user email failed')

        return jsonify({'id': user_id, 'is_approved': is_approved, 'action': action})
    except Exception:
        logger.exception('admin_approve_user error id=%s', user_id)
        return jsonify({'error': 'Could not update user'}), 500


@app.route('/api/admin/rentals', methods=['GET'])
@_admin_required
def admin_get_rentals():
    """List all rentals across the platform with user details."""
    try:
        rentals_docs = fdb.collection('rentals').get()
        users_cache  = {}

        def _get_user(uid):
            if not uid:
                return {}
            if uid not in users_cache:
                doc = fdb.collection('users').document(uid).get()
                users_cache[uid] = doc.to_dict() if doc.exists else {}
            return users_cache[uid]

        result = []
        for doc in rentals_docs:
            rd  = doc.to_dict()
            bid = rd.get('borrower_id', '')
            lid = rd.get('lender_id', '')
            borrower = _get_user(bid)
            lender   = _get_user(lid)
            item_snap = rd.get('item_snapshot', {})

            result.append({
                'id':          doc.id,
                'status':      rd.get('status', 'pending'),
                'rental_type': rd.get('rental_type', 'rent'),
                'start_date':  rd.get('start_date', ''),
                'end_date':    rd.get('end_date', ''),
                'total_price': rd.get('total_price', 0),
                'created_at':  rd.get('created_at', ''),
                'item_name':   item_snap.get('name', rd.get('item_id', '')),
                'borrower': {
                    'id':    bid,
                    'name':  borrower.get('name', '—'),
                    'email': borrower.get('email', '—'),
                },
                'lender': {
                    'id':    lid,
                    'name':  lender.get('name', '—'),
                    'email': lender.get('email', '—'),
                },
            })

        result.sort(key=lambda r: r.get('created_at', ''), reverse=True)
        return jsonify(result)
    except Exception:
        logger.exception('admin_get_rentals error')
        return jsonify({'error': 'Could not load rentals'}), 500


@app.route('/api/admin/items', methods=['GET'])
@_admin_required
def admin_get_items():
    """List all items on the platform."""
    try:
        docs = fdb.collection('items').get()
        result = []
        for doc in docs:
            d = doc.to_dict()
            result.append({
                'id':           doc.id,
                'name':         d.get('name', ''),
                'category_slug':d.get('category_slug', ''),
                'price':        d.get('price', ''),
                'price_amount': d.get('price_amount', 0),
                'condition':    d.get('condition', 'Good'),
                'is_available': d.get('is_available', True),
                'created_at':   d.get('created_at', ''),
                'owner': {
                    'id':   d.get('owner_id', ''),
                    'name': d.get('owner', {}).get('name', '—'),
                },
            })
        result.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return jsonify(result)
    except Exception:
        logger.exception('admin_get_items error')
        return jsonify({'error': 'Could not load items'}), 500


# ── Health check (used by Render / uptime monitors) ───────────────────────────
@app.route('/api/health', methods=['GET'])
def health():
    payload = {'status': 'ok', 'firebase': 'connected' if fdb is not None else 'not_configured'}
    if firebase_error:
        payload['firebase_error'] = firebase_error
    return jsonify(payload), 200


# ══════════════════════════════════════════════════════════════════════════════
# ── FEATURE: IN-APP MESSAGING ─────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/messages/conversations', methods=['GET'])
@login_required
def get_conversations():
    """Get all conversations for the current user."""
    try:
        user = get_current_user()
        uid  = user['id']
        docs = fdb.collection('conversations') \
            .where(filter=FieldFilter('participants', 'array_contains', uid)).get()
        result = []
        for doc in docs:
            d = doc.to_dict()
            other_id = next((p for p in d.get('participants', []) if p != uid), None)
            other_doc = fdb.collection('users').document(other_id).get() if other_id else None
            other = other_doc.to_dict() if (other_doc and other_doc.exists) else {}
            result.append({
                'id': doc.id,
                'other_user': {'id': other_id, 'name': other.get('name', '—')},
                'last_message': d.get('last_message', ''),
                'last_at': d.get('last_at', ''),
                'unread_count': d.get(f'unread_{uid}', 0),
                'rental_id': d.get('rental_id', ''),
                'item_name': d.get('item_name', ''),
            })
        result.sort(key=lambda x: x.get('last_at', ''), reverse=True)
        return jsonify(result)
    except Exception:
        logger.exception('get_conversations error')
        return jsonify({'error': 'Could not load conversations'}), 500


@app.route('/api/messages/conversations/<conv_id>', methods=['GET'])
@login_required
def get_messages(conv_id):
    """Get messages in a conversation."""
    if not conv_id or len(conv_id) > 100:
        return jsonify({'error': 'Invalid conversation ID'}), 400
    try:
        user = get_current_user()
        conv_doc = fdb.collection('conversations').document(conv_id).get()
        if not conv_doc.exists:
            return jsonify({'error': 'Conversation not found'}), 404
        conv_data = conv_doc.to_dict()
        if user['id'] not in conv_data.get('participants', []):
            return jsonify({'error': 'Unauthorized'}), 403
        msgs = fdb.collection('conversations').document(conv_id) \
            .collection('messages').order_by('created_at').limit(100).get()
        # Mark as read
        fdb.collection('conversations').document(conv_id).update({f'unread_{user["id"]}': 0})
        return jsonify([{
            'id': m.id,
            'sender_id': m.to_dict().get('sender_id'),
            'text': m.to_dict().get('text', ''),
            'created_at': m.to_dict().get('created_at', ''),
        } for m in msgs])
    except Exception:
        logger.exception('get_messages error conv=%s', conv_id)
        return jsonify({'error': 'Could not load messages'}), 500


@app.route('/api/messages/send', methods=['POST'])
@login_required
@_rate_limit(60)
def send_message():
    """Send a message. Creates conversation if needed."""
    data = request.get_json(silent=True) or {}
    to_user_id = _sanitize_str(data.get('to_user_id', ''), 100)
    text       = _sanitize_str(data.get('text', ''), 1000)
    rental_id  = _sanitize_str(data.get('rental_id', ''), 100)
    item_name  = _sanitize_str(data.get('item_name', ''), 200)
    if not to_user_id or not text:
        return jsonify({'error': 'to_user_id and text are required'}), 400
    try:
        user = get_current_user()
        uid  = user['id']
        if uid == to_user_id:
            return jsonify({'error': 'Cannot message yourself'}), 400
        # Find or create conversation
        participants = sorted([uid, to_user_id])
        existing = fdb.collection('conversations') \
            .where(filter=FieldFilter('participants', '==', participants)).limit(1).get()
        if existing:
            conv_id = existing[0].id
        else:
            conv_ref = fdb.collection('conversations').document()
            conv_id  = conv_ref.id
            conv_ref.set({
                'participants': participants,
                'rental_id': rental_id,
                'item_name': item_name,
                'last_message': '',
                'last_at': '',
                f'unread_{uid}': 0,
                f'unread_{to_user_id}': 0,
                'created_at': datetime.utcnow().isoformat(),
            })
        now = datetime.utcnow().isoformat()
        msg_ref = fdb.collection('conversations').document(conv_id).collection('messages').document()
        msg_ref.set({'sender_id': uid, 'text': text, 'created_at': now})
        conv_ref = fdb.collection('conversations').document(conv_id)
        conv_snap = conv_ref.get().to_dict() or {}
        conv_ref.update({
            'last_message': text[:80],
            'last_at': now,
            f'unread_{to_user_id}': (conv_snap.get(f'unread_{to_user_id}', 0) or 0) + 1,
        })
        # Create notification for recipient
        _create_notification(to_user_id, 'message', f'{user.get("name","Someone")} sent you a message: "{text[:50]}"', conv_id)
        return jsonify({'conv_id': conv_id, 'msg_id': msg_ref.id}), 201
    except Exception:
        logger.exception('send_message error')
        return jsonify({'error': 'Could not send message'}), 500


# ══════════════════════════════════════════════════════════════════════════════
# ── FEATURE: REVIEWS & RATINGS ────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/reviews', methods=['POST'])
@login_required
@_rate_limit(10)
def create_review():
    """Submit a review after a completed rental."""
    data      = request.get_json(silent=True) or {}
    rental_id = _sanitize_str(data.get('rental_id', ''), 100)
    rating    = data.get('rating')
    comment   = _sanitize_str(data.get('comment', ''), 500)
    review_for = _sanitize_str(data.get('review_for', ''), 100)  # user_id being reviewed
    if not rental_id or not rating or not review_for:
        return jsonify({'error': 'rental_id, rating, and review_for are required'}), 400
    try:
        rating = float(rating)
        if not (1 <= rating <= 5):
            return jsonify({'error': 'Rating must be between 1 and 5'}), 400
    except (TypeError, ValueError):
        return jsonify({'error': 'Rating must be a number'}), 400
    try:
        user = get_current_user()
        rental_doc = fdb.collection('rentals').document(rental_id).get()
        if not rental_doc.exists:
            return jsonify({'error': 'Rental not found'}), 404
        rdata = rental_doc.to_dict()
        if rdata.get('status') != 'returned':
            return jsonify({'error': 'Can only review completed (returned) rentals'}), 400
        if user['id'] not in (rdata.get('borrower_id'), rdata.get('lender_id')):
            return jsonify({'error': 'Not part of this rental'}), 403
        # Prevent duplicate review
        existing = fdb.collection('reviews') \
            .where(filter=FieldFilter('rental_id', '==', rental_id)) \
            .where(filter=FieldFilter('reviewer_id', '==', user['id'])).limit(1).get()
        if existing:
            return jsonify({'error': 'You have already reviewed this rental'}), 409
        review_id = str(uuid.uuid4())
        review_data = {
            'rental_id':   rental_id,
            'reviewer_id': user['id'],
            'reviewer_name': user.get('name', ''),
            'review_for':  review_for,
            'rating':      rating,
            'comment':     comment,
            'created_at':  datetime.utcnow().isoformat(),
        }
        fdb.collection('reviews').document(review_id).set(review_data)
        # Recalculate trust score for reviewed user
        all_reviews = fdb.collection('reviews') \
            .where(filter=FieldFilter('review_for', '==', review_for)).get()
        scores = [r.to_dict().get('rating', 5.0) for r in all_reviews]
        new_score = round(sum(scores) / len(scores), 1) if scores else 5.0
        fdb.collection('users').document(review_for).update({'trust_score': new_score})
        _create_notification(review_for, 'review', f'{user.get("name","Someone")} gave you a {rating}⭐ rating!', review_id)
        return jsonify({'id': review_id, 'new_trust_score': new_score}), 201
    except Exception:
        logger.exception('create_review error')
        return jsonify({'error': 'Could not submit review'}), 500


@app.route('/api/reviews/<user_id>', methods=['GET'])
def get_user_reviews(user_id):
    """Get all reviews for a user."""
    if not user_id or len(user_id) > 100:
        return jsonify({'error': 'Invalid user ID'}), 400
    try:
        docs = fdb.collection('reviews') \
            .where(filter=FieldFilter('review_for', '==', user_id)).get()
        reviews = []
        for doc in docs:
            d = doc.to_dict()
            reviews.append({
                'id': doc.id,
                'reviewer_name': d.get('reviewer_name', '—'),
                'rating': d.get('rating', 5),
                'comment': d.get('comment', ''),
                'created_at': d.get('created_at', ''),
            })
        reviews.sort(key=lambda r: r.get('created_at', ''), reverse=True)
        avg = round(sum(r['rating'] for r in reviews) / len(reviews), 1) if reviews else 5.0
        return jsonify({'reviews': reviews, 'average': avg, 'count': len(reviews)})
    except Exception:
        logger.exception('get_user_reviews error uid=%s', user_id)
        return jsonify({'error': 'Could not load reviews'}), 500


# ══════════════════════════════════════════════════════════════════════════════
# ── FEATURE: IN-APP NOTIFICATIONS ─────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

def _create_notification(user_id: str, notif_type: str, message: str, ref_id: str = ''):
    """Helper to create a notification document."""
    try:
        fdb.collection('notifications').document().set({
            'user_id':    user_id,
            'type':       notif_type,
            'message':    message,
            'ref_id':     ref_id,
            'is_read':    False,
            'created_at': datetime.utcnow().isoformat(),
        })
    except Exception:
        logger.exception('_create_notification error uid=%s', user_id)


@app.route('/api/notifications', methods=['GET'])
@login_required
def get_notifications():
    """Get notifications for current user."""
    try:
        user = get_current_user()
        docs = fdb.collection('notifications') \
            .where(filter=FieldFilter('user_id', '==', user['id'])) \
            .order_by('created_at', direction='DESCENDING').limit(30).get()
        notifs = [{
            'id': d.id,
            'type': d.to_dict().get('type', ''),
            'message': d.to_dict().get('message', ''),
            'ref_id': d.to_dict().get('ref_id', ''),
            'is_read': d.to_dict().get('is_read', False),
            'created_at': d.to_dict().get('created_at', ''),
        } for d in docs]
        unread = sum(1 for n in notifs if not n['is_read'])
        return jsonify({'notifications': notifs, 'unread': unread})
    except Exception:
        logger.exception('get_notifications error')
        return jsonify({'error': 'Could not load notifications'}), 500


@app.route('/api/notifications/read', methods=['PUT'])
@login_required
def mark_notifications_read():
    """Mark all notifications as read."""
    try:
        user = get_current_user()
        docs = fdb.collection('notifications') \
            .where(filter=FieldFilter('user_id', '==', user['id'])) \
            .where(filter=FieldFilter('is_read', '==', False)).get()
        for doc in docs:
            fdb.collection('notifications').document(doc.id).update({'is_read': True})
        return jsonify({'marked': len(docs)})
    except Exception:
        logger.exception('mark_notifications_read error')
        return jsonify({'error': 'Could not mark notifications'}), 500


# Hook notifications into existing rental status changes
# (Notifications are also triggered from create_rental and update_rental_status)
# We patch them by adding calls inside those routes via a post-save hook pattern.
# The _create_notification helper is called from send_message and create_review already.
# For rental events, we add them here as a separate endpoint called internally.

@app.route('/api/notifications/rental-event', methods=['POST'])
@login_required
def notify_rental_event():
    """Internal: create notifications for rental status changes."""
    data      = request.get_json(silent=True) or {}
    rental_id = _sanitize_str(data.get('rental_id', ''), 100)
    status    = _sanitize_str(data.get('status', ''), 20)
    if not rental_id or not status:
        return jsonify({'error': 'rental_id and status required'}), 400
    try:
        doc = fdb.collection('rentals').document(rental_id).get()
        if not doc.exists:
            return jsonify({'error': 'Rental not found'}), 404
        rdata     = doc.to_dict()
        item_name = rdata.get('item_snapshot', {}).get('name', 'Item')
        msgs = {
            'active':    ('rental_approved', f'🎉 Your rental for "{item_name}" has been approved!'),
            'cancelled': ('rental_cancelled', f'❌ Your rental for "{item_name}" has been cancelled.'),
            'returned':  ('rental_returned',  f'✅ "{item_name}" has been marked as returned. Deposit will be processed.'),
        }
        if status in msgs:
            notif_type, msg = msgs[status]
            _create_notification(rdata.get('borrower_id', ''), notif_type, msg, rental_id)
            if status == 'active':
                _create_notification(rdata.get('lender_id', ''), 'rental_approved',
                    f'✅ You approved the rental for "{item_name}".', rental_id)
        return jsonify({'ok': True})
    except Exception:
        logger.exception('notify_rental_event error')
        return jsonify({'error': 'Could not create notification'}), 500


# ══════════════════════════════════════════════════════════════════════════════
# ── FEATURE: USER PROFILE PAGE ────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/profile/me', methods=['GET'])
@login_required
def get_my_profile():
    """Redirect to full profile for current user."""
    try:
        user = get_current_user()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        return get_full_profile(user['id'])
    except Exception:
        logger.exception('get_my_profile error')
        return jsonify({'error': 'Could not load profile'}), 500


@app.route('/api/profile/<user_id>', methods=['GET'])
def get_full_profile(user_id):
    """Full profile: user info + items + rental history + reviews."""
    if not user_id or len(user_id) > 100:
        return jsonify({'error': 'Invalid user ID'}), 400
    try:
        doc = fdb.collection('users').document(user_id).get()
        if not doc.exists:
            return jsonify({'error': 'User not found'}), 404
        udata = doc.to_dict()
        # Items listed
        items_docs = fdb.collection('items') \
            .where(filter=FieldFilter('owner_id', '==', user_id)).get()
        items = [item_to_dict(d.id, d.to_dict(), include_owner=False) for d in items_docs]
        # Rentals as borrower
        borrow_docs = fdb.collection('rentals') \
            .where(filter=FieldFilter('borrower_id', '==', user_id)).get()
        borrows = [rental_to_dict(d.id, d.to_dict()) for d in borrow_docs]
        # Rentals as lender
        lend_docs = fdb.collection('rentals') \
            .where(filter=FieldFilter('lender_id', '==', user_id)).get()
        lends = [rental_to_dict(d.id, d.to_dict()) for d in lend_docs]
        # Reviews received
        rev_docs = fdb.collection('reviews') \
            .where(filter=FieldFilter('review_for', '==', user_id)).get()
        reviews = [{
            'id': d.id,
            'reviewer_name': d.to_dict().get('reviewer_name', '—'),
            'rating': d.to_dict().get('rating', 5),
            'comment': d.to_dict().get('comment', ''),
            'created_at': d.to_dict().get('created_at', ''),
        } for d in rev_docs]
        avg_rating = round(sum(r['rating'] for r in reviews) / len(reviews), 1) if reviews else 5.0
        # Trust score breakdown
        completed = sum(1 for r in borrows + lends if r.get('status') == 'returned')
        cancelled = sum(1 for r in borrows + lends if r.get('status') == 'cancelled')
        return jsonify({
            **user_to_dict(doc.id, udata),
            'bio': udata.get('bio', ''),
            'items': items,
            'borrows': borrows,
            'lends': lends,
            'reviews': reviews,
            'avg_rating': avg_rating,
            'review_count': len(reviews),
            'completed_rentals': completed,
            'cancelled_rentals': cancelled,
            'total_items_listed': len(items),
        })
    except Exception:
        logger.exception('get_full_profile error uid=%s', user_id)
        return jsonify({'error': 'Could not load profile'}), 500


@app.route('/api/profile/me', methods=['PUT'])
@login_required
def update_my_profile():
    """Update current user's profile."""
    try:
        user    = get_current_user()
        data    = request.get_json(silent=True) or {}
        allowed = ['name', 'department', 'year', 'campus_zone', 'bio']
        update  = {}
        for k in allowed:
            if k in data:
                update[k] = _sanitize_str(data[k], 300)
        if not update:
            return jsonify({'error': 'No valid fields to update'}), 400
        fdb.collection('users').document(user['id']).update(update)
        updated = fdb.collection('users').document(user['id']).get()
        return jsonify(user_to_dict(updated.id, updated.to_dict()))
    except Exception:
        logger.exception('update_my_profile error')
        return jsonify({'error': 'Could not update profile'}), 500


# ══════════════════════════════════════════════════════════════════════════════
# ── FEATURE: REFERRAL SYSTEM ──────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/referral/code', methods=['GET'])
@login_required
def get_referral_code():
    """Get or generate referral code for current user."""
    try:
        user = get_current_user()
        uid  = user['id']
        doc  = fdb.collection('users').document(uid).get()
        udata = doc.to_dict()
        code = udata.get('referral_code')
        if not code:
            code = uid[:6].upper() + str(uuid.uuid4())[:4].upper()
            fdb.collection('users').document(uid).update({'referral_code': code})
        # Count successful referrals
        refs = fdb.collection('referrals') \
            .where(filter=FieldFilter('referrer_id', '==', uid)).get()
        return jsonify({
            'code': code,
            'referral_count': len(refs),
            'credits_earned': len(refs) * 50,
            'share_url': f"{os.environ.get('FRONTEND_URL', '')}/signup?ref={code}",
        })
    except Exception:
        logger.exception('get_referral_code error')
        return jsonify({'error': 'Could not get referral code'}), 500


@app.route('/api/referral/apply', methods=['POST'])
@login_required
@_rate_limit(5)
def apply_referral():
    """Apply a referral code during/after signup."""
    data = request.get_json(silent=True) or {}
    code = _sanitize_str(data.get('code', ''), 20).upper()
    if not code:
        return jsonify({'error': 'Referral code is required'}), 400
    try:
        user = get_current_user()
        uid  = user['id']
        # Check if already used a referral
        udata = fdb.collection('users').document(uid).get().to_dict()
        if udata.get('referral_used'):
            return jsonify({'error': 'You have already used a referral code'}), 409
        # Find referrer
        refs = fdb.collection('users') \
            .where(filter=FieldFilter('referral_code', '==', code)).limit(1).get()
        if not refs:
            return jsonify({'error': 'Invalid referral code'}), 404
        referrer_doc = refs[0]
        if referrer_doc.id == uid:
            return jsonify({'error': 'Cannot use your own referral code'}), 400
        # Record referral
        fdb.collection('referrals').document().set({
            'referrer_id': referrer_doc.id,
            'referred_id': uid,
            'code': code,
            'created_at': datetime.utcnow().isoformat(),
        })
        # Mark user as having used referral + give credit
        fdb.collection('users').document(uid).update({
            'referral_used': True,
            'credits': (udata.get('credits', 0) or 0) + 50,
        })
        # Give referrer credit too
        rdata = referrer_doc.to_dict()
        fdb.collection('users').document(referrer_doc.id).update({
            'credits': (rdata.get('credits', 0) or 0) + 50,
        })
        _create_notification(referrer_doc.id, 'referral',
            f'🎉 {user.get("name","Someone")} used your referral code! ₹50 credit added to your account.', uid)
        return jsonify({'message': 'Referral applied! ₹50 credit added to both accounts.', 'credits': 50})
    except Exception:
        logger.exception('apply_referral error')
        return jsonify({'error': 'Could not apply referral'}), 500


# ══════════════════════════════════════════════════════════════════════════════
# ── FEATURE: CAMPUS ZONE FILTER ───────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/zones', methods=['GET'])
def get_zones():
    """Get all distinct campus zones that have items listed."""
    try:
        docs  = fdb.collection('items').where(filter=FieldFilter('is_available', '==', True)).get()
        zones = {}
        for doc in docs:
            z = doc.to_dict().get('campus_zone', '').strip()
            if z:
                zones[z] = zones.get(z, 0) + 1
        result = [{'zone': z, 'item_count': c} for z, c in zones.items()]
        result.sort(key=lambda x: x['item_count'], reverse=True)
        return jsonify(result)
    except Exception:
        logger.exception('get_zones error')
        return jsonify({'error': 'Could not load zones'}), 500


@app.route('/api/items/by-zone/<zone>', methods=['GET'])
def get_items_by_zone(zone):
    """Get available items in a specific campus zone."""
    zone = _sanitize_str(zone, 100)
    if not zone:
        return jsonify({'error': 'Zone is required'}), 400
    try:
        docs = fdb.collection('items') \
            .where(filter=FieldFilter('campus_zone', '==', zone)) \
            .where(filter=FieldFilter('is_available', '==', True)).get()
        items = [item_to_dict(d.id, d.to_dict()) for d in docs]
        items.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return jsonify(items)
    except Exception:
        logger.exception('get_items_by_zone error zone=%s', zone)
        return jsonify({'error': 'Could not load items for zone'}), 500



# ══════════════════════════════════════════════════════════════════════════════
# ── FEATURE: RETURN DATE REMINDERS ───────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/rentals/check-reminders', methods=['POST'])
@login_required
def check_return_reminders():
    """
    Called by the frontend on login / dashboard load.
    Checks active rentals for the current user where end_date is today or tomorrow
    and sends an in-app notification if not already sent today.
    """
    try:
        user = get_current_user()
        uid  = user['id']
        today    = datetime.utcnow().date()
        tomorrow = today + timedelta(days=1)

        # Get all active rentals where user is borrower
        docs = fdb.collection('rentals') \
            .where(filter=FieldFilter('borrower_id', '==', uid)) \
            .where(filter=FieldFilter('status', '==', 'active')).get()

        reminders_sent = 0
        for doc in docs:
            rdata     = doc.to_dict()
            end_str   = rdata.get('end_date', '')
            item_name = rdata.get('item_snapshot', {}).get('name', 'Item')
            rental_id = doc.id

            try:
                end_date = datetime.strptime(end_str, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                continue

            # Check if reminder already sent today for this rental
            reminder_key = f'reminder_{rental_id}_{today.isoformat()}'
            existing = fdb.collection('notifications') \
                .where(filter=FieldFilter('user_id', '==', uid)) \
                .where(filter=FieldFilter('ref_id', '==', reminder_key)) \
                .limit(1).get()
            if existing:
                continue  # already notified today

            if end_date == today:
                msg = f'⚠️ Return due TODAY: "{item_name}" must be returned by end of day!'
                _create_notification(uid, 'rental_returned', msg, reminder_key)
                reminders_sent += 1
            elif end_date == tomorrow:
                msg = f'📅 Return reminder: "{item_name}" is due tomorrow ({end_str}). Please plan accordingly.'
                _create_notification(uid, 'rental_returned', msg, reminder_key)
                reminders_sent += 1

        return jsonify({'reminders_sent': reminders_sent})
    except Exception:
        logger.exception('check_return_reminders error')
        return jsonify({'error': 'Could not check reminders'}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV', 'production') != 'production'
    app.run(debug=debug, host='0.0.0.0', port=port)
