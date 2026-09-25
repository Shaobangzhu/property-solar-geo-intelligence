import { describe, expect, it } from "vitest";
import { calculateSceBundledEnergyOnlyInterval } from "../src/sceIntervalEconomics.js";

describe("verified SCE energy-only interval boundary", () => {
  it("keeps filed PRIME import and NBT26 export components separate", () => {
    // 2026-07-01 17:00 PDT: PRIME summer weekday on-peak (Sheet 6), and
    // NBT26 MIDAS 2026-07-02 00:00 UTC generation .06036 / delivery .22330.
    const result = calculateSceBundledEnergyOnlyInterval({
      utcHourStart: new Date("2026-07-02T00:00:00.000Z"),
      householdConsumptionKwh: 10,
      solarGenerationKwh: 8,
      selfConsumedKwh: 5,
      supplyArrangement: "SCE-bundled",
      exportVintage: "NBT26",
    });
    expect(result).toMatchObject({
      localDate: "2026-07-01", localHour: 17, importTouPeriod: "onPeak",
      selfConsumedKwh: 5, gridImportsKwh: 5, gridExportsKwh: 3,
    });
    expect(result.importDeliveryEnergyChargeUsd).toBeCloseTo(5 * 0.29624);
    expect(result.importGenerationEnergyChargeUsd).toBeCloseTo(5 * 0.29667);
    expect(result.grossExportDeliveryCreditAccrualUsd).toBeCloseTo(3 * 0.22330);
    expect(result.grossExportGenerationCreditAccrualUsd).toBeCloseTo(3 * 0.06036);
    expect(result).not.toHaveProperty("estimatedAnnualElectricityCostUsd");
    expect(result).not.toHaveProperty("appliedExportCreditUsd");
  });

  it("rejects dates outside the combined supplied snapshot and invalid self-consumption", () => {
    const input = {
      utcHourStart: new Date("2026-06-01T00:00:00.000Z"),
      householdConsumptionKwh: 3, solarGenerationKwh: 2, selfConsumedKwh: 1,
      supplyArrangement: "SCE-bundled" as const, exportVintage: "NBT26" as const,
    };
    expect(() => calculateSceBundledEnergyOnlyInterval(input)).toThrow(/before June 25/);
    expect(() => calculateSceBundledEnergyOnlyInterval({ ...input,
      utcHourStart: new Date("2026-07-02T00:00:00.000Z"), selfConsumedKwh: 4,
    })).toThrow(/Self-consumption/);
    expect(() => calculateSceBundledEnergyOnlyInterval({ ...input,
      utcHourStart: new Date("2026-07-02T00:00:00.000Z"),
      supplyArrangement: "CCA" as "SCE-bundled",
    })).toThrow(/bundled SCE/);
  });
});
