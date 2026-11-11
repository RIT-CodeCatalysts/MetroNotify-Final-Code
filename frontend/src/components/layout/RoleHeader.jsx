import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import ProfilePage from "../profile/ProfilePage";

function RoleHeader({ title, subtitle }) {
  const { currentUser, logout } = useAuth();
  const [showProfile, setShowProfile] = useState(false);

  return (
    <header className="role-header">
      <div>
        <div className="role-header-brand">MetroNotify</div>
        <div className="role-header-title">{title}</div>
        {subtitle && <div className="role-header-subtitle">{subtitle}</div>}
      </div>
      <div className="role-header-user">
        <div className="role-user-copy">
          <strong>{currentUser?.name}</strong>
          <span>{currentUser?.email}</span>
        </div>
        <button type="button" className="role-logout-btn"
          onClick={() => setShowProfile(true)}>My Profile</button>
        <button type="button" className="role-logout-btn" onClick={logout}>Log Out</button>
      </div>
      {showProfile && <ProfilePage onClose={() => setShowProfile(false)} />}
    </header>
  );
}

export default RoleHeader;
