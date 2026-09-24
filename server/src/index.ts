import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPrismaPropertyStore } from "./properties.js";
import { createPrismaRoofProfileStore } from "./roofProfiles.js";

const config = loadConfig();
const prisma = new PrismaClient();
const app = createApp(createPrismaPropertyStore(prisma), createPrismaRoofProfileStore(prisma));

app.listen(config.PORT, () => {
  // Only static metadata is logged; connection strings and keys are never logged.
  console.info(`Property Solar Geo Intelligence API listening on port ${config.PORT} (${config.NODE_ENV})`);
});
