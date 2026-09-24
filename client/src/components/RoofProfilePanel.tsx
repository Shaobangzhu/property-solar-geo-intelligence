import { useState, type FormEvent } from "react";
import type { Property, RoofProfile, RoofProfileInput } from "../propertyApi";
import type { RoofGeometry } from "../roofGeometry";

function RoofForm({ profile, geometry, onSave, onClearGeometry }: {
  profile: RoofProfile | null;
  geometry: RoofGeometry | null;
  onSave: (input: RoofProfileInput) => Promise<void>;
  onClearGeometry: () => void;
}) {
  const [area, setArea] = useState(profile?.usableAreaSqFt?.toString() ?? "");
  const [tilt, setTilt] = useState(profile?.tiltDegrees.toString() ?? "");
  const [azimuth, setAzimuth] = useState(profile?.azimuthDegrees.toString() ?? "");
  const [shading, setShading] = useState(profile?.estimatedShadingFactor?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const outlineChanged = JSON.stringify(geometry) !== JSON.stringify(profile?.roofGeometryJson ?? null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const usableAreaSqFt = area.trim() === "" ? null : Number(area);
    const tiltDegrees = Number(tilt);
    const azimuthDegrees = Number(azimuth);
    const estimatedShadingFactor = shading.trim() === "" ? null : Number(shading);
    if (tilt.trim() === "" || !Number.isFinite(tiltDegrees) || tiltDegrees < 0 || tiltDegrees > 90) {
      setMessage("Enter a roof tilt from 0 to 90 degrees.");
      return;
    }
    if (azimuth.trim() === "" || !Number.isFinite(azimuthDegrees) || azimuthDegrees < 0 || azimuthDegrees >= 360) {
      setMessage("Enter an azimuth from 0 up to, but not including, 360 degrees.");
      return;
    }
    if (usableAreaSqFt !== null && (!Number.isFinite(usableAreaSqFt) || usableAreaSqFt <= 0 || usableAreaSqFt > 1_000_000)) {
      setMessage("Usable roof area must be greater than 0 and at most 1,000,000 sq ft.");
      return;
    }
    if (estimatedShadingFactor !== null && (!Number.isFinite(estimatedShadingFactor)
      || estimatedShadingFactor < 0 || estimatedShadingFactor > 1)) {
      setMessage("Estimated shading factor must be from 0 to 1.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await onSave({ usableAreaSqFt, tiltDegrees, azimuthDegrees, estimatedShadingFactor, roofGeometryJson: geometry });
      setMessage("Roof assumptions saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save roof assumptions.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="roof-form" onSubmit={save} noValidate>
      <label>Usable Roof Area (sq ft)
        <input type="number" min="0.01" max="1000000" step="any" value={area} onChange={(event) => setArea(event.target.value)} />
      </label>
      <label>Roof Tilt (degrees)
        <input type="number" min="0" max="90" step="any" required value={tilt} onChange={(event) => setTilt(event.target.value)} />
      </label>
      <label>Roof Azimuth (degrees)
        <input type="number" min="0" max="359.99" step="any" required value={azimuth} onChange={(event) => setAzimuth(event.target.value)} />
      </label>
      <p className="muted">Azimuth is clockwise from north: 0° north, 90° east, 180° south.</p>
      <label>Estimated Shading Factor
        <input type="number" min="0" max="1" step="any" value={shading} onChange={(event) => setShading(event.target.value)} />
      </label>
      <p className="muted">Optional 0–1 fraction of sunlight lost to shade. 0 means no estimated shade loss.</p>
      <div className="roof-outline-status">
        <p>{geometry ? `Sketch outline ${outlineChanged ? "not yet saved" : "saved"}.`
          : outlineChanged ? "Outline removal not yet saved." : "No sketch outline saved."}</p>
        {geometry && <button type="button" onClick={onClearGeometry}>Remove outline</button>}
      </div>
      <p className="muted">Optional: use the polygon tool in Map mode to draw one planning outline. Its shape is shown in Map and 3D; it does not calculate usable area.</p>
      <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Roof Profile"}</button>
      {message && <p role={message === "Roof assumptions saved." ? "status" : "alert"}>{message}</p>}
    </form>
  );
}

export function RoofProfilePanel({ property, profile, geometry, loading, error, onRetry, onSave, onClearGeometry }: {
  property: Property | null;
  profile: RoofProfile | null;
  geometry: RoofGeometry | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onSave: (input: RoofProfileInput) => Promise<void>;
  onClearGeometry: () => void;
}) {
  return (
    <section className="section-card roof-profile-panel" aria-labelledby="roof-profile-title">
      <h2 id="roof-profile-title">Roof Profile</h2>
      <p className="assumption-label">User-adjustable assumptions</p>
      <p className="muted">Planning estimates only. These are not engineering measurements or an automatic roof reconstruction.</p>
      {!property ? <p>Load a property to enter roof assumptions.</p>
        : loading ? <p role="status">Loading Roof Profile…</p>
          : error ? <div><p role="alert" className="error-message">{error}</p><button type="button" onClick={onRetry}>Retry loading</button></div>
            : <RoofForm profile={profile} geometry={geometry} onSave={onSave} onClearGeometry={onClearGeometry} />}
    </section>
  );
}
