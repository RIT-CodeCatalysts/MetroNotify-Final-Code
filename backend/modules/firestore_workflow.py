"""Shared Firestore workflow for the MetroNotify municipal service system.

This module provides reusable functions for Flask to:
1. Convert Firestore documents into JSON-friendly data for React.
2. Match municipal service types with technician specialisations.
3. Assign verified service tickets to available technicians.
4. Update jobs when technicians start or finish their work.
5. Notify residents and assigned technicians of important changes.

"""

import logging

from firebase_admin import firestore

from config.firebase_init import db
from modules.notifications import create_notification

# Use the application's normal logger for notification and alert errors.
log = logging.getLogger(__name__)


# -----------------------------------------------------------------------------
# 1. SERVICE NAMES SHOWN TO USERS
# -----------------------------------------------------------------------------
# Firestore stores short service identifiers; React displays readable labels.
# These keys must agree with the type mapping in frontend/src/services/api.js.
TYPE_LABELS = {
    "power_outage": "Electricity",
    "water_leak": "Water",
    "sewage": "Sewerage",
    "pothole": "Potholes",
    "vandalism": "Vandalism",
    "streetlights": "Streetlights",
    "waste_refuse": "Waste / Refuse",
    "stormwater": "Stormwater",
    "traffic_lights": "Traffic Lights",
    "other": "Other",
}


# -----------------------------------------------------------------------------
# 2. TECHNICIAN SPECIALISATION RULES
# -----------------------------------------------------------------------------
# This dictionary is also checked by the backend during ticket assignment.
# Civil is an allowed fallback for sewerage, potholes, stormwater and Other.
# A match is only an option for Admin, NOT an automatic assignment.
TYPE_SPECIALIZATIONS = {
    "power_outage": {"electrical", "electricity"},
    "streetlights": {"electrical", "electricity"},
    "water_leak": {"plumbing", "water", "sanitation"},
    "sewage": {"plumbing", "sanitation", "sewage", "sewerage", "civil"},
    "pothole": {"civil", "roads", "road", "potholes"},
    "stormwater": {"civil", "roads", "stormwater"},
    "traffic_lights": {"traffic", "traffic signals", "electrical"},
    "waste_refuse": {"waste", "refuse", "sanitation"},
    "vandalism": {"security", "general"},
    "other": {"general", "civil"},
}


# -----------------------------------------------------------------------------
# 3. CONVERT FIRESTORE TIMESTAMPS
# -----------------------------------------------------------------------------
def iso(value):
    """Convert a Firestore datetime to an ISO string for React, if present."""
    return value.isoformat() if hasattr(value, "isoformat") else None


# -----------------------------------------------------------------------------
# 4. SERIALISE A MUNICIPAL INCIDENT REPORT
# -----------------------------------------------------------------------------
def serialize_report(snapshot):
    """Convert a report snapshot to the fields used by React dashboards.

    Private photo bytes never go into the API's report list. The API returns
    only a boolean so Admin can decide whether to show 'View Incident Photo'.
    Flask checks authorisation again when someone actually opens the image.
    """
    data = snapshot.to_dict() or {}

    # The report processor stores its incident pin as a Firestore GeoPoint.
    # Convert it to plain latitude/longitude numbers for JSON responses.
    loc = data.get("location")
    coordinates = (
        {"lat": loc.latitude, "lng": loc.longitude}
        if hasattr(loc, "latitude") and hasattr(loc, "longitude")
        else None
    )

    # The local-storage Flask upload route writes these two fields:
    #   photoStorageType = 'local'
    #   photoAvailable = True
    # Do not use photoStoragePath: that was the OLD Firebase Storage design.
    # A legacy cloud path does not mean an image exists on this laptop.
    photo_available = (
        data.get("photoStorageType") == "local"
        and data.get("photoAvailable") is True
    )

    return {
        "id": snapshot.id,
        "referenceNumber": data.get("referenceNumber") or f"MN-{snapshot.id}",
        "type": data.get("type", ""),
        "utility": TYPE_LABELS.get(data.get("type"), data.get("type", "Other")),
        "description": data.get("description", ""),
        "status": data.get("status", "assessing"),
        "verification": data.get("verification", "pending"),
        "severity": data.get("severity"),
        "userId": data.get("userId"),
        "location": coordinates,
        "province": data.get("province", ""),
        "municipality": data.get("municipality", ""),
        "area": data.get("area", ""),
        "address": data.get("address", ""),
        "affectedArea": data.get("affectedArea", ""),
        "isSafetyHazard": data.get("isSafetyHazard", False),
        "resolutionConfirmed": bool(data.get("resolutionConfirmed", False)),
        # Only a flag is exposed, never a local disk path or a public URL.
        "photoAvailable": photo_available,
        "ticketId": data.get("ticketId"),
        "timestamp": iso(data.get("timestamp")),
        "updatedAt": iso(data.get("updatedAt")),
    }


