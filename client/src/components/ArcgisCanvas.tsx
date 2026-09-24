import { useEffect, useRef, useState } from "react";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import PointSymbol3D from "@arcgis/core/symbols/PointSymbol3D";
import "@arcgis/map-components/components/arcgis-map";
import "@arcgis/map-components/components/arcgis-scene";
import "@arcgis/map-components/components/arcgis-zoom";
import "@arcgis/map-components/components/arcgis-compass";
import "@arcgis/map-components/components/arcgis-navigation-toggle";
import type { ArcgisMap } from "@arcgis/map-components/components/arcgis-map";
import type { ArcgisScene } from "@arcgis/map-components/components/arcgis-scene";
import type { Property } from "../propertyApi";
import { createPropertyNavigation } from "./propertyNavigation";

type ViewElement = ArcgisMap | ArcgisScene;
type Mode = "map" | "3d";

function targetSymbol(mode: Mode): Graphic["symbol"] {
  if (mode === "map") {
    return new SimpleMarkerSymbol({
      style: "circle",
      color: "#d9431f",
      size: 16,
      outline: { color: "#ffffff", width: 2.5 },
    });
  }
  return new PointSymbol3D({
    symbolLayers: [{
      type: "icon",
      resource: { primitive: "circle" },
      material: { color: "#d9431f" },
      outline: { color: "#ffffff", size: 2 },
      size: 22,
    }],
    verticalOffset: { screenLength: 28, minWorldLength: 3, maxWorldLength: 100 },
    callout: { type: "line", color: "#ffffff", size: 1.5 },
  });
}

export default function ArcgisCanvas({ mode, property, onError }: {
  mode: Mode;
  property: Property;
  onError: () => void;
}) {
  const elementRef = useRef<ViewElement | null>(null);
  const markerRef = useRef<Graphic | null>(null);
  const [readyElement, setReadyElement] = useState<ViewElement | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const { id, displayAddress, latitude, longitude } = property;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let active = true;
    void element.viewOnReady().then(() => {
      if (active) setReadyElement(element);
    }).catch(() => {
      if (active) onErrorRef.current();
    });
    return () => {
      active = false;
      if (markerRef.current) element.graphics.remove(markerRef.current);
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!readyElement) return;
    const marker = markerRef.current ?? new Graphic({
      symbol: targetSymbol(mode),
      popupTemplate: { title: "Target property", content: "{address}" },
    });
    marker.geometry = new Point({ longitude, latitude });
    marker.attributes = { address: displayAddress };
    if (!markerRef.current) readyElement.graphics.add(marker);
    markerRef.current = marker;

    const navigation = createPropertyNavigation(async (target, signal) => {
      const center: [number, number] = [target.longitude, target.latitude];
      if (mode === "map") {
        await (readyElement as ArcgisMap).goTo({ center, zoom: 18 }, { signal, duration: 1200 });
      } else {
        await (readyElement as ArcgisScene).goTo({ center, zoom: 20, tilt: 65, heading: 25 }, { signal, duration: 1600 });
      }
    }, () => onErrorRef.current());
    navigation.move({ id, displayAddress, latitude, longitude });
    return () => navigation.dispose();
  }, [readyElement, mode, id, latitude, longitude, displayAddress]);

  return (
    <div className="geo-canvas" aria-label={mode === "map" ? "ArcGIS map" : "ArcGIS 3D scene"}>
      {mode === "map" ? (
        <arcgis-map ref={(element) => { elementRef.current = element; }} basemap="arcgis/navigation" onarcgisViewReadyError={() => onErrorRef.current()}>
          <arcgis-zoom slot="top-left" />
          <arcgis-compass slot="top-left" />
        </arcgis-map>
      ) : (
        <arcgis-scene ref={(element) => { elementRef.current = element; }} basemap="topo-3d" ground="world-elevation" onarcgisViewReadyError={() => onErrorRef.current()}>
          <arcgis-zoom slot="top-left" />
          <arcgis-compass slot="top-left" />
          <arcgis-navigation-toggle slot="top-left" />
        </arcgis-scene>
      )}
      <div className="geo-target-label">● Target property</div>
    </div>
  );
}
