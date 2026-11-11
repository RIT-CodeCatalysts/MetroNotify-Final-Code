import sys
sys.path.append(".")

from datetime import datetime, timezone
from config.firebase_init import db


def update_leaderboard(user_id):
    """
    Adds or updates a user on the current monthly leaderboard
    for their primary zone.
    """

    user_ref = db.collection("users").document(user_id)
    user_doc = user_ref.get()

    if not user_doc.exists:
        print("User not found.")
        return False

    user = user_doc.to_dict()

    zone = user.get("primaryZone")
    if not zone:
        print("User has no primary zone.")
        return False

    now = datetime.now(timezone.utc)
    month = now.strftime("%Y_%m")
    board_id = f"{month}_{zone}"

    board_ref = db.collection("leaderboard").document(board_id)
    board_doc = board_ref.get()

    if board_doc.exists:
        board_data = board_doc.to_dict()
        entries = board_data.get("entries", [])
    else:
        entries = []

    updated_entry = {
        "userId": user_id,
        "displayName": user.get("displayName", "Unknown"),
        "points": user.get("points", 0),
        "level": user.get("level", "Citizen")
    }

    found = False

    for index, entry in enumerate(entries):
        if entry.get("userId") == user_id:
            entries[index] = updated_entry
            found = True
            break

    if not found:
        entries.append(updated_entry)

    entries.sort(
        key=lambda entry: entry.get("points", 0),
        reverse=True
    )

    top_entries = entries[:10]

    board_ref.set({
        "zone": zone,
        "month": month,
        "entries": top_entries,
        "lastUpdated": now
    })

    print(f"Leaderboard updated for {zone}, {month}.")
    return True


def get_zone_leaderboard(zone, month=None):
    """
    Returns the top 10 leaderboard entries for a zone.
    """

    if month is None:
        month = datetime.now(timezone.utc).strftime("%Y_%m")

    board_id = f"{month}_{zone}"
    board_doc = db.collection("leaderboard").document(board_id).get()

    if not board_doc.exists:
        return []

    return board_doc.to_dict().get("entries", [])


def get_user_rank(user_id):
    """
    Returns the user's current rank within their primary zone.
    """

    user_doc = db.collection("users").document(user_id).get()

    if not user_doc.exists:
        return None

    user = user_doc.to_dict()
    zone = user.get("primaryZone")

    if not zone:
        return None

    entries = get_zone_leaderboard(zone)

    for index, entry in enumerate(entries, start=1):
        if entry.get("userId") == user_id:
            return index

    return None