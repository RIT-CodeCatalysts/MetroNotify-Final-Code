import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, toDisplayStatus, viewReportPhoto } from "../../services/api";
import { LEVELS, levelForXP, nextLevel, BADGES } from "../../data/gamification";
import { statusBadgeClass } from "../../data/reportStatus";
import MyEnquiries from "./MyEnquiries";

// Keep the profile labels readable against the light background.
const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 14,
  fontWeight: 700,
  color: "#244725",
  textAlign: "left"
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: 12,
  background: "#ffffff",
  border: "1px solid #b8caa9",
  borderRadius: 8,
  color: "#223322"
};

const ROLE_NAMES = {
  ratepayer: "Ratepayer",
  technician: "Municipal Technician",
  admin: "Municipal Admin"
};

/*
 * ProfilePage
 * Displays the user's Firebase profile, one-time municipal billing
 * verification, email preferences, rewards, reports and enquiries.
 * The Flask API enforces access permissions on the server.
 */
export default function ProfilePage({ onClose }) {
  const { currentUser, refreshProfile } = useAuth();

  const [billing, setBilling] = useState({
    accountNumber: "",
    propertyAddress: "",
    municipality: "",
    reviewNote: ""
  });
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingReady, setBillingReady] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [billingNotice, setBillingNotice] = useState("");
  // Live billing approval is read from Flask rather than a possibly cached login profile.
  const [billingApproval, setBillingApproval] = useState(null);
  const [editSavedDetails, setEditSavedDetails] = useState(false);

  const [myReports, setMyReports] = useState([]);
  const [error, setError] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  const isRatepayer = currentUser?.role === "ratepayer";
  // Treat the backend's latest verification response as the source of truth.
  const isVerified =
    billingReady &&
    billingApproval?.municipalAccountVerified === true &&
    billingApproval?.ratepayerStatus === "verified";
  const billingStatus = billingApproval?.ratepayerStatus || "pending";

  // Load saved billing details. Existing details are displayed instead of
  // asking the resident for the same information again.
  useEffect(() => {
    if (!isRatepayer) {
      setBillingLoading(false);
      return;
    }

    let active = true;
    setBillingLoading(true);
    setBillingReady(false);
    setBillingError("");

    apiRequest("/api/me/billing")
      .then((response) => {
        if (!active) return;
        const saved = response.billing || {};
        setBilling({
          accountNumber: saved.accountNumber || "",
          propertyAddress: saved.propertyAddress || currentUser?.propertyAddress || "",
          municipality: saved.municipality || currentUser?.municipality || "",
          reviewNote: saved.reviewNote || ""
        });
        setBillingApproval({
          ratepayerStatus: response.ratepayerStatus,
          municipalAccountVerified: response.municipalAccountVerified
        });
        setBillingReady(true);
      })
      .catch((err) => {
        if (active) {
          setBillingApproval(null);
          setBillingError(err.message);
        }
      })
      .finally(() => {
        if (active) setBillingLoading(false);
      });

    return () => { active = false; };
  }, [currentUser?.id, currentUser?.municipality, currentUser?.propertyAddress, isRatepayer]);

  /*
   * Refresh billing approval after an Admin changes the Firestore record.
   * This is useful when Admin approves the account in another browser tab.
   */
  async function refreshBillingStatus() {
    setBillingLoading(true);
    setBillingError("");
    try {
      const response = await apiRequest("/api/me/billing");
      const saved = response.billing || {};
      setBilling({
        accountNumber: saved.accountNumber || "",
        propertyAddress: saved.propertyAddress || "",
        municipality: saved.municipality || "",
        reviewNote: saved.reviewNote || ""
      });
      setBillingApproval({
        ratepayerStatus: response.ratepayerStatus,
        municipalAccountVerified: response.municipalAccountVerified
      });
      setBillingReady(true);
      await refreshProfile();
    } catch (err) {
      setBillingReady(false);
      setBillingApproval(null);
      setBillingError(err.message);
    } finally {
      setBillingLoading(false);
    }
  }

  // Submit the billing account for Admin review. A ratepayer cannot set
  // their own 'verified' flag: only the backend can change that status.
  async function submitBilling(event) {
    event.preventDefault();
    if (billingBusy || !billingReady) return;

    setBillingBusy(true);
    setBillingError("");
    setBillingNotice("");

    try {
      const result = await apiRequest("/api/me/billing", {
        method: "PATCH",
        body: {
          accountNumber: billing.accountNumber.trim(),
          propertyAddress: billing.propertyAddress.trim(),
          municipality: billing.municipality.trim()
        }
      });
      // Fetch the final server-side status before updating the form.
      await refreshBillingStatus();
      setEditSavedDetails(false);
      setBillingNotice(
        result.ratepayerStatus === "verified"
          ? "Your municipal account is already verified."
          : "Billing details submitted for Municipal Admin review."
      );
    } catch (err) {
      setBillingError(err.message);
    } finally {
      setBillingBusy(false);
    }
  }

  // Update the optional email preference without changing in-app alerts.
  async function updateEmailPreference(checked) {
    if (emailBusy) return;
    setEmailBusy(true);
    setError("");
    try {
      await apiRequest("/api/me/preferences", {
        method: "PATCH",
        body: { emailNotificationsEnabled: checked }
      });
      await refreshProfile();
    } catch (err) {
      setError(err.message);
    } finally {
      setEmailBusy(false);
    }
  }

  // Read only reports that the authenticated resident is authorised to see.
  const loadReports = useCallback(async () => {
    if (!isRatepayer) return;
    try {
      const result = await apiRequest("/api/reports");
      setMyReports(result.reports || []);
      await refreshProfile();
    } catch (err) {
      setError(err.message);
    }
  }, [isRatepayer, currentUser?.id, refreshProfile]);

  useEffect(() => { loadReports(); }, [loadReports]);

  // Confirm a completed repair through Flask, which checks report ownership.
  async function confirmResolution(reference) {
    if (confirmBusy) return;
    setConfirmBusy(true);
    setError("");
    try {
      await apiRequest(`/api/reports/${encodeURIComponent(reference)}/confirm`, {
        method: "POST"
      });
      await loadReports();
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirmBusy(false);
    }
  }

  if (!currentUser) return null;

  // Calculate the visible progress bar from XP saved in the user profile.
  const xp = Number(currentUser.xp ?? currentUser.points ?? 0) || 0;
  const level = levelForXP(xp);
  const next = nextLevel(xp);
  const progress = next
    ? Math.max(0, Math.min(100, Math.round(
        ((xp - level.minXP) / (next.minXP - level.minXP)) * 100
      )))
    : 100;

  const showAddressInput = editSavedDetails || !billing.propertyAddress;
  const showMunicipalityInput = editSavedDetails || !billing.municipality;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card modal-card-wide"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close profile">
          ✕
        </button>

        {/* Name and email already come from Firebase Authentication. */}
        <div className="profile-header">
          <div className="profile-avatar">
            {currentUser.name?.charAt(0).toUpperCase() || "M"}
          </div>
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 2 }}>{currentUser.name}</h2>
            <span className="role-badge-inline">
              {ROLE_NAMES[currentUser.role] || currentUser.role}
            </span>
            <p className="field-hint">{currentUser.email}</p>
          </div>
        </div>

        {/* Only residents need municipal billing approval. */}
        {isRatepayer && (
          <section aria-label="Municipal billing verification" style={{
            border: "1px solid #b8caa9", borderRadius: 10, padding: 16, marginTop: 14
          }}>
            <h3 style={{ fontSize: 16, margin: "0 0 8px", color: "#244725" }}>
              Municipal Billing Verification
            </h3>
            <p style={{ fontWeight: 700, textAlign: "left", color: "#244725" }} role="status">
              {billingLoading
                ? "Checking municipal billing approval..."
                : isVerified
                  ? "✓ Verified — reporting enabled"
                  : billingReady && billingStatus === "rejected"
                    ? "Rejected — please correct your billing details"
                    : billingReady
                      ? "Pending verification — reporting disabled"
                      : "Verification status temporarily unavailable"}
            </p>

            {/* Approval can happen in another session: check Firebase again. */}
            <button type="button" className="btn-filter"
              onClick={refreshBillingStatus} disabled={billingLoading || billingBusy}>
              ↻ Refresh Verification Status
            </button>
            <p className="field-hint" style={{ textAlign: "left", color: "#52634b" }}>
              Verification is required once. A Municipal Admin must approve your
              billing details before you can submit service reports.
            </p>

            {billingStatus === "rejected" && billing.reviewNote && (
              <p role="alert" style={{ color: "crimson" }}>
                Admin feedback: {billing.reviewNote}
              </p>
            )}

            {billingLoading && <p style={{ color: "#244725" }}>Loading saved billing details...</p>}
            {!billingLoading && billingReady && !isVerified && (
              <p style={{ color: "#52634b", textAlign: "left" }}>
                If Admin has already approved this account, refresh its status above.
                If it still says Pending, confirm the Admin approved this exact
                Firebase user and that the billing details were not changed afterward.
              </p>
            )}

            {isVerified ? (
              <p style={{ color: "#244725", fontWeight: 600 }}>
                ✓ Your municipal billing account has been approved. You can
                submit service reports without verifying again.
              </p>
            ) : !billingLoading && billingReady && (
              <form onSubmit={submitBilling} style={{ display: "grid", gap: 14, marginTop: 14 }}>
                {/* Preserve leading zeros by treating the account number as text. */}
                <div>
                  <label htmlFor="billing-account" style={labelStyle}>
                    Municipal account number *
                  </label>
                  <input id="billing-account" type="text" style={inputStyle}
                    required minLength={4} maxLength={100} autoComplete="off"
                    placeholder="Enter your municipal account number"
                    value={billing.accountNumber}
                    onChange={(e) => setBilling((old) => ({ ...old, accountNumber: e.target.value }))}
                  />
                </div>

                {/* Reuse address and municipality saved during registration. */}
                {showAddressInput ? (
                  <div>
                    <label htmlFor="billing-address" style={labelStyle}>Property address *</label>
                    <input id="billing-address" type="text" style={inputStyle}
                      required minLength={5} maxLength={250}
                      placeholder="Enter the property address on your municipal account"
                      value={billing.propertyAddress}
                      onChange={(e) => setBilling((old) => ({ ...old, propertyAddress: e.target.value }))}
                    />
                  </div>
                ) : (
                  <div>
                    <strong style={labelStyle}>Saved property address</strong>
                    <p style={{ margin: 0, textAlign: "left", color: "#244725" }}>{billing.propertyAddress}</p>
                  </div>
                )}

                {showMunicipalityInput ? (
                  <div>
                    <label htmlFor="billing-municipality" style={labelStyle}>Municipality *</label>
                    <input id="billing-municipality" type="text" style={inputStyle}
                      required minLength={2} maxLength={150}
                      placeholder="Enter your municipality"
                      value={billing.municipality}
                      onChange={(e) => setBilling((old) => ({ ...old, municipality: e.target.value }))}
                    />
                  </div>
                ) : (
                  <div>
                    <strong style={labelStyle}>Saved municipality</strong>
                    <p style={{ margin: 0, textAlign: "left", color: "#244725" }}>{billing.municipality}</p>
                  </div>
                )}

                {/* Residents can correct saved details before resubmitting. */}
                {(billing.propertyAddress || billing.municipality) && !editSavedDetails && (
                  <button type="button" className="btn-filter"
                    onClick={() => setEditSavedDetails(true)}>
                    Correct saved address or municipality
                  </button>
                )}

                <button type="submit" className="btn-filter" disabled={billingBusy}>
                  {billingBusy ? "Submitting..." : "Submit for Verification"}
                </button>
              </form>
            )}

            {billingError && <p role="alert" style={{ color: "crimson" }}>{billingError}</p>}
            {billingNotice && <p role="status" style={{ color: "#276014" }}>{billingNotice}</p>}
          </section>
        )}

        {/* Email preferences do not affect the built-in notification inbox. */}
        <div style={{ padding: "15px 0" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#244725" }}>
            <input type="checkbox" checked={!!currentUser.emailNotificationsEnabled}
              disabled={emailBusy}
              onChange={(e) => updateEmailPreference(e.target.checked)} />
            Receive report and job updates by email
          </label>
          <p className="field-hint" style={{ textAlign: "left" }}>
            Optional. Email delivery requires a configured email service;
            in-app notifications remain available.
          </p>
        </div>
        {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}

        {/* Gamification progress comes from the saved user record. */}
        <div className="profile-level-block">
          <div className="profile-level-row">
            <strong>Level {level.level} — {level.title}</strong>
            <span>{xp} XP{next ? ` / ${next.minXP} XP to next level` : " (max level)"}</span>
          </div>
          <div className="xp-bar-track">
            <div className="xp-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Show earned and locked badge milestones. */}
        <h3 style={{ fontSize: 13, margin: "14px 0 8px", color: "var(--green-700)" }}>
          Badges from Firebase
        </h3>
        <div className="badge-grid">
          {BADGES.map((badge) => {
            const earned = (currentUser.badges || []).includes(badge.id);
            return (
              <div key={badge.id} title={badge.description}
                className={`badge-chip ${earned ? "earned" : "locked"}`}>
                <span className="badge-icon">{badge.icon}</span>
                <span>{badge.label}</span>
              </div>
            );
          })}
        </div>

        {/* A ratepayer sees their reports and Admin replies in one profile. */}
        {isRatepayer && (
          <>
            <h3 style={{ fontSize: 13, margin: "16px 0 8px", color: "var(--green-700)" }}>
              My Firestore Reports ({myReports.length})
            </h3>
            <button type="button" className="btn-filter" onClick={loadReports}>
              ↻ Refresh reports
            </button>
            <div className="profile-reports-list">
              {myReports.length === 0 && (
                <p className="form-footnote">No Firestore reports have been submitted yet.</p>
              )}
              {myReports.map((report) => (
                <div key={report.referenceNumber} className="profile-report-row">
                  <div>
                    <strong>{report.utility}</strong> — {report.area || report.municipality || "Area not recorded"}
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {report.referenceNumber}
                    </div>
                  </div>
                  <span className={`status-badge ${statusBadgeClass(toDisplayStatus(report.status))}`}>
                    {toDisplayStatus(report.status)}
                  </span>
                  {report.photoAvailable && (
                    <button type="button" className="btn-filter"
                      onClick={() => viewReportPhoto(report.referenceNumber).catch((e) => setError(e.message))}>
                      View Photo
                    </button>
                  )}
                  {report.status === "resolved" && !report.resolutionConfirmed && (
                    <button type="button" className="btn-filter" disabled={confirmBusy}
                      onClick={() => confirmResolution(report.referenceNumber)}>
                      Confirm Fixed
                    </button>
                  )}
                  {report.resolutionConfirmed && (
                    <span className="mini-status status-resolved">Confirmed fixed</span>
                  )}
                </div>
              ))}
            </div>

            {/* File 5: Residents can read saved Admin replies here. */}
            <MyEnquiries />
          </>
        )}

        <p className="form-footnote" style={{ marginTop: 14 }}>
          Levels: {LEVELS.map((item) => `${item.title} (${item.minXP}+ XP)`).join(" · ")}
        </p>
      </div>
    </div>
  );
}
