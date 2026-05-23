from db import firestore_db as fdb
from datetime import datetime
import uuid

# ── Categories ────────────────────────────────────────────────────────────────
categories = [
    {'slug': 'electronics', 'name': 'Electronics',         'description': 'Laptops, calculators, cameras and more', 'icon': 'fa-laptop',  'color': '#6366f1'},
    {'slug': 'textbooks',   'name': 'Textbooks & Study',   'description': 'Academic books and study material',       'icon': 'fa-book',    'color': '#0ea5e9'},
    {'slug': 'tools',       'name': 'Tools & Equipment',   'description': 'Lab equipment, tools and instruments',    'icon': 'fa-tools',   'color': '#f59e0b'},
    {'slug': 'clothing',    'name': 'Clothing & Formal Wear','description': 'Formal wear, lab coats, sports gear',   'icon': 'fa-tshirt',  'color': '#10b981'},
]

for cat in categories:
    fdb.collection('categories').document(cat['slug']).set(cat)
    print(f"✔ Category: {cat['name']}")

# ── Dummy owner ───────────────────────────────────────────────────────────────
OWNER = {
    'id':         'seed-owner-001',
    'name':       'CampusMitra Admin',
    'department': 'Administration',
    'trust_score': 5.0,
}

# ── Items ─────────────────────────────────────────────────────────────────────
items = [

    # ── Electronics (6 items) ─────────────────────────────────────────────────
    {
        'name': 'MacBook Pro 2022 (M2)',
        'category_slug': 'electronics',
        'price': '₹350/day', 'price_amount': 350, 'price_unit': 'day',
        'condition': 'Excellent',
        'deposit': '₹5,000', 'deposit_amount': 5000,
        'description': 'M2 chip, 16GB RAM, 512GB SSD. Perfect for coding & video editing.',
    },
    {
        'name': 'HP Pavilion Laptop',
        'category_slug': 'electronics',
        'price': '₹200/day', 'price_amount': 200, 'price_unit': 'day',
        'condition': 'Good',
        'deposit': '₹3,000', 'deposit_amount': 3000,
        'description': 'Intel i5, 8GB RAM, 256GB SSD. Good for assignments and browsing.',
    },
    {
        'name': 'Canon DSLR Camera (1500D)',
        'category_slug': 'electronics',
        'price': '₹400/day', 'price_amount': 400, 'price_unit': 'day',
        'condition': 'Excellent',
        'deposit': '₹4,000', 'deposit_amount': 4000,
        'description': '24MP, kit lens included. Ideal for photography projects and events.',
    },
    {
        'name': 'Casio Scientific Calculator (fx-991)',
        'category_slug': 'electronics',
        'price': '₹30/day', 'price_amount': 30, 'price_unit': 'day',
        'condition': 'New',
        'deposit': '₹300', 'deposit_amount': 300,
        'description': 'Advanced scientific calculator. Allowed in most university exams.',
    },
    {
        'name': 'iPad Air (5th Gen)',
        'category_slug': 'electronics',
        'price': '₹250/day', 'price_amount': 250, 'price_unit': 'day',
        'condition': 'Excellent',
        'deposit': '₹4,500', 'deposit_amount': 4500,
        'description': 'With Apple Pencil. Great for note-taking, sketching, and presentations.',
    },
    {
        'name': 'Portable Projector (Xiaomi)',
        'category_slug': 'electronics',
        'price': '₹300/day', 'price_amount': 300, 'price_unit': 'day',
        'condition': 'Good',
        'deposit': '₹2,000', 'deposit_amount': 2000,
        'description': '1080p, built-in speaker. Perfect for group study sessions and presentations.',
    },

    # ── Textbooks (6 items) ───────────────────────────────────────────────────
    {
        'name': 'Data Structures & Algorithms (Cormen)',
        'category_slug': 'textbooks',
        'price': '₹80/week', 'price_amount': 80, 'price_unit': 'week',
        'condition': 'Good',
        'deposit': '₹500', 'deposit_amount': 500,
        'description': 'CLRS 4th edition. Must-have for CS students. Highlighted key sections.',
    },
    {
        'name': 'Engineering Mathematics (R.K. Kanodia)',
        'category_slug': 'textbooks',
        'price': '₹60/week', 'price_amount': 60, 'price_unit': 'week',
        'condition': 'Good',
        'deposit': '₹400', 'deposit_amount': 400,
        'description': 'Covers all topics for GATE & university exams. Solved examples included.',
    },
    {
        'name': 'Operating Systems (Galvin)',
        'category_slug': 'textbooks',
        'price': '₹70/week', 'price_amount': 70, 'price_unit': 'week',
        'condition': 'Excellent',
        'deposit': '₹450', 'deposit_amount': 450,
        'description': '10th edition. Clean copy, no markings. Great for OS exam prep.',
    },
    {
        'name': 'Topper Handwritten Notes — DBMS',
        'category_slug': 'textbooks',
        'price': '₹50/week', 'price_amount': 50, 'price_unit': 'week',
        'condition': 'New',
        'deposit': '₹200', 'deposit_amount': 200,
        'description': 'Complete DBMS notes by department topper. Diagrams and examples included.',
    },
    {
        'name': 'Computer Networks (Forouzan)',
        'category_slug': 'textbooks',
        'price': '₹65/week', 'price_amount': 65, 'price_unit': 'week',
        'condition': 'Good',
        'deposit': '₹400', 'deposit_amount': 400,
        'description': '6th edition. Covers OSI model, TCP/IP, routing protocols in detail.',
    },
    {
        'name': 'Physics Lab Manual + Practical File',
        'category_slug': 'textbooks',
        'price': '₹40/week', 'price_amount': 40, 'price_unit': 'week',
        'condition': 'Good',
        'deposit': '₹150', 'deposit_amount': 150,
        'description': '1st year physics lab manual with completed practical file for reference.',
    },

    # ── Tools & Equipment (6 items) ───────────────────────────────────────────
    {
        'name': 'Soldering Iron Kit',
        'category_slug': 'tools',
        'price': '₹50/day', 'price_amount': 50, 'price_unit': 'day',
        'condition': 'Good',
        'deposit': '₹500', 'deposit_amount': 500,
        'description': 'Complete soldering kit with iron, stand, solder wire. For electronics projects.',
    },
    {
        'name': 'Digital Multimeter',
        'category_slug': 'tools',
        'price': '₹40/day', 'price_amount': 40, 'price_unit': 'day',
        'condition': 'Excellent',
        'deposit': '₹400', 'deposit_amount': 400,
        'description': 'Measures voltage, current, resistance. Essential for ECE/EE lab work.',
    },
    {
        'name': 'Woodworking Tool Set',
        'category_slug': 'tools',
        'price': '₹100/day', 'price_amount': 100, 'price_unit': 'day',
        'condition': 'Good',
        'deposit': '₹800', 'deposit_amount': 800,
        'description': 'Hammer, chisels, saw, screwdrivers. For design and civil engineering projects.',
    },
    {
        'name': 'Arduino Uno Starter Kit',
        'category_slug': 'tools',
        'price': '₹80/day', 'price_amount': 80, 'price_unit': 'day',
        'condition': 'New',
        'deposit': '₹600', 'deposit_amount': 600,
        'description': 'Arduino Uno + breadboard + sensors + jumper wires. Perfect for IoT projects.',
    },
    {
        'name': 'Drawing Board & Instruments Set',
        'category_slug': 'tools',
        'price': '₹60/day', 'price_amount': 60, 'price_unit': 'day',
        'condition': 'Good',
        'deposit': '₹500', 'deposit_amount': 500,
        'description': 'A2 drawing board with T-square, set squares, compass. For engineering drawing.',
    },
    {
        'name': 'Raspberry Pi 4 (4GB)',
        'category_slug': 'tools',
        'price': '₹120/day', 'price_amount': 120, 'price_unit': 'day',
        'condition': 'Excellent',
        'deposit': '₹1,000', 'deposit_amount': 1000,
        'description': 'With power supply, SD card (32GB), case. For ML, IoT, and OS projects.',
    },

    # ── Clothing (6 items) ────────────────────────────────────────────────────
    {
        'name': 'Men\'s Formal Suit (Black)',
        'category_slug': 'clothing',
        'price': '₹200/day', 'price_amount': 200, 'price_unit': 'day',
        'condition': 'Excellent',
        'deposit': '₹1,500', 'deposit_amount': 1500,
        'description': 'Blazer + trousers. Sizes S/M/L/XL available. Dry cleaned after each use.',
    },
    {
        'name': 'Women\'s Formal Blazer Set',
        'category_slug': 'clothing',
        'price': '₹180/day', 'price_amount': 180, 'price_unit': 'day',
        'condition': 'Excellent',
        'deposit': '₹1,200', 'deposit_amount': 1200,
        'description': 'Professional blazer with trousers/skirt. Perfect for interviews and seminars.',
    },
    {
        'name': 'Lab Coat (White)',
        'category_slug': 'clothing',
        'price': '₹30/day', 'price_amount': 30, 'price_unit': 'day',
        'condition': 'New',
        'deposit': '₹200', 'deposit_amount': 200,
        'description': 'Full-length white lab coat. Sizes S to XL. Required for chemistry/bio labs.',
    },
    {
        'name': 'Traditional Sherwani (Wedding/Fest)',
        'category_slug': 'clothing',
        'price': '₹350/day', 'price_amount': 350, 'price_unit': 'day',
        'condition': 'Excellent',
        'deposit': '₹2,000', 'deposit_amount': 2000,
        'description': 'Embroidered sherwani with dupatta. Ideal for cultural fests and college events.',
    },
    {
        'name': 'Sports Jersey Set (Cricket)',
        'category_slug': 'clothing',
        'price': '₹80/day', 'price_amount': 80, 'price_unit': 'day',
        'condition': 'Good',
        'deposit': '₹400', 'deposit_amount': 400,
        'description': 'Full cricket jersey + trousers. Available in multiple sizes for inter-college matches.',
    },
    {
        'name': 'Graduation Gown & Cap',
        'category_slug': 'clothing',
        'price': '₹150/day', 'price_amount': 150, 'price_unit': 'day',
        'condition': 'Good',
        'deposit': '₹800', 'deposit_amount': 800,
        'description': 'Black graduation gown with cap and tassel. For convocation and farewell events.',
    },
]

# ── Write items to Firestore ──────────────────────────────────────────────────
added = 0
for item in items:
    item_id = str(uuid.uuid4())
    fdb.collection('items').document(item_id).set({
        **item,
        'is_available': True,
        'owner_id': OWNER['id'],
        'owner': OWNER,
        'campus_zone': 'Main Campus',
        'created_at': datetime.utcnow().isoformat(),
    })
    added += 1
    print(f"  ✔ [{item['category_slug']}] {item['name']}")

print(f"\n✅ Seed complete — {added} items added across {len(categories)} categories.")
