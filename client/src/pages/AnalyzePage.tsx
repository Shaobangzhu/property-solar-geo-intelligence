import { useEffect, useRef, useState, type FormEvent } from "react";
import { EnergyProductionPanel } from "../components/EnergyProductionPanel";
import { EconomicsPanel } from "../components/EconomicsPanel";
import { HistoricalBillsPanel } from "../components/HistoricalBillsPanel";
import { PropertyVisualization } from "../components/PropertyVisualization";
import { RoofProfilePanel } from "../components/RoofProfilePanel";
import { SolarSystemPanel } from "../components/SolarSystemPanel";
import { SunlightShadowPanel } from "../components/SunlightShadowPanel";
import { hasValidCoordinates } from "../components/propertyLocation";
import { geocodeStoredAddress } from "../geocode";
import {
  lookupProperty,
  loadSolarSystem,
  loadRoofProfile,
  estimateSolarProduction,
  saveGeocodedProperty,
  saveRoofProfile,
  saveSolarSystem,
  updatePropertyDetails,
  type Property,
  type PropertyDetails,
  type RoofProfile,
  type RoofProfileInput,
  type SolarEstimateResult,
  type SolarSystem,
  type SolarSystemInput,
} from "../propertyApi";
import type { RoofGeometry } from "../roofGeometry";
import { createDefaultSunlightSettings } from "../sunlight";

type RoofState = {
  propertyId: string;
  profile: RoofProfile | null;
  geometry: RoofGeometry | null;
  loading: boolean;
  error: string;
};

