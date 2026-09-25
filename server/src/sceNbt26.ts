import { sceNbt26Delivery2026, sceNbt26Generation2026,
  sceNbt26SourceSha256 } from "./data/sceNbt26_2026.js";

const firstUtcHour = Date.UTC(2026, 0, 1, 8);
const lastUtcHourExclusive = Date.UTC(2027, 0, 1, 8);
const millisecondsPerHour = 60 * 60 * 1000;

// This is one calendar-year slice of the supplied NBT26 MIDAS file. The file
// contains generation and delivery EEC components, not a customer bill tariff.
export const sceNbt26Snapshot = {
  utility: "SCE",
  planId: "NBT",
  version: "NBT26 MIDAS 2026 local-year slice",
  vintage: "NBT26",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2027-01-01", // Exclusive data coverage; not a tariff supersession date.
  timeZone: "America/Los_Angeles",
  sourceUrl: "https://www.sce.com/customer-service-center/help-center/solar/solar-billing-plan/understanding-export-pricing",
  sourceFileName: "NBT26 MIDAS File.csv",
  sourceSha256: sceNbt26SourceSha256,
  verifiedAt: "2026-09-25",
  generationRin: "USCA-XXSC-NB26-0000",
  deliveryRin: "USCA-SCXX-NB26-0000",
  sourceLocation: "2026 local calendar-year hourly rows; Value, export $/kWh",
} as const;

export type SceNbt26ExportRate = {
  generationUsdPerKwh: number;
  deliveryUsdPerKwh: number;
};

// The source file provides every UTC hour, including both occurrences of the
// autumn repeated Pacific hour. Indexing by UTC avoids DST and holiday guesses.
export function quoteSceNbt26Export(utcHourStart: Date): SceNbt26ExportRate {
  const timestamp = utcHourStart.getTime();
  if (!Number.isFinite(timestamp) || timestamp < firstUtcHour
    || timestamp >= lastUtcHourExclusive || (timestamp - firstUtcHour) % millisecondsPerHour !== 0) {
    throw new Error("NBT26 export rate is unavailable for this UTC hour.");
  }
  const index = (timestamp - firstUtcHour) / millisecondsPerHour;
  const generationUsdPerKwh = sceNbt26Generation2026[index];
  const deliveryUsdPerKwh = sceNbt26Delivery2026[index];
  if (generationUsdPerKwh === undefined || deliveryUsdPerKwh === undefined) {
    throw new Error("NBT26 export rate data is incomplete.");
  }
  return { generationUsdPerKwh, deliveryUsdPerKwh };
}
