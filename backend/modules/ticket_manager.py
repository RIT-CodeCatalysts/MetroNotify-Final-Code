
"""Manage municipal tickets created from resident reports."""

from config.firebase_init import db
from firebase_admin import firestore


ACTIVE_TICKET_STATUSES = {
    "open",
    "assigned",
    "in_progress"
}


def find_existing_ticket(geohash, report_type):
    """
    Find an active ticket for the same type of
    service problem in the same location area.
    """

    matches = (
        db.collection("tickets")
        .where("geohash", "==", geohash)
        .stream()
    )

    for doc in matches:
        ticket = doc.to_dict() or {}

        if (
            ticket.get("type") == report_type
            and ticket.get("status") in ACTIVE_TICKET_STATUSES
        ):
            return doc.id

    return None


def assign_to_ticket(report_id, geohash, report_type, severity):
    """
    Link a report to an existing active ticket
    or create a new ticket.

    The Municipal Admin will assign the technician later.
    """

    report_ref = (
        db.collection("reports").document(report_id)
    )

    report_snapshot = report_ref.get()

    if not report_snapshot.exists:
        raise ValueError(
            "Cannot create ticket: report does not exist"
        )

    report = report_snapshot.to_dict() or {}

    # Avoid creating another ticket for a report
    # that is already linked to an existing ticket.
    current_ticket_id = report.get("ticketId")

    if current_ticket_id:
        current_ticket = (
            db.collection("tickets")
            .document(current_ticket_id)
        )

        if current_ticket.get().exists:
            return current_ticket_id

    # Look for another active ticket in the area.
    ticket_id = find_existing_ticket(
        geohash,
        report_type
    )

    batch = db.batch()

    if ticket_id:
        # Add this report to the existing job.
        ticket_ref = (
            db.collection("tickets").document(ticket_id)
        )

        batch.update(ticket_ref, {
            "reportIds": firestore.ArrayUnion([report_id]),
            "priority": firestore.Increment(0.5)
        })

    else:
        # Create a new job awaiting Admin assignment.
        ticket_ref = db.collection("tickets").document()
        ticket_id = ticket_ref.id

        batch.set(ticket_ref, {
            "type": report_type,
            "reportIds": [report_id],
            "geohash": geohash,
            "priority": severity,
            "status": "open",
            "assignedTech": None,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "resolvedAt": None
        })

    # Update the report and ticket together.
    batch.update(report_ref, {
        "ticketId": ticket_id
    })

    batch.commit()

    print(
        f"Report {report_id} linked to ticket {ticket_id}"
    )

    return ticket_id
