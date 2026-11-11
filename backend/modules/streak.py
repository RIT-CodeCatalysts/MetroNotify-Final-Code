import sys
sys.path.append(".")

from datetime import datetime, timedelta
from firebase_admin import firestore

from config.firebase_init import initialize_firestore
from modules.gamification import award_xp


db = initialize_firestore()

STREAK_REWARDS = {
    7: 25,
    14: 35,
    30: 50,
    60: 75,
    100: 100
}


def update_streak(user_id):
    """
    Updates the user's reporting streak and awards milestone XP.
    """

    user_ref = db.collection("users").document(user_id)
    user_doc = user_ref.get()

    if not user_doc.exists:
        print("User not found.")
        return False

    user_data = user_doc.to_dict()

    current_streak = user_data.get("streak", 0)
    longest_streak = user_data.get("longestStreak", 0)
    last_report = user_data.get("lastReportDate")
    rewarded_milestones = user_data.get("streakMilestones", [])

    if not isinstance(rewarded_milestones, list):
        rewarded_milestones = []

    today = datetime.now().date()

    if last_report:
        last_date = last_report.date()

        if last_date == today:
            print("Streak already updated today.")
            return False

        if last_date == today - timedelta(days=1):
            current_streak += 1
        else:
            current_streak = 1

    else:
        current_streak = 1

    longest_streak = max(current_streak, longest_streak)

    user_ref.update({
        "streak": current_streak,
        "longestStreak": longest_streak,
        "lastReportDate": firestore.SERVER_TIMESTAMP
    })

    if (
        current_streak in STREAK_REWARDS
        and current_streak not in rewarded_milestones
    ):
        reward_xp = STREAK_REWARDS[current_streak]

        award_xp(
            user_id,
            reward_xp,
            f"{current_streak}-day streak milestone"
        )

        rewarded_milestones.append(current_streak)

        user_ref.update({
            "streakMilestones": rewarded_milestones
        })

        print(
            f"{current_streak}-day streak reached. "
            f"{reward_xp} XP awarded."
        )
    else:
        print(f"Streak updated successfully: {current_streak} days.")

    return True