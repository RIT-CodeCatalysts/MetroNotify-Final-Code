import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

export default function VerifyEmailPage() {
  const { currentUser, resendVerificationEmail, checkVerification,
    logout, authError, authNotice } = useAuth();
  const [busy, setBusy] = useState(false);
  async function act(callback) {
    setBusy(true);
    try { await callback(); } finally { setBusy(false); }
  }
  return (
    <div className="login-page">
      <div className="login-brand-panel">
        <div className="login-brand-mark">M</div>
        <h1>MetroNotify</h1>
        <p>Secure municipal service reporting</p>
      </div>
      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-heading"><h2>Verify your email address</h2></div>
          <p>Please open the Firebase verification link sent to <strong>{currentUser?.email}</strong>.</p>
          <p className="form-footnote" style={{ textAlign: "left" }}>
            Everyone uses the appropriate MetroNotify portal after verification.
            Each technician has their own password and accountable job history.
          </p>
          {authError && <p role="alert" className="auth-error">{authError}</p>}
          {authNotice && <p role="status" className="auth-success">{authNotice}</p>}
          <button type="button" className="btn-primary" disabled={busy}
            onClick={() => act(checkVerification)}>I've verified my email — Continue</button>
          <button type="button" className="login-secondary-btn" disabled={busy}
            onClick={() => act(resendVerificationEmail)}>Resend verification email</button>
          <button type="button" className="login-secondary-btn" disabled={busy}
            onClick={() => act(logout)}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
