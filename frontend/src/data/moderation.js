/*
  Content moderation (SRS FR-62/FR-63).

  A real deployment would run this server-side with a proper moderation
  service; this client-side word-list check is a genuine first line of
  defence for the demo, not a placeholder — it actually blocks
  submission when triggered — but it is not a substitute for real
  moderation infrastructure. Kept intentionally small and generic.
*/
const PROHIBITED_TERMS = [
  "fuck", "shit", "bitch", "cunt", "asshole", "bastard",
  "kill yourself", "nigger", "faggot", "retard",
];

export function containsProhibitedContent(text) {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return PROHIBITED_TERMS.some((term) => normalized.includes(term));
}

// Very small sanitiser: strips any HTML tags a user might paste in,
// since this text is later rendered as plain content throughout the
// app (React already escapes text nodes by default, so this is a
// defence-in-depth measure rather than the only protection).
export function sanitizeText(text) {
  if (!text) return text;
  return text.replace(/<[^>]*>/g, "");
}
