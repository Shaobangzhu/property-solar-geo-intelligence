/**
 * Filed Schedule TOU-D, Option PRIME snapshot supplied for M7B.
 *
 * This quotes only the TOU energy-charge rows on Sheet 6 for a bundled SCE
 * customer. Fixed charges, credits, taxes, NBT credit banking and other bill
 * rules are separate. A later filed sheet can supersede this snapshot.
 */

export type SceTouPrimeSeason = "summer" | "winter";
export type SceTouPrimeDayType = "weekday" | "weekend" | "holiday";
export type SceTouPrimePeriod = "onPeak" | "midPeak" | "offPeak" | "superOffPeak";

export const sceTouPrimeSnapshot = {
  utility: "SCE",
  planId: "TOU-D-PRIME",
  version: "Schedule TOU-D, Cal. P.U.C. Sheets 91200-E, 91355-E, 91356-E, 91357-E",
  effectiveFrom: "2026-06-25",
  effectiveTo: null,
  verifiedAt: "2026-09-25",
  timeZone: "America/Los_Angeles",
  source: {
    title: "Southern California Edison Schedule TOU-D, Option PRIME",
    originalFilename: "ELECTRIC_SCHEDULES_TOU-D.pdf",
    url: "https://www.sce.com/regulatory/regulatory-information/tariff-books/rates-pricing-choices",
    attachedFileSha256: "fad123e7d0e36c8db28ef0d9480a13b6828d52f3d0e8d3ea947db7ae17967faa",
    embeddedPdfSha256: "28cc218a0325921ec5292c9413f1e0eb19d197d1f832a8746835c3afe3cfc473",
    sheets: [
      { number: 6, calPucSheet: "91200-E", advice: "5829-E", effectiveFrom: "2026-06-01", content: "Option PRIME energy rates and separate charges" },
      { number: 7, calPucSheet: "91355-E", advice: "5837-E", effectiveFrom: "2026-06-25", content: "Delivery energy-charge component breakout" },
      { number: 8, calPucSheet: "91356-E", advice: "5837-E", effectiveFrom: "2026-06-25", content: "TOU period table" },
      { number: 9, calPucSheet: "91357-E", advice: "5837-E", effectiveFrom: "2026-06-25", content: "Holiday and season definitions" },
    ],
  },
  // Sheet 6: delivery total and bundled-service generation UG, in USD/kWh.
  // DWREC is 0.00000 for all listed Option PRIME energy periods.
  energyRatesUsdPerKwh: {
    summer: {
      onPeak: { delivery: 0.29624, bundledGeneration: 0.29667 },
      midPeak: { delivery: 0.29624, bundledGeneration: 0.10558 },
      offPeak: { delivery: 0.19649, bundledGeneration: 0.07049 },
    },
    winter: {
      midPeak: { delivery: 0.30157, bundledGeneration: 0.26489 },
      offPeak: { delivery: 0.18675, bundledGeneration: 0.05958 },
      superOffPeak: { delivery: 0.18675, bundledGeneration: 0.05958 },
    },
  },
  // Filed separately on Sheet 6. Applicability depends on the customer's
  // account and billing rules; these are not added to an energy quote.
  separateCharges: {
    fixedRecoveryUsdPerKwh: 0.00619,
    mcamUsdPerKwh: 0.00223,
    baseServicesUsdPerMeterDay: 0.794,
    deedRestrictedBaseServicesAdjustmentUsdPerMeterDay: -0.327,
    separateEvMeterCreditUsdPerMeterDay: -0.461,
    evSubmeterCreditUsdPerMeterDay: -0.152,
    californiaClimateCreditUsdPerDisbursement: -36,
  },
} as const;

export type SceTouPrimeEnergyQuote = {
  season: SceTouPrimeSeason;
  dayType: SceTouPrimeDayType;
  period: SceTouPrimePeriod;
  deliveryUsdPerKwh: number;
  bundledGenerationUsdPerKwh: number;
  bundledTouEnergyUsdPerKwh: number;
};

function localCalendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error("Use a local calendar date in YYYY-MM-DD format.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Use a real local calendar date.");
  }
  return date;
}

function nthWeekday(year: number, month: number, weekday: number, occurrence: number): number {
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + (weekday - firstDay + 7) % 7 + (occurrence - 1) * 7;
}

function lastWeekday(year: number, month: number, weekday: number): number {
  const end = new Date(Date.UTC(year, month, 0));
  return end.getUTCDate() - (end.getUTCDay() - weekday + 7) % 7;
}

function fixedHoliday(date: Date, month: number, day: number): boolean {
  const year = date.getUTCFullYear();
  const actual = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() + 1 === month && date.getUTCDate() === day) return true;
  // Sheet 9 observes a Sunday holiday on Monday; it does not move a
  // Saturday holiday to Friday.
  return actual.getUTCDay() === 0
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day + 1;
}

/** Uses the holiday list and Sunday-only observation rule on Sheet 9. */
export function isSceTouPrimeHoliday(localDate: string): boolean {
  const date = localCalendarDate(localDate);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return fixedHoliday(date, 1, 1)
    || (month === 2 && day === nthWeekday(year, 2, 1, 3)) // Presidents' Day
    || (month === 5 && day === lastWeekday(year, 5, 1)) // Memorial Day
    || fixedHoliday(date, 7, 4)
    || (month === 9 && day === nthWeekday(year, 9, 1, 1)) // Labor Day
    || fixedHoliday(date, 11, 11)
    || (month === 11 && day === nthWeekday(year, 11, 4, 4)) // Thanksgiving
    || fixedHoliday(date, 12, 25);
}

/**
 * Quotes the filed bundled-service TOU energy charge for a Los Angeles local
 * calendar date and clock hour (0-23). It does not quote a whole bill or NBT
 * export credit. No end date is inferred from this supplied tariff snapshot.
 */
export function quoteSceTouPrimeEnergy(localDate: string, localHour: number): SceTouPrimeEnergyQuote {
  const date = localCalendarDate(localDate);
  if (localDate < sceTouPrimeSnapshot.effectiveFrom) {
    throw new Error("This TOU-D-PRIME snapshot does not cover dates before June 25, 2026.");
  }
  if (!Number.isInteger(localHour) || localHour < 0 || localHour > 23) {
    throw new Error("Local hour must be an integer from 0 through 23.");
  }
  const month = date.getUTCMonth() + 1;
  const season: SceTouPrimeSeason = month >= 6 && month <= 9 ? "summer" : "winter";
  const day = date.getUTCDay();
  const dayType: SceTouPrimeDayType = isSceTouPrimeHoliday(localDate)
    ? "holiday" : day === 0 || day === 6 ? "weekend" : "weekday";
  let period: SceTouPrimePeriod;
  if (season === "summer") {
    period = localHour >= 16 && localHour < 21
      ? dayType === "weekday" ? "onPeak" : "midPeak"
      : "offPeak";
  } else {
    period = localHour >= 16 && localHour < 21 ? "midPeak"
      : localHour >= 8 && localHour < 16 ? "superOffPeak" : "offPeak";
  }
  const rate = season === "summer"
    ? sceTouPrimeSnapshot.energyRatesUsdPerKwh.summer[period as "onPeak" | "midPeak" | "offPeak"]
    : sceTouPrimeSnapshot.energyRatesUsdPerKwh.winter[period as "midPeak" | "offPeak" | "superOffPeak"];
  return {
    season, dayType, period,
    deliveryUsdPerKwh: rate.delivery,
    bundledGenerationUsdPerKwh: rate.bundledGeneration,
    bundledTouEnergyUsdPerKwh: Math.round((rate.delivery + rate.bundledGeneration) * 100000) / 100000,
  };
}
