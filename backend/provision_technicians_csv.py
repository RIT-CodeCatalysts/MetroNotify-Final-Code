"""Secure optional bulk technician invitations using explicitly supplied REAL emails.

DRY RUN: python provision_technicians_csv.py --csv roster.csv
APPLY: python provision_technicians_csv.py --csv roster.csv --project utility-alert-system --apply

CSV headers: name,email,specialization
Never store passwords in CSV. Firebase creates an unknown random initial
password. Staff set their own via Forgot password and verify their address.
This is a privileged, interactive, administrator-run setup operation.
"""
import argparse
import csv
import os
import re
import secrets
from pathlib import Path
from firebase_admin import auth, firestore
from config.firebase_init import db

VALID_SPECIALIZATIONS = {
    "electrical", "plumbing", "civil", "security", "waste", "traffic", "general"
}


def read_roster(path):
    with open(path, newline="", encoding="utf-8-sig") as input_file:
        entries = list(csv.DictReader(input_file))
    if len(entries) > 100:
        raise ValueError("Import no more than 100 staff at once")
    emails = set()
    result = []
    for line_no, entry in enumerate(entries, start=2):
        name = str(entry.get("name") or "").strip()
        email = str(entry.get("email") or "").strip().lower()
        specialty = str(entry.get("specialization") or "").strip().lower()
        if not 2 <= len(name) <= 100:
            raise ValueError(f"Row {line_no}: invalid name")
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 254:
            raise ValueError(f"Row {line_no}: invalid email")
        if email.endswith("@example.com") or email.endswith("@example.org") or email.endswith("@example.net"):
            raise ValueError(f"Row {line_no}: must use a real staff mailbox")
        if specialty not in VALID_SPECIALIZATIONS:
            raise ValueError(f"Row {line_no}: unsupported specialisation")
        if email in emails:
            raise ValueError(f"Row {line_no}: duplicate email")
        emails.add(email)
        result.append((name, email, specialty))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True)
    parser.add_argument("--project", default="utility-alert-system")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.project != "utility-alert-system":
        raise SystemExit("Project ID mismatch. No changes made.")
    roster = read_roster(Path(args.csv))
    print(f"Validated {len(roster)} technician invitations:")
    for name, email, spec in roster:
        print(f"  {name} <{email}> ({spec})")
    if not args.apply:
        print("DRY RUN: no Firebase changes. Provide --apply only with team approval.")
        return
    if input("Type ADD STAFF to confirm Firebase account creation: ").strip() != "ADD STAFF":
        raise SystemExit("Cancelled")
    for name, email, spec in roster:
        try:
            auth.get_user_by_email(email)
        except auth.UserNotFoundError:
            pass
        else:
            print(f"SKIPPED: {email} already exists in Firebase Auth")
            continue
        # Never reuse or print a shared password; staff reset their own.
        created = auth.create_user(email=email, display_name=name,
                                   password=secrets.token_urlsafe(32))
        try:
            batch = db.batch()
            batch.set(db.collection("users").document(created.uid), {
                "role": "technician", "name": name, "displayName": name,
                "email": email, "technicianId": created.uid,
                "emailNotificationsEnabled": False,
                "createdAt": firestore.SERVER_TIMESTAMP,
            })
            batch.set(db.collection("technicians").document(created.uid), {
                "name": name, "email": email, "authUid": created.uid,
                "specialization": spec, "isAvailable": True,
                "assignedTickets": [], "createdAt": firestore.SERVER_TIMESTAMP,
            })
            batch.commit()
            print(f"CREATED: {email}; staff should use Forgot password to choose their own password")
        except Exception:
            auth.delete_user(created.uid)
            raise


if __name__ == "__main__":
    main()
