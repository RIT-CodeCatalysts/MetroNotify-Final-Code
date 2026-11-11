import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiRequest } from "../services/api";

const LiveAlertsContext = createContext(null);

export function LiveAlertsProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await apiRequest("/api/alerts");
      setAlerts((response.alerts || []).map((a) => ({ ...a, source: "firestore" })));
      setError("");
    } catch (e) {
      // Never present old hard-coded examples as current municipal alerts.
      setError(e.message);
      setAlerts([]);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);
  return <LiveAlertsContext.Provider value={{ alerts, loading, error, refresh }}>
    {children}
  </LiveAlertsContext.Provider>;
}

export function useLiveAlerts() {
  const value = useContext(LiveAlertsContext);
  if (!value) throw new Error("useLiveAlerts requires LiveAlertsProvider");
  return value;
}
