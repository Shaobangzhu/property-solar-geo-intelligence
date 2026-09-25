import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { normalizeAddress } from "./address.js";
import type { PropertyStore } from "./properties.js";
import { roofProfileInputSchema, type RoofProfileStore } from "./roofProfiles.js";
import { SolarEstimateError, solarEstimateInputsSchema, type SolarEstimateInputs, type SolarEstimateResult } from "./pvwatts.js";
import { solarSystemInputSchema, type SolarSystemStore } from "./solarSystems.js";

const addressSchema = z.string().trim().min(5).max(200);
const lookupSchema = z.object({ address: addressSchema }).strict();
const coordinateSchema = z.number().finite();
const createSchema = z.object({
  requestedAddress: addressSchema,
  displayAddress: addressSchema,
  latitude: coordinateSchema.min(-90).max(90),
  longitude: coordinateSchema.min(-180).max(180),
}).strict();
const detailsSchema = z.object({
  propertyType: z.string().trim().min(1).max(80).nullable(),
  yearBuilt: z.number().int().min(1600).max(new Date().getFullYear() + 1).nullable(),
  livingAreaSqFt: z.number().finite().positive().max(1_000_000).nullable(),
  lotSizeSqFt: z.number().finite().positive().max(100_000_000).nullable(),
}).strict();

export type SolarApiDependencies = {
  systems: SolarSystemStore;
  estimate: (inputs: SolarEstimateInputs) => Promise<SolarEstimateResult>;
};

export function createApp(properties: PropertyStore, roofProfiles: RoofProfileStore, solar?: SolarApiDependencies) {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.post("/api/properties/lookup", async (request, response) => {
    const parsed = lookupSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Enter a valid property address (5–200 characters)." });
      return;
    }
    const property = await properties.findByAddress(normalizeAddress(parsed.data.address));
    response.json({ found: property !== null, property });
  });

  app.post("/api/properties", async (request, response) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "The geocoded address or coordinates are invalid." });
      return;
    }
    const { requestedAddress, ...geocode } = parsed.data;
    const result = await properties.createIfAbsent({
      normalizedAddress: normalizeAddress(requestedAddress),
      ...geocode,
    });
    response.status(result.created ? 201 : 200).json(result);
  });

  app.patch("/api/properties/:id", async (request, response) => {
    const parsed = detailsSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Check the optional property details and try again." });
      return;
    }
    const property = await properties.updateDetails(String(request.params.id), parsed.data);
    if (!property) {
      response.status(404).json({ error: "Property not found." });
      return;
    }
    response.json({ property });
  });

  app.get("/api/properties/:id/roof-profile", async (request, response) => {
    const result = await roofProfiles.getForProperty(String(request.params.id));
    if (!result.propertyExists) {
      response.status(404).json({ error: "Property not found." });
      return;
    }
    response.json({ roofProfile: result.roofProfile });
  });

  app.put("/api/properties/:id/roof-profile", async (request, response) => {
    const parsed = roofProfileInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Check the roof assumptions and polygon outline, then try again." });
      return;
    }
    const roofProfile = await roofProfiles.saveForProperty(String(request.params.id), parsed.data);
    if (!roofProfile) {
      response.status(404).json({ error: "Property not found." });
      return;
    }
    response.json({ roofProfile });
  });

  app.get("/api/properties/:id/solar-system", async (request, response) => {
    if (!solar) { response.status(503).json({ error: "Solar estimation is unavailable." }); return; }
    const result = await solar.systems.getForProperty(String(request.params.id));
    if (!result.propertyExists) { response.status(404).json({ error: "Property not found." }); return; }
    response.json({ solarSystem: result.solarSystem });
  });

  app.put("/api/properties/:id/solar-system", async (request, response) => {
    if (!solar) { response.status(503).json({ error: "Solar estimation is unavailable." }); return; }
    const parsed = solarSystemInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Check the solar system settings and try again." });
      return;
    }
    const solarSystem = await solar.systems.saveForProperty(String(request.params.id), parsed.data);
    if (!solarSystem) { response.status(404).json({ error: "Property not found." }); return; }
    response.json({ solarSystem });
  });

  app.post("/api/solar/estimate", async (request, response) => {
    if (!solar) { response.status(503).json({ error: "Solar estimation is unavailable." }); return; }
    const parsed = z.object({ propertyId: z.string().min(1).max(100) }).strict().safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Select a valid property." }); return; }
    const context = await solar.systems.getEstimateContext(parsed.data.propertyId);
    if (context.status === "propertyMissing") { response.status(404).json({ error: "Property not found." }); return; }
    if (context.status === "roofMissing") { response.status(409).json({ error: "Save a Roof Profile before estimating production." }); return; }
    if (context.status === "systemMissing") { response.status(409).json({ error: "Save a Solar System before estimating production." }); return; }
    if (context.status !== "ready") { response.status(422).json({ error: "Saved solar inputs are incomplete." }); return; }
    const inputs = solarEstimateInputsSchema.safeParse(context.inputs);
    if (!inputs.success) { response.status(422).json({ error: "Saved solar inputs are invalid. Check the property, roof, and system settings." }); return; }
    try {
      const result = await solar.estimate(inputs.data);
      response.json(result);
    } catch (error) {
      if (error instanceof SolarEstimateError) { response.status(error.status).json({ error: error.message }); return; }
      throw error;
    }
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });

  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    void next;
    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({ error: "Invalid JSON request." });
      return;
    }
    // Neither error messages nor request bodies are logged: either may contain secrets.
    console.error("Unhandled API error", error instanceof Error ? error.name : "unknown error");
    response.status(503).json({ error: "Property service unavailable. Check the local database." });
  });

  return app;
}
