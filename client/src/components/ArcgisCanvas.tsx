import { useEffect, useRef, useState } from "react";
import ShadowCastAnalysis from "@arcgis/core/analysis/ShadowCastAnalysis";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import { webMercatorToGeographic } from "@arcgis/core/geometry/support/webMercatorUtils";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import PointSymbol3D from "@arcgis/core/symbols/PointSymbol3D";
import SunLighting from "@arcgis/core/views/3d/environment/SunLighting";
import "@arcgis/map-components/components/arcgis-map";
import "@arcgis/map-components/components/arcgis-scene";
import "@arcgis/map-components/components/arcgis-zoom";
import "@arcgis/map-components/components/arcgis-compass";
import "@arcgis/map-components/components/arcgis-navigation-toggle";
import "@arcgis/map-components/components/arcgis-sketch";
import type { ArcgisMap } from "@arcgis/map-components/components/arcgis-map";
import type { ArcgisScene } from "@arcgis/map-components/components/arcgis-scene";
import type { ArcgisSketch } from "@arcgis/map-components/components/arcgis-sketch";
import type { Property } from "../propertyApi";
import { serializeRoofRings, type RoofGeometry } from "../roofGeometry";
import { parseSunlightSettings, type SunlightSettings } from "../sunlight";
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

function geometryFromGraphic(graphic: Graphic | null | undefined): RoofGeometry {
  if (!(graphic?.geometry instanceof Polygon)) throw new Error("Draw a single roof polygon.");
  const polygon = graphic.geometry;
  const geographic = polygon.spatialReference.isWebMercator
    ? webMercatorToGeographic(polygon) as Polygon
    : polygon;
  if (geographic.spatialReference.wkid !== 4326) {
    throw new Error("The roof outline could not be converted to geographic coordinates.");
  }
  return serializeRoofRings(geographic.rings);
}

function displayRoofGeometry(layer: GraphicsLayer, geometry: RoofGeometry | null) {
  layer.removeAll();
  if (!geometry) return;
  layer.add(new Graphic({
    geometry: new Polygon({ rings: geometry.coordinates, spatialReference: { wkid: 4326 } }),
    symbol: new SimpleFillSymbol({
      color: [0, 193, 176, 0.28],
      outline: { color: "#00c1b0", width: 3 },
    }),
    popupTemplate: { title: "Planning roof outline", content: "User-drawn visualization aid; no roof area measured." },
  }));
}

function removeShadowAnalysis(scene: ArcgisScene, analysis: ShadowCastAnalysis | null) {
  if (!analysis) return;
  scene.analyses.remove(analysis);
  analysis.destroy();
}

