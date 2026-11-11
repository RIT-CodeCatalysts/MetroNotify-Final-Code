
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../services/api";

/*
 * METRONOTIFY - TECHNICIAN COVERAGE
 *
 * Municipal Admin can:
 * 1. Check coverage for all ten reporting categories.
 * 2. See which technicians have a Firebase login and are available.
 * 3. Find active tickets that still need a technician.
 * 4. See a suggested eligible technician in the assignment dropdown.
 * 5. Confirm the assignment by clicking Assign Technician.
 * 6. Review older reports that are not linked to a ticket.
 *
 * IMPORTANT: Showing a suggestion does not assign a job.
 * Flask checks permissions and technician eligibility before saving.
 */

// Each service has one or more suitable technician specialisations.
// Dedicated specialists come first; Civil is a fallback for infrastructure
// work and for Other reports after Admin checks what the job involves.
const SERVICE_TYPES = [
  {
    name: "Electricity",
    aliases: ["electricity", "power outage", "power failure", "power", "electrical"],
    specialties: ["electrical", "electricity"]
  },
  {
    name: "Streetlights",
    aliases: ["streetlight", "streetlights", "street light", "street lights"],
    specialties: ["electrical", "electricity"]
  },
  {
    name: "Water",
    aliases: ["water", "water leak", "burst pipe", "water outage"],
    specialties: ["water", "plumbing", "sanitation"]
  },
  {
    name: "Sewerage",
    aliases: ["sewage", "sewerage", "sewer", "sewer blockage"],
    specialties: ["sewage", "sewerage", "sanitation", "plumbing", "civil"]
  },
  {
    name: "Potholes",
    aliases: ["pothole", "potholes", "road damage"],
    specialties: ["roads", "road", "potholes", "civil"]
  },
  {
    name: "Stormwater",
    aliases: ["stormwater", "storm water", "drainage", "blocked drain"],
    specialties: ["stormwater", "roads", "road", "civil"]
  },
  {
    name: "Traffic Lights",
    aliases: ["traffic lights", "traffic light", "traffic signal", "traffic signals"],
    specialties: ["traffic", "traffic signals"]
  },
  {
    name: "Waste / Refuse",
    aliases: ["waste", "refuse", "waste refuse", "rubbish", "garbage"],
    specialties: ["waste", "refuse"]
  },
  {
    name: "Vandalism",
    aliases: ["vandalism", "vandal", "security"],
    specialties: ["vandalism", "security"]
  },
  {
    name: "Other",
    aliases: ["other", "other issue", "other service", "other municipal issue"],
    specialties: ["general", "civil"]
  }
];

// Firestore stores some types with underscores, e.g. "power_outage".
// Normalising the text lets those values match the readable category names.
const norm = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_/-]+/g, " ")
    .replace(/\s+/g, " ");

function serviceFor(type) {
  const value = norm(type);
  return SERVICE_TYPES.find((service) => service.aliases.includes(value)) || null;
}

// Completed jobs must not appear in the unassigned-ticket queue.
const finished = (status) =>
  ["resolved", "closed", "cancelled", "canceled"].includes(norm(status));

// Both conditions are necessary. A linked login alone does not mean the
// technician can accept another job while an existing assignment is active.
const usable = (tech) =>
  tech.hasLogin === true && tech.isAvailable === true;

function ticketHasAssignment(ticket) {
  const id = ticket.assignedTech || ticket.assignedTechnicianId || ticket.technicianId;
  const name = norm(ticket.assignedTechName);
  return Boolean(id) || Boolean(name && name !== "unassigned");
}

// Sort matching technicians in the order of the service's specialisations.
// This makes a dedicated specialist the first suggestion when available.
function eligibleTechnicians(technicians, service) {
  if (!service) return [];

  return technicians
    .filter((tech) =>
      usable(tech) && service.specialties.includes(norm(tech.specialization))
    )
    .sort((a, b) =>
      service.specialties.indexOf(norm(a.specialization)) -
        service.specialties.indexOf(norm(b.specialization)) ||
      String(a.name || "").localeCompare(String(b.name || ""))
    );
}

