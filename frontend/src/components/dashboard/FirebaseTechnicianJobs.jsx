
/**
 * METRONOTIFY - FIREBASE TECHNICIAN JOBS
 *
 * This component displays municipal jobs assigned to a technician.
 *
 * Main features:
 * 1. Retrieve the technician's assigned tickets from Flask.
 * 2. Show incident descriptions and full incident locations.
 * 3. Let technicians view private incident photos.
 * 4. Open the incident location in Google Maps.
 * 5. Allow technicians to start and resolve their assigned jobs.
 * 6. Display a read-only team job overview.
 *
 * SECURITY:
 * Flask checks the technician's Firebase Authentication token.
 * Only tickets assigned to that technician are returned with
 * private resident information.
 *
 * The team overview does not display private incident addresses
 * or resident descriptions.
 */

import { useCallback, useEffect, useState } from "react";

import {
  apiRequest,
  toDisplayStatus,
  viewReportPhoto
} from "../../services/api";

import { statusBadgeClass } from "../../data/reportStatus";


/**
 * BUILD GOOGLE MAPS LINK
 *
 * Use the incident GPS coordinates when available.
 *
 * If coordinates are unavailable, Google Maps can search
 * using the incident's recorded address information.
 *
 * Never substitute the ratepayer's billing address.
 */
function getIncidentMapUrl(report) {

  const latitude = report.location?.lat;
  const longitude = report.location?.lng;

  // Check that GPS coordinates are valid numbers.
  const hasValidCoordinates =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  if (hasValidCoordinates) {

    // The map opens the exact incident pin selected by the ratepayer.
    return (
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(`${latitude},${longitude}`)
    );
  }

  // Fall back to the recorded incident address.
  const address = [
    report.address,
    report.area,
    report.municipality,
    report.province
  ]
    .filter(Boolean)
    .join(", ");

  if (!address.trim()) {
    return null;
  }

  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(address)
  );
}


/**
 * FIREBASE TECHNICIAN JOBS COMPONENT
 *
 * Loads real municipal jobs from Firestore through Flask.
 */
