import sys
sys.path.append(".")
from config.firebase_init import db
from firebase_admin import firestore

#Levels
LEVELS = [
    (0, "Citizen"),
    (100, "Watchdog"),
    (300, "Community Guardian"),
    (600, "City Sentinel"),
    (1000, "Urban Legend")
]

#XP Rewards
XP_REWARDS = {
    "new_report": 20,
    "upvote": 5,
    "report_verified": 15,
    "streak_bonus": 10,
    "first_reporter": 30,
    "issue_resolved": 10,
    "comment": 3
}


#Get Level Based on XP
def get_level(points):
    current_level = "Citizen"
    for threshold, level_name in LEVELS:
        if points >= threshold:
            current_level = level_name
    return current_level


#Award XP
def award_xp(user_id, points, reason=""):
    user_ref = db.collection("users").document(user_id)
    user = user_ref.get().to_dict()

    if not user:
        print(f"User {user_id} not found.")
        return

    old_points = user.get("points", 0)
    new_points = old_points + points

    old_level = user.get("level", "Citizen")
    new_level = get_level(new_points)

    user_ref.update({
        "points": new_points,
        "level": new_level
    })

    print(f"XP awarded: +{points} for '{reason}'")
    print(f"Total XP: {new_points}")
    print(f"Level: {new_level}")

    #Notify if user has levelled up
    if new_level != old_level:
        db.collection("notifications").add({
            "userId": user_id,
            "message": f"You levelled up to {new_level}!",
            "type": "level_up",
            "isRead": False,
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        print(f"Level up! {old_level} → {new_level}")


#Test
TEST_USER_ID = "shXhCK1J6ZLXo8Gy5ikW"

# award_xp(TEST_USER_ID, XP_REWARDS["new_report"], reason="new_report")

#Testing level up — award enough XP to hit Watchdog (100 XP)
# award_xp(TEST_USER_ID, 80, reason="testing_level_up")