CREATE TABLE "MonthlyElectricityBill" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "billAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonthlyElectricityBill_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MonthlyElectricityBill_month_check" CHECK ("month" BETWEEN 1 AND 12),
    CONSTRAINT "MonthlyElectricityBill_year_check" CHECK ("year" >= 1900),
    CONSTRAINT "MonthlyElectricityBill_billAmount_check" CHECK ("billAmount" >= 0)
);

CREATE UNIQUE INDEX "MonthlyElectricityBill_propertyId_year_month_key"
ON "MonthlyElectricityBill"("propertyId", "year", "month");

ALTER TABLE "MonthlyElectricityBill" ADD CONSTRAINT "MonthlyElectricityBill_propertyId_fkey"
FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
