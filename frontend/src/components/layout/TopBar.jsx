import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import ProfilePage from "../profile/ProfilePage";

const ROLE_LABEL = {
  ratepayer: "Ratepayer",
  technician: "Technician",
  admin: "Municipal Admin",
};

function TopBar() {
  const { currentUser, accountType, logout } = useAuth();
  const [showProfile, setShowProfile] = useState(false);

  return (
    <header className="topbar" role="banner">
      <div className="topbar-brand">
        <div className="logo-icon" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 18 18"
            fill="none"
          >
            <path
              d="M9 1L11.5 6.5H17L12.5 10L14.5 16L9 12.5L3.5 16L5.5 10L1 6.5H6.5L9 1Z"
              fill="#27500A"
            />
          </svg>
        </div>

        MetroNotify
      </div>

      <nav className="topbar-nav" aria-label="Main navigation">
        <a href="#dashboard" className="active">
          Dashboard
        </a>
        <a href="#alerts">Alerts</a>
        <a href="#report">Report</a>
      </nav>

      <div className="topbar-actions">
        <span className="role-badge">{ROLE_LABEL[accountType]}</span>

        {currentUser && (
          <>
            <button className="btn-icon" onClick={() => setShowProfile(true)} aria-label="Profile" title="Profile">
              {currentUser.name.charAt(0).toUpperCase()}
            </button>
            <button className="btn-filter topbar-auth-btn" onClick={logout} type="button">
              Log Out
            </button>
          </>
        )}

        <button className="btn-icon hamburger" aria-label="Menu">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            width="18"
            height="18"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {showProfile && <ProfilePage onClose={() => setShowProfile(false)} />}
    </header>
  );
}

export default TopBar;
