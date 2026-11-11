import sys
sys.path.append(".")

from datetime import datetime
from config.firebase_init import db

BANNED_WORDS = [
    "idiot",
    "stupid",
    "hate",
    "damn",
    "fool"
]


def contains_profanity(comment):
    """
    Checks whether a comment contains banned words.
    """

    comment = comment.lower()

    for word in BANNED_WORDS:
        if word in comment:
            return True

    return False


def add_comment(user_id, report_id, comment):
    """
    Adds a comment to a report after checking for profanity.
    """

    user_ref = db.collection("users").document(user_id)
    report_ref = db.collection("reports").document(report_id)

    user = user_ref.get()

    if not user.exists:
        print("User not found.")
        return

    user_data = user.to_dict()

    violations = user_data.get("profanityViolations", 0)

    if user_data.get("commentSuspended", False):
        print("User is suspended from commenting.")
        return

    if contains_profanity(comment):

        violations += 1

        update_data = {
            "profanityViolations": violations
        }

        if violations >= 3:
            update_data["commentSuspended"] = True

        user_ref.update(update_data)

        print("Comment blocked because it contains inappropriate language.")
        return

    report_ref.collection("comments").add({
        "userId": user_id,
        "comment": comment,
        "timestamp": datetime.utcnow()
    })

    user_ref.update({
        "commentCount": user_data.get("commentCount", 0) + 1
    })

    print("Comment added successfully.")