
/**
 * METRONOTIFY - TECHNICIAN DASHBOARD
 *
 * This component provides the main portal for
 * municipal technicians.
 *
 * Main responsibilities:
 * 1. Check whether the logged-in user is a technician.
 * 2. Prevent other user roles from accessing the dashboard.
 * 3. Welcome the technician by name.
 * 4. Display jobs assigned to their Firebase account.
 *
 * Job information, addresses, photos and status updates
 * are handled by FirebaseTechnicianJobs.jsx.
 */

// Import authentication information from the AuthContext.
import { useAuth } from "../../context/AuthContext";

// Import the component that displays assigned municipal jobs.
import FirebaseTechnicianJobs from "./FirebaseTechnicianJobs";


/**
 * TECHNICIAN DASHBOARD COMPONENT
 *
 * Displays the technician portal only when the
 * signed-in user has the technician role.
 */
export default function TechnicianDashboard() {

  // Get the logged-in user and technician role from Firebase authentication.
  const { currentUser, isTechnician } = useAuth();


  // --------------------------------------------------
  // 1. CHECK TECHNICIAN ACCESS
  // --------------------------------------------------

  /*
   * Only invited technician accounts can access this portal.
   *
   * Ratepayers and administrators cannot use this dashboard
   * unless their authenticated role is technician.
   *
   * Flask also verifies permissions on every protected API
   * request, so access is not controlled by React alone.
   */
  if (!isTechnician) {
    return (
      <p role="alert">
        Only invited Firebase technician accounts
        may access this portal.
      </p>
    );
  }


  // --------------------------------------------------
  // 2. DISPLAY THE TECHNICIAN DASHBOARD
  // --------------------------------------------------

  return (
    <div className="card">

      {/* Dashboard heading */}
      <div className="card-header">

        <div className="card-title">
          🔧 My Assigned Municipal Jobs
        </div>

      </div>


      {/* Main technician dashboard content */}
      <div className="card-body">

        {/* Welcome message and explanation */}
        <p
          className="form-footnote"
          style={{ textAlign: "left" }}
        >
          Welcome {currentUser?.name || "Technician"}.
          Only tickets assigned to your verified technician
          account are displayed. Updates are saved
          directly in Firestore.
        </p>


        {/* ------------------------------------------------
            3. DISPLAY ASSIGNED MUNICIPAL JOBS

            FirebaseTechnicianJobs is responsible for:
            - Loading assigned tickets from Flask.
            - Displaying incident information.
            - Displaying available location details.
            - Showing job statuses.
            - Allowing permitted status updates.

            The exact fields displayed depend on the
            implementation of FirebaseTechnicianJobs.jsx.
        ------------------------------------------------ */}

        <FirebaseTechnicianJobs />

      </div>

    </div>
  );
}

