import { createHash } from "node:crypto";
import { hasCurrentTariff, type TariffVersion } from "./economics.js";
import { sceNbt26Snapshot } from "./sceNbt26.js";
import { sceTouPrimeSnapshot } from "./sceTouPrime.js";

const sceDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
});

export function sceLocalDate(now: Date): string {
  const parts = Object.fromEntries(sceDateFormatter.formatToParts(now)
    .filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Filed billing rules and the two separately verified 2026 rate inputs.
export const sceRuleSources = [
  {
    title: "SCE Schedule TOU-D, Option PRIME, Sheets 6–9",
    url: sceTouPrimeSnapshot.source.url,
    location: "Cal. PUC Sheets 91200-E, 91355-E, 91356-E, 91357-E; composite effective June 25, 2026",
  },
  {
    title: "SCE NBT26 MIDAS hourly Energy Export Credits",
    url: sceNbt26Snapshot.sourceUrl,
    location: `2026 local-year generation and delivery rows; supplied CSV SHA-256 ${sceNbt26Snapshot.sourceSha256}`,
  },
  {
    title: "SCE Schedule NBT, Sheet 2",
    url: "https://www.sce.com/sites/default/files/custom-files/PDF_Files/ELECTRIC_SCHEDULES_NBT.pdf",
    location: "Cal. PUC Sheet 89744-E; Advice 5533-E; effective April 23, 2025; eligible TOU rate",
  },
  {
    title: "SCE Schedule NBT, Sheets 5–6",
    url: "https://www.sce.com/sites/default/files/custom-files/PDF_Files/ELECTRIC_SCHEDULES_NBT.pdf",
    location: "Cal. PUC Sheets 87274-E and 85353-E; effective December 14, 2023 and March 1, 2023; hourly EEC, restrictions, PTO vintage",
  },
  {
    title: "SCE Schedule NBT, Sheet 23",
    url: "https://www.sce.com/sites/default/files/custom-files/PDF_Files/ELECTRIC_SCHEDULES_NBT.pdf",
    location: "Cal. PUC Sheet 87693-E; Advice 5228-E; effective February 15, 2024; annual settlement",
  },
  {
    title: "SCE Solar Export Pricing",
    url: "https://www.sce.com/customer-service-center/help-center/solar/solar-billing-plan/understanding-export-pricing",
    location: "Hourly EEC format and vintage explanation",
  },
  {
    title: "CPUC Net Energy Metering and Net Billing",
    url: "https://www.cpuc.ca.gov/NEM/",
    location: "Net Billing comparison and export-credit basis",
  },
] as const;

const nbtSourceUrl = "https://www.sce.com/sites/default/files/custom-files/PDF_Files/ELECTRIC_SCHEDULES_NBT.pdf";

// Each filed rule has its own sheet revision and effective date. This is rule
// evidence only: none of these records supplies a complete import or EEC rate.
export const sceVerifiedRules = [
  { utility: "SCE", planId: "NBT", ruleId: "residential-import-plan",
    version: "Cal. PUC Sheet 89744-E", effectiveFrom: "2025-04-23", effectiveTo: null,
    sourceUrl: nbtSourceUrl, sourceLocation: "Schedule NBT Sheet 2, Advice 5533-E",
    summary: "Residential NBT service uses the Prime option of TOU-D, subject to filed exceptions." },
  { utility: "SCE", planId: "NBT", ruleId: "metered-import-charges",
    version: "Cal. PUC Sheets 85350-E and 85351-E", effectiveFrom: "2023-03-01", effectiveTo: null,
    sourceUrl: nbtSourceUrl, sourceLocation: "Schedule NBT Sheets 3–4, Advice 4961-E / 4961-E-A",
    summary: "TOU imports and non-bypassable charges are assessed from metered imports under the otherwise applicable tariff." },
  { utility: "SCE", planId: "NBT", ruleId: "hourly-export-accrual",
    version: "Cal. PUC Sheet 87274-E", effectiveFrom: "2023-12-14", effectiveTo: null,
    sourceUrl: nbtSourceUrl, sourceLocation: "Schedule NBT Sheet 5, Advice 5170-E-A",
    summary: "Bundled EEC accrues from hourly exports and an hourly price, with separate generation and delivery components." },
  { utility: "SCE", planId: "NBT", ruleId: "credit-use-and-vintage",
    version: "Cal. PUC Sheet 85353-E", effectiveFrom: "2023-03-01", effectiveTo: null,
    sourceUrl: nbtSourceUrl, sourceLocation: "Schedule NBT Sheet 6, Advice 4961-E-A",
    summary: "Base EEC offsets eligible energy charges only; PTO date and eligibility determine the export price lock-in." },
  { utility: "SCE", planId: "NBT", ruleId: "annual-settlement",
    version: "Cal. PUC Sheet 87693-E", effectiveFrom: "2024-02-15", effectiveTo: null,
    sourceUrl: nbtSourceUrl, sourceLocation: "Schedule NBT Sheet 23, Advice 5228-E",
    summary: "Annual settlement can adjust, apply, and forfeit unused EEC under the filed sequence." },
] as const;

export type MonthlyEecApplication = {
  appliedToEnergyChargesUsd: number;
  remainingEnergyChargesUsd: number;
  unusedCreditCarriedUsd: number;
};

// Schedule NBT Sheet 6: base EEC may offset eligible energy charges only.
// This is one month's application, before annual settlement; the returned
// carry is not a cash payout and may later be forfeited under Sheet 23.
export function applySceMonthlyExportCredit(eligibleEnergyChargesUsd: number,
  earnedExportCreditUsd: number, carriedExportCreditUsd: number): MonthlyEecApplication {
  for (const value of [eligibleEnergyChargesUsd, earnedExportCreditUsd, carriedExportCreditUsd]) {
    if (!Number.isFinite(value) || value < 0) throw new Error("Monthly energy charges and credits must be nonnegative.");
  }
  const available = earnedExportCreditUsd + carriedExportCreditUsd;
  if (!Number.isFinite(available)) throw new Error("Monthly export credit exceeds supported range.");
  const appliedToEnergyChargesUsd = Math.min(eligibleEnergyChargesUsd, available);
  return {
    appliedToEnergyChargesUsd,
    remainingEnergyChargesUsd: eligibleEnergyChargesUsd - appliedToEnergyChargesUsd,
    unusedCreditCarriedUsd: available - appliedToEnergyChargesUsd,
  };
}

export type SceTariffStatus = {
  configured: boolean;
  annualEstimateSupported: false;
  utility: "SCE";
  planId: "TOU-D-PRIME";
  verifiedRateInputs: {
    component: "import" | "export";
    planId: string;
    version: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    verifiedAt: string;
    sourceUrl: string;
    sourceSha256: string;
  }[];
  missing: string[];
  sources: typeof sceRuleSources;
};

// Approve a digest only after its entire record has been reconciled with filed
// effective sheets and official hourly EEC data. No SCE price record has passed
// that review in M7B; an operator-supplied JSON file cannot self-certify.
const reviewedSceTariffDigests: ReadonlySet<string> = new Set();

function reviewedRecord(tariff: TariffVersion): boolean {
  const digest = createHash("sha256").update(JSON.stringify(tariff)).digest("hex");
  return reviewedSceTariffDigests.has(digest);
}

function officialReference(reference: TariffVersion["sourceReferences"][number]): boolean {
  let host: string;
  try { host = new URL(reference.url).hostname.toLowerCase(); } catch { return false; }
  if (reference.authority === "SCE") {
    return host === "sce.com" || host.endsWith(".sce.com") || host === "edisonintl.sharepoint.com";
  }
  return host === "cpuc.ca.gov" || host.endsWith(".cpuc.ca.gov");
}

export function getSceTariffStatus(catalog: TariffVersion[], onDate: string): SceTariffStatus {
  const candidates = catalog.filter((tariff) => tariff.utility === "SCE"
    && tariff.planId === "TOU-D-PRIME"
    && reviewedRecord(tariff)
    && tariff.sourceReferences.some((source) => source.component === "import" && officialReference(source))
    && tariff.sourceReferences.some((source) => source.component === "export" && officialReference(source)));
  const configured = hasCurrentTariff(candidates, onDate);
  const verifiedRateInputs: SceTariffStatus["verifiedRateInputs"] = [];
  if (sceTouPrimeSnapshot.effectiveFrom <= onDate) {
    verifiedRateInputs.push({
      component: "import", planId: sceTouPrimeSnapshot.planId,
      version: sceTouPrimeSnapshot.version,
      effectiveFrom: sceTouPrimeSnapshot.effectiveFrom,
      effectiveTo: sceTouPrimeSnapshot.effectiveTo,
      verifiedAt: sceTouPrimeSnapshot.verifiedAt,
      sourceUrl: sceTouPrimeSnapshot.source.url,
      sourceSha256: sceTouPrimeSnapshot.source.attachedFileSha256,
    });
  }
  if (sceNbt26Snapshot.effectiveFrom <= onDate && onDate < sceNbt26Snapshot.effectiveTo) {
    verifiedRateInputs.push({
      component: "export", planId: sceNbt26Snapshot.planId,
      version: sceNbt26Snapshot.version,
      effectiveFrom: sceNbt26Snapshot.effectiveFrom,
      effectiveTo: sceNbt26Snapshot.effectiveTo,
      verifiedAt: sceNbt26Snapshot.verifiedAt,
      sourceUrl: sceNbt26Snapshot.sourceUrl,
      sourceSha256: sceNbt26Snapshot.sourceSha256,
    });
  }
  const missing = configured ? [] : [verifiedRateInputs.length === 2
    ? "Complete customer-specific tariff configuration and confirmed NBT26 export vintage; the verified rate inputs are not a complete bill tariff."
    : "A filed TOU-D-PRIME import snapshot and hourly export schedule covering the selected date and customer's applicable vintage."];
  missing.push(
    "Customer supply arrangement, Original Permission to Operate date, export-credit eligibility, and billing period.",
    "Time-aligned household consumption and solar generation; annual kWh and monthly PVWatts totals cannot determine hourly imports or exports.",
    "Verified treatment of fixed charges, non-bypassable charges, credit banking, annual settlement, and net surplus compensation for the selected account.",
  );
  return {
    configured,
    annualEstimateSupported: false,
    utility: "SCE",
    planId: "TOU-D-PRIME",
    verifiedRateInputs,
    missing,
    sources: sceRuleSources,
  };
}
