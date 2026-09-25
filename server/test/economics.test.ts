import { describe, expect, it } from "vitest";
import { balanceEnergy, calculateIntervalEconomics, hasCurrentTariff, isTariffReady,
  loadTariffCatalog, selectTariffVersion } from "../src/economics.js";
import { testTariff } from "./fixtures/testTariff.js";

describe("energy balance", () => {
  it("keeps self-consumption within both consumption and generation", () => {
    expect(balanceEnergy(5, 8, 3)).toEqual({
      householdConsumptionKwh: 5, solarGenerationKwh: 8, selfConsumedKwh: 3,
      gridImportsKwh: 2, gridExportsKwh: 5,
    });
    expect(() => balanceEnergy(5, 8, 6)).toThrow(/Self-consumption/);
    expect(() => balanceEnergy(8, 5, 6)).toThrow(/Self-consumption/);
    expect(() => balanceEnergy(-1, 5, 0)).toThrow(/nonnegative/);
  });

  it("handles generation greater than consumption and the reverse", () => {
    expect(balanceEnergy(4, 10, 4)).toMatchObject({ gridImportsKwh: 0, gridExportsKwh: 6 });
    expect(balanceEnergy(10, 4, 4)).toMatchObject({ gridImportsKwh: 6, gridExportsKwh: 0 });
  });

  it("handles zero production and zero consumption without implying avoided use", () => {
    expect(balanceEnergy(7, 0, 0)).toMatchObject({ gridImportsKwh: 7, gridExportsKwh: 0 });
    expect(balanceEnergy(0, 7, 0)).toMatchObject({ gridImportsKwh: 0, gridExportsKwh: 7 });
  });
});

describe("synthetic tariff calculations — TEST DATA — NOT CURRENT SCE RATES", () => {
  it("separates import cost, export credit and solar value across weekday/weekend intervals", () => {
    const totals = calculateIntervalEconomics(testTariff, [
      { month: 6, dayType: "weekday", hour: 17,
        householdConsumptionKwh: 5, solarGenerationKwh: 8, selfConsumedKwh: 3 },
      { month: 6, dayType: "weekend", hour: 17,
        householdConsumptionKwh: 10, solarGenerationKwh: 2, selfConsumedKwh: 2 },
    ]);
    expect(totals).toMatchObject({ householdConsumptionKwh: 15, solarGenerationKwh: 10,
      selfConsumedKwh: 5, gridImportsKwh: 10, gridExportsKwh: 5 });
    expect(totals.baselineImportCostUsd).toBeCloseTo(2);
    expect(totals.importCostUsd).toBeCloseTo(1.2);
    expect(totals.exportCreditUsd).toBeCloseTo(0.25);
    expect(totals.estimatedEnergyCostUsd).toBeCloseTo(0.95);
    expect(totals.estimatedSolarValueUsd).toBeCloseTo(1.05);
  });

  it("fails closed if credits or required periods are missing", () => {
    expect(() => calculateIntervalEconomics({ ...testTariff,
      exportCredit: { method: "unconfigured" } }, [
      { month: 1, dayType: "weekday", hour: 12,
        householdConsumptionKwh: 1, solarGenerationKwh: 1, selfConsumedKwh: 1 },
    ])).toThrow(/Export-credit data/);
    expect(() => calculateIntervalEconomics({ ...testTariff, importPeriods: [] }, [
      { month: 1, dayType: "weekday", hour: 12,
        householdConsumptionKwh: 1, solarGenerationKwh: 1, selfConsumedKwh: 1 },
    ])).toThrow(/Tariff period/);
    expect(() => calculateIntervalEconomics(testTariff, [])).toThrow(/intervals/);
  });

  it("selects the version effective on the requested date", () => {
    const earlier = { ...testTariff, version: "test-v1", effectiveTo: "2026-07-01" };
    const later = { ...testTariff, version: "test-v2", effectiveFrom: "2026-07-01" };
    const catalog = [later, earlier];
    expect(selectTariffVersion(catalog, testTariff.utility, testTariff.planId, "2026-06-30")?.version)
      .toBe("test-v1");
    expect(selectTariffVersion(catalog, testTariff.utility, testTariff.planId, "2026-07-01")?.version)
      .toBe("test-v2");
    expect(selectTariffVersion(catalog, testTariff.utility, testTariff.planId, "2025-12-31"))
      .toBeNull();
  });

  it("only marks complete import and export schedules as ready", () => {
    expect(isTariffReady(testTariff)).toBe(true);
    expect(isTariffReady({ ...testTariff, exportCredit: { method: "unconfigured" } })).toBe(false);
    expect(isTariffReady({ ...testTariff, importPeriods: testTariff.importPeriods.slice(0, 1) })).toBe(false);
    expect(loadTariffCatalog(undefined)).toEqual([]);
    expect(hasCurrentTariff([testTariff], "2026-09-25")).toBe(true);
    expect(hasCurrentTariff([{ ...testTariff, effectiveTo: "2026-08-01" }], "2026-09-25"))
      .toBe(false);
    expect(hasCurrentTariff([testTariff], "2026-02-30")).toBe(false);
  });
});
