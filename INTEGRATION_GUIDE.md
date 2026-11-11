# MetroNotify — Firebase-first integrated workspace

This is an **edited copy** of the ZIP supplied by the team. It contains the React frontend and Flask backend; the three original root-level legacy test files have been left untouched. It is a handoff archive, not a GitHub push. No `.git` directory, `.env`, service-account keys, `node_modules`, or Python virtual environments are included.

## Functionality in this workspace

- Firebase Authentication email/password registration, sign-in and password reset. Ratepayer registration produces a Firebase Auth user and a Firestore `users/{uid}` profile with `role=ratepayer`. The user must **verify their email** before using the protected app endpoints. New municipal billing details remain pending municipal verification.
- A **single shared Technician Portal interface** for all technicians: each has a separate Firebase email login and self-chosen password. The *team overview* displays only ticket type, status, technician name, priority and ticket ID. Full job details and Start/Resolve controls are limited to the actual assigned technician.
- Municipal Admin role stored in Firestore and provisioned by an authorised project owner; staff cannot register as an Admin or Technician via public signup.
- Ratepayer report submission, map coordinate selection, reference number, ticket grouping, Firestore status changes, Admin review and manual assignment, Technician progress and owner-only tracking, in-app notifications, approved public alerts, enquiries and user profile preferences.
- Optional **email notifications** to a user's *verified Firebase Auth email*, but **only with opt-in**. Server queues messages in Firestore `mail`, for the official Firebase Trigger Email extension to deliver after installation. The queue is off by default. Emails are **not sent simply by unzipping the workspace**.
- Audit-log writes for selected Admin and Technician operations, 6 MiB request-size cap and security response headers. Firestore direct client access is designed to be disabled if the team agrees to deploy `firestore.rules`; the backend's Firebase Admin SDK accesses Firestore securely using IAM.
- Optional 10-category technician staffing planner and a secure CSV bulk-invitation utility. Both are non-writing by default; fake test staff are **not** automatically added to the team's Firebase database.

## Important security choices

**DO NOT give all technicians an identical password.** That prevents accountability and makes one stolen password compromise everyone. The shared *portal* is implemented, while every invited person chooses their own password through Firebase's Forgot password workflow. A technician must verify their address before accessing jobs. Sharing a password is not needed to see the redacted team board.

The Flask API **verifies Firebase ID tokens** (including revocation and verified email), reads the **trusted Firestore role**, and checks ownership of tickets/reports before reading or updating. Frontend role controls alone are not the security boundary. This is still a project prototype, not a production security certification. Additional work includes production reverse-proxy HTTPS, durable multi-instance rate limiting, audits of all write routes, backup and recovery, stricter incident concurrency handling, pagination, deployment review and tests with the team's own Firebase configuration.

## Setup on Windows (do not put secrets into Git)

1. Obtain team approval for the Firebase project `utility-alert-system` and make sure your account is authorised to access it. Do not run data-seeding tools on the shared project without approval.
2. Firebase Console → Authentication → Sign-in method: enable **Email/Password**. Under Settings → Authorized domains, add `localhost` **for local development only** if missing. Create/locate the Web App configuration in Project Settings.
3. In the extracted `frontend` folder, create `.env` using `firebase.env.template` and fill in your **Firebase Web App config**. These client configuration values are not Admin credentials; never put a service-account private key in React.
4. Set up Google Cloud Application Default Credentials with your authorised project on your own machine (e.g. `gcloud auth application-default login`). Your Firebase Admin service-account details are not part of this ZIP.
5. In a backend PowerShell terminal:

   ```powershell
   cd "<extracted workspace>\backend"
   py -m venv .venv
   & ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
   & ".\.venv\Scripts\python.exe" app.py
   ```

6. In a separate frontend PowerShell terminal:

   ```powershell
   cd "<extracted workspace>\frontend"
   npm install
   npm start
   ```

7. Visit `http://localhost:3000`. Create a fictional ratepayer account with a **real inbox you control**. Open its Firebase verification email, then click **I've verified my email — Continue** in MetroNotify. Passwords must have at least 12 characters. Only use fictional reports on the shared classroom project.
8. To create the first Admin, an authorised project owner first creates/owns a Firebase Auth email account and then explicitly runs `backend/bootstrap_admin.py --email <approved address> --apply` on a trusted admin machine. Preview by omitting `--apply`. **Never** expose that script as an HTTP endpoint.
9. Admin → Add Technician: enter the person's actual work email and their speciality. That creates a separate Firebase Auth staff account and Firestore profile. The technician clicks **Forgot password?** at login to choose their own private password, then verifies their email. Admin can also invite older technician records which have no Auth login.
10. Admin verifies a test report, assigns the relevant technician, technician starts/resolves the job, ratepayer tracks the same reference, notifications show in-app. In Technician Portal, all technicians can see the privacy-safe overview, not other residents' report descriptions.

