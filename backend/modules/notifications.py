import logging


from firebase_admin import firestore
from config.firebase_init import db


# ----------------------------------------
# CREATE NOTIFICATION
# ----------------------------------------

def create_notification(
    user_id,
    title,
    message,
    *,
    recipient_role=None,
    report_ref=None,
    status=None
):
    """
    Store a notification in Firestore.

    A notification can target an individual user
    or a shared municipal role.
    """

    if not user_id and not recipient_role:
        raise ValueError(
            "A user ID or recipient role is required"
        )

    notification_data = {
        "userId": user_id,
        "recipientRole": recipient_role,
        "title": title,
        "message": message,
        "reportRef": report_ref,
        "status": status,
        "isRead": False,
        "timestamp": firestore.SERVER_TIMESTAMP
    }

    notification_ref = (
        db.collection("notifications").document()
    )

    notification_ref.set(notification_data)

    # In-app notification is the primary record. Optional email delivery must
    # never undo or break it when the extension/provider is not available.
    if user_id:
        try:
            from modules.email_delivery import queue_notification_email
            queue_notification_email(user_id, notification_ref.id, title, message)
        except Exception:
            logging.getLogger(__name__).exception("Email queue failed for notification %s", notification_ref.id)

    return notification_ref.id


# ----------------------------------------
# GET NOTIFICATIONS FOR A USER
# ----------------------------------------

def get_user_notifications(user_id):
    """
    Retrieve notifications addressed to one user.
    """

    documents = (
        db.collection("notifications")
        .where("userId", "==", user_id)
        .stream()
    )

    notifications = []

    for document in documents:
        data = document.to_dict() or {}

        timestamp = data.get("timestamp")

        notifications.append({
            "id": document.id,
            "title": data.get("title", ""),
            "message": data.get("message", ""),
            "reportRef": data.get("reportRef"),
            "status": data.get("status"),
            "isRead": data.get("isRead", False),
            "timestamp": (
                timestamp.isoformat()
                if hasattr(timestamp, "isoformat")
                else None
            )
        })

    return notifications


# ----------------------------------------
# MARK NOTIFICATION AS READ
# ----------------------------------------

def mark_as_read(user_id, notification_id):
    """
    Mark an individual user's notification as read.
    """

    notification_ref = (
        db.collection("notifications")
        .document(notification_id)
    )

    snapshot = notification_ref.get()

    if not snapshot.exists:
        return False

    data = snapshot.to_dict() or {}

    if data.get("userId") != user_id:
        return False

    notification_ref.update({
        "isRead": True
    })

    return True
