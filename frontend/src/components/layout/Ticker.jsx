
import { useLiveAlerts } from "../../context/LiveAlertsContext";

/*
 * METRONOTIFY - LIVE ALERT TICKER
 *
 * This component displays municipal service alerts
 * on the scrolling bar at the top of the homepage.
 *
 * It:
 * 1. Loads administrator-published alerts.
 * 2. Excludes resolved and closed incidents.
 * 3. Shows the best available recorded location.
 * 4. Avoids displaying missing-location placeholders.
 * 5. Never guesses a suburb from GPS coordinates.
 */

function Ticker() {

  // Retrieve public alerts from the shared alert context.
  const {
    alerts = [],
    loading,
    error
  } = useLiveAlerts();

  /*
   * FILTER ACTIVE ALERTS
   *
   * Resolved and closed incidents should not appear
   * in the live scrolling ticker.
   */
  const active = alerts
    .filter((alert) =>
      !["resolved", "closed"].includes(
        String(alert.status || "")
          .trim()
          .toLowerCase()
      )
    )
    .slice(0, 5);

  /*
   * FIND THE BEST AVAILABLE LOCATION
   *
   * Use the recorded area first, then municipality,
   * location or province.
   *
   * Ignore placeholder values saved in older records.
   */
  function getPlace(alert) {

    const placeholders = [
      "area not recorded",
      "area not specified",
      "location not provided",
      "not specified",
      "coordinates only",
      "unknown",
      "none"
    ];

    const place = [
      alert.area,
      alert.municipality,
      alert.location,
      alert.province
    ].find((value) =>
      typeof value === "string" &&
      value.trim() &&
      !placeholders.includes(
        value.trim().toLowerCase()
      )
    );

    // Return a real recorded location when available.
    if (place) {
      return place.trim();
    }

    /*
     * Some older incidents only saved a GPS pin.
     * We cannot identify a suburb from coordinates
     * without additional location information.
     */
    if (
      typeof alert.lat === "number" &&
      typeof alert.lng === "number"
    ) {
      return "Map pin recorded; locality not provided";
    }

    return "Locality not provided";
  }

  /*
   * BUILD THE SCROLLING MESSAGE
   *
   * Show loading or error messages when necessary.
   * Otherwise display up to five active alerts.
   */
  const message = error
    ? "Municipal alert feed unavailable"
    : loading
      ? "Loading municipal alerts..."
      : active.length
        ? active
            .map(
              (alert) =>
                `${alert.type || "Municipal"}: ` +
                `${alert.title || "Service incident"} — ` +
                `${getPlace(alert)}`
            )
            .join("   |   ")
        : "No administrator-published active alerts at this time";

  // Display the live scrolling alert information.
  return (
    <div
      aria-live="polite"
      className="ticker-bar"
      role="status"
    >
      <span
        aria-hidden="true"
        className="ticker-label"
      >
        Live
      </span>

      <span className="ticker-text">
        {message}
      </span>
    </div>
  );
}

export default Ticker;
