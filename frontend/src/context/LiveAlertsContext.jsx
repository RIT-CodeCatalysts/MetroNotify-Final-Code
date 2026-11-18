import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiRequest } from "../services/api";

// Create a shared context so Ticker + any other component
// can read the same alerts without each one fetching separately.
const LiveAlertsContext = createContext(null);

export function LiveAlertsProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /*
   * REFRESH - Fetch latest alerts from backend
   *
   * This calls GET /api/alerts on the backend.
   * The backend then does a Firestore getDocs() read.
   * So EVERY call here = Firestore reads on your quota.
   * We must call this as rarely as possible.
   */
  const refresh = useCallback(async () => {
    // FIX 1: STOP POLLING WHEN TAB IS HIDDEN
    // If the user minimised the tab / switched apps / left PC on overnight,
    // don't keep fetching. This was burning 50k reads overnight.
    // We return early and wait until they come back.
    if (document.hidden) return;

    try {
      const response = await apiRequest("/api/alerts");
      // Normalise alerts and tag them as coming from Firestore
      setAlerts((response.alerts || []).map((a) => ({ ...a, source: "firestore" })));
      setError("");
    } catch (e) {
      // Never present old hard-coded examples as current municipal alerts.
      setError(e.message);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /*
   * AUTO-REFRESH EFFECT
   *
   * OLD BUG: setInterval(refresh, 15000)
   * That was every 15 seconds, forever, even in background.
   * 4x per minute x 60 min x 8 hours = 1,920 fetches per tab.
   *
   * NEW: Every 2 minutes, and only when tab is visible.
   */
  useEffect(() => {
    // Fetch once immediately when app loads so Ticker isn't empty
    refresh();

    // FIX 2: SLOW DOWN POLLING
    // Was 15000ms (15 sec) -> Now 120000ms (2 minutes)
    // Ticker still looks "live" to users, but uses 8x fewer reads.
    const interval = setInterval(refresh, 120000);

    // FIX 3: REFRESH WHEN USER COMES BACK
    // If we paused while hidden, fetch fresh data the second
    // they return to the tab, so they don't see stale alerts.
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    // Cleanup: stop interval + listener when provider unmounts
    // Prevents duplicate intervals if component re-mounts.
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Share alerts + refresh function with Ticker and any other component
  return <LiveAlertsContext.Provider value={{ alerts, loading, error, refresh }}>
    {children}
  </LiveAlertsContext.Provider>;
}

/*
 * HOOK FOR COMPONENTS
 * Ticker.jsx uses this: const { alerts } = useLiveAlerts();
 * Throws if used outside <LiveAlertsProvider> so we catch setup errors early.
 */
export function useLiveAlerts() {
  const value = useContext(LiveAlertsContext);
  if (!value) throw new Error("useLiveAlerts requires LiveAlertsProvider");
  return value;
}
