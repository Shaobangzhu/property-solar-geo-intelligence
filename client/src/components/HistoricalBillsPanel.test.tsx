import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMonthlyBills, saveMonthlyBills } from "../propertyApi";
import { HistoricalBillsPanel } from "./HistoricalBillsPanel";

vi.mock("../propertyApi", () => ({ loadMonthlyBills: vi.fn(), saveMonthlyBills: vi.fn() }));
const year = new Date().getFullYear() - 1;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadMonthlyBills).mockResolvedValue({ year, monthlyAmounts: null });
  vi.mocked(saveMonthlyBills).mockImplementation(async (_propertyId, savedYear, monthlyAmounts) => ({
    year: savedYear, monthlyAmounts,
  }));
});

describe("HistoricalBillsPanel", () => {
  it("loads, saves twelve ordered values including zeros, and reopens saved values", async () => {
    render(<HistoricalBillsPanel propertyId="property-1" />);
    expect(await screen.findByText(`No monthly bills saved for ${year}.`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enter Monthly Bills" }));
    expect(screen.getByRole("dialog", { name: "Enter Monthly Electricity Bills" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "January bill (USD)" }), { target: { value: "120.50" } });
    fireEvent.change(screen.getByRole("textbox", { name: "December bill (USD)" }), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveMonthlyBills).toHaveBeenCalledWith("property-1", year,
      [120.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 90]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const bars = screen.getByRole("img").querySelectorAll<HTMLElement>(".bill-bar");
    expect(bars).toHaveLength(12);
    expect(bars[1].style.height).toBe("0%");
    expect(bars[0].style.height).toBe("100%");
    const months = Array.from(screen.getByRole("img").querySelectorAll<HTMLElement>(".bill-column"))
      .map((column) => column.dataset.month);
    expect(months).toEqual(["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"]);
    fireEvent.click(screen.getByRole("button", { name: "Enter Monthly Bills" }));
    expect(screen.getByRole("textbox", { name: "January bill (USD)" })).toHaveValue("120.50");
    expect(screen.getByRole("textbox", { name: "February bill (USD)" })).toHaveValue("0.00");
  });

  it("cancel discards edits and does not save", async () => {
    vi.mocked(loadMonthlyBills).mockResolvedValue({ year, monthlyAmounts: Array(12).fill(30) });
    render(<HistoricalBillsPanel propertyId="property-1" />);
    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: "Enter Monthly Bills" }));
    fireEvent.change(screen.getByRole("textbox", { name: "January bill (USD)" }), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(saveMonthlyBills).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Enter Monthly Bills" }));
    expect(screen.getByRole("textbox", { name: "January bill (USD)" })).toHaveValue("30.00");
  });

  it("rejects invalid currency before calling the backend", async () => {
    render(<HistoricalBillsPanel propertyId="property-1" />);
    await screen.findByText(`No monthly bills saved for ${year}.`);
    fireEvent.click(screen.getByRole("button", { name: "Enter Monthly Bills" }));
    fireEvent.change(screen.getByRole("textbox", { name: "March bill (USD)" }), { target: { value: "12.345" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("March");
    expect(saveMonthlyBills).not.toHaveBeenCalled();
  });

  it("edits a saved-run bill snapshot without touching property-level bills", async () => {
    const onChange = vi.fn();
    render(<HistoricalBillsPanel propertyId="property-1"
      snapshot={{ year, monthlyAmounts: Array(12).fill(20) }} onChange={onChange} />);
    expect(await screen.findByRole("img")).toBeInTheDocument();
    expect(loadMonthlyBills).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Enter Monthly Bills" }));
    fireEvent.change(screen.getByRole("textbox", { name: "January bill (USD)" }), { target: { value: "44" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(year, [44, ...Array(11).fill(20)]));
    expect(saveMonthlyBills).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Bill year" }),
      { target: { value: String(year - 1) } });
    expect(onChange).toHaveBeenCalledWith(year - 1, null);
    expect(loadMonthlyBills).not.toHaveBeenCalled();
  });

  it("shows saved bills without edit controls in view mode", () => {
    render(<HistoricalBillsPanel propertyId="property-1"
      snapshot={{ year, monthlyAmounts: Array(12).fill(0) }} readOnly />);
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enter Monthly Bills" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Bill year" })).toBeDisabled();
    expect(loadMonthlyBills).not.toHaveBeenCalled();
  });

  it("reports when the selected year is ready for an analysis snapshot", async () => {
    const onReadyChange = vi.fn();
    render(<HistoricalBillsPanel propertyId="property-1"
      snapshot={{ year, monthlyAmounts: null }} onReadyChange={onReadyChange} />);
    await waitFor(() => expect(onReadyChange).toHaveBeenLastCalledWith(true));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Bill year" }),
      { target: { value: "1899" } });
    await waitFor(() => expect(onReadyChange).toHaveBeenLastCalledWith(false));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Bill year" }),
      { target: { value: String(year - 1) } });
    await waitFor(() => expect(onReadyChange).toHaveBeenLastCalledWith(true));
    fireEvent.click(screen.getByRole("button", { name: "Enter Monthly Bills" }));
    await waitFor(() => expect(onReadyChange).toHaveBeenLastCalledWith(false));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onReadyChange).toHaveBeenLastCalledWith(true));
  });
});