## Technician service coverage

| Resident report category | Technician specialisation |
|---|---|
| Electricity | electrical |
| Water | plumbing |
| Sewerage | plumbing |
| Potholes | civil |
| Vandalism | security |
| Streetlights | electrical |
| Waste / Refuse | waste |
| Stormwater | civil |
| Traffic Lights | traffic |
| Other | general |

For larger legitimate staff rosters, see `backend/provision_technicians_csv.py` and `backend/technician_roster_template.csv`. The script prints a read-only preview by default, requires explicit project confirmation and `--apply`, and never puts a common password or password list in the code. Do not bulk-create fictitious emails on a live project.

## Email updates (additional setup required)

1. In Firebase Console → Extensions, install **Trigger Email from Firestore** (`firebase/firestore-send-email`) **only with the project owner's approval**. Configure the collection as `mail` and provide an approved SMTP/email delivery provider to the extension. Ensure the collection has no client-side write access. These settings/credentials belong in Firebase's protected extension configuration, not `.env` in React.
2. On the server, set `$env:METRONOTIFY_EMAIL_ENABLED="1"` in the Flask terminal **only after** the extension has been configured and tested. The default is `0`, which keeps email queuing disabled. The email outbox is written by backend code only.
3. During registration, the ratepayer optionally checks "Email me updates". For existing accounts, the checkbox is in **My Profile**. Users must verify their Firebase email first. Technician accounts can also enable this setting in their profile.
4. Test a fictional report, assign it or update its status. Confirm a `notifications` document is created and, if opted-in and verified, a matching `mail/<notification-id>` document appears. Verify actual delivery and extension logs **in Firebase**; a queued record is not proof that an email arrived.
5. **Role-based Admin notifications** are available inside the app; this setup queues email only for notifications directed to a single opted-in user. This avoids automatically emailing every Admin on every report.

Reference: https://firebase.google.com/docs/extensions/official/firestore-send-email

## Smoke tests before sharing/deployment

- Without a Firebase bearer token, private GET `/api/reports` and `/api/tickets` return 401.
- An unverified email with a valid ID token can load `/api/me` but gets 403 for protected reports/jobs.
- A ratepayer cannot access Admin endpoints and cannot read another person's report.
- Technician A can view the **redacted** `/api/tickets/overview`, but `/api/tickets` shows only their own assigned jobs and A cannot change Technician B's ticket.
- An Admin can verify a report, assign an available correctly qualified technician, and publish alerts only after verification.
- In-app notifications remain visible even if email delivery is disabled or the extension fails.
- The mail outbox never accepts writes directly from browser clients.
- Check `auditLogs` entries for report verification, technician provisioning, assignment, status updates and alert publication.
- Photo upload needs `FIREBASE_STORAGE_BUCKET` configured on Flask and Firebase Storage permissions on that trusted backend project.

## Known limitations / pending deployment work

- The ZIP has passed **Python compilation** and **JS/JSX parse checks** in the artifact environment. It has **not** passed a complete React production build or a live Firebase end-to-end test in that environment because dependencies/credentials were unavailable. Your previous laptop's original submission test isn't a verification of every new change in this ZIP.
- Email delivery requires explicit extension + provider installation, team permissions, confirmed mail account and opt-in. Firebase Auth verification and password reset emails are separate built-in Firebase Authentication operations.
- Rules are included as a proposed configuration only. **Do not deploy the blanket-deny `firestore.rules` to a shared project before checking other project clients**, since it can break their direct Firestore access. Firebase Admin SDK bypasses these client rules.
- For serious public deployment: HTTPS, persistent rate limiting, unique submission idempotency, comprehensive security tests, monitoring/alerting, incident grouping concurrency, robust permission matrices and backup/recovery still need review.

**GitHub sharing**: Extract this archive; copy edited `frontend/`, `backend/`, guide and rules to a clean clone on a NEW review branch from `natalie-integration`, test with the team, review diff for secrets, then open a PR. Unzipping it does not automatically push anything to GitHub.
