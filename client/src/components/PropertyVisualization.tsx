import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import type { Property } from "../propertyApi";
import { hasValidCoordinates } from "./propertyLocation";

const ArcgisCanvas = lazy(() => import("./ArcgisCanvas"));
type Mode = "map" | "3d";

class ArcgisErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function PropertyVisualization({ property }: { property: Property | null }) {
  const [mode, setMode] = useState<Mode>("map");
  const [failedTarget, setFailedTarget] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const hasKey = Boolean(import.meta.env.VITE_ARCGIS_API_KEY?.trim());
  const targetKey = `${mode}:${property?.id}:${property?.latitude}:${property?.longitude}`;

  function chooseMode(nextMode: Mode) {
    setMode(nextMode);
  }

  return (
    <section className="geo-panel" aria-label="Property map and 3D scene">
      <div className="geo-toolbar">
        <div>
          <h2>Property location</h2>
          <p>Target property marker · ArcGIS</p>
        </div>
        <div className="mode-switch" role="group" aria-label="Visualization mode">
          <button type="button" aria-pressed={mode === "map"} onClick={() => chooseMode("map")}>Map</button>
          <button type="button" aria-pressed={mode === "3d"} onClick={() => chooseMode("3d")}>3D</button>
        </div>
      </div>
      {!property ? (
        <div className="geo-fallback">Locate a property to see it on the map.</div>
      ) : !hasValidCoordinates(property) ? (
        <div className="geo-fallback" role="alert">This property has no valid coordinates to display.</div>
      ) : !hasKey ? (
        <div className="geo-fallback" role="alert">ArcGIS visualization needs the client API key.</div>
      ) : failedTarget === targetKey ? (
        <div className="geo-fallback" role="alert">
          <p>The ArcGIS {mode === "map" ? "map" : "3D scene"} could not load or move to this property.</p>
          <button type="button" onClick={() => { setFailedTarget(null); setRetry((value) => value + 1); }}>Retry visualization</button>
        </div>
      ) : (
        <ArcgisErrorBoundary key={`${mode}-${retry}`} onError={() => setFailedTarget(targetKey)}>
          <Suspense fallback={<div className="geo-fallback" role="status">Loading ArcGIS {mode === "map" ? "map" : "3D scene"}…</div>}>
            <ArcgisCanvas mode={mode} property={property} onError={() => setFailedTarget(targetKey)} />
          </Suspense>
        </ArcgisErrorBoundary>
      )}
    </section>
  );
}
