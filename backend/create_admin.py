"""
create_admin.py — Run once to create the admin user in Firestore.
Usage:  python create_admin.py
"""
from db import firestore_db as fdb
from werkzeug.security import generate_password_hash
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

ADMIN_EMAIL    = 'hacktolearn001@gmail.com'
ADMIN_PASSWORD = '@dmin123'
ADMIN_UID      = 'admin-campusmitra-001'

# Check if already exists
existing = fdb.collection('users').document(ADMIN_UID).get()
if existing.exists:
    print(f'⚠️  Admin user already exists ({ADMIN_EMAIL}). Updating password...')

fdb.collection('users').document(ADMIN_UID).set({
    'name':          'CampusMitra Admin',
    'email':         ADMIN_EMAIL,
    'password_hash': generate_password_hash(ADMIN_PASSWORD),
    'department':    'Administration',
    'year':          '',
    'campus_zone':   'Admin',
    'trust_score':   5.0,
    'is_verified':   True,
    'is_admin':      True,
    'created_at':    datetime.utcnow().isoformat(),
})

print(f'✅ Admin user created/updated successfully!')
print(f'   Email   : {ADMIN_EMAIL}')
print(f'   Password: {ADMIN_PASSWORD}')
print(f'   UID     : {ADMIN_UID}')
