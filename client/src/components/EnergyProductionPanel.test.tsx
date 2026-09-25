import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EnergyProductionPanel } from "./EnergyProductionPanel";

const base = { propertyLoaded: true, roofReady: true, systemReady: true,
  loading: false, error: "", result: null, onEstimate: vi.fn() };

describe("EnergyProductionPanel", () => {
  it("shows loading and error without fabricated production", () => {
    const { rerender } = render(<EnergyProductionPanel {...base} loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Calculating monthly production");
    expect(screen.queryByText(/kWh$/)).not.toBeInTheDocument();
    rerender(<EnergyProductionPanel {...base} error="PVWatts rate limit reached." />);
    expect(screen.getByRole("alert")).toHaveTextContent("PVWatts rate limit reached.");
    expect(screen.queryByText("Annual Production")).not.toBeInTheDocument();
  });

  it("renders twelve ordered monthly AC kWh values and warnings", () => {
    render(<EnergyProductionPanel {...base} result={{
      estimate: { annualAcKwh: 7800,
        monthlyAcKwh: Array.from({ length: 12 }, (_, index) => (index + 1) * 100) },
      warnings: ["Weather station is distant."],
    }} />);
    expect(screen.getByText("7,800 kWh")).toBeInTheDocument();
    expect(screen.getByText("January")).toBeInTheDocument();
    expect(screen.getByText("December")).toBeInTheDocument();
    expect(screen.getByText("Weather station is distant.")).toBeInTheDocument();
    expect(screen.getByRole("img").querySelectorAll(".monthly-row")).toHaveLength(12);
  });
});
