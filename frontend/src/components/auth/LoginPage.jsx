import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

function LoginPage() {
  const {
    login,
    register,
    resetPassword,
    authError,
    authNotice,
    clearAuthError,
    clearAuthNotice,
  } = useAuth();

  const [mode, setMode] = useState("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(nextMode) {
    clearAuthError();
    clearAuthNotice();
    setMode(nextMode);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setBusy(true);
    await login(loginEmail, loginPassword);
    setBusy(false);
  }

  async function handleRegister(e) {
    e.preventDefault();
    setBusy(true);
    await register({ name, email, password, accountNumber, propertyAddress, municipality, emailNotificationsEnabled });
    setBusy(false);
  }

  async function handleForgotPassword() {
    setBusy(true);
    await resetPassword(loginEmail);
    setBusy(false);
  }

  return (
    <div className="login-page">
      <div className="login-brand-panel">
        <div className="login-brand-mark">M</div>
        <h1>MetroNotify</h1>
        <p>Municipal Service-Delivery Reporting & Alert System</p>
        <div className="login-role-list">
          <span>Ratepayer Portal</span>
          <span>Technician Portal</span>
          <span>Municipal Admin Portal</span>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-heading">
            <div className="login-mobile-logo">M</div>
            <div>
              <h2>{mode === "login" ? "Welcome back" : "Create Ratepayer Account"}</h2>
              <p>{mode === "login" ? "Sign in to continue to your MetroNotify portal." : "Registration is available for ratepayer users only."}</p>
            </div>
          </div>

          <div className="login-tabs">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>Log In</button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>Register</button>
          </div>

          {authError && <div className="auth-error">{authError}</div>}
          {authNotice && <div className="auth-success">{authNotice}</div>}

          {mode === "login" ? (
            <>
              <form onSubmit={handleLogin} className="login-form">
                <label>
                  Email Address
                  <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="name@example.com" required autoFocus />
                </label>
                <label>
                  Password
                  <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Enter your password" required />
                </label>
                <button className="btn-primary" type="submit" disabled={busy}>
                  {busy ? "Signing in..." : "Log In"}
                </button>
                <button className="login-secondary-btn" type="button" onClick={handleForgotPassword} disabled={busy}>
                  Forgot password?
                </button>
              </form>

              <div className="login-demo-note" style={{ marginTop: "16px" }}>
                Firebase Authentication is required. Staff accounts are created by the Municipal Admin.
                New technicians can select Forgot password to set their password after receiving an invitation.
              </div>
            </>
          ) : (
            <form onSubmit={handleRegister} className="login-form">
              <label>
                Full Name
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label>
                Email Address
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label>
                Password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength="12" required />
              </label>
              <p className="field-hint">Use a unique password of at least 12 characters. Never share it with teammates.</p>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <input type="checkbox" checked={emailNotificationsEnabled} onChange={(e) => setEmailNotificationsEnabled(e.target.checked)} style={{ width: "auto", marginTop: 4 }}/>
                Email me updates about my reports at my verified registered email address (optional).
              </label>
              <label>
                Municipal Account Number
                <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Optional — pending municipal verification" />
              </label>
              <label>
                Property Address
                <input value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} placeholder="Optional — for future municipal verification" />
              </label>
              <label>
                Municipality
                <input value={municipality} onChange={(e) => setMunicipality(e.target.value)} placeholder="Optional" />
              </label>
              <button className="btn-primary" type="submit" disabled={busy}>
                {busy ? "Creating account..." : "Create Ratepayer Account"}
              </button>
              <p className="login-demo-note">
                Accounts are created through Firebase Authentication. Municipal ratepayer details are stored as pending verification; they are not automatically checked against council billing records. Please use test details in the shared classroom project.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
