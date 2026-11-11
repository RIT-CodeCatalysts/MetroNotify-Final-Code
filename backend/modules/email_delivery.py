"""Optional Firebase Trigger Email extension integration.

Emails are queued ONLY from trusted Flask server code, and ONLY when a
user has opted in AND verified the email address on their Firebase Auth
account. This module does NOT send email itself; the Firebase extension
and its SMTP provider must be installed separately.
"""
import logging
import os
from firebase_admin import auth, firestore
from config.firebase_init import db

log = logging.getLogger(__name__)


def queue_notification_email(user_id, notification_id, title, message):
    if os.getenv("METRONOTIFY_EMAIL_ENABLED", "0") != "1":
        return False
    if not user_id:
        return False  # Shared role notifications stay in-app only.
    user_doc = db.collection("users").document(user_id).get()
    profile = user_doc.to_dict() if user_doc.exists else {}
    if not profile or profile.get("emailNotificationsEnabled") is not True:
        return False
    firebase_user = auth.get_user(user_id)
    if not firebase_user.email or not firebase_user.email_verified or firebase_user.disabled:
        return False
    collection = os.getenv("METRONOTIFY_MAIL_COLLECTION", "mail").strip()
    if collection != "mail":
        raise ValueError("Only the approved 'mail' outbox is supported")
    # Deterministic ID prevents re-queuing a notification after an API retry.
    db.collection(collection).document(notification_id).create({
        "to": [firebase_user.email],
        "message": {
            "subject": "MetroNotify: " + str(title).replace("\n", " ").replace("\r", " ")[:120],
            "text": (str(message)[:1500] + "\n\nYou can view this update securely in the MetroNotify app.\nDo not reply to this automated message."),
        },
        "createdAt": firestore.SERVER_TIMESTAMP,
        "notificationId": notification_id,
        "recipientUid": user_id,
    })
    return True
