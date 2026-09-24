-- CreateTable
CREATE TABLE "RoofProfile" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "usableAreaSqFt" DECIMAL(12,2),
    "tiltDegrees" DECIMAL(5,2) NOT NULL,
    "azimuthDegrees" DECIMAL(5,2) NOT NULL,
    "estimatedShadingFactor" DECIMAL(4,3),
    "roofGeometryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoofProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoofProfile_propertyId_key" ON "RoofProfile"("propertyId");

-- AddForeignKey
ALTER TABLE "RoofProfile" ADD CONSTRAINT "RoofProfile_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
