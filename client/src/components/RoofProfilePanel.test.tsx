import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Property, RoofProfile } from "../propertyApi";
import type { RoofGeometry } from "../roofGeometry";
import { RoofProfilePanel } from "./RoofProfilePanel";

const property = { id: "property-1" } as Property;
const geometry: RoofGeometry = {
  type: "Polygon",
  coordinates: [[[-117.182, 34.055], [-117.1819, 34.055], [-117.1819, 34.0551], [-117.182, 34.055]]],
};
const profile: RoofProfile = {
  id: "roof-1",
  propertyId: property.id,
  usableAreaSqFt: 600,
  tiltDegrees: 25,
  azimuthDegrees: 180,
  estimatedShadingFactor: 0.2,
  roofGeometryJson: geometry,
  createdAt: "2026-09-24T00:00:00.000Z",
  updatedAt: "2026-09-24T00:00:00.000Z",
};

function panel(saved: RoofProfile | null = null, outline: RoofGeometry | null = null,
  onSave = vi.fn(async () => {})) {
  return <RoofProfilePanel property={property} profile={saved} geometry={outline}
    loading={false} error="" onRetry={vi.fn()} onSave={onSave} onClearGeometry={vi.fn()} />;
}

describe("RoofProfilePanel", () => {
  it("shows existing assumptions on revisit and saves an update with geometry", async () => {
    const onSave = vi.fn(async () => {});
    render(panel(profile, geometry, onSave));
    expect(screen.getByText("User-adjustable assumptions")).toBeInTheDocument();
    expect(screen.getByLabelText("Usable Roof Area (sq ft)")).toHaveValue(600);
    expect(screen.getByLabelText("Roof Tilt (degrees)")).toHaveValue(25);
    fireEvent.change(screen.getByLabelText("Roof Tilt (degrees)"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Roof Profile" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      usableAreaSqFt: 600,
      tiltDegrees: 30,
      azimuthDegrees: 180,
      estimatedShadingFactor: 0.2,
      roofGeometryJson: geometry,
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("Roof assumptions saved.");
  });

  it("requires tilt and azimuth and rejects invalid area before saving", () => {
    const onSave = vi.fn(async () => {});
    render(panel(null, null, onSave));
    fireEvent.click(screen.getByRole("button", { name: "Save Roof Profile" }));
    expect(screen.getByRole("alert")).toHaveTextContent("tilt from 0 to 90");
    fireEvent.change(screen.getByLabelText("Roof Tilt (degrees)"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Roof Azimuth (degrees)"), { target: { value: "180" } });
    fireEvent.change(screen.getByLabelText("Usable Roof Area (sq ft)"), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Roof Profile" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Usable roof area must be greater than 0");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("marks an outline removal as a draft until saved", () => {
    const { rerender } = render(panel(profile, geometry));
    rerender(panel(profile, null));
    expect(screen.getByText("Outline removal not yet saved.")).toBeInTheDocument();
  });
});
