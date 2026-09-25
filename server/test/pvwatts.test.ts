import { describe, expect, it } from "vitest";
import {
  buildPvWattsUrl, createPvWattsEstimator, normalizePvWattsResponse, SolarEstimateError,
  type SolarEstimateInputs,
} from "../src/pvwatts.js";

const inputs: SolarEstimateInputs = {
  preset: "medium", systemCapacityKw: 7, systemLossPercent: 14,
  moduleType: 1, arrayType: 1, tiltDegrees: 25, azimuthDegrees: 180,
  latitude: 34.0556, longitude: -117.1817,
};

const payload = {
  errors: [], warnings: ["Weather data is distant."],
  outputs: { ac_monthly: Array.from({ length: 12 }, (_, index) => (index + 1) * 100),
    ac_annual: 7800, capacity_factor: 12.7 },
  station_info: { lat: 34.1, lon: -117.2, distance: 3500, weather_data_source: "NSRDB" },
  inputs: { api_key: "secret-test-key" },
};

describe("PVWatts V8 adapter", () => {
  it("maps saved domain inputs to the V8 monthly request", () => {
    const url = buildPvWattsUrl(inputs, "secret-test-key");
    expect(url.origin).toBe("https://developer.nlr.gov");
    expect(url.pathname).toBe("/api/pvwatts/v8.json");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      system_capacity: "7", losses: "14", module_type: "1", array_type: "1",
      tilt: "25", azimuth: "180", lat: "34.0556", lon: "-117.1817", timeframe: "monthly",
    });
  });

  it("normalizes January through December AC kWh without exposing raw inputs", () => {
    const result = normalizePvWattsResponse(payload, "secret-test-key");
    expect(result.estimate.monthlyAcKwh).toEqual([100, 200, 300, 400, 500, 600,
      700, 800, 900, 1000, 1100, 1200]);
    expect(result.estimate.annualAcKwh).toBe(7800);
    expect(result.estimate.capacityFactor).toBe(12.7);
    expect(result.estimate.resource).toEqual({ latitude: 34.1, longitude: -117.2,
      distanceMeters: 3500, source: "NSRDB" });
    expect(result.warnings).toEqual(["Weather data is distant."]);
    expect(JSON.stringify(result)).not.toContain("secret-test-key");
    expect(JSON.stringify(result)).not.toContain("api_key");
  });

  it("rejects malformed or inconsistent monthly output", () => {
    expect(() => normalizePvWattsResponse({ ...payload, outputs: { ...payload.outputs,
      ac_monthly: [1, 2] } }, "key")).toThrow(SolarEstimateError);
    expect(() => normalizePvWattsResponse({ ...payload, outputs: { ...payload.outputs,
      ac_monthly: Array(12).fill(-1) } }, "key")).toThrow(SolarEstimateError);
    expect(() => normalizePvWattsResponse({ ...payload, errors: ["bad"] }, "key")).toThrow(SolarEstimateError);
  });

  it("redacts a credential in upstream warnings", () => {
    const result = normalizePvWattsResponse({ ...payload, warnings: ["token secret-test-key rejected"] }, "secret-test-key");
    expect(result.warnings).toEqual(["token [redacted] rejected"]);
    const encoded = normalizePvWattsResponse({ ...payload, warnings: ["token a%2Fb%2Bc rejected"] }, "a/b+c");
    expect(encoded.warnings).toEqual(["token [redacted] rejected"]);
  });

  it("handles missing key, network failure, 422, rate limit and unexpected JSON", async () => {
    await expect(createPvWattsEstimator(undefined)(inputs)).rejects.toMatchObject({ status: 503 });
    await expect(createPvWattsEstimator("key", async () => { throw new Error("private URL"); })(inputs))
      .rejects.toMatchObject({ status: 502, message: "PVWatts could not be reached. Try again later." });
    await expect(createPvWattsEstimator("key", async () => new Response("{}", { status: 422 }))(inputs))
      .rejects.toMatchObject({ status: 422 });
    await expect(createPvWattsEstimator("key", async () => new Response("{}", { status: 429 }))(inputs))
      .rejects.toMatchObject({ status: 429 });
    await expect(createPvWattsEstimator("key", async () => new Response("not json"))(inputs))
      .rejects.toMatchObject({ status: 502 });
  });
});
