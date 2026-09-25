import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyzePage } from "./AnalyzePage";
import { geocodeStoredAddress } from "../geocode";
import { estimateSolarProduction, loadRoofProfile, loadSolarSystem, lookupProperty, saveGeocodedProperty,
  saveSolarSystem, loadMonthlyBills } from "../propertyApi";
import type { SunlightSettings } from "../sunlight";

vi.mock("../geocode", () => ({ geocodeStoredAddress: vi.fn() }));
vi.mock("../components/PropertyVisualization", () => ({
  PropertyVisualization: ({ sunlight }: { sunlight: SunlightSettings }) => (
    <div data-testid="visualization" data-date={sunlight.date} data-time={sunlight.time}
      data-shadows-enabled={sunlight.shadowsEnabled}>Visualization</div>
  ),
}));
vi.mock("../propertyApi", () => ({
  lookupProperty: vi.fn(),
  saveGeocodedProperty: vi.fn(),
  updatePropertyDetails: vi.fn(),
  loadRoofProfile: vi.fn(),
  saveRoofProfile: vi.fn(),
  loadSolarSystem: vi.fn(),
  saveSolarSystem: vi.fn(),
  estimateSolarProduction: vi.fn(),
  loadMonthlyBills: vi.fn(),
  saveMonthlyBills: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadRoofProfile).mockResolvedValue(null);
  vi.mocked(loadSolarSystem).mockResolvedValue(null);
  vi.mocked(loadMonthlyBills).mockImplementation(async (_propertyId, year) => ({ year, monthlyAmounts: null }));
});

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

  it("updates the scene settings and resets them for a different property", async () => {
    const second = { ...property, id: "property-2", displayAddress: "100 Oak St, Redlands, CA" };
    vi.mocked(lookupProperty).mockResolvedValueOnce(property).mockResolvedValueOnce(second);
    render(<AnalyzePage />);
    submitAddress();
    expect(await screen.findByText(property.displayAddress)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-21" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "09:30" } });
    fireEvent.click(screen.getByLabelText("Show shadows"));
    expect(screen.getByTestId("visualization")).toHaveAttribute("data-date", "2026-12-21");
    expect(screen.getByTestId("visualization")).toHaveAttribute("data-time", "09:30");
    expect(screen.getByTestId("visualization")).toHaveAttribute("data-shadows-enabled", "true");

    fireEvent.change(screen.getByRole("textbox", { name: "Property address" }), {
      target: { value: second.displayAddress },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load / Locate Property" }));
    expect(await screen.findByText(second.displayAddress)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("visualization")).toHaveAttribute("data-time", "12:00"));
    expect(screen.getByTestId("visualization")).toHaveAttribute("data-shadows-enabled", "false");
  });

  it("saves a system and shows only backend PVWatts production", async () => {
    vi.mocked(lookupProperty).mockResolvedValue(property);
    vi.mocked(loadRoofProfile).mockResolvedValue({
      id: "roof-1", propertyId: property.id, usableAreaSqFt: 620, tiltDegrees: 25,
      azimuthDegrees: 180, estimatedShadingFactor: 0.2, roofGeometryJson: null,
      createdAt: property.createdAt, updatedAt: property.updatedAt,
    });
    vi.mocked(saveSolarSystem).mockResolvedValue({
      id: "solar-1", propertyId: property.id, preset: "medium", systemCapacityKw: 7,
      systemLossPercent: 14, moduleType: 0, arrayType: 1,
      createdAt: property.createdAt, updatedAt: property.updatedAt,
    });
    vi.mocked(estimateSolarProduction).mockResolvedValue({
      estimate: { annualAcKwh: 8400, monthlyAcKwh: Array(12).fill(700) }, warnings: [],
    });
    render(<AnalyzePage />);
    submitAddress();
    expect(await screen.findByRole("button", { name: "Save & estimate" })).toBeInTheDocument();
    expect(screen.queryByText("8,400 kWh")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save & estimate" }));
    expect(await screen.findByText("8,400 kWh")).toBeInTheDocument();
    expect(saveSolarSystem).toHaveBeenCalledWith(property.id, {
      preset: "medium", systemCapacityKw: 7, systemLossPercent: 14, moduleType: 0, arrayType: 1,
    });
    expect(estimateSolarProduction).toHaveBeenCalledWith(property.id);
  });
});
