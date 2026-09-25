CREATE TABLE "HouseholdConsumption" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "annualConsumptionKwh" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HouseholdConsumption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HouseholdConsumption_annualConsumptionKwh_check" CHECK ("annualConsumptionKwh" >= 0)
);

CREATE UNIQUE INDEX "HouseholdConsumption_propertyId_key" ON "HouseholdConsumption"("propertyId");

ALTER TABLE "HouseholdConsumption" ADD CONSTRAINT "HouseholdConsumption_propertyId_fkey"
FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
