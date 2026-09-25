import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

const amountSchema = z.number().finite().min(0).max(1_000_000).refine(
  (amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6,
  "Enter USD amounts with no more than two decimal places.",
);

export const billYearSchema = z.number().int().min(1900).refine(
  (year) => year <= new Date().getFullYear(), "Choose a historical bill year.",
);
export const monthlyBillsInputSchema = z.object({
  year: billYearSchema,
  monthlyAmounts: z.array(amountSchema).length(12),
}).strict();

export type MonthlyBillsInput = z.infer<typeof monthlyBillsInputSchema>;
export type MonthlyBillYear = { year: number; monthlyAmounts: number[] | null };

export interface MonthlyBillsStore {
  load(propertyId: string, year: number): Promise<{ propertyExists: boolean; bills: MonthlyBillYear }>;
  save(propertyId: string, input: MonthlyBillsInput): Promise<MonthlyBillYear | null>;
}

export function createPrismaMonthlyBillsStore(prisma: PrismaClient): MonthlyBillsStore {
  return {
    async load(propertyId, year) {
      const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
      if (!property) return { propertyExists: false, bills: { year, monthlyAmounts: null } };
      const records = await prisma.monthlyElectricityBill.findMany({
        where: { propertyId, year }, orderBy: { month: "asc" },
      });
      if (records.length === 0) return { propertyExists: true, bills: { year, monthlyAmounts: null } };
      if (records.length !== 12 || records.some((record, index) => record.month !== index + 1)) {
        throw new Error("Incomplete monthly bill history");
      }
      return { propertyExists: true, bills: {
        year, monthlyAmounts: records.map((record) => record.billAmount.toNumber()),
      } };
    },
    async save(propertyId, input) {
      const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
      if (!property) return null;
      try {
        await prisma.$transaction(input.monthlyAmounts.map((amount, index) => {
          const month = index + 1;
          const billAmount = new Prisma.Decimal(amount.toFixed(2));
          return prisma.monthlyElectricityBill.upsert({
            where: { propertyId_year_month: { propertyId, year: input.year, month } },
            create: { propertyId, year: input.year, month, billAmount },
            update: { billAmount },
          });
        }));
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return null;
        throw error;
      }
      return { year: input.year, monthlyAmounts: input.monthlyAmounts.map((amount) => Number(amount.toFixed(2))) };
    },
  };
}
