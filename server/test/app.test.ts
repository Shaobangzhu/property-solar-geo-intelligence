import { type Server } from "node:http";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { PropertyStore } from "../src/properties.js";

const store: PropertyStore = {
  findByAddress: async () => null,
  createIfAbsent: async () => { throw new Error("Not used by health test"); },
  updateDetails: async () => null,
};

describe("GET /api/health", () => {
  it("returns an ok status", async () => {
    const server: Server = createApp(store).listen();
    const response = await request(server).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
});
