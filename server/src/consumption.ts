import { Prisma, PrismaClient, type HouseholdConsumption } from "@prisma/client";
import { z } from "zod";

const kwhSchema = z.number().finite().min(0).max(10_000_000).refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
  "Use no more than two decimal places.",
);

export const consumptionInputSchema = z.object({ annualConsumptionKwh: kwhSchema }).strict();
export type ConsumptionInput = z.infer<typeof consumptionInputSchema>;
export type ConsumptionRecord = ConsumptionInput & {
  id: string;
  propertyId: string;
  createdAt: string;
  updatedAt: string;
};

export interface ConsumptionStore {
  getForProperty(propertyId: string): Promise<{ propertyExists: boolean; consumption: ConsumptionRecord | null }>;
  saveForProperty(propertyId: string, input: ConsumptionInput): Promise<ConsumptionRecord | null>;
}

function toRecord(value: HouseholdConsumption): ConsumptionRecord {
  return {
    id: value.id,
    propertyId: value.propertyId,
    annualConsumptionKwh: value.annualConsumptionKwh.toNumber(),
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

export function createPrismaConsumptionStore(prisma: PrismaClient): ConsumptionStore {
  return {
    async getForProperty(propertyId) {
      const property = await prisma.property.findUnique({
        where: { id: propertyId }, include: { consumption: true },
      });
      return property
        ? { propertyExists: true, consumption: property.consumption ? toRecord(property.consumption) : null }
        : { propertyExists: false, consumption: null };
    },
    async saveForProperty(propertyId, input) {
      const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
      if (!property) return null;
      try {
        const annualConsumptionKwh = new Prisma.Decimal(input.annualConsumptionKwh.toFixed(2));
        const result = await prisma.householdConsumption.upsert({
          where: { propertyId },
          create: { propertyId, annualConsumptionKwh },
          update: { annualConsumptionKwh },
        });
        return toRecord(result);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return null;
        throw error;
      }
    },
  };
}
