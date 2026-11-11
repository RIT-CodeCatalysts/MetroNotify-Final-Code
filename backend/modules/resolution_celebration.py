import sys
sys.path.append(".")
from config.firebase_init import db
from firebase_admin import firestore
from modules.gamification import award_xp

def trigger_resolution_celebration(ticket_id):
    ticket_ref = db.collection("tickets").document(ticket_id)
    ticket = ticket_ref.get().to_dict()

    if not ticket:
        print(f"Ticket {ticket_id} not found")
        return

    report_ids = ticket.get("reportIds", [])
    issue_type = ticket.get("type", "issue")
    total_reports = len(report_ids)

    type_labels = {
        "power_outage": "power outage",
        "water_leak": "water leak",
        "pothole": "road damage",
        "sewage": "sewage issue"
    }
    label = type_labels.get(issue_type, "infrastructure issue")

    print(f"Resolving ticket: {ticket_id}")
    print(f"Issue type: {label}")
    print(f"Total reports: {total_reports}")

    notified_users = set()

    for report_id in report_ids:
        report = db.collection("reports").document(report_id).get().to_dict()

        if not report:
            continue

        user_id = report.get("userId")

        if user_id and user_id not in notified_users:
            #Sending a notification to user once report is resolved
            db.collection("notifications").add({
                "userId": user_id,
                "message": (
                    f"The {label} you reported has been resolved! "
                    f"Your report was part of {total_reports} citizen "
                    f"report(s) that helped fix this issue. Thank you! +10 XP"
                ),
                "type": "resolution_celebration",
                "isRead": False,
                "timestamp": firestore.SERVER_TIMESTAMP
            })

            award_xp(user_id, 10, reason="issue_resolved")

            db.collection("users").document(user_id).update({
                "verifiedReports": firestore.Increment(1)
            })

            notified_users.add(user_id)
            print(f"Notified user: {user_id}")

    #Marking all linked reports as resolved
    for report_id in report_ids:
        db.collection("reports").document(report_id).update({
            "status": "resolved"
        })

    #Closing the ticket
    ticket_ref.update({
        "status": "closed",
        "resolvedAt": firestore.SERVER_TIMESTAMP
    })

    print(f"Ticket closed")
    print(f"Total users notified: {len(notified_users)}")


#Testing
TEST_TICKET_ID = "f1eKRyBRhw8GpD1W8Q14"

#trigger_resolution_celebration(TEST_TICKET_ID)