import { Prisma, PrismaClient, type AnalysisRun, type Property } from "@prisma/client";
import { z } from "zod";
import { billYearSchema, monthlyBillsInputSchema } from "./monthlyBills.js";
import { consumptionInputSchema } from "./consumption.js";
import { type PropertyRecord, toPropertyRecord } from "./properties.js";
import { roofProfileInputSchema } from "./roofProfiles.js";
import { solarSystemInputSchema } from "./solarSystems.js";

const finiteNonnegative = z.number().finite().nonnegative();
const money = z.number().finite().min(0).max(1_000_000_000).refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
  "Use no more than two decimal places.",
);
const signedMoney = z.number().finite().min(-1_000_000_000).max(1_000_000_000).refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
  "Use no more than two decimal places.",
);

const productionSchema = z.object({
  estimate: z.object({
    monthlyAcKwh: z.array(finiteNonnegative.max(10_000_000)).length(12),
    annualAcKwh: finiteNonnegative.max(100_000_000),
    capacityFactor: finiteNonnegative.max(100).optional(),
    resource: z.object({
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
      distanceMeters: finiteNonnegative.optional(),
      source: z.string().trim().min(1).max(200).optional(),
    }).strict().optional(),
  }).strict(),
  warnings: z.array(z.string().max(500)).max(50),
}).strict();

const tariffReferenceSchema = z.object({
  utility: z.string().trim().min(1).max(120),
  planId: z.string().trim().min(1).max(120),
  version: z.string().trim().min(1).max(120),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
}).strict();

const economicsSchema = z.object({
  estimatedAnnualElectricityCostUsd: money.nullable(),
  estimatedAnnualSolarValueUsd: money.nullable(),
  estimatedAnnualGridImportKwh: finiteNonnegative.max(100_000_000).nullable(),
  estimatedAnnualGridExportKwh: finiteNonnegative.max(100_000_000).nullable(),
  estimatedAnnualExportCreditUsd: money.nullable(),
  estimatedAnnualSavingsUsd: signedMoney.nullable(),
}).strict();

const analysisBillsSchema = z.object({
  year: billYearSchema,
  monthlyAmounts: monthlyBillsInputSchema.shape.monthlyAmounts.nullable(),
}).strict();

const analysisRunObjectSchema = z.object({
  propertyId: z.string().min(1).max(100),
  roofProfile: roofProfileInputSchema,
  solarSystem: solarSystemInputSchema,
  production: productionSchema,
  bills: analysisBillsSchema,
  annualConsumptionKwh: consumptionInputSchema.shape.annualConsumptionKwh.nullable(),
  tariffReference: tariffReferenceSchema.nullable(),
  economics: economicsSchema.nullable(),
}).strict();

export const analysisRunInputSchema = analysisRunObjectSchema.superRefine((input, context) => {
  const monthlyTotal = input.production.estimate.monthlyAcKwh.reduce((sum, value) => sum + value, 0);
  const annual = input.production.estimate.annualAcKwh;
  if (Math.abs(monthlyTotal - annual) > Math.max(12, annual * 0.01)) {
    context.addIssue({ code: z.ZodIssueCode.custom,
      message: "Annual production must agree with the twelve monthly values.", path: ["production", "estimate", "annualAcKwh"] });
  }
  // M7B does not yet provide a trusted annual economics calculation. Keep fields in the
  // snapshot shape, but never accept a client-authored tariff or dollar result as verified.
  if (input.economics !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom,
      message: "Annual economics results are not available yet.", path: ["economics"] });
  }
  if (input.tariffReference !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom,
      message: "A tariff reference is not available for saved annual results yet.", path: ["tariffReference"] });
  }
});

