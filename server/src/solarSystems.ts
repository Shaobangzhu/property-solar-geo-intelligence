import { Prisma, PrismaClient, type SolarSystemConfiguration } from "@prisma/client";
import { z } from "zod";
import type { SolarEstimateInputs } from "./pvwatts.js";

export const solarSystemInputSchema = z.object({
  preset: z.enum(["small", "medium", "large", "custom"]),
  systemCapacityKw: z.number().finite().min(0.05).max(100),
  systemLossPercent: z.number().finite().min(-5).max(99),
  moduleType: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  arrayType: z.union([z.literal(0), z.literal(1)]),
}).strict().superRefine((value, context) => {
  const capacities = { small: 4, medium: 7, large: 10 } as const;
  if (value.preset !== "custom" && value.systemCapacityKw !== capacities[value.preset]) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Preset capacity does not match." });
  }
});

export type SolarSystemInput = z.infer<typeof solarSystemInputSchema>;
export type SolarSystemRecord = SolarSystemInput & {
  id: string;
  propertyId: string;
  createdAt: string;
  updatedAt: string;
};

export interface SolarSystemStore {
  getForProperty(propertyId: string): Promise<{ propertyExists: boolean; solarSystem: SolarSystemRecord | null }>;
  saveForProperty(propertyId: string, input: SolarSystemInput): Promise<SolarSystemRecord | null>;
  getEstimateContext(propertyId: string): Promise<
    { status: "propertyMissing" | "roofMissing" | "systemMissing" }
    | { status: "ready"; inputs: SolarEstimateInputs }
  >;
}

function toRecord(system: SolarSystemConfiguration): SolarSystemRecord {
  return {
    id: system.id,
    propertyId: system.propertyId,
    preset: system.preset as SolarSystemInput["preset"],
    systemCapacityKw: system.systemCapacityKw.toNumber(),
    systemLossPercent: system.systemLossPercent.toNumber(),
    moduleType: system.moduleType as SolarSystemInput["moduleType"],
    arrayType: system.arrayType as SolarSystemInput["arrayType"],
    createdAt: system.createdAt.toISOString(),
    updatedAt: system.updatedAt.toISOString(),
  };
}

export function createPrismaSolarSystemStore(prisma: PrismaClient): SolarSystemStore {
  return {
    async getForProperty(propertyId) {
      const property = await prisma.property.findUnique({
        where: { id: propertyId }, include: { solarSystem: true },
      });
      return property
        ? { propertyExists: true, solarSystem: property.solarSystem ? toRecord(property.solarSystem) : null }
        : { propertyExists: false, solarSystem: null };
    },
    async saveForProperty(propertyId, input) {
      const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
      if (!property) return null;
      try {
        const system = await prisma.solarSystemConfiguration.upsert({
          where: { propertyId }, create: { propertyId, ...input }, update: input,
        });
        return toRecord(system);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return null;
        throw error;
      }
    },
    async getEstimateContext(propertyId) {
      const property = await prisma.property.findUnique({
        where: { id: propertyId }, include: { roofProfile: true, solarSystem: true },
      });
      if (!property) return { status: "propertyMissing" };
      if (!property.roofProfile) return { status: "roofMissing" };
      if (!property.solarSystem) return { status: "systemMissing" };
      return { status: "ready", inputs: {
        latitude: property.latitude.toNumber(),
        longitude: property.longitude.toNumber(),
        tiltDegrees: property.roofProfile.tiltDegrees.toNumber(),
        azimuthDegrees: property.roofProfile.azimuthDegrees.toNumber(),
        preset: property.solarSystem.preset as SolarSystemInput["preset"],
        systemCapacityKw: property.solarSystem.systemCapacityKw.toNumber(),
        systemLossPercent: property.solarSystem.systemLossPercent.toNumber(),
        moduleType: property.solarSystem.moduleType as SolarSystemInput["moduleType"],
        arrayType: property.solarSystem.arrayType as SolarSystemInput["arrayType"],
      } };
    },
  };
}
