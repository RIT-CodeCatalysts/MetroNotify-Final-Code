
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../services/api";

/*
 * METRONOTIFY - RATEPAYER ENQUIRIES
 *
 * This component allows the Municipal Admin to:
 *
 * 1. View enquiries submitted by residents.
 * 2. Mark new enquiries as reviewed.
 * 3. Write and send replies to residents.
 * 4. View previously answered enquiries.
 *
 * All enquiries and responses are stored in Firebase
 * Firestore through the secure Flask backend.
 *
 * Only authorised Municipal Admin accounts can reply.
 */

function FirestoreEnquiries() {

  // Store enquiries retrieved from Firestore.
  const [enquiries, setEnquiries] = useState([]);

  // Store the text entered for each enquiry.
  const [replies, setReplies] = useState({});

  // Track loading and processing states.
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  // Display success and error messages.
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  /*
   * LOAD ENQUIRIES FROM FIREBASE
   *
   * The Flask API retrieves enquiries stored in
   * Firestore and returns them to the Admin Portal.
   */
  const loadEnquiries = useCallback(async () => {
    try {
      const response = await apiRequest("/api/enquiries");

      setEnquiries(response.enquiries || []);
      setError("");

    } catch (err) {
      setError(err.message);

    } finally {
      setLoading(false);
    }
  }, []);

  // Load enquiries when the component opens.
  useEffect(() => {
    loadEnquiries();
  }, [loadEnquiries]);

  /*
   * UPDATE ENQUIRY STATUS
   *
   * reviewed = Admin has read the enquiry.
   * answered = Admin has sent a written response.
   *
   * Only the backend can save the official reply.
   */
  async function updateEnquiry(enquiry, status) {

    // Prevent multiple requests at the same time.
    if (busy) return;

    const reply = (replies[enquiry.id] || "").trim();

    // Require a meaningful response before sending.
    if (status === "answered" && reply.length < 5) {
      setError(
        "Please write a reply of at least 5 characters."
      );
      return;
    }

    setBusy(enquiry.id);
    setError("");
    setNotice("");

    try {

      // Send the update to the secured Flask API.
      await apiRequest(
        `/api/enquiries/${encodeURIComponent(enquiry.id)}`,
        {
          method: "PATCH",
          body:
            status === "answered"
              ? {
                  status: "answered",
                  reply: reply
                }
              : {
                  status: "reviewed"
                }
        }
      );

      // Confirm that the backend accepted the update.
      setNotice(
        status === "answered"
          ? "Your reply has been saved and the resident notified."
          : "Enquiry marked as reviewed."
      );

      // Clear the text box after sending a reply.
      setReplies((previous) => ({
        ...previous,
        [enquiry.id]: ""
      }));

      // Refresh enquiries to display the saved response.
      await loadEnquiries();

    } catch (err) {
      setError(err.message);

    } finally {
      setBusy("");
    }
  }

  // Count new enquiries waiting for Admin attention.
  const newCount = enquiries.filter(
    (enquiry) => enquiry.status === "new"
  ).length;

  return (
    <section
      aria-label="Ratepayer enquiries"
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
        📨 Ratepayer Enquiries
      </h3>

      <p className="field-hint">
        Read residents' enquiries, respond to their questions
        and keep them informed about municipal services.
      </p>

      {/* Show how many new enquiries require attention. */}
      <p>
        <strong>
          New enquiries: {newCount}
        </strong>
      </p>

      {/* Refresh button loads current Firestore data. */}
      <button
        type="button"
        className="btn-filter"
        disabled={!!busy}
        onClick={loadEnquiries}
      >
        ↻ Refresh Enquiries
      </button>

      {/* Loading feedback */}
      {loading && (
        <p>Loading enquiries from Firebase...</p>
      )}

      {/* Error feedback */}
      {error && (
        <p
          role="alert"
          style={{ color: "crimson" }}
        >
          {error}
        </p>
      )}

      {/* Success feedback */}
      {notice && (
        <p
          role="status"
          style={{ color: "#276014" }}
        >
          {notice}
        </p>
      )}

      {/* No enquiries available */}
      {!loading && enquiries.length === 0 && (
        <p>No enquiries have been submitted yet.</p>
      )}

      {/* Display each enquiry as a separate card. */}
      <div
        style={{
          display: "grid",
          gap: 15,
          marginTop: 15,
          maxHeight: 550,
          overflowY: "auto"
        }}
      >
        {enquiries.map((enquiry) => {

          // Check whether the enquiry has a saved reply.
          const hasReply = Boolean(enquiry.reply?.trim());

          return (
            <article
              key={enquiry.id}
              style={{
                padding: 15,
                border: "1px solid #c9d9bf",
                borderRadius: 10,
                backgroundColor: "#f9fcf5"
              }}
            >

              {/* Date and current enquiry status */}
              <p
                style={{
                  fontSize: 12,
                  color: "#52634b"
                }}
              >
                {enquiry.createdAt || "Date unavailable"}
              </p>

              <p>
                <strong>Status:</strong>{" "}
                {hasReply
                  ? "✓ Answered"
                  : enquiry.status === "reviewed"
                    ? "Under Review"
                    : enquiry.status === "answered"
                      ? "Answered — Reply not recorded"
                      : "New"}
              </p>

              {/* Display the resident's original question. */}
              <p>
                <strong>Resident's Enquiry:</strong>
              </p>

              <p
                style={{
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: "#edf5e7",
                  color: "#244725"
                }}
              >
                {enquiry.message}
              </p>

              {hasReply ? (

                /*
                 * Display the municipality's saved response.
                 * This remains visible after page refresh.
                 */
                <div
                  style={{
                    padding: 12,
                    marginTop: 10,
                    borderLeft: "4px solid #4a8015",
                    backgroundColor: "#eef8e9",
                    borderRadius: 6
                  }}
                >
                  <strong>
                    ✓ Municipal Response
                  </strong>

                  <p>{enquiry.reply}</p>

                  {enquiry.repliedAt && (
                    <small>
                      Replied on: {enquiry.repliedAt}
                    </small>
                  )}
                </div>

              ) : (

                <div>

                  {/* Reply text box for the Municipal Admin. */}
                  <label
                    htmlFor={`reply-${enquiry.id}`}
                    style={{
                      display: "block",
                      fontWeight: 700,
                      color: "#244725",
                      marginTop: 12,
                      marginBottom: 6
                    }}
                  >
                    Write a response to the resident
                  </label>

                  <textarea
                    id={`reply-${enquiry.id}`}
                    rows={4}
                    maxLength={1000}
                    placeholder="Type the municipality's response here..."
                    value={replies[enquiry.id] || ""}
                    onChange={(event) =>
                      setReplies((previous) => ({
                        ...previous,
                        [enquiry.id]: event.target.value
                      }))
                    }
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: 12,
                      border: "1px solid #b8caa9",
                      borderRadius: 8,
                      backgroundColor: "#ffffff",
                      color: "#223322",
                      resize: "vertical"
                    }}
                  />

                  {/* Admin action buttons */}
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      marginTop: 12
                    }}
                  >

                    {/* Mark an enquiry as reviewed. */}
                    {enquiry.status === "new" && (
                      <button
                        type="button"
                        className="btn-filter"
                        disabled={!!busy}
                        onClick={() =>
                          updateEnquiry(enquiry, "reviewed")
                        }
                      >
                        Mark Reviewed
                      </button>
                    )}

                    {/* Send the written response to Flask. */}
                    <button
                      type="button"
                      className="btn-filter"
                      disabled={
                        !!busy ||
                        (replies[enquiry.id] || "").trim()
                          .length < 5
                      }
                      onClick={() =>
                        updateEnquiry(enquiry, "answered")
                      }
                    >
                      {busy === enquiry.id
                        ? "Sending..."
                        : "Send Reply"}
                    </button>

                  </div>

                </div>
              )}

            </article>
          );
        })}
      </div>

      {/* Explain how notifications and replies work. */}
      <p
        className="field-hint"
        style={{
          marginTop: 15,
          textAlign: "left"
        }}
      >
        Municipal replies are stored in Firebase Firestore.
        Residents can read their responses inside MetroNotify
        once the backend and My Enquiries section are connected.
      </p>

    </section>
  );
}

export default FirestoreEnquiries;
