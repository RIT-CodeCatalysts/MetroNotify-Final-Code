import { useEffect, useState } from "react";
import HeroStat from "../common/HeroStat";
import { apiRequest } from "../../services/api";

/*
 * Hero Component
 *
 * Displays the MetroNotify homepage and live municipal
 * statistics retrieved from the Flask backend.
 *
 * The statistics are calculated using Firestore data
 * instead of hard-coded values.
 */
function Hero() {
  // Store the latest statistics received from the backend.
  const [stats, setStats] = useState(null);

  // Track errors when the statistics cannot be loaded.
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Request the latest municipal statistics from Flask.
    async function refreshStatistics() {
      try {
        const data = await apiRequest("/api/public/statistics");

        // Update the component only while it is mounted.
        if (mounted) {
          setStats(data);
          setStatsError(false);
        }
      } catch (error) {
        if (mounted) {
          setStats(null);
          setStatsError(true);
        }
      }
    }

    // Load statistics when the homepage first opens.
    refreshStatistics();

    // Refresh every 15 seconds to display updated information.
    const timer = setInterval(refreshStatistics, 15000);

    // Stop the timer when the component is removed.
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <section aria-label="System overview" className="hero">
      <div className="hero-inner">
        <div className="hero-text">
          <h1>
            Community<span>Utility Alerts</span>
            <br />
            — Stay Informed
          </h1>

          <p>
            MetroNotify gives you real-time water &amp;
            electricity outage reports, advance warnings,
            and area status for your municipality.
          </p>

          {/* Inform users when live statistics are unavailable. */}
          {statsError && (
            <p role="status">
              Live statistics temporarily unavailable.
            </p>
          )}
        </div>

        {/* Display statistics obtained from Firestore via Flask. */}
        <div
          aria-label="Current statistics"
          className="hero-stats"
          role="list"
        >
          <HeroStat
            number={stats?.activeAlerts ?? "—"}
            label="Active alerts"
          />

          <HeroStat
            number={stats?.areasAffected ?? "—"}
            label="Areas affected"
          />

          <HeroStat
            number={stats?.highPriority ?? "—"}
            label="High-priority alerts"
          />

          <HeroStat
            number={stats?.endedToday ?? "—"}
            label="Alerts ended today"
          />
        </div>
      </div>
    </section>
  );
}

export default Hero;
