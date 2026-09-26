import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAnalysisRun, listAnalysisRuns, type AnalysisRunSummary } from "../propertyApi";
import { HistoryPage } from "./HistoryPage";

vi.mock("../propertyApi", () => ({
  listAnalysisRuns: vi.fn(),
  deleteAnalysisRun: vi.fn(),
}));

const runs: AnalysisRunSummary[] = [
  {
    id: "run-one", property: { id: "property-one", displayAddress: "380 New York St, Redlands, CA" },
    systemCapacityKw: 7.25, annualAcKwh: 10025, estimatedAnnualSavingsUsd: null,
    createdAt: "2026-09-20T18:00:00.000Z",
  },
  {
    id: "run-two", property: { id: "property-two", displayAddress: "100 Oak St, Riverside, CA" },
    systemCapacityKw: 5, annualAcKwh: 6900, estimatedAnnualSavingsUsd: 1234,
    createdAt: "2026-09-21T18:00:00.000Z",
  },
];

function AnalyzeDestination() {
  const location = useLocation();
  return <div data-testid="destination">{location.pathname}{location.search}</div>;
}

function renderHistory() {
  return render(<MemoryRouter initialEntries={["/history"]}>
    <Routes>
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/analyze" element={<AnalyzeDestination />} />
    </Routes>
  </MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listAnalysisRuns).mockResolvedValue([]);
  vi.mocked(deleteAnalysisRun).mockResolvedValue();
});

describe("Analysis History", () => {
  it("renders an empty state after loading", async () => {
    renderHistory();
    expect(screen.getByRole("status")).toHaveTextContent("Loading saved analyses");
    expect(await screen.findByRole("heading", { name: "No saved analyses yet" })).toBeInTheDocument();
  });

  it("shows saved runs, units, and an unavailable savings value", async () => {
    vi.mocked(listAnalysisRuns).mockResolvedValue(runs);
    renderHistory();
    const table = await screen.findByRole("table");
    expect(within(table).getByText("380 New York St, Redlands, CA")).toBeInTheDocument();
    expect(within(table).getByText("7.25 kW")).toBeInTheDocument();
    expect(within(table).getByText("10,025 kWh")).toBeInTheDocument();
    expect(within(table).getByText("Unavailable")).toBeInTheDocument();
    expect(within(table).getByText("$1,234")).toBeInTheDocument();
    expect(within(table).getByText("ESTIMATE")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("filters by address without changing the saved list", async () => {
    vi.mocked(listAnalysisRuns).mockResolvedValue(runs);
    renderHistory();
    await screen.findByRole("table");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search by address" }), {
      target: { value: "riverside" },
    });
    expect(screen.getByText("100 Oak St, Riverside, CA")).toBeInTheDocument();
    expect(screen.queryByText("380 New York St, Redlands, CA")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search by address" }), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No matching analyses")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search by address" }), {
      target: { value: "" },
    });
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("opens a saved run in view mode", async () => {
    vi.mocked(listAnalysisRuns).mockResolvedValue(runs);
    renderHistory();
    fireEvent.click(await screen.findByRole("button", { name: "View analysis for 380 New York St, Redlands, CA" }));
    expect(screen.getByTestId("destination")).toHaveTextContent("/analyze?runId=run-one&mode=view");
  });

  it("opens only the selected run in edit mode", async () => {
    vi.mocked(listAnalysisRuns).mockResolvedValue(runs);
    renderHistory();
    fireEvent.click(await screen.findByRole("button", { name: "Edit analysis for 100 Oak St, Riverside, CA" }));
    expect(screen.getByTestId("destination")).toHaveTextContent("/analyze?runId=run-two&mode=edit");
  });

  it("requires confirmation, respects cancel, and removes a deleted run immediately", async () => {
    vi.mocked(listAnalysisRuns).mockResolvedValue(runs);
    renderHistory();
    const deleteButton = await screen.findByRole("button", { name: "Delete analysis for 380 New York St, Redlands, CA" });
    fireEvent.click(deleteButton);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("380 New York St, Redlands, CA");
    expect(deleteAnalysisRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(deleteAnalysisRun).not.toHaveBeenCalled();
    fireEvent.click(deleteButton);
    fireEvent.click(screen.getByRole("button", { name: "Delete Analysis" }));
    await waitFor(() => expect(deleteAnalysisRun).toHaveBeenCalledWith("run-one"));
    await waitFor(() => expect(screen.queryByText("380 New York St, Redlands, CA")).not.toBeInTheDocument());
    expect(screen.getByText("100 Oak St, Riverside, CA")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Analysis deleted");
    expect(screen.getByRole("searchbox", { name: "Search by address" })).toHaveFocus();
  });

  it("keeps keyboard focus inside the confirmation and restores it on Escape", async () => {
    vi.mocked(listAnalysisRuns).mockResolvedValue([runs[0]]);
    renderHistory();
    const trigger = await screen.findByRole("button", { name: "Delete analysis for 380 New York St, Redlands, CA" });
    fireEvent.click(trigger);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Delete Analysis" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("clears a run that was already deleted elsewhere", async () => {
    vi.mocked(listAnalysisRuns).mockResolvedValue([runs[0]]);
    vi.mocked(deleteAnalysisRun).mockRejectedValue(new Error("Analysis run not found."));
    renderHistory();
    fireEvent.click(await screen.findByRole("button", { name: "Delete analysis for 380 New York St, Redlands, CA" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Analysis" }));
    expect(await screen.findByText("This analysis was already deleted.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No saved analyses yet" })).toBeInTheDocument();
  });

  it("shows a service failure while preserving the page", async () => {
    vi.mocked(listAnalysisRuns).mockRejectedValueOnce(new Error("History service unavailable."))
      .mockResolvedValueOnce([runs[0]]);
    renderHistory();
    expect(await screen.findByRole("alert")).toHaveTextContent("History service unavailable.");
    expect(screen.getByRole("heading", { name: "Could not load analysis history" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText("380 New York St, Redlands, CA")).toBeInTheDocument();
  });

  it("keeps a run when deletion fails", async () => {
    vi.mocked(listAnalysisRuns).mockResolvedValue([runs[0]]);
    vi.mocked(deleteAnalysisRun).mockRejectedValue(new Error("The local service is unavailable."));
    renderHistory();
    fireEvent.click(await screen.findByRole("button", { name: "Delete analysis for 380 New York St, Redlands, CA" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Analysis" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The local service is unavailable.");
    expect(screen.getByRole("table")).toHaveTextContent("380 New York St, Redlands, CA");
  });
});