type SolarState = { propertyId: string; system: SolarSystem | null; loading: boolean; error: string };
type EstimateState = { propertyId: string; result: SolarEstimateResult | null; loading: boolean; error: string };

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
  const [roofState, setRoofState] = useState<RoofState | null>(null);
  const [roofRetry, setRoofRetry] = useState(0);
  const [roofSketchError, setRoofSketchError] = useState("");
  const [sunlight, setSunlight] = useState(createDefaultSunlightSettings);
  const [sunlightError, setSunlightError] = useState("");
  const [solarState, setSolarState] = useState<SolarState | null>(null);
  const [solarRetry, setSolarRetry] = useState(0);
  const [estimateState, setEstimateState] = useState<EstimateState | null>(null);
  const propertyId = property?.id;
  const activePropertyId = useRef(propertyId);
  const estimateGeneration = useRef(0);
  activePropertyId.current = propertyId;
  const currentRoof = roofState?.propertyId === propertyId ? roofState : null;
  const currentSolar = solarState?.propertyId === propertyId ? solarState : null;
  const currentEstimate = estimateState?.propertyId === propertyId ? estimateState : null;
  const roofGeometry = currentRoof?.geometry ?? null;
  const roofLoading = Boolean(propertyId) && (!currentRoof || currentRoof.loading);
  const solarLoading = Boolean(propertyId) && (!currentSolar || currentSolar.loading);
  const roofReady = Boolean(currentRoof?.profile);

  useEffect(() => {
    if (!propertyId) return;
    let active = true;
    setRoofSketchError("");
    setSunlight(createDefaultSunlightSettings());
    setSunlightError("");
    setRoofState({ propertyId, profile: null, geometry: null, loading: true, error: "" });
    void loadRoofProfile(propertyId).then((profile) => {
      if (active) setRoofState({
        propertyId, profile, geometry: profile?.roofGeometryJson ?? null, loading: false, error: "",
      });
    }).catch((cause: unknown) => {
      if (active) setRoofState({
        propertyId, profile: null, geometry: null, loading: false,
        error: cause instanceof Error ? cause.message : "Could not load the Roof Profile.",
      });
    });
    return () => { active = false; };
  }, [propertyId, roofRetry]);

  useEffect(() => {
    if (!propertyId) return;
    let active = true;
    estimateGeneration.current += 1;
    setSolarState({ propertyId, system: null, loading: true, error: "" });
    setEstimateState({ propertyId, result: null, loading: false, error: "" });
    void loadSolarSystem(propertyId).then((system) => {
      if (active) setSolarState({ propertyId, system, loading: false, error: "" });
    }).catch((cause: unknown) => {
      if (active) setSolarState({ propertyId, system: null, loading: false,
        error: cause instanceof Error ? cause.message : "Could not load the Solar System." });
    });
    return () => { active = false; };
  }, [propertyId, solarRetry]);

  async function saveCurrentRoof(input: RoofProfileInput) {
    if (!propertyId) return;
    estimateGeneration.current += 1;
    setEstimateState((previous) => previous?.propertyId === propertyId
      ? { ...previous, result: null, loading: false, error: "" } : previous);
    const profile = await saveRoofProfile(propertyId, input);
    setRoofState((previous) => previous && previous.propertyId === propertyId
      ? { ...previous, profile, geometry: profile.roofGeometryJson } : previous);
    setEstimateState((previous) => previous && previous.propertyId === propertyId
      ? { ...previous, result: null, error: "", loading: false } : previous);
  }

  async function runEstimate(forPropertyId = propertyId) {
    if (!forPropertyId || activePropertyId.current !== forPropertyId) return;
    const generation = ++estimateGeneration.current;
    setEstimateState({ propertyId: forPropertyId, result: null, loading: true, error: "" });
    try {
      const result = await estimateSolarProduction(forPropertyId);
      setEstimateState((previous) => previous?.propertyId === forPropertyId && activePropertyId.current === forPropertyId
        && estimateGeneration.current === generation
        ? { propertyId: forPropertyId, result, loading: false, error: "" } : previous);
    } catch (cause) {
      setEstimateState((previous) => previous?.propertyId === forPropertyId && activePropertyId.current === forPropertyId
        && estimateGeneration.current === generation
        ? { propertyId: forPropertyId, result: null, loading: false,
          error: cause instanceof Error ? cause.message : "Could not estimate production." } : previous);
    }
  }

  async function saveCurrentSolar(input: SolarSystemInput) {
    if (!propertyId) return;
    estimateGeneration.current += 1;
    setEstimateState((previous) => previous?.propertyId === propertyId
      ? { ...previous, result: null, loading: false, error: "" } : previous);
    const system = await saveSolarSystem(propertyId, input);
    if (activePropertyId.current !== propertyId) return;
    setSolarState((previous) => previous?.propertyId === propertyId
      ? { propertyId, system, loading: false, error: "" } : previous);
    setEstimateState({ propertyId, result: null, loading: false, error: "" });
    if (roofReady) await runEstimate(propertyId);
  }

  function updateRoofGeometry(geometry: RoofGeometry | null) {
    setRoofSketchError("");
    setRoofState((previous) => previous && previous.propertyId === propertyId && !previous.loading
      ? { ...previous, geometry } : previous);
  }

  async function locateProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedAddress = address.trim().replace(/\s+/gu, " ");
    if (requestedAddress.length < 5 || requestedAddress.length > 200) {
      setError("Enter a valid property address (5–200 characters).");
      return;
    }
    setLoading(true);
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
        <PropertyVisualization property={property} roofGeometry={roofGeometry}
          canSketch={Boolean(currentRoof && !currentRoof.loading && !currentRoof.error)}
          sunlight={sunlight} sunlightError={sunlightError} onSunlightError={setSunlightError}
          onRoofGeometryChange={updateRoofGeometry} onRoofSketchError={setRoofSketchError}
          roofSketchError={roofSketchError} />
        <aside className="analysis-sections" aria-label="Analysis sections">
          <section className="section-card" aria-labelledby="property-summary-title">
            <h2 id="property-summary-title">Property Summary</h2>
            {property ? (
              <div>
                <p className="property-address">{property.displayAddress}</p>
                <p>Coordinates: {hasValidCoordinates(property)
                  ? `${property.latitude.toFixed(6)}, ${property.longitude.toFixed(6)}`
                  : "Unavailable"}</p>
                <OptionalDetails key={property.id} property={property} onSaved={setProperty} />
              </div>
            ) : <p>No property loaded.</p>}
          </section>
          <RoofProfilePanel key={`roof-${propertyId ?? "none"}`} property={property} profile={currentRoof?.profile ?? null}
            geometry={roofGeometry} loading={roofLoading} error={currentRoof?.error ?? ""}
            onRetry={() => setRoofRetry((count) => count + 1)} onSave={saveCurrentRoof}
            onClearGeometry={() => updateRoofGeometry(null)} />
          <SunlightShadowPanel propertyLoaded={Boolean(property)} hasRoofOutline={Boolean(roofGeometry)}
            settings={sunlight} onChange={setSunlight} />
          <SolarSystemPanel key={`solar-${propertyId ?? "none"}`} propertyLoaded={Boolean(property)}
            system={currentSolar?.system ?? null} loading={solarLoading} error={currentSolar?.error ?? ""}
            roofReady={roofReady} onRetry={() => setSolarRetry((count) => count + 1)} onSave={saveCurrentSolar} />
          <EnergyProductionPanel propertyLoaded={Boolean(property)} roofReady={roofReady}
            systemReady={Boolean(currentSolar?.system)} loading={currentEstimate?.loading ?? false}
            error={currentEstimate?.error ?? ""} result={currentEstimate?.result ?? null}
            onEstimate={() => { void runEstimate(); }} />
          <HistoricalBillsPanel key={`bills-${propertyId ?? "none"}`} propertyId={propertyId ?? null} />
          <EconomicsPanel key={`economics-${propertyId ?? "none"}`} propertyId={propertyId ?? null} />
        </aside>
      </div>
    </section>
  );
}
