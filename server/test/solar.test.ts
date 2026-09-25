import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { PropertyStore } from "../src/properties.js";
import type { RoofProfileStore } from "../src/roofProfiles.js";
import type { SolarEstimateResult } from "../src/pvwatts.js";
import type { SolarSystemInput, SolarSystemRecord, SolarSystemStore } from "../src/solarSystems.js";

const properties: PropertyStore = {
  findByAddress: async () => null,
  createIfAbsent: async () => { throw new Error("unused"); },
  updateDetails: async () => null,
};
const roofs: RoofProfileStore = {
  getForProperty: async () => ({ propertyExists: true, roofProfile: null }),
  saveForProperty: async () => null,
};
const input: SolarSystemInput = { preset: "small", systemCapacityKw: 4,
  systemLossPercent: 14, moduleType: 0, arrayType: 1 };
const saved: SolarSystemRecord = { ...input, id: "system-1", propertyId: "property-1",
  createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-09-25T00:00:00.000Z" };
const ready = { status: "ready" as const, inputs: { ...input,
  latitude: 34, longitude: -117, tiltDegrees: 25, azimuthDegrees: 180 } };
const result: SolarEstimateResult = { estimate: { monthlyAcKwh: [100, 200, 300, 400, 500, 600,
  700, 800, 900, 1000, 1100, 1200], annualAcKwh: 7800 }, warnings: [] };

function dependencies(context: Awaited<ReturnType<SolarSystemStore["getEstimateContext"]>> = ready) {
  const systems: SolarSystemStore = {
    getForProperty: vi.fn(async () => ({ propertyExists: true, solarSystem: saved })),
    saveForProperty: vi.fn(async () => saved),
    getEstimateContext: vi.fn(async () => context),
  };
  const estimate = vi.fn(async () => result);
  return { systems, estimate };
}

describe("solar API", () => {
  it("saves configuration and estimates from server-side stored values", async () => {
    const solar = dependencies();
    const app = createApp(properties, roofs, solar);
    const put = await request(app).put("/api/properties/property-1/solar-system").send(input);
    expect(put.status).toBe(200);
    expect(put.body.solarSystem).toEqual(saved);
    const response = await request(app).post("/api/solar/estimate").send({ propertyId: "property-1" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(result);
    expect(solar.estimate).toHaveBeenCalledWith(ready.inputs);
  });

  it.each([{ systemCapacityKw: 0 }, { systemCapacityKw: 101 }, { systemLossPercent: 100 }, { moduleType: 3 },
    { arrayType: 4 }, { preset: "small", systemCapacityKw: 7 }])("rejects invalid system settings: %j", async (change) => {
    const solar = dependencies();
    const response = await request(createApp(properties, roofs, solar))
      .put("/api/properties/property-1/solar-system").send({ ...input, ...change });
    expect(response.status).toBe(400);
    expect(solar.systems.saveForProperty).not.toHaveBeenCalled();
  });

  it.each(["propertyMissing", "roofMissing", "systemMissing"] as const)("explains missing %s context before calling PVWatts", async (status) => {
    const solar = dependencies({ status });
    const response = await request(createApp(properties, roofs, solar))
      .post("/api/solar/estimate").send({ propertyId: "property-1" });
    expect(response.status).toBe(status === "propertyMissing" ? 404 : 409);
    expect(solar.estimate).not.toHaveBeenCalled();
  });

  it("rejects malformed requests and corrupt stored coordinates", async () => {
    const solar = dependencies({ status: "ready", inputs: { ...ready.inputs, latitude: 200 } });
    const app = createApp(properties, roofs, solar);
    expect((await request(app).post("/api/solar/estimate").send({ propertyId: "property-1", apiKey: "bad" })).status).toBe(400);
    expect((await request(app).post("/api/solar/estimate").send({ propertyId: "property-1" })).status).toBe(422);
    expect(solar.estimate).not.toHaveBeenCalled();
  });
});
