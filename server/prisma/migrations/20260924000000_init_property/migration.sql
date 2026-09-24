-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "normalizedAddress" TEXT NOT NULL,
    "displayAddress" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "propertyType" TEXT,
    "yearBuilt" INTEGER,
    "livingAreaSqFt" DECIMAL(12,2),
    "lotSizeSqFt" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Property_normalizedAddress_key" ON "Property"("normalizedAddress");
