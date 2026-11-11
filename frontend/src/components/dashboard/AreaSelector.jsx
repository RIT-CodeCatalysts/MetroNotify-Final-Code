import { useEffect, useState } from "react";
import { useArea } from "../../context/AreaContext";
import southAfricaData from "../../data/southAfricaAreas";

/*
  Lets a resident pick Province -> Municipality -> Area and save it via
  AreaContext, so the "Area Status" widget (and, in future, map
  filtering / notifications) can actually use it. AreaContext.saveArea()
  used to exist with nothing in the UI ever calling it, so "Area Status"
  always showed "No area selected".

  Once an area is saved, this card collapses into a small summary row
  (just the saved area + a "Change" button) instead of staying open as
  a full three-dropdown form, so it doesn't dominate the sidebar.
*/
function AreaSelector() {
  const { selectedArea, saveArea, clearArea } = useArea();

  // Only show the full form when there's no saved area yet, or the
  // resident has explicitly asked to change it.
  const [isEditing, setIsEditing] = useState(!selectedArea);

  const [province, setProvince] = useState(selectedArea?.province || "");
  const [municipality, setMunicipality] = useState(
    selectedArea?.municipality || ""
  );
  const [area, setArea] = useState(selectedArea?.area || "");

  // Keep the local form in sync if the saved area changes elsewhere
  // (e.g. cleared, or restored from Firestore on load), and
  // collapse back to the summary view whenever a save completes.
  useEffect(() => {
    setProvince(selectedArea?.province || "");
    setMunicipality(selectedArea?.municipality || "");
    setArea(selectedArea?.area || "");
    setIsEditing(!selectedArea);
  }, [selectedArea]);

  const availableMunicipalities = province
    ? Object.keys(southAfricaData[province] || {})
    : [];

  const availableAreas =
    province && municipality
      ? southAfricaData[province][municipality] || []
      : [];

  function handleProvinceChange(e) {
    setProvince(e.target.value);
    setMunicipality("");
    setArea("");
  }

  function handleMunicipalityChange(e) {
    setMunicipality(e.target.value);
    setArea("");
  }

  function handleSave(e) {
    e.preventDefault();

    if (!province || !municipality || !area) {
      return;
    }

    saveArea({ province, municipality, area });
    // useEffect above will collapse the card once selectedArea updates
  }

  function handleClear() {
    clearArea();
    setProvince("");
    setMunicipality("");
    setArea("");
    setIsEditing(true);
  }

  function handleCancelEdit() {
    // Revert the form back to the saved values and collapse again.
    setProvince(selectedArea?.province || "");
    setMunicipality(selectedArea?.municipality || "");
    setArea(selectedArea?.area || "");
    setIsEditing(false);
  }

  const canSave = province && municipality && area;

  // ── COMPACT SUMMARY VIEW ──────────────────────────────
  if (selectedArea && !isEditing) {
    return (
      <div className="card area-selector-summary">
        <div className="card-header">
          <div className="card-title">📍 Your Area</div>

          <button
            type="button"
            className="btn-link"
            onClick={() => setIsEditing(true)}
          >
            Change
          </button>
        </div>

        <div className="card-body area-selector-summary-body">
          <div className="area-summary-line">{selectedArea.area}</div>
          <div className="area-summary-sub">
            {selectedArea.municipality}, {selectedArea.province}
          </div>
        </div>
      </div>
    );
  }

  // ── FULL FORM VIEW ────────────────────────────────────
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">📍 Your Area</div>

        {selectedArea && (
          <button
            type="button"
            className="btn-link"
            onClick={handleCancelEdit}
          >
            Cancel
          </button>
        )}
      </div>

      <div className="card-body">
        <form onSubmit={handleSave} className="form-grid area-selector-grid">
          <div className="form-field full">
            <label htmlFor="area-selector-province">Province</label>
            <select
              id="area-selector-province"
              value={province}
              onChange={handleProvinceChange}
            >
              <option value="">-- Select Province --</option>
              {Object.keys(southAfricaData).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field full">
            <label htmlFor="area-selector-municipality">Municipality</label>
            <select
              id="area-selector-municipality"
              value={municipality}
              onChange={handleMunicipalityChange}
              disabled={!province}
            >
              <option value="">
                {province ? "-- Select Municipality --" : "Select province first"}
              </option>
              {availableMunicipalities.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field full">
            <label htmlFor="area-selector-area">Area</label>
            <select
              id="area-selector-area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              disabled={!municipality}
            >
              <option value="">
                {municipality ? "-- Select Area --" : "Select municipality first"}
              </option>
              {availableAreas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field full area-selector-actions">
            <button
              type="submit"
              className="btn-primary btn-gold"
              disabled={!canSave}
            >
              {selectedArea ? "Update Area" : "Save Area"}
            </button>

            {selectedArea && (
              <button
                type="button"
                className="btn-outline"
                onClick={handleClear}
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default AreaSelector;
