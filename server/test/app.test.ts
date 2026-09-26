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

describe("JSON request errors", () => {
  it("rejects malformed JSON without reflecting request contents", async () => {
    const marker = "private-test-marker";
    const response = await request(createApp(store, roofs)).post("/api/properties/lookup")
      .set("Content-Type", "application/json")
      .send(`{"address":"${marker}"`);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid JSON request." });
    expect(response.text).not.toContain(marker);
  });

  it("reports an oversized JSON request as a size error", async () => {
    const response = await request(createApp(store, roofs)).post("/api/properties/lookup")
      .send({ address: "x".repeat(110_000) });
    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: "Request body is too large." });
  });
});
