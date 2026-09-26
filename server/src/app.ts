import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { normalizeAddress } from "./address.js";
import type { PropertyStore } from "./properties.js";
import { roofProfileInputSchema, type RoofProfileStore } from "./roofProfiles.js";
import { SolarEstimateError, solarEstimateInputsSchema, type SolarEstimateInputs, type SolarEstimateResult } from "./pvwatts.js";
import { solarSystemInputSchema, type SolarSystemStore } from "./solarSystems.js";
import { billYearSchema, monthlyBillsInputSchema, type MonthlyBillsStore } from "./monthlyBills.js";
import { consumptionInputSchema, type ConsumptionStore } from "./consumption.js";
import type { TariffVersion } from "./economics.js";
import { getSceTariffStatus, sceLocalDate } from "./sceTariff.js";
import { analysisRunInputSchema, type AnalysisRunStore } from "./analysisRuns.js";

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

export type EconomicsApiDependencies = {
  consumption: ConsumptionStore;
  tariffCatalog: TariffVersion[];
};

export function createApp(properties: PropertyStore, roofProfiles: RoofProfileStore,
  solar?: SolarApiDependencies, monthlyBills?: MonthlyBillsStore, economics?: EconomicsApiDependencies,
  analysisRuns?: AnalysisRunStore) {
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

  app.post("/api/solar/estimate-preview", async (request, response) => {
    if (!solar) { response.status(503).json({ error: "Solar estimation is unavailable." }); return; }
    const parsed = z.object({
      propertyId: z.string().min(1).max(100),
      runId: z.string().min(1).max(100).optional(),
      roofProfile: roofProfileInputSchema,
      solarSystem: solarSystemInputSchema,
    }).strict().safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Check the roof and solar assumptions and try again." });
      return;
    }
    let coordinates: { latitude: number; longitude: number };
    if (parsed.data.runId) {
      if (!analysisRuns) { response.status(503).json({ error: "Analysis history is unavailable." }); return; }
      const run = await analysisRuns.get(parsed.data.runId);
      if (!run) { response.status(404).json({ error: "Analysis not found." }); return; }
      if (run.propertyId !== parsed.data.propertyId) {
        response.status(409).json({ error: "The analysis belongs to a different property." });
        return;
      }
      coordinates = { latitude: run.property.latitude, longitude: run.property.longitude };
    } else {
      const property = await properties.findById(parsed.data.propertyId);
      if (!property) { response.status(404).json({ error: "Property not found." }); return; }
      coordinates = { latitude: property.latitude, longitude: property.longitude };
    }
    const inputs = solarEstimateInputsSchema.safeParse({
      ...parsed.data.solarSystem,
      ...coordinates,
      tiltDegrees: parsed.data.roofProfile.tiltDegrees,
      azimuthDegrees: parsed.data.roofProfile.azimuthDegrees,
    });
    if (!inputs.success) {
      response.status(422).json({ error: "The property coordinates or solar assumptions are invalid." });
      return;
    }
    try {
      response.json(await solar.estimate(inputs.data));
    } catch (error) {
      if (error instanceof SolarEstimateError) { response.status(error.status).json({ error: error.message }); return; }
      throw error;
    }
  });

  app.get("/api/properties/:id/electricity-bills", async (request, response) => {
    if (!monthlyBills) { response.status(503).json({ error: "Electricity bills are unavailable." }); return; }
    const year = billYearSchema.safeParse(Number(request.query.year));
    if (!year.success || typeof request.query.year !== "string" || !/^\d{4}$/u.test(request.query.year)) {
      response.status(400).json({ error: "Choose a valid historical bill year." });
      return;
    }
    const result = await monthlyBills.load(String(request.params.id), year.data);
    if (!result.propertyExists) { response.status(404).json({ error: "Property not found." }); return; }
    response.json(result.bills);
  });

  app.put("/api/properties/:id/electricity-bills", async (request, response) => {
    if (!monthlyBills) { response.status(503).json({ error: "Electricity bills are unavailable." }); return; }
    const parsed = monthlyBillsInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Enter twelve valid USD bill amounts for the selected year." });
      return;
    }
    const result = await monthlyBills.save(String(request.params.id), parsed.data);
    if (!result) { response.status(404).json({ error: "Property not found." }); return; }
    response.json(result);
  });

  app.get("/api/properties/:id/consumption", async (request, response) => {
    if (!economics) { response.status(503).json({ error: "Consumption assumptions are unavailable." }); return; }
    const result = await economics.consumption.getForProperty(String(request.params.id));
    if (!result.propertyExists) { response.status(404).json({ error: "Property not found." }); return; }
    response.json({ consumption: result.consumption });
  });

  app.put("/api/properties/:id/consumption", async (request, response) => {
    if (!economics) { response.status(503).json({ error: "Consumption assumptions are unavailable." }); return; }
    const parsed = consumptionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Enter a valid annual household consumption in kWh." });
      return;
    }
    const consumption = await economics.consumption.saveForProperty(String(request.params.id), parsed.data);
    if (!consumption) { response.status(404).json({ error: "Property not found." }); return; }
    response.json({ consumption });
  });

  app.get("/api/economics/tariff-status", (_request, response) => {
    response.json(getSceTariffStatus(economics?.tariffCatalog ?? [], sceLocalDate(new Date())));
  });

  app.get("/api/analysis-runs", async (_request, response) => {
    if (!analysisRuns) { response.status(503).json({ error: "Analysis history is unavailable." }); return; }
    response.json({ runs: await analysisRuns.list() });
  });

  app.get("/api/analysis-runs/:id", async (request, response) => {
    if (!analysisRuns) { response.status(503).json({ error: "Analysis history is unavailable." }); return; }
    const run = await analysisRuns.get(String(request.params.id));
    if (!run) { response.status(404).json({ error: "Analysis not found." }); return; }
    response.json({ run });
  });

  app.post("/api/analysis-runs", async (request, response) => {
    if (!analysisRuns) { response.status(503).json({ error: "Analysis history is unavailable." }); return; }
    const parsed = analysisRunInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "The analysis snapshot is incomplete or invalid. Check the property, roof, system, and production results." });
      return;
    }
    const run = await analysisRuns.create(parsed.data);
    if (!run) { response.status(404).json({ error: "Property not found." }); return; }
    response.status(201).json({ run });
  });

  app.put("/api/analysis-runs/:id", async (request, response) => {
    if (!analysisRuns) { response.status(503).json({ error: "Analysis history is unavailable." }); return; }
    const parsed = analysisRunInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "The analysis snapshot is incomplete or invalid. Check the property, roof, system, and production results." });
      return;
    }
    const result = await analysisRuns.update(String(request.params.id), parsed.data);
    if (result.status === "notFound") { response.status(404).json({ error: "Analysis not found." }); return; }
    if (result.status === "propertyMismatch") {
      response.status(409).json({ error: "An analysis cannot be moved to another property." });
      return;
    }
    response.json({ run: result.run });
  });

  app.delete("/api/analysis-runs/:id", async (request, response) => {
    if (!analysisRuns) { response.status(503).json({ error: "Analysis history is unavailable." }); return; }
    if (!await analysisRuns.delete(String(request.params.id))) {
      response.status(404).json({ error: "Analysis not found." });
      return;
    }
    response.status(204).send();
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
    if (typeof error === "object" && error !== null && "type" in error
      && error.type === "entity.too.large") {
      response.status(413).json({ error: "Request body is too large." });
      return;
    }
    // Neither error messages nor request bodies are logged: either may contain secrets.
    console.error("Unhandled API error", error instanceof Error ? error.name : "unknown error");
    response.status(503).json({ error: "Property service unavailable. Check the local database." });
  });

  return app;
}
