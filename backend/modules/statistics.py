import sys
sys.path.append(".")

from firebase_admin import firestore
from config.firebase_init import initialize_firestore

db = initialize_firestore()


def update_statistics(user_id, report_type):
    user_ref = db.collection("users").document(user_id)
    user = user_ref.get()

    if not user.exists:
        print("User not found.")
        return

    user_data = user.to_dict()
    updates = {
        "weeklyReports": user_data.get("weeklyReports", 0) + 1
    }

    if report_type == "water_leak":
        updates["waterReports"] = user_data.get("waterReports", 0) + 1
    elif report_type == "power_outage":
        updates["powerReports"] = user_data.get("powerReports", 0) + 1
    elif report_type == "pothole":
        updates["roadReports"] = user_data.get("roadReports", 0) + 1
    elif report_type == "sewage":
        updates["sewageReports"] = user_data.get("sewageReports", 0) + 1

    from firebase_admin import firestore
    updates["lastReportDate"] = firestore.SERVER_TIMESTAMP
    user_ref.update(updates)
    print("Statistics updated successfully.")