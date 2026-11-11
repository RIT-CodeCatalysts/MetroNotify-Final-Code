import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../services/api";

/*
 * METRONOTIFY - ADMIN ALERT LOCATIONS
 *
 * This component allows Municipal Admin to:
 *
 * 1. View published municipal service alerts.
 * 2. Identify alerts with missing area names.
 * 3. Enter a verified suburb or public locality.
 * 4. Save corrected locations to Firestore.
 * 5. Refresh alert information.
 *
 * This applies to all municipal service types.
 *
 * Private billing addresses must not be published.
 */

// These values do not represent valid area names.
const UNKNOWN = new Set([
  "",
  "unknown",
  "none",
  "not specified",
  "area not recorded",
  "area not specified",
  "location not provided",
  "coordinates only",
  "locality not provided",
  "location pin recorded; locality not provided",
  "map pin recorded; locality not provided"
]);

/*
 * Check whether a recorded location contains
 * a valid public area name.
 */
function hasArea(value) {
  const area = String(value || "")
    .trim()
    .toLowerCase();

  return !UNKNOWN.has(area);
}

/*
 * Check whether an incident has already
 * been resolved or closed.
 */
function isClosed(status) {
  return ["resolved", "closed"].includes(
    String(status || "")
      .trim()
      .toLowerCase()
  );
}

