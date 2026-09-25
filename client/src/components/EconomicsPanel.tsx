import { useEffect, useState, type FormEvent } from "react";
import { loadHouseholdConsumption, loadTariffStatus, saveHouseholdConsumption,
  type TariffStatus } from "../propertyApi";

const unavailableMetrics = [
  ["Estimated Annual Electricity Cost", "USD"],
  ["Estimated Solar Value", "USD"],
  ["Estimated Grid Import", "kWh"],
  ["Estimated Grid Export", "kWh"],
  ["Estimated Export Credit", "USD"],
] as const;

export function EconomicsPanel({ propertyId }: { propertyId: string | null }) {
  const [annualText, setAnnualText] = useState("");
  const [consumptionLoading, setConsumptionLoading] = useState(Boolean(propertyId));
  const [consumptionError, setConsumptionError] = useState("");
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [tariffStatus, setTariffStatus] = useState<TariffStatus | null>(null);
  const [tariffLoading, setTariffLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void loadTariffStatus().then((status) => {
      if (active) setTariffStatus(status);
    }).catch(() => {
      if (active) setTariffStatus(null);
    }).finally(() => {
      if (active) setTariffLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    let active = true;
    setConsumptionLoading(true);
    setConsumptionError("");
    setSaveMessage("");
    void loadHouseholdConsumption(propertyId).then((consumption) => {
      if (active) {
        setAnnualText(consumption ? String(consumption.annualConsumptionKwh) : "");
        setConsumptionLoading(false);
      }
    }).catch((cause: unknown) => {
      if (active) {
        setConsumptionError(cause instanceof Error ? cause.message : "Could not load consumption.");
        setConsumptionLoading(false);
      }
    });
    return () => { active = false; };
  }, [propertyId, retry]);

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
      const result = await saveHouseholdConsumption(propertyId, annualConsumptionKwh);
      setAnnualText(String(result.annualConsumptionKwh));
      setSaveMessage("Annual household consumption saved.");
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
                onChange={(event) => setAnnualText(event.target.value)} />
            </label>
            <p className="muted">Enter your kWh usage directly. Dollar bills do not reveal precise kWh consumption. Monthly usage can be added later.</p>
            <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save consumption"}</button>
            {saveMessage && <p role="status">{saveMessage}</p>}
          </form>}
    {!tariffLoading && <div className="tariff-empty-state" role="status">
      <strong>{!tariffStatus ? "Tariff status unavailable"
        : tariffStatus.configured || tariffStatus.verifiedRateInputs.length
          ? "Economics estimate unavailable" : "Tariff data not configured"}</strong>
      <p>Annual kWh and monthly production cannot determine self-consumption or hourly credits. A full estimate also needs the customer's billing details and applicable charge and settlement rules.</p>
      {tariffStatus && tariffStatus.verifiedRateInputs.length > 0 && <div>
        <h3>Verified rate inputs</h3>
        <ul>{tariffStatus.verifiedRateInputs.map((rate) => <li key={rate.component}>
          {rate.component === "import" ? "Import" : "Export"}: {rate.version}
          {` (from ${rate.effectiveFrom}${rate.effectiveTo ? ` until ${rate.effectiveTo} (exclusive)` : ""}; reviewed ${rate.verifiedAt})`}
        </li>)}</ul>
      </div>}
      <div className="economics-metrics" aria-label="Unavailable estimates">
        {unavailableMetrics.map(([label, unit]) => <div className="economics-metric" key={label}>
          <span>ESTIMATE · {label}</span><strong>Unavailable</strong><small>{unit}</small>
        </div>)}
      </div>
      {tariffStatus && <>
        <h3>What is needed</h3>
        <ul>{tariffStatus.missing.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        <p className="muted">Verified rules: {tariffStatus.sources.map((source, index) => <span key={source.title}>
          {index > 0 && ", "}<a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
        </span>)}.</p>
      </>}
    </div>}
  </section>;
}