export default function TechnicianCoverage() {
  // These values are read from Firebase through authenticated Flask endpoints.
  const [technicians, setTechnicians] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [reports, setReports] = useState([]);

  // Admin can change the suggestion before approving an assignment.
  const [selectedTechs, setSelectedTechs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Refresh all three collections without changing any Firestore records.
  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [techData, ticketData, reportData] = await Promise.all([
        apiRequest("/api/technicians"),
        apiRequest("/api/tickets"),
        apiRequest("/api/reports")
      ]);

      setTechnicians(techData.technicians || []);
      setTickets(ticketData.tickets || []);
      setReports(reportData.reports || []);
    } catch (err) {
      setError(err.message || "Unable to load technician coverage.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Use the ticket type, or a linked report type for older tickets.
  function matchingTechs(ticket) {
    const type = ticket.type || ticket.reports?.[0]?.type;
    return eligibleTechnicians(technicians, serviceFor(type));
  }

  // The first eligible technician is preselected in the dropdown.
  // Nothing is sent to Flask until Admin clicks the Assign button.
  function chosenTechnicianId(ticket, options) {
    const selected = selectedTechs[ticket.id];
    return options.some((tech) => tech.id === selected)
      ? selected
      : (options[0]?.id || "");
  }

  async function assign(ticket) {
    if (saving) return;

    const options = matchingTechs(ticket);
    const chosenId = chosenTechnicianId(ticket, options);
    const chosen = options.find((tech) => tech.id === chosenId);

    if (!chosen) {
      setError("There is no available matching technician with a Firebase login.");
      return;
    }

    // Admin must verify at least one report linked to this ticket first.
    const verified = (ticket.reports || []).some(
      (report) => norm(report.verification) === "verified"
    );

    if (!verified) {
      setError("Review and verify the linked report before assigning this job.");
      return;
    }

    // Other is broad: Civil should only receive it if the job is suitable.
    if (serviceFor(ticket.type || ticket.reports?.[0]?.type)?.name === "Other") {
      if (!window.confirm(
        `This is an Other report. Check that ${chosen.name} is qualified for the work. Continue?`
      )) return;
    }

    if (!window.confirm(
      `Assign ticket ${ticket.id} to ${chosen.name} (${chosen.specialization})?`
    )) return;

    setSaving(ticket.id);
    setError("");
    setNotice("");

    try {
      // Flask verifies the Admin role, specialisation and current availability.
      await apiRequest(`/api/tickets/${encodeURIComponent(ticket.id)}/assign`, {
        method: "POST",
        body: { technicianId: chosenId }
      });

      setNotice(`Ticket ${ticket.id} assigned to ${chosen.name}.`);
      await load();
    } catch (err) {
      setError(err.message || "Assignment failed.");
    } finally {
      setSaving("");
    }
  }

  const activeTickets = tickets.filter((ticket) => !finished(ticket.status));
  const missingTickets = activeTickets.filter((ticket) => !ticketHasAssignment(ticket));
  const needsTicket = reports.filter(
    (report) => !finished(report.status) && !report.ticketId
  );
  const unlinkedStaff = technicians.filter((tech) => !tech.hasLogin);
  const linkedStaff = technicians.filter((tech) => tech.hasLogin);
  const availableStaff = linkedStaff.filter((tech) => tech.isAvailable);

  return (
    <section
      aria-label="Technician coverage for all service problems"
      style={{ marginTop: 20, padding: 16, border: "1px solid #b8caa9", borderRadius: 10 }}
    >
      <h3 style={{ color: "#244725" }}>
        👷 Technician Coverage — All Service Problems
      </h3>

      <p>
        Check technician specialisations, active jobs and missing assignments.
        An eligible technician is suggested, but Admin must approve every assignment.
      </p>

      <button
        type="button"
        className="btn-filter"
        onClick={load}
        disabled={loading || !!saving}
      >
        ↻ Refresh Technician Coverage
      </button>

      {loading && <p>Checking reports, tickets and technicians...</p>}
      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}
      {notice && <p role="status" style={{ color: "#245b22" }}>{notice}</p>}

      {!loading && !error && (
        <>
          {/* The totals distinguish existing accounts from available staff. */}
          <p>
            <strong>{linkedStaff.length}</strong> technicians with Firebase logins
            {" · "}
            <strong>{availableStaff.length}</strong> currently available
            {" · "}
            <strong>{unlinkedStaff.length}</strong> without logins
          </p>
          <p>
            <strong>{activeTickets.length}</strong> active tickets
            {" · "}
            <strong>{missingTickets.length}</strong> missing assignments
            {" · "}
            <strong>{needsTicket.length}</strong> reports without linked tickets
          </p>

          {/* Include unavailable technicians, so Admin can see why a category
              has no selectable staff even when the account still exists. */}
          <div style={{ display: "grid", gap: 8 }}>
            {SERVICE_TYPES.map((service) => {
              const matches = technicians.filter((tech) =>
                service.specialties.includes(norm(tech.specialization))
              );
              const available = matches.filter(usable);

              return (
                <div
                  key={service.name}
                  style={{ padding: 10, border: "1px solid #d4dfcb", borderRadius: 8 }}
                >
                  <strong>{service.name}</strong>{" — "}
                  <span style={{ color: available.length ? "#245b22" : "#ad431b" }}>
                    {available.length
                      ? `${available.length} eligible technician(s)`
                      : "No technician currently available"}
                  </span>

                  <div style={{ fontSize: 12, color: "#33482c", marginTop: 4 }}>
                    {matches.length
                      ? matches.map((tech) =>
                          `${tech.name || "Unnamed"} (${tech.specialization || "unknown"}; ` +
                          `${tech.hasLogin ? "login linked" : "no login"}; ` +
                          `${tech.isAvailable ? "available" : "unavailable"})`
                        ).join("; ")
                      : "No matching technician record found"}
                  </div>
                </div>
              );
            })}
          </div>

          <h4 style={{ marginTop: 20 }}>Active Tickets Needing Assignment</h4>
          {missingTickets.length === 0 && <p>No missing assignments were found.</p>}

          {missingTickets.map((ticket) => {
            const service = serviceFor(ticket.type || ticket.reports?.[0]?.type);
            const options = matchingTechs(ticket);
            const suggested = options[0];
            const chosenId = chosenTechnicianId(ticket, options);
            const verified = (ticket.reports || []).some(
              (report) => norm(report.verification) === "verified"
            );

            return (
              <article
                key={ticket.id}
                style={{ marginTop: 10, padding: 12, border: "1px solid #cedcc4", borderRadius: 8 }}
              >
                <strong>{service?.name || `Unmapped service: ${ticket.type || "unknown"}`}</strong>
                <p style={{ fontSize: 12 }}>
                  Ticket: {ticket.id} · Status: {ticket.status || "unknown"}
                </p>

                {!verified && (
                  <p style={{ color: "#9b4b1b" }}>
                    Review and verify the linked report first.
                  </p>
                )}

                {options.length === 0 ? (
                  <p style={{ color: "#9b4b1b" }}>
                    No available matching technician with a Firebase login.
                    Existing technicians may already have assigned jobs.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <label htmlFor={`assign-${ticket.id}`}>Suggested technician</label>
                    <select
                      id={`assign-${ticket.id}`}
                      value={chosenId}
                      onChange={(event) => setSelectedTechs((previous) => ({
                        ...previous,
                        [ticket.id]: event.target.value
                      }))}
                    >
                      {options.map((tech, index) => (
                        <option key={tech.id} value={tech.id}>
                          {tech.name} ({tech.specialization})
                          {index === 0 ? " — Suggested" : ""}
                        </option>
                      ))}
                    </select>

                    {suggested && (
                      <small style={{ color: "#245b22" }}>
                        Recommended: {suggested.name}
                      </small>
                    )}

                    <button
                      type="button"
                      className="btn-filter"
                      disabled={!verified || !chosenId || !!saving}
                      onClick={() => assign(ticket)}
                    >
                      {saving === ticket.id ? "Assigning..." : "Assign Technician"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}

          {/* Older reports may not have ticket links. Do not silently create
              new tickets because an incident might already have one. */}
          <h4 style={{ marginTop: 20 }}>Reports With No Linked Ticket</h4>
          {needsTicket.length === 0 ? (
            <p>No unlinked active reports were found.</p>
          ) : (
            <div style={{ maxHeight: 180, overflowY: "auto" }}>
              {needsTicket.map((report) => (
                <p key={report.id || report.referenceNumber} style={{ fontSize: 13 }}>
                  {report.referenceNumber || report.id}{" — "}
                  {serviceFor(report.type)?.name || report.type || "Unknown service"}.
                  Review its ticket linkage before assignment.
                </p>
              ))}
            </div>
          )}

          <p style={{ fontSize: 12, color: "#52634b" }}>
            These values come from your authenticated Flask API. Unavailable
            technicians are not missing accounts. Older reports may need a ticket audit.
          </p>
        </>
      )}
    </section>
  );
}
