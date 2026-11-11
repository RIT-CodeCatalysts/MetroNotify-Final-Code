import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { useLiveAlerts } from "../../context/LiveAlertsContext";
import { statusBadgeClass } from "../../data/reportStatus";

// Roughly centres South Africa.
const SOUTH_AFRICA_CENTER = [-29.0, 24.5];
const DEFAULT_ZOOM = 5;

// Colour used for each severity, matching the badge colours used
// elsewhere (AreaStatus, AlertCard) so the map stays visually
// consistent with the rest of MetroNotify.
const SEVERITY_COLOR = {
  critical: "var(--danger)",
  high: "var(--warning)",
  medium: "var(--gold-600)",
  low: "var(--success)",
};

// Builds a small circular emoji marker instead of relying on Leaflet's
// default marker images (which need extra webpack asset config to load
// correctly in Create React App). This keeps the marker style
// consistent with the rest of the app's icon-driven design.
function buildIcon(alert) {
  const color = SEVERITY_COLOR[alert.severityClass] || "var(--text-muted)";
  const emoji = alert.typeClass === "water" ? "💧" : "⚡";

  return L.divIcon({
    className: "incident-marker",
    html: `<span class="incident-marker-dot" style="background:${color}">${emoji}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

/*
  Dashboard card showing every active/reported incident on a map.
  Uses the same `alerts` mock data as ActiveAlerts, so a real backend
  could later swap this data source without changing the map itself.
*/
function IncidentMap() {
  const { alerts, error } = useLiveAlerts();
  const markers = useMemo(
    () =>
      alerts.filter(
        (alert) => typeof alert.lat === "number" && typeof alert.lng === "number"
      ),
    [alerts]
  );

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">🗺️ Incident Map</div>
        <span className="map-legend">
          <span className="map-legend-dot" style={{ background: "var(--danger)" }} />
          Critical
          <span className="map-legend-dot" style={{ background: "var(--warning)" }} />
          High
          <span className="map-legend-dot" style={{ background: "var(--gold-600)" }} />
          Medium
        </span>
      </div>

      <div className="card-body map-card-body">
        {error && <p role="alert">Unable to retrieve the published incident map: {error}</p>}
        {!error && markers.length === 0 && <p>No approved, geolocated alerts to show yet.</p>}
        <MapContainer
          center={SOUTH_AFRICA_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={false}
          className="incident-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {markers.map((alert) => (
            <Marker
              key={alert.id}
              position={[alert.lat, alert.lng]}
              icon={buildIcon(alert)}
            >
              <Popup>
                <div className="map-popup">
                  <div className="map-popup-title">
                    {alert.type} {alert.title}
                  </div>

                  <div className="map-popup-row">
                    📍 {alert.area}, {alert.municipality}
                  </div>

                  <div className="map-popup-row">
                    🗓️ Reported {alert.reportedOn} ({alert.time})
                  </div>

                  <div className="map-popup-row">
                    <span
                      className={`status-badge ${statusBadgeClass(
                        alert.status === "Resolved" ? "Resolved" : "Investigation / Action"
                      )}`}
                    >
                      {alert.status}
                    </span>
                  </div>

                  <div className="map-popup-row">
                    {alert.verification === "Verified" ? "✅" : "🕓"}{" "}
                    {alert.verification}
                  </div>

                  <p className="map-popup-description">{alert.description}</p>

                  <div className="map-popup-ref">Report ID: {alert.reportId}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

export default IncidentMap;
