import { useEffect, useState } from "react";

import Report from "../reports/Report";
import ReportStatus from "../reports/ReportStatus";
import EnquiryForm from "../reports/EnquiryForm";

function ReportTabs() {
  const [activeTab, setActiveTab] = useState("report");

  // The top nav's "Report" link points at "#report" (this card's id).
  // Clicking it should always land back on the Report Outage form, even
  // if the resident had switched to Check ETA / Enquire earlier — so we
  // watch for that hash and reset the tab whenever it fires.
  useEffect(() => {
    function handleHashChange() {
      if (window.location.hash === "#report") {
        setActiveTab("report");
      }
    }

    window.addEventListener("hashchange", handleHashChange);
    return () =>
      window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return (
    <div id="report" className="card">
      <div className="card-header">
        <div className="card-title">
          <svg
            aria-hidden="true"
            fill="none"
            height="16"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="16"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>

          Report &amp; Enquire
        </div>
      </div>

      <div className="card-body">

        <div
          className="tabs"
          role="tablist"
          aria-label="Report options"
        >

          <button
            className={`tab-btn ${activeTab === "report" ? "active" : ""}`}
            onClick={() => setActiveTab("report")}
          >
            Report Outage
          </button>

          <button
            className={`tab-btn ${activeTab === "check" ? "active" : ""}`}
            onClick={() => setActiveTab("check")}
          >
            Check ETA
          </button>

          <button
            className={`tab-btn ${activeTab === "enquire" ? "active" : ""}`}
            onClick={() => setActiveTab("enquire")}
          >
            Enquire
          </button>

        </div>

        {activeTab === "report" && <Report />}

        {activeTab === "check" && <ReportStatus />}

        {activeTab === "enquire" && <EnquiryForm />}

      </div>
    </div>
  );
}

export default ReportTabs;