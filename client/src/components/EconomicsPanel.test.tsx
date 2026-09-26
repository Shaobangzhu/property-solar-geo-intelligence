import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadHouseholdConsumption, loadTariffStatus, saveHouseholdConsumption } from "../propertyApi";
import { EconomicsPanel } from "./EconomicsPanel";

vi.mock("../propertyApi", () => ({
  loadHouseholdConsumption: vi.fn(),
  saveHouseholdConsumption: vi.fn(),
  loadTariffStatus: vi.fn(),
}));

const record = {
  id: "consumption-1", propertyId: "property-1", annualConsumptionKwh: 6200,
  createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-09-25T00:00:00.000Z",
};
const tariffStatus = {
  configured: false, annualEstimateSupported: false, utility: "SCE", planId: "TOU-D-PRIME",
  verifiedRateInputs: [],
  missing: ["Current filed import and export prices are unavailable."],
  sources: [{ title: "SCE Schedule NBT", url: "https://www.sce.com/nbt", location: "Sheet 5" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadHouseholdConsumption).mockResolvedValue(null);
  vi.mocked(loadTariffStatus).mockResolvedValue(tariffStatus);
  vi.mocked(saveHouseholdConsumption).mockImplementation(async (_propertyId, annualConsumptionKwh) => ({
    ...record, annualConsumptionKwh,
  }));
});

describe("EconomicsPanel", () => {
  it("shows a tariff empty state without fabricating dollars", async () => {
    render(<EconomicsPanel propertyId="property-1" />);
    expect(await screen.findByText("Tariff data not configured")).toBeInTheDocument();
    expect(screen.getByText("Estimate")).toBeInTheDocument();
    expect(screen.getByText(/Dollar bills do not reveal precise kWh consumption/)).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(5);
    expect(screen.getByText("Current filed import and export prices are unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SCE Schedule NBT" })).toHaveAttribute("href", "https://www.sce.com/nbt");
    expect(screen.queryByText(/\$[0-9]/)).not.toBeInTheDocument();
  });

  it("loads and saves the annual kWh assumption independently of bills", async () => {
    vi.mocked(loadHouseholdConsumption).mockResolvedValue(record);
    render(<EconomicsPanel propertyId="property-1" />);
    const input = await screen.findByRole("spinbutton", { name: "Annual household consumption (kWh)" });
    expect(input).toHaveValue(6200);
    fireEvent.change(input, { target: { value: "7100.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save consumption" }));
    await waitFor(() => expect(saveHouseholdConsumption).toHaveBeenCalledWith("property-1", 7100.25));
    expect(await screen.findByText("Annual household consumption saved.")).toBeInTheDocument();
  });

  it("accepts zero but rejects invalid precision and negative consumption", async () => {
    render(<EconomicsPanel propertyId="property-1" />);
    const input = await screen.findByRole("spinbutton", { name: "Annual household consumption (kWh)" });
    fireEvent.change(input, { target: { value: "1.234" } });
    fireEvent.click(screen.getByRole("button", { name: "Save consumption" }));
    expect(screen.getByText(/Enter annual consumption/)).toBeInTheDocument();
    expect(saveHouseholdConsumption).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save consumption" }));
    await waitFor(() => expect(saveHouseholdConsumption).toHaveBeenCalledWith("property-1", 0));
  });

  it("does not show monetary estimates when tariff data exists but time profiles do not", async () => {
    vi.mocked(loadTariffStatus).mockResolvedValue({ ...tariffStatus,
      verifiedRateInputs: [{ component: "import", planId: "TOU-D-PRIME", version: "Cal. PUC 91200-E",
        effectiveFrom: "2026-06-25", effectiveTo: null, verifiedAt: "2026-09-25",
        sourceUrl: "https://www.sce.com/tou-d",
        sourceSha256: "test-hash" }], missing: ["Hourly usage is needed."],
    });
    render(<EconomicsPanel propertyId="property-1" />);
    expect(await screen.findByText("Economics estimate unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Import: Cal. PUC 91200-E/)).toBeInTheDocument();
    expect(screen.getByText(/ESTIMATE · Estimated Annual Electricity Cost/)).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(5);
  });

  it("distinguishes a tariff-status request failure from absent tariff data", async () => {
    vi.mocked(loadTariffStatus).mockRejectedValue(new Error("offline"));
    render(<EconomicsPanel propertyId="property-1" />);
    expect(await screen.findByText("Tariff status unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(5);
  });

  it("restores saved consumption and economics without requesting current property values", () => {
    render(<EconomicsPanel propertyId="property-1" snapshot={{ annualConsumptionKwh: 6200 }}
      tariffSnapshot={{ utility: "SCE", planId: "TOU-D-PRIME", version: "test-version",
        effectiveFrom: "2026-06-25" }}
      economicsSnapshot={{ estimatedAnnualElectricityCostUsd: 1234,
        estimatedAnnualSolarValueUsd: null, estimatedAnnualGridImportKwh: null,
        estimatedAnnualGridExportKwh: null, estimatedAnnualExportCreditUsd: null,
        estimatedAnnualSavingsUsd: 456 }} readOnly />);
    expect(screen.getByRole("spinbutton", { name: "Annual household consumption (kWh)" })).toHaveValue(6200);
    expect(screen.getByText("$1,234.00")).toBeInTheDocument();
    expect(screen.getByText("$456.00")).toBeInTheDocument();
    expect(screen.getByText(/Saved tariff reference: SCE TOU-D-PRIME, test-version/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save consumption" })).not.toBeInTheDocument();
    expect(loadHouseholdConsumption).not.toHaveBeenCalled();
    expect(loadTariffStatus).not.toHaveBeenCalled();
  });

  it("edits consumption in a run draft without changing the property-level record", async () => {
    const onChange = vi.fn();
    render(<EconomicsPanel propertyId="property-1" snapshot={{ annualConsumptionKwh: 6200 }}
      onChange={onChange} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Annual household consumption (kWh)" }),
      { target: { value: "7000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save consumption" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(7000));
    expect(saveHouseholdConsumption).not.toHaveBeenCalled();
    expect(loadHouseholdConsumption).not.toHaveBeenCalled();
  });
});
