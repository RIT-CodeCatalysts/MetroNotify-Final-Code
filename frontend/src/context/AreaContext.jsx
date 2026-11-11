import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { apiRequest } from "../services/api";

const AreaContext = createContext(null);

export function AreaProvider({ children }) {
  const { currentUser } = useAuth();
  const [selectedArea, setSelectedArea] = useState(null);

  useEffect(() => {
    if (!currentUser?.id) { setSelectedArea(null); return; }
    let active = true;
    apiRequest("/api/me/preferences").then((result) => {
      if (active) setSelectedArea(result.selectedArea || null);
    }).catch((e) => console.warn("Could not retrieve area preferences:", e.message));
    return () => { active = false; };
  }, [currentUser?.id]);

  async function saveArea(areaData) {
    setSelectedArea(areaData);
    try {
      await apiRequest("/api/me/preferences", { method: "PATCH", body: { selectedArea: areaData } });
    } catch (error) {
      console.warn("Area preference could not be saved:", error.message);
    }
  }

  async function clearArea() {
    setSelectedArea(null);
    try {
      await apiRequest("/api/me/preferences", { method: "PATCH", body: { selectedArea: null } });
    } catch (error) {
      console.warn("Area preference could not be cleared:", error.message);
    }
  }

  return <AreaContext.Provider value={{ selectedArea, saveArea, clearArea }}>{children}</AreaContext.Provider>;
}

export function useArea() {
  const value = useContext(AreaContext);
  if (!value) throw new Error("useArea must be used within AreaProvider");
  return value;
}
