import { describe, expect, it } from "vitest";
import { quoteSceNbt26Export, sceNbt26Snapshot } from "../src/sceNbt26.js";

describe("SCE NBT26 2026 export rate lookup", () => {
  it("returns the correct source components at the first UTC hour", () => {
    expect(sceNbt26Snapshot).toMatchObject({
      utility: "SCE", planId: "NBT", vintage: "NBT26",
      effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01",
    });
    expect(quoteSceNbt26Export(new Date("2026-01-01T08:00:00.000Z"))).toEqual({
      generationUsdPerKwh: 0.08745, deliveryUsdPerKwh: 0.00083,
    });
  });

  it("requires an exact covered UTC hour, including at DST and year boundaries", () => {
    expect(quoteSceNbt26Export(new Date("2026-11-01T08:00:00.000Z"))).toEqual(
      quoteSceNbt26Export(new Date("2026-11-01T09:00:00.000Z")));
    for (const value of ["2026-01-01T07:00:00.000Z", "2027-01-01T08:00:00.000Z",
      "2026-01-01T08:30:00.000Z", "invalid"]) {
      expect(() => quoteSceNbt26Export(new Date(value))).toThrow(/unavailable/);
    }
  });
});
