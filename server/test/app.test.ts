import { type Server } from "node:http";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { PropertyStore } from "../src/properties.js";
import type { RoofProfileStore } from "../src/roofProfiles.js";

const store: PropertyStore = {
  findById: async () => null,
  findByAddress: async () => null,
  createIfAbsent: async () => { throw new Error("Not used by health test"); },
  updateDetails: async () => null,
};
const roofs: RoofProfileStore = {
  getForProperty: async () => ({ propertyExists: false, roofProfile: null }),
  saveForProperty: async () => null,
};

describe("GET /api/health", () => {
  it("returns an ok status", async () => {
    const server: Server = createApp(store, roofs).listen();
    const response = await request(server).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
});
