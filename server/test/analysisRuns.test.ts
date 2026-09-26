import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { analysisRunInputSchema, type AnalysisRunInput, type AnalysisRunRecord,
  type AnalysisRunStore } from "../src/analysisRuns.js";
import type { PropertyRecord, PropertyStore } from "../src/properties.js";
import type { RoofProfileStore } from "../src/roofProfiles.js";

const property: PropertyRecord = {
  id: "property-1", normalizedAddress: "380 new york st redlands ca",
  displayAddress: "380 New York St, Redlands, CA", latitude: 34.055, longitude: -117.182,
  propertyType: null, yearBuilt: null, livingAreaSqFt: null, lotSizeSqFt: null,
  createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-09-25T00:00:00.000Z",
};
const properties: PropertyStore = {
  findById: async (id) => id === property.id ? property : null,
  findByAddress: async () => null,
  createIfAbsent: async () => { throw new Error("unused"); },
  updateDetails: async () => null,
};
const roofs: RoofProfileStore = {
  getForProperty: async () => ({ propertyExists: true, roofProfile: null }),
  saveForProperty: async () => null,
};
const input: AnalysisRunInput = {
  propertyId: property.id,
  roofProfile: { usableAreaSqFt: 600, tiltDegrees: 25, azimuthDegrees: 180,
    estimatedShadingFactor: 0.15, roofGeometryJson: null },
  solarSystem: { preset: "small", systemCapacityKw: 4, systemLossPercent: 14,
    moduleType: 0, arrayType: 1 },
  production: { estimate: { monthlyAcKwh: [100, 200, 300, 400, 500, 600,
    700, 800, 900, 1000, 1100, 1200], annualAcKwh: 7800 }, warnings: [] },
  bills: { year: 2025, monthlyAmounts: Array.from({ length: 12 }, (_, index) => 90 + index) },
  annualConsumptionKwh: 6200,
  tariffReference: null,
  economics: null,
};

function store(): AnalysisRunStore {
  const runs = new Map<string, AnalysisRunRecord>();
  let nextId = 1;
  return {
    list: vi.fn(async () => [...runs.values()].map((run) => ({
      id: run.id, property: { id: run.property.id, displayAddress: run.property.displayAddress },
      systemCapacityKw: run.solarSystem.systemCapacityKw,
      annualAcKwh: run.production.estimate.annualAcKwh,
      estimatedAnnualSavingsUsd: run.economics?.estimatedAnnualSavingsUsd ?? null,
      createdAt: run.createdAt,
    }))),
    get: vi.fn(async (id) => runs.get(id) ?? null),
    create: vi.fn(async (values) => {
      if (values.propertyId !== property.id) return null;
      const now = "2026-09-25T00:00:00.000Z";
      const run: AnalysisRunRecord = { ...values, id: `run-${nextId++}`, property, createdAt: now, updatedAt: now };
      runs.set(run.id, run);
      return run;
    }),
    update: vi.fn(async (id, values) => {
      const current = runs.get(id);
      if (!current) return { status: "notFound" as const };
      if (values.propertyId !== current.propertyId) return { status: "propertyMismatch" as const };
      const run: AnalysisRunRecord = { ...values, id, property: current.property,
        createdAt: current.createdAt, updatedAt: "2026-09-25T01:00:00.000Z" };
      runs.set(id, run);
      return { status: "updated" as const, run };
    }),
    delete: vi.fn(async (id) => runs.delete(id)),
  };
}

