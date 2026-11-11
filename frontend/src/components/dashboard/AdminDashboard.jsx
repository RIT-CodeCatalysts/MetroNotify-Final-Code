import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

// These components each handle their own Firebase requests and actions.
import FirestoreReports from "./FirestoreReports";
import RatepayerApprovals from "./RatepayerApprovals";
import FirestoreEnquiries from "./FirestoreEnquiries";
import TechnicianCoverage from "./TechnicianCoverage";
import AdminAlertLocations from "./AdminAlertLocations";

/*
 * MetroNotify - Municipal Admin Dashboard
 *
 * The Reports & Dispatch panel is the DEFAULT screen so that
 * report verification, technician assignment and public-alert
 * publishing are easy to find.
 *
 * The other sections remain accessible as tabs. Changing tabs
 * does not delete or modify any Firestore records.
 *
 * Flask must still authorise every Admin API request.
 */
const TABS = [
  { id: "reports", label: "Reports & Dispatch" },
  { id: "billing", label: "Billing Approvals" },
  { id: "coverage", label: "Technician Coverage" },
  { id: "locations", label: "Alert Locations" },
  { id: "enquiries", label: "Ratepayer Enquiries" },
];

export default function AdminDashboard() {
  const { currentUser, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("reports");

  // Hiding Admin controls is not enough for security: Flask also checks roles.
  if (!isAdmin) {
    return (
      <div id="admin" className="card">
        <div className="card-header">
          <div className="card-title">Municipal Admin Portal</div>
        </div>
        <div className="card-body">
          <p role="alert">Only authorised Municipal Admin accounts can access this portal.</p>
        </div>
      </div>
    );
  }

  return (
    <div id="admin" className="card">
      <div className="card-header">
        <div>
          <div className="card-title">🏛️ Municipal Admin — Firestore Operations</div>
          <p className="form-footnote" style={{ textAlign: "left" }}>
            Signed in as {currentUser?.name || "Municipal Admin"}.
            Reports, technicians, municipal approvals, public alerts and enquiries
            are managed through Firebase Firestore.
          </p>
        </div>
      </div>

      <div className="card-body">
        {/* Choose one task at a time instead of stacking long sections. */}
        <nav aria-label="Admin functions" style={{
          display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18
        }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="btn-filter"
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
              style={{
                fontWeight: activeTab === tab.id ? 700 : 400,
                border: activeTab === tab.id
                  ? "2px solid #3b6d11"
                  : "1px solid #b8caa9",
                background: activeTab === tab.id ? "#edf5e7" : "#ffffff",
                color: "#244725"
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* MAIN ADMIN WORKFLOW: receive, review, assign and publish. */}
        {activeTab === "reports" && (
          <section aria-label="Firebase municipal reports and technician dispatch">
            <h3 style={{ color: "#244725" }}>📋 Reports & Technician Dispatch</h3>
            <p className="field-hint" style={{ textAlign: "left" }}>
              New incident reports appear below. Verify the report, choose a
              matching technician and publish an alert when appropriate.
            </p>
            <FirestoreReports />
          </section>
        )}

        {/* Billing account decisions are still controlled by Admin. */}
        {activeTab === "billing" && <RatepayerApprovals />}

        {/* This panel diagnoses skill and assignment gaps for all services. */}
        {activeTab === "coverage" && <TechnicianCoverage />}

        {/* This is only for correcting public locality names on alerts. */}
        {activeTab === "locations" && <AdminAlertLocations />}

        {/* The Admin can answer residents from this section. */}
        {activeTab === "enquiries" && <FirestoreEnquiries />}
      </div>
    </div>
  );
}
