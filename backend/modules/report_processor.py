"""Validate, save and register municipal service reports in MetroNotify.

A report is saved first, then linked to a municipal ticket. The Admin reviews
reports and approves technician assignments in the separate dispatch workflow.
"""

import logging
import math
from datetime import datetime, timezone

from firebase_admin import firestore

from config.firebase_init import db
from modules.badges import check_badges
from modules.duplicate_detector import check_duplicate
from modules.gamification import XP_REWARDS, award_xp
from modules.leaderboard_manager import update_leaderboard
from modules.notifications import create_notification
from modules.statistics import update_statistics
from modules.streak_manager import update_streak
from modules.ticket_manager import assign_to_ticket

logger = logging.getLogger(__name__)


# -----------------------------------------------------------------------------
# 1. VALIDATE THE REPORT SENT BY THE RATEPAYER
# -----------------------------------------------------------------------------

def validate_report(data):
    """Reject incomplete reports before saving anything to Firestore."""

    if not isinstance(data, dict):
        raise ValueError("Report data must be a JSON object")

    # Every report needs a category, description, GPS location and user ID.
    # The protected Flask endpoint supplies the real user ID from Firebase Auth.
    required_fields = ["type", "description", "lat", "lng", "userId"]
    for field in required_fields:
        if field not in data or data[field] is None:
            raise ValueError(f"Missing required field: {field}")

    # All ten municipal categories are supported, including "other".
    # "Other" can be reviewed for Civil technician coverage later by Admin.
    # This function does NOT assign a technician automatically.
    valid_types = [
        "power_outage",
        "water_leak",
        "pothole",
        "sewage",
        "vandalism",
        "streetlights",
        "waste_refuse",
        "stormwater",
        "traffic_lights",
        "other",
    ]

    if data["type"] not in valid_types:
        raise ValueError(f"Invalid report type: {data['type']}")

    # Keep the incident description readable and within the database limit.
    if not isinstance(data["description"], str) or not data["description"].strip():
        raise ValueError("Description cannot be empty")
    if len(data["description"]) > 500:
        raise ValueError("Description must not exceed 500 characters")

    if not isinstance(data["userId"], str) or not data["userId"].strip():
        raise ValueError("User ID cannot be empty")
    if len(data["userId"]) > 128:
        raise ValueError("User ID is too long")

    # Latitude and longitude must be real, finite numbers (not text or booleans).
    for field in ["lat", "lng"]:
        value = data[field]
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            raise ValueError(f"{field} must be a valid number")

    if not -90 <= float(data["lat"]) <= 90:
        raise ValueError("Latitude must be between -90 and 90")
    if not -180 <= float(data["lng"]) <= 180:
        raise ValueError("Longitude must be between -180 and 180")

    # A supporting photo is optional. This checks only a supplied Cloudinary URL;
    # the separate private Firebase Storage photo upload route is handled in app.py.
    image_url = data.get("imageUrl")
    if image_url is not None:
        if not isinstance(image_url, str):
            raise ValueError("imageUrl must be a string")
        if not image_url.startswith("https://res.cloudinary.com/"):
            raise ValueError("imageUrl must be a valid Cloudinary URL")

    return True


# -----------------------------------------------------------------------------
# 2. TURN GPS COORDINATES INTO A GEOHASH
# -----------------------------------------------------------------------------

