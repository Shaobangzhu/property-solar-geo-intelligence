import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SolarSystemPanel } from "./SolarSystemPanel";

describe("SolarSystemPanel", () => {
  it("offers generic presets and changes to custom after capacity edit", async () => {
    const onSave = vi.fn(async () => {});
    render(<SolarSystemPanel propertyLoaded system={null} loading={false} error=""
      roofReady onRetry={vi.fn()} onSave={onSave} />);
    expect(screen.getByText(/No Solar System saved yet/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("System size"), { target: { value: "large" } });
    expect(screen.getByLabelText("System capacity (kW)")).toHaveValue(10);
    fireEvent.change(screen.getByLabelText("System capacity (kW)"), { target: { value: "8.5" } });
    expect(screen.getByLabelText("System size")).toHaveValue("custom");
    fireEvent.click(screen.getByRole("button", { name: "Save & estimate" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ preset: "custom", systemCapacityKw: 8.5,
      systemLossPercent: 14, moduleType: 0, arrayType: 1 }));
  });
});
