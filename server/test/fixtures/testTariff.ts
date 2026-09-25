// TEST DATA — NOT CURRENT SCE RATES.
// Synthetic numbers exercise the economics math only. Never load this in the running app.
import type { TariffVersion } from "../../src/economics.js";

export const testTariff: TariffVersion = {
  utility: "TEST UTILITY — NOT SCE",
  planId: "TEST-TOU",
  version: "test-v1",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  timeZone: "America/Los_Angeles",
  sourceUrl: "https://example.test/synthetic-import-rates",
  verifiedAt: "2026-01-01",
  // Test-only metadata intentionally does not pass the runtime SCE source review.
  sourceReferences: [
    { authority: "SCE", component: "import", title: "TEST DATA — NOT CURRENT SCE RATES",
      url: "https://example.test/synthetic-import-rates", location: "Synthetic test fixture" },
    { authority: "SCE", component: "export", title: "TEST DATA — NOT CURRENT SCE RATES",
      url: "https://example.test/synthetic-export-credits", location: "Synthetic test fixture" },
  ],
  seasons: [{ id: "all", months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }],
  importPeriods: [
    { periodId: "test-weekday", seasonId: "all", dayType: "weekday",
      startHour: 0, endHour: 24, rateUsdPerKwh: 0.20 },
    { periodId: "test-weekend", seasonId: "all", dayType: "weekend",
      startHour: 0, endHour: 24, rateUsdPerKwh: 0.10 },
    { periodId: "test-holiday", seasonId: "all", dayType: "holiday",
      startHour: 0, endHour: 24, rateUsdPerKwh: 0.10 },
  ],
  exportCredit: {
    method: "hourlySchedule",
    sourceUrl: "https://example.test/synthetic-export-credits",
    vintage: "TEST VINTAGE — NOT CURRENT SCE RATES",
    periods: [
      { periodId: "test-weekday-export", seasonId: "all", dayType: "weekday",
        startHour: 0, endHour: 24, rateUsdPerKwh: 0.05 },
      { periodId: "test-weekend-export", seasonId: "all", dayType: "weekend",
        startHour: 0, endHour: 24, rateUsdPerKwh: 0.05 },
      { periodId: "test-holiday-export", seasonId: "all", dayType: "holiday",
        startHour: 0, endHour: 24, rateUsdPerKwh: 0.05 },
    ],
  },
};