const propertySnapshotSchema = z.object({
  id: z.string(),
  normalizedAddress: z.string(),
  displayAddress: z.string(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  propertyType: z.string().nullable(),
  yearBuilt: z.number().int().nullable(),
  livingAreaSqFt: z.number().finite().nullable(),
  lotSizeSqFt: z.number().finite().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();

const snapshotSchema = analysisRunObjectSchema.omit({ propertyId: true })
  .extend({ property: propertySnapshotSchema });

export type AnalysisRunInput = z.infer<typeof analysisRunInputSchema>;
type AnalysisRunSnapshot = z.infer<typeof snapshotSchema>;
export type AnalysisRunRecord = AnalysisRunSnapshot & {
  id: string;
  propertyId: string;
  createdAt: string;
  updatedAt: string;
};
export type AnalysisRunSummary = {
  id: string;
  property: Pick<PropertyRecord, "id" | "displayAddress">;
  systemCapacityKw: number;
  annualAcKwh: number;
  estimatedAnnualSavingsUsd: number | null;
  createdAt: string;
};
export type UpdateAnalysisRunResult =
  | { status: "updated"; run: AnalysisRunRecord }
  | { status: "notFound" }
  | { status: "propertyMismatch" };

export interface AnalysisRunStore {
  list(): Promise<AnalysisRunSummary[]>;
  get(id: string): Promise<AnalysisRunRecord | null>;
  create(input: AnalysisRunInput): Promise<AnalysisRunRecord | null>;
  update(id: string, input: AnalysisRunInput): Promise<UpdateAnalysisRunResult>;
  delete(id: string): Promise<boolean>;
}

function snapshotFromInput(input: AnalysisRunInput, property: PropertyRecord): AnalysisRunSnapshot {
  return {
    property,
    roofProfile: input.roofProfile,
    solarSystem: input.solarSystem,
    production: input.production,
    bills: input.bills,
    annualConsumptionKwh: input.annualConsumptionKwh,
    tariffReference: input.tariffReference,
    economics: input.economics,
  };
}

function asJson(snapshot: AnalysisRunSnapshot): Prisma.InputJsonValue {
  // Strip optional undefined fields; Prisma JSON columns accept JSON values only.
  return JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue;
}

function toRecord(run: AnalysisRun): AnalysisRunRecord {
  const snapshot = snapshotSchema.parse(run.snapshot);
  return { id: run.id, propertyId: run.propertyId, ...snapshot,
    createdAt: run.createdAt.toISOString(), updatedAt: run.updatedAt.toISOString() };
}

function toSummary(run: AnalysisRun): AnalysisRunSummary {
  const snapshot = snapshotSchema.parse(run.snapshot);
  return {
    id: run.id,
    property: { id: snapshot.property.id, displayAddress: snapshot.property.displayAddress },
    systemCapacityKw: run.systemCapacityKw.toNumber(),
    annualAcKwh: run.annualAcKwh.toNumber(),
    estimatedAnnualSavingsUsd: run.estimatedAnnualSavingsUsd?.toNumber() ?? null,
    createdAt: run.createdAt.toISOString(),
  };
}

function values(input: AnalysisRunInput, property: PropertyRecord) {
  return {
    snapshot: asJson(snapshotFromInput(input, property)),
    systemCapacityKw: new Prisma.Decimal(input.solarSystem.systemCapacityKw.toFixed(3)),
    annualAcKwh: new Prisma.Decimal(input.production.estimate.annualAcKwh.toFixed(3)),
    estimatedAnnualSavingsUsd: input.economics?.estimatedAnnualSavingsUsd == null
      ? null : new Prisma.Decimal(input.economics.estimatedAnnualSavingsUsd.toFixed(2)),
  };
}

export function createPrismaAnalysisRunStore(prisma: PrismaClient): AnalysisRunStore {
  return {
    async list() {
      const rows = await prisma.analysisRun.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      return rows.map(toSummary);
    },
    async get(id) {
      const run = await prisma.analysisRun.findUnique({ where: { id } });
      return run ? toRecord(run) : null;
    },
    async create(input) {
      const validated = analysisRunInputSchema.parse(input);
      const property: Property | null = await prisma.property.findUnique({ where: { id: validated.propertyId } });
      if (!property) return null;
      try {
        const run = await prisma.analysisRun.create({ data: {
          propertyId: validated.propertyId,
          ...values(validated, toPropertyRecord(property)),
        } });
        return toRecord(run);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return null;
        throw error;
      }
    },
    async update(id, input) {
      const validated = analysisRunInputSchema.parse(input);
      const existing = await prisma.analysisRun.findUnique({ where: { id } });
      if (!existing) return { status: "notFound" };
      if (existing.propertyId !== validated.propertyId) return { status: "propertyMismatch" };
      const property = snapshotSchema.parse(existing.snapshot).property;
      try {
        const run = await prisma.analysisRun.update({ where: { id }, data: values(validated, property) });
        return { status: "updated", run: toRecord(run) };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return { status: "notFound" };
        }
        throw error;
      }
    },
    async delete(id) {
      try {
        await prisma.analysisRun.delete({ where: { id } });
        return true;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return false;
        throw error;
      }
    },
  };
}
