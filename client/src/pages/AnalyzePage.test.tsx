import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyzePage } from "./AnalyzePage";
import { geocodeStoredAddress } from "../geocode";
import { lookupProperty, saveGeocodedProperty } from "../propertyApi";

vi.mock("../geocode", () => ({ geocodeStoredAddress: vi.fn() }));
vi.mock("../components/PropertyVisualization", () => ({ PropertyVisualization: () => <div>Visualization</div> }));
vi.mock("../propertyApi", () => ({
  lookupProperty: vi.fn(),
  saveGeocodedProperty: vi.fn(),
  updatePropertyDetails: vi.fn(),
}));

const property = {
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

function submitAddress() {
  fireEvent.change(screen.getByRole("textbox", { name: "Property address" }), {
    target: { value: "380 New York St, Redlands CA" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Load / Locate Property" }));
}

beforeEach(() => vi.clearAllMocks());

describe("Analyze property search", () => {
  it("shows loading then uses a local cache hit without geocoding", async () => {
    let finishLookup!: (value: typeof property) => void;
    vi.mocked(lookupProperty).mockReturnValue(new Promise((resolve) => { finishLookup = resolve; }));
    render(<AnalyzePage />);
    submitAddress();
    expect(screen.getByRole("button", { name: "Locating…" })).toBeDisabled();
    finishLookup(property);
    expect(await screen.findByText(property.displayAddress)).toBeInTheDocument();
    expect(geocodeStoredAddress).not.toHaveBeenCalled();
  });

  it("geocodes and saves after a local miss", async () => {
    vi.mocked(lookupProperty).mockResolvedValue(null);
    vi.mocked(geocodeStoredAddress).mockResolvedValue({
      displayAddress: property.displayAddress,
      latitude: property.latitude,
      longitude: property.longitude,
    });
    vi.mocked(saveGeocodedProperty).mockResolvedValue(property);
    render(<AnalyzePage />);
    submitAddress();
    expect(await screen.findByText(property.displayAddress)).toBeInTheDocument();
    expect(saveGeocodedProperty).toHaveBeenCalledWith({
      requestedAddress: "380 New York St, Redlands CA",
      displayAddress: property.displayAddress,
      latitude: property.latitude,
      longitude: property.longitude,
    });
  });

  it("shows a no-match message without saving", async () => {
    vi.mocked(lookupProperty).mockResolvedValue(null);
    vi.mocked(geocodeStoredAddress).mockRejectedValue(new Error("No precise residential address was found."));
    render(<AnalyzePage />);
    submitAddress();
    expect(await screen.findByRole("alert")).toHaveTextContent("No precise residential address was found.");
    expect(saveGeocodedProperty).not.toHaveBeenCalled();
  });

  it("shows a service error and allows retry", async () => {
    vi.mocked(lookupProperty).mockResolvedValue(null);
    vi.mocked(geocodeStoredAddress).mockRejectedValue(new Error("ArcGIS geocoding is unavailable."));
    render(<AnalyzePage />);
    submitAddress();
    expect(await screen.findByRole("alert")).toHaveTextContent("ArcGIS geocoding is unavailable.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Load / Locate Property" })).toBeEnabled());
  });
});
