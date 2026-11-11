import { useEffect, useMemo, useState } from "react";
import AlertCard from "../common/AlertCard";
import { useLiveAlerts } from "../../context/LiveAlertsContext";

const VISIBLE_LIMIT = 5;

function ActiveAlerts() {
  const { alerts, loading, error, refresh } = useLiveAlerts();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [showAll, setShowAll] = useState(false);
  const [, forceRerender] = useState(0);

  const filteredAlerts = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return alerts.filter((alert) => {
      const matchesSearch =
        !search ||
        alert.province?.toLowerCase().includes(search) ||
        alert.municipality?.toLowerCase().includes(search) ||
        alert.area?.toLowerCase().includes(search) ||
        alert.location?.toLowerCase().includes(search) ||
        alert.title?.toLowerCase().includes(search) ||
        alert.type?.toLowerCase().includes(search) ||
        alert.severity?.toLowerCase().includes(search);

      let matchesFilter = true;

      if (activeFilter === "Electricity") {
        matchesFilter =
          alert.typeClass === "electricity";
      }

      if (activeFilter === "Water") {
        matchesFilter =
          alert.typeClass === "water";
      }

      if (activeFilter === "Critical") {
        matchesFilter =
          alert.severityClass === "critical";
      }

      if (activeFilter === "Resolved") {
        matchesFilter =
          alert.status?.toLowerCase() === "resolved";
      }

      return matchesSearch && matchesFilter;
    });
  }, [searchTerm, activeFilter, alerts]);

  // Collapse back down to 5 whenever the search or filter changes, so a
  // narrower result set doesn't stay stuck in "showing everything" mode.
  useEffect(() => {
    setShowAll(false);
  }, [searchTerm, activeFilter, alerts]);

  const visibleAlerts = showAll
    ? filteredAlerts
    : filteredAlerts.slice(0, VISIBLE_LIMIT);

  const hiddenCount = filteredAlerts.length - visibleAlerts.length;

  function handleFilter(filter) {
    setActiveFilter(filter);
  }

  function handleReset() {
    setSearchTerm("");
    setActiveFilter("All");
    setShowAll(false);
  }

  return (
    <div
      id="alerts"
      className="card"
      
    >
      <div className="card-header">
        <div className="card-title">
          🚨 Active Alerts
        </div>

        <button
          className="btn-filter"
          type="button"
          style={{
            fontSize: "12px",
            padding: "5px 10px",
          }}
          onClick={handleReset}
        >
          Reset
        </button>
      </div>

      <div className="card-body">

        {loading && <p>Loading published municipal alerts…</p>}
        {error && <p role="alert" style={{ color: "crimson" }}>Live alert service unavailable: {error}</p>}
        <button type="button" className="btn-filter" onClick={refresh}>↻ Refresh Alerts</button>

        {/* SEARCH */}
        <div className="search-bar">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) =>
              setSearchTerm(e.target.value)
            }
            placeholder="Search by province, municipality, area or alert..."
            aria-label="Search alerts"
          />

          {searchTerm && (
            <button
              type="button"
              className="btn-filter"
              onClick={() => setSearchTerm("")}
            >
              Clear
            </button>
          )}
        </div>

        {/* FILTERS */}
        <div className="filter-row">

          {[
            "All",
            "Electricity",
            "Water",
            "Critical",
            "Resolved",
          ].map((filter) => (
            <button
              key={filter}
              type="button"
              className={`filter-chip ${
                activeFilter === filter
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                handleFilter(filter)
              }
            >
              {filter === "All" && "All"}
              {filter === "Electricity" &&
                "⚡ Electricity"}
              {filter === "Water" && "💧 Water"}
              {filter === "Critical" &&
                "🔴 Critical"}
              {filter === "Resolved" &&
                "✅ Resolved"}
            </button>
          ))}

        </div>

        {/* RESULT COUNT */}
        <div
          style={{
            marginTop: "10px",
            marginBottom: "10px",
            fontSize: "12px",
            color: "var(--green-700)",
            fontWeight: "600",
          }}
        >
          {filteredAlerts.length}{" "}
          {filteredAlerts.length === 1
            ? "alert"
            : "alerts"}{" "}
          found
        </div>

        {/* ALERTS */}
        <div className="alert-list">

          {filteredAlerts.length === 0 ? (
            <div
              style={{
                padding: "25px 15px",
                textAlign: "center",
                color: "var(--text-muted)",
              }}
            >
              <div
                style={{
                  fontSize: "28px",
                  marginBottom: "8px",
                }}
              >
                🔎
              </div>

              <strong
                style={{
                  display: "block",
                  color: "var(--green-800)",
                  marginBottom: "5px",
                }}
              >
                No alerts found
              </strong>

              <span style={{ fontSize: "12px" }}>
                {alerts.length === 0 ? "No administrator-published alerts at the moment." : "Try another search or filter."}
              </span>
            </div>
          ) : (
            visibleAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onVoteCast={() => forceRerender((n) => n + 1)}
              />
            ))
          )}

        </div>

        {/* VIEW ALL / SHOW LESS */}
        {filteredAlerts.length > VISIBLE_LIMIT && (
          <div className="alert-list-toggle">
            <button
              type="button"
              className="btn-filter"
              onClick={() => setShowAll((prev) => !prev)}
            >
              {showAll
                ? "Show less"
                : `View all (${hiddenCount} more)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ActiveAlerts;