describe("analysis run API", () => {
  it("creates separate runs, lists snapshots, reads and updates only one run, and deletes it", async () => {
    const runs = store();
    const app = createApp(properties, roofs, undefined, undefined, undefined, runs);
    const first = await request(app).post("/api/analysis-runs").send(input);
    const second = await request(app).post("/api/analysis-runs").send(input);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.run.id).not.toBe(second.body.run.id);
    expect(first.body.run.property).toEqual(property);
    expect(first.body.run.production.estimate.monthlyAcKwh).toEqual(input.production.estimate.monthlyAcKwh);

    const list = await request(app).get("/api/analysis-runs");
    expect(list.status).toBe(200);
    expect(list.body.runs).toHaveLength(2);
    expect(list.body.runs[0]).toMatchObject({ property: { displayAddress: property.displayAddress },
      systemCapacityKw: 4, annualAcKwh: 7800, estimatedAnnualSavingsUsd: null });
    const read = await request(app).get(`/api/analysis-runs/${first.body.run.id}`);
    expect(read.body.run.bills.monthlyAmounts).toEqual(input.bills.monthlyAmounts);

    const edited = { ...input, solarSystem: { ...input.solarSystem,
      preset: "custom", systemCapacityKw: 6 }, production: { ...input.production,
      estimate: { ...input.production.estimate,
        monthlyAcKwh: input.production.estimate.monthlyAcKwh.map((value) => value + 100),
        annualAcKwh: 9000 } } };
    const update = await request(app).put(`/api/analysis-runs/${first.body.run.id}`).send(edited);
    expect(update.status).toBe(200);
    expect(update.body.run.solarSystem.systemCapacityKw).toBe(6);
    expect((await request(app).get(`/api/analysis-runs/${second.body.run.id}`))
      .body.run.solarSystem.systemCapacityKw).toBe(4);

    expect((await request(app).delete(`/api/analysis-runs/${first.body.run.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/analysis-runs/${first.body.run.id}`)).status).toBe(404);
    expect((await request(app).delete(`/api/analysis-runs/${first.body.run.id}`)).status).toBe(404);
    expect((await request(app).get("/api/analysis-runs")).body.runs).toHaveLength(1);
  });

  it("rejects malformed snapshots, unrelated properties, and missing records", async () => {
    const runs = store();
    const app = createApp(properties, roofs, undefined, undefined, undefined, runs);
    const badMonths = await request(app).post("/api/analysis-runs").send({ ...input,
      production: { ...input.production, estimate: { ...input.production.estimate, monthlyAcKwh: [1, 2] } },
    });
    expect(badMonths.status).toBe(400);
    expect(runs.create).not.toHaveBeenCalled();
    const missingProperty = await request(app).post("/api/analysis-runs").send({ ...input,
      propertyId: "other-property" });
    expect(missingProperty.status).toBe(404);
    const created = await request(app).post("/api/analysis-runs").send(input);
    const mismatch = await request(app).put(`/api/analysis-runs/${created.body.run.id}`).send({ ...input,
      propertyId: "other-property" });
    expect(mismatch.status).toBe(409);
    expect((await request(app).put("/api/analysis-runs/missing").send(input)).status).toBe(404);
    expect((await request(app).get("/api/analysis-runs/missing")).status).toBe(404);
  });

  it("preserves the selected bill year when no monthly bills exist", async () => {
    const app = createApp(properties, roofs, undefined, undefined, undefined, store());
    const blankBills = { year: new Date().getFullYear() - 1, monthlyAmounts: null };
    const created = await request(app).post("/api/analysis-runs")
      .send({ ...input, bills: blankBills });
    expect(created.status).toBe(201);
    expect(created.body.run.bills).toEqual(blankBills);
    expect((await request(app).get(`/api/analysis-runs/${created.body.run.id}`)).body.run.bills)
      .toEqual(blankBills);

    const nextYear = new Date().getFullYear() - 2;
    const updated = await request(app).put(`/api/analysis-runs/${created.body.run.id}`)
      .send({ ...input, bills: { year: nextYear, monthlyAmounts: null } });
    expect(updated.status).toBe(200);
    expect(updated.body.run.bills).toEqual({ year: nextYear, monthlyAmounts: null });
  });

  it("rejects missing, invalid-year, and partial bill snapshots", async () => {
    const runs = store();
    const app = createApp(properties, roofs, undefined, undefined, undefined, runs);
    for (const bills of [null, { year: 1899, monthlyAmounts: null },
      { year: new Date().getFullYear() - 1, monthlyAmounts: [1] }]) {
      const response = await request(app).post("/api/analysis-runs").send({ ...input, bills });
      expect(response.status).toBe(400);
    }
    expect(runs.create).not.toHaveBeenCalled();
  });
});

describe("analysis snapshot validation", () => {
  it("rejects client-authored annual savings and tariff claims", async () => {
    const economics = { estimatedAnnualElectricityCostUsd: 1000,
      estimatedAnnualSolarValueUsd: 500, estimatedAnnualGridImportKwh: 3000,
      estimatedAnnualGridExportKwh: 1000, estimatedAnnualExportCreditUsd: 50,
      estimatedAnnualSavingsUsd: 500 };
    expect(analysisRunInputSchema.safeParse({ ...input, economics }).success).toBe(false);
    expect(analysisRunInputSchema.safeParse({ ...input, tariffReference: {
      utility: "SCE", planId: "TOU-D-PRIME", version: "test-version",
      effectiveFrom: "2026-06-25",
    }, economics }).success).toBe(false);
    const runs = store();
    const response = await request(createApp(properties, roofs, undefined, undefined, undefined, runs))
      .post("/api/analysis-runs").send({ ...input, tariffReference: {
        utility: "SCE", planId: "TOU-D-PRIME", version: "unverified-client-claim",
        effectiveFrom: "2026-06-25",
      }, economics });
    expect(response.status).toBe(400);
    expect(runs.create).not.toHaveBeenCalled();
  });

  it("rejects annual production inconsistent with the monthly snapshot", () => {
    expect(analysisRunInputSchema.safeParse({ ...input, production: {
      ...input.production, estimate: { ...input.production.estimate, annualAcKwh: 100 },
    } }).success).toBe(false);
  });
});
