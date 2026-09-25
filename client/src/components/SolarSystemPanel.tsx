import { useState, type FormEvent } from "react";
import type { SolarSystem, SolarSystemInput } from "../propertyApi";

const presetCapacity = { small: 4, medium: 7, large: 10 } as const;

function SolarForm({ system, roofReady, onSave }: {
  system: SolarSystem | null;
  roofReady: boolean;
  onSave: (input: SolarSystemInput) => Promise<void>;
}) {
  const [preset, setPreset] = useState<SolarSystemInput["preset"]>(system?.preset ?? "medium");
  const [capacity, setCapacity] = useState(String(system?.systemCapacityKw ?? presetCapacity.medium));
  const [losses, setLosses] = useState(String(system?.systemLossPercent ?? 14));
  const [moduleType, setModuleType] = useState<SolarSystemInput["moduleType"]>(system?.moduleType ?? 0);
  const [arrayType, setArrayType] = useState<SolarSystemInput["arrayType"]>(system?.arrayType ?? 1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function choosePreset(next: SolarSystemInput["preset"]) {
    setPreset(next);
    if (next !== "custom") setCapacity(String(presetCapacity[next]));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const systemCapacityKw = Number(capacity);
    const systemLossPercent = Number(losses);
    if (!capacity.trim() || !Number.isFinite(systemCapacityKw) || systemCapacityKw < 0.05 || systemCapacityKw > 100
      || !losses.trim() || !Number.isFinite(systemLossPercent) || systemLossPercent < -5 || systemLossPercent > 99) {
      setMessage("Enter a capacity from 0.05 to 100 kW and losses from -5% to 99%.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ preset, systemCapacityKw, systemLossPercent, moduleType, arrayType });
      setMessage(roofReady ? "Solar system saved. See Energy Production for the estimate."
        : "Solar system saved. Add a Roof Profile before estimating production.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the solar system.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="solar-form" onSubmit={submit}>
    <label>System size
      <select value={preset} onChange={(event) => choosePreset(event.target.value as SolarSystemInput["preset"])}>
        <option value="small">Small · 4 kW</option>
        <option value="medium">Medium · 7 kW</option>
        <option value="large">Large · 10 kW</option>
        <option value="custom">Custom</option>
      </select>
    </label>
    <label>System capacity (kW)
      <input type="number" min="0.05" max="100" step="any" required value={capacity}
        onChange={(event) => { setCapacity(event.target.value); setPreset("custom"); }} />
    </label>
    <label>System losses (%)
      <input type="number" min="-5" max="99" step="any" required value={losses}
        onChange={(event) => setLosses(event.target.value)} />
    </label>
    <label>Module type
      <select value={moduleType} onChange={(event) => setModuleType(Number(event.target.value) as SolarSystemInput["moduleType"])}>
        <option value={0}>Standard</option><option value={1}>Premium</option><option value={2}>Thin film</option>
      </select>
    </label>
    <label>Mounting / array type
      <select value={arrayType} onChange={(event) => setArrayType(Number(event.target.value) as SolarSystemInput["arrayType"])}>
        <option value={1}>Fixed roof mounted</option><option value={0}>Fixed open rack</option>
      </select>
    </label>
    <p className="muted">Generic planning assumptions. Roof tilt and azimuth come from the saved Roof Profile. The visual shadow view and estimated shading factor are not applied automatically.</p>
    <button type="submit" disabled={saving}>{saving ? "Saving…" : roofReady ? "Save & estimate" : "Save solar system"}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}

export function SolarSystemPanel({ propertyLoaded, system, loading, error, roofReady, onRetry, onSave }: {
  propertyLoaded: boolean;
  system: SolarSystem | null;
  loading: boolean;
  error: string;
  roofReady: boolean;
  onRetry: () => void;
  onSave: (input: SolarSystemInput) => Promise<void>;
}) {
  return <section className="section-card solar-system-panel" aria-labelledby="solar-system-title">
    <h2 id="solar-system-title">Solar System</h2>
    {!propertyLoaded ? <p>Load a property to configure a solar system.</p>
      : loading ? <p role="status">Loading Solar System…</p>
        : error ? <div><p role="alert" className="error-message">{error}</p><button type="button" onClick={onRetry}>Retry loading</button></div>
          : <SolarForm system={system} roofReady={roofReady} onSave={onSave} />}
  </section>;
}
