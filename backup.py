import json
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

cred = credentials.Certificate("serviceAccount.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

def clean_value(v):
    # GeoPoint -> {latitude, longitude}
    if hasattr(v, 'latitude') and hasattr(v, 'longitude'):
        return {"latitude": v.latitude, "longitude": v.longitude}
    # Timestamp / datetime
    if hasattr(v, 'isoformat'):
        return v.isoformat()
    # DocumentReference
    if hasattr(v, 'path'):
        return v.path
    # Nested dict
    if isinstance(v, dict):
        return {k: clean_value(val) for k, val in v.items()}
    # List
    if isinstance(v, list):
        return [clean_value(x) for x in v]
    return v

collections = ["alerts", "auditLogs", "enquiries", "leaderboard", "notifications", "reports", "technicians", "tickets", "users"]

backup = {}
for col in collections:
    docs = db.collection(col).stream()
    backup[col] = []
    for doc in docs:
        data = doc.to_dict()
        data = {k: clean_value(v) for k, v in data.items()}
        data["_id"] = doc.id
        backup[col].append(data)
    print(f"{col}: {len(backup[col])} docs backed up")

filename = f"UPLOAD ME TO USB - metronotify-backup-{datetime.now().strftime('%Y-%m-%d')}.json"
with open(filename, "w", encoding="utf-8") as f:
    json.dump(backup, f, indent=2, ensure_ascii=False)

print(f"\nDone! Saved as {filename}")