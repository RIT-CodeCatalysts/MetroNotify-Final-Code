"""Firebase Authentication and Firestore role enforcement for Flask APIs.

No synthetic, debug-header, or client-declared role authentication is accepted.
"""
from functools import wraps

from firebase_admin import auth
from flask import g, jsonify, request

from config.firebase_init import db

ROLES = {"ratepayer", "admin", "technician"}


def firebase_identity():
    """Validate the Firebase Auth ID token without granting a Firestore role."""
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None, ("Sign in with Firebase Authentication", 401)
    token = header[7:].strip()
    if not token:
        return None, ("Missing Firebase ID token", 401)
    try:
        claims = auth.verify_id_token(token, check_revoked=True)
        if not claims.get("uid"):
            return None, ("Invalid Firebase ID token", 401)
        return claims, None
    except Exception:
        return None, ("Invalid, expired or revoked Firebase ID token", 401)


def identify_user():
    claims, error = firebase_identity()
    if error:
        return None, error
    uid = claims["uid"]
    doc = db.collection("users").document(uid).get()
    profile = doc.to_dict() if doc.exists else {}
    role = (profile or {}).get("role")
    if role not in ROLES or (profile or {}).get("disabled") is True:
        return None, ("This account has not been authorised for a MetroNotify role", 403)
    return {"id": uid, "role": role, "profile": profile, "claims": claims}, None


def require_roles(*roles):
    def decorate(func):
        @wraps(func)
        def wrapped(*args, **kwargs):
            principal, error = identify_user()
            if error:
                return jsonify({"status": "error", "message": error[0]}), error[1]
            if principal["role"] not in roles:
                return jsonify({"status": "error", "message": "Insufficient permissions"}), 403
            # /api/me remains accessible so recently registered users can
            # see their profile while completing email verification.
            if request.path != "/api/me" and not principal["claims"].get("email_verified", False):
                return jsonify({"status": "error", "message": "Verify your registered email address to continue"}), 403
            g.principal = principal
            return func(*args, **kwargs)
        return wrapped
    return decorate
