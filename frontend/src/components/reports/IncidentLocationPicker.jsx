
import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Default map position: Cape Town
const DEFAULT_CENTER = [-33.9249, 18.4241];

// Custom red location marker
const markerIcon = L.divIcon({
  className: "metro-incident-pin",
  html: `
    <div style="
      width: 22px;
      height: 22px;
      background: #e53935;
      border: 4px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 10px rgba(0,0,0,0.4);
    "></div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

// Convert map coordinates into clean numbers
function formatLocation(lat, lng) {
  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6))
  };
}

// Move map when the pin changes
function MapUpdater({ position }) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();

    if (position) {
      map.flyTo(
        [position.lat, position.lng],
        18,
        { duration: 0.6 }
      );
    }
  }, [map, position?.lat, position?.lng]);

  return null;
}

// Allow residents to click anywhere on the map
function MapClickHandler({ onChange }) {
  useMapEvents({
    click(event) {
      onChange(
        formatLocation(
          event.latlng.lat,
          event.latlng.lng
        )
      );
    }
  });

  return null;
}

// Draggable incident marker
function DraggableIncidentMarker({ value, onChange }) {
  if (!value) return null;

  return (
    <Marker
      position={[value.lat, value.lng]}
      icon={markerIcon}
      draggable={true}
      eventHandlers={{
        dragend(event) {
          const location = event.target.getLatLng();

          onChange(
            formatLocation(
              location.lat,
              location.lng
            )
          );
        }
      }}
    />
  );
}

// Turn a search result into a readable address
function getAddressLabel(feature) {
  const properties = feature.properties || {};

  const parts = [
    properties.housenumber,
    properties.street || properties.name,
    properties.city || properties.district,
    properties.state
  ].filter(Boolean);

  return parts.join(", ") || "Unnamed location";
}

function IncidentLocationPicker({
  value,
  onChange,
  address = "",
  area = "",
  municipality = "",
  province = ""
}) {
  const [searchText, setSearchText] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const cacheRef = useRef(new Map());
  const requestRef = useRef(null);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  // Use the address already entered in ReportForm,
  // unless the resident enters a different search.
  function buildSearchQuery() {
    const street = searchText.trim() || address.trim();

    return [
      street,
      area,
      municipality,
      province,
      "South Africa"
    ]
      .filter(Boolean)
      .join(", ");
  }

  // Select an address search result
  function selectLocation(feature) {
    const coordinates = feature.geometry?.coordinates;

    if (!Array.isArray(coordinates)) return;

    const [lng, lat] = coordinates;

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return;
    }

    onChange(formatLocation(lat, lng));
    setShowMap(true);
    setError("");
    setMessage(
      "Location found. Drag the red pin to the exact incident spot."
    );
  }

  // Search for an address using Photon geocoding.
  // Search happens only when the button is clicked.
  async function handleAddressSearch() {
    const query = buildSearchQuery();

    if (!address.trim() && !searchText.trim()) {
      setError(
        "Please enter a street address or landmark first."
      );
      return;
    }

    if (searching) return;

    setSearching(true);
    setError("");
    setMessage("");
    setResults([]);

    try {
      let features = cacheRef.current.get(query);

      if (!features) {
        const controller = new AbortController();
        requestRef.current = controller;

        const url = new URL(
          "https://photon.komoot.io/api/"
        );

        url.searchParams.set("q", query);
        url.searchParams.set("limit", "5");
        url.searchParams.set("lang", "en");

        const response = await fetch(url.toString(), {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(
            "Address search service is unavailable."
          );
        }

        const data = await response.json();

        features = (data.features || []).filter(
          (feature) =>
            Array.isArray(feature.geometry?.coordinates) &&
            feature.properties?.countrycode?.toLowerCase() === "za"
        );

        cacheRef.current.set(query, features);
      }

      if (features.length === 0) {
        setShowMap(true);
        setError(
          "We could not find that exact address. Try the street name or landmark, then place the pin manually."
        );
        return;
      }

      setResults(features);

      // Automatically place the first result on the map.
      selectLocation(features[0]);

    } catch (searchError) {
      if (searchError.name !== "AbortError") {
        console.error(
          "Address search failed:",
          searchError
        );

        setError(
          "Address search is unavailable. You can still open the map and select the location manually."
        );

        setShowMap(true);
      }
    } finally {
      setSearching(false);
      requestRef.current = null;
    }
  }

  return (
    <div className="form-field full">
      <div
        style={{
          border: "1px solid var(--border-strong)",
          borderRadius: "12px",
          padding: "16px",
          marginTop: "8px"
        }}
      >
        <label
          style={{
            display: "block",
            fontWeight: "600",
            marginBottom: "8px"
          }}
        >
          📍 Incident Location *
        </label>

        <p
          className="field-hint"
          style={{ marginBottom: "12px" }}
        >
          Search for the street address or landmark.
          You can then adjust the pin to the precise
          location of the problem.
        </p>

        {/* ADDRESS SEARCH */}

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap"
          }}
        >
          <input
            type="text"
            value={searchText}
            onChange={(event) =>
              setSearchText(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAddressSearch();
              }
            }}
            placeholder={
              address ||
              "e.g. 12 Beach Road, Gordon's Bay"
            }
            aria-label="Search incident address"
            className="form-control"
            style={{
              flex: "1",
              minWidth: "190px"
            }}
          />

          <button
            type="button"
            className="btn-filter"
            onClick={handleAddressSearch}
            disabled={searching}
          >
            {searching ? "Searching..." : "🔎 Find Address"}
          </button>
        </div>

        <p
          className="field-hint"
          style={{ marginTop: "8px" }}
        >
          Leave this search box empty to use the
          street address you entered above.
        </p>

        {/* SEARCH ERROR */}

        {error && (
          <p
            role="alert"
            style={{
              color: "#c0392b",
              marginTop: "10px",
              fontSize: "13px"
            }}
          >
            {error}
          </p>
        )}

        {/* SEARCH RESULTS */}

        {results.length > 1 && (
          <div style={{ marginTop: "12px" }}>
            <strong style={{ fontSize: "13px" }}>
              Possible address matches:
            </strong>

            <div
              style={{
                display: "grid",
                gap: "6px",
                marginTop: "8px"
              }}
            >
              {results.map((feature, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => selectLocation(feature)}
                  style={{
                    padding: "10px",
                    textAlign: "left",
                    cursor: "pointer",
                    borderRadius: "8px",
                    border:
                      "1px solid var(--border-strong)",
                    background: "transparent",
                    color: "inherit"
                  }}
                >
                  📍 {getAddressLabel(feature)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* OPEN OR CLOSE MAP */}

        <button
          type="button"
          className="btn-filter"
          onClick={() => setShowMap((open) => !open)}
          style={{ marginTop: "14px" }}
        >
          {showMap ? "Hide Map" : "🗺️ Open Map Manually"}
        </button>

        {/* INTERACTIVE MAP */}

        {showMap && (
          <div style={{ marginTop: "14px" }}>
            <div
              style={{
                height: "340px",
                width: "100%",
                borderRadius: "12px",
                overflow: "hidden",
                border:
                  "1px solid var(--border-strong)"
              }}
            >
              <MapContainer
                center={
                  value
                    ? [value.lat, value.lng]
                    : DEFAULT_CENTER
                }
                zoom={value ? 18 : 11}
                scrollWheelZoom={true}
                style={{
                  height: "100%",
                  width: "100%"
                }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <MapUpdater position={value} />

                <MapClickHandler onChange={onChange} />

                <DraggableIncidentMarker
                  value={value}
                  onChange={onChange}
                />
              </MapContainer>
            </div>

            <p
              className="field-hint"
              style={{ marginTop: "8px" }}
            >
              💡 Zoom in, click the incident spot or
              drag the red pin. Search results may be
              approximate, especially for house numbers.
            </p>
          </div>
        )}

        {/* LOCATION CONFIRMATION */}

        {value ? (
          <div
            style={{
              marginTop: "12px",
              padding: "12px",
              background: "rgba(46, 160, 90, 0.08)",
              borderRadius: "8px"
            }}
          >
            <strong>
              ✅ Incident location selected
            </strong>

            <p
              style={{
                fontSize: "12px",
                marginTop: "5px"
              }}
            >
              Latitude: {value.lat}
              {" | "}
              Longitude: {value.lng}
            </p>

            <p className="field-hint">
              {message ||
                "Please check that the pin is on the correct incident location."}
            </p>

            <button
              type="button"
              className="btn-filter"
              onClick={() => {
                onChange(null);
                setMessage("");
                setResults([]);
              }}
            >
              Clear Location
            </button>
          </div>
        ) : (
          <p
            className="field-hint"
            style={{ marginTop: "12px" }}
          >
            No location selected yet.
          </p>
        )}

        <p
          className="field-hint"
          style={{ marginTop: "12px" }}
        >
          Address search powered by Photon and
          OpenStreetMap data.
        </p>
      </div>
    </div>
  );
}

export default IncidentLocationPicker;
