import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPrismaPropertyStore } from "./properties.js";
import { createPrismaRoofProfileStore } from "./roofProfiles.js";
import { createPrismaSolarSystemStore } from "./solarSystems.js";
import { createPvWattsEstimator } from "./pvwatts.js";
import { createPrismaMonthlyBillsStore } from "./monthlyBills.js";
import { createPrismaConsumptionStore } from "./consumption.js";
import { loadTariffCatalog, type TariffVersion } from "./economics.js";
import { createPrismaAnalysisRunStore } from "./analysisRuns.js";

const config = loadConfig();
const prisma = new PrismaClient();
let tariffCatalog: TariffVersion[] = [];
try {
  tariffCatalog = loadTariffCatalog(config.TARIFF_CATALOG_PATH);
} catch {
  // Invalid tariff input must not produce a monetary result or prevent other features from running.
  console.error("Tariff catalog could not be loaded; tariff data is not configured.");
}
const app = createApp(createPrismaPropertyStore(prisma), createPrismaRoofProfileStore(prisma), {
  systems: createPrismaSolarSystemStore(prisma),
  estimate: createPvWattsEstimator(config.PVWATTS_API_KEY),
}, createPrismaMonthlyBillsStore(prisma), {
  consumption: createPrismaConsumptionStore(prisma), tariffCatalog,
}, createPrismaAnalysisRunStore(prisma));

app.listen(config.PORT, () => {
  // Only static metadata is logged; connection strings and keys are never logged.
  console.info(`Property Solar Geo Intelligence API listening on port ${config.PORT} (${config.NODE_ENV})`);
});
