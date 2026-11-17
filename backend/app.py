"""MetroNotify Flask API: Firebase Auth IDs plus server-verified Firestore roles.

Firestore is the source of truth; anonymous calls cannot access private data.
"""
import logging
import time
import os
from datetime import datetime, timedelta, timezone

from firebase_admin import firestore, auth
import secrets
from io import BytesIO
from pathlib import Path
import re
from flask import send_file
from flask import Flask, g, jsonify, request
from flask_cors import CORS

# Use one shared Firebase Firestore connection for all municipal collections.
from config.firebase_init import db
# The role decorator validates Firebase ID tokens before protected routes run.
from modules.api_security import firebase_identity, require_roles
from modules.badges import check_badges
from modules.comments import add_comment
from modules.firestore_workflow import (
    TYPE_LABELS, TYPE_SPECIALIZATIONS, assign_technician, find_report,
    iso, notify_safely, serialize_alert, serialize_report, serialize_ticket,
    update_ticket_status,
)
from modules.leaderboard import get_zone_leaderboard
from modules.report_processor import process_report


# -----------------------------------------------------------------------------
# Municipal technician matching: Civil fallback (no automatic assignment)
# -----------------------------------------------------------------------------
# Keep the existing dedicated specialisations. The Civil technician may also
# be SUGGESTED for potholes, stormwater, sewerage and Other reports.
# The Admin must still click Assign Technician; the secured assignment route
# checks login, availability and specialisation before saving anything.
#
# Important: update this imported dictionary IN PLACE so that
# modules.firestore_workflow.assign_technician sees the same rules.
# These category names describe work that may be handled by a Civil specialist.
# This is a matching rule, not an automatic dispatch.
_CIVIL_FALLBACK_TYPES = {
    "pothole", "potholes", "stormwater", "storm_water", "storm water",
    "drainage", "sewage", "sewerage", "other", "other_issue",
    "other municipal issue",
}

# Extend the same dictionary used by the shared assignment helper.
# Keeping dedicated specialists first lets the Admin choose an appropriate person.
for _category, _allowed in list(TYPE_SPECIALIZATIONS.items()):
    _normalized_category = str(_category).strip().lower().replace("-", "_")
    if _normalized_category not in _CIVIL_FALLBACK_TYPES:
        continue
    if isinstance(_allowed, set):
        _allowed.add("civil")
    elif isinstance(_allowed, list):
        if "civil" not in _allowed:
            _allowed.append("civil")
    elif isinstance(_allowed, tuple):
        if "civil" not in _allowed:
            TYPE_SPECIALIZATIONS[_category] = _allowed + ("civil",)
    elif isinstance(_allowed, frozenset):
        TYPE_SPECIALIZATIONS[_category] = _allowed | {"civil"}
    else:
        raise TypeError(f"Unsupported technician specialisation format for {_category}")

# Older installations might not yet have these newer service categories.
# This adds a Civil fallback without altering existing specialist categories.
# Older workflow mappings may be missing some of the new report categories.
for _category in ("pothole", "sewage", "stormwater", "other"):
    TYPE_SPECIALIZATIONS.setdefault(_category, {"civil"})

TYPE_LABELS.setdefault("other", "Other")
TYPE_LABELS.setdefault("stormwater", "Stormwater")

# Matching rules are configuration only; no tickets are assigned here.


# Create the Flask application and restrict which frontend origin may call the API.
app = Flask(__name__)
# 6 MiB request cap prevents oversized JSON and photo requests.
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024
CORS(app, resources={r"/api/*": {"origins": os.getenv("FRONTEND_ORIGIN", "http://localhost:3000"),
                                   "allow_headers": ["Content-Type", "Authorization"],
                                   "methods": ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]}})



# SECURITY RESPONSE HEADERS
# Add basic browser security headers to every API response.
# The no-store header helps prevent private API replies being cached.
@app.after_request
def security_response_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    # Never cache private report, ticket or account information in the browser.
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response



