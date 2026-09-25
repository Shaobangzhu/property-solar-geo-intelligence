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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadHouseholdConsumption).mockResolvedValue(null);
  vi.mocked(loadTariffStatus).mockResolvedValue({ configured: false });
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
    vi.mocked(loadTariffStatus).mockResolvedValue({ configured: true });
    render(<EconomicsPanel propertyId="property-1" />);
    expect(await screen.findByText("Economics estimate unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/Estimated annual cost/)).not.toBeInTheDocument();
  });
});
