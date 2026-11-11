import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail,
  sendEmailVerification, reload, signInWithEmailAndPassword, signOut, updateProfile,
} from "firebase/auth";
import { auth, firebaseConfigured } from "../firebase";
import { apiRequest } from "../services/api";

const AuthContext = createContext(null);

function messageFor(error) {
  const code = error?.code || "";
  if (/invalid-credential|wrong-password|user-not-found/.test(code)) return "Incorrect email or password.";
  if (/email-already-in-use/.test(code)) return "That email address is already registered.";
  if (/weak-password/.test(code)) return "Please choose a stronger password of at least 12 characters.";
  if (/operation-not-allowed/.test(code)) return "Enable Email/Password in Firebase Authentication first.";
  if (/network-request-failed/.test(code)) return "Cannot reach Firebase. Check your connection.";
  return error?.message || "Something went wrong. Please try again.";
}

function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const registeringRef = useRef(false);

  const refreshProfile = useCallback(async () => {
    if (!auth?.currentUser) { setCurrentUser(null); return null; }
    const uid = auth.currentUser.uid;
    const response = await apiRequest("/api/me");
    if (auth.currentUser?.uid !== uid) return null;
    const user = response.user;
    if (!user?.role) throw new Error("This account has no authorised MetroNotify role.");
    const profile = {
      id: auth.currentUser.uid,
      email: auth.currentUser.email || user.email || "",
      name: user.name || auth.currentUser.displayName || "MetroNotify User",
      role: user.role,
      emailVerified: !!auth.currentUser.emailVerified,
      municipality: user.municipality || "",
      ratepayerStatus: user.ratepayerStatus || "pending",
      technicianId: user.technicianId || null,
      emailNotificationsEnabled: !!user.emailNotificationsEnabled,
      xp: user.points || 0, level: user.level || "Citizen",
      badges: user.badges || [], streak: user.streak || 0,
      stats: user.stats || {}
    };
    setCurrentUser(profile);
    return profile;
  }, []);

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setAuthLoading(false);
      setAuthError("Firebase configuration missing. Follow FIREBASE_SETUP.md and add frontend/.env.");
      return;
    }
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        if (active) { setCurrentUser(null); setAuthLoading(false); }
        return;
      }
      if (registeringRef.current) return;
      try {
        await refreshProfile();
        if (active) setAuthError("");
      } catch (error) {
        if (active) {
          setCurrentUser(null);
          setAuthError("Your Firebase login is valid but a MetroNotify profile is missing or unavailable. " + messageFor(error));
        }
      } finally { if (active) setAuthLoading(false); }
    });
    return () => { active = false; unsubscribe(); };
  }, [refreshProfile]);

  // Values such as XP are server-owned; never manufacture points in localStorage.
  useEffect(() => {
    if (!currentUser?.id) return;
    const timer = setInterval(() => refreshProfile().catch(() => {}), 20000);
    return () => clearInterval(timer);
  }, [currentUser?.id, refreshProfile]);

  async function login(email, password) {
    setAuthError(""); setAuthNotice("");
    if (!auth) { setAuthError("Firebase has not been configured."); return false; }
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      await refreshProfile();
      return true;
    } catch (error) {
      setCurrentUser(null);
      setAuthError(messageFor(error));
      return false;
    }
  }

  async function register({ name, email, password, accountNumber, propertyAddress, municipality, emailNotificationsEnabled }) {
    setAuthError(""); setAuthNotice("");
    if (!auth) { setAuthError("Firebase has not been configured."); return false; }
    if (!name?.trim() || !email?.trim() || password?.length < 12) {
      setAuthError("Enter your name, email and a unique password of at least 12 characters.");
      return false;
    }
    registeringRef.current = true;
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(credential.user, { displayName: name.trim() });
      // The server—not the browser—creates a role-restricted Firestore profile.
      await apiRequest("/api/auth/register", {
        method: "POST",
        body: { name: name.trim(), accountNumber, propertyAddress, municipality,
          emailNotificationsEnabled: emailNotificationsEnabled === true }
      });
      await refreshProfile();
      setAuthError("");
      try {
        await sendEmailVerification(credential.user);
        setAuthNotice("Account created. Check your email and verify your address before accessing MetroNotify.");
      } catch (verificationError) {
        setAuthNotice("Account created, but Firebase could not send a verification email. Use Resend verification below.");
      }
      return true;
    } catch (error) {
      setAuthError(messageFor(error) + " If your login was created but the profile failed, ask an Admin for support.");
      return false;
    } finally {
      registeringRef.current = false;
      setAuthLoading(false);
    }
  }

  async function resendVerificationEmail() {
    setAuthError(""); setAuthNotice("");
    if (!auth?.currentUser) { setAuthError("Sign in first."); return false; }
    try {
      await sendEmailVerification(auth.currentUser);
      setAuthNotice("Verification email requested. Check your inbox and spam folder.");
      return true;
    } catch (error) {
      setAuthError(messageFor(error));
      return false;
    }
  }

  async function checkVerification() {
    setAuthError("");
    if (!auth?.currentUser) return false;
    try {
      await reload(auth.currentUser);
      await auth.currentUser.getIdToken(true);
      const updated = await refreshProfile();
      if (updated?.emailVerified) {
        setAuthNotice("Email verified successfully.");
        return true;
      }
      setAuthNotice("Your email is not verified yet. Open the link in your inbox first.");
      return false;
    } catch (error) { setAuthError(messageFor(error)); return false; }
  }

  async function logout() {
    setAuthError(""); setAuthNotice("");
    if (auth) await signOut(auth);
    setCurrentUser(null);
  }

  async function resetPassword(email) {
    setAuthError(""); setAuthNotice("");
    if (!auth || !email?.trim()) { setAuthError("Enter your email address first."); return false; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setAuthNotice("If that account exists, Firebase will email password-reset instructions.");
      return true;
    } catch (error) { setAuthError(messageFor(error)); return false; }
  }

  const accountType = currentUser?.role || "signedOut";
  return (
    <AuthContext.Provider value={{
      currentUser, isAuthenticated: !!currentUser, accountType,
      isAdmin: accountType === "admin", isTechnician: accountType === "technician",
      canReport: accountType === "ratepayer", authError, authNotice, authLoading,
      login, logout, register, resetPassword, refreshProfile,
      resendVerificationEmail, checkVerification,
      clearAuthError: () => setAuthError(""), clearAuthNotice: () => setAuthNotice(""),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
export { AuthProvider };