# AUDIT ACTION
# Write a short audit trail whenever an administrator or user changes
# important records. Audit failure must not block the original operation.
def audit_action(action, target_id, **context):
    """Best-effort server audit: no password, email or token details stored."""
    try:
        # Use the identity stored by the authentication decorator, not a client-supplied name.
        actor = getattr(g, "principal", {}) or {}
        db.collection("auditLogs").document().set({
            "action": action,
            "actorUid": actor.get("id"),
            "actorRole": actor.get("role"),
            "targetId": str(target_id)[:128],
            "details": {k: str(v)[:120] for k, v in context.items()},
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
    except Exception:
        app.logger.exception("Could not record audit event %s", action)



# JSON BODY
# Read a JSON request safely. Non-JSON requests return None so each
# endpoint can reject an invalid request with a clear message.
def json_body():
    return request.get_json(silent=True) if request.is_json else None



# ERROR
# Use the same error response format throughout the React-to-Flask API.
# The status code helps the frontend distinguish bad input from access denial.
def error(message, status=400):
    return jsonify({"status": "error", "message": message}), status


#Updated below: 17/11/2026 - Yusriy

# SAFE LIST DOCUMENTS

# Simple in-memory cache - stops Spark quota burn
# 1 Firestore read per 60 seconds, no matter how many people refresh
_PUBLIC_CACHE = {}

def get_cached_public(key, ttl_seconds, loader):
    now = time.time()
    hit = _PUBLIC_CACHE.get(key)
    if hit and now - hit[0] < ttl_seconds:
        return hit[1]
    data = loader()
    _PUBLIC_CACHE[key] = (now, data)
    return data

def clear_public_cache():
    _PUBLIC_CACHE.clear()
def safe_list_documents(collection, limit=50):
    return list(db.collection(collection).limit(limit).stream())
#Updated ends here (above): 17/11/2026 - Yusriy


# HEALTH CHECK
# Return a simple status for checking whether Flask is running.
# This public route does not reveal any account or report information.
@app.get("/")
def health_check():
    return jsonify({"status": "healthy", "service": "MetroNotify API",
                    "authentication": "firebase-id-token-required"})



# REGISTER RATEPAYER
# Create a Firestore user profile after Firebase Authentication succeeds.
# A new account starts as a ratepayer awaiting municipal verification.
@app.post("/api/auth/register")
def register_ratepayer():
    """Create a ratepayer profile for a freshly authenticated Firebase user.

    A client cannot set its role or mark municipal account verification complete.
    """
    # Identify the Firebase account before storing any user details.
    claims, problem = firebase_identity()
    if problem:
        return error(problem[0], problem[1])
    uid = claims["uid"]
    body = json_body()
    if not isinstance(body, dict):
        return error("Valid registration data is required")
    name = str(body.get("name") or "").strip()
    if not (2 <= len(name) <= 100):
        return error("Please enter a valid full name (2–100 characters)")
    doc = db.collection("users").document(uid)
    # Do not overwrite a profile if the account is already registered.
    if doc.get().exists:
        return error("This account already has a MetroNotify profile; sign in instead", 409)
    email = claims.get("email", "")
    if not email:
        return error("Firebase email authentication is required", 403)
    try:
        doc.create({
            "role": "ratepayer", "name": name, "displayName": name, "email": email,
            "ratepayerStatus": "pending", "municipalAccountVerified": False,
            "emailNotificationsEnabled": body.get("emailNotificationsEnabled") is True,
            "ratepayerAccountNumber": str(body.get("accountNumber") or "")[:100],
            "propertyAddress": str(body.get("propertyAddress") or "")[:250],
            "municipality": str(body.get("municipality") or "")[:150],
            "points": 0, "level": "Citizen", "badges": [],
            "streak": 0, "longestStreak": 0, "verifiedReports": 0,
            "weeklyReports": 0, "primaryZone": "unknown",
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
        return jsonify({"status": "success", "role": "ratepayer"}), 201
    except Exception:
        app.logger.exception("Could not create ratepayer profile")
        return error("Could not save registration profile", 500)



# CURRENT PROFILE
# Return the signed-in user's own profile and role to React.
# The server obtains the user ID from the verified Firebase token.
@app.get("/api/me")
@require_roles("ratepayer", "admin", "technician")
def current_profile():
    doc = db.collection("users").document(g.principal["id"]).get()
    data = doc.to_dict() if doc.exists else {}
    profile = data or {}
    return jsonify({"user": {
        "id": g.principal["id"], "role": g.principal["role"],
        "name": profile.get("name") or profile.get("displayName", "MetroNotify User"),
        "email": profile.get("email", ""),
        "technicianId": profile.get("technicianId"),
        "municipality": profile.get("municipality", ""),
        "ratepayerStatus": profile.get("ratepayerStatus", "pending"),
        "municipalAccountVerified": profile.get("municipalAccountVerified", False),
        "emailNotificationsEnabled": profile.get("emailNotificationsEnabled", False),
        "points": profile.get("points", 0),
        "level": profile.get("level", "Citizen"),
        "streak": profile.get("streak", 0),
        "badges": profile.get("badges", []),
        "stats": profile.get("stats", {}),
        "weeklyReports": profile.get("weeklyReports", 0),
    }})


# -----------------------------------------------------------------------------
# One-time municipal billing verification
# -----------------------------------------------------------------------------

# GET MY BILLING
# Load the ratepayer's saved municipal billing details.
# The route is private and cannot read another resident's account.
@app.get("/api/me/billing")
@require_roles("ratepayer")
def get_my_billing():
    """A resident may see only their own saved municipal billing details."""
    profile = db.collection("users").document(g.principal["id"]).get().to_dict() or {}
    return jsonify({"billing": {
        "accountNumber": profile.get("ratepayerAccountNumber", ""),
        "propertyAddress": profile.get("propertyAddress", ""),
        "municipality": profile.get("municipality", ""),
        "reviewNote": profile.get("billingReviewNote", ""),
    }, "ratepayerStatus": profile.get("ratepayerStatus", "pending"),
        "municipalAccountVerified": profile.get("municipalAccountVerified", False)})



# UPDATE MY BILLING
# Accept new billing information from a signed-in ratepayer.
# If important details change, municipal approval is reset to pending.
@app.patch("/api/me/billing")
@require_roles("ratepayer")
def update_my_billing():
    """Submit account details once; changed details require renewed approval."""
    body = json_body()
    if not isinstance(body, dict):
        return error("Valid billing details are required")
    number = str(body.get("accountNumber") or "").strip()
    address = str(body.get("propertyAddress") or "").strip()
    municipality = str(body.get("municipality") or "").strip()
    if not (4 <= len(number) <= 100):
        return error("Municipal account number must be 4–100 characters")
    if not (5 <= len(address) <= 250):
        return error("Property address must be 5–250 characters")
    if not (2 <= len(municipality) <= 150):
        return error("Municipality must be 2–150 characters")

    user_ref = db.collection("users").document(g.principal["id"])
    snapshot = user_ref.get()
    if not snapshot.exists:
        return error("Ratepayer profile not found", 404)
    profile = snapshot.to_dict() or {}
    changed = (number != profile.get("ratepayerAccountNumber", "")
               or address != profile.get("propertyAddress", "")
               or municipality != profile.get("municipality", ""))
    if not changed:
        return jsonify({"status": "success", "ratepayerStatus":
                        profile.get("ratepayerStatus", "pending")})

    # Never allow residents to write an approval flag themselves.
    user_ref.update({
        "ratepayerAccountNumber": number,
        "propertyAddress": address,
        "municipality": municipality,
        "ratepayerStatus": "pending",
        "municipalAccountVerified": False,
        "billingReviewNote": "",
        "billingSubmittedAt": firestore.SERVER_TIMESTAMP,
        "billingVerifiedBy": None,
    })
    audit_action("ratepayer.billing_submitted", g.principal["id"])
    notify_safely(None, "Municipal Account Pending Approval",
                  "A ratepayer submitted municipal account details for review.",
                  recipient_role="admin")
    return jsonify({"status": "success", "ratepayerStatus": "pending"})



# ADMIN RATEPAYERS
# Show Municipal Admin a list of residents waiting for approval.
# Return the billing-review details required by the Admin screen.
@app.get("/api/admin/ratepayers")
@require_roles("admin")
def admin_ratepayers():
    """Return only billing-review fields to authorised Municipal Admins."""
    rows = []
    for doc in safe_list_documents("users", 50):
        profile = doc.to_dict() or {}
        if profile.get("role") != "ratepayer":
            continue
        rows.append({
            "id": doc.id,
            "name": profile.get("name") or profile.get("displayName", "Ratepayer"),
            "email": profile.get("email", ""),
            "accountNumber": profile.get("ratepayerAccountNumber", ""),
            "propertyAddress": profile.get("propertyAddress", ""),
            "municipality": profile.get("municipality", ""),
            "status": profile.get("ratepayerStatus", "pending"),
            "verified": profile.get("municipalAccountVerified") is True,
        })
    rows.sort(key=lambda item: (item["status"] == "verified", item["name"].lower()))
    return jsonify({"ratepayers": rows})



# ADMIN REVIEW BILLING
# Allow Admin to approve, reject or revoke a municipal account.
# Only a verified billing account can submit new incident reports.
@app.patch("/api/admin/ratepayers/<user_id>/billing")
@require_roles("admin")
def admin_review_billing(user_id):
    """Approve, reject or revoke billing verification after an external check."""
    body = json_body()
    if not isinstance(body, dict):
        return error("Valid review details are required")
    decision = str(body.get("decision") or "").strip().lower()
    if decision not in {"approve", "reject", "revoke"}:
        return error("Decision must be approve, reject or revoke")
    note = str(body.get("note") or "").strip()
    if decision == "reject" and not (5 <= len(note) <= 250):
        return error("Enter a rejection reason between 5 and 250 characters")

    ref = db.collection("users").document(user_id)
    snapshot = ref.get()
    if not snapshot.exists or (snapshot.to_dict() or {}).get("role") != "ratepayer":
        return error("Ratepayer not found", 404)
    profile = snapshot.to_dict() or {}

    if decision == "approve":
        if body.get("confirmedAgainstRecords") is not True:
            return error("Confirm the municipal billing record check before approval")
        if not all(str(profile.get(field) or "").strip() for field in
                   ("ratepayerAccountNumber", "propertyAddress", "municipality")):
            return error("The resident has not supplied complete billing details", 409)
        ref.update({"ratepayerStatus": "verified",
                    "municipalAccountVerified": True,
                    "billingReviewNote": "",
                    "billingVerifiedBy": g.principal["id"],
                    "billingVerifiedAt": firestore.SERVER_TIMESTAMP})
        title, message = ("Municipal Account Approved",
                          "Your municipal account is verified. You can now submit service reports.")
    else:
        ref.update({"ratepayerStatus": "rejected" if decision == "reject" else "pending",
                    "municipalAccountVerified": False,
                    "billingReviewNote": note if decision == "reject" else "",
                    "billingVerifiedBy": None,
                    "billingReviewedAt": firestore.SERVER_TIMESTAMP})
        title = "Municipal Account Not Approved" if decision == "reject" else "Municipal Approval Revoked"
        message = ("Review your billing details in My Profile. " + note) if decision == "reject" else             "Your municipal account approval was revoked. Please contact the administrator."

    audit_action("ratepayer.billing_" + decision, user_id)
    notify_safely(user_id, title, message)
    return jsonify({"status": "success", "decision": decision})



# GET PREFERENCES
# Read the current user's alert preferences, including selected area
# and which notifications or alerts they already dismissed.
@app.get("/api/me/preferences")
@require_roles("ratepayer", "admin", "technician")
def get_preferences():
    doc = db.collection("users").document(g.principal["id"]).get()
    data = doc.to_dict() or {}
    return jsonify({"selectedArea": data.get("selectedArea"),
                    "readAlertIds": data.get("readAlertIds", []),
                    "hiddenAlertIds": data.get("hiddenAlertIds", []),
                    "emailNotificationsEnabled": data.get("emailNotificationsEnabled", False)})



# SAVE PREFERENCES
# Update only supported preference fields for the current user.
# Validate list sizes and data types before writing to Firestore.
@app.patch("/api/me/preferences")
@require_roles("ratepayer", "admin", "technician")
def save_preferences():
    body = json_body()
    if not isinstance(body, dict):
        return error("Preference update must be an object")
    fields = {}
    if "selectedArea" in body:
        area = body.get("selectedArea")
        if area is not None:
            if not isinstance(area, dict):
                return error("selectedArea must be an object or null")
            area = {k: str(area.get(k) or "")[:150] for k in ("province", "municipality", "area")}
        fields["selectedArea"] = area
    for name in ("readAlertIds", "hiddenAlertIds"):
        if name in body:
            items = body[name]
            if (not isinstance(items, list) or len(items) > 250 or
                    any(not isinstance(x, str) or len(x) > 128 for x in items)):
                return error(name + " must be a list of up to 250 IDs")
            fields[name] = list(dict.fromkeys(items))
    if "emailNotificationsEnabled" in body:
        if not isinstance(body["emailNotificationsEnabled"], bool):
            return error("emailNotificationsEnabled must be true or false")
        fields["emailNotificationsEnabled"] = body["emailNotificationsEnabled"]
    if not fields:
        return error("No supported preference fields supplied")
    db.collection("users").document(g.principal["id"]).update(fields)
    return jsonify({"status": "success"})



# CREATE REPORT
# Receive a new incident report from an approved ratepayer.
# The report processor saves it and tries to link a municipal ticket.
@app.route("/api/reports", methods=["POST"])
@require_roles("ratepayer")
def create_report():
    payload = json_body()
    if not isinstance(payload, dict):
        return error("A valid JSON object is required")
    # One-time account verification is required before new reports.
    profile_doc = db.collection("users").document(g.principal["id"]).get()
    profile = profile_doc.to_dict() or {}
    # A resident must receive Admin billing approval before creating incidents.
    if not (profile.get("municipalAccountVerified") is True
            and profile.get("ratepayerStatus") == "verified"):
        return error("Municipal billing account approval is required before you can submit reports. Open your profile to submit your billing details for Admin review", 403)
    # Never trust a client-supplied userId.
    # Replace any untrusted userId with the account verified by Firebase.
    payload = {**payload, "userId": g.principal["id"]}
    result = process_report(payload)

    # Preserve the selected locality after successful creation. Older versions
    # saved only a GeoPoint, which cannot supply a human-readable suburb.
    # This uses the resident's report location (not their billing address).
    # Save the public area/municipality provided with the report, if available.
    if result.get("status") == "success" and result.get("reportId"):
        locality = {}
        for field in ("province", "municipality", "area"):
            value = payload.get(field)
            if isinstance(value, str) and value.strip():
                locality[field] = value.strip()[:150]
        if locality:
            try:
                db.collection("reports").document(result["reportId"]).update(locality)
            except Exception:
                # The report was saved; do not falsely claim it failed.
                app.logger.exception("Report saved but locality metadata was not updated")

    return jsonify(result), (400 if result.get("status") == "error" else 200)



# LIST REPORTS
# Return reports according to the signed-in role: Admin sees the
# municipal queue, residents see their own, and technicians see assigned jobs.
@app.route("/api/reports", methods=["GET"])
@require_roles("admin", "ratepayer", "technician")
def list_reports():
    try:
        role, uid = g.principal["role"], g.principal["id"]
        # Admins may inspect municipal records, unlike ratepayers and technicians.
        if role == "admin":
            docs = safe_list_documents("reports", 200)
        elif role == "ratepayer":
            docs = db.collection("reports").where("userId", "==", uid).limit(200).stream()
        else:
            # Each technician sees only jobs assigned to their Firebase UID.
            assigned = safe_list_documents("tickets", 200)
            ids = {rid for t in assigned
                   if technician_owns_ticket((t.to_dict() or {}), uid)
                   for rid in (t.to_dict() or {}).get("reportIds", [])}
            docs = [db.collection("reports").document(rid).get() for rid in ids]
        reports = [serialize_report(doc) for doc in docs if doc.exists]
        reports.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
        return jsonify({"reports": reports})
    except Exception:
        app.logger.exception("Unable to retrieve reports")
        return error("Unable to retrieve reports", 500)



# REPORT BY REFERENCE
# Look up one report by its Firestore ID or public reference.
# Check ownership or assignment before revealing the incident details.
@app.get("/api/reports/<path:reference>")
@require_roles("admin", "ratepayer", "technician")
def report_by_reference(reference):
    try:
        doc = find_report(reference.strip())
        if doc is None or not doc.exists:
            return error("Report not found", 404)
        data = doc.to_dict() or {}
        role, uid = g.principal["role"], g.principal["id"]
        if role == "ratepayer" and data.get("userId") != uid:
            return error("Report not found", 404)
        # A technician is permitted access only to reports linked to their own jobs.
        if role == "technician":
            tid = data.get("ticketId")
            snap = db.collection("tickets").document(tid).get() if tid else None
            if not snap or not snap.exists or not technician_owns_ticket(snap.to_dict() or {}, uid):
                return error("Report not found", 404)
        return jsonify({"report": serialize_report(doc)})
    except Exception:
        app.logger.exception("Unable to look up report")
        return error("Unable to look up report", 500)



# REVIEW REPORT
# Mark a municipal report as verified after Admin checks it.
# Verification is separate from a technician starting or completing work.
@app.patch("/api/reports/<path:reference>/review")
@require_roles("admin")
def review_report(reference):
    doc = find_report(reference)
    if not doc or not doc.exists:
        return error("Report not found", 404)
    data = doc.to_dict() or {}
    # Resolved work cannot be reopened by simply verifying a report.
    if data.get("status") in {"resolved", "closed"}:
        return error("Cannot review a resolved report")
    # Verification and work status are separate concepts.
    doc.reference.update({"verification": "verified", "updatedAt": firestore.SERVER_TIMESTAMP})
    if data.get("verification") != "verified" and data.get("userId"):
        user_ref = db.collection("users").document(data["userId"])
        if user_ref.get().exists:
            user_ref.update({"verifiedReports": firestore.Increment(1)})
    audit_action("report.verified", doc.id)
    notify_safely(data.get("userId"), "Report Reviewed",
                  f"Report {data.get('referenceNumber', reference)} has been reviewed.",
                  report_ref=data.get("referenceNumber", reference), status=data.get("status", "assessing"))
    return jsonify({"status": "success", "report": serialize_report(doc.reference.get())})



# TECHNICIAN OWNS TICKET
# Confirm that the signed-in technician's Firebase UID matches
# the technician record assigned to a particular ticket.
def technician_owns_ticket(ticket, user_uid):
    technician_id = ticket.get("assignedTech")
    if not technician_id:
        return False
    tech_snap = db.collection("technicians").document(technician_id).get()
    if not tech_snap.exists:
        return False
    return (tech_snap.to_dict() or {}).get("authUid") == user_uid



# PROVISION TECHNICIAN ACCOUNT
# Create a staff Firebase Auth login using a random initial password.
# The technician then sets their own password using the reset flow.
def provision_technician_account(email, name):
    """Create an invited staff account with unknown random initial password.

    Staff use the password-reset link from the Login page to set a password.
    """
    initial_password = secrets.token_urlsafe(32)
    return auth.create_user(email=email, display_name=name, password=initial_password)



# TECHNICIANS LIST
# Return the technician register to Admin, including specialisation,
# availability and whether a Firebase login is linked.
@app.get("/api/technicians")
@require_roles("admin")
def technicians_list():
    try:
        rows = []
        for doc in safe_list_documents("technicians"):
            d = doc.to_dict() or {}
            rows.append({"id": doc.id, "name": d.get("name", ""),
                         "specialization": d.get("specialization", ""),
                         "isAvailable": d.get("isAvailable", False),
                         "assignedTickets": d.get("assignedTickets", []),
                         "email": d.get("email", ""),
                         "hasLogin": bool(d.get("authUid"))})
        return jsonify({"technicians": rows})
    except Exception:
        app.logger.exception("Unable to fetch technicians")
        return error("Unable to fetch technicians", 500)



# ADD TECHNICIAN
# Invite a new technician with Admin-only permission.
# Create both the Auth login and the corresponding Firestore records.
@app.post("/api/technicians")
@require_roles("admin")
def add_technician():
    """Admins invite individual technician accounts; no public staff signup."""
    data = json_body()
    if not isinstance(data, dict):
        return error("Valid JSON is required")
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    specialization = str(data.get("specialization", "")).strip().lower()
    # Read allowed specialisations from the same rules used for dispatch.
    valid_specializations = set().union(*TYPE_SPECIALIZATIONS.values())
    if not (2 <= len(name) <= 100) or specialization not in valid_specializations:
        return error("Enter a name (2–100 characters) and a supported specialisation")
    if not email or "@" not in email or len(email) > 254:
        return error("Enter the technician's valid work email address")
    new_user = None
    try:
        # The invited technician receives a unique Auth UID used to secure future access.
        new_user = provision_technician_account(email, name)
        batch = db.batch()
        batch.set(db.collection("users").document(new_user.uid), {
            "name": name, "displayName": name, "email": email,
            "role": "technician", "technicianId": new_user.uid,
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
        batch.set(db.collection("technicians").document(new_user.uid), {
            "name": name, "email": email, "authUid": new_user.uid,
            "specialization": specialization, "isAvailable": True,
            "assignedTickets": [], "createdAt": firestore.SERVER_TIMESTAMP,
        })
        batch.commit()
        audit_action("technician.created", new_user.uid, specialization=specialization)
        return jsonify({"status": "success", "technician": {
            "id": new_user.uid, "name": name, "email": email,
            "specialization": specialization, "isAvailable": True,
            "hasLogin": True,
        }, "message": "Technician invited. Ask them to use Forgot password to set their password."}), 201
    except auth.EmailAlreadyExistsError:
        return error("An Auth account already uses that email. Use a different email or invite the existing user through an admin", 409)
    except Exception:
        app.logger.exception("Could not provision technician account")
        if new_user is not None:
            try:
                auth.delete_user(new_user.uid)
            except Exception:
                app.logger.exception("Could not roll back incomplete Auth account")
        return error("Unable to create the technician account", 500)



# INVITE EXISTING TECHNICIAN
# Connect an older technician document to a new Firebase Auth login.
# This supports legacy staff records that were created without credentials.
@app.post("/api/technicians/<technician_id>/invite")
@require_roles("admin")
def invite_existing_technician(technician_id):
    """Attach a login to an older Firestore technician document."""
    tech_ref = db.collection("technicians").document(technician_id)
    existing = tech_ref.get()
    if not existing.exists:
        return error("Technician not found", 404)
    data = existing.to_dict() or {}
    if data.get("authUid"):
        return error("Technician already has a login", 409)
    body = json_body() or {}
    email = str(body.get("email") or "").strip().lower()
    name = str(data.get("name") or "Technician")[:100]
    if not email or "@" not in email:
        return error("Enter a valid email address")
    new_user = None
    try:
        # The invited technician receives a unique Auth UID used to secure future access.
        new_user = provision_technician_account(email, name)
        batch = db.batch()
        batch.update(tech_ref, {"authUid": new_user.uid, "email": email})
        batch.set(db.collection("users").document(new_user.uid), {
            "name": name, "email": email, "role": "technician",
            "technicianId": technician_id,
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
        batch.commit()
        audit_action("technician.invited", technician_id)
        return jsonify({"status": "success", "message": "Technician login created. Use Forgot password to set a password."})
    except auth.EmailAlreadyExistsError:
        return error("That email already exists in Firebase Authentication", 409)
    except Exception:
        app.logger.exception("Unable to invite technician")
        if new_user is not None:
            try: auth.delete_user(new_user.uid)
            except Exception: app.logger.exception("Account rollback failed")
        return error("Unable to invite technician", 500)



# TICKETS LIST
# List municipal jobs with their linked reports.
# Technicians are restricted to tickets actually assigned to their UID.
@app.get("/api/tickets")
@require_roles("admin", "technician")
def tickets_list():
    try:
        result = []
        for doc in safe_list_documents("tickets"):
            item = serialize_ticket(doc)
            if g.principal["role"] == "technician" and not technician_owns_ticket(item, g.principal["id"]):
                continue
            report_ids = item.get("reportIds", [])
            report_docs = [db.collection("reports").document(rid).get() for rid in report_ids[:30]]
            item["reports"] = [serialize_report(r) for r in report_docs if r.exists]
            result.append(item)
        return jsonify({"tickets": result})
    except Exception:
        app.logger.exception("Unable to retrieve tickets")
        return error("Unable to retrieve tickets", 500)



# TEAM TICKET OVERVIEW
# Give staff a limited view of the municipal workload.
# The overview excludes private resident descriptions and billing details.
@app.get("/api/tickets/overview")
@require_roles("admin", "technician")
def team_ticket_overview():
    """Read-only board for ALL staff, without resident PII or descriptions.

    The /api/tickets endpoint remains restricted to a technician's own jobs;
    a technician can only update their own assignments.
    """
    rows = []
    for snap in safe_list_documents("tickets", 200):
        item = snap.to_dict() or {}
        rows.append({
            "id": snap.id,
            "type": item.get("type", "other"),
            "status": item.get("status", "open"),
            "priority": item.get("priority", 0),
            "assignedTechName": item.get("assignedTechName", "Unassigned"),
            "createdAt": iso(item.get("createdAt")),
        })
    rows.sort(key=lambda row: row.get("createdAt") or "", reverse=True)
    return jsonify({"tickets": rows})



# ASSIGN JOB
# Accept a technician chosen by Admin in the dispatch dropdown.
# The workflow helper checks eligibility before saving the assignment.
@app.post("/api/tickets/<ticket_id>/assign")
@require_roles("admin")
def assign_job(ticket_id):
    data = json_body()
    technician_id = str((data or {}).get("technicianId", "")).strip()
    # Reject empty or oversized technician IDs before calling the assignment helper.
    if not technician_id or len(technician_id) > 128:
        return error("Select a technician")
    try:
        # This function enforces eligibility and updates the ticket in Firestore.
        # It is called only AFTER Admin presses Assign Technician.
        name = assign_technician(ticket_id, technician_id)
        audit_action("ticket.assigned", ticket_id, technicianId=technician_id)
        return jsonify({"status": "success", "ticketId": ticket_id, "assignedTechnician": name})
    except ValueError as exc:
        return error(str(exc), 409)
    except Exception:
        app.logger.exception("Unable to assign ticket")
        return error("Unable to assign ticket", 500)



# CHANGE JOB STATUS
# Let only the assigned technician start or finish their own work.
# Admin assignment does not automatically mark the job in progress.
@app.patch("/api/tickets/<ticket_id>/status")
@require_roles("technician")
def change_job_status(ticket_id):
    status = str((json_body() or {}).get("status", ""))
    try:
        ticket_snapshot = db.collection("tickets").document(ticket_id).get()
        if not ticket_snapshot.exists or not technician_owns_ticket(ticket_snapshot.to_dict() or {}, g.principal["id"]):
            return error("This job is not assigned to your technician account", 403)
        label = update_ticket_status(ticket_id, status)
        audit_action("ticket.status_changed", ticket_id, status=status)
        return jsonify({"status": "success", "ticketId": ticket_id, "jobStatus": status, "label": label})
    except ValueError as exc:
        return error(str(exc), 409)
    except Exception:
        app.logger.exception("Unable to change ticket status")
        return error("Unable to change ticket status", 500)



# CAN ACCESS REPORT
# Reuse the role and ownership checks when serving private report photos.
# Technicians can view photos only for their own assigned jobs.
def can_access_report(data, uid, role):
    # Admins may inspect municipal records, unlike ratepayers and technicians.
    if role == "admin":
        return True
    if role == "ratepayer":
        return data.get("userId") == uid
    # A technician is permitted access only to reports linked to their own jobs.
    if role == "technician":
        tid = data.get("ticketId")
        snap = db.collection("tickets").document(tid).get() if tid else None
        return bool(snap and snap.exists and technician_owns_ticket(snap.to_dict() or {}, uid))
    return False



# PRIVATE LOCAL PHOTO STORAGE
# -----------------------------------------------------------------------------
# The coursework/demo version does NOT require a paid Firebase Storage bucket.
# Photos are stored on the computer running Flask. Firestore stores only small
# metadata fields indicating that a photo exists; the image bytes stay on disk.
#
# IMPORTANT: The default folder is OUTSIDE the Git repository to prevent photos
# being accidentally committed to GitHub or served by the React development app.
# Photos will NOT follow the project to another computer or a cloud deployment.
# Back up this private folder if you need to keep the photos.
#
# To choose a different PRIVATE folder, set METRONOTIFY_PRIVATE_PHOTO_DIR
# before running Flask. Never point it to frontend/public, static, or a synced
# public folder. Keep Windows folder permissions limited to the machine user.
MAX_REPORT_PHOTO_BYTES = 5 * 1024 * 1024
MAX_REPORT_PHOTO_PIXELS = 16_000_000


def private_photo_directory():
    """Determine the private storage directory, without creating it on GET."""
    configured = os.getenv("METRONOTIFY_PRIVATE_PHOTO_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()

    # app.py lives in <workspace>/MetroNotify-Team-GitHub/backend/app.py.
    # Save beside the Git repository, not inside it.
    workspace = Path(__file__).resolve().parents[2]
    return workspace / "MetroNotify_private_photos"


def private_photo_path(report_id, content_type):
    """Build a predictable, safe path without accepting user-made filenames."""
    # Firestore document IDs created by our reporting system are alphanumeric.
    # This validation prevents directory traversal even for unusual old records.
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", str(report_id)):
        raise ValueError("Invalid report photo identifier")

    extensions = {"image/jpeg": "jpg", "image/png": "png"}
    extension = extensions.get(content_type)
    if extension is None:
        raise ValueError("Unsupported report photo format")

    return private_photo_directory() / f"{report_id}.{extension}"


def clean_uploaded_photo(original_bytes):
    """Validate and re-encode an image so its metadata is not retained.

    The browser already cleans the image, but the Flask server must NOT trust
    browsers: callers can directly send API requests without using React.
    Pillow is a free Python package and is required for this step.
    """
    # Import here to avoid blocking every other MetroNotify route if Pillow
    # has not yet been installed in the virtual environment.
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:
        raise RuntimeError(
            "Photo processing is not installed. Install Pillow in the backend virtual environment."
        ) from exc

    try:
        with Image.open(BytesIO(original_bytes)) as source:
            original_format = source.format
            if original_format not in {"JPEG", "PNG"}:
                raise ValueError("Only valid JPG and PNG photos are allowed")

            # Check dimensions before decoding a potentially huge image.
            width, height = source.size
            if width <= 0 or height <= 0 or width * height > MAX_REPORT_PHOTO_PIXELS:
                raise ValueError("Photo dimensions are too large (maximum 16 million pixels)")

            source.load()  # Reject truncated and damaged photo data.
            # Rotate as directed by the photo EXIF before removing metadata.
            upright = ImageOps.exif_transpose(source)

            # Create a NEW pixel-only image. Do not copy EXIF, GPS, comments, or
            # other ancillary metadata from the uploaded image into its output.
            if original_format == "PNG":
                has_transparency = ("A" in upright.getbands() or
                                    "transparency" in source.info)
                mode = "RGBA" if has_transparency else "RGB"
                clean = Image.new(mode, upright.size)
                clean.paste(upright.convert(mode))
                output_format, extension, content_type = "PNG", "png", "image/png"
            else:
                clean = Image.new("RGB", upright.size)
                clean.paste(upright.convert("RGB"))
                output_format, extension, content_type = "JPEG", "jpg", "image/jpeg"

            destination = BytesIO()
            if output_format == "JPEG":
                clean.save(destination, format=output_format, quality=85, optimize=True)
            else:
                clean.save(destination, format=output_format, optimize=True)
            cleaned_bytes = destination.getvalue()

    except (OSError, Image.DecompressionBombError) as exc:
        # A corrupted or disguised image is bad user input (HTTP 400).
        raise ValueError("The uploaded photo is not a valid or readable JPG/PNG image") from exc

    if not cleaned_bytes or len(cleaned_bytes) > MAX_REPORT_PHOTO_BYTES:
        raise ValueError("The processed photo is larger than 5 MB; choose a smaller photo")

    return cleaned_bytes, content_type


# UPLOAD REPORT PHOTO
# -----------------------------------------------------------------------------
# Upload starts only AFTER /api/reports has saved the incident to Firestore.
# A photo is optional. Failure here must NOT delete or invalidate the report.
@app.post("/api/reports/<path:reference>/photo")
@require_roles("ratepayer")
def upload_report_photo(reference):
    """Store one private local photo owned by the authenticated ratepayer."""
    snap = find_report(reference)
    if not snap or not snap.exists:
        return error("Report not found", 404)

    report = snap.to_dict() or {}
    if report.get("userId") != g.principal["id"]:
        # Avoid exposing whether another resident's report exists.
        return error("Report not found", 404)

    # Reject oversized multipart requests before reading the uploaded file.
    if request.content_length and request.content_length > 6 * 1024 * 1024:
        return error("Maximum photo size is 5 MB", 413)

    uploaded = request.files.get("photo")
    if uploaded is None:
        return error("Select a JPG or PNG photo")

    original_bytes = uploaded.read(MAX_REPORT_PHOTO_BYTES + 1)
    if not original_bytes:
        return error("The photo is empty")
    if len(original_bytes) > MAX_REPORT_PHOTO_BYTES:
        return error("Maximum photo size is 5 MB", 413)

    # Only one photo per report in the current demo design. Prevent replacing
    # earlier photos silently and changing a record during Admin review.
    if report.get("photoStorageType") == "local":
        return error("This report already has a saved photo", 409)

    try:
        clean_bytes, content_type = clean_uploaded_photo(original_bytes)
        destination = private_photo_path(snap.id, content_type)
        folder = destination.parent
        folder.mkdir(parents=True, exist_ok=True, mode=0o700)

        # Never overwrite an existing photo (including a previous upload
        # whose Firestore metadata update may have been interrupted).
        for existing_type in ("image/jpeg", "image/png"):
            if private_photo_path(snap.id, existing_type).exists():
                return error("A photo already exists for this report", 409)

        # "xb" means create new file only. It prevents accidental overwrites
        # even if two upload requests are submitted at nearly the same time.
        try:
            with destination.open("xb") as photo_handle:
                photo_handle.write(clean_bytes)
        except FileExistsError:
            return error("A photo already exists for this report", 409)

        # Store metadata only, not photo bytes or a public link, in Firestore.
        # An Admin will use the authenticated download endpoint to view it.
        snap.reference.update({
            "photoStorageType": "local",
            "photoContentType": content_type,
            "photoAvailable": True,
            "photoUploadedAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
        audit_action("report.photo_uploaded", snap.id)
        return jsonify({"status": "success", "photoAvailable": True}), 201

    except ValueError as exc:
        # Invalid images are user input errors, not server errors.
        return error(str(exc), 400)
    except RuntimeError as exc:
        # Pillow has not been installed yet.
        return error(str(exc), 503)
    except Exception:
        app.logger.exception("Could not save private report photo")
        return error("Photo upload failed; your report is still saved", 500)


# DOWNLOAD REPORT PHOTO
# -----------------------------------------------------------------------------
# Only Admin, the reporting ratepayer, or the technician assigned to the
# report's ticket can read this photo. This endpoint is NOT public.
@app.get("/api/reports/<path:reference>/photo")
@require_roles("admin", "ratepayer", "technician")
def download_report_photo(reference):
    """Send a private locally saved image to an authorised account."""
    snap = find_report(reference)
    if not snap or not snap.exists:
        return error("Report not found", 404)

    report = snap.to_dict() or {}
    if not can_access_report(report, g.principal["id"], g.principal["role"]):
        return error("Report not found", 404)

    # Older reports may have a Firebase Storage path but no local photo.
    # Do not claim that those old cloud images have been transferred here.
    if report.get("photoStorageType") != "local":
        return error("This report has no locally saved photo", 404)

    content_type = report.get("photoContentType")
    try:
        destination = private_photo_path(snap.id, content_type)
        # Deny symbolic links; photos must be actual files inside the folder.
        if destination.is_symlink() or not destination.is_file():
            return error("Photo file not found on this computer", 404)

        # Files never exceed 5 MB when written by our upload endpoint.
        with destination.open("rb") as photo_handle:
            content = photo_handle.read(MAX_REPORT_PHOTO_BYTES + 1)
        if not content or len(content) > MAX_REPORT_PHOTO_BYTES:
            return error("Stored photo is invalid", 500)

        suffix = "jpg" if content_type == "image/jpeg" else "png"
        return send_file(
            BytesIO(content), mimetype=content_type,
            download_name=f"incident-photo.{suffix}",
            as_attachment=False, max_age=0,
        )
    except ValueError:
        return error("Stored photo information is invalid", 500)
    except OSError:
        app.logger.exception("Unable to read private report photo")
        return error("Could not read the photo on this computer", 500)


# CONFIRM REPORT RESOLUTION
# Let the reporting resident confirm an already resolved incident.
# This records confirmation without awarding points twice.
@app.post("/api/reports/<path:reference>/confirm")
@require_roles("ratepayer")
def confirm_report_resolution(reference):
    """Owner confirms an actually resolved report once; no browser-generated XP."""
    doc = find_report(reference)
    if not doc or not doc.exists:
        return error("Report not found", 404)
    data = doc.to_dict() or {}
    if data.get("userId") != g.principal["id"]:
        return error("Report not found", 404)
    # Residents can confirm resolution only after the municipal job is completed.
    if data.get("status") != "resolved":
        return error("Only resolved reports can be confirmed", 409)
    if data.get("resolutionConfirmed"):
        return jsonify({"status": "success", "alreadyConfirmed": True})
    # Avoid double-awarding XP by not awarding it here until an
    # idempotent Firestore gamification transaction is in place.
    try:
        doc.reference.update({"resolutionConfirmed": True, "confirmedAt": firestore.SERVER_TIMESTAMP})
        return jsonify({"status": "success"})
    except Exception:
        app.logger.exception("Could not confirm resolution")
        return error("Unable to confirm resolution", 500)



# NOTIFICATIONS LIST
# Load personal notices and notices addressed to the current user role.
# Combine the two sources without repeating the same notification.
@app.get("/api/notifications")
@require_roles("ratepayer", "admin", "technician")
def notifications_list():
    try:
        uid, role = g.principal["id"], g.principal["role"]
        personal = db.collection("notifications").where("userId", "==", uid).limit(100).stream()
        role_docs = db.collection("notifications").where("recipientRole", "==", role).limit(100).stream()
        # A notification might appear in both searches; keep one copy per ID.
        unique = {d.id: d for d in list(personal) + list(role_docs)}
        result = []
        for doc in unique.values():
            data = doc.to_dict() or {}
            if uid in (data.get("dismissedBy") or []):
                continue
            read_by = data.get("readBy") or []
            result.append({"id": doc.id,
                           "title": data.get("title", "Notification"),
                           "message": data.get("message", ""),
                           "reportRef": data.get("reportRef"),
                           "status": data.get("status"),
                           "isRead": bool(uid in read_by or (data.get("isRead", False) if data.get("userId") == uid else False)),
                           "timestamp": iso(data.get("timestamp"))})
        result.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
        return jsonify({"notifications": result})
    except Exception:
        app.logger.exception("Unable to fetch notifications")
        return error("Unable to fetch notifications", 500)



# READ NOTIFICATION
# Mark a notification as read only for the current account.
# A shared Admin announcement can have separate read states.
@app.patch("/api/notifications/<notification_id>/read")
@require_roles("ratepayer", "admin", "technician")
def read_notification(notification_id):
    doc = db.collection("notifications").document(notification_id)
    snap = doc.get()
    if not snap.exists:
        return error("Notification not found", 404)
    data = snap.to_dict() or {}
    uid, role = g.principal["id"], g.principal["role"]
    if data.get("userId") != uid and data.get("recipientRole") != role:
        return error("Notification not found", 404)
    # One shared notification can have independent read state per user.
    doc.update({"readBy": firestore.ArrayUnion([uid])})
    return jsonify({"status": "success"})



# DISMISS NOTIFICATION
# Hide a notification for one account rather than deleting it
# for all other administrators or users.
@app.delete("/api/notifications/<notification_id>")
@require_roles("ratepayer", "admin", "technician")
def dismiss_notification(notification_id):
    """Hide a notification from one account without deleting it for others."""
    ref = db.collection("notifications").document(notification_id)
    snap = ref.get()
    if not snap.exists:
        return error("Notification not found", 404)
    d = snap.to_dict() or {}
    uid, role = g.principal["id"], g.principal["role"]
    if d.get("userId") != uid and d.get("recipientRole") != role:
        return error("Notification not found", 404)
    ref.update({"dismissedBy": firestore.ArrayUnion([uid])})
    return jsonify({"status": "success"})


# -----------------------------------------------------------------------------
# Public alerts and live homepage statistics (only published alert data)
# -----------------------------------------------------------------------------

# PUBLIC STATISTICS
# Build public homepage counts from published alert records only.
# No private ratepayer reports are exposed through these statistics.
@app.get("/api/public/statistics")
def public_statistics():
    """Live homepage counts using records from Firestore (up to 500 alerts)."""
    try:
        sast = timezone(timedelta(hours=2), name="SAST")
        today = datetime.now(sast).date()
        active = []
        ended_today = 0
        # Scan published alerts and count those still active in South African time.
        for snapshot in safe_list_documents("alerts", 50):
            alert = snapshot.to_dict() or {}
            status = str(alert.get("status") or "").strip().lower()
            if alert.get("published") is True and status not in {"resolved", "closed"}:
                active.append(alert)
            ended_at = alert.get("endedAt")
            if (alert.get("published") is False and status == "resolved"
                    and isinstance(ended_at, datetime) and ended_at.tzinfo is not None
                    and ended_at.astimezone(sast).date() == today):
                ended_today += 1
        areas = {
            str(a.get("area") or a.get("location") or a.get("municipality") or "").strip().casefold()
            for a in active
        }
        areas.discard("")
        priority = sum(str(a.get("severity") or "").lower() in {"high", "critical"}
                       for a in active)
        return jsonify({"activeAlerts": len(active), "areasAffected": len(areas),
                        "highPriority": priority, "endedToday": ended_today})
    except Exception:
        app.logger.exception("Unable to calculate homepage statistics")
        return error("Live statistics unavailable", 500)


# -----------------------------------------------------------------------------
# Public incident locations: readable area names without exposing private homes
# -----------------------------------------------------------------------------
_LOCATION_UNKNOWN = {"", "unknown", "none", "not specified", "area not recorded",
                     "location not provided", "area not specified", "coordinates only"}



# PUBLIC PLACE NAME
# Clean a public place name and reject common unknown placeholders.
# Never treat a Firestore GeoPoint as a readable suburb name.
def public_place_name(value):
    """Return a meaningful plain-text area name, never a Firestore GeoPoint."""
    if not isinstance(value, str):
        return ""
    cleaned = " ".join(value.split()).strip()[:150]
    return cleaned if cleaned.casefold() not in _LOCATION_UNKNOWN else ""



# LOCATION ENRICHED ALERT
# Display the best *recorded* public locality for an alert.
# Use linked reports only for safe area fields, not private street addresses.
def location_enriched_alert(snapshot, report_cache=None):
    """Provide the best recorded public locality for an existing published alert.

    When the alert is missing its area, look at its linked incident report.
    Do not write to Firestore, reverse-geocode private pins, or expose full
    street/property addresses from the private resident report.
    """
    cache = report_cache if report_cache is not None else {}
    raw = snapshot.to_dict() or {}
    result = serialize_alert(snapshot)
    report_id = raw.get("reportId")
    source_report = {}

    # Older alerts sometimes have a saved report ID, but no readable area.
    # Only fetch linked report if alert is MISSING its area - saves 1 read per alert
has_area = public_place_name(raw.get("area")) or public_place_name(raw.get("municipality"))
if not has_area and isinstance(report_id, str) and report_id and len(report_id) <= 128:
        if report_id not in cache:
            try:
                source = db.collection("reports").document(report_id).get()
                cache[report_id] = source.to_dict() or {} if source.exists else {}
            except Exception:
                app.logger.exception("Could not read linked incident locality")
                cache[report_id] = {}
        source_report = cache[report_id]

    # Use area names that were actually entered in public alert or report.
    # Do not promote a private house address to a public alert.
    for field in ("province", "municipality", "area"):
        result[field] = (public_place_name(raw.get(field))
                         or public_place_name(source_report.get(field))
                         or "")

    # Some old alerts stored the suburb only in their public location field.
    # Retain that useful public place name when it does not resemble an exact
    # street number. Never pull a private address from the linked report.
    # Use an existing named public place, but never invent a suburb from a GPS pin.
    published_place = public_place_name(raw.get("location"))
    if published_place and published_place[0].isdigit():
        published_place = ""
    result["location"] = (result["area"] or result["municipality"]
                          or published_place or result["province"] or "")

    # Only say a pin exists if the alert or linked report really has one.
    geo = source_report.get("location")
    has_coordinates = (
        isinstance(raw.get("lat"), (int, float))
        and not isinstance(raw.get("lat"), bool)
        and isinstance(raw.get("lng"), (int, float))
        and not isinstance(raw.get("lng"), bool)
    ) or (hasattr(geo, "latitude") and hasattr(geo, "longitude"))
    if not result["location"]:
        result["location"] = (
            "Location pin recorded; locality not provided" if has_coordinates
            else "Locality not provided"
        )

    return result



# ADMIN ALERTS
# Load the full public-alert management list for Municipal Admin.
# Include active and already ended alerts so the history remains visible.
@app.get("/api/admin/alerts")
@require_roles("admin")
def admin_alerts():
    """Admins see published and ended alert records; the public cannot."""
    rows = []
    report_cache = {}
    for doc in safe_list_documents("alerts", 50):
        row = location_enriched_alert(doc, report_cache)
        raw = doc.to_dict() or {}
        row["published"] = raw.get("published") is True
        row["endedAt"] = iso(raw.get("endedAt"))
        rows.append(row)
    rows.sort(key=lambda a: a.get("reportedOn") or "", reverse=True)
    return jsonify({"alerts": rows})



# VERIFY AND SAVE A PUBLIC ALERT LOCATION
# Some older alerts have only a GPS pin, without a readable suburb.
# A logged-in Municipal Admin can save a VERIFIED public area after checking
# the incident details. Never publish a resident's private street address.
# This endpoint is called by AdminAlertLocations.jsx when Admin clicks Save.
@app.patch("/api/admin/alerts/<alert_id>/location")
@require_roles("admin")
def update_admin_alert_location(alert_id):
    """Save a checked suburb/area on an existing active public alert."""
    import re

    # Validate the submitted data instead of trusting a browser field.
    body = json_body()
    if not isinstance(body, dict):
        return error("A valid location update is required")
    if body.get("confirmedAgainstIncident") is not True:
        return error("Confirm the locality against incident information first")

    value = body.get("area")
    if not isinstance(value, str):
        return error("Enter a public suburb, ward or locality")
    area = " ".join(value.split())
    if not (2 <= len(area) <= 100) or not public_place_name(area):
        return error("Enter a valid public area (2-100 characters)")

    # Avoid revealing a precise residential location on the public alert.
    # Save only the wider suburb or ward, never a house or street address.
    if area[0].isdigit() or re.search(
        r"\b(street|avenue|drive|road|lane|crescent|boulevard)\b",
        area,
        flags=re.IGNORECASE,
    ):
        return error("Enter a suburb or public locality, not a street address")
    if area.casefold() in {
        "locality not provided", "location pin recorded; locality not provided",
        "map pin recorded; locality not provided",
    }:
        return error("Enter a verified locality, not a missing-location placeholder")

    # Only modify an existing active/published alert. Historical and private
    # records are not silently published or changed by this review panel.
    ref = db.collection("alerts").document(alert_id)
    try:
        snapshot = ref.get()
        if not snapshot.exists:
            return error("Public alert not found", 404)
        alert = snapshot.to_dict() or {}
        if alert.get("published") is not True or str(alert.get("status") or "").lower() in {"resolved", "closed"}:
            return error("Only active published alerts can have their area corrected", 409)

        # The location field is used by the public ticker and alerts pages.
        # Retain the exact GPS pin and all related report/ticket records.
        ref.update({
            "area": area,
            "location": area,
            "locationVerifiedByUid": g.principal["id"],
            "locationVerifiedAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
        audit_action("alert.public_location_verified", alert_id)
        return jsonify({"status": "success", "alertId": alert_id, "area": area})
    except Exception:
        app.logger.exception("Unable to save verified area for public alert")
        return error("Could not save the verified alert area", 500)



# PUBLIC ALERTS
# Serve only alerts that Municipal Admin has published.
# A report being submitted does not make it public automatically.
@app.get("/api/alerts")
def public_alerts():
    """Only administrator-published alerts are public; raw resident reports are not."""
    def _load():
        report_cache = {}
        rows = [location_enriched_alert(doc, report_cache)
                for doc in safe_list_documents("alerts")
                if (doc.to_dict() or {}).get("published") is True]
        rows.sort(key=lambda x: x.get("reportedOn") or "", reverse=True)
        return rows
    try:
        return jsonify({"alerts": get_cached_public("public_alerts", 60, _load)})
    except Exception:
        app.logger.exception("Unable to load alerts")
        return error("Unable to load alerts", 500)



# PUBLISH ALERT
# Publish a verified, unresolved incident for the public to see.
# Avoid duplicate alerts for different reports linked to one ticket.
@app.post("/api/alerts")
@require_roles("admin")
def publish_alert():
    data = json_body()
    if not isinstance(data, dict):
        return error("Valid JSON is required")
    report_id = str(data.get("reportId", "")).strip()
    if not report_id or len(report_id) > 128:
        return error("A valid Firestore report ID is required")
    report_snap = db.collection("reports").document(report_id).get()
    if not report_snap.exists:
        return error("Report not found", 404)
    report = report_snap.to_dict() or {}
    # Admin must verify an incident before publishing it to residents.
    if report.get("verification") != "verified":
        return error("Review and verify the report before publishing an alert", 409)
    if report.get("status") in {"resolved", "closed"}:
        return error("Cannot publish a resolved report", 409)
    title = str(data.get("title") or f"{TYPE_LABELS.get(report.get('type'), 'Municipal')} incident").strip()
    description = str(data.get("description") or report.get("description", "")).strip()
    if not title or not description or len(title) > 120 or len(description) > 500:
        return error("Provide a title (max 120) and description (max 500)")
    if report.get("ticketId"):
        existing = db.collection("alerts").where("ticketId", "==", report["ticketId"]).limit(1).stream()
    else:
        existing = db.collection("alerts").where("reportId", "==", report_id).limit(1).stream()
    # Two reports for the same ticket should not create duplicate public alerts.
    if next(existing, None):
        return error("An alert already exists for this incident or ticket", 409)
    location = report.get("location")
    utility = TYPE_LABELS.get(report.get("type"), "Municipal")
    severity = "Critical" if report.get("severity", 0) >= 9 else "High" if report.get("severity", 0) >= 7 else "Medium"
    ref = db.collection("alerts").document()
    ref.set({"reportId": report_id, "ticketId": report.get("ticketId"),
             "title": title, "description": description,
             "type": utility, "typeClass": "electricity" if utility in {"Electricity", "Streetlights", "Traffic Lights"} else "water" if utility in {"Water", "Sewerage", "Stormwater"} else "other",
             "severity": severity, "province": report.get("province", ""),
             "municipality": public_place_name(report.get("municipality")),
             "area": public_place_name(report.get("area")),
             # Do not copy a private resident street address into a public alert.
             "location": (public_place_name(report.get("area"))
                          or public_place_name(report.get("municipality"))
                          or public_place_name(report.get("province"))),
             "lat": location.latitude if hasattr(location, "latitude") else None,
             "lng": location.longitude if hasattr(location, "longitude") else None,
             "status": "Active", "verification": "Verified", "eta": "ETA pending",
             "published": True, "createdAt": firestore.SERVER_TIMESTAMP})
    audit_action("alert.published", ref.id, reportId=report_id)
    return jsonify({"status": "success", "alertId": ref.id}), 201



# EDIT ALERT
# End a public alert after its linked incident is resolved.
# Keep the record for history instead of deleting it from Firestore.
@app.patch("/api/alerts/<alert_id>")
@require_roles("admin")
def edit_alert(alert_id):
    """End a public alert only after its incident has been resolved."""
    ref = db.collection("alerts").document(alert_id)
    snapshot = ref.get()
    if not snapshot.exists:
        return error("Alert not found", 404)
    alert = snapshot.to_dict() or {}
    body = json_body()
    if not isinstance(body, dict):
        return error("A valid alert update is required")

    # Preserve the published-alert workflow already used by Admin.
    requested_status = body.get("status")
    requested_published = body.get("published")
    if requested_status == "Resolved" and requested_published is False:
        report = None
        ticket = None
        if alert.get("reportId"):
            snap = db.collection("reports").document(alert["reportId"]).get()
            report = snap.to_dict() if snap.exists else None
        if alert.get("ticketId"):
            snap = db.collection("tickets").document(alert["ticketId"]).get()
            ticket = snap.to_dict() if snap.exists else None
        # Only a resolved report or ticket can justify ending a public alert.
        if not any(str(x.get("status") or "").lower() in {"resolved", "closed"}
                   for x in (report, ticket) if isinstance(x, dict)):
            return error("Resolve the linked report or ticket before ending the alert", 409)
        if alert.get("published") is False and alert.get("status") == "Resolved":
            return jsonify({"status": "success", "alreadyEnded": True})
        ref.update({"published": False, "status": "Resolved",
                    "endedAt": firestore.SERVER_TIMESTAMP,
                    "endedByUid": g.principal["id"],
                    "updatedAt": firestore.SERVER_TIMESTAMP})
        audit_action("alert.ended", alert_id)
        return jsonify({"status": "success", "published": False, "alertStatus": "Resolved"})

    # Do not permit ending by unpublishing alone without checking resolution.
    if requested_published is False or requested_status == "Resolved":
        return error("Use Resolve & Remove Alert after the incident is resolved", 409)
    return error("No supported alert update requested")



# CREATE ENQUIRY
# Save a ratepayer's private municipal enquiry and notify Admin.
# Enquiries are separate from incident reports and public alerts.
@app.post("/api/enquiries")
@require_roles("ratepayer")
def create_enquiry():
    body = json_body() or {}
    message = str(body.get("message", "")).strip()
    if not (5 <= len(message) <= 200):
        return error("Enquiry must contain 5–200 characters")
    ref = db.collection("enquiries").document()
    ref.set({"userId": g.principal["id"], "message": message,
             "status": "new", "createdAt": firestore.SERVER_TIMESTAMP})
    notify_safely(None, "New Ratepayer Enquiry",
                  "A new municipal enquiry requires review.",
                  recipient_role="admin")
    return jsonify({"status": "success", "enquiryId": ref.id}), 201


# -----------------------------------------------------------------------------
# Private enquiries: Admin replies and ratepayer inbox
# -----------------------------------------------------------------------------

# LIST ENQUIRIES
# Allow Admin to read incoming enquiries and any replies already sent.
# The response includes the fields used by the enquiry dashboard.
@app.get("/api/enquiries")
@require_roles("admin")
def list_enquiries():
    """Admins can view submitted enquiries and the saved replies."""
    rows = []
    for doc in safe_list_documents("enquiries", 150):
        item = doc.to_dict() or {}
        rows.append({"id": doc.id, "message": item.get("message", ""),
                     "userId": item.get("userId"),
                     "status": item.get("status", "new"),
                     "reply": item.get("reply", ""),
                     "createdAt": iso(item.get("createdAt")),
                     "repliedAt": iso(item.get("repliedAt"))})
    rows.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return jsonify({"enquiries": rows})



# REVIEW ENQUIRY
# Let Admin mark an enquiry reviewed or send a final reply.
# An answered enquiry cannot be reopened or answered twice here.
@app.patch("/api/enquiries/<enquiry_id>")
@require_roles("admin")
def review_enquiry(enquiry_id):
    """Admins may mark as reviewed or answer with a written reply."""
    body = json_body()
    if not isinstance(body, dict):
        return error("Valid enquiry update is required")
    status = str(body.get("status") or "").strip().lower()
    if status not in {"reviewed", "answered"}:
        return error("Status must be reviewed or answered")
    ref = db.collection("enquiries").document(enquiry_id)
    snapshot = ref.get()
    if not snapshot.exists:
        return error("Enquiry not found", 404)
    enquiry = snapshot.to_dict() or {}
    if status == "answered":
        reply = body.get("reply")
        if not isinstance(reply, str) or not (5 <= len(reply.strip()) <= 1000):
            return error("Write a reply between 5 and 1000 characters")
        # Prevent accidental duplicate replies to the same resident enquiry.
        if str(enquiry.get("reply") or "").strip():
            return error("This enquiry has already been answered", 409)
        ref.update({"status": "answered", "reply": reply.strip(),
                    "repliedByUid": g.principal["id"],
                    "repliedAt": firestore.SERVER_TIMESTAMP,
                    "updatedAt": firestore.SERVER_TIMESTAMP})
        audit_action("enquiry.answered", enquiry_id)
        notify_safely(enquiry.get("userId"), "Municipal Enquiry Answered",
                      "The municipality replied to your enquiry. Open My Enquiries in your profile.")
    else:
        if enquiry.get("status") == "answered" or enquiry.get("reply"):
            return error("An answered enquiry cannot return to review", 409)
        ref.update({"status": "reviewed", "updatedAt": firestore.SERVER_TIMESTAMP})
        audit_action("enquiry.reviewed", enquiry_id)
    return jsonify({"status": "success"})



# MY ENQUIRIES
# Return only enquiries created by the signed-in resident.
# Show the Admin reply in the resident's My Enquiries page.
@app.get("/api/my/enquiries")
@require_roles("ratepayer")
def my_enquiries():
    """Return only enquiries owned by the authenticated Firebase ratepayer."""
    rows = []
    docs = (db.collection("enquiries")
            .where("userId", "==", g.principal["id"])
            .limit(100).stream())
    for doc in docs:
        item = doc.to_dict() or {}
        rows.append({"id": doc.id, "message": item.get("message", ""),
                     "status": item.get("status", "new"),
                     "reply": item.get("reply", ""),
                     "createdAt": iso(item.get("createdAt")),
                     "repliedAt": iso(item.get("repliedAt"))})
    rows.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return jsonify({"enquiries": rows})



# POST COMMENT
# Add a comment to a report owned by the signed-in ratepayer.
# Check the report reference and comment length before saving.
@app.post("/api/comments")
@require_roles("ratepayer")
def post_comment():
    data = json_body() or {}
    comment = str(data.get("comment", "")).strip()
    reference = str(data.get("reportId", ""))
    doc = find_report(reference) if reference else None
    if not doc or not doc.exists or (doc.to_dict() or {}).get("userId") != g.principal["id"]:
        return error("Report not found", 404)
    if not comment or len(comment) > 1000:
        return error("Comment must be 1–1000 characters")
    add_comment(g.principal["id"], doc.id, comment)
    return jsonify({"status": "success"})



# LEADERBOARD
# Return the leaderboard for one zone to an authenticated user.
# The leaderboard logic itself is implemented in its own module.
@app.get("/api/leaderboard/<zone>")
@require_roles("ratepayer", "admin", "technician")
def leaderboard(zone):
    return jsonify({"entries": get_zone_leaderboard(zone)})



# CHECK USER BADGES
# Recalculate badges for the authenticated resident.
# This route delegates gamification rules to the badges module.
@app.post("/api/badges/check")
@require_roles("ratepayer")
def check_user_badges():
    return jsonify({"new_badges": check_badges(g.principal["id"])})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
