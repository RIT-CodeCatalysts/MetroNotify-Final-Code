import "./App.css";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationsProvider } from "./context/NotificationsContext";
import { AreaProvider } from "./context/AreaContext";
import { LiveAlertsProvider } from "./context/LiveAlertsContext";

import LoginPage from "./components/auth/LoginPage";
import VerifyEmailPage from "./components/auth/VerifyEmailPage";
import TopBar from "./components/layout/TopBar";
import RoleHeader from "./components/layout/RoleHeader";
import Hero from "./components/layout/Hero";
import Ticker from "./components/layout/Ticker";
import Footer from "./components/layout/Footer";

import ActiveAlerts from "./components/dashboard/ActiveAlerts";
import AdminDashboard from "./components/dashboard/AdminDashboard";
import TechnicianDashboard from "./components/dashboard/TechnicianDashboard";
import AreaSelector from "./components/dashboard/AreaSelector";
import AreaStatus from "./components/dashboard/AreaStatus";
import Notifications from "./components/dashboard/Notifications";
import ReportTabs from "./components/dashboard/ReportTabs";
import IncidentMap from "./components/dashboard/IncidentMap";

function RatepayerPortal() {
  return (
    <>
      <TopBar />
      <Hero />
      <Ticker />

      <main id="dashboard" className="main-layout">
        <div className="left-column">
          <ActiveAlerts />
          <ReportTabs />
        </div>

        <aside className="sidebar">
          <AreaStatus />
          <AreaSelector />
          <Notifications />
        </aside>
      </main>

      <section className="incident-map-section" aria-label="Incident map">
        <IncidentMap />
      </section>

      <Footer />
    </>
  );
}

function TechnicianPortal() {
  return (
    <div className="role-portal-page">
      <RoleHeader title="Technician Portal" subtitle="Assigned municipal service jobs" />
      <main className="role-portal-content">
        <TechnicianDashboard />
        <Notifications />
      </main>
      <Footer />
    </div>
  );
}

function AdminPortal() {
  return (
    <div className="role-portal-page">
      <RoleHeader title="Municipal Admin Portal" subtitle="Manage reports, priorities, dispatch and resolution" />
      <main className="role-portal-content role-portal-content-wide">
        <AdminDashboard />
        <Notifications />
      </main>
      <Footer />
    </div>
  );
}

function AppRouter() {
  const { accountType, authLoading, currentUser } = useAuth();

  if (authLoading) {
    return (
      <div className="login-page">
        <div className="login-form-panel" style={{ width: "100%" }}>
          <div className="login-card" style={{ textAlign: "center" }}>
            <div className="login-step-icon">M</div>
            <h2>Loading MetroNotify...</h2>
          </div>
        </div>
      </div>
    );
  }

  if (accountType === "signedOut") {
    return <LoginPage />;
  }

  if (currentUser && !currentUser.emailVerified) {
    return <VerifyEmailPage />;
  }

  if (accountType === "admin") {
    return <AdminPortal />;
  }

  if (accountType === "technician") {
    return <TechnicianPortal />;
  }

  return <RatepayerPortal />;
}

function App() {
  return (
    <AuthProvider>
      <AreaProvider>
        <LiveAlertsProvider>
          <NotificationsProvider>
            <AppRouter />
          </NotificationsProvider>
        </LiveAlertsProvider>
      </AreaProvider>
    </AuthProvider>
  );
}

export default App;
