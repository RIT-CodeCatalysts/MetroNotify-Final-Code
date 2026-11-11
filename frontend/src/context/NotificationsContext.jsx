import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { apiRequest, toDisplayStatus } from "../services/api";
import { useLiveAlerts } from "./LiveAlertsContext";

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { currentUser } = useAuth();
  const { alerts: publishedAlerts } = useLiveAlerts();
  const [readAlertIds, setReadAlertIds] = useState([]);
  const [hiddenAlertIds, setHiddenAlertIds] = useState([]);
  const [reportNotifs, setReportNotifs] = useState([]);
  const [activePanel, setActivePanel] = useState("alerts");
  const [latestReport, setLatestReport] = useState(null);

  // These alert-read and dismiss preferences are also saved in Firestore.
  useEffect(() => {
    if (!currentUser?.id) { setReadAlertIds([]); setHiddenAlertIds([]); return; }
    let active = true;
    apiRequest("/api/me/preferences").then((prefs) => {
      if (!active) return;
      setReadAlertIds(prefs.readAlertIds || []);
      setHiddenAlertIds(prefs.hiddenAlertIds || []);
    }).catch((e) => console.warn("Could not load alert preferences:", e.message));
    return () => { active = false; };
  }, [currentUser?.id]);

  function saveAlertPreferences(patch) {
    if (currentUser) apiRequest("/api/me/preferences", { method: "PATCH", body: patch })
      .catch((e) => console.warn("Could not save alert preferences:", e.message));
  }

  const alerts = publishedAlerts.filter((a) => !hiddenAlertIds.includes(a.id)).map((a) => ({
    id: a.id, icon: "🚨",
    text: `${a.title} — ${a.area || a.municipality || "Municipal area"}`,
    time: a.time || "Recently", read: readAlertIds.includes(a.id),
    statusLabel: a.status, source: "firestore"
  }));

  const refreshNotifications = useCallback(async () => {
    if (!currentUser) { setReportNotifs([]); return; }
    try {
      const result = await apiRequest("/api/notifications");
      setReportNotifs((result.notifications || []).map((n) => ({
        id: n.id, text: [n.title, n.message].filter(Boolean).join(": "),
        reportRef: n.reportRef,
        statusLabel: toDisplayStatus(n.status), read: n.isRead,
        time: n.timestamp ? new Date(n.timestamp).toLocaleString() : "Recently",
        source: "firestore",
      })));
    } catch (error) {
      console.warn("Firestore notifications could not load:", error.message);
      setReportNotifs([]);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    refreshNotifications();
    const timer = setInterval(refreshNotifications, 15000);
    return () => clearInterval(timer);
  }, [refreshNotifications]);

  function markReportsRead(notifs = reportNotifs) {
    const unread = notifs.filter((n) => !n.read);
    setReportNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    Promise.all(unread.map((n) => apiRequest(
      `/api/notifications/${encodeURIComponent(n.id)}/read`, { method: "PATCH" }
    ))).then(refreshNotifications).catch((e) => console.warn(e.message));
  }

  const viewReports = () => { setActivePanel("reports"); markReportsRead(); };
  const viewAlerts = () => {
    setActivePanel("alerts");
    const ids = [...new Set([...readAlertIds, ...alerts.map((a) => a.id)])];
    setReadAlertIds(ids);
    saveAlertPreferences({ readAlertIds: ids });
  };
  const markPanelRead = (panel) => panel === "alerts" ? viewAlerts() : markReportsRead();
  const markNotificationRead = (id) => {
    setReportNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" })
      .then(refreshNotifications).catch((e) => console.warn(e.message));
  };
  const removeNotification = (id, panel) => {
    if (panel === "alerts") {
      const ids = [...new Set([...hiddenAlertIds, id])];
      setHiddenAlertIds(ids);
      saveAlertPreferences({ hiddenAlertIds: ids });
    } else {
      setReportNotifs((prev) => prev.filter((n) => n.id !== id));
      apiRequest(`/api/notifications/${encodeURIComponent(id)}`, { method: "DELETE" })
        .catch((e) => { console.warn(e.message); refreshNotifications(); });
    }
  };
  const clearNotifications = (panel) => {
    if (panel === "alerts") {
      const ids = [...new Set([...hiddenAlertIds, ...alerts.map((a) => a.id)])];
      setHiddenAlertIds(ids);
      saveAlertPreferences({ hiddenAlertIds: ids });
    } else {
      const ids = reportNotifs.map((n) => n.id);
      setReportNotifs([]);
      Promise.all(ids.map((id) => apiRequest(
        `/api/notifications/${encodeURIComponent(id)}`, { method: "DELETE" }
      ))).catch((e) => { console.warn(e.message); refreshNotifications(); });
    }
  };
  return <NotificationsContext.Provider value={{
    alerts, reportNotifs, activePanel, setActivePanel,
    latestReport, startReportLifecycle: (report) => { setLatestReport(report); refreshNotifications(); },
    markPanelRead, markNotificationRead, viewReports, viewAlerts,
    removeNotification, clearNotifications,
    unreadAlerts: alerts.filter((a) => !a.read).length,
    unreadReports: reportNotifs.filter((n) => !n.read).length,
    totalUnread: alerts.filter((a) => !a.read).length + reportNotifs.filter((n) => !n.read).length,
    refreshNotifications,
  }}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