def encode_geohash(lat, lng, precision=6):
    """Encode GPS coordinates into a standard geohash using only Python.

    MetroNotify uses a six-character geohash to group nearby incidents.
    We implement the standard Base32 algorithm here instead of importing
    pygeohash, whose compiled Windows DLL is blocked by Application Control.
    This keeps the same geohash format used by existing Firestore reports.
    """

    # Each character represents five binary decisions about the location.
    alphabet = "0123456789bcdefghjkmnpqrstuvwxyz"

    # Start with the full geographic coordinate ranges.
    latitude_range = [-90.0, 90.0]
    longitude_range = [-180.0, 180.0]

    # Geohash interleaves longitude and latitude, starting with longitude.
    use_longitude = True
    bits_in_character = 0
    character_value = 0
    characters = []

    # Five bits form one character. Six characters are used by default.
    while len(characters) < precision:
        if use_longitude:
            current_range = longitude_range
            coordinate = float(lng)
        else:
            current_range = latitude_range
            coordinate = float(lat)

        midpoint = (current_range[0] + current_range[1]) / 2.0

        # Shift the previous bits left to make room for the next decision.
        character_value <<= 1
        if coordinate >= midpoint:
            character_value |= 1
            current_range[0] = midpoint
        else:
            current_range[1] = midpoint

        use_longitude = not use_longitude
        bits_in_character += 1

        # Convert each completed group of five bits to a Base32 letter.
        if bits_in_character == 5:
            characters.append(alphabet[character_value])
            character_value = 0
            bits_in_character = 0

    return "".join(characters)


# -----------------------------------------------------------------------------
# 3. CALCULATE THE PRIORITY OF A NEW REPORT
# -----------------------------------------------------------------------------

def calculate_severity(report_type, upvotes, hour_of_day):
    """Calculate a severity score between 0 and 10."""

    # Higher starting scores represent services that may be more urgent.
    # "Other" starts at a moderate score until Municipal Admin reviews it.
    base_scores = {
        "power_outage": 8,
        "water_leak": 7,
        "sewage": 7,
        "pothole": 4,
        "vandalism": 5,
        "streetlights": 6,
        "waste_refuse": 4,
        "stormwater": 7,
        "traffic_lights": 7,
        "other": 5,
    }

    score = base_scores.get(report_type, 5)

    # More community upvotes can raise urgency by up to two points.
    score += min(upvotes * 0.3, 2)

    # Preserve the project's existing night-time priority rule.
    if hour_of_day >= 20 or hour_of_day <= 5:
        score += 1

    return min(round(score, 1), 10)


# -----------------------------------------------------------------------------
# 4. RUN OPTIONAL FEATURES WITHOUT LOSING A SAVED REPORT
# -----------------------------------------------------------------------------

def run_optional_step(name, func, *args, **kwargs):
    """Log a supporting-feature error rather than failing a saved report."""

    try:
        return func(*args, **kwargs)
    except Exception:
        logger.exception("MetroNotify step failed: %s", name)
        return None


# -----------------------------------------------------------------------------
# 5. PROCESS A NEW REPORT FROM START TO FINISH
# -----------------------------------------------------------------------------

