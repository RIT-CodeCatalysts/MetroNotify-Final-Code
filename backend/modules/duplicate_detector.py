import sys
sys.path.append(".")

from config.firebase_init import initialize_firestore
from datetime import datetime, timedelta


# Connect to Firestore
db = initialize_firestore()


def check_duplicate(geohash, report_type, minutes=30):
    """
    Checks if a similar report exists in the same area 
    within the last 30 minutes.
    """

    from datetime import timezone
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    
    reports = db.collection("reports")\
        .where("geohash", "==", geohash)\
        .where("type", "==", report_type)\
        .stream()
    
    for report in reports:
        data = report.to_dict()
        timestamp = data.get("timestamp")
        if timestamp and timestamp.replace(tzinfo=None) >= cutoff.replace(tzinfo=None):
            print(f"Duplicate found: {report.id}")
            return report.id
    
    return None