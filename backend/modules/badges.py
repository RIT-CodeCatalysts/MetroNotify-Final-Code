import sys
sys.path.append(".")

from config.firebase_init import db
from modules.gamification import award_xp


BADGE_RULES = [
    {
        "name": "First Step",
        "field": "verifiedReports",
        "required": 1,
        "xp": 10
    },
    {
        "name": "Community Guardian",
        "field": "verifiedReports",
        "required": 10,
        "xp": 30
    },
    {
        "name": "Community Hero",
        "field": "verifiedReports",
        "required": 25,
        "xp": 50
    },
    {
        "name": "Watchdog",
        "field": "points",
        "required": 100,
        "xp": 20
    },
    {
        "name": "XP Master",
        "field": "points",
        "required": 500,
        "xp": 50
    },
    {
        "name": "Consistency Champion",
        "field": "longestStreak",
        "required": 7,
        "xp": 30
    },
    {
        "name": "Streak Legend",
        "field": "longestStreak",
        "required": 30,
        "xp": 75
    }
]


def check_badges(user_id):
    """
    Checks the user's progress and awards any new badges.
    """

    user_ref = db.collection("users").document(user_id)
    user_doc = user_ref.get()

    if not user_doc.exists:
        print("User not found.")
        return []

    user_data = user_doc.to_dict()
    current_badges = user_data.get("badges", [])

    if not isinstance(current_badges, list):
        current_badges = []

    new_badges = []

    for rule in BADGE_RULES:
        badge_name = rule["name"]
        field_name = rule["field"]
        required_value = rule["required"]
        xp_reward = rule["xp"]

        current_value = user_data.get(field_name, 0)

        if current_value >= required_value and badge_name not in current_badges:
            new_badges.append(badge_name)

            award_xp(
                user_id,
                xp_reward,
                f"{badge_name} badge"
            )

    if not new_badges:
        print("No new badges.")
        return []

    updated_badges = current_badges + new_badges

    user_ref.update({
        "badges": updated_badges
    })

    print("New badges awarded:", new_badges)
    return new_badges