export default function ArcgisCanvas({ mode, property, roofGeometry, canSketch,
  sunlight, onRoofGeometryChange, onRoofSketchError, onSunlightError, onError }: {
  mode: Mode;
  property: Property;
  roofGeometry: RoofGeometry | null;
  canSketch: boolean;
  sunlight: SunlightSettings;
  onRoofGeometryChange?: (geometry: RoofGeometry | null) => void;
  onRoofSketchError?: (message: string) => void;
  onSunlightError?: (message: string) => void;
  onError: () => void;
}) {
  const elementRef = useRef<ViewElement | null>(null);
  const sketchRef = useRef<ArcgisSketch | null>(null);
  const roofLayerRef = useRef<GraphicsLayer | null>(null);
  const sunlightRef = useRef<SunLighting | null>(null);
  const shadowAnalysisRef = useRef<ShadowCastAnalysis | null>(null);
  const markerRef = useRef<Graphic | null>(null);
  const [readyElement, setReadyElement] = useState<ViewElement | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onRoofGeometryChangeRef = useRef(onRoofGeometryChange);
  onRoofGeometryChangeRef.current = onRoofGeometryChange;
  const onRoofSketchErrorRef = useRef(onRoofSketchError);
  onRoofSketchErrorRef.current = onRoofSketchError;
  const onSunlightErrorRef = useRef(onSunlightError);
  onSunlightErrorRef.current = onSunlightError;
  const roofGeometryRef = useRef(roofGeometry);
  roofGeometryRef.current = roofGeometry;
  const { id, displayAddress, latitude, longitude } = property;
  const activeSketchPropertyIdRef = useRef<string | null>(null);
  const lastSketchPropertyIdRef = useRef(id);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let active = true;
    void element.viewOnReady().then(() => {
      if (!active) return;
      if (!element.map) {
        onErrorRef.current();
        return;
      }
      const layer = new GraphicsLayer({
        title: "Planning roof outline",
        listMode: "hide",
        ...(element.localName === "arcgis-scene"
          ? { elevationInfo: { mode: "relative-to-scene" as const, offset: 1 } } : {}),
      });
      element.map.add(layer);
      roofLayerRef.current = layer;
      setReadyElement(element);
    }).catch(() => {
      if (active) onErrorRef.current();
    });
    return () => {
      active = false;
      if (markerRef.current) element.graphics.remove(markerRef.current);
      markerRef.current = null;
      if (element.localName === "arcgis-scene") {
        removeShadowAnalysis(element as ArcgisScene, shadowAnalysisRef.current);
        shadowAnalysisRef.current = null;
        sunlightRef.current = null;
      }
      const layer = roofLayerRef.current;
      if (layer) {
        element.map?.remove(layer);
        layer.destroy();
        roofLayerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const layer = roofLayerRef.current;
    if (!readyElement || !layer) return;
    displayRoofGeometry(layer, roofGeometry);
  }, [readyElement, roofGeometry]);

  useEffect(() => {
    if (readyElement && canSketch && sketchRef.current && roofLayerRef.current) {
      sketchRef.current.layer = roofLayerRef.current;
    }
  }, [readyElement, canSketch]);

  useEffect(() => {
    if (lastSketchPropertyIdRef.current === id) return;
    lastSketchPropertyIdRef.current = id;
    activeSketchPropertyIdRef.current = null;
    const sketch = sketchRef.current;
    if (!sketch) return;
    void sketch.cancel().then(() => {
      // Cancel may restore the old graphic; redraw the selected property's outline.
      if (lastSketchPropertyIdRef.current === id && roofLayerRef.current) {
        displayRoofGeometry(roofLayerRef.current, roofGeometryRef.current);
      }
    }).catch(() => undefined);
  }, [id]);

  useEffect(() => {
    if (!readyElement || mode !== "3d") return;
    const scene = readyElement as ArcgisScene;
    let time: ReturnType<typeof parseSunlightSettings>;
    try {
      time = parseSunlightSettings(sunlight);
    } catch {
      if (sunlightRef.current) sunlightRef.current.directShadowsEnabled = false;
      removeShadowAnalysis(scene, shadowAnalysisRef.current);
      shadowAnalysisRef.current = null;
      onSunlightErrorRef.current?.("");
      return;
    }
    try {
      let lighting = sunlightRef.current;
      if (!lighting) {
        lighting = new SunLighting({
          date: time.instant,
          cameraTrackingEnabled: false,
          directShadowsEnabled: sunlight.shadowsEnabled,
        });
        scene.environment.lighting = lighting;
        sunlightRef.current = lighting;
      } else {
        lighting.date = time.instant;
        lighting.directShadowsEnabled = sunlight.shadowsEnabled;
      }

      if (sunlight.shadowsEnabled && roofGeometry) {
        const geometry = new Polygon({ rings: roofGeometry.coordinates, spatialReference: { wkid: 4326 } });
        let analysis = shadowAnalysisRef.current;
        if (!analysis) {
          analysis = new ShadowCastAnalysis({
            mode: "total-duration",
            visualizeSunlight: false,
            date: time.calendarDate,
            startTimeOfDay: time.startTimeOfDay,
            endTimeOfDay: time.endTimeOfDay,
            utcOffset: time.utcOffsetHours,
            geometry,
            totalDurationOptions: { mode: "continuous", color: [77, 54, 158, 0.55] },
          });
          shadowAnalysisRef.current = analysis;
          scene.analyses.add(analysis);
        } else {
          analysis.set({
            date: time.calendarDate,
            startTimeOfDay: time.startTimeOfDay,
            endTimeOfDay: time.endTimeOfDay,
            utcOffset: time.utcOffsetHours,
            geometry,
          });
        }
      } else {
        removeShadowAnalysis(scene, shadowAnalysisRef.current);
        shadowAnalysisRef.current = null;
      }
      onSunlightErrorRef.current?.("");
    } catch (error) {
      // A failed update must not leave a stale shadow overlay attached to the scene.
      removeShadowAnalysis(scene, shadowAnalysisRef.current);
      shadowAnalysisRef.current = null;
      onSunlightErrorRef.current?.(error instanceof Error ? error.message : "Sunlight visualization is unavailable.");
    }
  }, [readyElement, mode, sunlight, roofGeometry]);

  function acceptSketchGraphic(graphic: Graphic | null | undefined) {
    try {
      onRoofGeometryChangeRef.current?.(geometryFromGraphic(graphic));
      onRoofSketchErrorRef.current?.("");
    } catch (error) {
      onRoofSketchErrorRef.current?.(error instanceof Error ? error.message : "Could not use this roof outline.");
      if (roofLayerRef.current) displayRoofGeometry(roofLayerRef.current, roofGeometryRef.current);
    }
  }

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
          {canSketch && <arcgis-sketch ref={(element) => { sketchRef.current = element; }} slot="top-right"
            availableCreateTools={["polygon"]} creationMode="single" defaultGraphicsLayerDisabled
            onarcgisCreate={(event) => {
              if (event.detail.state === "start") activeSketchPropertyIdRef.current = id;
              if (event.detail.state === "cancel") activeSketchPropertyIdRef.current = null;
              if (event.detail.state === "complete") {
                const startedFor = activeSketchPropertyIdRef.current;
                activeSketchPropertyIdRef.current = null;
                if (startedFor === id) acceptSketchGraphic(event.detail.graphic);
              }
            }}
            onarcgisUpdate={(event) => {
              if (event.detail.state === "start") activeSketchPropertyIdRef.current = id;
              if (event.detail.state === "complete") {
                const startedFor = activeSketchPropertyIdRef.current;
                activeSketchPropertyIdRef.current = null;
                if (!event.detail.aborted && startedFor === id) acceptSketchGraphic(event.detail.graphics[0]);
              }
            }}
            onarcgisDelete={() => onRoofGeometryChangeRef.current?.(null)} />}
        </arcgis-map>
      ) : (
        <arcgis-scene ref={(element) => { elementRef.current = element; }} basemap="topo-3d" ground="world-elevation" onarcgisViewReadyError={() => onErrorRef.current()}>
          <arcgis-zoom slot="top-left" />
          <arcgis-compass slot="top-left" />
          <arcgis-navigation-toggle slot="top-left" />
        </arcgis-scene>
      )}
      <div className="geo-target-label">
        <span>● Target property</span>
        {roofGeometry && <span className="geo-roof-label">▰ Planning roof outline</span>}
      </div>
    </div>
  );
}
