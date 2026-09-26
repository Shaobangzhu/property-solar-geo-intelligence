CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "systemCapacityKw" DECIMAL(10,3) NOT NULL,
    "annualAcKwh" DECIMAL(14,3) NOT NULL,
    "estimatedAnnualSavingsUsd" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AnalysisRun_systemCapacityKw_check" CHECK ("systemCapacityKw" > 0),
    CONSTRAINT "AnalysisRun_annualAcKwh_check" CHECK ("annualAcKwh" >= 0)
);

CREATE INDEX "AnalysisRun_propertyId_createdAt_idx" ON "AnalysisRun"("propertyId", "createdAt");
CREATE INDEX "AnalysisRun_createdAt_idx" ON "AnalysisRun"("createdAt");

ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_propertyId_fkey"
FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
