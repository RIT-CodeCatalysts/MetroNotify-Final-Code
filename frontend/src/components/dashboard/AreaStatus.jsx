import { useArea } from "../../context/AreaContext";
import { useLiveAlerts } from "../../context/LiveAlertsContext";

function AreaStatus() {
  const { selectedArea } = useArea();
  const { alerts, loading, error } = useLiveAlerts();

  const hasSelectedArea =
    selectedArea &&
    selectedArea.province &&
    selectedArea.municipality &&
    selectedArea.area;

  /*
   * Find alerts that belong to the selected area.
   *
   * Previously this matched if ANY single field (province OR
   * municipality OR area OR location) matched on its own, which meant
   * an alert from anywhere else in the same province could show up as
   * "this area's" status. Now we require the municipality to match
   * (so we stay within the resident's own municipality) AND either the
   * area or the free-text location to match the selected area name.
   */
  const areaAlerts = hasSelectedArea
    ? alerts.filter((alert) => {
        if (alert.status === "Resolved") return false;
        const selectedMunicipality =
          selectedArea.municipality.toLowerCase();

        const selectedAreaName =
          selectedArea.area.toLowerCase();

        const alertMunicipality =
          alert.municipality?.toLowerCase() || "";

        const alertArea =
          alert.area?.toLowerCase() || "";

        const alertLocation =
          alert.location?.toLowerCase() || "";

        const municipalityMatches =
          alertMunicipality === selectedMunicipality;

        const areaMatches =
          alertArea === selectedAreaName ||
          alertLocation === selectedAreaName;

        return municipalityMatches && areaMatches;
      })
    : [];

  /*
   * Get the most important/current alert.
   */
  const currentAlert = areaAlerts.length
    ? areaAlerts[0]
    : null;

  /*
   * Determine status.
   */
  let status = loading ? "Checking" : error ? "Unavailable" : "No published alerts";
  let statusColor = "var(--success)";
  let statusBackground = "var(--green-50)";

  if (currentAlert) {
    if (
      currentAlert.severityClass === "critical"
    ) {
      status = "Critical";
      statusColor = "var(--danger)";
      statusBackground = "var(--danger-bg)";
    } else if (
      currentAlert.severityClass === "high"
    ) {
      status = "High";
      statusColor = "var(--warning)";
      statusBackground = "var(--warning-bg)";
    } else if (
      currentAlert.severityClass === "medium"
    ) {
      status = "Partial";
      statusColor = "var(--gold-600)";
      statusBackground = "var(--gold-50)";
    } else {
      status = currentAlert.severity || "Alert";
      statusColor = "var(--gold-600)";
      statusBackground = "var(--gold-50)";
    }
  }

  return (
    <div className="card">
      {/* HEADER */}
      <div className="card-header">
        <div className="card-title">
          📍 Area Status
        </div>
      </div>

      <div className="card-body">
        {/* NO AREA SELECTED */}
        {!hasSelectedArea ? (
          <div
            style={{
              padding: "18px 12px",
              textAlign: "center",
              color: "var(--green-600)",
            }}
          >
            <div
              style={{
                fontSize: "25px",
                marginBottom: "5px",
              }}
            >
              📍
            </div>

            <strong
              style={{
                color: "var(--green-800)",
              }}
            >
              No area selected
            </strong>

            <p
              style={{
                margin: "6px 0 0",
                fontSize: "11px",
                color: "var(--text-muted)",
                lineHeight: "1.5",
              }}
            >
              Select your area to see its
              current service status.
            </p>
          </div>
        ) : (
          <div>
            {/* AREA + STATUS */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
              }}
            >
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: statusColor,
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />

              <strong
                style={{
                  color: "var(--green-800)",
                  fontSize: "14px",
                }}
              >
                {selectedArea.area}
              </strong>

              <span
                style={{
                  marginLeft: "auto",
                  color: statusColor,
                  fontSize: "11px",
                  fontWeight: "700",
                }}
              >
                {status}
              </span>
            </div>

            {/* LOCATION */}
            <div
              style={{
                marginTop: "8px",
                padding: "8px",
                background: "var(--green-50)",
                borderRadius: "8px",
                fontSize: "10px",
                color: "var(--green-700)",
                lineHeight: "1.5",
              }}
            >
              {selectedArea.municipality}
              <br />
              {selectedArea.province}
            </div>

            {/* ACTIVE ALERT */}
            {currentAlert && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "9px",
                  background: statusBackground,
                  borderRadius: "8px",
                  borderLeft: `3px solid ${statusColor}`,
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: "700",
                    color: "var(--text-primary)",
                  }}
                >
                  {currentAlert.type}{" "}
                  {currentAlert.title}
                </div>

                <div
                  style={{
                    marginTop: "3px",
                    fontSize: "10px",
                    color: "var(--text-muted)",
                  }}
                >
                  {currentAlert.time}
                  {currentAlert.eta &&
                    ` • ${currentAlert.eta}`}
                </div>
              </div>
            )}

            {/* NORMAL MESSAGE */}
            {!currentAlert && (
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "10px",
                  color: "var(--green-600)",
                }}
              >
                {error ? "Unable to check municipal alert data right now." :
                  loading ? "Checking published municipal alerts…" :
                  "No published service alerts for this area. This does not guarantee services are unaffected."}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AreaStatus;