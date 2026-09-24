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
});
