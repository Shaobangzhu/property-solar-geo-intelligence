import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { PropertyStore } from "../src/properties.js";
import type { RoofProfileInput, RoofProfileRecord, RoofProfileStore } from "../src/roofProfiles.js";

const properties: PropertyStore = {
  findById: async () => null,
  findByAddress: async () => null,
  createIfAbsent: async () => { throw new Error("Not used in roof tests"); },
  updateDetails: async () => null,
};
const input: RoofProfileInput = {
  usableAreaSqFt: 620,
  tiltDegrees: 25,
  azimuthDegrees: 180,
  estimatedShadingFactor: 0.15,
  roofGeometryJson: null,
};
const outline = {
  type: "Polygon" as const,
  coordinates: [[
    [-117.182, 34.055], [-117.1819, 34.055],
    [-117.1819, 34.0551], [-117.182, 34.055],
  ]],
};

function roofStore(): RoofProfileStore {
  let current: RoofProfileRecord | null = null;
  return {
    getForProperty: vi.fn(async (propertyId) => ({
      propertyExists: propertyId === "property-1",
      roofProfile: propertyId === "property-1" ? current : null,
    })),
    saveForProperty: vi.fn(async (propertyId, values) => {
      if (propertyId !== "property-1") return null;
      current = {
        id: current?.id ?? "roof-1",
        propertyId,
        ...values,
        createdAt: current?.createdAt ?? "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z",
      };
      return current;
    }),
  };
}

describe("roof profile API", () => {
  it("loads an empty profile, saves, then updates the same profile", async () => {
    const store = roofStore();
    const app = createApp(properties, store);
    const path = "/api/properties/property-1/roof-profile";
    expect((await request(app).get(path)).body).toEqual({ roofProfile: null });

    const first = await request(app).put(path).send({ ...input, roofGeometryJson: outline });
    expect(first.status).toBe(200);
    expect(first.body.roofProfile).toMatchObject({
      id: "roof-1", propertyId: "property-1", roofGeometryJson: outline,
    });

    const updated = await request(app).put(path).send({ ...input, tiltDegrees: 30, roofGeometryJson: null });
    expect(updated.status).toBe(200);
    expect(updated.body.roofProfile.id).toBe(first.body.roofProfile.id);
    expect(updated.body.roofProfile.tiltDegrees).toBe(30);
    expect((await request(app).get(path)).body.roofProfile).toEqual(updated.body.roofProfile);
    expect(store.saveForProperty).toHaveBeenCalledTimes(2);
  });

  it.each([
    { tiltDegrees: -0.1 }, { tiltDegrees: 90.1 },
    { azimuthDegrees: -1 }, { azimuthDegrees: 360 },
    { usableAreaSqFt: 0 }, { usableAreaSqFt: -100 },
    { estimatedShadingFactor: 1.1 },
    { roofGeometryJson: { ...outline, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
  ])("rejects invalid roof assumptions: %j", async (change) => {
    const store = roofStore();
    const response = await request(createApp(properties, store))
      .put("/api/properties/property-1/roof-profile").send({ ...input, ...change });
    expect(response.status).toBe(400);
    expect(store.saveForProperty).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown property", async () => {
    const app = createApp(properties, roofStore());
    expect((await request(app).get("/api/properties/missing/roof-profile")).status).toBe(404);
    expect((await request(app).put("/api/properties/missing/roof-profile").send(input)).status).toBe(404);
  });
});
