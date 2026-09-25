import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { createPrismaMonthlyBillsStore } from "../src/monthlyBills.js";

describe.skipIf(process.env.RUN_DB_TESTS !== "1")("monthly bill PostgreSQL integration", () => {
  it("keeps one row per month and rolls back a failed twelve-month save", async () => {
    const prisma = new PrismaClient();
    const property = await prisma.property.create({ data: {
      normalizedAddress: `m6-test-${randomUUID()}`,
      displayAddress: "M6 database test property",
      latitude: new Prisma.Decimal("34.000000"), longitude: new Prisma.Decimal("-117.000000"),
    } });
    try {
      const bills = createPrismaMonthlyBillsStore(prisma);
      const year = new Date().getFullYear() - 1;
      const first = Array.from({ length: 12 }, (_, index) => index * 10);
      await bills.save(property.id, { year, monthlyAmounts: first });
      const edited = [99.99, ...first.slice(1)];
      await bills.save(property.id, { year, monthlyAmounts: edited });
      expect((await bills.load(property.id, year)).bills.monthlyAmounts).toEqual(edited);
      expect(await prisma.monthlyElectricityBill.count({ where: { propertyId: property.id, year } })).toBe(12);
      await expect(prisma.monthlyElectricityBill.create({ data: {
        propertyId: property.id, year, month: 1, billAmount: new Prisma.Decimal("1.00"),
      } })).rejects.toMatchObject({ code: "P2002" });

      const invalid = [...edited];
      invalid[5] = -1;
      await expect(bills.save(property.id, { year, monthlyAmounts: invalid })).rejects.toThrow();
      expect((await bills.load(property.id, year)).bills.monthlyAmounts).toEqual(edited);
    } finally {
      await prisma.property.delete({ where: { id: property.id } });
      await prisma.$disconnect();
    }
  });
});
