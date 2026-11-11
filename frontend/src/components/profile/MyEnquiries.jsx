import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../services/api";

/*
 * MyEnquiries displays the signed-in resident's private enquiries.
 * Only the Flask backend decides which records belong to this user.
 * Text colours are set explicitly to remain readable in the profile modal.
 */
export default function MyEnquiries() {
  const [enquiries, setEnquiries] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Read the resident's Firestore enquiries through the authenticated API.
  const loadEnquiries = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest("/api/my/enquiries");
      setEnquiries(response.enquiries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEnquiries();
  }, [loadEnquiries]);

  const answeredCount = enquiries.filter(
    (enquiry) => Boolean(enquiry.reply?.trim())
  ).length;

  return (
    <section
      aria-label="My enquiries and municipal replies"
      style={{
        marginTop: 20,
        padding: 16,
        border: "1px solid #b8caa9",
        borderRadius: 12,
        backgroundColor: "#ffffff",
        color: "#244725"
      }}
    >
      <h3 style={{ color: "#244725", fontSize: 16 }}>
        📨 My Enquiries &amp; Municipal Replies
      </h3>
      <p style={{ color: "#52634b", textAlign: "left" }}>
        Check the status of your questions and read replies from the municipality.
      </p>

      <p style={{ color: "#244725", textAlign: "left" }}>
        <strong>Total enquiries: {enquiries.length}</strong>
        {" | "}
        <strong>Answered: {answeredCount}</strong>
      </p>

      <button type="button" className="btn-filter" onClick={loadEnquiries}
        disabled={loading}>
        {loading ? "Loading..." : "↻ Refresh My Enquiries"}
      </button>

      {loading && <p style={{ color: "#52634b" }}>Loading enquiries...</p>}
      {error && <p role="alert" style={{ color: "#a52323" }}>{error}</p>}
      {!loading && !error && enquiries.length === 0 && (
        <p style={{ color: "#52634b" }}>You have not submitted any enquiries yet.</p>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 15, maxHeight: 450, overflowY: "auto" }}>
        {enquiries.map((enquiry) => {
          const hasReply = Boolean(enquiry.reply?.trim());
          const displayStatus = hasReply
            ? "✓ Answered"
            : enquiry.status === "reviewed"
              ? "Under Review"
              : "Awaiting Response";

          return (
            <article key={enquiry.id} style={{
              padding: 14,
              border: "1px solid #c9d9bf",
              borderRadius: 10,
              backgroundColor: "#f9fcf5",
              color: "#244725"
            }}>
              {/* Date and response status */}
              <p style={{ fontSize: 12, color: "#52634b", textAlign: "left" }}>
                {enquiry.createdAt || "Date unavailable"}
              </p>
              <p style={{ color: "#244725", textAlign: "left", fontWeight: 600 }}>
                Status: {displayStatus}
              </p>

              {/* Resident's original enquiry */}
              <div style={{
                backgroundColor: "#edf5e7",
                padding: 12,
                borderRadius: 8
              }}>
                <strong style={{ color: "#244725" }}>Your Enquiry:</strong>
                <p style={{ color: "#263d21", textAlign: "left", marginBottom: 0 }}>
                  {enquiry.message}
                </p>
              </div>

              {/* The official reply is read-only and remains visible after refresh. */}
              {hasReply ? (
                <div style={{
                  marginTop: 12,
                  padding: 12,
                  borderLeft: "4px solid #4a8015",
                  backgroundColor: "#eef8e9",
                  borderRadius: 8
                }}>
                  <strong style={{ color: "#244725" }}>
                    ✓ Municipal Admin Response
                  </strong>
                  <p style={{ color: "#263d21", textAlign: "left", margin: "10px 0" }}>
                    {enquiry.reply}
                  </p>
                  {enquiry.repliedAt && (
                    <small style={{ color: "#52634b" }}>
                      Replied on: {enquiry.repliedAt}
                    </small>
                  )}
                </div>
              ) : (
                <p style={{ color: "#52634b", textAlign: "left", fontStyle: "italic", marginTop: 10 }}>
                  The municipality has not responded to this enquiry yet.
                </p>
              )}
            </article>
          );
        })}
      </div>

      <p style={{ color: "#52634b", textAlign: "left", marginTop: 15 }}>
        Replies are stored in Firebase Firestore. Refresh this section to check for updates.
      </p>
    </section>
  );
}
