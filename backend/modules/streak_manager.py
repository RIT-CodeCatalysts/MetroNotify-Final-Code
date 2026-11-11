import sys
sys.path.append(".")
from config.firebase_init import db
from firebase_admin import firestore
from datetime import datetime, timezone, timedelta
from modules.gamification import award_xp

#Streak Milestones
STREAK_MILESTONES = {
    7: 25,
    14: 35,
    30: 50,
    60: 75,
    100: 100
}


#Update Streak
def update_streak(user_id):
    user_ref = db.collection("users").document(user_id)
    user = user_ref.get().to_dict()

    if not user:
        print(f"User {user_id} not found")
        return

    now = datetime.now(timezone.utc)
    today = now.date()
    yesterday = today - timedelta(days=1)

    last_report_date = user.get("lastReportDate")
    current_streak = user.get("streak", 0)
    longest_streak = user.get("longestStreak", 0)

    if last_report_date:
        #Converting Firestore timestamp to date
        last_date = last_report_date.date()

        if last_date == today:
            #Already reported today, no streak change
            print(f"Already reported today. Streak stays at {current_streak}")
            return current_streak

        elif last_date == yesterday:
            #Reported yesterday, streak continues
            current_streak += 1
            print(f"Streak continues! Day {current_streak}")

        else:
            # Missed a day, streak resets
            print(f"Streak reset. Last report was {last_date}")
            current_streak = 1

            db.collection("notifications").add({
                "userId": user_id,
                "message": "Your streak was reset. Start a new one today!",
                "type": "streak_reset",
                "isRead": False,
                "timestamp": firestore.SERVER_TIMESTAMP
            })

    else:
        #First ever report
        current_streak = 1
        print("First report ever! Streak starts")

    #Update longest streak
    if current_streak > longest_streak:
        longest_streak = current_streak

    #Award bonus XP
    bonus_xp = STREAK_MILESTONES.get(current_streak, 10)
    award_xp(user_id, bonus_xp, reason=f"streak_day_{current_streak}")

    #Update user document
    user_ref.update({
        "streak": current_streak,
        "longestStreak": longest_streak,
        "lastReportDate": now
    })

    #Notify on milestones
    if current_streak in STREAK_MILESTONES:
        db.collection("notifications").add({
            "userId": user_id,
            "message": f" {current_streak} day streak! You're on fire! +{bonus_xp} bonus XP",
            "type": "streak_milestone",
            "isRead": False,
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        print(f"Milestone reached! {current_streak} days.")

    return current_streak


#Streak At Risk Warning
def check_streak_at_risk(user_id):
    """
    Run this daily at 8pm to warn users 
    their streak is about to break
    """
    user = db.collection("users").document(user_id).get().to_dict()

    if not user:
        return

    last_report_date = user.get("lastReportDate")
    streak = user.get("streak", 0)

    if streak > 2 and last_report_date:
        today = datetime.now(timezone.utc).date()
        last_date = last_report_date.date()

        if last_date < today:
            db.collection("notifications").add({
                "userId": user_id,
                "message": f" Your {streak} day streak is at risk! Report an issue today to keep it.",
                "type": "streak_warning",
                "isRead": False,
                "timestamp": firestore.SERVER_TIMESTAMP
            })
            print(f"Streak warning sent for user {user_id} ")


#Testing
TEST_USER_ID = "t5M2F8TQ0ZNlmrFtRvFs"

#update_streak(TEST_USER_ID)