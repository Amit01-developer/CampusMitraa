import firebase_admin
from firebase_admin import credentials, firestore
import os
import json
import logging

logger = logging.getLogger('campusmitra.db')

_cred_json    = os.environ.get('FIREBASE_CREDENTIALS_JSON')
_default_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
_cred_path    = os.environ.get('FIREBASE_CREDENTIALS', _default_path)

try:
    if _cred_json:
        cred = credentials.Certificate(json.loads(_cred_json))
        logger.info('Firebase: using credentials from environment variable')
    else:
        if not os.path.exists(_cred_path):
            raise FileNotFoundError(f'Service account key not found at: {_cred_path}')
        cred = credentials.Certificate(_cred_path)
        logger.info('Firebase: using credentials from file %s', _cred_path)

    firebase_admin.initialize_app(cred, {
        'storageBucket': os.environ.get('FIREBASE_STORAGE_BUCKET', 'campus-share-2f42b.appspot.com')
    })
    logger.info('Firebase Admin SDK initialised successfully')

except Exception as e:
    logger.critical('Failed to initialise Firebase: %s', e)
    raise

firestore_db = firestore.client()
