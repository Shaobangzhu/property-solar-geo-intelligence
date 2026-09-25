import { describe, expect, it } from "vitest";
import {
  sceNbt26Delivery2026,
  sceNbt26Generation2026,
  sceNbt26Metadata,
  sceNbt26SourceSha256,
} from "../src/data/sceNbt26_2026.js";

const firstHourUtc = Date.parse("2026-01-01T08:00:00Z");

function hourIndex(utcIso: string): number {
  return (Date.parse(utcIso) - firstHourUtc) / 3_600_000;
}

describe("reviewed SCE NBT26 MIDAS 2026 export data", () => {
  it("records the exact source hash, components, units, and UTC coverage", () => {
    expect(sceNbt26SourceSha256).toBe("1f4f60dde4f5bca3a65e6132f41a7d170ed348b4f53ee0effcfb3a444f23f596");
    expect(sceNbt26Metadata).toMatchObject({
      utility: "SCE",
      vintage: "NBT26",
      rateUnit: "USD/kWh",
      intervalTimeZone: "UTC",
      localTimeZone: "America/Los_Angeles",
      utcCoverageStart: "2026-01-01T08:00:00Z",
      utcCoverageEndExclusive: "2027-01-01T08:00:00Z",
      generationRin: "USCA-XXSC-NB26-0000",
      deliveryRin: "USCA-SCXX-NB26-0000",
    });
    expect(sceNbt26Metadata.weekdayDatesLabeledWeekend).toContain("2026-01-01");
  });

  it("has every 2026 UTC hour for both components and no malformed prices", () => {
    for (const rates of [sceNbt26Generation2026, sceNbt26Delivery2026]) {
      expect(rates).toHaveLength(8760);
      expect(Object.isFrozen(rates)).toBe(true);
      expect(rates.every((rate) => Number.isFinite(rate) && rate >= 0)).toBe(true);
    }
    expect(hourIndex("2027-01-01T08:00:00Z")).toBe(8760);
  });

  it("keeps generation and delivery prices separate at the source's January 1 example", () => {
    expect(sceNbt26Generation2026[hourIndex("2026-01-01T08:00:00Z")]).toBe(0.08745);
    expect(sceNbt26Delivery2026[hourIndex("2026-01-01T08:00:00Z")]).toBe(0.00083);
  });

  it("indexes the spring skip and fall repeated local hour by distinct UTC hours", () => {
    expect(sceNbt26Generation2026[hourIndex("2026-03-08T09:00:00Z")]).toBe(0.06740);
    expect(sceNbt26Generation2026[hourIndex("2026-03-08T10:00:00Z")]).toBe(0.07025);
    expect(sceNbt26Delivery2026[hourIndex("2026-03-08T09:00:00Z")]).toBe(0.00067);
    expect(sceNbt26Delivery2026[hourIndex("2026-03-08T10:00:00Z")]).toBe(0.00073);
    expect(hourIndex("2026-11-01T09:00:00Z") - hourIndex("2026-11-01T08:00:00Z")).toBe(1);
    expect(sceNbt26Generation2026[hourIndex("2026-11-01T08:00:00Z")]).toBe(0.07657);
    expect(sceNbt26Generation2026[hourIndex("2026-11-01T09:00:00Z")]).toBe(0.07657);
  });
});
