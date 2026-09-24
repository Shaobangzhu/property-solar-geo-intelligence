import { Prisma, PrismaClient, type RoofProfile } from "@prisma/client";
import { z } from "zod";

const positionSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);

export const roofGeometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(positionSchema).min(4).max(101)).length(1),
}).strict().superRefine((geometry, context) => {
  const ring = geometry.coordinates[0];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "The polygon ring must be closed." });
  }
  if (new Set(ring.slice(0, -1).map(([x, y]) => `${x},${y}`)).size < 3) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "The polygon needs three distinct vertices." });
  }
  const longitudes = ring.map(([longitude]) => longitude);
  const latitudes = ring.map(([, latitude]) => latitude);
  if (Math.max(...longitudes) - Math.min(...longitudes) > 0.02
    || Math.max(...latitudes) - Math.min(...latitudes) > 0.02) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "The outline is too large for a single property." });
  }
});

export const roofProfileInputSchema = z.object({
  usableAreaSqFt: z.number().finite().positive().max(1_000_000).nullable(),
  tiltDegrees: z.number().finite().min(0).max(90),
  azimuthDegrees: z.number().finite().min(0).lt(360),
  estimatedShadingFactor: z.number().finite().min(0).max(1).nullable(),
  roofGeometryJson: roofGeometrySchema.nullable(),
}).strict();

export type RoofGeometry = z.infer<typeof roofGeometrySchema>;
export type RoofProfileInput = z.infer<typeof roofProfileInputSchema>;
export type RoofProfileRecord = RoofProfileInput & {
  id: string;
  propertyId: string;
  createdAt: string;
  updatedAt: string;
};

export interface RoofProfileStore {
  getForProperty(propertyId: string): Promise<{ propertyExists: boolean; roofProfile: RoofProfileRecord | null }>;
  saveForProperty(propertyId: string, input: RoofProfileInput): Promise<RoofProfileRecord | null>;
}

function toRecord(profile: RoofProfile): RoofProfileRecord {
  return {
    id: profile.id,
    propertyId: profile.propertyId,
    usableAreaSqFt: profile.usableAreaSqFt?.toNumber() ?? null,
    tiltDegrees: profile.tiltDegrees.toNumber(),
    azimuthDegrees: profile.azimuthDegrees.toNumber(),
    estimatedShadingFactor: profile.estimatedShadingFactor?.toNumber() ?? null,
    roofGeometryJson: profile.roofGeometryJson as RoofGeometry | null,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export function createPrismaRoofProfileStore(prisma: PrismaClient): RoofProfileStore {
  return {
    async getForProperty(propertyId) {
      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        include: { roofProfile: true },
      });
      return property
        ? { propertyExists: true, roofProfile: property.roofProfile ? toRecord(property.roofProfile) : null }
        : { propertyExists: false, roofProfile: null };
    },
    async saveForProperty(propertyId, input) {
      const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
      if (!property) return null;
      const data = {
        usableAreaSqFt: input.usableAreaSqFt,
        tiltDegrees: input.tiltDegrees,
        azimuthDegrees: input.azimuthDegrees,
        estimatedShadingFactor: input.estimatedShadingFactor,
        roofGeometryJson: input.roofGeometryJson ?? Prisma.DbNull,
      };
      try {
        const profile = await prisma.roofProfile.upsert({
          where: { propertyId },
          create: { propertyId, ...data },
          update: data,
        });
        return toRecord(profile);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return null;
        throw error;
      }
    },
  };
}
