import type { SolarEstimateResult } from "../propertyApi";

const months = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function EnergyProductionPanel({ propertyLoaded, roofReady, systemReady, loading, error, result, onEstimate }: {
  propertyLoaded: boolean;
  roofReady: boolean;
  systemReady: boolean;
  loading: boolean;
  error: string;
  result: SolarEstimateResult | null;
  onEstimate: () => void;
}) {
  const valid = result?.estimate.monthlyAcKwh.length === 12 && result.estimate.monthlyAcKwh.every(Number.isFinite);
  const max = valid ? Math.max(...result.estimate.monthlyAcKwh, 1) : 1;
  return <section className="section-card energy-production-panel" aria-labelledby="energy-production-title">
    <h2 id="energy-production-title">Energy Production</h2>
    <p className="muted">PVWatts V8 monthly AC production estimate. Planning values, not a measured or guaranteed yield.</p>
    {!propertyLoaded ? <p>Load a property to estimate production.</p>
      : !roofReady ? <p>Save a Roof Profile to supply tilt and azimuth.</p>
        : !systemReady ? <p>Save a Solar System to set capacity and equipment assumptions.</p>
          : <>
            <button type="button" onClick={onEstimate} disabled={loading}>{loading ? "Estimating…" : "Estimate production"}</button>
            {loading && <p role="status">Calculating monthly production with PVWatts…</p>}
            {error && <p role="alert" className="error-message">{error}</p>}
            {!loading && valid && result && <>
              <div className="annual-production"><span>Annual Production</span><strong>{integer.format(result.estimate.annualAcKwh)} kWh</strong></div>
              <h3>Estimated Monthly Production (kWh)</h3>
              <div className="monthly-production" role="img" aria-label="Estimated monthly production in kilowatt-hours">
                {result.estimate.monthlyAcKwh.map((value, index) => <div className="monthly-row" key={months[index]}>
                  <span>{months[index]}</span>
                  <div className="monthly-track"><span style={{ width: `${value / max * 100}%` }} /></div>
                  <strong>{integer.format(value)}</strong>
                </div>)}
              </div>
              {result.warnings.length > 0 && <div className="estimate-warnings"><h3>PVWatts warnings</h3><ul>
                {result.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
              </ul></div>}
            </>}
          </>}
  </section>;
}
