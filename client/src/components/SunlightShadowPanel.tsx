import type { SunlightSettings } from "../sunlight";
import { parseSunlightSettings } from "../sunlight";

type SunlightShadowPanelProps = {
  propertyLoaded: boolean;
  hasRoofOutline: boolean;
  settings: SunlightSettings;
  onChange: (next: SunlightSettings) => void;
};

export function SunlightShadowPanel({ propertyLoaded, hasRoofOutline, settings, onChange }: SunlightShadowPanelProps) {
  let inputError = "";
  if (propertyLoaded) {
    try {
      parseSunlightSettings(settings);
    } catch (error) {
      inputError = error instanceof Error ? error.message : "Enter a valid date, time, and UTC offset.";
    }
  }

  return (
    <section className="section-card sunlight-shadow-panel" aria-labelledby="sunlight-shadow-title">
      <h2 id="sunlight-shadow-title">Sunlight &amp; Shadow</h2>
      <p className="muted">Explore scene lighting for a selected date and time in 3D. This is a visual aid, not an energy estimate.</p>
      {!propertyLoaded && <p>Load a property to explore sunlight and shadows.</p>}
      <div className="sunlight-controls">
        <label>Date
          <input type="date" value={settings.date} disabled={!propertyLoaded}
            onChange={(event) => onChange({ ...settings, date: event.target.value })} />
        </label>
        <label>Time
          <input type="time" value={settings.time} disabled={!propertyLoaded}
            onChange={(event) => onChange({ ...settings, time: event.target.value })} />
        </label>
        <label>UTC offset (hours)
          <input type="number" min="-12" max="14" step="0.25"
            value={Number.isFinite(settings.utcOffsetHours) ? settings.utcOffsetHours : ""}
            disabled={!propertyLoaded}
            onChange={(event) => onChange({ ...settings, utcOffsetHours: event.target.valueAsNumber })} />
        </label>
        <label className="sunlight-shadow-toggle">
          <input type="checkbox" checked={settings.shadowsEnabled} disabled={!propertyLoaded}
            onChange={(event) => onChange({ ...settings, shadowsEnabled: event.target.checked })} />
          Show shadows
        </label>
      </div>
      {inputError && <p role="alert" className="error-message">{inputError}</p>}
      <p className="muted">Set the UTC offset for the property’s local time, including daylight saving time when applicable.</p>
      <p className="muted">Date and Time move the simulated sun in 3D. Turn on shadows to show shadows cast by available 3D objects.</p>
      {propertyLoaded && !hasRoofOutline && <p className="muted">Draw a roof outline in Map mode to see a focused 30-minute shadow overlay in 3D.</p>}
      {propertyLoaded && hasRoofOutline && <p className="muted">With shadows on, the purple overlay shows accumulated shadow during up to 30 minutes after the selected time, clipped to the sketched outline.</p>}
      <p className="muted">The 2D roof outline is a visualization surface, not a building model. It and terrain are not treated as roof shadow casters.</p>
      <p className="muted">The estimated shading factor remains a separate manual Roof Profile assumption. This view does not send shading losses to PVWatts.</p>
    </section>
  );
}
