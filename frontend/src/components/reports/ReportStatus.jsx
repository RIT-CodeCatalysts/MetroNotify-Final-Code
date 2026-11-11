import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { REPORT_STATUS_FLOW, statusBadgeClass } from "../../data/reportStatus";
import { apiRequest, toDisplayStatus } from "../../services/api";

export { statusBadgeClass };

function ReportStatus() {
  const { currentUser } = useAuth();
  const [refInput, setRefInput] = useState("");
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const ref = refInput.trim();
    if (!ref) return;
    setError(""); setReport(null); setBusy(true);
    try {
      const result = await apiRequest(`/api/reports/${encodeURIComponent(ref)}`);
      setReport(result.report);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  const stage = !report ? 0 : report.status === "resolved" ? 4 :
    report.status === "in_progress" ? 3 : report.status === "assigned" ? 2 :
    report.verification === "verified" ? 1 : 0;
  const displayStatus = report ? toDisplayStatus(report.status) : "";

  return (
    <div>
      <form onSubmit={handleSubmit} className="form-grid">
        <div className="form-field full">
          <label>Reference Number *</label>
          <input type="text" value={refInput} onChange={(e) => setRefInput(e.target.value)}
            placeholder="e.g. MN-AgINfbJgzwnr5Lzc70IF" required />
          <div className="field-hint">Only your own reports can be retrieved with a Ratepayer account.</div>
        </div>
        <div className="form-field full">
          <button className="btn-primary btn-gold" type="submit" disabled={busy}>
            {busy ? "Checking Firestore…" : "🔍 Check Status"}
          </button>
        </div>
      </form>
      {!currentUser && <p>Please sign in to track your report.</p>}
      {error && <p role="alert" className="field-hint eta-not-found">{error}</p>}
      {report && <div className="eta-result">
        <div className="eta-result-header">
          <span>Current status</span>
          <span className={`status-badge ${statusBadgeClass(displayStatus)}`}>{displayStatus}</span>
        </div>
        <div className="eta-result-header">
          <span>Reference</span><strong>{report.referenceNumber}</strong>
        </div>
        <div className="eta-result-header">
          <span>Verification</span><span>{report.verification === "verified" ? "✅ Verified" : "🕓 Pending review"}</span>
        </div>
        <div className="eta-timeline">
          {REPORT_STATUS_FLOW.map((item, index) => (
            <div key={item.key} className={`eta-step ${index <= stage ? "done" : ""}`}>
              <span className="eta-dot" />
              <span className="eta-step-label">{item.short}</span>
            </div>
          ))}
        </div>
        <p className="field-hint">Live status from Firestore. The municipality has not provided a confirmed ETA unless published in an alert.</p>
      </div>}
    </div>
  );
}
export default ReportStatus;
