import { useNotifications } from "../../context/NotificationsContext";
import { statusBadgeClass, utilityIcon } from "../../data/reportStatus";

// report -> the completed report object built in Report.jsx
// onReset -> callback to go back to a blank ReportForm
function ReportSuccess({ report, onReset }) {
  const { viewReports, reportNotifs } = useNotifications();

  // reportNotifs is newest-first, so the first match for this report's
  // reference number is its most recent status. Falls back to the
  // "Pending Review" status set at submit time if nothing has fired yet.
  const latestUpdate = reportNotifs.find(
    (n) => n.reportRef === report.referenceNumber
  );
  const currentStatus = latestUpdate ? latestUpdate.statusLabel : report.status;
  const currentVerification = latestUpdate
    ? latestUpdate.verification
    : report.verification;

  // Switches the sidebar Notifications widget to "My Reports" and scrolls
  // it into view, so the user sees the live status updates.
  function handleViewReports() {
    viewReports();
    document
      .getElementById("notifications-card")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="report-success">
      {/* Green banner header, matches the mockup */}
      <div className="success-header">
        <div className="success-icon">✓</div>

        <div>
          <h2>Report Submitted Successfully!</h2>
          <p>Thank you for helping us improve our services.</p>
        </div>
      </div>

      {/* Big centered checkmark card */}
      <div className="success-card">
        <div className="success-image">
          <div className="success-circle">✓</div>
        </div>

        <h3>Your report has been received</h3>
        <p>
          Your report has been received and will be reviewed by our team.
        </p>
      </div>

      {/* Reference number / summary of what was submitted */}
      <div className="summary-card">
        <div className="summary-row">
          <span>Reference Number</span>
          <span className="reference-number">{report.referenceNumber}</span>
        </div>

        <div className="summary-row">
          <span>Utility Type</span>
          <span>
            {utilityIcon(report.utility)} {report.utility}
          </span>
        </div>

        <div className="summary-row">
          <span>Area</span>
          <span>📍 {report.area}</span>
        </div>

        <div className="summary-row">
          <span>Submitted On</span>
          <span>{report.submittedOn}</span>
        </div>

        <div className="summary-row">
          <span>Status</span>
          {/* Live status — updates in place every time a new stage fires */}
          <span className={`status-badge ${statusBadgeClass(currentStatus)}`}>
            {currentStatus}
          </span>
        </div>

        {currentVerification && (
          <div className="summary-row">
            <span>Verification</span>
            <span className="verification-tag">
              {currentVerification === "Verified" ? "✅" : "🕓"}{" "}
              {currentVerification}
            </span>
          </div>
        )}
      </div>

      <p className="form-footnote" style={{ marginTop: "-6px" }}>
        Your report was saved in Firestore. Current status is received from the backend;
        a municipal officer must still review it.
      </p>

      {report.photoUploadWarning && (
        <p role="alert" className="form-footnote" style={{ color: "crimson" }}>
          {report.photoUploadWarning}
        </p>
      )}

      <div className="info-box info-box-blue">
        <h4>ℹ️ What happens next?</h4>
        <p>
          A municipal administrator can review and assign the issue. Status updates
          will appear in your MetroNotify notifications. SMS and email are not connected.
        </p>
      </div>

      <div className="info-box info-box-green">
        <h4>🔔 Stay updated</h4>
        <p>
          You can track your report status in the &ldquo;My Reports&rdquo;
          section.
        </p>

        <button className="btn-outline" onClick={handleViewReports}>
          View My Reports
        </button>
      </div>

      <div className="help-box">
        <h4>Need help?</h4>
        <p>If this is an emergency or immediate safety hazard, contact your actual municipality's verified emergency line.</p>
      </div>

      {/* Resets Report.jsx back to showing a blank ReportForm */}
      <button className="btn-primary" onClick={onReset}>
        + Submit Another Report
      </button>
    </div>
  );
}

export default ReportSuccess;
