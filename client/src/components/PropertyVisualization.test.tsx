import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Property } from "../propertyApi";
import { PropertyVisualization } from "./PropertyVisualization";

vi.mock("./ArcgisCanvas", () => ({
  default: ({ mode, property, onError }: {
    mode: "map" | "3d";
    property: Property;
    onError: () => void;
  }) => (
    <div data-testid="arcgis-canvas" data-mode={mode} data-property-id={property.id}>
      <span>{property.displayAddress}</span>
      <button type="button" onClick={onError}>Simulate ArcGIS failure</button>
    </div>
  ),
}));

const property: Property = {
  id: "property-1",
  normalizedAddress: "380 new york st, redlands ca",
  displayAddress: "380 New York St, Redlands, CA",
  latitude: 34.0556,
  longitude: -117.1817,
  propertyType: null,
  yearBuilt: null,
  livingAreaSqFt: null,
  lotSizeSqFt: null,
  createdAt: "2026-09-24T00:00:00.000Z",
  updatedAt: "2026-09-24T00:00:00.000Z",
};

beforeEach(() => vi.stubEnv("VITE_ARCGIS_API_KEY", "test-key"));
afterEach(() => vi.unstubAllEnvs());

describe("PropertyVisualization", () => {
  it("shows only Map and 3D controls and starts in Map mode", async () => {
    render(<PropertyVisualization property={property} />);

    const modes = within(screen.getByRole("group", { name: "Visualization mode" }));
    expect(modes.getAllByRole("button")).toHaveLength(2);
    expect(modes.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "true");
    expect(modes.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByTestId("arcgis-canvas")).toHaveAttribute("data-mode", "map");
  });

  it("switches to 3D mode and back", async () => {
    render(<PropertyVisualization property={property} />);
    await screen.findByTestId("arcgis-canvas");

    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    expect(screen.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByTestId("arcgis-canvas")).toHaveAttribute("data-mode", "3d");

    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByTestId("arcgis-canvas")).toHaveAttribute("data-mode", "map");
  });

  it("uses fallback UI when the property has no valid coordinates", () => {
    const { rerender } = render(<PropertyVisualization property={null} />);
    expect(screen.getByText("Locate a property to see it on the map.")).toBeInTheDocument();
    expect(screen.queryByTestId("arcgis-canvas")).not.toBeInTheDocument();

    rerender(<PropertyVisualization property={{ ...property, latitude: 91 }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("no valid coordinates");
    expect(screen.queryByTestId("arcgis-canvas")).not.toBeInTheDocument();
  });

  it("shows a recoverable fallback if ArcGIS reports an error", async () => {
    render(<PropertyVisualization property={property} />);
    await screen.findByTestId("arcgis-canvas");

    fireEvent.click(screen.getByRole("button", { name: "Simulate ArcGIS failure" }));
    expect(screen.getByRole("alert")).toHaveTextContent("could not load or move to this property");
    expect(screen.queryByTestId("arcgis-canvas")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry visualization" }));
    expect(await screen.findByTestId("arcgis-canvas")).toHaveAttribute("data-mode", "map");
  });

  it("tries a new property after a previous property's GIS failure", async () => {
    const { rerender } = render(<PropertyVisualization property={property} />);
    await screen.findByTestId("arcgis-canvas");
    fireEvent.click(screen.getByRole("button", { name: "Simulate ArcGIS failure" }));
    expect(screen.getByRole("alert")).toHaveTextContent("could not load");

    rerender(<PropertyVisualization property={{ ...property, id: "property-2", longitude: -118 }} />);
    expect(await screen.findByTestId("arcgis-canvas")).toHaveAttribute("data-property-id", "property-2");
  });

  it("forwards a new property without remounting the current mode", async () => {
    const { rerender } = render(<PropertyVisualization property={property} />);
    await screen.findByTestId("arcgis-canvas");
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    await waitFor(() => expect(screen.getByTestId("arcgis-canvas")).toHaveAttribute("data-mode", "3d"));
    const canvas = screen.getByTestId("arcgis-canvas");
    const nextProperty = { ...property, id: "property-2", displayAddress: "42 Elm St, Redlands, CA" };

    rerender(<PropertyVisualization property={nextProperty} />);
    await waitFor(() => expect(canvas).toHaveAttribute("data-property-id", "property-2"));
    expect(screen.getByTestId("arcgis-canvas")).toBe(canvas);
    expect(canvas).toHaveTextContent(nextProperty.displayAddress);
    expect(screen.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "true");
  });

  it("can unmount and remount with a fresh Map selection", async () => {
    const first = render(<StrictMode><PropertyVisualization property={property} /></StrictMode>);
    await screen.findByTestId("arcgis-canvas");
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    await waitFor(() => expect(screen.getByTestId("arcgis-canvas")).toHaveAttribute("data-mode", "3d"));
    first.unmount();

    render(<StrictMode><PropertyVisualization property={property} /></StrictMode>);
    expect(await screen.findByTestId("arcgis-canvas")).toHaveAttribute("data-mode", "map");
    expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "true");
  });
});
