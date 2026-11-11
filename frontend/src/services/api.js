
/**
 * METRONOTIFY - REACT TO FLASK API SERVICE
 *
 * All protected requests use the signed-in user's Firebase ID token.
 * Flask checks the token and the user's role before accessing private data.
 *
 * Incident images are stored privately by Flask on the backend computer.
 * We do NOT need paid Firebase Storage or a public image URL.
 */

import { auth } from "../firebase";

// The React development server normally runs on port 3000.
// Flask runs separately on port 5000.
// A deployment may override this address in the React environment file.
// Remove trailing slashes to prevent URLs such as "//api/reports".
export const API_URL = (
  process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:5000"
).replace(/\/+$/, "");

/**
 * Make an authenticated JSON request to Flask.
 *
 * Examples:
 *   apiRequest("/api/reports")
 *   apiRequest("/api/reports", { method: "POST", body: reportData })
 *
 * Important: JSON requests should not contain a photo File or Blob.
 * Report photos use apiPhoto() after the report has been saved.
 */
export async function apiRequest(
  path,
  { method = "GET", body, signal } = {}
) {
  // Retrieve a current Firebase ID token for the signed-in account.
  // Public endpoints work without a token; Flask protects private endpoints.
  const token = auth?.currentUser
    ? await auth.currentUser.getIdToken()
    : null;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    signal,
    headers: {
      ...(body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });

  // Flask returns structured JSON for normal API requests.
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      `MetroNotify backend returned an invalid response (${response.status})`
    );
  }

  // Display the backend's useful error message when available.
  if (!response.ok || result?.status === "error") {
    throw new Error(result?.message || `Request failed (${response.status})`);
  }

  return result;
}

/**
 * Upload or download a PRIVATE report photo through Flask.
 *
 * Upload:
 *   apiPhoto("/api/reports/REFERENCE/photo", { photo: cleanedFile })
 *
 * Download:
 *   apiPhoto("/api/reports/REFERENCE/photo", { download: true })
 *
 * Flask allows the reporting ratepayer to upload a photo after creating
 * the report. Admin and other authorised users may view it later.
 *
 * Do not set Content-Type manually for FormData: the browser supplies the
 * required multipart boundary automatically.
 */
export async function apiPhoto(path, { photo, download = false } = {}) {
  // Photos are NEVER accessible to unauthenticated visitors.
  const token = auth?.currentUser
    ? await auth.currentUser.getIdToken()
    : null;

  if (!token) {
    throw new Error("Sign in to access report photos.");
  }

  // A GET request does not need FormData or a request body.
  let data;
  if (!download) {
    if (!(photo instanceof Blob)) {
      throw new Error("Select a valid incident photo before uploading.");
    }

    // Keep the file name generic; Flask does not trust client file names.
    const fileName = photo.type === "image/png"
      ? "incident-photo.png"
      : "incident-photo.jpg";

    data = new FormData();
    data.append("photo", photo, fileName);
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: download ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    ...(!download ? { body: data } : {})
  });

  if (!response.ok) {
    // The backend usually returns a JSON message for missing photos,
    // invalid images, permission problems and unavailable local files.
    const detail = await response.json().catch(() => ({}));
    throw new Error(
      detail?.message || `Photo request failed (${response.status})`
    );
  }

  // GET returns binary image data. POST returns a JSON confirmation.
  return download ? response.blob() : response.json();
}

/**
 * Let an authorised Admin or ratepayer view a saved incident photo.
 *
 * Important browser detail: opening a new tab AFTER an awaited request
 * may be blocked as a popup. Open an empty tab immediately in response
 * to the click, then navigate it to the photo when Flask returns it.
 *
 * If popups are disabled, offer the image as a download instead.
 */
export async function viewReportPhoto(reference) {
  if (!reference) {
    throw new Error("The report reference is missing.");
  }

  // This happens synchronously during the user's button click.
  const previewTab = window.open("about:blank", "_blank");
  if (previewTab) {
    // Prevent the new page from controlling the original MetroNotify tab.
    previewTab.opener = null;
    try {
      previewTab.document.title = "MetroNotify incident photo";
      previewTab.document.body.textContent = "Loading private incident photo…";
    } catch {
      // The photo can still open even if the loading text cannot be set.
    }
  }

  try {
    const blob = await apiPhoto(
      `/api/reports/${encodeURIComponent(reference)}/photo`,
      { download: true }
    );

    // Do not open an unexpected file type as an incident image.
    if (!blob || !["image/jpeg", "image/png"].includes(blob.type)) {
      throw new Error("The backend did not return a valid incident photo.");
    }

    // A blob URL exists only inside this browser session; it is not public.
    const photoUrl = URL.createObjectURL(blob);

    if (previewTab && !previewTab.closed) {
      try {
        previewTab.location.replace(photoUrl);
      } catch {
        // Some browser privacy settings prevent the new-tab navigation.
        downloadPhoto(photoUrl, blob.type);
      }
    } else {
      // Fallback for browsers that block popups.
      downloadPhoto(photoUrl, blob.type);
    }

    // Release the browser's temporary URL after a reasonable viewing period.
    // The original private image remains stored on the backend computer.
    window.setTimeout(() => URL.revokeObjectURL(photoUrl), 5 * 60 * 1000);

  } catch (error) {
    // Avoid leaving an empty tab behind when the photo could not load.
    if (previewTab && !previewTab.closed) {
      previewTab.close();
    }
    throw error;
  }
}

/** Download fallback when a browser cannot open a photo preview tab. */
function downloadPhoto(photoUrl, contentType) {
  const link = document.createElement("a");
  link.href = photoUrl;
  link.download = contentType === "image/png"
    ? "incident-photo.png"
    : "incident-photo.jpg";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Convert backend ticket statuses into labels residents and Admin can read.
 * The actual status value still comes from Flask and Firestore.
 */
export const toDisplayStatus = (status) => ({
  assessing: "Under Review",
  under_review: "Under Review",
  open: "Under Review",
  assigned: "Assigned",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed"
}[status] || status || "Unknown");

/**
 * Convert the service category selected by the ratepayer into the exact
 * report type used by the backend.
 */
export const types = {
  Electricity: "power_outage",
  Water: "water_leak",
  Sewerage: "sewage",
  Potholes: "pothole",
  Vandalism: "vandalism",
  Streetlights: "streetlights",
  "Waste / Refuse": "waste_refuse",
  Stormwater: "stormwater",
  "Traffic Lights": "traffic_lights",
  Other: "other"
};

/**
 * Show matching technician specialisations in the Admin dispatch dropdown.
 *
 * These are FRONTEND suggestions only: Admin must choose a technician,
 * and Flask rechecks availability, Firebase login and specialisation.
 *
 * The Civil technician is also an eligible fallback for Sewerage and Other,
 * consistent with the backend matching rules already added to MetroNotify.
 */
export const specialtyForType = {
  power_outage: ["electrical", "electricity"],
  streetlights: ["electrical", "electricity"],
  water_leak: ["plumbing", "water", "sanitation"],
  sewage: ["plumbing", "sanitation", "sewage", "sewerage", "civil"],
  pothole: ["civil", "roads", "road", "potholes"],
  stormwater: ["civil", "roads", "stormwater"],
  traffic_lights: ["traffic", "traffic signals", "electrical"],
  waste_refuse: ["waste", "refuse", "sanitation"],
  vandalism: ["security", "general"],
  other: ["general", "civil"]
};
