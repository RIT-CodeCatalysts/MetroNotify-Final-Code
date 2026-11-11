/* Labels and progression used for real Firestore report statuses. */

// Which department handles a report, based on the utility type chosen
// on the report form.
export function departmentFor(utility) {
  switch (utility) {
    case "Water":
    case "Sewerage":
    case "Stormwater":
      return "Water & Sanitation Department";

    case "Electricity":
    case "Streetlights":
    case "Traffic Lights":
      return "Electricity Department";

    case "Potholes":
    case "Vandalism":
    case "Waste / Refuse":
    default:
      return "Public Works Department";
  }
}

// Icon shown for each utility/incident type — used on the report form,
// confirmation screen, alert cards and map markers so the same type
// always shows the same icon.
export const UTILITY_ICONS = {
  Electricity: "⚡",
  Water: "💧",
  Sewerage: "🚰",
  Potholes: "🕳️",
  Vandalism: "🚨",
  Streetlights: "💡",
  "Waste / Refuse": "🗑️",
  Stormwater: "🌧️",
  "Traffic Lights": "🚦",
  Other: "📌",
};

export function utilityIcon(utility) {
  return UTILITY_ICONS[utility] || UTILITY_ICONS.Other;
}

/*
  Ordered lifecycle a submitted report moves through:
  Submitted -> Verified -> Assigned -> Investigation/Action -> Resolved -> Closed

  `label`      -> full status text used on badges and the tracking page
  `short`      -> compact label used on the timeline steps
  The UI renders these labels using live Firestore state; this list never
  triggers a timer or makes a status change itself.
*/
export const REPORT_STATUS_FLOW = [
  {
    key: "submitted",
    label: "Submitted",
    short: "Submitted",
    icon: "📋",
    delay: 0,
    verification: "Pending Verification",
    message: (report) =>
      `Your ${report.utility} report ${report.referenceNumber} for ${report.area}, ${report.municipality}, ${report.province} has been received.`,
  },
  {
    key: "verified",
    label: "Verified",
    short: "Verified",
    icon: "✅",
    delay: 4000,
    verification: "Verified",
    message: (report) =>
      `Your report ${report.referenceNumber} has been verified and logged for review.`,
  },
  {
    key: "assigned",
    label: "Assigned",
    short: "Assigned",
    icon: "👷",
    delay: 9000,
    verification: "Verified",
    message: (report) =>
      `Your report has been assigned to the ${departmentFor(report.utility)}.`,
  },
  {
    key: "investigation",
    label: "Investigation / Action",
    short: "In Progress",
    icon: "🔧",
    delay: 14000,
    verification: "Verified",
    message: (report) =>
      `Work is now underway on your ${report.utility} report in ${report.area}.`,
  },
  {
    key: "resolved",
    label: "Resolved",
    short: "Resolved",
    icon: "🎉",
    delay: 19000,
    verification: "Verified",
    message: (report) =>
      `Your ${report.utility} report for ${report.area}, ${report.municipality} has been resolved.`,
  },
  {
    key: "closed",
    label: "Closed",
    short: "Closed",
    icon: "🔒",
    delay: 24000,
    verification: "Verified",
    isRating: true,
    message: () =>
      "Your report has been closed. Please rate the service you received.",
  },
];

// Maps a report status label to a CSS modifier class, so the badge
// colors stay consistent everywhere a status is shown.
export function statusBadgeClass(label) {
  switch (label) {
    case "Verified":
      return "status-info";
    case "Assigned":
      return "status-assigned";
    case "Investigation / Action":
      return "status-progress";
    case "Resolved":
      return "status-resolved";
    case "Closed":
      return "status-closed";
    case "Submitted":
    default:
      return "status-pending";
  }
}
