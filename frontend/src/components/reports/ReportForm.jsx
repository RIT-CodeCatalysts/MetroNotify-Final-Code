import { useEffect, useRef, useState } from "react";
import IncidentLocationPicker from "./IncidentLocationPicker";
import southAfricaData from "../../data/southAfricaAreas";
import {
  containsProhibitedContent,
  sanitizeText
} from "../../data/moderation";
import { sanitizeImage } from "../../services/imageSanitizer";

// Keep the same description and photo limits used by Flask.
const MAX_CHARS = 500;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function ReportForm({ onSubmit }) {

  // ----------------------------------------
  // REPORT FORM DATA
  // ----------------------------------------

  const [formData, setFormData] = useState({
    utility: "Electricity",
    severity: "Medium",
    province: "",
    municipality: "",
    area: "",
    address: "",
    startedOn: "",
    approxTime: "",
    affectedArea: "Just my property",
    description: "",
    isSafetyHazard: false
  });

  // ----------------------------------------
  // PHOTO AND LOCATION
  // ----------------------------------------

  // A valid photo stores its cleaned File, not only the image preview.
  // The original photo is NEVER passed to the backend.
  const [photo, setPhoto] = useState(null);
  const [photoStatus, setPhotoStatus] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [incidentLocation, setIncidentLocation] = useState(null);

  // Stop an earlier asynchronous image selection from replacing a newer one.
  const photoSelectionId = useRef(0);

  // Browser preview URLs consume memory, so release them when no longer needed.
  const previewUrlRef = useRef(null);
  useEffect(() => {
    return () => {
      photoSelectionId.current += 1;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  // ----------------------------------------
  // CURRENT DATE AND TIME
  // ----------------------------------------

  const now = new Date();

  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  const currentTime = now.toTimeString().slice(0, 5);

  // ----------------------------------------
  // HANDLE FORM CHANGES
  // ----------------------------------------

  function handleChange(e) {
    const { name, value, type, checked } = e.target;

    if (
      name === "description" &&
      value.length > MAX_CHARS
    ) {
      return;
    }

    setFormData((previous) => ({
      ...previous,

      [name]: type === "checkbox" ? checked : value,

      ...(name === "province"
        ? { municipality: "", area: "" }
        : {}),

      ...(name === "municipality"
        ? { area: "" }
        : {})
    }));

    // Clear old GPS coordinates if address details change.
    if (
      ["province", "municipality", "area", "address"]
        .includes(name)
    ) {
      setIncidentLocation(null);
    }
  }

  // ----------------------------------------
  // PREPARE A PRIVATE INCIDENT PHOTO
  // ----------------------------------------
  // Photos stay in the browser until Report.jsx sends them to Flask.
  // The sanitiser redraws image pixels and removes embedded EXIF metadata.
  // Never fall back to uploading the original image if sanitisation fails.
  async function handlePhotoChange(event) {
    const file = event.target.files?.[0];

    // Clearing the input lets the user choose the same file again if needed.
    event.target.value = "";
    const selectionId = ++photoSelectionId.current;

    // Remove the old photo and its temporary preview whenever one is selected.
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPhoto(null);
    setPhotoStatus("");
    setPhotoError("");

    // A photo is optional, so the report can be submitted without one.
    if (!file) return;

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setPhotoError("Please choose a JPG or PNG image.");
      setPhotoStatus("error");
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("The selected photo is larger than 5 MB.");
      setPhotoStatus("error");
      return;
    }

    setPhotoStatus("processing");
    let newPreviewUrl = null;

    try {
      // sanitizeImage returns { blob, previewUrl, width, height }.
      // Blob contains the cleaned pixels that we will actually upload.
      const sanitized = await sanitizeImage(file);
      newPreviewUrl = sanitized.previewUrl || null;

      // If another photo was chosen while this one was processing, discard it.
      if (selectionId !== photoSelectionId.current) {
        if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
        return;
      }

      if (!(sanitized.blob instanceof Blob)) {
        throw new Error("The photo could not be prepared safely.");
      }

      // Re-encoding may increase image size; enforce the limit again.
      if (sanitized.blob.size > MAX_PHOTO_BYTES) {
        throw new Error("The cleaned photo exceeds 5 MB. Choose a smaller image.");
      }

      const safeType = sanitized.blob.type;
      if (!["image/jpeg", "image/png"].includes(safeType)) {
        throw new Error("The cleaned photo is not a supported image format.");
      }

      // Make a new File from the SANITISED blob, never from the original.
      const extension = safeType === "image/png" ? "png" : "jpg";
      const cleanedFile = new File(
        [sanitized.blob],
        `incident-photo.${extension}`,
        { type: safeType }
      );

      previewUrlRef.current = newPreviewUrl;
      newPreviewUrl = null; // The component now owns this preview URL.
      setPhoto({
        name: file.name,                // Original name for display only
        file: cleanedFile,             // Cleaned photo for upload to Flask
        previewUrl: sanitized.previewUrl
      });
      setPhotoStatus("sanitized");

    } catch (error) {
      // The original file is never kept or uploaded after sanitisation fails.
      console.error("Photo preparation failed:", error);
      if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
      setPhoto(null);
      setPhotoError(error.message || "Could not prepare this photo safely.");
      setPhotoStatus("error");
    }
  }

  // ----------------------------------------
  // HANDLE REPORT SUBMISSION
  // ----------------------------------------

  function handleSubmit(e) {
    e.preventDefault();

    if (formData.description.length > MAX_CHARS) {
      alert(
        `Please keep your description under ${MAX_CHARS} characters.`
      );
      return;
    }

    // Resident must confirm the incident location.
    if (!incidentLocation) {
      alert(
        "Please find the incident address or select the location on the map."
      );
      return;
    }

    if (photoStatus === "processing") {
      alert(
        "Your photo is still being processed. Please try again."
      );
      return;
    }

    // Prevent future incident dates.
    if (formData.startedOn > today) {
      alert("The incident date cannot be in the future.");
      return;
    }

    // Check future time only when a time was entered.
    if (formData.startedOn && formData.approxTime) {
      const selectedDateTime = new Date(
        `${formData.startedOn}T${formData.approxTime}`
      );

      if (
        Number.isNaN(selectedDateTime.getTime()) ||
        selectedDateTime > new Date()
      ) {
        alert(
          "The incident date and time cannot be in the future."
        );
        return;
      }
    }

    // Content moderation.
    if (
      containsProhibitedContent(formData.description) ||
      containsProhibitedContent(formData.address)
    ) {
      alert(
        "Your report contains language that is not allowed on MetroNotify. Please rephrase it."
      );
      return;
    }

    // Pass all details to the parent reporting component.
    onSubmit({
      ...formData,

      description: sanitizeText(formData.description),
      address: sanitizeText(formData.address),

      // Actual selected incident coordinates.
      lat: incidentLocation.lat,
      lng: incidentLocation.lng,

      // Preserve the existing display fields used elsewhere in MetroNotify.
      photo: photo?.name || null,
      photoPreviewUrl: photo?.previewUrl || null,
      photoSanitized: photoStatus === "sanitized",

      // NEW: Pass the cleaned image File to Report.jsx.
      // Report.jsx must upload this with FormData *after* the report is saved.
      // Do NOT include photoFile in the JSON report payload or local storage.
      photoFile: photoStatus === "sanitized" ? photo?.file || null : null
    });
  }

  // ----------------------------------------
  // AVAILABLE MUNICIPALITIES
  // ----------------------------------------

  const availableMunicipalities = formData.province
    ? Object.keys(southAfricaData[formData.province] || {})
    : [];

  // ----------------------------------------
  // AVAILABLE AREAS
  // ----------------------------------------

  const availableAreas =
    formData.province && formData.municipality
      ? (
          southAfricaData[formData.province]?.[
            formData.municipality
          ] || []
        )
      : [];

  // ----------------------------------------
  // DESCRIPTION COUNTER
  // ----------------------------------------

  const charCount = formData.description.length;
  const charsRemaining = MAX_CHARS - charCount;

  const isNearLimit =
    charsRemaining <= 40 && charsRemaining > 0;

  const isAtLimit = charsRemaining <= 0;

  // ----------------------------------------
  // REPORT FORM INTERFACE
  // ----------------------------------------

  return (
    <form onSubmit={handleSubmit}>

      <div className="form-grid">

        {/* UTILITY / SERVICE TYPE */}

        <div className="form-field">
          <label>Utility / Service Type *</label>

          <select
            name="utility"
            value={formData.utility}
            onChange={handleChange}
            required
          >
            <option value="Electricity">
              ⚡ Electricity
            </option>

            <option value="Water">
              💧 Water
            </option>

            <option value="Sewerage">
              🚰 Sewerage
            </option>

            <option value="Potholes">
              🕳️ Potholes
            </option>

            <option value="Vandalism">
              🚨 Vandalism
            </option>

            <option value="Streetlights">
              💡 Streetlights
            </option>

            <option value="Waste / Refuse">
              🗑️ Waste / Refuse
            </option>

            <option value="Stormwater">
              🌧️ Stormwater
            </option>

            <option value="Traffic Lights">
              🚦 Traffic Lights
            </option>

            <option value="Other">
              Other
            </option>
          </select>
        </div>

        {/* SEVERITY */}

        <div className="form-field">
          <label>Severity *</label>

          <select
            name="severity"
            value={formData.severity}
            onChange={handleChange}
            required
          >
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>

        {/* PROVINCE */}

        <div className="form-field">
          <label>Province *</label>

          <select
            name="province"
            value={formData.province}
            onChange={handleChange}
            required
          >
            <option value="">
              📍 -- Select Province --
            </option>

            {Object.keys(southAfricaData).map(
              (province) => (
                <option key={province} value={province}>
                  {province}
                </option>
              )
            )}
          </select>
        </div>

        {/* MUNICIPALITY */}

        <div className="form-field">
          <label>Municipality *</label>

          <select
            name="municipality"
            value={formData.municipality}
            onChange={handleChange}
            required
            disabled={!formData.province}
          >
            <option value="">
              {formData.province
                ? "📍 -- Select Municipality --"
                : "Select province first"}
            </option>

            {availableMunicipalities.map(
              (municipality) => (
                <option
                  key={municipality}
                  value={municipality}
                >
                  {municipality}
                </option>
              )
            )}
          </select>
        </div>

        {/* AREA */}

        <div className="form-field">
          <label>Your Area *</label>

          <select
            name="area"
            value={formData.area}
            onChange={handleChange}
            required
            disabled={!formData.municipality}
          >
            <option value="">
              {formData.municipality
                ? "📍 -- Select Area --"
                : "Select municipality first"}
            </option>

            {availableAreas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>

        {/* STREET ADDRESS */}

        <div className="form-field full">
          <label>Street Address / Landmark *</label>

          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
            placeholder="e.g. 12 Beach Road, near the clinic"
            required
          />
        </div>

        {/* IMPROVED ADDRESS SEARCH AND MAP */}

        <IncidentLocationPicker
          value={incidentLocation}
          onChange={setIncidentLocation}
          address={formData.address}
          area={formData.area}
          municipality={formData.municipality}
          province={formData.province}
        />

        {/* INCIDENT START DATE */}

        <div className="form-field">
          <label>Started On *</label>

          <input
            type="date"
            name="startedOn"
            value={formData.startedOn}
            onChange={handleChange}
            max={today}
            required
          />

          <div className="field-hint">
            The incident date cannot be in the future.
          </div>
        </div>

        {/* APPROXIMATE TIME */}

        <div className="form-field">
          <label>Approx. Time</label>

          <input
            type="time"
            name="approxTime"
            value={formData.approxTime}
            onChange={handleChange}
            max={
              formData.startedOn === today
                ? currentTime
                : undefined
            }
          />

          <div className="field-hint">
            Future times cannot be selected for today's date.
          </div>
        </div>

        {/* AFFECTED AREA */}

        <div className="form-field full">
          <label>Affected Area *</label>

          <select
            name="affectedArea"
            value={formData.affectedArea}
            onChange={handleChange}
            required
          >
            <option value="Just my property">
              Just my property
            </option>

            <option value="My street">
              My street
            </option>

            <option value="My whole area">
              My whole area
            </option>
          </select>
        </div>

        {/* DESCRIPTION */}

        <div className="form-field full">
          <label>Description *</label>

          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Describe the issue..."
            required
            rows="6"
            maxLength={MAX_CHARS}
            aria-describedby="description-char-count"
          />

          <div
            id="description-char-count"
            className={`char-count ${
              isAtLimit ? "char-count-limit" : ""
            } ${
              isNearLimit ? "char-count-warning" : ""
            }`}
          >
            {charCount}/{MAX_CHARS} characters
          </div>

          <div className="field-hint">
            Please keep your description within
            500 characters.
          </div>
        </div>

        {/* PHOTO UPLOAD: a preview is local; the parent handles actual uploading. */}

        <div className="form-field full">
          <label>Attach a Photo (optional)</label>

          <div className="photo-upload">
            <label className="file-btn">
              Choose File

              <input
                type="file"
                accept="image/png, image/jpeg"
                onChange={handlePhotoChange}
                hidden
              />
            </label>

            <span className="file-name">
              {photo?.name || "No file chosen"}
            </span>

            {photoStatus === "processing" && (
              <span
                className="file-name"
                style={{ color: "var(--warning)" }}
              >
                Removing photo metadata…
              </span>
            )}

            {photoStatus === "sanitized" && (
              <span
                className="file-name"
                style={{ color: "var(--success)" }}
              >
                ✅ Metadata removed
              </span>
            )}

            {photoStatus === "error" && (
              <span
                className="file-name"
                role="alert"
                style={{ color: "var(--warning)" }}
              >
                {photoError || "Photo could not be prepared safely."}
                {" "}You can still submit the report without a photo.
              </span>
            )}
          </div>

          {photo?.previewUrl && (
            <img
              src={photo.previewUrl}
              alt="Attached photo preview"
              style={{
                marginTop: "8px",
                maxWidth: "160px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border-strong)"
              }}
            />
          )}

          <div className="field-hint">
            JPG or PNG, maximum 5 MB. MetroNotify removes photo metadata
            before preparing the image. The photo upload to Admin will work
            after the next Report.jsx and Flask changes are connected.
          </div>
        </div>

        {/* SAFETY HAZARD */}

        <div className="form-field full">
          <label className="hazard-check">

            <input
              type="checkbox"
              name="isSafetyHazard"
              checked={formData.isSafetyHazard}
              onChange={handleChange}
            />

            <div>
              <div className="hazard-title">
                This is a safety hazard
                (exposed wire, gas smell,
                severe flooding, etc.)
              </div>

              <div className="hazard-sub">
                If checked, your report will be prioritised.
              </div>
            </div>

          </label>
        </div>

      </div>

      {/* SUBMIT BUTTON */}

      <button
        type="submit"
        className="btn-primary btn-gold"
        style={{ marginTop: "10px" }}
        disabled={photoStatus === "processing"}
      >
        📨 Submit Report
      </button>

      <p className="form-footnote">
        Your report information will be used to
        process and track the service issue.
      </p>

    </form>
  );
}

export default ReportForm;
