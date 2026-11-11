# MetroNotify Flask integration

For complete installation steps and an end-to-end test checklist, see `../INTEGRATION_GUIDE.md`.

The API now handles real Firestore reports, ticket assignments, technician progress, individual/role notifications, and administrator-published alerts.

**Security:** protected endpoints verify Firebase Auth ID tokens and read the role from `users/{uid}`. The synthetic React login is supported **only** when `METRONOTIFY_DEMO_MODE=1` and Flask runs on loopback. This is an explicitly unsafe classroom demonstration mode; never deploy it.

The code is not automatically authorised to access any Firebase project. You must configure your own Application Default Credentials and have legitimate permissions. Do not commit private JSON credentials.

### API endpoints

| Method | Endpoint | Role |
| --- | --- | --- |
| GET | `/` | Public health check |
| POST/GET | `/api/reports` | Ratepayer submit / authorised listing |
| GET | `/api/reports/<reference>` | Own report, Admin or assigned Technician |
| PATCH | `/api/reports/<reference>/review` | Admin |
| GET/POST | `/api/technicians` | Admin list/create, Technician list |
| GET | `/api/tickets` | Admin / shared Technician |
| POST | `/api/tickets/<id>/assign` | Admin |
| PATCH | `/api/tickets/<id>/status` | Shared Technician |
| GET | `/api/notifications` | Signed-in user/role |
| PATCH | `/api/notifications/<id>/read` | Recipient |
| GET | `/api/alerts` | Published alerts only (public) |
| POST/PATCH | `/api/alerts`, `/api/alerts/<id>` | Admin |
| GET | `/api/me` | Authenticated profile |
| POST | `/api/users/demo-sync` | Local synthetic Ratepayer only |
| POST | `/api/comments`, `/api/badges/check` | Ratepayer |
| GET | `/api/leaderboard/<zone>` | Authenticated |

### Safety notes

- Do not run `create_test_data.py` against a shared Firebase database without explicit approval.
- The current demo mode is not sufficient for public deployment; never expose this Flask port.
- Database writes are not automatically performed when importing modules, except server connection setup.
- Full browser build and live Firebase integration tests need to run on a machine with dependencies and authorized project access.