# -----------------------------------------------------------------------------
# 5. SERIALISE A TECHNICIAN JOB / TICKET
# -----------------------------------------------------------------------------
def serialize_ticket(snapshot):
    """Return the ticket details needed by Admin and assigned technicians."""
    data = snapshot.to_dict() or {}
    return {
        "id": snapshot.id,
        "type": data.get("type", ""),
        "status": data.get("status", "open"),
        "priority": data.get("priority", 0),
        "assignedTech": data.get("assignedTech"),
        "assignedTechName": data.get("assignedTechName", ""),
        "reportIds": data.get("reportIds", []),
        "createdAt": iso(data.get("createdAt")),
    }


# -----------------------------------------------------------------------------
# 6. SEND NOTIFICATIONS SAFELY
# -----------------------------------------------------------------------------
def notify_safely(user_id, title, message, **kwargs):
    """Send a notification without undoing a successfully saved action."""
    try:
        create_notification(user_id, title, message, **kwargs)
    except Exception:
        # A notification error must not reverse a valid ticket assignment.
        log.exception("Notification failed: %s", title)


# -----------------------------------------------------------------------------
# 7. READ ALL REPORTS ATTACHED TO A TICKET
# -----------------------------------------------------------------------------
def _ticket_reports(transaction, ticket):
    """Read linked reports before any writes in a Firestore transaction."""
    ids = ticket.get("reportIds", [])
    return [
        (
            rid,
            db.collection("reports").document(rid),
            db.collection("reports").document(rid).get(transaction=transaction),
        )
        for rid in ids
    ]


# -----------------------------------------------------------------------------
# 8. ASSIGN A VERIFIED TICKET TO ONE TECHNICIAN
# -----------------------------------------------------------------------------
@firestore.transactional
def _assign_transaction(transaction, ticket_ref, technician_ref):
    """Atomically assign a ticket after checking availability and eligibility.

    Firestore transactions protect against two Admins assigning the same ticket
    or assigning a technician who is no longer available.
    """
    ticket_snap = ticket_ref.get(transaction=transaction)
    tech_snap = technician_ref.get(transaction=transaction)

    if not ticket_snap.exists or not tech_snap.exists:
        raise ValueError("Ticket or technician not found")

    ticket = ticket_snap.to_dict() or {}
    technician = tech_snap.to_dict() or {}

    # Do not reassign closed, busy or already-assigned tickets.
    if ticket.get("status") not in ("open", "assessing") or ticket.get("assignedTech"):
        raise ValueError("Ticket is not open for assignment")

    if technician.get("isAvailable") is not True:
        raise ValueError("Technician is not currently available")

    # Technicians must be linked to a real Firebase Authentication account.
    if not technician.get("authUid"):
        raise ValueError("This technician needs a Firebase login before assignment")

    specialty = str(technician.get("specialization", "")).lower().strip()
    if specialty not in TYPE_SPECIALIZATIONS.get(ticket.get("type"), set()):
        raise ValueError("Technician specialisation does not match ticket type")

    reports = _ticket_reports(transaction, ticket)

    # Admin must review at least one report before dispatching technicians.
    if not any(
        snap.exists and (snap.to_dict() or {}).get("verification") == "verified"
        for _, _, snap in reports
    ):
        raise ValueError("Review at least one report before assigning its ticket")

    # Update the job and technician together, then all its linked reports.
    transaction.update(ticket_ref, {
        "status": "assigned",
        "assignedTech": technician_ref.id,
        "assignedTechName": technician.get("name", ""),
        "assignedAt": firestore.SERVER_TIMESTAMP,
    })
    transaction.update(technician_ref, {
        "isAvailable": False,
        "assignedTickets": firestore.ArrayUnion([ticket_ref.id]),
    })

    for _, ref, snap in reports:
        if snap.exists:
            transaction.update(ref, {
                "status": "assigned",
                "assignedTech": technician_ref.id,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            })

    return ticket, technician, [
        (rid, snap.to_dict() or {})
        for rid, _, snap in reports
        if snap.exists
    ]


def assign_technician(ticket_id, technician_id):
    """Assign a ticket after Admin submits an approved technician choice."""
    result = _assign_transaction(
        db.transaction(),
        db.collection("tickets").document(ticket_id),
        db.collection("technicians").document(technician_id),
    )

    ticket, technician, reports = result
    name = technician.get("name", "Technician")

    # Inform the selected technician using their linked Firebase Auth UID.
    if technician.get("authUid"):
        notify_safely(
            technician["authUid"],
            "New Assigned Job",
            f"A {TYPE_LABELS.get(ticket.get('type'), 'municipal')} job was assigned to you.",
            status="assigned",
        )

    # Each ratepayer whose report belongs to the job gets a notification.
    for rid, report in reports:
        ref = report.get("referenceNumber", f"MN-{rid}")
        if report.get("userId"):
            notify_safely(
                report["userId"],
                "Technician Assigned",
                f"Your report {ref} has been assigned to {name}.",
                report_ref=ref,
                status="assigned",
            )

    return name


