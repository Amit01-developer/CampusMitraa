from functools import wraps
from flask import jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from db import firestore_db as fdb
import logging

logger = logging.getLogger('campusmitra.auth')


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except Exception as e:
            logger.debug('JWT verification failed: %s', e)
            return jsonify({'error': 'Authentication required. Please log in.'}), 401
        return fn(*args, **kwargs)
    return wrapper


def get_current_user():
    try:
        uid = get_jwt_identity()
        if not uid:
            return None
        doc = fdb.collection('users').document(uid).get()
        if not doc.exists:
            return None
        return {'id': doc.id, **doc.to_dict()}
    except Exception as e:
        logger.exception('get_current_user error')
        return None
