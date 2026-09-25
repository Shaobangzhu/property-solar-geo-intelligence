CREATE TABLE "SolarSystemConfiguration" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "preset" TEXT NOT NULL,
    "systemCapacityKw" DECIMAL(10,3) NOT NULL,
    "systemLossPercent" DECIMAL(5,2) NOT NULL,
    "moduleType" INTEGER NOT NULL,
    "arrayType" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SolarSystemConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SolarSystemConfiguration_propertyId_key" ON "SolarSystemConfiguration"("propertyId");

ALTER TABLE "SolarSystemConfiguration" ADD CONSTRAINT "SolarSystemConfiguration_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