# -----------------------------------------------------------------------------
# 9. UPDATE A TECHNICIAN'S JOB STATUS
# -----------------------------------------------------------------------------
@firestore.transactional
def _update_status_transaction(transaction, ticket_ref, new_status):
    """Save only allowed status changes; keep linked reports in sync."""
    ticket_snap = ticket_ref.get(transaction=transaction)
    if not ticket_snap.exists:
        raise ValueError("Ticket not found")

    ticket = ticket_snap.to_dict() or {}
    old_status = ticket.get("status")

    # Legal sequence: assigned -> in progress -> resolved.
    if (old_status, new_status) not in {
        ("assigned", "in_progress"),
        ("in_progress", "resolved"),
    }:
        raise ValueError(
            "Invalid status transition. Start the assigned job before resolving it"
        )

    if not ticket.get("assignedTech"):
        raise ValueError("Ticket has no assigned technician")

    reports = _ticket_reports(transaction, ticket)
    tech_ref = db.collection("technicians").document(ticket["assignedTech"])
    tech_snap = tech_ref.get(transaction=transaction)

    updates = {
        "status": new_status,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    if new_status == "resolved":
        updates["resolvedAt"] = firestore.SERVER_TIMESTAMP

    transaction.update(ticket_ref, updates)

    # Every related incident report should display the ticket's real status.
    for rid, ref, snap in reports:
        if snap.exists:
            transaction.update(ref, {
                "status": new_status,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            })

    # When work is completed, the assigned technician becomes available again.
    if new_status == "resolved" and tech_snap.exists:
        transaction.update(tech_ref, {
            "isAvailable": True,
            "assignedTickets": firestore.ArrayRemove([ticket_ref.id]),
        })

    return [
        (rid, snap.to_dict() or {})
        for rid, _, snap in reports
        if snap.exists
    ]


def update_ticket_status(ticket_id, new_status):
    """Finish a status transition and notify the affected residents."""
    if new_status not in {"in_progress", "resolved"}:
        raise ValueError("Unsupported technician status")

    reports = _update_status_transaction(
        db.transaction(),
        db.collection("tickets").document(ticket_id),
        new_status,
    )

    label = "In Progress" if new_status == "in_progress" else "Resolved"

    # Notify each resident whose report was connected to this job.
    for rid, report in reports:
        ref = report.get("referenceNumber", f"MN-{rid}")
        if report.get("userId"):
            notify_safely(
                report["userId"],
                f"Report {label}",
                f"Your report {ref} is now {label.lower()}.",
                report_ref=ref,
                status=new_status,
            )

    if new_status == "resolved":
        # Ending a job also marks its existing published alert as Resolved.
        # If the alert update fails, the completed ticket remains completed.
        try:
            for doc in db.collection("alerts").limit(150).stream():
                alert = doc.to_dict() or {}
                if alert.get("ticketId") == ticket_id and alert.get("published"):
                    doc.reference.update({
                        "status": "Resolved",
                        "updatedAt": firestore.SERVER_TIMESTAMP,
                    })
        except Exception:
            log.exception("Ticket resolved but related alert update failed")

    return label


# -----------------------------------------------------------------------------
# 10. FIND A REPORT BY ITS PUBLIC REFERENCE
# -----------------------------------------------------------------------------
def find_report(reference):
    """Find a report by an MN- document ID or a stored legacy reference."""
    if reference.startswith("MN-"):
        snap = db.collection("reports").document(reference[3:]).get()
        if snap.exists and (snap.to_dict() or {}).get("referenceNumber") in (
            None, reference
        ):
            return snap

    matches = (
        db.collection("reports")
        .where("referenceNumber", "==", reference)
        .limit(1)
        .stream()
    )
    return next(matches, None)


# -----------------------------------------------------------------------------
# 11. SERIALISE A PUBLISHED MUNICIPAL ALERT
# -----------------------------------------------------------------------------
def serialize_alert(snapshot):
    """Convert an alert record to the public and Admin display fields."""
    a = snapshot.to_dict() or {}
    return {
        "id": snapshot.id,
        "reportId": a.get("reportId"),
        "ticketId": a.get("ticketId"),
        "type": a.get("type", "Municipal"),
        "typeClass": a.get("typeClass", "other"),
        "stripe": a.get("typeClass", "other"),
        "title": a.get("title", "Municipal service alert"),
        "description": a.get("description", ""),
        "province": a.get("province", ""),
        "municipality": a.get("municipality", ""),
        "area": a.get("area", ""),
        "location": a.get("location", a.get("area", "")),
        "lat": a.get("lat"),
        "lng": a.get("lng"),
        "severity": a.get("severity", "Medium"),
        "severityClass": str(a.get("severity", "Medium")).lower(),
        "status": a.get("status", "Active"),
        "verification": a.get("verification", "Verified"),
        "eta": a.get("eta", "ETA pending"),
        "time": a.get("time", "Recently"),
        "reportedOn": iso(a.get("createdAt")) or "",
    }
