import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { createPrismaAnalysisRunStore, type AnalysisRunInput } from "../src/analysisRuns.js";

const input: AnalysisRunInput = {
  propertyId: "assigned-by-test",
  roofProfile: { usableAreaSqFt: 640, tiltDegrees: 25, azimuthDegrees: 180,
    estimatedShadingFactor: 0.1, roofGeometryJson: null },
  solarSystem: { preset: "small", systemCapacityKw: 4, systemLossPercent: 14,
    moduleType: 0, arrayType: 1 },
  production: { estimate: { monthlyAcKwh: [400, 450, 550, 600, 650, 700,
    750, 700, 650, 600, 500, 450], annualAcKwh: 7000 }, warnings: ["Weather station warning"] },
  bills: { year: new Date().getFullYear() - 1,
    monthlyAmounts: Array.from({ length: 12 }, (_, index) => 80 + index) },
  annualConsumptionKwh: 6000,
  tariffReference: null,
  economics: null,
};

describe.skipIf(process.env.RUN_DB_TESTS !== "1")("analysis run PostgreSQL integration", () => {
  it("persists multiple snapshots for one Property and updates only the intended run", async () => {
    const prisma = new PrismaClient();
    const property = await prisma.property.create({ data: {
      normalizedAddress: `m8-test-${randomUUID()}`,
      displayAddress: "Original saved address",
      latitude: new Prisma.Decimal("34.000000"), longitude: new Prisma.Decimal("-117.000000"),
    } });
    try {
      const runs = createPrismaAnalysisRunStore(prisma);
      const first = await runs.create({ ...input, propertyId: property.id });
      const blankBills = { year: new Date().getFullYear() - 2, monthlyAmounts: null };
      const second = await runs.create({ ...input, propertyId: property.id, bills: blankBills });
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first?.id).not.toBe(second?.id);
      expect((await runs.get(second!.id))?.bills).toEqual(blankBills);
      expect((await runs.list()).filter((run) => run.property.id === property.id)).toHaveLength(2);
      expect(await prisma.analysisRun.count({ where: { propertyId: property.id } })).toBe(2);
      expect(await runs.create({ ...input, propertyId: "missing-property" })).toBeNull();
      await expect(runs.create({ ...input, propertyId: property.id, production: {
        ...input.production, estimate: { ...input.production.estimate, annualAcKwh: 1 },
      } })).rejects.toThrow();
      expect(await prisma.analysisRun.count({ where: { propertyId: property.id } })).toBe(2);

      await prisma.property.update({ where: { id: property.id }, data: { displayAddress: "Edited live address" } });
      const changed = { ...input, propertyId: property.id,
        solarSystem: { ...input.solarSystem, preset: "custom" as const, systemCapacityKw: 6 },
        production: { ...input.production, estimate: { ...input.production.estimate,
          monthlyAcKwh: input.production.estimate.monthlyAcKwh.map((value) => value + 100),
          annualAcKwh: 8200 } } };
      const result = await runs.update(first!.id, changed);
      expect(result.status).toBe("updated");
      const updated = await runs.get(first!.id);
      expect(updated?.property.displayAddress).toBe("Original saved address");
      expect(updated?.production.estimate.monthlyAcKwh).toEqual(changed.production.estimate.monthlyAcKwh);
      expect(updated?.bills.monthlyAmounts).toEqual(input.bills.monthlyAmounts);
      expect(updated?.solarSystem.systemCapacityKw).toBe(6);
      expect((await runs.get(second!.id))?.solarSystem.systemCapacityKw).toBe(4);
      const blankUpdate = await runs.update(second!.id, { ...input, propertyId: property.id,
        bills: { year: new Date().getFullYear() - 3, monthlyAmounts: null } });
      expect(blankUpdate.status).toBe("updated");
      expect((await runs.get(second!.id))?.bills).toEqual({
        year: new Date().getFullYear() - 3, monthlyAmounts: null,
      });
      expect((await runs.update(first!.id, { ...input, propertyId: "another-property" })).status)
        .toBe("propertyMismatch");

      expect(await runs.delete(first!.id)).toBe(true);
      expect(await runs.delete(first!.id)).toBe(false);
      expect(await runs.get(first!.id)).toBeNull();
      expect(await prisma.analysisRun.count({ where: { propertyId: property.id } })).toBe(1);
    } finally {
      await prisma.property.delete({ where: { id: property.id } });
      expect(await prisma.analysisRun.count({ where: { propertyId: property.id } })).toBe(0);
      await prisma.$disconnect();
    }
  });
});
