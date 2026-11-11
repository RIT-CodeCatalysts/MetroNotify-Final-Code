import { useEffect, useRef, useState } from "react";
import { apiRequest, apiPhoto, types } from "../../services/api";
import ReportForm from "./ReportForm";
import ReportSuccess from "./ReportSuccess";
import { useAuth } from "../../context/AuthContext";
import { REPORT_STATUS_FLOW } from "../../data/reportStatus";

/*
 * METRONOTIFY - RATEPAYER REPORT SUBMISSION
 *
 * This component connects the report form to our secured Flask API.
 *
 * The workflow is:
 * 1. Check that the user can report and the incident details are valid.
 * 2. Save the report to Firestore through Flask.
 * 3. If the ratepayer attached a photo, upload the CLEANED File separately.
 * 4. Display the real reference number on the success screen.
 *
 * Photos are optional. A photo-upload error must NEVER undo a saved report.
 * Technician assignment and public alert publication are Admin actions.
 */

function Report() {
  // Show the confirmation page after Flask saves the report.
  const [submittedReport, setSubmittedReport] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");

  // A ref blocks rapid double-clicks before React updates the loading state.
  const submissionInProgress = useRef(false);

  // Keep a separate success-screen preview. The ReportForm preview URL gets
  // revoked when that form unmounts, so it cannot safely be reused afterward.
  const successPreviewRef = useRef(null);

  // Firebase Auth provides the signed-in user and their reporting permission.
  const { currentUser, canReport } = useAuth();

  // Release the temporary preview URL when this screen is removed.
  useEffect(() => {
    return () => {
      if (successPreviewRef.current) {
        URL.revokeObjectURL(successPreviewRef.current);
        successPreviewRef.current = null;
      }
    };
  }, []);

  // -----------------------------------------------------------------------
  // SUBMIT A RATEPAYER REPORT
  // -----------------------------------------------------------------------
  async function handleSubmit(report) {
    if (submissionInProgress.current) return;

    // Only authenticated ratepayers may submit municipal service reports.
    if (!currentUser?.id || !canReport) {
      setSubmissionError("Please sign in as a Ratepayer before submitting.");
      return;
    }

    // Convert the form's readable category into the backend's stored type.
    // For example, Potholes becomes "pothole" and Other becomes "other".
    const firebaseType = types[report.utility];
    if (!firebaseType) {
      setSubmissionError(
        "This report category is not supported by the Flask backend."
      );
      return;
    }

    // The incident must have valid coordinates selected using the map picker.
    if (
      typeof report.lat !== "number" ||
      typeof report.lng !== "number" ||
      !Number.isFinite(report.lat) ||
      !Number.isFinite(report.lng) ||
      report.lat < -90 ||
      report.lat > 90 ||
      report.lng < -180 ||
      report.lng > 180
    ) {
      setSubmissionError("Please select a valid incident location on the map.");
      return;
    }

    submissionInProgress.current = true;
    setIsSubmitting(true);
    setSubmissionError("");

    try {
      // STEP 1: Send only report information in JSON.
      // Do NOT include File, Blob or browser preview URLs in Firestore JSON.
      const firebasePayload = {
        type: firebaseType,
        description: report.description,
        lat: report.lat,
        lng: report.lng,
        province: report.province,
        municipality: report.municipality,
        area: report.area,
        address: report.address,
        affectedArea: report.affectedArea,
        isSafetyHazard: report.isSafetyHazard,
        startedOn: report.startedOn,
        approxTime: report.approxTime
      };

      // The apiRequest helper authenticates this call with the Firebase token.
      // Flask creates the report reference and handles its municipal ticket.
      const result = await apiRequest("/api/reports", {
        method: "POST",
        body: firebasePayload
      });

      if (
        result?.status !== "success" ||
        !result.referenceNumber ||
        !result.reportId
      ) {
        throw new Error("The backend did not return a valid report confirmation.");
      }

      // STEP 2: Upload an OPTIONAL incident photograph AFTER report creation.
      // ReportForm.jsx gives us photoFile, a sanitised JPG/PNG File whose
      // metadata has already been removed. Never upload the original file.
      // In particular, do not fetch a blob from photoPreviewUrl to upload it.
      let photoUploadWarning = "";
      let photoUploaded = false;
      const hasCleanedPhoto =
        report.photoSanitized === true && report.photoFile instanceof Blob;

      if (hasCleanedPhoto) {
        try {
          // apiPhoto is the authenticated multipart upload helper.
          // The Flask endpoint expects the form field to be named "photo".
          await apiPhoto(
            `/api/reports/${encodeURIComponent(result.referenceNumber)}/photo`,
            { photo: report.photoFile }
          );
          photoUploaded = true;
        } catch (photoError) {
          // The report already exists in Firestore. Do not retry its creation.
          photoUploadWarning =
            "Your report was saved, but its photo could not be uploaded: " +
            (photoError?.message || "Photo storage is unavailable.");
          console.warn("MetroNotify photo upload:", photoError);
        }
      } else if (report.photo) {
        // If metadata removal failed, NEVER send the original photo instead.
        photoUploadWarning =
          "Your report was saved, but the photo was not uploaded because " +
          "it could not be prepared safely.";
      }

      // STEP 3: Prepare data for the existing success screen.
      // The cleaned photo must not become part of the completed report object.
      const { photoFile, ...reportForDisplay } = report;
      let successPreviewUrl = null;

      if (hasCleanedPhoto) {
        try {
          successPreviewUrl = URL.createObjectURL(photoFile);
          successPreviewRef.current = successPreviewUrl;
        } catch (previewError) {
          // A preview is optional; a failure here must not hide the saved report.
          console.warn("Could not display photo preview:", previewError);
        }
      }

      const completedReport = {
        ...reportForDisplay,
        photoPreviewUrl: successPreviewUrl,

        // The actual identifiers were created and returned by Flask/Firestore.
        referenceNumber: result.referenceNumber,
        reportId: result.reportId,
        ticketId: result.ticketId ?? null,

        // Preserve values expected by ReportSuccess and existing dashboards.
        submittedOn: new Date().toLocaleString(),
        status: REPORT_STATUS_FLOW[0].label,
        verification: REPORT_STATUS_FLOW[0].verification,
        priority: report.severity || "Medium",
        userId: currentUser.id,
        userName: currentUser.name || "Ratepayer",

        // Grouping, technician assignments and XP now belong to Flask/Firestore.
        groupId: null,
        storageSource: "firestore",
        isDuplicate: result.isDuplicate === true,

        // A successful report can have an unsuccessful optional photo upload.
        photoUploaded,
        photoUploadWarning
      };

      // Never run the previous simulated lifecycle or write fake local XP.
      // Admin and technicians update the real Firestore records later.
      setSubmittedReport(completedReport);

    } catch (error) {
      // This catch is for REPORT submission, before a valid report reference
      // exists. Photo errors are handled separately above.
      console.error("MetroNotify report submission error:", error);
      if (error instanceof TypeError) {
        setSubmissionError(
          "Cannot connect to the Flask backend. " +
          "Please make sure the Python server is running."
        );
      } else {
        setSubmissionError(
          error?.message || "Something went wrong while submitting the report."
        );
      }
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  // -----------------------------------------------------------------------
  // RESET THE FORM TO CREATE A NEW REPORT
  // -----------------------------------------------------------------------
  function handleReset() {
    // Remove the success-screen image preview to prevent a memory leak.
    if (successPreviewRef.current) {
      URL.revokeObjectURL(successPreviewRef.current);
      successPreviewRef.current = null;
    }
    setSubmittedReport(null);
    setSubmissionError("");
  }

  // Only authorised ratepayers can use the reporting form.
  if (!canReport) {
    return (
      <div className="report-locked">
        <p className="form-footnote" style={{ textAlign: "left" }}>
          Only signed-in Ratepayer accounts can submit municipal service reports.
        </p>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // REPORT FORM OR SUCCESS CONFIRMATION
  // -----------------------------------------------------------------------
  return (
    <>
      {submittedReport === null ? (
        <>
          <ReportForm onSubmit={handleSubmit} />

          {isSubmitting && (
            <p role="status" className="form-footnote" style={{ marginTop: 12 }}>
              Saving your report to MetroNotify...
            </p>
          )}

          {submissionError && (
            <div
              role="alert"
              style={{
                marginTop: 14,
                padding: 12,
                border: "1px solid #e5a2a2",
                borderRadius: 8,
                color: "#b42318",
                background: "rgba(180, 35, 24, 0.05)"
              }}
            >
              {submissionError}
            </div>
          )}
        </>
      ) : (
        <>
          <ReportSuccess report={submittedReport} onReset={handleReset} />

          {/* Show the photo warning even if ReportSuccess doesn't render it. */}
          {submittedReport.photoUploadWarning && (
            <p role="status" style={{ marginTop: 12, color: "#935b11" }}>
              {submittedReport.photoUploadWarning}
            </p>
          )}
        </>
      )}
    </>
  );
}

export default Report;
