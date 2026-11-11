import LoginPage from "./LoginPage";

// Kept only for compatibility with older imports/tests. The live application
// now uses LoginPage as the single entry screen before any role portal opens.
function AuthModal() {
  return <LoginPage />;
}

export default AuthModal;
