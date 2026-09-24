import { useState, type FormEvent } from "react";
import { geocodeStoredAddress } from "../geocode";
import {
  lookupProperty,
  saveGeocodedProperty,
  updatePropertyDetails,
  type Property,
  type PropertyDetails,
} from "../propertyApi";

const plannedSections = [
  "Roof Profile",
  "Solar System",
  "Sunlight & Shadow",
  "Energy Production",
  "Electricity Bills",
  "Economics",
];

function OptionalDetails({ property, onSaved }: { property: Property; onSaved: (property: Property) => void }) {
  const [propertyType, setPropertyType] = useState(property.propertyType ?? "");
  const [yearBuilt, setYearBuilt] = useState(property.yearBuilt?.toString() ?? "");
  const [livingArea, setLivingArea] = useState(property.livingAreaSqFt?.toString() ?? "");
  const [lotSize, setLotSize] = useState(property.lotSizeSqFt?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const details: PropertyDetails = {
      propertyType: propertyType.trim() || null,
      yearBuilt: yearBuilt ? Number(yearBuilt) : null,
      livingAreaSqFt: livingArea ? Number(livingArea) : null,
      lotSizeSqFt: lotSize ? Number(lotSize) : null,
    };
    try {
      const updated = await updatePropertyDetails(property.id, details);
      onSaved(updated);
      setMessage("Property details saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save property details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={saveDetails} className="details-form">
      <p className="muted">Optional details are entered by you, not supplied by ArcGIS.</p>
      <label>Property type<input value={propertyType} maxLength={80} onChange={(event) => setPropertyType(event.target.value)} /></label>
      <label>Year built<input type="number" min="1600" max={new Date().getFullYear() + 1} value={yearBuilt} onChange={(event) => setYearBuilt(event.target.value)} /></label>
      <label>Living area (sq ft)<input type="number" min="0.01" step="any" value={livingArea} onChange={(event) => setLivingArea(event.target.value)} /></label>
      <label>Lot size (sq ft)<input type="number" min="0.01" step="any" value={lotSize} onChange={(event) => setLotSize(event.target.value)} /></label>
      <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save details"}</button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

export function AnalyzePage() {
  const [address, setAddress] = useState("");
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function locateProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedAddress = address.trim().replace(/\s+/gu, " ");
    if (requestedAddress.length < 5 || requestedAddress.length > 200) {
      setError("Enter a valid property address (5–200 characters).");
      return;
    }
    setLoading(true);
    setProperty(null);
    setError("");
    setNotice("Checking local properties…");
    try {
      const cached = await lookupProperty(requestedAddress);
      if (cached) {
        setProperty(cached);
        setNotice("Loaded from the local property registry.");
        return;
      }
      setNotice("Locating address with ArcGIS…");
      const geocoded = await geocodeStoredAddress(requestedAddress);
      setNotice("Saving property locally…");
      const saved = await saveGeocodedProperty({ requestedAddress, ...geocoded });
      setProperty(saved);
      setNotice("Property saved in the local registry.");
    } catch (cause) {
      setNotice("");
      setError(cause instanceof Error ? cause.message : "Could not locate this property.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="analyze-title" className="page">
      <div className="page-heading">
        <p className="eyebrow">ONE PROPERTY AT A TIME</p>
        <h1 id="analyze-title">Analyze property solar potential</h1>
        <p>Start by locating a residential property.</p>
      </div>
      <section className="search-panel" aria-labelledby="property-search-title">
        <h2 id="property-search-title">Property Search</h2>
        <form onSubmit={locateProperty} className="search-row">
          <input aria-label="Property address" placeholder="Enter a property address" value={address} onChange={(event) => setAddress(event.target.value)} disabled={loading} required maxLength={200} />
          <button type="submit" disabled={loading}>{loading ? "Locating…" : "Load / Locate Property"}</button>
        </form>
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert" className="error-message">{error}</p>}
      </section>
      <div className="analysis-layout">
        <section className="map-placeholder" aria-label="ArcGIS Map / 3D placeholder">
          <span>ArcGIS Map / 3D</span>
          <p>Spatial visualization is planned for M2.</p>
        </section>
        <aside className="analysis-sections" aria-label="Analysis sections">
          <section className="section-card" aria-labelledby="property-summary-title">
            <h2 id="property-summary-title">Property Summary</h2>
            {property ? (
              <div>
                <p className="property-address">{property.displayAddress}</p>
                <p>Coordinates: {property.latitude.toFixed(6)}, {property.longitude.toFixed(6)}</p>
                <OptionalDetails key={property.id} property={property} onSaved={setProperty} />
              </div>
            ) : <p>No property loaded.</p>}
          </section>
          {plannedSections.map((section) => <section key={section} className="section-card"><h2>{section}</h2><p>Planned</p></section>)}
        </aside>
      </div>
    </section>
  );
}
