import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { MonthlyBillYear, MonthlyBillsStore } from "../src/monthlyBills.js";
import type { PropertyStore } from "../src/properties.js";
import type { RoofProfileStore } from "../src/roofProfiles.js";

const properties: PropertyStore = {
  findByAddress: async () => null,
  createIfAbsent: async () => { throw new Error("unused"); },
  updateDetails: async () => null,
};
const roofs: RoofProfileStore = {
  getForProperty: async () => ({ propertyExists: true, roofProfile: null }),
  saveForProperty: async () => null,
};
const year = new Date().getFullYear() - 1;

function store(): MonthlyBillsStore {
  const years = new Map<number, number[]>();
  return {
    load: vi.fn(async (propertyId, requestedYear) => ({
      propertyExists: propertyId === "property-1",
      bills: { year: requestedYear, monthlyAmounts: years.get(requestedYear) ?? null },
    })),
    save: vi.fn(async (propertyId, input): Promise<MonthlyBillYear | null> => {
      if (propertyId !== "property-1") return null;
      years.set(input.year, [...input.monthlyAmounts]);
      return { year: input.year, monthlyAmounts: years.get(input.year) ?? null };
    }),
  };
}

describe("monthly electricity bill API", () => {
  it("loads, saves, then edits twelve ordered monthly amounts", async () => {
    const bills = store();
    const app = createApp(properties, roofs, undefined, bills);
    const path = `/api/properties/property-1/electricity-bills?year=${year}`;
    expect((await request(app).get(path)).body).toEqual({ year, monthlyAmounts: null });
    const amounts = Array.from({ length: 12 }, (_, index) => index * 10.25);
    const first = await request(app).put("/api/properties/property-1/electricity-bills")
      .send({ year, monthlyAmounts: amounts });
    expect(first.status).toBe(200);
    expect(first.body.monthlyAmounts).toEqual(amounts);
    const edited = [99.99, ...amounts.slice(1)];
    expect((await request(app).put("/api/properties/property-1/electricity-bills")
      .send({ year, monthlyAmounts: edited })).body.monthlyAmounts).toEqual(edited);
    expect((await request(app).get(path)).body.monthlyAmounts).toEqual(edited);
  });

  it.each([
    { monthlyAmounts: Array(11).fill(0) },
    { monthlyAmounts: [...Array(11).fill(0), -1] },
    { monthlyAmounts: [...Array(11).fill(0), 1.234] },
    { monthlyAmounts: [...Array(11).fill(0), "5"] },
    { year: 1899 },
  ])("rejects invalid bill input: %j", async (change) => {
    const bills = store();
    const response = await request(createApp(properties, roofs, undefined, bills))
      .put("/api/properties/property-1/electricity-bills")
      .send({ year, monthlyAmounts: Array(12).fill(0), ...change });
    expect(response.status).toBe(400);
    expect(bills.save).not.toHaveBeenCalled();
  });

  it("rejects invalid year and unknown property", async () => {
    const app = createApp(properties, roofs, undefined, store());
    expect((await request(app).get("/api/properties/property-1/electricity-bills?year=abc")).status).toBe(400);
    expect((await request(app).get(`/api/properties/missing/electricity-bills?year=${year}`)).status).toBe(404);
    expect((await request(app).put("/api/properties/missing/electricity-bills")
      .send({ year, monthlyAmounts: Array(12).fill(0) })).status).toBe(404);
  });
});
