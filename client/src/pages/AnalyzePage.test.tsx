import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyzePage } from "./AnalyzePage";
import { geocodeStoredAddress } from "../geocode";
import { createAnalysisRun, estimateSolarPreview, estimateSolarProduction, getAnalysisRun, loadRoofProfile,
  loadSolarSystem, lookupProperty, saveGeocodedProperty, saveRoofProfile, saveSolarSystem,
  loadMonthlyBills, saveMonthlyBills, loadHouseholdConsumption, saveHouseholdConsumption,
  loadTariffStatus, updateAnalysisRun,
  type AnalysisRun } from "../propertyApi";
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
  loadHouseholdConsumption: vi.fn(),
  saveHouseholdConsumption: vi.fn(),
  loadTariffStatus: vi.fn(),
  getAnalysisRun: vi.fn(),
  createAnalysisRun: vi.fn(),
  updateAnalysisRun: vi.fn(),
  estimateSolarPreview: vi.fn(),
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

const savedRun: AnalysisRun = {
  id: "run-1", propertyId: property.id, property,
  roofProfile: { usableAreaSqFt: 620, tiltDegrees: 25, azimuthDegrees: 180,
    estimatedShadingFactor: 0.2, roofGeometryJson: null },
  solarSystem: { preset: "medium", systemCapacityKw: 7, systemLossPercent: 14,
    moduleType: 0, arrayType: 1 },
  production: { estimate: { annualAcKwh: 8400, monthlyAcKwh: Array(12).fill(700) }, warnings: [] },
  bills: { year: 2025, monthlyAmounts: Array(12).fill(100) },
  annualConsumptionKwh: 10000,
  tariffReference: null,
  economics: null,
  createdAt: property.createdAt, updatedAt: property.updatedAt,
};

function renderAnalyze(entry = "/analyze") {
  return render(<MemoryRouter initialEntries={[entry]}><Routes>
    <Route path="/analyze" element={<AnalyzePage />} />
    <Route path="/history" element={<p>History route</p>} />
  </Routes></MemoryRouter>);
}

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
  vi.mocked(loadHouseholdConsumption).mockResolvedValue(null);
  vi.mocked(loadTariffStatus).mockResolvedValue({
    configured: false, annualEstimateSupported: false, utility: "SCE", planId: "TOU-D-PRIME",
    verifiedRateInputs: [], missing: [], sources: [],
  });
  vi.mocked(getAnalysisRun).mockResolvedValue(savedRun);
  vi.mocked(createAnalysisRun).mockResolvedValue(savedRun);
  vi.mocked(updateAnalysisRun).mockResolvedValue(savedRun);
  vi.mocked(estimateSolarPreview).mockResolvedValue(savedRun.production);
});

