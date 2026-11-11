import sys
sys.path.append(".")

from config.firebase_init import db
from modules.gamification import award_xp

MISSIONS = [
    "Submit 3 reports",
    "Report a water issue",
    "Report a power issue",
    "Receive 5 upvotes",
    "Comment on 2 reports",
    "Be the first reporter",
    "Report in a new zone"
]


def assign_weekly_missions(user_id):
    """
    Assigns three weekly missions to a user.
    """

    user_ref = db.collection("users").document(user_id)
    user = user_ref.get()

    if not user.exists:
        print("User not found.")
        return

    missions = MISSIONS[:3]

    user_ref.update({
        "weeklyMissions": [
            {
                "mission": mission,
                "completed": False,
                "claimed": False
            }
            for mission in missions
        ]
    })

    print("Weekly missions assigned.")


def complete_mission(user_id, mission_name):
    """
    Marks a mission as completed.
    """

    user_ref = db.collection("users").document(user_id)
    user = user_ref.get()

    if not user.exists:
        return

    data = user.to_dict()
    missions = data.get("weeklyMissions", [])

    for mission in missions:
        if mission["mission"] == mission_name:
            mission["completed"] = True

    user_ref.update({
        "weeklyMissions": missions
    })

    print("Mission completed.")


def claim_reward(user_id, mission_name):
    """
    Awards XP when a completed mission is claimed.
    """

    user_ref = db.collection("users").document(user_id)
    user = user_ref.get()

    if not user.exists:
        return

    data = user.to_dict()
    missions = data.get("weeklyMissions", [])

    for mission in missions:
        if (
            mission["mission"] == mission_name
            and mission["completed"]
            and not mission["claimed"]
        ):
            mission["claimed"] = True
            award_xp(user_id, 25, "Weekly mission reward")

    user_ref.update({
        "weeklyMissions": missions
    })

    print("Reward claimed.")