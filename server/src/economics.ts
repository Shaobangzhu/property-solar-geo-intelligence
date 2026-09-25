import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a real calendar date.");
const dayTypeSchema = z.enum(["weekday", "weekend", "holiday"]);
const ratePeriodSchema = z.object({
  periodId: z.string().min(1),
  seasonId: z.string().min(1),
  dayType: dayTypeSchema,
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  rateUsdPerKwh: z.number().finite().nonnegative(),
}).strict().refine((period) => period.endHour > period.startHour);

export const tariffVersionSchema = z.object({
  utility: z.string().min(1),
  planId: z.string().min(1),
  version: z.string().min(1),
  effectiveFrom: dateSchema,
  effectiveTo: dateSchema.nullable(), // Exclusive.
  timeZone: z.string().min(1),
  sourceUrl: z.string().url(),
  verifiedAt: dateSchema,
  sourceReferences: z.array(z.object({
    authority: z.enum(["SCE", "CPUC"]),
    component: z.enum(["import", "export", "billing"]),
    title: z.string().min(1),
    url: z.string().url(),
    location: z.string().min(1),
  }).strict()).min(1),
  seasons: z.array(z.object({
    id: z.string().min(1),
    months: z.array(z.number().int().min(1).max(12)).min(1),
  }).strict()).min(1),
  importPeriods: z.array(ratePeriodSchema).min(1),
  exportCredit: z.discriminatedUnion("method", [
    z.object({ method: z.literal("unconfigured"), sourceUrl: z.string().url().optional() }).strict(),
    z.object({ method: z.literal("hourlySchedule"), sourceUrl: z.string().url(),
      vintage: z.string().min(1), periods: z.array(ratePeriodSchema).min(1) }).strict(),
  ]),
}).strict().refine((tariff) => tariff.effectiveTo === null || tariff.effectiveTo > tariff.effectiveFrom,
  "Tariff effectiveTo must be after effectiveFrom.");

export type TariffVersion = z.infer<typeof tariffVersionSchema>;
export type DayType = z.infer<typeof dayTypeSchema>;

// A reviewed runtime JSON catalog can be provided later. No tariff values ship with the app.
export function loadTariffCatalog(path: string | undefined): TariffVersion[] {
  if (!path) return [];
  const raw: unknown = JSON.parse(readFileSync(resolve(path), "utf8"));
  return z.array(tariffVersionSchema).parse(raw);
}

export function selectTariffVersion(catalog: TariffVersion[], utility: string, planId: string,
  onDate: string): TariffVersion | null {
  if (!dateSchema.safeParse(onDate).success) throw new Error("Invalid tariff selection date.");
  const matches = catalog.filter((tariff) => tariff.utility === utility && tariff.planId === planId
    && tariff.effectiveFrom <= onDate && (tariff.effectiveTo === null || onDate < tariff.effectiveTo))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  if (matches.length > 1 && matches[0].effectiveFrom === matches[1].effectiveFrom) {
    throw new Error("Ambiguous tariff versions for the selected date.");
  }
  return matches[0] ?? null;
}

export type TimeAlignedEnergyInterval = {
  month: number;
  dayType: DayType;
  hour: number; // Local hour in the tariff's time zone.
  householdConsumptionKwh: number;
  solarGenerationKwh: number;
  selfConsumedKwh: number; // Explicit co-timed assumption or measurement.
};

export type EnergyBalance = {
  householdConsumptionKwh: number;
  solarGenerationKwh: number;
  selfConsumedKwh: number;
  gridImportsKwh: number;
  gridExportsKwh: number;
};

export type IntervalEconomicsTotals = EnergyBalance & {
  baselineImportEnergyChargeUsd: number;
  importEnergyChargeUsd: number;
  grossExportCreditAccrualUsd: number;
};