describe("Analyze property search", () => {
  it("shows loading then uses a local cache hit without geocoding", async () => {
    let finishLookup!: (value: typeof property) => void;
    vi.mocked(lookupProperty).mockReturnValue(new Promise((resolve) => { finishLookup = resolve; }));
    renderAnalyze();
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
    renderAnalyze();
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
    renderAnalyze();
    submitAddress();
    expect(await screen.findByRole("alert")).toHaveTextContent("No precise residential address was found.");
    expect(saveGeocodedProperty).not.toHaveBeenCalled();
  });

  it("shows a service error and allows retry", async () => {
    vi.mocked(lookupProperty).mockResolvedValue(null);
    vi.mocked(geocodeStoredAddress).mockRejectedValue(new Error("ArcGIS geocoding is unavailable."));
    renderAnalyze();
    submitAddress();
    expect(await screen.findByRole("alert")).toHaveTextContent("ArcGIS geocoding is unavailable.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Load / Locate Property" })).toBeEnabled());
  });

  it("updates the scene settings and resets them for a different property", async () => {
    const second = { ...property, id: "property-2", displayAddress: "100 Oak St, Redlands, CA" };
    vi.mocked(lookupProperty).mockResolvedValueOnce(property).mockResolvedValueOnce(second);
    renderAnalyze();
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
    renderAnalyze();
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

describe("saved analysis on Analyze", () => {
  it("creates a new run from the current property, assumptions, and production", async () => {
    vi.mocked(lookupProperty).mockResolvedValue(property);
    vi.mocked(loadRoofProfile).mockResolvedValue({
      ...savedRun.roofProfile, id: "roof-1", propertyId: property.id,
      createdAt: property.createdAt, updatedAt: property.updatedAt,
    });
    vi.mocked(loadSolarSystem).mockResolvedValue({
      ...savedRun.solarSystem, id: "solar-1", propertyId: property.id,
      createdAt: property.createdAt, updatedAt: property.updatedAt,
    });
    vi.mocked(estimateSolarProduction).mockResolvedValue(savedRun.production);
    renderAnalyze();
    submitAddress();
    fireEvent.click(await screen.findByRole("button", { name: "Estimate production" }));
    expect(await screen.findByText("8,400 kWh")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save Analysis" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(createAnalysisRun).toHaveBeenCalledWith(expect.objectContaining({
      propertyId: property.id,
      roofProfile: savedRun.roofProfile,
      solarSystem: savedRun.solarSystem,
      production: savedRun.production,
      bills: { year: new Date().getFullYear() - 1, monthlyAmounts: null },
      annualConsumptionKwh: null,
      economics: null,
    })));
    expect(updateAnalysisRun).not.toHaveBeenCalled();
  });

  it("opens a frozen run in view mode without loading mutable roof or system defaults", async () => {
    renderAnalyze("/analyze?runId=run-1&mode=view");
    expect(await screen.findByText(property.displayAddress)).toBeInTheDocument();
    expect(screen.getByTestId("visualization")).toBeInTheDocument();
    expect(screen.getByLabelText("Roof Tilt (degrees)")).toHaveValue(25);
    expect(screen.getByLabelText("System capacity (kW)")).toHaveValue(7);
    expect(screen.getByText("8,400 kWh")).toBeInTheDocument();
    expect(screen.getByLabelText("Annual household consumption (kWh)")).toHaveValue(10000);
    expect(screen.getByLabelText("Bill year")).toHaveValue(2025);
    expect(screen.getByRole("button", { name: "Save Roof Profile" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save Analysis" })).not.toBeInTheDocument();
    expect(loadRoofProfile).not.toHaveBeenCalled();
    expect(loadSolarSystem).not.toHaveBeenCalled();
    expect(loadMonthlyBills).not.toHaveBeenCalled();
    expect(loadHouseholdConsumption).not.toHaveBeenCalled();
  });

  it("restores the chosen bill year even when no monthly bills were entered", async () => {
    vi.mocked(getAnalysisRun).mockResolvedValue({
      ...savedRun, bills: { year: 2024, monthlyAmounts: null },
    });
    renderAnalyze("/analyze?runId=run-1&mode=view");
    expect(await screen.findByLabelText("Bill year")).toHaveValue(2024);
    expect(screen.getByText("No monthly bills saved for 2024.")).toBeInTheDocument();
    expect(loadMonthlyBills).not.toHaveBeenCalled();
  });

  it("blocks Save Changes while the selected bill year is invalid", async () => {
    renderAnalyze("/analyze?runId=run-1&mode=edit");
    const save = await screen.findByRole("button", { name: "Save Changes" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Bill year"), { target: { value: "1899" } });
    expect(screen.getByText("Choose a valid historical bill year.")).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(updateAnalysisRun).not.toHaveBeenCalled();
  });

  it("edits only the selected run and recalculates a changed roof using the preview endpoint", async () => {
    renderAnalyze("/analyze?runId=run-1&mode=edit");
    expect(await screen.findByText(property.displayAddress)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Roof Tilt (degrees)"), { target: { value: "30" } });
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save Roof Profile" }));
    expect(await screen.findByText("Roof assumptions saved.")).toBeInTheDocument();
    expect(screen.queryByText("8,400 kWh")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
    expect(saveRoofProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Estimate production" }));
    await waitFor(() => expect(estimateSolarPreview).toHaveBeenCalledWith(property.id,
      expect.objectContaining({ tiltDegrees: 30 }), expect.objectContaining({ systemCapacityKw: 7 }), "run-1"));
    expect(await screen.findByText("8,400 kWh")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(updateAnalysisRun).toHaveBeenCalledWith("run-1", expect.objectContaining({
      propertyId: property.id, roofProfile: expect.objectContaining({ tiltDegrees: 30 }),
    })));
    expect(createAnalysisRun).not.toHaveBeenCalled();
    expect(saveSolarSystem).not.toHaveBeenCalled();
  });

  it("shows a deleted or missing saved run without a stale property", async () => {
    vi.mocked(getAnalysisRun).mockRejectedValue(new Error("Analysis not found."));
    renderAnalyze("/analyze?runId=deleted-run&mode=view");
    expect(await screen.findByRole("alert")).toHaveTextContent("Analysis not found.");
    expect(screen.queryByText(property.displayAddress)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start new analysis" }));
    expect(await screen.findByRole("heading", { name: "Property Search" })).toBeInTheDocument();
  });

  it("restores saved economics and clears them when electricity assumptions change", async () => {
    const withEconomics: AnalysisRun = {
      ...savedRun,
      tariffReference: { utility: "SCE", planId: "TOU-D-PRIME", version: "test-version",
        effectiveFrom: "2026-06-25" },
      economics: {
        estimatedAnnualElectricityCostUsd: 1200,
        estimatedAnnualSolarValueUsd: 400,
        estimatedAnnualGridImportKwh: 5000,
        estimatedAnnualGridExportKwh: 3000,
        estimatedAnnualExportCreditUsd: 100,
        estimatedAnnualSavingsUsd: 400,
      },
    };
    vi.mocked(getAnalysisRun).mockResolvedValue(withEconomics);
    renderAnalyze("/analyze?runId=run-1&mode=edit");
    expect(await screen.findByText("Saved economics estimate")).toBeInTheDocument();
    expect(screen.getByText("$1,200.00")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Annual household consumption (kWh)"),
      { target: { value: "11000" } });
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save consumption" }));
    expect(await screen.findByText("Consumption updated in this analysis draft.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
    expect(screen.queryByText("$1,200.00")).not.toBeInTheDocument();
    expect(saveHouseholdConsumption).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(updateAnalysisRun).toHaveBeenCalledWith("run-1", expect.objectContaining({
      annualConsumptionKwh: 11000, economics: null, tariffReference: null,
    })));
  });

  it("changes saved bills locally without writing the property's live bill records", async () => {
    renderAnalyze("/analyze?runId=run-1&mode=edit");
    expect(await screen.findByText(property.displayAddress)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enter Monthly Bills" }));
    fireEvent.change(screen.getByRole("textbox", { name: "January bill (USD)" }),
      { target: { value: "125.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saveMonthlyBills).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(updateAnalysisRun).toHaveBeenCalledWith("run-1", expect.objectContaining({
      bills: { year: 2025, monthlyAmounts: [125.5, ...Array(11).fill(100)] },
    })));
  });

  it("discards unsaved run edits when returning to the saved view", async () => {
    renderAnalyze("/analyze?runId=run-1&mode=edit");
    expect(await screen.findByText(property.displayAddress)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Roof Tilt (degrees)"), { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Roof Profile" }));
    expect(await screen.findByText("Roof assumptions saved.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "View saved version" }));
    await waitFor(() => expect(screen.getByLabelText("Roof Tilt (degrees)")).toHaveValue(25));
    expect(screen.getByText("8,400 kWh")).toBeInTheDocument();
    expect(updateAnalysisRun).not.toHaveBeenCalled();
  });
});
