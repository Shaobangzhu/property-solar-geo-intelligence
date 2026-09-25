import { balanceEnergy, type EnergyBalance } from "./economics.js";
import { quoteSceNbt26Export } from "./sceNbt26.js";
import { quoteSceTouPrimeEnergy } from "./sceTouPrime.js";

const localFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit",
  day: "2-digit", hour: "2-digit", hourCycle: "h23",
});

function pacificDateAndHour(utcHourStart: Date): { date: string; hour: number } {
  const parts = Object.fromEntries(localFormatter.formatToParts(utcHourStart)
    .filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export type SceBundledIntervalInput = {
  utcHourStart: Date;
  householdConsumptionKwh: number;
  solarGenerationKwh: number;
  selfConsumedKwh: number;
  // Callers must establish these account facts; they cannot be inferred from a property.
  supplyArrangement: "SCE-bundled";
  exportVintage: "NBT26";
};

export type SceBundledEnergyOnlyInterval = EnergyBalance & {
  localDate: string;
  localHour: number;
  importTouPeriod: string;
  importDeliveryEnergyChargeUsd: number;
  importGenerationEnergyChargeUsd: number;
  grossExportDeliveryCreditAccrualUsd: number;
  grossExportGenerationCreditAccrualUsd: number;
};

/**
 * A one-hour energy-only primitive for explicitly eligible bundled NBT26
 * service. Gross EEC accrual is not an applied credit or a cash payout.
 * Fixed/non-bypassable charges, riders, settlement and taxes are excluded.
 */
export function calculateSceBundledEnergyOnlyInterval(
  input: SceBundledIntervalInput,
): SceBundledEnergyOnlyInterval {
  if (input.supplyArrangement !== "SCE-bundled" || input.exportVintage !== "NBT26") {
    throw new Error("This rate snapshot requires confirmed bundled SCE service and NBT26 eligibility.");
  }
  const exportQuote = quoteSceNbt26Export(input.utcHourStart);
  const { date, hour } = pacificDateAndHour(input.utcHourStart);
  const importQuote = quoteSceTouPrimeEnergy(date, hour);
  const energy = balanceEnergy(input.householdConsumptionKwh,
    input.solarGenerationKwh, input.selfConsumedKwh);
  return {
    ...energy,
    localDate: date,
    localHour: hour,
    importTouPeriod: importQuote.period,
    importDeliveryEnergyChargeUsd: energy.gridImportsKwh * importQuote.deliveryUsdPerKwh,
    importGenerationEnergyChargeUsd: energy.gridImportsKwh * importQuote.bundledGenerationUsdPerKwh,
    grossExportDeliveryCreditAccrualUsd: energy.gridExportsKwh * exportQuote.deliveryUsdPerKwh,
    grossExportGenerationCreditAccrualUsd: energy.gridExportsKwh * exportQuote.generationUsdPerKwh,
  };
}
