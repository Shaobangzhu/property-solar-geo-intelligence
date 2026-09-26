import { useEffect, useRef, useState, type FormEvent } from "react";
import { loadHouseholdConsumption, loadTariffStatus, saveHouseholdConsumption,
  type AnalysisEconomics, type AnalysisTariffReference, type TariffStatus } from "../propertyApi";

const unavailableMetrics = [
  ["Estimated Annual Electricity Cost", "USD", "estimatedAnnualElectricityCostUsd"],
  ["Estimated Solar Value", "USD", "estimatedAnnualSolarValueUsd"],
  ["Estimated Grid Import", "kWh", "estimatedAnnualGridImportKwh"],
  ["Estimated Grid Export", "kWh", "estimatedAnnualGridExportKwh"],
  ["Estimated Export Credit", "USD", "estimatedAnnualExportCreditUsd"],
] as const;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const kwh = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function EconomicsPanel({ propertyId, snapshot, onChange, readOnly = false,
  tariffSnapshot = null, economicsSnapshot = null }: {
  propertyId: string | null;
  snapshot?: { annualConsumptionKwh: number | null };
  onChange?: (annualConsumptionKwh: number | null) => void;
  readOnly?: boolean;
  tariffSnapshot?: AnalysisTariffReference | null;
  economicsSnapshot?: AnalysisEconomics | null;
}) {
  const snapshotMode = snapshot !== undefined;
  const snapshotAnnualConsumptionKwh = snapshot?.annualConsumptionKwh;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [annualText, setAnnualText] = useState(snapshot?.annualConsumptionKwh?.toString() ?? "");
  const [consumptionLoading, setConsumptionLoading] = useState(Boolean(propertyId) && !snapshotMode);
  const [consumptionError, setConsumptionError] = useState("");
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [tariffStatus, setTariffStatus] = useState<TariffStatus | null>(null);
  const [tariffLoading, setTariffLoading] = useState(!snapshotMode);

  useEffect(() => {
    if (snapshotMode) { setTariffLoading(false); return; }
    let active = true;
    void loadTariffStatus().then((status) => {
      if (active) setTariffStatus(status);
    }).catch(() => {
      if (active) setTariffStatus(null);
    }).finally(() => {
      if (active) setTariffLoading(false);
    });
    return () => { active = false; };
  }, [snapshotMode]);

  useEffect(() => {
    if (!snapshotMode) return;
    setAnnualText(snapshotAnnualConsumptionKwh?.toString() ?? "");
    setConsumptionLoading(false);
    setConsumptionError("");
  }, [snapshotAnnualConsumptionKwh, snapshotMode]);

  useEffect(() => {
    if (!propertyId || snapshotMode) return;
    let active = true;
    setConsumptionLoading(true);
    setConsumptionError("");
    setSaveMessage("");
    void loadHouseholdConsumption(propertyId).then((consumption) => {
      if (active) {
        setAnnualText(consumption ? String(consumption.annualConsumptionKwh) : "");
        setConsumptionLoading(false);
        onChangeRef.current?.(consumption?.annualConsumptionKwh ?? null);
      }
    }).catch((cause: unknown) => {
      if (active) {
        setConsumptionError(cause instanceof Error ? cause.message : "Could not load consumption.");
        setConsumptionLoading(false);
      }
    });
    return () => { active = false; };
  }, [propertyId, retry, snapshotMode]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyId) return;
    setSaveMessage("");
    const annualConsumptionKwh = Number(annualText);
    if (!annualText.trim() || !Number.isFinite(annualConsumptionKwh)
      || annualConsumptionKwh < 0 || annualConsumptionKwh > 10_000_000
      || Math.abs(annualConsumptionKwh * 100 - Math.round(annualConsumptionKwh * 100)) >= 1e-6) {
      setSaveMessage("Enter annual consumption from 0 to 10,000,000 kWh with up to two decimal places.");
      return;
    }
    setSaving(true);
    try {
      const saved = snapshotMode ? annualConsumptionKwh
        : (await saveHouseholdConsumption(propertyId, annualConsumptionKwh)).annualConsumptionKwh;
      setAnnualText(String(saved));
      onChangeRef.current?.(saved);
      setSaveMessage(snapshotMode ? "Consumption updated in this analysis draft."
        : "Annual household consumption saved.");
    } catch (cause) {
      setSaveMessage(cause instanceof Error ? cause.message : "Could not save consumption.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="section-card economics-panel" aria-labelledby="economics-title">
    <div className="economics-heading"><h2 id="economics-title">Economics</h2><span>Estimate</span></div>
    <p className="muted">Household consumption, solar generation, grid imports, and exports are separate inputs to a future tariff calculation.</p>
    {!propertyId ? <p>Load a property to enter household consumption.</p>
      : consumptionLoading ? <p role="status">Loading household consumption…</p>
        : consumptionError ? <div><p role="alert" className="error-message">{consumptionError}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry loading</button></div>
          : <form className="consumption-form" onSubmit={save} noValidate>
            <label>Annual household consumption (kWh)
              <input type="number" min="0" max="10000000" step="0.01" value={annualText}
                disabled={readOnly} onChange={(event) => setAnnualText(event.target.value)} />
            </label>
            <p className="muted">Enter your kWh usage directly. Dollar bills do not reveal precise kWh consumption. Monthly usage can be added later.</p>
            {!readOnly && <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save consumption"}</button>}
            {saveMessage && <p role="status">{saveMessage}</p>}
          </form>}
    {!tariffLoading && <div className="tariff-empty-state" role="status">
      <strong>{snapshotMode ? economicsSnapshot ? "Saved economics estimate" : "Economics estimate unavailable"
        : !tariffStatus ? "Tariff status unavailable"
        : tariffStatus.configured || tariffStatus.verifiedRateInputs.length
          ? "Economics estimate unavailable" : "Tariff data not configured"}</strong>
      <p>{snapshotMode
        ? "These values reflect what was saved with this analysis. Unavailable values were not calculated at save time."
        : "Annual kWh and monthly production cannot determine self-consumption or hourly credits. A full estimate also needs the customer's billing details and applicable charge and settlement rules."}</p>
      {snapshotMode && tariffSnapshot && <p>Saved tariff reference: {tariffSnapshot.utility} {tariffSnapshot.planId}, {tariffSnapshot.version}.</p>}
      {!snapshotMode && tariffStatus && tariffStatus.verifiedRateInputs.length > 0 && <div>
        <h3>Verified rate inputs</h3>
        <ul>{tariffStatus.verifiedRateInputs.map((rate) => <li key={rate.component}>
          {rate.component === "import" ? "Import" : "Export"}: {rate.version}
          {` (from ${rate.effectiveFrom}${rate.effectiveTo ? ` until ${rate.effectiveTo} (exclusive)` : ""}; reviewed ${rate.verifiedAt})`}
        </li>)}</ul>
      </div>}
      <div className="economics-metrics" aria-label="Unavailable estimates">
        {unavailableMetrics.map(([label, unit, field]) => {
          const value = snapshotMode ? economicsSnapshot?.[field] ?? null : null;
          return <div className="economics-metric" key={label}>
            <span>ESTIMATE · {label}</span><strong>{value === null ? "Unavailable"
              : unit === "USD" ? usd.format(value) : kwh.format(value)}</strong><small>{unit}</small>
          </div>;
        })}
        {snapshotMode && economicsSnapshot?.estimatedAnnualSavingsUsd !== null
          && economicsSnapshot?.estimatedAnnualSavingsUsd !== undefined && <div className="economics-metric">
            <span>ESTIMATE · Estimated Annual Savings</span>
            <strong>{usd.format(economicsSnapshot.estimatedAnnualSavingsUsd)}</strong><small>USD</small>
          </div>}
      </div>
      {!snapshotMode && tariffStatus && <>
        <h3>What is needed</h3>
        <ul>{tariffStatus.missing.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        <p className="muted">Verified rules: {tariffStatus.sources.map((source, index) => <span key={source.title}>
          {index > 0 && ", "}<a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
        </span>)}.</p>
      </>}
    </div>}
  </section>;
}
