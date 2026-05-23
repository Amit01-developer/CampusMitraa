import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { API } from '../utils/api';

const iconMap = { electronics: 'fa-laptop', textbooks: 'fa-book', tools: 'fa-tools', clothing: 'fa-tshirt' };
const gradMap = {
  electronics: 'linear-gradient(135deg,#4f46e5,#6366f1)',
  textbooks: 'linear-gradient(135deg,#0d9488,#14b8a6)',
  tools: 'linear-gradient(135deg,#f59e0b,#d97706)',
  clothing: 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
};

export default function Payment() {
  const { currentUser, authToken, authHeaders } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Parse URL params
  const itemId      = (searchParams.get('item_id') || '').trim();
  const itemName    = (searchParams.get('name') || 'Item').trim();
  const itemPrice   = (searchParams.get('price') || '—').trim();
  const priceAmt    = Math.max(0, parseFloat(searchParams.get('price_amount')) || 0);
  const priceUnit   = (searchParams.get('price_unit') || 'day').trim();
  const condition   = (searchParams.get('condition') || 'Good').trim();
  const deposit     = (searchParams.get('deposit') || '—').trim();
  const depositAmt  = Math.max(0, parseFloat(searchParams.get('deposit_amount')) || 0);
  const ownerName   = (searchParams.get('owner') || '—').trim();
  const catSlug     = (searchParams.get('category') || 'electronics').trim();
  const rentalType  = (searchParams.get('rental_type') || 'rent').trim();
  const description = (searchParams.get('description') || '').trim();
  const isBorrow    = rentalType === 'borrow';

  const today = new Date().toISOString().split('T')[0];

  // Form state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [renterName, setRenterName] = useState('');
  const [renterEmail, setRenterEmail] = useState('');
  const [payMethod, setPayMethod] = useState('upi');
  const [upiId, setUpiId] = useState('');
  const [cardNum, setCardNum] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [bankSelect, setBankSelect] = useState('');
  const [declared, setDeclared] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(null);

  // Pre-fill user info
  useEffect(() => {
    if (!authToken) return;
    fetch(`${API}/auth/me`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((u) => {
        if (!u) return;
        if (u.name) setRenterName(u.name);
        if (u.email) setRenterEmail(u.email);
      })
      .catch(() => {});
  }, [authToken]);

  // Computed total
  function calcTotal() {
    if (!startDate || !endDate || endDate <= startDate) return null;
    const days = Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000));
    const total = isBorrow ? depositAmt : priceAmt * days + depositAmt;
    return { days, total };
  }

  const calc = calcTotal();

  function formatCard(val) {
    return val.replace(/\D/g, '').substring(0, 16).replace(/(.{4})/g, '$1 ').trim();
  }

  function formatExpiry(val) {
    let v = val.replace(/\D/g, '');
    if (v.length >= 2) v = v.substring(0, 2) + '/' + v.substring(2, 4);
    return v;
  }

  function validatePayment() {
    if (isBorrow) return true;
    if (payMethod === 'upi') {
      if (!upiId) { showToast('Please enter your UPI ID', 'error'); return false; }
      if (!/^[a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+$/.test(upiId)) { showToast('Invalid UPI ID format', 'error'); return false; }
    }
    if (payMethod === 'card') {
      if (!cardNum || cardNum.replace(/\s/g, '').length < 13) { showToast('Enter a valid card number', 'error'); return false; }
      if (!cardExp || !/^\d{2}\/\d{2}$/.test(cardExp)) { showToast('Enter expiry as MM/YY', 'error'); return false; }
      if (!cardCvv || cardCvv.length < 3) { showToast('Enter a valid CVV', 'error'); return false; }
    }
    if (payMethod === 'netbanking' && !bankSelect) { showToast('Please select a bank', 'error'); return false; }
    return true;
  }

  async function processPayment() {
    if (!authToken) { showToast('Please log in first', 'error'); navigate('/'); return; }
    if (!declared) { showToast('Please accept the Rental Agreement first', 'error'); return; }
    if (!itemId) { showToast('No item selected. Please browse real items.', 'error'); return; }
    if (!startDate || !endDate) { showToast('Please select rental dates', 'error'); return; }
    if (endDate <= startDate) { showToast('End date must be after start date', 'error'); return; }
    if (startDate < today) { showToast('Start date cannot be in the past', 'error'); return; }
    if (!renterName.trim()) { showToast('Please enter your name', 'error'); return; }
    if (!renterEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(renterEmail)) { showToast('Please enter a valid email', 'error'); return; }
    if (!validatePayment()) return;

    const days = Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000));
    const totalPrice = isBorrow ? 0 : priceAmt * days + depositAmt;

    setProcessing(true);
    try {
      const res = await fetch(`${API}/rentals`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ item_id: itemId, rental_type: rentalType, start_date: startDate, end_date: endDate, total_price: totalPrice }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { showToast(data.error || 'Request failed', 'error'); return; }
      setSuccess({
        bookingId: 'CM-' + String(data.id).substring(0, 8).toUpperCase(),
        isBorrow,
      });
    } catch (e) {
      showToast(!navigator.onLine ? 'You appear to be offline.' : 'Network error: ' + (e.message || 'Please try again.'), 'error');
    } finally { setProcessing(false); }
  }

  // ── Success overlay ───────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="success-overlay" style={{ display: 'flex' }}>
        <div className="success-box">
          <div className="success-icon"><i className="fas fa-check"></i></div>
          <h2>{success.isBorrow ? 'Borrow Request Sent!' : 'Rental Confirmed!'}</h2>
          <p>
            {success.isBorrow
              ? 'Your borrow request has been sent to the owner. They will review and approve it shortly.'
              : "Your rental request has been sent to the owner. You'll be notified once approved."}
          </p>
          <div className="booking-id">Booking ID: <span>{success.bookingId}</span></div>
          <button className="back-home-btn" onClick={() => navigate('/borrower')}>
            <i className="fas fa-receipt"></i> View My Rentals
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header>
        <div className="container">
          <div className="header-content">
            <a className="logo" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }} style={{ textDecoration: 'none' }}>
              <i className="fas fa-handshake"></i><span>CampusMitra</span>
            </a>
            <nav><ul>
              <li><a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>Home</a></li>
              <li><a href="/borrower" onClick={(e) => { e.preventDefault(); navigate('/borrower'); }}>Browse</a></li>
            </ul></nav>
            <div className="auth-buttons">
              <button className="btn btn-outline" onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fas fa-arrow-left"></i> Back to Browse
              </button>
            </div>
            {/* Mobile back button */}
            <button
              className="btn btn-outline pay-mobile-back"
              onClick={() => navigate(-1)}
              style={{ display: 'none' }}
            >
              <i className="fas fa-arrow-left"></i>
            </button>
          </div>
        </div>
      </header>

      <div className="pay-wrap">
        {/* LEFT: Summary */}
        <div>
          <div className="steps-bar">
            <div className="step-dot done"><div className="dot"><i className="fas fa-check"></i></div> Browse</div>
            <div className="step-line done"></div>
            <div className="step-dot done"><div className="dot"><i className="fas fa-check"></i></div> Select</div>
            <div className="step-line done"></div>
            <div className="step-dot active"><div className="dot">3</div> Payment</div>
            <div className="step-line"></div>
            <div className="step-dot"><div className="dot">4</div> Confirm</div>
          </div>

          <div className="pay-card">
            <div className="pay-title"><i className="fas fa-receipt" style={{ color: 'var(--primary)' }}></i> Rental Summary</div>
            <div className="item-banner" style={{ background: gradMap[catSlug] || gradMap.electronics }}>
              <i className={`fas ${iconMap[catSlug] || 'fa-box'}`}></i>
              <div>
                <h2>{itemName}</h2>
                <p>Owner: {ownerName}</p>
                <span style={{
                  display: 'inline-block', marginTop: 6, padding: '3px 12px', borderRadius: 20,
                  fontSize: '0.78rem', fontWeight: 700,
                  background: isBorrow ? 'rgba(13,148,136,0.18)' : 'rgba(79,70,229,0.18)',
                  color: isBorrow ? '#0d9488' : '#4f46e5',
                }}>
                  {isBorrow ? '🤝 Borrow Request' : '🛒 Rent Now'}
                </span>
              </div>
            </div>

            {[
              { label: 'Price', icon: 'fa-tag', val: itemPrice },
              { label: 'Condition', icon: 'fa-layer-group', val: condition },
              { label: 'Start Date', icon: 'fa-calendar-alt', val: startDate ? new Date(startDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
              { label: 'End Date', icon: 'fa-calendar-check', val: endDate ? new Date(endDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
              { label: 'Duration', icon: 'fa-clock', val: calc ? `${calc.days} day${calc.days !== 1 ? 's' : ''}` : '—' },
            ].map(({ label, icon, val }) => (
              <div key={label} className="detail-row">
                <span className="detail-label"><i className={`fas ${icon}`}></i> {label}</span>
                <span className="detail-value">{val}</span>
              </div>
            ))}

            {/* Security Deposit breakdown */}
            {depositAmt > 0 && (
              <div style={{ margin: '12px 0 4px', padding: '12px 14px', borderRadius: 10, background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1.5px solid #fcd34d' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <i className="fas fa-shield-alt" style={{ color: '#d97706' }}></i>
                  <span style={{ fontWeight: 700, color: '#92400e', fontSize: '0.9rem' }}>Security Deposit</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#92400e' }}>₹{depositAmt.toLocaleString('en-IN')}</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#78350f', fontSize: '0.78rem', lineHeight: 1.8 }}>
                  <li>Deposit will be refunded within <strong>7 working days</strong> after item return</li>
                  <li>Deposit may be <strong>forfeited</strong> in case of damage</li>
                  <li>Deposit is <strong>separate from rental amount</strong> — fully refundable</li>
                </ul>
              </div>
            )}

            {/* Price breakdown */}
            {calc && !isBorrow && (
              <div style={{ margin: '10px 0 4px', padding: '10px 14px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.83rem', color: 'var(--gray)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>Rental ({calc.days}d × ₹{priceAmt.toLocaleString('en-IN')})</span>
                  <span>₹{(priceAmt * calc.days).toLocaleString('en-IN')}</span>
                </div>
                {depositAmt > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Security Deposit (refundable)</span>
                    <span style={{ color: '#d97706' }}>₹{depositAmt.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>
            )}

            <div className="total-row">
              <span className="total-label">Total Payable</span>
              <span className="total-amount">
                {calc
                  ? isBorrow
                    ? depositAmt > 0 ? `₹${depositAmt.toLocaleString('en-IN')} (deposit)` : 'Free'
                    : `₹${calc.total.toLocaleString('en-IN')}`
                  : depositAmt > 0 ? `₹${depositAmt.toLocaleString('en-IN')} (deposit only)` : '—'
                }
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT: Payment Form */}
        <div>
          <div className="pay-card">
            <div className="pay-title"><i className="fas fa-lock" style={{ color: 'var(--secondary)' }}></i> Rental Details &amp; Payment</div>

            {/* Dates */}
            <div className="date-row" style={{ marginBottom: 18 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Start Date</label>
                <input type="date" className="form-control" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>End Date</label>
                <input type="date" className="form-control" min={today} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            {/* Renter Info */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Your Name</label>
              <input type="text" className="form-control" placeholder="Full name" value={renterName} onChange={(e) => setRenterName(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label>Campus Email</label>
              <input type="email" className="form-control" placeholder="you@campus.edu" value={renterEmail} onChange={(e) => setRenterEmail(e.target.value)} />
            </div>

            {/* Payment Method */}
            {!isBorrow ? (
              <div>
                <div className="pay-title" style={{ fontSize: '1rem', marginBottom: 12 }}>
                  <i className="fas fa-credit-card" style={{ color: 'var(--accent)' }}></i> Payment Method
                </div>
                <div className="pay-methods">
                  {[
                    { val: 'upi', icon: '📱', label: 'UPI', sub: 'GPay, PhonePe, Paytm, BHIM' },
                    { val: 'card', icon: '💳', label: 'Debit / Credit Card', sub: 'Visa, Mastercard, RuPay' },
                    { val: 'netbanking', icon: '🏦', label: 'Net Banking', sub: 'All major banks supported' },
                    { val: 'cod', icon: '🤝', label: 'Pay on Handover', sub: 'Cash / UPI at pickup' },
                  ].map((m) => (
                    <label key={m.val} className={`pay-method${payMethod === m.val ? ' selected' : ''}`}
                      onClick={() => setPayMethod(m.val)}>
                      <input type="radio" name="payMethod" value={m.val} checked={payMethod === m.val} onChange={() => setPayMethod(m.val)} />
                      <span className="pay-method-icon">{m.icon}</span>
                      <div>
                        <div className="pay-method-label">{m.label}</div>
                        <div className="pay-method-sub">{m.sub}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {payMethod === 'upi' && (
                  <div className="form-group" style={{ marginBottom: 14 }}>
                    <label>UPI ID</label>
                    <input type="text" className="form-control" placeholder="yourname@upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
                  </div>
                )}
                {payMethod === 'card' && (
                  <div style={{ marginBottom: 14 }}>
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label>Card Number</label>
                      <input type="text" className="form-control" placeholder="1234 5678 9012 3456" maxLength={19}
                        value={cardNum} onChange={(e) => setCardNum(formatCard(e.target.value))} />
                    </div>
                    <div className="card-row">
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Expiry</label>
                        <input type="text" className="form-control" placeholder="MM/YY" maxLength={5}
                          value={cardExp} onChange={(e) => setCardExp(formatExpiry(e.target.value))} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>CVV</label>
                        <input type="password" className="form-control" placeholder="•••" maxLength={3}
                          value={cardCvv} onChange={(e) => setCardCvv(e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}
                {payMethod === 'netbanking' && (
                  <div className="form-group" style={{ marginBottom: 14 }}>
                    <label>Select Bank</label>
                    <select className="form-control" value={bankSelect} onChange={(e) => setBankSelect(e.target.value)}>
                      <option value="">-- Choose your bank --</option>
                      {['SBI', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra', 'PNB', 'Bank of Baroda'].map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <div className="borrow-note" style={{ marginBottom: 14 }}>
                <i className="fas fa-info-circle"></i>
                <strong>Free Borrow Request</strong> — No payment needed. The owner will review and approve your request.
              </div>
            )}

            {/* Declaration */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#ecfdf5)', border: '1.5px solid #10b981', borderRadius: 10, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <i className="fas fa-file-contract" style={{ color: '#10b981', fontSize: '1.1rem' }}></i>
                  <strong style={{ color: '#065f46', fontSize: '0.95rem' }}>Rental Agreement &amp; Declaration</strong>
                </div>
                <div style={{ background: '#fff', borderRadius: 8, padding: 14, marginBottom: 14, maxHeight: 160, overflowY: 'auto', border: '1px solid #d1fae5' }}>
                  <p style={{ color: '#374151', fontSize: '0.82rem', margin: '0 0 8px', fontWeight: 600 }}>Both parties will be bound by the following rules:</p>
                  <ol style={{ color: '#4b5563', fontSize: '0.8rem', margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
                    <li>The borrower must return the item by the <strong>agreed end date</strong>.</li>
                    <li>The item must be returned in the <strong>same condition</strong> as received.</li>
                    <li>The borrower is <strong>fully responsible for any damage</strong>.</li>
                    <li>Security deposit refunded within <strong>7 working days</strong> after return.</li>
                    <li>To extend, contact the owner <strong>before the end date</strong>.</li>
                    <li>Item <strong>cannot be transferred</strong> to any third party.</li>
                    <li>Late returns may incur a <strong>daily penalty</strong>.</li>
                    <li>Disputes resolved through <strong>CampusMitra platform</strong>.</li>
                    <li>Maintain <strong>respectful and professional conduct</strong>.</li>
                    <li>This affects your <strong>CampusMitra Trust Score</strong>.</li>
                  </ol>
                </div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)}
                    style={{ width: 18, height: 18, minWidth: 18, marginTop: 2, accentColor: '#10b981', cursor: 'pointer' }} />
                  <span style={{ color: '#374151', fontSize: '0.85rem', lineHeight: 1.5 }}>
                    I have <strong>read and understood all the rules</strong> and <strong>agree to be bound by them</strong>.
                  </span>
                </label>
              </div>
            </div>

            <button className="pay-btn" onClick={processPayment} disabled={!declared || processing}
              style={{ opacity: !declared || processing ? 0.5 : 1, cursor: !declared || processing ? 'not-allowed' : 'pointer' }}>
              {processing
                ? <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                : isBorrow
                  ? <><i className="fas fa-handshake"></i> Confirm Borrow Request</>
                  : <><i className="fas fa-lock"></i> Pay &amp; Confirm Rental</>
              }
            </button>
            <div className="secure-note">
              <i className="fas fa-shield-alt" style={{ color: '#10b981' }}></i>
              256-bit SSL encrypted &nbsp;|&nbsp; 100% Secure
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
