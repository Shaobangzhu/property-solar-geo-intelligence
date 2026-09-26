import { Prisma, PrismaClient, type Property } from "@prisma/client";

export type PropertyDetails = {
  propertyType: string | null;
  yearBuilt: number | null;
  livingAreaSqFt: number | null;
  lotSizeSqFt: number | null;
};

export type PropertyRecord = PropertyDetails & {
  id: string;
  normalizedAddress: string;
  displayAddress: string;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
};

export type NewProperty = {
  normalizedAddress: string;
  displayAddress: string;
  latitude: number;
  longitude: number;
};

export interface PropertyStore {
  findById(id: string): Promise<PropertyRecord | null>;
  findByAddress(normalizedAddress: string): Promise<PropertyRecord | null>;
  createIfAbsent(input: NewProperty): Promise<{ property: PropertyRecord; created: boolean }>;
  updateDetails(id: string, details: PropertyDetails): Promise<PropertyRecord | null>;
}

export function toPropertyRecord(property: Property): PropertyRecord {
  return {
    id: property.id,
    normalizedAddress: property.normalizedAddress,
    displayAddress: property.displayAddress,
    latitude: property.latitude.toNumber(),
    longitude: property.longitude.toNumber(),
    propertyType: property.propertyType,
    yearBuilt: property.yearBuilt,
    livingAreaSqFt: property.livingAreaSqFt?.toNumber() ?? null,
    lotSizeSqFt: property.lotSizeSqFt?.toNumber() ?? null,
    createdAt: property.createdAt.toISOString(),
    updatedAt: property.updatedAt.toISOString(),
  };
}

export function createPrismaPropertyStore(prisma: PrismaClient): PropertyStore {
  return {
    async findById(id) {
      const property = await prisma.property.findUnique({ where: { id } });
      return property ? toPropertyRecord(property) : null;
    },
    async findByAddress(normalizedAddress) {
      const property = await prisma.property.findUnique({ where: { normalizedAddress } });
      return property ? toPropertyRecord(property) : null;
    },
    async createIfAbsent(input) {
      const existing = await prisma.property.findUnique({
        where: { normalizedAddress: input.normalizedAddress },
      });
      if (existing) return { property: toPropertyRecord(existing), created: false };

      try {
        const property = await prisma.property.create({ data: input });
        return { property: toPropertyRecord(property), created: true };
      } catch (error) {
        // Another request may have inserted the same normalized address meanwhile.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const property = await prisma.property.findUnique({
            where: { normalizedAddress: input.normalizedAddress },
          });
          if (property) return { property: toPropertyRecord(property), created: false };
        }
        throw error;
      }
    },
    async updateDetails(id, details) {
      try {
        const property = await prisma.property.update({ where: { id }, data: details });
        return toPropertyRecord(property);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return null;
        }
        throw error;
      }
    },
  };
}