function nonnegative(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a nonnegative number.`);
}

export function balanceEnergy(householdConsumptionKwh: number, solarGenerationKwh: number,
  selfConsumedKwh: number): EnergyBalance {
  nonnegative(householdConsumptionKwh, "Household consumption");
  nonnegative(solarGenerationKwh, "Solar generation");
  nonnegative(selfConsumedKwh, "Self-consumption");
  if (selfConsumedKwh > Math.min(householdConsumptionKwh, solarGenerationKwh)) {
    throw new Error("Self-consumption cannot exceed consumption or generation.");
  }
  return {
    householdConsumptionKwh,
    solarGenerationKwh,
    selfConsumedKwh,
    gridImportsKwh: householdConsumptionKwh - selfConsumedKwh,
    gridExportsKwh: solarGenerationKwh - selfConsumedKwh,
  };
}

function periodRate(tariff: TariffVersion, intervals: TariffVersion["importPeriods"],
  month: number, dayType: DayType, hour: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("Invalid interval month or hour.");
  }
  const seasons = tariff.seasons.filter((season) => season.months.includes(month));
  if (seasons.length !== 1) throw new Error("Tariff season is missing or ambiguous.");
  const matches = intervals.filter((period) => period.seasonId === seasons[0].id
    && period.dayType === dayType && period.startHour <= hour && hour < period.endHour);
  if (matches.length !== 1) throw new Error("Tariff period is missing or ambiguous.");
  return matches[0].rateUsdPerKwh;
}

// Only use with time-aligned intervals and an explicit self-consumption amount.
// Annual totals alone cannot be distributed across TOU periods or used to infer self-consumption.
export function calculateIntervalEconomics(tariff: TariffVersion,
  intervals: TimeAlignedEnergyInterval[]): IntervalEconomicsTotals {
  if (intervals.length === 0) throw new Error("Time-aligned energy intervals are required.");
  if (tariff.exportCredit.method !== "hourlySchedule") {
    throw new Error("Export-credit data is not configured.");
  }
  const totals: IntervalEconomicsTotals = {
    householdConsumptionKwh: 0, solarGenerationKwh: 0, selfConsumedKwh: 0,
    gridImportsKwh: 0, gridExportsKwh: 0,
    baselineImportEnergyChargeUsd: 0, importEnergyChargeUsd: 0,
    grossExportCreditAccrualUsd: 0,
  };
  for (const interval of intervals) {
    const energy = balanceEnergy(interval.householdConsumptionKwh,
      interval.solarGenerationKwh, interval.selfConsumedKwh);
    const importRate = periodRate(tariff, tariff.importPeriods,
      interval.month, interval.dayType, interval.hour);
    const exportRate = periodRate(tariff, tariff.exportCredit.periods,
      interval.month, interval.dayType, interval.hour);
    totals.householdConsumptionKwh += energy.householdConsumptionKwh;
    totals.solarGenerationKwh += energy.solarGenerationKwh;
    totals.selfConsumedKwh += energy.selfConsumedKwh;
    totals.gridImportsKwh += energy.gridImportsKwh;
    totals.gridExportsKwh += energy.gridExportsKwh;
    totals.baselineImportEnergyChargeUsd += energy.householdConsumptionKwh * importRate;
    totals.importEnergyChargeUsd += energy.gridImportsKwh * importRate;
    totals.grossExportCreditAccrualUsd += energy.gridExportsKwh * exportRate;
  }
  return totals;
}

export function isTariffReady(tariff: TariffVersion): boolean {
  if (tariff.exportCredit.method !== "hourlySchedule") return false;
  try {
    for (let month = 1; month <= 12; month += 1) {
      for (const dayType of ["weekday", "weekend", "holiday"] as const) {
        for (let hour = 0; hour < 24; hour += 1) {
          periodRate(tariff, tariff.importPeriods, month, dayType, hour);
          periodRate(tariff, tariff.exportCredit.periods, month, dayType, hour);
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function hasCurrentTariff(catalog: TariffVersion[], onDate: string): boolean {
  if (!dateSchema.safeParse(onDate).success) return false;
  return catalog.some((tariff) => tariff.effectiveFrom <= onDate
    && (tariff.effectiveTo === null || onDate < tariff.effectiveTo) && isTariffReady(tariff));
}
