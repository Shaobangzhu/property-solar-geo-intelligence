import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { PropertyRecord, PropertyStore } from "../src/properties.js";
import type { RoofProfileStore } from "../src/roofProfiles.js";

const roofs: RoofProfileStore = {
  getForProperty: async () => ({ propertyExists: false, roofProfile: null }),
  saveForProperty: async () => null,
};

const property: PropertyRecord = {
  id: "property-1",
  normalizedAddress: "380 new york st, redlands ca",
  displayAddress: "380 New York St, Redlands, CA",
  latitude: 34.055,
  longitude: -117.182,
  propertyType: null,
  yearBuilt: null,
  livingAreaSqFt: null,
  lotSizeSqFt: null,
  createdAt: "2026-09-24T00:00:00.000Z",
  updatedAt: "2026-09-24T00:00:00.000Z",
};

function mockStore(): PropertyStore {
  const records = new Map<string, PropertyRecord>();
  return {
    findByAddress: vi.fn(async (address) => records.get(address) ?? null),
    createIfAbsent: vi.fn(async (input) => {
      const existing = records.get(input.normalizedAddress);
      if (existing) return { property: existing, created: false };
      const created = { ...property, ...input };
      records.set(input.normalizedAddress, created);
      return { property: created, created: true };
    }),
    updateDetails: vi.fn(async (id, details) => {
      const record = [...records.values()].find((candidate) => candidate.id === id);
      if (!record) return null;
      const updated = { ...record, ...details };
      records.set(record.normalizedAddress, updated);
      return updated;
    }),
  };
}

describe("property API", () => {
  it("rejects invalid address input before a database lookup", async () => {
    const store = mockStore();
    const response = await request(createApp(store, roofs))
      .post("/api/properties/lookup")
      .send({ address: "  " });
    expect(response.status).toBe(400);
    expect(store.findByAddress).not.toHaveBeenCalled();
  });

  it("returns a local hit for a normalized address", async () => {
    const store = mockStore();
    await store.createIfAbsent(property);
    const response = await request(createApp(store, roofs))
      .post("/api/properties/lookup")
      .send({ address: "  380  NEW YORK ST, REDLANDS CA " });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ found: true, property: { id: property.id } });
  });

  it("reports a local miss", async () => {
    const store = mockStore();
    const response = await request(createApp(store, roofs))
      .post("/api/properties/lookup")
      .send({ address: "380 New York St, Redlands CA" });
    expect(response.body).toEqual({ found: false, property: null });
  });

  it("does not create a duplicate for the same normalized input", async () => {
    const store = mockStore();
    const app = createApp(store, roofs);
    const geocode = {
      requestedAddress: "380 New York St, Redlands CA",
      displayAddress: property.displayAddress,
      latitude: property.latitude,
      longitude: property.longitude,
    };
    const first = await request(app).post("/api/properties").send(geocode);
    const second = await request(app).post("/api/properties")
      .send({ ...geocode, requestedAddress: "  380  NEW YORK ST, REDLANDS CA " });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.property.id).toBe(first.body.property.id);
  });

  it.each([
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 },
    { latitude: "34.055", longitude: -117.182 },
  ])("rejects invalid coordinates: %j", async (coordinates) => {
    const store = mockStore();
    const response = await request(createApp(store, roofs)).post("/api/properties").send({
      requestedAddress: property.displayAddress,
      displayAddress: property.displayAddress,
      ...coordinates,
    });
    expect(response.status).toBe(400);
    expect(store.createIfAbsent).not.toHaveBeenCalled();
  });

  it("saves manually entered details", async () => {
    const store = mockStore();
    await store.createIfAbsent(property);
    const response = await request(createApp(store, roofs)).patch(`/api/properties/${property.id}`).send({
      propertyType: "Single-family",
      yearBuilt: 1980,
      livingAreaSqFt: 2100,
      lotSizeSqFt: 6800,
    });
    expect(response.status).toBe(200);
    expect(response.body.property.yearBuilt).toBe(1980);
  });
});
