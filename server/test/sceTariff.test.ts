import { describe, expect, it } from "vitest";
import { tariffVersionSchema } from "../src/economics.js";
import { applySceMonthlyExportCredit, getSceTariffStatus, sceLocalDate, sceRuleSources,
  sceVerifiedRules } from "../src/sceTariff.js";
import { testTariff } from "./fixtures/testTariff.js";

describe("SCE Net Billing rule boundary", () => {
  it("selects the tariff date in California, including after UTC midnight", () => {
    expect(sceLocalDate(new Date("2026-09-25T00:30:00.000Z"))).toBe("2026-09-24");
    expect(sceLocalDate(new Date("2026-09-25T10:30:00.000Z"))).toBe("2026-09-25");
  });

  it("applies monthly EEC only to eligible energy charges, with remaining credit carried", () => {
    // TEST DATA — NOT CURRENT SCE RATES. This verifies Schedule NBT Sheet 6's application rule.
    expect(applySceMonthlyExportCredit(20, 50, 10)).toEqual({
      appliedToEnergyChargesUsd: 20,
      remainingEnergyChargesUsd: 0,
      unusedCreditCarriedUsd: 40,
    });
    expect(applySceMonthlyExportCredit(20, 5, 5)).toEqual({
      appliedToEnergyChargesUsd: 10,
      remainingEnergyChargesUsd: 10,
      unusedCreditCarriedUsd: 0,
    });
    expect(() => applySceMonthlyExportCredit(20, -1, 0)).toThrow(/nonnegative/);
  });

  it("never treats synthetic rates or an incomplete SCE record as current configuration", () => {
    const absent = getSceTariffStatus([], "2026-09-25");
    expect(absent.configured).toBe(false);
    expect(absent.annualEstimateSupported).toBe(false);
    expect(absent.missing).toHaveLength(4);
    expect(absent.verifiedRateInputs.map((rate) => rate.component)).toEqual(["import", "export"]);
    expect(absent.verifiedRateInputs[0]).toMatchObject({
      planId: "TOU-D-PRIME", effectiveFrom: "2026-06-25",
    });
    expect(absent.verifiedRateInputs[1]).toMatchObject({
      planId: "NBT", effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01",
    });
    expect(getSceTariffStatus([], "2026-03-01").verifiedRateInputs.map((rate) => rate.component))
      .toEqual(["export"]);
    expect(getSceTariffStatus([], "2027-01-01").verifiedRateInputs.map((rate) => rate.component))
      .toEqual(["import"]);
    expect(sceRuleSources.every((source) => source.url.startsWith("https://"))).toBe(true);
    expect(sceVerifiedRules.every((rule) => rule.utility === "SCE" && rule.planId === "NBT"
      && rule.version && rule.effectiveFrom && rule.sourceLocation && rule.sourceUrl)).toBe(true);
    expect(getSceTariffStatus([testTariff], "2026-09-25").configured).toBe(false);
    expect(getSceTariffStatus([{ ...testTariff, utility: "SCE", planId: "TOU-D-PRIME" }],
      "2026-09-25").configured).toBe(false);
    const unreviewedClaim = { ...testTariff, utility: "SCE", planId: "TOU-D-PRIME",
      sourceReferences: testTariff.sourceReferences.map((reference) => ({
        ...reference, url: "https://www.sce.com/claimed-tariff",
      })) };
    expect(getSceTariffStatus([unreviewedClaim], "2026-09-25").configured).toBe(false);
  });

  it("requires per-component reference metadata on each versioned tariff record", () => {
    const { sourceReferences: _sourceReferences, ...withoutReferences } = testTariff;
    void _sourceReferences;
    expect(tariffVersionSchema.safeParse(withoutReferences).success).toBe(false);
    expect(tariffVersionSchema.safeParse(testTariff).success).toBe(true);
  });
});
