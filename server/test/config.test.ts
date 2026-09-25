import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("parses typed server configuration", () => {
    const config = loadConfig({ DATABASE_URL: "postgresql://user:password@localhost:5432/solar" });
    expect(config.PORT).toBe(3001);
    expect(config.NODE_ENV).toBe("development");
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow();
  });

  it("treats a blank PVWatts key as missing without stopping the API", () => {
    const config = loadConfig({ DATABASE_URL: "postgresql://user:password@localhost:5432/solar",
      PVWATTS_API_KEY: "" });
    expect(config.PVWATTS_API_KEY).toBeUndefined();
  });

  it("treats a blank tariff catalog path as unconfigured", () => {
    const config = loadConfig({ DATABASE_URL: "postgresql://user:password@localhost:5432/solar",
      TARIFF_CATALOG_PATH: "" });
    expect(config.TARIFF_CATALOG_PATH).toBeUndefined();
  });
});
