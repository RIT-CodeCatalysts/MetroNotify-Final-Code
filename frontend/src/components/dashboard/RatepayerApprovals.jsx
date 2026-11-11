
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../services/api";

/*
 * METRONOTIFY - MUNICIPAL BILLING APPROVALS
 *
 * This component allows the Municipal Admin to:
 *
 * 1. View registered ratepayers.
 * 2. Check their municipal billing details.
 * 3. Approve verified municipal accounts.
 * 4. Reject incorrect or incomplete details.
 * 5. Revoke an existing approval if necessary.
 *
 * All information is retrieved from Firebase Firestore
 * through the secured Flask backend.
 *
 * Only users with the Admin role can access the API.
 */

function RatepayerApprovals() {

  // Store the registered ratepayer accounts.
  const [ratepayers, setRatepayers] = useState([]);

  // Track loading and processing states.
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  // Display feedback to the Admin.
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Store confirmation of external billing checks.
  const [confirmed, setConfirmed] = useState({});

  // Store reasons entered when rejecting accounts.
  const [reasons, setReasons] = useState({});

  // Allow Admin to switch between pending and all accounts.
  const [showAll, setShowAll] = useState(false);

  /*
   * LOAD REGISTERED RATEPAYERS
   *
   * Retrieve ratepayer profiles using the Flask API.
   * The backend reads these records from Firestore.
   */
  const loadRatepayers = useCallback(async () => {
    try {
      const response = await apiRequest(
        "/api/admin/ratepayers"
      );

      setRatepayers(response.ratepayers || []);
      setError("");

    } catch (err) {
      setError(err.message);

    } finally {
      setLoading(false);
    }
  }, []);

  // Load accounts when the component opens.
  useEffect(() => {
    loadRatepayers();
  }, [loadRatepayers]);

  /*
   * HANDLE ADMIN DECISION
   *
   * Decisions:
   * approve - Municipal account is verified.
   * reject  - Billing details require correction.
   * revoke  - Remove existing account approval.
   *
   * Flask checks the Admin's Firebase role before
   * saving any changes to Firestore.
   */
  async function handleDecision(user, decision) {

    // Prevent duplicate submissions.
    if (busy) return;

    // Require confirmation of an independent billing check.
    if (decision === "approve" && !confirmed[user.id]) {
      setError(
        "Please confirm that you checked the municipal billing records."
      );
      return;
    }

    const reason = (reasons[user.id] || "").trim();

    // Rejected accounts must have a reason.
    if (decision === "reject" && reason.length < 5) {
      setError(
        "Please enter a reason for rejecting this account."
      );
      return;
    }

    // Ask for confirmation before revoking access.
    if (decision === "revoke") {
      const accepted = window.confirm(
        `Are you sure you want to revoke approval for ${user.name}?`
      );

      if (!accepted) return;
    }

    setBusy(user.id);
    setError("");
    setNotice("");

    try {

      // Send the Admin decision to the Flask backend.
      await apiRequest(
        `/api/admin/ratepayers/${encodeURIComponent(
          user.id
        )}/billing`,
        {
          method: "PATCH",
          body: {
            decision,
            note: decision === "reject" ? reason : "",
            confirmedAgainstRecords:
              decision === "approve"
          }
        }
      );

      // Display success feedback.
      setNotice(
        `Municipal billing review completed for ${user.name}.`
      );

      // Reset the confirmation checkbox.
      setConfirmed((previous) => ({
        ...previous,
        [user.id]: false
      }));

      // Refresh Firestore data after saving.
      await loadRatepayers();

    } catch (err) {
      setError(err.message);

    } finally {
      setBusy("");
    }
  }

  // Count accounts awaiting approval.
  const pendingCount = ratepayers.filter(
    (user) =>
      !(
        user.verified === true &&
        user.status === "verified"
      )
  ).length;

  // Filter accounts based on the Admin's selection.
  const displayedRatepayers = showAll
    ? ratepayers
    : ratepayers.filter(
        (user) =>
          !(
            user.verified === true &&
            user.status === "verified"
          )
      );

  return (
    <section
      aria-label="Municipal billing account approvals"
      style={{
        marginTop: 20,
        padding: 18,
        backgroundColor: "#ffffff",
        border: "1px solid #c2d5b5",
        borderRadius: 12
      }}
    >

      {/* Section heading */}
      <h3 style={{ color: "#244725" }}>
        🏛️ Municipal Billing Account Approvals
      </h3>

      <p className="field-hint">
        Review municipal billing details before allowing
        a ratepayer to submit service reports.
      </p>

      <p className="field-hint">
        Approval requires an independent check against
        municipal billing records. MetroNotify does not
        automatically validate account ownership.
      </p>

      {/* Summary of accounts awaiting verification */}
      <p>
        <strong>
          Accounts awaiting approval: {pendingCount}
        </strong>
      </p>

      {/* Refresh and filter controls */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 15
        }}
      >
        <button
          type="button"
          className="btn-filter"
          disabled={!!busy}
          onClick={loadRatepayers}
        >
          ↻ Refresh Ratepayers
        </button>

        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            color: "#244725"
          }}
        >
          <input
            type="checkbox"
            checked={showAll}
            onChange={(event) =>
              setShowAll(event.target.checked)
            }
          />

          Show all accounts
        </label>
      </div>

      {/* Display loading message */}
      {loading && (
        <p>Loading ratepayer accounts...</p>
      )}

      {/* Display errors */}
      {error && (
        <p
          role="alert"
          style={{ color: "crimson" }}
        >
          {error}
        </p>
      )}

      {/* Display successful updates */}
      {notice && (
        <p
          role="status"
          style={{ color: "#276014" }}
        >
          {notice}
        </p>
      )}

      {/* Display message when there are no accounts */}
      {!loading && displayedRatepayers.length === 0 && (
        <p>
          No ratepayer accounts are awaiting review.
        </p>
      )}

      {/* Display each registered ratepayer */}
      <div
        style={{
          display: "grid",
          gap: 15,
          maxHeight: 550,
          overflowY: "auto"
        }}
      >
        {displayedRatepayers.map((user) => {

          // Check if the account has already been approved.
          const approved =
            user.verified === true &&
            user.status === "verified";

          // Ensure all required billing details exist.
          const complete = Boolean(
            user.accountNumber?.trim() &&
            user.propertyAddress?.trim() &&
            user.municipality?.trim()
          );

          return (
            <article
              key={user.id}
              style={{
                padding: 15,
                border: "1px solid #c9d9bf",
                borderRadius: 10,
                backgroundColor: "#f9fcf5"
              }}
            >

              {/* Resident name and current status */}
              <h4
                style={{
                  color: "#244725",
                  marginBottom: 8
                }}
              >
                {user.name}
              </h4>

              <p>
                <strong>Status:</strong>{" "}
                {approved
                  ? "✓ Verified"
                  : user.status === "rejected"
                    ? "Rejected"
                    : "Pending Verification"}
              </p>

              {/* Resident details obtained from Firestore */}
              <p>
                <strong>Email:</strong>{" "}
                {user.email || "Not available"}
              </p>

              <p>
                <strong>Municipal account number:</strong>{" "}
                {user.accountNumber || "Not submitted"}
              </p>

              <p>
                <strong>Property address:</strong>{" "}
                {user.propertyAddress || "Not submitted"}
              </p>

              <p>
                <strong>Municipality:</strong>{" "}
                {user.municipality || "Not submitted"}
              </p>

              {/* Already-approved accounts can be revoked */}
              {approved ? (
                <div>
                  <p
                    style={{
                      color: "#276014",
                      fontWeight: 600
                    }}
                  >
                    ✓ Municipal billing account approved.
                    Reporting is enabled.
                  </p>

                  <button
                    type="button"
                    className="btn-filter"
                    disabled={!!busy}
                    onClick={() =>
                      handleDecision(user, "revoke")
                    }
                  >
                    Revoke Approval
                  </button>
                </div>

              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    marginTop: 15
                  }}
                >

                  {/* Admin confirms checking billing records */}
                  <label
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      color: "#244725"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!confirmed[user.id]}
                      onChange={(event) =>
                        setConfirmed((previous) => ({
                          ...previous,
                          [user.id]: event.target.checked
                        }))
                      }
                    />

                    I have checked the municipal billing records
                    and confirmed these details.
                  </label>

                  {/* Approve the municipal account */}
                  <button
                    type="button"
                    className="btn-filter"
                    disabled={
                      !complete ||
                      !confirmed[user.id] ||
                      !!busy
                    }
                    onClick={() =>
                      handleDecision(user, "approve")
                    }
                  >
                    ✓ Approve Municipal Account
                  </button>

                  {/* Rejection reason */}
                  <label
                    style={{
                      display: "grid",
                      gap: 6,
                      color: "#244725",
                      fontWeight: 600
                    }}
                  >
                    Reason for rejection

                    <textarea
                      rows={3}
                      maxLength={250}
                      value={reasons[user.id] || ""}
                      placeholder="Explain which details need correction..."
                      onChange={(event) =>
                        setReasons((previous) => ({
                          ...previous,
                          [user.id]: event.target.value
                        }))
                      }
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: 10,
                        border: "1px solid #b8caa9",
                        borderRadius: 8,
                        color: "#223322",
                        backgroundColor: "#ffffff"
                      }}
                    />
                  </label>

                  {/* Reject billing details */}
                  <button
                    type="button"
                    className="btn-filter"
                    disabled={!!busy}
                    onClick={() =>
                      handleDecision(user, "reject")
                    }
                  >
                    Reject Municipal Account
                  </button>

                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default RatepayerApprovals;
