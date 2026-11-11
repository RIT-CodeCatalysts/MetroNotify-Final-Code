import sys
sys.path.append(".")
from config.firebase_init import db
from firebase_admin import firestore
from datetime import datetime, timezone

def update_leaderboard(user_id, points_earned):
    user_ref = db.collection("users").document(user_id)
    user = user_ref.get().to_dict()

    if not user:
        print(f"User {user_id} not found")
        return

    now = datetime.now(timezone.utc)
    month_key = now.strftime("%Y_%m")
    user_zone = user.get("primaryZone", "unknown")

    board_id = f"{month_key}_{user_zone}"
    board_ref = db.collection("leaderboard").document(board_id)
    board_doc = board_ref.get()

    if board_doc.exists:
        entries = board_doc.to_dict().get("entries", [])
        user_entry = next(
            (e for e in entries if e["userId"] == user_id), None
        )

        if user_entry:
            user_entry["points"] = user.get("points", 0)
            user_entry["level"] = user.get("level", "Citizen")
        else:
            entries.append({
                "userId": user_id,
                "displayName": user.get("displayName", "Unknown"),
                "points": user.get("points", 0),
                "level": user.get("level", "Citizen")
            })

        #Sorting by points in descending order
        entries.sort(key=lambda x: x["points"], reverse=True)
        board_ref.update({"entries": entries})
        print(f"Leaderboard updated for zone {user_zone}")

    else:
        #Creating a new monthly board for this zone
        board_ref.set({
            "zone": user_zone,
            "month": month_key,
            "entries": [{
                "userId": user_id,
                "displayName": user.get("displayName", "Unknown"),
                "points": user.get("points", 0),
                "level": user.get("level", "Citizen")
            }]
        })
        print(f"New leaderboard created for zone {user_zone}")

def get_leaderboard(zone, month_key=None):
    if not month_key:
        month_key = datetime.now(timezone.utc).strftime("%Y_%m")

    board_id = f"{month_key}_{zone}"
    board = db.collection("leaderboard").document(board_id).get()

    if board.exists:
        entries = board.to_dict().get("entries", [])
        return entries[:10]  #Top 10 only

    return []

def get_user_rank(user_id, zone):
    entries = get_leaderboard(zone)
    for index, entry in enumerate(entries):
        if entry["userId"] == user_id:
            return index + 1  #1-based rank
    return None


# Manual test commands should be run explicitly, never on import.
if __name__ == "__main__":
    test_user_id = "t5M2F8TQ0ZNlmrFtRvFs"
    test_zone = "ke7e5k"
    print("Top 10 for zone", test_zone)
    for index, entry in enumerate(get_leaderboard(test_zone), start=1):
        print(index, entry.get("displayName"), entry.get("points"))
    print("Rank:", get_user_rank(test_user_id, test_zone))