export default function FirebaseTechnicianJobs() {

  // --------------------------------------------------
  // 1. COMPONENT STATE
  // --------------------------------------------------

  // Tickets assigned to the current technician.
  const [tickets, setTickets] = useState([]);

  // General team progress without private resident details.
  const [teamOverview, setTeamOverview] = useState([]);

  // Controls whether resolved jobs appear in the list.
  const [showCompleted, setShowCompleted] = useState(false);

  // Tracks the job currently being updated.
  const [busy, setBusy] = useState("");

  // Messages displayed to the technician.
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Show a loading message during the first request.
  const [loading, setLoading] = useState(true);


  // --------------------------------------------------
  // 2. LOAD ASSIGNED TICKETS FROM FIRESTORE
  // --------------------------------------------------

  const refresh = useCallback(async () => {

    try {

      /*
       * Flask returns only tickets assigned to
       * the authenticated technician.
       *
       * Each ticket includes its linked incident reports.
       * Those reports provide the incident address,
       * description, coordinates and photo availability.
       */
      const result = await apiRequest("/api/tickets");

      setTickets(result.tickets || []);


      /*
       * The team overview is read-only.
       *
       * It helps technicians understand team progress
       * without exposing private resident information.
       */
      const board = await apiRequest("/api/tickets/overview");

      setTeamOverview(board.tickets || []);

      setError("");

    } catch (e) {

      // Display a useful message if the backend request fails.
      setError(
        e.message || "Unable to load technician jobs."
      );

    } finally {

      setLoading(false);

    }

  }, []);


  // --------------------------------------------------
  // 3. AUTOMATIC REFRESH
  // --------------------------------------------------

  useEffect(() => {

    // Load the technician's jobs when the dashboard opens.
    refresh();

    /*
     * Check Firestore every 15 seconds.
     *
     * This allows newly assigned jobs and status changes
     * to appear without manually refreshing the page.
     */
    const timer = setInterval(refresh, 15000);

    // Stop the timer when the component closes.
    return () => clearInterval(timer);

  }, [refresh]);


  // --------------------------------------------------
  // 4. UPDATE JOB STATUS
  // --------------------------------------------------

  async function changeStatus(id, status) {

    // Prevent two status updates running at the same time.
    if (busy) {
      return;
    }

    /*
     * Confirm before resolving a job.
     *
     * Resolving a job changes its status in Firestore
     * and may make the technician available for new work.
     */
    if (
      status === "resolved" &&
      !window.confirm(
        "Mark this job as resolved in Firebase?"
      )
    ) {
      return;
    }

    setBusy(id);
    setNotice("");
    setError("");

    try {

      /*
       * Send the requested status change to Flask.
       *
       * Only the assigned technician can update a ticket.
       *
       * Allowed workflow:
       * Assigned -> In Progress -> Resolved.
       */
      await apiRequest(
        `/api/tickets/${encodeURIComponent(id)}/status`,
        {
          method: "PATCH",
          body: { status }
        }
      );

      // Confirm that the backend accepted the update.
      setNotice(
        status === "resolved"
          ? "Job resolved successfully in Firestore."
          : "Job started successfully in Firestore."
      );

      // Refresh the list to display the latest status.
      await refresh();

    } catch (e) {

      setError(
        e.message || "Unable to update the job status."
      );

    } finally {

      // Re-enable the job action buttons.
      setBusy("");

    }
  }


  // --------------------------------------------------
  // 5. FILTER ACTIVE AND COMPLETED JOBS
  // --------------------------------------------------

  /*
   * By default, technicians see active jobs.
   *
   * Checking "Show completed" also displays
   * resolved and closed jobs.
   */
  const filtered = tickets.filter(
    (ticket) =>
      showCompleted ||
      !["resolved", "closed"].includes(ticket.status)
  );

  // Count jobs currently being worked on.
  const inProgressCount = tickets.filter(
    (ticket) => ticket.status === "in_progress"
  ).length;


  // --------------------------------------------------
  // 6. TECHNICIAN DASHBOARD INTERFACE
  // --------------------------------------------------

  return (

    <section
      style={{ marginBottom: 20 }}
      aria-label="Live Firestore technician jobs"
    >

      <h3>🔧 My Firebase Assigned Jobs</h3>

      <p
        className="form-footnote"
        style={{ textAlign: "left" }}
      >
        View your assigned municipal jobs, incident locations
        and supporting photos. All status changes are saved
        directly in Firestore.
      </p>


      {/* ---------------------------------------------
          LOADING AND FEEDBACK MESSAGES
      --------------------------------------------- */}

      {loading && (
        <p role="status">
          Loading your assigned jobs...
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}

      {notice && (
        <p role="status" style={{ color: "var(--success)" }}>
          {notice}
        </p>
      )}


      {/* ---------------------------------------------
          REFRESH AND COMPLETED JOB FILTER
      --------------------------------------------- */}

      <button
        type="button"
        className="btn-filter"
        onClick={refresh}
      >
        ↻ Refresh jobs
      </button>

      <label
        style={{
          marginLeft: 12,
          fontSize: 12
        }}
      >
        <input
          type="checkbox"
          checked={showCompleted}
          onChange={(e) =>
            setShowCompleted(e.target.checked)
          }
        />

        {" "}Show completed
      </label>


      {/* Display the number of jobs currently visible. */}
      <p>
        {filtered.length} jobs shown ·
        {" "}{inProgressCount} in progress
      </p>

      {!loading && filtered.length === 0 && (
        <p>No Firebase jobs assigned yet.</p>
      )}


      {/* ---------------------------------------------
          ASSIGNED JOB LIST
      --------------------------------------------- */}

      <div className="admin-report-list">

        {filtered.map((ticket) => (

          <div
            className="admin-report-row"
            key={ticket.id}
          >

            <div className="admin-report-main">

              {/* Municipal service category */}
              <div className="admin-report-title">

                <strong>
                  {ticket.reports?.[0]?.utility || ticket.type}
                </strong>

              </div>


              {/* Unique Firestore ticket ID */}
              <small>
                Ticket: {ticket.id}
              </small>


              {/* Technician assigned to this job */}
              <p>
                <strong>Assigned to:</strong>
                {" "}
                {ticket.assignedTechName ||
                  ticket.assignedTech ||
                  "Unassigned"}
              </p>


              {/* ---------------------------------------
                  LINKED INCIDENT REPORTS

                  A single municipal ticket may contain
                  more than one report of the same issue.
              --------------------------------------- */}

              {ticket.reports?.map((report) => {

                // Prepare the Google Maps navigation link.
                const mapUrl = getIncidentMapUrl(report);

                // Obtain the coordinates saved with the report.
                const latitude = report.location?.lat;
                const longitude = report.location?.lng;

                // Check whether the report has usable GPS data.
                const hasCoordinates =
                  typeof latitude === "number" &&
                  typeof longitude === "number" &&
                  Number.isFinite(latitude) &&
                  Number.isFinite(longitude) &&
                  latitude >= -90 &&
                  latitude <= 90 &&
                  longitude >= -180 &&
                  longitude <= 180;

                return (

                  <div
                    key={report.id}
                    style={{
                      marginTop: 14,
                      padding: 12,
                      border: "1px solid var(--border-strong)",
                      borderRadius: 8
                    }}
                  >

                    {/* REPORT REFERENCE */}

                    <p>
                      <strong>Report Reference:</strong>
                      {" "}
                      {report.referenceNumber}
                    </p>


                    {/* SERVICE TYPE */}

                    <p>
                      <strong>Incident Type:</strong>
                      {" "}
                      {report.utility || ticket.type}
                    </p>


                    {/* INCIDENT DESCRIPTION */}

                    <p>
                      <strong>Description:</strong>
                      {" "}
                      {report.description ||
                        "No description provided."}
                    </p>


                    {/* -----------------------------------
                        EXACT INCIDENT ADDRESS

                        This is the incident address
                        entered by the ratepayer.

                        It is not their billing address.
                    ----------------------------------- */}

                    <div
                      style={{
                        marginTop: 12,
                        padding: 12,
                        borderRadius: 8,
                        background: "var(--surface, transparent)",
                        border: "1px solid var(--border-strong)"
                      }}
                    >

                      <strong>
                        📍 Incident Location
                      </strong>


                      {/* Street address or nearby landmark */}
                      <p>
                        <strong>Street / Landmark:</strong>
                        {" "}
                        {report.address ||
                          "Street address not recorded"}
                      </p>


                      {/* Suburb or local area */}
                      <p>
                        <strong>Area / Suburb:</strong>
                        {" "}
                        {report.area ||
                          "Area not recorded"}
                      </p>


                      {/* Municipality */}
                      <p>
                        <strong>Municipality:</strong>
                        {" "}
                        {report.municipality ||
                          "Municipality not recorded"}
                      </p>


                      {/* Province */}
                      <p>
                        <strong>Province:</strong>
                        {" "}
                        {report.province ||
                          "Province not recorded"}
                      </p>


                      {/* GPS coordinates from the map picker */}
                      {hasCoordinates && (

                        <p>
                          <strong>GPS Coordinates:</strong>
                          {" "}
                          {latitude.toFixed(6)},
                          {" "}
                          {longitude.toFixed(6)}
                        </p>

                      )}


                      {/* ---------------------------------
                          OPEN INCIDENT IN GOOGLE MAPS

                          The link uses the incident pin
                          or the recorded incident address.
                          It never uses private billing data.
                      --------------------------------- */}

                      {mapUrl && (

                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-filter"
                          style={{
                            display: "inline-block",
                            marginTop: 8,
                            textDecoration: "none"
                          }}
                        >
                          🗺️ Open in Google Maps
                        </a>

                      )}

                      {!mapUrl && (

                        <p className="field-hint">
                          No location is available for navigation.
                        </p>

                      )}

                    </div>


                    {/* -----------------------------------
                        PRIVATE INCIDENT PHOTO

                        Flask checks authentication before
                        allowing an image to be downloaded.
                    ----------------------------------- */}

                    {report.photoAvailable && (

                      <div style={{ marginTop: 12 }}>

                        <p>
                          <strong>
                            📷 Incident Photo Attached
                          </strong>
                        </p>

                        <button
                          type="button"
                          className="btn-filter"
                          onClick={() =>
                            viewReportPhoto(
                              report.referenceNumber
                            ).catch((e) => {
                              setError(
                                e.message ||
                                  "Unable to open incident photo."
                              );
                            })
                          }
                        >
                          View Incident Photo
                        </button>

                      </div>

                    )}

                  </div>

                );

              })}

            </div>


            {/* ------------------------------------------
                CURRENT TICKET STATUS
            ------------------------------------------ */}

            <span
              className={`status-badge ${statusBadgeClass(
                toDisplayStatus(ticket.status)
              )}`}
            >
              {toDisplayStatus(ticket.status)}
            </span>


            {/* ------------------------------------------
                TECHNICIAN ACTION BUTTONS
            ------------------------------------------ */}

            <div className="admin-report-actions">

              {/* Only assigned jobs may be started. */}
              {ticket.status === "assigned" && (

                <button
                  className="btn-filter"
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    changeStatus(ticket.id, "in_progress")
                  }
                >
                  {busy === ticket.id
                    ? "Updating..."
                    : "Start Work"}
                </button>

              )}


              {/* Only in-progress jobs may be resolved. */}
              {ticket.status === "in_progress" && (

                <button
                  className="btn-filter"
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    changeStatus(ticket.id, "resolved")
                  }
                >
                  {busy === ticket.id
                    ? "Updating..."
                    : "Mark Resolved"}
                </button>

              )}

            </div>

          </div>

        ))}

      </div>


      {/* --------------------------------------------------
          7. READ-ONLY TEAM OVERVIEW

          The overview is available to technicians,
          but it does not expose private resident information.

          Technicians cannot edit other people's jobs here.
      -------------------------------------------------- */}

      <h3 style={{ marginTop: 24 }}>
        Team Job Overview (read-only)
      </h3>

      <p
        className="form-footnote"
        style={{ textAlign: "left" }}
      >
        All technicians can view job categories,
        assignments and progress here.
        Resident descriptions and incident addresses
        are kept private.
        Only the assigned technician can update a ticket.
      </p>

      {teamOverview.length === 0 && (
        <p>No team tickets available.</p>
      )}


      {/* Display basic team ticket information only. */}
      <div className="admin-report-list">

        {teamOverview.map((job) => (

          <div
            className="admin-report-row"
            key={job.id}
          >

            <div className="admin-report-main">

              {/* Team job category */}
              <strong>
                {job.type?.replaceAll("_", " ")}
              </strong>


              {/* Assigned technician name only */}
              <p>
                Assigned to:
                {" "}
                {job.assignedTechName || "Unassigned"}
              </p>


              {/* Ticket reference */}
              <small>
                Ticket: {job.id}
              </small>

            </div>


            {/* Team job progress */}
            <span
              className={`status-badge ${statusBadgeClass(
                toDisplayStatus(job.status)
              )}`}
            >
              {toDisplayStatus(job.status)}
            </span>

          </div>

        ))}

      </div>

    </section>

  );
}
