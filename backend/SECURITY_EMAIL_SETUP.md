# Security and verified-email notification implementation notes

- Public ratepayer signup always assigns `ratepayer`; no browser-supplied role is accepted.
- An invited technician gets an individual random, unknown initial password. They use Firebase Forgot password to set a private password and then verify the address. Technicians share **one portal interface**, not a password.
- `/api/tickets/overview` provides a **redacted team board** to verified Admin/Technician users. `/api/tickets` and ticket writes remain scoped to the technician actually assigned to each job.
- Protected Flask APIs validate Firebase ID token/revocation, role from `users/{uid}`, and email verification. `/api/me` stays accessible while email is unverified to support the verification screen.
- Registration uses minimum 12-character passwords. Firebase Authentication handles passwords and reset/verification messages; the app does not store plaintext or hashes.
- `emailNotificationsEnabled` defaults to `false` and can be changed by the signed-in user via `PATCH /api/me/preferences`.
- `modules.notifications.create_notification` always saves an in-app Firestore notification. When `METRONOTIFY_EMAIL_ENABLED=1`, a matching `mail/<notification_id>` item is created **only** when there is a personal recipient, a verified Firebase Auth email, and explicit Firestore opt-in. Sender and SMTP config belong to the Firebase Trigger Email extension.
- `auditLogs` contain actor UID, role, action, target ID and timestamp for selected privileged workflow actions, without tokens or passwords.
- CORS is restricted to `FRONTEND_ORIGIN` (default `http://localhost:3000`); API responses are not cacheable. For public hosting, serve HTTPS and put Flask behind a production WSGI/reverse proxy with durable rate limits and monitoring.
- `.env`, service-account keys and virtual environment are ignored. Never share Firebase Admin private keys. Password reset links are sensitive and must not be posted in chats.
- Firestore's proposed direct-client deny rules are NOT deployed automatically. Coordinate changes to the shared project with all maintainers.

Firebase documentation:
- Trigger Email extension: https://firebase.google.com/docs/extensions/official/firestore-send-email
- Firebase email verification: https://firebase.google.com/docs/reference/js/auth
- Authorized domains: https://firebase.google.com/docs/auth/faq-and-troubleshooting
