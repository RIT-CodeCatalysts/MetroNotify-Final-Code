import { useState } from "react";
import { apiRequest } from "../../services/api";

export default function EnquiryForm() {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await apiRequest("/api/enquiries", { method: "POST", body: { message: message.trim() } });
      setSent(true);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  if (sent) return <div className="form-success">
    <div className="success-icon">✓</div>
    <h3>Enquiry Saved in Firebase</h3>
    <p>Your enquiry is available to the Municipal Admin team.</p>
    <button type="button" className="btn-filter" onClick={() => { setSent(false); setMessage(""); }}>New Enquiry</button>
  </div>;

  return <form onSubmit={handleSubmit}>
    <div className="form-grid"><div className="form-field full">
      <label>Your Enquiry *</label>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)}
        placeholder="What would you like to ask?" maxLength={200} required />
      <div className="char-count">{message.length}/200</div>
    </div></div>
    {error && <p role="alert" className="auth-error">{error}</p>}
    <button type="submit" className="btn-primary btn-gold" style={{ marginTop: 10 }} disabled={busy || message.trim().length < 5}>
      {busy ? "Sending…" : "📨 Send Enquiry"}
    </button>
    <p className="form-footnote">Your enquiry is stored in Firestore and linked to your Firebase account.</p>
  </form>;
}
