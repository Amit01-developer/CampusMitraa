import firebase_admin
from firebase_admin import credentials, firestore
import os
import json
import logging

logger = logging.getLogger('campusmitra.db')

_cred_json    = os.environ.get('FIREBASE_CREDENTIALS_JSON')
_default_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
_cred_path    = os.environ.get('FIREBASE_CREDENTIALS', _default_path)

firebase_error = None


def _resolve_credential_path(path):
    if os.path.isabs(path) or os.path.exists(path):
        return path

    backend_relative_path = os.path.join(os.path.dirname(__file__), path)
    if os.path.exists(backend_relative_path):
        return backend_relative_path

    return path

try:
    if _cred_json:
        # Render sometimes wraps the value in single quotes or escapes newlines
        _cred_json = _cred_json.strip().strip("'").strip('"')
        try:
            _cred_dict = json.loads(_cred_json)
        except json.JSONDecodeError:
            # Try fixing escaped newlines in private_key
            _cred_json = _cred_json.replace('\\n', '\n')
            _cred_dict = json.loads(_cred_json)
        # Fix private_key newlines if they came in as literal \n
        if 'private_key' in _cred_dict:
            _cred_dict['private_key'] = _cred_dict['private_key'].replace('\\n', '\n')
        cred = credentials.Certificate(_cred_dict)
        logger.info('Firebase: using credentials from environment variable')
    else:
        _cred_path = _resolve_credential_path(_cred_path)
        if not os.path.exists(_cred_path):
            raise FileNotFoundError(f'Service account key not found at: {_cred_path}')
        cred = credentials.Certificate(_cred_path)
        logger.info('Firebase: using credentials from file %s', _cred_path)

    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, {
            'storageBucket': os.environ.get('FIREBASE_STORAGE_BUCKET', 'campus-share-2f42b.appspot.com')
        })
    logger.info('Firebase Admin SDK initialised successfully')
    firestore_db = firestore.client()

except Exception as e:
    firebase_error = str(e)
    firestore_db = None
    logger.error('Failed to initialise Firebase: %s', e)
