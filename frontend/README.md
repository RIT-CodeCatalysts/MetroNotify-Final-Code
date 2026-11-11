# MetroNotify React frontend

Firebase-first MetroNotify (Ratepayer, Municipal Admin and shared Technician Portal).

1. In Firebase Authentication enable Email/Password and configure an authorised localhost domain for development.
2. Copy `firebase.env.template` to `.env` and fill in your project's Firebase **web client configuration**.
3. Run `npm install` and `npm start`.
4. Start the Flask backend on `http://127.0.0.1:5000` in a second terminal.
5. Each technician uses their own verified Firebase Auth email/password to access the same Technician Portal. The team overview contains no private resident descriptions.
6. Email notifications are opt-in and require the Firebase Trigger Email extension, set up by the project owner.

Read `../INTEGRATION_GUIDE.md` before testing; security configuration and Admin setup require permission from the Firebase project owner.
