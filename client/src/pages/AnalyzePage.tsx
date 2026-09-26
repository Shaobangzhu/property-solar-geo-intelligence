import { useCallback, useEffect, useRef, useState,
  type ChangeEventHandler, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
  estimateSolarPreview,
  getAnalysisRun,
  createAnalysisRun,
  updateAnalysisRun,
  saveGeocodedProperty,
  saveRoofProfile,
  saveSolarSystem,
  updatePropertyDetails,
  type Property,
  type PropertyDetails,
  type AnalysisRun,
  type AnalysisRunInput,
  type AnalysisEconomics,
  type AnalysisTariffReference,
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
type BillsDraft = { year: number; monthlyAmounts: number[] | null };
const defaultBillYear = () => new Date().getFullYear() - 1;

function profileFromRun(run: AnalysisRun): RoofProfile {
  return { ...run.roofProfile, id: `run-${run.id}-roof`, propertyId: run.propertyId,
    createdAt: run.createdAt, updatedAt: run.updatedAt };
}

function systemFromRun(run: AnalysisRun): SolarSystem {
  return { ...run.solarSystem, id: `run-${run.id}-solar`, propertyId: run.propertyId,
    createdAt: run.createdAt, updatedAt: run.updatedAt };
}

function roofInput(profile: RoofProfile, geometry: RoofGeometry | null): RoofProfileInput {
  return { usableAreaSqFt: profile.usableAreaSqFt, tiltDegrees: profile.tiltDegrees,
    azimuthDegrees: profile.azimuthDegrees, estimatedShadingFactor: profile.estimatedShadingFactor,
    roofGeometryJson: geometry };
}

function solarInput(system: SolarSystemInput): SolarSystemInput {
  return { preset: system.preset, systemCapacityKw: system.systemCapacityKw,
    systemLossPercent: system.systemLossPercent, moduleType: system.moduleType, arrayType: system.arrayType };
}

function RunControls({ disabled, children, onChangeCapture }: {
  disabled: boolean; children: ReactNode; onChangeCapture?: ChangeEventHandler<HTMLFieldSetElement>;
}) {
  return <fieldset disabled={disabled} onChangeCapture={onChangeCapture}
    style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>{children}</fieldset>;
}

function OptionalDetails({ property, onSaved, readOnly = false }: {
  property: Property; onSaved: (property: Property) => void; readOnly?: boolean;
}) {
  const [propertyType, setPropertyType] = useState(property.propertyType ?? "");
  const [yearBuilt, setYearBuilt] = useState(property.yearBuilt?.toString() ?? "");
  const [livingArea, setLivingArea] = useState(property.livingAreaSqFt?.toString() ?? "");
  const [lotSize, setLotSize] = useState(property.lotSizeSqFt?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  if (readOnly) {
    return <div className="details-form" aria-label="Saved property details">
      <p className="muted">Property details captured with this analysis.</p>
      {property.propertyType && <p>Property type: {property.propertyType}</p>}
      {property.yearBuilt !== null && <p>Year built: {property.yearBuilt}</p>}
      {property.livingAreaSqFt !== null && <p>Living area: {property.livingAreaSqFt} sq ft</p>}
      {property.lotSizeSqFt !== null && <p>Lot size: {property.lotSizeSqFt} sq ft</p>}
    </div>;
  }

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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId");
  const runMode = searchParams.get("mode") === "edit" ? "edit" : "view";
  const viewingRun = Boolean(runId) && runMode === "view";
  const editingRun = Boolean(runId) && runMode === "edit";
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
  const [savedRun, setSavedRun] = useState<AnalysisRun | null>(null);
  const [loadedRunKey, setLoadedRunKey] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(Boolean(runId));
  const [runError, setRunError] = useState("");
  const [runNotice, setRunNotice] = useState("");
  const [savingRun, setSavingRun] = useState(false);
  const [billsDraft, setBillsDraft] = useState<BillsDraft>({ year: defaultBillYear(), monthlyAmounts: null });
  const [billsLoaded, setBillsLoaded] = useState(false);
  const [billsReady, setBillsReady] = useState(false);
  const [annualConsumptionKwh, setAnnualConsumptionKwh] = useState<number | null>(null);
  const [consumptionLoaded, setConsumptionLoaded] = useState(false);
  const [economicsDraft, setEconomicsDraft] = useState<AnalysisEconomics | null>(null);
  const [tariffDraft, setTariffDraft] = useState<AnalysisTariffReference | null>(null);
  const [pendingPanelEdits, setPendingPanelEdits] = useState({ roof: false, solar: false, consumption: false });
  const onBillsChange = useCallback((year: number, monthlyAmounts: number[] | null) => {
    setBillsDraft({ year, monthlyAmounts });
    setBillsLoaded(true);
    setEconomicsDraft(null);
    setTariffDraft(null);
  }, []);
  const onBillsReadyChange = useCallback((ready: boolean) => setBillsReady(ready), []);
  const onConsumptionChange = useCallback((value: number | null) => {
    setAnnualConsumptionKwh(value);
    setConsumptionLoaded(true);
    setEconomicsDraft(null);
    setTariffDraft(null);
    setPendingPanelEdits((previous) => ({ ...previous, consumption: false }));
  }, []);
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
  const runReady = !runId || Boolean(savedRun?.id === runId
    && loadedRunKey === `${runId}:${runMode}` && !runLoading);
  const canSave = Boolean(propertyId && currentRoof?.profile && currentSolar?.system
    && currentEstimate?.result && billsLoaded && billsReady && consumptionLoaded
    && !pendingPanelEdits.roof && !pendingPanelEdits.solar && !pendingPanelEdits.consumption);

  useEffect(() => {
    if (!runId) {
      setSavedRun(null);
      setLoadedRunKey(null);
      setRunLoading(false);
      setRunError("");
      return;
    }
    let active = true;
    setRunLoading(true);
    setRunError("");
    setSavedRun(null);
    setLoadedRunKey(null);
    setBillsReady(false);
    setPendingPanelEdits({ roof: false, solar: false, consumption: false });
    estimateGeneration.current += 1;
    void getAnalysisRun(runId).then((run) => {
      if (!active) return;
      setSavedRun(run);
      setLoadedRunKey(`${runId}:${runMode}`);
      setProperty(run.property);
      setAddress(run.property.displayAddress);
      setRoofState({ propertyId: run.propertyId, profile: profileFromRun(run),
        geometry: run.roofProfile.roofGeometryJson, loading: false, error: "" });
      setSolarState({ propertyId: run.propertyId, system: systemFromRun(run), loading: false, error: "" });
      setEstimateState({ propertyId: run.propertyId, result: run.production, loading: false, error: "" });
      setBillsDraft({ year: run.bills.year,
        monthlyAmounts: run.bills.monthlyAmounts ? [...run.bills.monthlyAmounts] : null });
      setBillsLoaded(true);
      setBillsReady(false);
      setAnnualConsumptionKwh(run.annualConsumptionKwh);
      setConsumptionLoaded(true);
      setEconomicsDraft(run.economics);
      setTariffDraft(run.tariffReference);
      setSunlight(createDefaultSunlightSettings());
      setRunLoading(false);
    }).catch((cause: unknown) => {
      if (!active) return;
      setProperty(null);
      setRunError(cause instanceof Error ? cause.message : "Could not load this saved analysis.");
      setRunLoading(false);
    });
    return () => { active = false; };
  }, [runId, runMode]);

  useEffect(() => {
    if (runId) return;
    setPendingPanelEdits({ roof: false, solar: false, consumption: false });
    setBillsDraft({ year: defaultBillYear(), monthlyAmounts: null });
    setBillsLoaded(false);
    setBillsReady(false);
    setAnnualConsumptionKwh(null);
    setConsumptionLoaded(false);
    setEconomicsDraft(null);
    setTariffDraft(null);
  }, [propertyId, runId]);

  useEffect(() => {
    if (!propertyId || runId) return;
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
  }, [propertyId, roofRetry, runId]);

  useEffect(() => {
    if (!propertyId || runId) return;
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
  }, [propertyId, solarRetry, runId]);

  async function saveCurrentRoof(input: RoofProfileInput) {
    if (!propertyId) return;
    if (runId && !editingRun) return;
    estimateGeneration.current += 1;
    setEstimateState((previous) => previous?.propertyId === propertyId
      ? { ...previous, result: null, loading: false, error: "" } : previous);
    if (runId) {
      setEconomicsDraft(null);
      setTariffDraft(null);
      setRoofState((previous) => previous?.propertyId === propertyId && previous.profile
        ? { propertyId, profile: { ...previous.profile, ...input },
          geometry: input.roofGeometryJson, loading: false, error: "" } : previous);
      setPendingPanelEdits((previous) => ({ ...previous, roof: false }));
      return;
    }
    const profile = await saveRoofProfile(propertyId, input);
    setRoofState((previous) => previous && previous.propertyId === propertyId
      ? { ...previous, profile, geometry: profile.roofGeometryJson } : previous);
    setEstimateState((previous) => previous && previous.propertyId === propertyId
      ? { ...previous, result: null, error: "", loading: false } : previous);
    setPendingPanelEdits((previous) => ({ ...previous, roof: false }));
  }

  async function runEstimate(forPropertyId = propertyId, solarOverride?: SolarSystemInput) {
    if (!forPropertyId || activePropertyId.current !== forPropertyId || viewingRun) return;
    const generation = ++estimateGeneration.current;
    if (runId) {
      setEconomicsDraft(null);
      setTariffDraft(null);
    }
    setEstimateState({ propertyId: forPropertyId, result: null, loading: true, error: "" });
    try {
      let result: SolarEstimateResult;
      if (runId) {
        const roof = currentRoof?.profile;
        const system = solarOverride ?? currentSolar?.system;
        if (!roof || !system) throw new Error("Complete the roof and solar assumptions before estimating production.");
        result = await estimateSolarPreview(forPropertyId, roofInput(roof, roofGeometry), solarInput(system), runId);
      } else result = await estimateSolarProduction(forPropertyId);
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
    if (runId && !editingRun) return;
    estimateGeneration.current += 1;
    setEstimateState((previous) => previous?.propertyId === propertyId
      ? { ...previous, result: null, loading: false, error: "" } : previous);
    if (runId) {
      setEconomicsDraft(null);
      setTariffDraft(null);
      setSolarState((previous) => previous?.propertyId === propertyId && previous.system
        ? { propertyId, system: { ...previous.system, ...input }, loading: false, error: "" } : previous);
      setPendingPanelEdits((previous) => ({ ...previous, solar: false }));
      if (roofReady) await runEstimate(propertyId, input);
      return;
    }
    const system = await saveSolarSystem(propertyId, input);
    if (activePropertyId.current !== propertyId) return;
    setSolarState((previous) => previous?.propertyId === propertyId
      ? { propertyId, system, loading: false, error: "" } : previous);
    setEstimateState({ propertyId, result: null, loading: false, error: "" });
    setPendingPanelEdits((previous) => ({ ...previous, solar: false }));
    if (roofReady) await runEstimate(propertyId);
  }

  function updateRoofGeometry(geometry: RoofGeometry | null) {
    if (viewingRun) return;
    setRoofSketchError("");
    setRoofState((previous) => previous && previous.propertyId === propertyId && !previous.loading
      ? { ...previous, geometry } : previous);
  }

  async function locateProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (runId) return;
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

  function startNewAnalysis() {
    estimateGeneration.current += 1;
    setProperty(null);
    setAddress("");
    setRoofState(null);
    setSolarState(null);
    setEstimateState(null);
    setRunNotice("");
    setPendingPanelEdits({ roof: false, solar: false, consumption: false });
    setNotice("");
    setError("");
    navigate("/analyze");
  }

  async function saveAnalysis() {
    if (!propertyId || !currentRoof?.profile || !currentSolar?.system || !currentEstimate?.result) {
      setRunError("Complete the Roof Profile, Solar System, and production estimate before saving.");
      return;
    }
    if (!billsLoaded || !billsReady || !consumptionLoaded) {
      setRunError("Wait for the electricity inputs to finish loading before saving.");
      return;
    }
    const input: AnalysisRunInput = {
      propertyId,
      roofProfile: roofInput(currentRoof.profile, roofGeometry),
      solarSystem: solarInput(currentSolar.system),
      production: currentEstimate.result,
      bills: { year: billsDraft.year,
        monthlyAmounts: billsDraft.monthlyAmounts ? [...billsDraft.monthlyAmounts] : null },
      annualConsumptionKwh,
      tariffReference: tariffDraft,
      economics: economicsDraft,
    };
    setSavingRun(true);
    setRunError("");
    setRunNotice("");
    try {
      if (editingRun && runId) {
        const updated = await updateAnalysisRun(runId, input);
        setSavedRun(updated);
        setRunNotice("Changes saved to this analysis.");
      } else {
        const created = await createAnalysisRun(input);
        setRunNotice("Analysis saved to History.");
        navigate(`/analyze?runId=${encodeURIComponent(created.id)}&mode=edit`, { replace: true });
      }
    } catch (cause) {
      setRunError(cause instanceof Error ? cause.message : "Could not save this analysis.");
    } finally {
      setSavingRun(false);
    }
  }

  return (
    <section aria-labelledby="analyze-title" className="page">
      <div className="page-heading">
        <p className="eyebrow">ONE PROPERTY AT A TIME</p>
        <h1 id="analyze-title">{runId ? runMode === "edit" ? "Edit saved analysis" : "View saved analysis"
          : "Analyze property solar potential"}</h1>
        <p>{runId ? "This analysis preserves the assumptions and results from when it was saved."
          : "Start with the street address of the property you want to explore."}</p>
      </div>
      {runId ? <section className="search-panel" aria-label="Saved analysis controls">
        <p>{runMode === "edit" ? "Editing this saved run. Changes are kept here until you choose Save Changes."
          : "Viewing this saved run."}</p>
        <div className="search-row">
          <Link to="/history">Back to History</Link>
          {viewingRun && savedRun && <Link to={`/analyze?runId=${encodeURIComponent(runId)}&mode=edit`}>Edit analysis</Link>}
          {editingRun && savedRun && <Link to={`/analyze?runId=${encodeURIComponent(runId)}&mode=view`}>View saved version</Link>}
          <button type="button" onClick={startNewAnalysis}>Start new analysis</button>
        </div>
      </section> : <section className="search-panel" aria-labelledby="property-search-title">
          <h2 id="property-search-title">Property Search</h2>
          <form onSubmit={locateProperty} className="search-row">
            <input aria-label="Property address" placeholder="Enter a property address" value={address} onChange={(event) => setAddress(event.target.value)} disabled={loading} required maxLength={200} />
            <button type="submit" disabled={loading}>{loading ? "Locating…" : "Load / Locate Property"}</button>
          </form>
          {notice && <p role="status">{notice}</p>}
          {error && <p role="alert" className="error-message">{error}</p>}
        </section>}
      {runId && !runReady && !runError && <p role="status">Loading saved analysis…</p>}
      {runId && runError && !savedRun && <p role="alert" className="error-message">{runError}</p>}
      {runReady && <div className="analysis-layout">
        <PropertyVisualization property={property} roofGeometry={roofGeometry}
          canSketch={!viewingRun && Boolean(currentRoof && !currentRoof.loading && !currentRoof.error)}
          sunlight={sunlight} sunlightError={sunlightError} onSunlightError={setSunlightError}
          onRoofGeometryChange={updateRoofGeometry} onRoofSketchError={setRoofSketchError}
          roofSketchError={roofSketchError} />
        <section className="analysis-sections" aria-label="Analysis sections">
          <section className="section-card" aria-labelledby="property-summary-title">
            <h2 id="property-summary-title">Property Summary</h2>
            {property ? (
              <div>
                <p className="property-address">{property.displayAddress}</p>
                <p>Coordinates: {hasValidCoordinates(property)
                  ? `${property.latitude.toFixed(6)}, ${property.longitude.toFixed(6)}`
                  : "Unavailable"}</p>
                <OptionalDetails key={`${property.id}-${runId ?? "live"}`} property={property}
                  onSaved={(updated) => setProperty((previous) => previous?.id === updated.id ? updated : previous)}
                  readOnly={Boolean(runId)} />
              </div>
            ) : <p>No property loaded.</p>}
          </section>
          <RunControls disabled={viewingRun} onChangeCapture={() => setPendingPanelEdits((previous) => ({ ...previous, roof: true }))}>
            <RoofProfilePanel key={`roof-${propertyId ?? "none"}-${runId ?? "live"}-${runMode}`} property={property}
              profile={currentRoof?.profile ?? null} geometry={roofGeometry} loading={roofLoading}
              error={currentRoof?.error ?? ""} onRetry={() => setRoofRetry((count) => count + 1)}
              onSave={saveCurrentRoof} onClearGeometry={() => updateRoofGeometry(null)} />
          </RunControls>
          <SunlightShadowPanel propertyLoaded={Boolean(property)} hasRoofOutline={Boolean(roofGeometry)}
            settings={sunlight} onChange={setSunlight} />
          <RunControls disabled={viewingRun} onChangeCapture={() => setPendingPanelEdits((previous) => ({ ...previous, solar: true }))}>
            <SolarSystemPanel key={`solar-${propertyId ?? "none"}-${runId ?? "live"}-${runMode}`}
              propertyLoaded={Boolean(property)} system={currentSolar?.system ?? null} loading={solarLoading}
              error={currentSolar?.error ?? ""} roofReady={roofReady}
              onRetry={() => setSolarRetry((count) => count + 1)} onSave={saveCurrentSolar} />
          </RunControls>
          <RunControls disabled={viewingRun}>
            <EnergyProductionPanel propertyLoaded={Boolean(property)} roofReady={roofReady}
              systemReady={Boolean(currentSolar?.system)} loading={currentEstimate?.loading ?? false}
              error={currentEstimate?.error ?? ""} result={currentEstimate?.result ?? null}
              onEstimate={() => { void runEstimate(); }} />
          </RunControls>
          <HistoricalBillsPanel key={`bills-${propertyId ?? "none"}-${runId ?? "live"}-${runMode}`}
            propertyId={propertyId ?? null} snapshot={runId ? billsDraft : undefined}
            onChange={onBillsChange} onReadyChange={onBillsReadyChange} readOnly={viewingRun} />
          <RunControls disabled={viewingRun} onChangeCapture={() => setPendingPanelEdits((previous) => ({ ...previous, consumption: true }))}>
            <EconomicsPanel key={`economics-${propertyId ?? "none"}-${runId ?? "live"}-${runMode}`}
              propertyId={propertyId ?? null} snapshot={runId ? { annualConsumptionKwh } : undefined}
              onChange={onConsumptionChange} readOnly={viewingRun}
              tariffSnapshot={runId ? tariffDraft : undefined}
              economicsSnapshot={runId ? economicsDraft : undefined} />
          </RunControls>
        </section>
      </div>}
      {runReady && property && !viewingRun && <section className="search-panel analysis-save-panel" aria-label="Save analysis controls">
        <button type="button" onClick={() => { void saveAnalysis(); }} disabled={savingRun || !canSave}>
          {savingRun ? "Saving…" : editingRun ? "Save Changes" : "Save Analysis"}
        </button>
        {editingRun && <p className="muted">Apply roof or system edits in their panels, recalculate production, then Save Changes.</p>}
        {(pendingPanelEdits.roof || pendingPanelEdits.solar || pendingPanelEdits.consumption)
          && <p className="muted">Apply pending roof, system, or consumption form edits before saving this analysis.</p>}
        {!canSave && !pendingPanelEdits.roof && !pendingPanelEdits.solar && !pendingPanelEdits.consumption
          && <p className="muted">Complete the roof, solar system, production estimate, and load electricity inputs before saving.</p>}
        {runNotice && <p role="status">{runNotice}</p>}
        {runError && <p role="alert" className="error-message">{runError}</p>}
      </section>}
    </section>
  );
}
