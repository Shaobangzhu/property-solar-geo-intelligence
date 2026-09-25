import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { createPrismaConsumptionStore } from "../src/consumption.js";

describe.skipIf(process.env.RUN_DB_TESTS !== "1")("household consumption PostgreSQL integration", () => {
  it("saves and updates one current kWh assumption per property", async () => {
    const prisma = new PrismaClient();
    let propertyId: string | null = null;
    try {
      const property = await prisma.property.create({ data: {
        normalizedAddress: `m7a-test-${randomUUID()}`,
        displayAddress: "M7A database test property",
        latitude: new Prisma.Decimal("34.000000"), longitude: new Prisma.Decimal("-117.000000"),
      } });
      propertyId = property.id;
      const store = createPrismaConsumptionStore(prisma);
      expect((await store.getForProperty(property.id)).consumption).toBeNull();
      const first = await store.saveForProperty(property.id, { annualConsumptionKwh: 6200.25 });
      const updated = await store.saveForProperty(property.id, { annualConsumptionKwh: 7100.5 });
      expect(updated?.id).toBe(first?.id);
      expect((await store.getForProperty(property.id)).consumption?.annualConsumptionKwh).toBe(7100.5);
      expect(await prisma.householdConsumption.count({ where: { propertyId: property.id } })).toBe(1);
    } finally {
      if (propertyId) await prisma.property.delete({ where: { id: propertyId } });
      await prisma.$disconnect();
    }
  });
});
