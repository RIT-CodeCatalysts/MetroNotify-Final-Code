import { useNotifications } from "../../context/NotificationsContext";
import { useAuth } from "../../context/AuthContext";

function Notifications() {
  const { accountType } = useAuth();
  const {

    alerts,
    reportNotifs,
    activePanel,
    viewAlerts,
    viewReports,
    removeNotification,
    clearNotifications,
    unreadAlerts,
    unreadReports,
  } = useNotifications();

  // Show either service alerts or report updates
  const notifications =
    activePanel === "alerts" ? alerts : reportNotifs;

  return (
    <div id="notifications-card" className="card notifications-card">

      {/* Header */}
      <div className="card-header">
        <div className="card-title">
          <span aria-hidden="true">🔔</span>
          Notifications

          <div className="notification-count">
            {unreadAlerts + unreadReports}
          </div>
        </div>
      </div>

      <div className="card-body">

        {/* Notification tabs */}
        <div
          className="notification-tabs"
          role="tablist"
          aria-label="Notifications"
        >

          {/* Service Alerts */}
          <button
            type="button"
            role="tab"
            aria-selected={activePanel === "alerts"}
            className={`notification-tab ${
              activePanel === "alerts" ? "active" : ""
            }`}
            onClick={viewAlerts}
          >
            🚨 Service Alerts

            {unreadAlerts > 0 && (
              <span className="notification-badge">
                {unreadAlerts}
              </span>
            )}
          </button>

          {/* My Reports */}
          <button
            type="button"
            role="tab"
            aria-selected={activePanel === "reports"}
            className={`notification-tab ${
              activePanel === "reports" ? "active" : ""
            }`}
            onClick={viewReports}
          >
            📋 {accountType === "admin" ? "Admin Updates" : accountType === "technician" ? "Job Updates" : "My Reports"}

            {unreadReports > 0 && (
              <span className="notification-badge">
                {unreadReports}
              </span>
            )}
          </button>

        </div>

        {/* Notification actions */}
        {notifications.length > 0 && (
          <div className="notification-actions">
            <button
              type="button"
              onClick={() => clearNotifications(activePanel)}
            >
              Clear all
            </button>
          </div>
        )}

        {/* Empty state */}
        {notifications.length === 0 ? (
          <div className="empty-notifications">

            <div className="empty-icon">
              🔔
            </div>

            <h4>
              {activePanel === "alerts"
                ? "No service alerts"
                : "No report updates"}
            </h4>

            <p>
              {activePanel === "alerts"
                ? "There are currently no new municipal service alerts."
                : "Updates about your submitted reports will appear here."}
            </p>

          </div>
        ) : (

          /* Notification list */
          <div className="notification-list">

            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`notification-item ${
                  !notification.read ? "unread" : ""
                }`}
              >

                {/* Icon */}
                <div className="notification-icon">
                  {notification.icon ||
                    (activePanel === "alerts"
                      ? "🚨"
                      : "📋")}
                </div>

                {/* Content */}
                <div className="notification-content">

                  <div className="notification-text">
                    {notification.text}
                  </div>

                  <div className="notification-meta">

                    {/* Status */}
                    {notification.statusLabel && (
                      <span className="notification-status">
                        {notification.statusLabel}
                      </span>
                    )}

                    {/* Time */}
                    <span>
                      {notification.time}
                    </span>

                  </div>

                  {/* Report reference */}
                  {notification.reportRef && (
                    <div className="notification-reference">
                      Reference:{" "}
                      <strong>
                        {notification.reportRef}
                      </strong>
                    </div>
                  )}

                </div>

                {/* Remove notification */}
                <button
                  type="button"
                  className="notification-remove"
                  onClick={() =>
                    removeNotification(
                      notification.id,
                      activePanel
                    )
                  }
                  aria-label="Remove notification"
                >
                  ×
                </button>

              </div>
            ))}

          </div>
        )}

      </div>
    </div>
  );
}

export default Notifications;