import sys
sys.path.append(".")

from config.firebase_init import db
from modules.gamification import award_xp


FIRST_REPORTER_XP = 30
MINIMUM_CONFIRMATIONS = 3


def award_first_reporter_bonus(report_id):
    """
    Awards 30 XP to the original reporter once the report has
    at least three confirmations and has not already received the bonus.
    """

    report_ref = db.collection("reports").document(report_id)
    report_doc = report_ref.get()

    if not report_doc.exists:
        print("Report not found.")
        return False

    report = report_doc.to_dict()

    if report.get("firstReporterBonusAwarded", False):
        print("First reporter bonus was already awarded.")
        return False

    confirmations = report.get("upvotes", 0)

    if confirmations < MINIMUM_CONFIRMATIONS:
        print(
            f"Not enough confirmations. "
            f"Current: {confirmations}, required: {MINIMUM_CONFIRMATIONS}."
        )
        return False

    user_id = report.get("userId")

    if not user_id:
        print("The report has no userId.")
        return False

    award_xp(
        user_id,
        FIRST_REPORTER_XP,
        "first_reporter"
    )

    report_ref.update({
        "firstReporterBonusAwarded": True
    })

    print("First reporter bonus awarded successfully.")
    return True