export default function AdminAlertLocations() {

  // Store alerts retrieved from Firebase Firestore.
  const [alerts, setAlerts] = useState([]);

  // Store the area names entered by Admin.
  const [drafts, setDrafts] = useState({});

  // Track confirmation of verified locations.
  const [confirmed, setConfirmed] = useState({});

  // Track loading and saving operations.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");

  // Display error and success messages.
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Allow Admin to view all published alerts.
  const [showAll, setShowAll] = useState(false);

  /*
   * LOAD ALERTS FROM FIREBASE
   *
   * Retrieve all alerts through the secured
   * Municipal Admin Flask endpoint.
   */
  const reload = useCallback(async () => {

    setLoading(true);
    setError("");

    try {

      const response = await apiRequest(
        "/api/admin/alerts"
      );

      setAlerts(response.alerts || []);

    } catch (err) {

      setError(
        err.message || "Unable to load alerts."
      );

    } finally {

      setLoading(false);

    }

  }, []);

  // Load alerts when this component opens.
  useEffect(() => {
    reload();
  }, [reload]);

  /*
   * FILTER ACTIVE ALERTS
   *
   * Only published and unresolved alerts
   * are included in the location review.
   */
  const active = alerts.filter(
    (alert) =>
      alert.published === true &&
      !isClosed(alert.status)
  );

  /*
   * IDENTIFY ALERTS WITH MISSING AREAS
   *
   * Some older reports contain GPS coordinates
   * but no suburb or area name.
   */
  const missingArea = active.filter(
    (alert) => !hasArea(alert.area)
  );

  // Display missing areas or every active alert.
  const shown = showAll ? active : missingArea;

  /*
   * SAVE A VERIFIED PUBLIC AREA
   *
   * Admin must enter a valid locality and confirm
   * that the information has been checked.
   *
   * Flask performs the final authorisation and
   * saves the correction to Firebase Firestore.
   */
  async function save(alert) {

    const area = String(
      drafts[alert.id] || ""
    ).trim();

    // Validate the area name.
    if (
      area.length < 2 ||
      area.length > 100 ||
      !confirmed[alert.id]
    ) {
      setError(
        "Enter a verified public area and confirm that you checked it."
      );
      return;
    }

    /*
     * Prevent obvious private street addresses
     * from being published as public suburbs.
     */
    if (
      /^\d+\s/.test(area) ||
      /\b(street|avenue|drive|road|lane|crescent|boulevard)\b/i.test(area)
    ) {
      setError(
        "Use a suburb, ward or public locality, not a house address."
      );
      return;
    }

    setSaving(alert.id);
    setError("");
    setNotice("");

    try {

      /*
       * Send the verified location to Flask.
       * The backend updates the selected Firestore alert.
       */
      await apiRequest(
        `/api/admin/alerts/${encodeURIComponent(
          alert.id
        )}/location`,
        {
          method: "PATCH",
          body: {
            area,
            confirmedAgainstIncident: true
          }
        }
      );

      // Show a success message.
      setNotice(
        `Saved the verified area for ${
          alert.title || "the alert"
        }.`
      );

      // Reset the confirmation checkbox.
      setConfirmed((previous) => ({
        ...previous,
        [alert.id]: false
      }));

      // Clear the input field after saving.
      setDrafts((previous) => ({
        ...previous,
        [alert.id]: ""
      }));

      // Refresh the saved Firestore information.
      await reload();

    } catch (err) {

      setError(
        err.message || "Unable to update the location."
      );

    } finally {

      setSaving("");

    }
  }

  return (
    <section
      aria-label="Review public alert locations"
      style={{
        marginTop: 20,
        padding: 16,
        border: "1px solid #b8caa9",
        borderRadius: 10
      }}
    >

      {/* Section heading */}
      <h3 style={{ color: "#244725" }}>
        📍 Alert Locations — All Service Types
      </h3>

      <p>
        Review missing suburb or area names for every
        type of active public alert.
      </p>

      {/* Display the number of missing locations */}
      <p>
        <strong>{missingArea.length}</strong>
        {" "}active alerts need a named public area
        {" · "}
        <strong>{active.length}</strong>
        {" "}active published alerts loaded
      </p>

      {/* Refresh and display options */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12
        }}
      >

        <button
          type="button"
          className="btn-filter"
          onClick={reload}
          disabled={loading || !!saving}
        >
          ↻ Refresh Alert Areas
        </button>

        <label
          style={{
            display: "flex",
            gap: 7,
            alignItems: "center"
          }}
        >
          <input
            type="checkbox"
            checked={showAll}
            onChange={(event) =>
              setShowAll(event.target.checked)
            }
          />

          Show all active alerts
        </label>

      </div>

      {/* Loading message */}
      {loading && (
        <p>Loading public alerts...</p>
      )}

      {/* Error message */}
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}

      {/* Success message */}
      {notice && (
        <p role="status" style={{ color: "#245b22" }}>
          {notice}
        </p>
      )}

      {/* Display message when all locations are recorded */}
      {!loading &&
        !error &&
        missingArea.length === 0 && (
          <p>
            Every active published alert has a recorded
            public area.
          </p>
        )}

      {/* Display active alert records */}
      <div
        style={{
          maxHeight: 520,
          overflowY: "auto"
        }}
      >

        {shown.map((alert) => (

          <article
            key={alert.id}
            style={{
              marginTop: 12,
              padding: 12,
              border: "1px solid #cdddc4",
              borderRadius: 8
            }}
          >

            {/* Alert category and title */}
            <strong>
              {alert.type || "Municipal"}
              {" — "}
              {alert.title || "Service incident"}
            </strong>

            {/* Firestore alert reference */}
            <p style={{ fontSize: 12 }}>
              Alert ID: {alert.id}
            </p>

            {/* Current public location */}
            <p style={{ color: "#244725" }}>
              Currently displayed:{" "}
              {alert.location || "Locality not provided"}
            </p>

            {/* Municipality from the incident record */}
            <p>
              Recorded municipality:{" "}
              {alert.municipality || "Not recorded"}
            </p>

            {/* Display an existing public area */}
            {hasArea(alert.area) && (
              <p>
                Current public area: {alert.area}
              </p>
            )}

            {/* Input for correcting the public locality */}
            <label
              htmlFor={`public-area-${alert.id}`}
              style={{
                display: "block",
                color: "#244725",
                fontWeight: 700
              }}
            >
              Verified public area / suburb
            </label>

            <input
              id={`public-area-${alert.id}`}
              type="text"
              maxLength={100}
              placeholder="For example: Somerset West"
              value={drafts[alert.id] || ""}
              onChange={(event) =>
                setDrafts((previous) => ({
                  ...previous,
                  [alert.id]: event.target.value
                }))
              }
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 10,
                border: "1px solid #b8caa9",
                borderRadius: 7,
                background: "#ffffff",
                color: "#223322"
              }}
            />

            {/* Admin confirms the location was checked */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 10
              }}
            >
              <input
                type="checkbox"
                checked={!!confirmed[alert.id]}
                onChange={(event) =>
                  setConfirmed((previous) => ({
                    ...previous,
                    [alert.id]: event.target.checked
                  }))
                }
              />

              I checked this public locality against
              reliable incident information
            </label>

            {/* Save the corrected location */}
            <button
              type="button"
              className="btn-filter"
              style={{ marginTop: 10 }}
              disabled={
                !!saving ||
                !confirmed[alert.id] ||
                String(drafts[alert.id] || "")
                  .trim().length < 2
              }
              onClick={() => save(alert)}
            >
              {saving === alert.id
                ? "Saving..."
                : "Save Verified Public Area"}
            </button>

          </article>

        ))}

      </div>

    </section>
  );
}