def process_report(data):
    """Save one report and start its municipal review workflow."""

    try:
        # STEP 1: Validate data before doing any Firestore writes.
        validate_report(data)
        lat = float(data["lat"])
        lng = float(data["lng"])

        # STEP 2: Build a geohash from the reported incident location.
        geohash = encode_geohash(lat, lng)

        # STEP 3: Look for a nearby report of the same service problem.
        # The new resident still receives a separate report reference.
        duplicate_id = check_duplicate(geohash, data["type"])
        is_duplicate = bool(duplicate_id)

        # STEP 4: Calculate urgency and allow an extra safety-hazard increase.
        severity = calculate_severity(
            data["type"],
            0,
            datetime.now(timezone.utc).hour,
        )
        if data.get("isSafetyHazard") is True:
            severity = min(10, severity + 2)

        # STEP 5: Create a unique Firestore document ID and report reference.
        report_ref = db.collection("reports").document()
        report_id = report_ref.id
        reference_number = f"MN-{report_id}"

        # STEP 6: Save the private incident report to Firebase Firestore.
        # Reports start as "assessing" with verification still "pending".
        # Admin must review a report before approving a technician or alert.
        report_ref.set({
            "referenceNumber": reference_number,
            "type": data["type"],
            "description": data["description"].strip(),
            "location": firestore.GeoPoint(lat, lng),
            "geohash": geohash,
            "status": "assessing",
            "userId": data["userId"],
            "severity": severity,
            "upvotes": 0,
            "isDuplicate": is_duplicate,
            "relatedReportId": duplicate_id,
            "verification": "pending",

            # Public locality fields can be used to display broad alert areas.
            # The exact address remains part of the private incident report.
            "province": str(data.get("province") or "")[:120],
            "municipality": str(data.get("municipality") or "")[:120],
            "area": str(data.get("area") or "")[:120],
            "address": str(data.get("address") or "")[:250],
            "affectedArea": str(data.get("affectedArea") or "")[:80],

            "isSafetyHazard": data.get("isSafetyHazard") is True,
            "ticketId": None,
            "firstReporterBonusAwarded": False,
            "imageUrl": data.get("imageUrl"),
            "timestamp": firestore.SERVER_TIMESTAMP,
        })

        logger.info("Saved report %s (%s)", report_id, reference_number)

        # STEP 7: Create or link a ticket for the reported service problem.
        # Similar reports may point to the same municipal ticket.
        # This is NOT a technician assignment; Admin makes that decision.
        # If linking fails, the saved report remains available for review.
        ticket_id = run_optional_step(
            "Ticket linking",
            assign_to_ticket,
            report_id,
            geohash,
            data["type"],
            severity,
        )

        if not ticket_id:
            logger.warning("Report %s saved without a linked ticket", report_id)

        # STEP 8: Prepare readable service names for user notifications.
        issue_names = {
            "power_outage": "electricity outage",
            "water_leak": "water leak",
            "pothole": "pothole",
            "sewage": "sewerage",
            "vandalism": "vandalism",
            "streetlights": "streetlight fault",
            "waste_refuse": "waste/refuse issue",
            "stormwater": "stormwater issue",
            "traffic_lights": "traffic light fault",
            "other": "municipal service issue",
        }
        issue_name = issue_names[data["type"]]

        # STEP 9: Tell the ratepayer that the submission was received.
        run_optional_step(
            "Ratepayer notification",
            create_notification,
            data["userId"],
            "Report Submitted Successfully",
            (
                f"Your {issue_name} report has been received. "
                f"Your reference number is {reference_number}."
            ),
            report_ref=reference_number,
            status="assessing",
        )

        # STEP 10: Notify Municipal Admin so the report can be reviewed.
        run_optional_step(
            "Admin notification",
            create_notification,
            None,
            "New Municipal Report",
            (
                f"New {issue_name} report awaiting review. "
                f"Reference: {reference_number}."
            ),
            recipient_role="admin",
            report_ref=reference_number,
            status="assessing",
        )

        # STEP 11: Set the resident's primary zone if it is still unknown.
        # This is used by the project's leaderboard feature.
        def update_zone():
            user_doc = db.collection("users").document(data["userId"])
            snapshot = user_doc.get()
            if snapshot.exists:
                profile = snapshot.to_dict() or {}
                if profile.get("primaryZone") in (None, "", "unknown"):
                    user_doc.update({"primaryZone": geohash})

        run_optional_step("Leaderboard zone", update_zone)

        # STEP 12: Award points only for reports that are not duplicates.
        # Badge, streak and leaderboard failures will not undo a saved report.
        xp = XP_REWARDS["new_report"] if not is_duplicate else 0
        if not is_duplicate:
            run_optional_step("XP", award_xp, data["userId"], xp, reason="new_report")
            run_optional_step("Streak", update_streak, data["userId"])
            run_optional_step("Statistics", update_statistics, data["userId"], data["type"])
            run_optional_step("Badges", check_badges, data["userId"])
            run_optional_step("Leaderboard", update_leaderboard, data["userId"], xp)

        # STEP 13: Send a result to Flask and then back to the React frontend.
        return {
            "status": "success",
            "reportId": report_id,
            "referenceNumber": reference_number,
            "ticketId": ticket_id,
            "isDuplicate": is_duplicate,
            "reportStatus": "assessing",
            "message": (
                "Report submitted successfully"
                if ticket_id
                else "Report saved, but ticket linking needs review"
            ),
        }

    except ValueError as error:
        # Validation errors can safely be shown to the ratepayer.
        return {"status": "error", "message": str(error)}

    except Exception:
        # Log unexpected server errors without exposing internal details.
        logger.exception("Failed to process municipal report")
        return {
            "status": "error",
            "message": "Unable to process report right now",
        }
