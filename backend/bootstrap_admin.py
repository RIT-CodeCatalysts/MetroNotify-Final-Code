"""Explicitly authorise an EXISTING Firebase Auth user as Municipal Admin.

Uses Admin credentials from this machine; never call this from a browser.
Preview: python bootstrap_admin.py --email admin@example.com
Apply:   python bootstrap_admin.py --email admin@example.com --apply
"""
import argparse
from firebase_admin import auth, firestore
from config.firebase_init import db


def main():
    parser = argparse.ArgumentParser(description="Provision the first trusted Admin role")
    parser.add_argument("--email", required=True, help="Existing Firebase Authentication account email")
    parser.add_argument("--apply", action="store_true", help="Actually update Firestore")
    args = parser.parse_args()
    user = auth.get_user_by_email(args.email.strip().lower())
    print("Firebase Auth UID:", user.uid)
    print("Firebase Auth email:", user.email)
    if not args.apply:
        print("DRY RUN. Re-run with --apply only if the project owner authorised this Admin.")
        return
    ref = db.collection("users").document(user.uid)
    old = ref.get()
    previous = old.to_dict() or {} if old.exists else {}
    if previous.get("role") == "technician":
        raise SystemExit("Refusing to overwrite an existing technician role")
    ref.set({
        "role": "admin", "name": previous.get("name") or user.display_name or "Municipal Admin",
        "displayName": previous.get("displayName") or user.display_name or "Municipal Admin",
        "email": user.email, "createdAt": previous.get("createdAt") or firestore.SERVER_TIMESTAMP,
        "roleProvisionedAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)
    print("Authorised this account as Municipal Admin in Firestore.")


if __name__ == "__main__":
    main()
