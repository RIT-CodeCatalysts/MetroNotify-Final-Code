import json
import glob
import os
import firebase_admin
from firebase_admin import credentials, firestore

# 1. Connect using your service account in this same folder
cred = credentials.Certificate("serviceAccount.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# 2. Auto-pick the NEWEST backup file
backup_files = glob.glob("*.json")
backup_files = [f for f in backup_files if "metronotify-backup" in f]
latest_file = max(backup_files, key=os.path.getctime)
print(f"Restoring from: {latest_file}")

with open(latest_file, "r") as f:
    backup_data = json.load(f)

print("Backup loaded. Collections found:", list(backup_data.keys()))

# 3. Restore each collection
for collection_name, documents in backup_data.items():
    print(f"\nRestoring collection: {collection_name}")
    
    for doc_id, doc_data in documents.items():
        db.collection(collection_name).document(doc_id).set(doc_data)
        print(f"  Restored: {doc_id}")

print("\n✅ Restore complete!")