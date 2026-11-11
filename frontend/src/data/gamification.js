/*
  Gamification rules (SRS Section 8).

  Kept intentionally simple and transparent: fixed XP awards for
  constructive actions, a level table derived from total XP, and a
  small set of milestone badges. Anti-gaming (FR-49/FR-50) is limited
  to what's enforceable client-side — one vote per user per alert, and
  XP only awarded for actions the user could not trivially spam (see
  the Flask backend for award and deduplication rules).
*/

export const XP_RULES = {
  SUBMIT_REPORT: 10,
  REPORT_COMMUNITY_VERIFIED: 15, // awarded to the reporter once their report crosses the verification threshold
  CAST_VERIFICATION_VOTE: 2, // awarded to a resident for participating in community verification
  CONFIRM_RESOLUTION: 20, // awarded when a resident confirms their reported issue was actually fixed
};

export const LEVELS = [
  { level: 1, title: "Newcomer", minXP: 0 },
  { level: 2, title: "Active Resident", minXP: 30 },
  { level: 3, title: "Community Watcher", minXP: 75 },
  { level: 4, title: "Neighbourhood Champion", minXP: 150 },
  { level: 5, title: "Civic Leader", minXP: 300 },
];

export function levelForXP(xp) {
  let current = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.minXP) current = l;
  }
  return current;
}

export function nextLevel(xp) {
  const current = levelForXP(xp);
  const idx = LEVELS.findIndex((l) => l.level === current.level);
  return LEVELS[idx + 1] || null;
}

export const BADGES = [
  { id: "first_report", label: "First Report", icon: "📋", description: "Submitted your first incident report." },
  { id: "five_reports", label: "Frequent Reporter", icon: "🗂️", description: "Submitted 5 incident reports." },
  { id: "community_watcher", label: "Community Watcher", icon: "🔍", description: "Cast 5 community verification votes." },
  { id: "verified_reporter", label: "Trusted Reporter", icon: "✅", description: "Had a report reach community-verified status." },
  { id: "problem_solver", label: "Problem Solver", icon: "🛠️", description: "Confirmed 3 of your reports were resolved." },
];

// Given a user record, returns the badge ids they currently qualify for.
export function evaluateBadges(user) {
  const earned = new Set(user.badges || []);

  if ((user.stats?.reportsSubmitted || 0) >= 1) earned.add("first_report");
  if ((user.stats?.reportsSubmitted || 0) >= 5) earned.add("five_reports");
  if ((user.stats?.votesCast || 0) >= 5) earned.add("community_watcher");
  if ((user.stats?.reportsVerified || 0) >= 1) earned.add("verified_reporter");
  if ((user.stats?.resolutionsConfirmed || 0) >= 3) earned.add("problem_solver");

  return Array.from(earned);
}
