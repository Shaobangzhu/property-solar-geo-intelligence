import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { ConsumptionRecord, ConsumptionStore } from "../src/consumption.js";
import type { PropertyStore } from "../src/properties.js";
import type { RoofProfileStore } from "../src/roofProfiles.js";
import { testTariff } from "./fixtures/testTariff.js";

const properties: PropertyStore = {
  findById: async () => null,
  findByAddress: async () => null,
  createIfAbsent: async () => { throw new Error("unused"); },
  updateDetails: async () => null,
};
const roofs: RoofProfileStore = {
  getForProperty: async () => ({ propertyExists: true, roofProfile: null }),
  saveForProperty: async () => null,
};

function store(): ConsumptionStore {
  let current: ConsumptionRecord | null = null;
  return {
    getForProperty: vi.fn(async (propertyId) => ({
      propertyExists: propertyId === "property-1",
      consumption: propertyId === "property-1" ? current : null,
    })),
    saveForProperty: vi.fn(async (propertyId, input) => {
      if (propertyId !== "property-1") return null;
      current = {
        id: current?.id ?? "consumption-1", propertyId,
        annualConsumptionKwh: input.annualConsumptionKwh,
        createdAt: current?.createdAt ?? "2026-09-25T00:00:00.000Z",
        updatedAt: "2026-09-25T00:00:00.000Z",
      };
      return current;
    }),
  };
}

describe("economics architecture API", () => {
  it("loads and edits a separate annual kWh consumption assumption", async () => {
    const consumption = store();
    const app = createApp(properties, roofs, undefined, undefined, { consumption, tariffCatalog: [] });
    const path = "/api/properties/property-1/consumption";
    expect((await request(app).get(path)).body).toEqual({ consumption: null });
    const saved = await request(app).put(path).send({ annualConsumptionKwh: 8400.5 });
    expect(saved.status).toBe(200);
    expect(saved.body.consumption.annualConsumptionKwh).toBe(8400.5);
    expect((await request(app).get(path)).body).toEqual(saved.body);
    expect((await request(app).put(path).send({ annualConsumptionKwh: 9000 })).body.consumption.id)
      .toBe(saved.body.consumption.id);
    expect((await request(app).get("/api/economics/tariff-status")).body).toMatchObject({
      configured: false, annualEstimateSupported: false, utility: "SCE", planId: "TOU-D-PRIME",
    });
  });

  it.each([{ annualConsumptionKwh: -1 }, { annualConsumptionKwh: 1.234 },
    { annualConsumptionKwh: "5000" }, { annualConsumptionKwh: 10_000_001 },
    { annualConsumptionKwh: 5000, monthlyBillUsd: 100 }])("rejects invalid consumption input: %j", async (input) => {
    const consumption = store();
    const response = await request(createApp(properties, roofs, undefined, undefined,
      { consumption, tariffCatalog: [] })).put("/api/properties/property-1/consumption").send(input);
    expect(response.status).toBe(400);
    expect(consumption.saveForProperty).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown property and rejects synthetic tariffs as SCE configuration", async () => {
    const app = createApp(properties, roofs, undefined, undefined,
      { consumption: store(), tariffCatalog: [testTariff] });
    expect((await request(app).get("/api/properties/missing/consumption")).status).toBe(404);
    expect((await request(app).put("/api/properties/missing/consumption")
      .send({ annualConsumptionKwh: 0 })).status).toBe(404);
    expect((await request(app).get("/api/economics/tariff-status")).body).toMatchObject({
      configured: false, annualEstimateSupported: false,
    });
  });
});
