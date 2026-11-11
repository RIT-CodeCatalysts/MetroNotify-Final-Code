import { useCallback, useEffect, useState } from "react";
import {
  apiRequest,
  specialtyForType,
  toDisplayStatus,
  viewReportPhoto
} from "../../services/api";
import { useLiveAlerts } from "../../context/LiveAlertsContext";

/**
 * METRONOTIFY - MUNICIPAL REPORTS AND DISPATCH (ADMIN)
 *
 * This screen uses real Flask/Firebase data. Municipal Admin can:
 * 1. Review incident reports submitted by approved ratepayers.
 * 2. View a privately saved incident photo, when one is attached.
 * 3. Verify reports before publishing them to the public.
 * 4. Select an eligible technician and assign the incident's ticket.
 * 5. Publish or end public alerts.
 * 6. Invite new technicians or add a login to a legacy technician.
 *
 * IMPORTANT: Reading a photo must never publish it publicly. The photo
 * download route checks the Firebase login and role on the Flask server.
 */
export default function FirestoreReports() {
  // These lists are loaded from the protected Flask API, not mock data.
  const [reports, setReports] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [adminAlerts, setAdminAlerts] = useState([]);

  // Keep public alert displays in sync after an Admin publishes/ends an alert.
  const { refresh: refreshPublicAlerts } = useLiveAlerts();

  // The selected technician for each ticket is stored until Admin assigns it.
  const [selected, setSelected] = useState({});

  // Form for creating an invited technician account.
  const [newTech, setNewTech] = useState({
    name: "",
    email: "",
    specialization: "electrical"
  });

  // Loading and feedback messages for municipal actions.
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Track photo requests separately so viewing a photo does not block dispatch.
  const [openingPhoto, setOpeningPhoto] = useState("");

  // -------------------------------------------------------------
  // 1. LOAD REPORTS, TICKETS, TECHNICIANS AND ALERT HISTORY
  // -------------------------------------------------------------
  const load = useCallback(async () => {
    try {
      // Four independent authenticated requests are made in parallel.
      const [r, t, tech, alertHistory] = await Promise.all([
        apiRequest("/api/reports"),
        apiRequest("/api/tickets"),
        apiRequest("/api/technicians"),
        apiRequest("/api/admin/alerts")
      ]);

      setReports(r.reports || []);
      setTickets(t.tickets || []);
      setTechnicians(tech.technicians || []);
      setAdminAlerts(alertHistory.alerts || []);
      setError("");
    } catch (e) {
      setError(e?.message || "Could not load municipal reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load when the page opens, then refresh every 15 seconds.
    load();
    const timer = setInterval(load, 15000);

    // Stop the timer when this Admin panel closes.
    return () => clearInterval(timer);
  }, [load]);

  // -------------------------------------------------------------
  // 2. REUSABLE ADMIN ACTION (VERIFY, ASSIGN, PUBLISH, ETC.)
  // -------------------------------------------------------------
  async function action(key, callback, success) {
    // Block repeated clicks while a write request is running.
    if (working) return;

    setWorking(key);
    setNotice("");
    setError("");

    try {
      // Only the secured Flask route can actually update Firestore.
      await callback();
      setNotice(success);

      // Reload authoritative Firebase records after each successful update.
      await load();
      await refreshPublicAlerts();
    } catch (e) {
      setError(e?.message || "The action could not be completed.");
    } finally {
      setWorking("");
    }
  }

  // -------------------------------------------------------------
  // 3. OPEN A PRIVATE INCIDENT PHOTO
  // -------------------------------------------------------------
  async function handleViewPhoto(report) {
    // Photos belong to reports, not public alerts or technician accounts.
    const reference = report.referenceNumber || report.id;
    if (!reference || openingPhoto) return;

    setError("");
    setOpeningPhoto(report.id);

    try {
      /*
       * viewReportPhoto() is the existing authenticated frontend helper.
       * It should GET /api/reports/<reference>/photo using the Firebase token.
       * A plain public image URL must NOT be used for private incident images.
       *
       * The Flask endpoint reads the photo from local private storage and
       * permits access only to Admin, the report owner or an assigned technician.
       */
      await viewReportPhoto(reference);
    } catch (e) {
      setError(
        `Could not open the photo for ${reference}: ` +
        (e?.message || "Photo unavailable on this server.")
      );
    } finally {
      setOpeningPhoto("");
    }
  }

  // -------------------------------------------------------------
  // 4. LOOKUP TABLES AND AVAILABLE TECHNICIAN SPECIALISATIONS
  // -------------------------------------------------------------
  const ticketById = Object.fromEntries(
    tickets.map((ticket) => [ticket.id, ticket])
  );

  // Admin alert history includes published and ended alerts.
  // This prevents React from offering duplicate alert publications.
  const alertByReportId = Object.fromEntries(
    adminAlerts
      .filter((alert) => alert.reportId)
      .map((alert) => [alert.reportId, alert])
  );
  const alertByTicketId = Object.fromEntries(
    adminAlerts
      .filter((alert) => alert.ticketId)
      .map((alert) => [alert.ticketId, alert])
  );

  const specializations = [
    ...new Set(Object.values(specialtyForType).flat())
  ].sort();

  // -------------------------------------------------------------
  // 5. ADMIN DASHBOARD INTERFACE
  // -------------------------------------------------------------
  return (
    <section
      style={{ marginTop: "30px" }}
      aria-label="Firestore municipal reports"
    >
      <h3>Firebase Municipal Reports &amp; Dispatch</h3>
      <p className="form-footnote" style={{ textAlign: "left" }}>
        Real Firestore records. Verify an incident before publishing a public
        alert. Admin approves the technician assignment; jobs only start when
        the technician selects Start Work.
      </p>

      {/* Display loading, errors and successful Admin actions. */}
      {loading && <p>Loading reports, tickets and technicians…</p>}
      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}
      {notice && (
        <p role="status" style={{ color: "var(--success)" }}>{notice}</p>
      )}
      <button type="button" className="btn-filter" onClick={load}>
        ↻ Refresh Firebase data
      </button>

      {/* ------------------------------------------------------- */}
      {/* TECHNICIAN REGISTRATION / LEGACY ACCOUNT INVITATIONS    */}
      {/* ------------------------------------------------------- */}
      <div
        style={{
          marginTop: 16,
          border: "1px solid var(--border-strong)",
          padding: 14,
          borderRadius: 10
        }}
      >
        <strong>👷 Add municipal technician</strong>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 10
          }}
        >
          <input
            aria-label="Technician name"
            placeholder="Technician full name"
            className="form-control"
            value={newTech.name}
            onChange={(e) =>
              setNewTech((previous) => ({
                ...previous,
                name: e.target.value
              }))
            }
          />
          <input
            type="email"
            aria-label="Technician work email"
            placeholder="Technician email"
            className="form-control"
            value={newTech.email}
            onChange={(e) =>
              setNewTech((previous) => ({
                ...previous,
                email: e.target.value
              }))
            }
          />
          <select
            className="form-control"
            aria-label="Technician specialisation"
            value={newTech.specialization}
            onChange={(e) =>
              setNewTech((previous) => ({
                ...previous,
                specialization: e.target.value
              }))
            }
          >
            {specializations.map((spec) => (
              <option value={spec} key={spec}>{spec}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-filter"
            disabled={
              !newTech.name.trim() ||
              !newTech.email.includes("@") ||
              !!working
            }
            onClick={() =>
              action(
                "add",
                () => apiRequest("/api/technicians", {
                  method: "POST",
                  body: newTech
                }),
                "Technician account created in Firebase. Ask them to use Forgot password to set their password."
              )
            }
          >
            Add Technician
          </button>
        </div>

        <p className="field-hint">
          Available technicians with Firebase logins:{" "}
          {technicians.filter((tech) => tech.isAvailable && tech.hasLogin).length}
          {" "}/ {technicians.length}. Invited staff use Forgot password at
          sign-in to set their own password.
        </p>

        {/* Existing staff without Firebase Authentication can be invited. */}
        {technicians.filter((tech) => !tech.hasLogin).map((tech) => (
          <p key={tech.id} className="field-hint">
            {tech.name} ({tech.specialization}) — legacy record without login.{" "}
            <button
              type="button"
              className="btn-filter"
              disabled={!!working}
              onClick={() => {
                const email = window.prompt(`Work email for ${tech.name}:`);
                if (!email) return;
                action(
                  tech.id,
                  () => apiRequest(
                    `/api/technicians/${encodeURIComponent(tech.id)}/invite`,
                    { method: "POST", body: { email } }
                  ),
                  `Firebase login created for ${tech.name}; ask them to use Forgot password.`
                );
              }}
            >
              Invite Account
            </button>
          </p>
        ))}
      </div>

      {/* ------------------------------------------------------- */}
      {/* REPORTS, PHOTOS, TECHNICIAN DISPATCH AND PUBLIC ALERTS  */}
      {/* ------------------------------------------------------- */}
      <p style={{ marginTop: 14 }}>
        <strong>{reports.length}</strong> Firebase reports retrieved
      </p>
      {!loading && reports.length === 0 && <p>No Firebase reports found.</p>}

      <div
        className="admin-report-list"
        style={{ maxHeight: 600, overflowY: "auto" }}
      >
        {reports.map((report) => {
          // Each incident report may be linked to a municipal ticket.
          const ticket = ticketById[report.ticketId];
          const hasReview = report.verification === "verified";
          const alert =
            alertByReportId[report.id] || alertByTicketId[report.ticketId];
          const incidentResolved =
            ["resolved", "closed"].includes(report.status) ||
            (ticket && ["resolved", "closed"].includes(ticket.status));

          // The Admin can assign only an open, unassigned, verified ticket.
          const canAssign =
            hasReview && ticket && ticket.status === "open" && !ticket.assignedTech;

          // Show only available staff with a login and matching specialisation.
          // Civil fallback is provided by specialtyForType where permitted.
          const matched = technicians.filter(
            (tech) =>
              tech.isAvailable &&
              tech.hasLogin &&
              (specialtyForType[report.type] || []).includes(
                String(tech.specialization).trim().toLowerCase()
              )
          );

          // Flask sets photoAvailable=true only after photo storage succeeds.
          // Older reports and reports without photos do not show a View button.
          const hasPhoto = report.photoAvailable === true;
          const isOpeningThisPhoto = openingPhoto === report.id;

          return (
            <div className="admin-report-row" key={report.id}>
              <div className="admin-report-main">
                <div className="admin-report-title">
                  <strong>{report.utility}</strong> — {report.area || "Area not recorded"}
                </div>
                <small>
                  {report.referenceNumber} · {report.timestamp || "Date unknown"}
                </small>
                <p>{report.description}</p>

                {/*
                  INCIDENT PHOTO — PRIVATE

                  The ratepayer's photo is already saved by Flask. Admin
                  requests it by its report reference, with the Firebase token.
                  Do not put private photos on the public Alerts page.
                */}
                {hasPhoto && (
                  <div style={{ margin: "10px 0" }}>
                    <p className="field-hint" style={{ marginBottom: 6 }}>
                      📷 Incident photo attached (private)
                    </p>
                    <button
                      type="button"
                      className="btn-filter"
                      disabled={isOpeningThisPhoto}
                      aria-label={`View incident photo for ${report.referenceNumber || report.id}`}
                      onClick={() => handleViewPhoto(report)}
                    >
                      {isOpeningThisPhoto ? "Opening photo…" : "📷 View Incident Photo"}
                    </button>
                  </div>
                )}

                <p>
                  <strong>Location:</strong>{" "}
                  {[report.address, report.municipality, report.province]
                    .filter(Boolean)
                    .join(", ") || "Coordinates only"}
                </p>
                <p>
                  <strong>Report:</strong> {toDisplayStatus(report.status)} ·{" "}
                  <strong>Verification:</strong> {hasReview ? "Verified" : "Pending"}
                </p>
                <p>
                  <strong>Ticket:</strong> {report.ticketId || "Needs linking"} ·{" "}
                  {ticket ? toDisplayStatus(ticket.status) : "Ticket unavailable"}
                </p>
                {ticket?.assignedTech && (
                  <p>
                    <strong>Technician:</strong>{" "}
                    {ticket.assignedTechName || ticket.assignedTech}
                  </p>
                )}
              </div>

              {/* Admin decisions remain separate from private photo access. */}
              <div
                className="admin-report-actions"
                style={{ display: "flex", flexDirection: "column", gap: 7 }}
              >
                {/* A report must be checked before a public alert can be made. */}
                {!hasReview && (
                  <button
                    type="button"
                    className="btn-filter"
                    disabled={!!working}
                    onClick={() =>
                      action(
                        report.id,
                        () => apiRequest(
                          `/api/reports/${encodeURIComponent(report.referenceNumber)}/review`,
                          { method: "PATCH" }
                        ),
                        `Report ${report.referenceNumber} verified`
                      )
                    }
                  >
                    Verify Report
                  </button>
                )}

                {/* Admin chooses a technician; there is no automatic dispatch. */}
                {canAssign && (
                  <>
                    <select
                      aria-label={`Select technician for ${report.referenceNumber}`}
                      className="form-control"
                      value={selected[report.ticketId] || ""}
                      onChange={(e) =>
                        setSelected((previous) => ({
                          ...previous,
                          [report.ticketId]: e.target.value
                        }))
                      }
                    >
                      <option value="">
                        {matched.length
                          ? "Choose available technician"
                          : "No matching technician available"}
                      </option>
                      {matched.map((tech) => (
                        <option key={tech.id} value={tech.id}>
                          {tech.name} — {tech.specialization}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-filter"
                      disabled={!selected[report.ticketId] || !!working}
                      onClick={() =>
                        action(
                          report.id,
                          () => apiRequest(
                            `/api/tickets/${encodeURIComponent(report.ticketId)}/assign`,
                            {
                              method: "POST",
                              body: { technicianId: selected[report.ticketId] }
                            }
                          ),
                          "Technician assigned in Firestore"
                        )
                      }
                    >
                      Assign Technician
                    </button>
                  </>
                )}

                {/* Only publish verified, unresolved incidents with no alert. */}
                {hasReview && !incidentResolved && !alert && (
                  <button
                    type="button"
                    className="btn-filter"
                    disabled={!!working}
                    onClick={() =>
                      action(
                        report.id,
                        () => apiRequest("/api/alerts", {
                          method: "POST",
                          body: { reportId: report.id }
                        }),
                        "Public alert published in Firestore"
                      )
                    }
                  >
                    Publish Public Alert
                  </button>
                )}

                {/* The published state comes from Firestore, not browser state. */}
                {alert?.published && (
                  <button
                    type="button"
                    className="btn-filter"
                    disabled
                    aria-label="Alert already published"
                  >
                    ✓ Published
                  </button>
                )}

                {/* Admin can end the alert only after the incident is resolved. */}
                {alert?.published && incidentResolved && (
                  <button
                    type="button"
                    className="btn-filter"
                    disabled={!!working}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `End the public alert for ${report.referenceNumber}? ` +
                          "The alert will disappear from Active Alerts but remain in Firestore history."
                        )
                      ) {
                        return;
                      }
                      action(
                        `end-${alert.id}`,
                        () => apiRequest(
                          `/api/alerts/${encodeURIComponent(alert.id)}`,
                          {
                            method: "PATCH",
                            body: { status: "Resolved", published: false }
                          }
                        ),
                        "Alert ended and removed from public Active Alerts"
                      );
                    }}
                  >
                    Resolve &amp; Remove Alert
                  </button>
                )}

                {/* Ended alerts stay visible in Admin's Firestore history. */}
                {alert && !alert.published && (
                  <button
                    type="button"
                    className="btn-filter"
                    disabled
                    aria-label="Alert ended and archived"
                  >
                    ✓ Alert Ended
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="form-footnote" style={{ textAlign: "left" }}>
        The Published label is loaded from Firestore and remains after refreshing.
        Once the incident is resolved, an Admin can end its public alert without
        deleting the historical record. Private incident photos are never
        published automatically.
      </p>
    </section>
  );
}
