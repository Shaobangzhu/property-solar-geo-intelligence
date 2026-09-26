import type { RoofGeometry } from "./roofGeometry";

export type Property = {
  id: string;
  normalizedAddress: string;
  displayAddress: string;
  latitude: number;
  longitude: number;
  propertyType: string | null;
  yearBuilt: number | null;
  livingAreaSqFt: number | null;
  lotSizeSqFt: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PropertyDetails = Pick<Property, "propertyType" | "yearBuilt" | "livingAreaSqFt" | "lotSizeSqFt">;

export type RoofProfileInput = {
  usableAreaSqFt: number | null;
  tiltDegrees: number;
  azimuthDegrees: number;
  estimatedShadingFactor: number | null;
  roofGeometryJson: RoofGeometry | null;
};

export type RoofProfile = RoofProfileInput & {
  id: string;
  propertyId: string;
  createdAt: string;
  updatedAt: string;
};

export type SolarSystemInput = {
  preset: "small" | "medium" | "large" | "custom";
  systemCapacityKw: number;
  systemLossPercent: number;
  moduleType: 0 | 1 | 2;
  arrayType: 0 | 1;
};

export type SolarSystem = SolarSystemInput & {
  id: string;
  propertyId: string;
  createdAt: string;
  updatedAt: string;
};

export type SolarProductionEstimate = {
  monthlyAcKwh: number[];
  annualAcKwh: number;
  capacityFactor?: number;
  resource?: { latitude: number; longitude: number; distanceMeters?: number; source?: string };
};

export type SolarEstimateResult = { estimate: SolarProductionEstimate; warnings: string[] };

export type MonthlyBillYear = { year: number; monthlyAmounts: number[] | null };

export type HouseholdConsumption = {
  id: string;
  propertyId: string;
  annualConsumptionKwh: number;
  createdAt: string;
  updatedAt: string;
};

async function sendJson<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("The local property service is unavailable. Check that the server is running.");
  }
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result
      && typeof result.error === "string" ? result.error : "The property request failed.";
    throw new Error(message);
  }
  return result as T;
}

export async function lookupProperty(address: string): Promise<Property | null> {
  const result = await sendJson<{ found: boolean; property: Property | null }>(
    "/api/properties/lookup", { address },
  );
  return result.found ? result.property : null;
}

export async function saveGeocodedProperty(input: {
  requestedAddress: string;
  displayAddress: string;
  latitude: number;
  longitude: number;
}): Promise<Property> {
  const result = await sendJson<{ property: Property }>("/api/properties", input);
  return result.property;
}

export async function updatePropertyDetails(id: string, details: PropertyDetails): Promise<Property> {
  const result = await sendJson<{ property: Property }>(`/api/properties/${encodeURIComponent(id)}`, details, "PATCH");
  return result.property;
}

export async function loadRoofProfile(propertyId: string): Promise<RoofProfile | null> {
  const result = await sendJson<{ roofProfile: RoofProfile | null }>(
    `/api/properties/${encodeURIComponent(propertyId)}/roof-profile`, undefined, "GET",
  );
  return result.roofProfile;
}

export async function saveRoofProfile(propertyId: string, input: RoofProfileInput): Promise<RoofProfile> {
  const result = await sendJson<{ roofProfile: RoofProfile }>(
    `/api/properties/${encodeURIComponent(propertyId)}/roof-profile`, input, "PUT",
  );
  return result.roofProfile;
}

export async function loadSolarSystem(propertyId: string): Promise<SolarSystem | null> {
  const result = await sendJson<{ solarSystem: SolarSystem | null }>(
    `/api/properties/${encodeURIComponent(propertyId)}/solar-system`, undefined, "GET",
  );
  return result.solarSystem;
}

export async function saveSolarSystem(propertyId: string, input: SolarSystemInput): Promise<SolarSystem> {
  const result = await sendJson<{ solarSystem: SolarSystem }>(
    `/api/properties/${encodeURIComponent(propertyId)}/solar-system`, input, "PUT",
  );
  return result.solarSystem;
}

export async function estimateSolarProduction(propertyId: string): Promise<SolarEstimateResult> {
  return sendJson<SolarEstimateResult>("/api/solar/estimate", { propertyId });
}

export async function estimateSolarPreview(propertyId: string, roofProfile: RoofProfileInput,
  solarSystem: SolarSystemInput, runId?: string): Promise<SolarEstimateResult> {
  return sendJson<SolarEstimateResult>("/api/solar/estimate-preview", {
    propertyId, roofProfile, solarSystem, ...(runId ? { runId } : {}),
  });
}

export async function loadMonthlyBills(propertyId: string, year: number): Promise<MonthlyBillYear> {
  return sendJson<MonthlyBillYear>(
    `/api/properties/${encodeURIComponent(propertyId)}/electricity-bills?year=${year}`, undefined, "GET",
  );
}

export async function saveMonthlyBills(propertyId: string, year: number,
  monthlyAmounts: number[]): Promise<MonthlyBillYear> {
  return sendJson<MonthlyBillYear>(
    `/api/properties/${encodeURIComponent(propertyId)}/electricity-bills`, { year, monthlyAmounts }, "PUT",
  );
}

export async function loadHouseholdConsumption(propertyId: string): Promise<HouseholdConsumption | null> {
  const result = await sendJson<{ consumption: HouseholdConsumption | null }>(
    `/api/properties/${encodeURIComponent(propertyId)}/consumption`, undefined, "GET",
  );
  return result.consumption;
}

export async function saveHouseholdConsumption(propertyId: string,
  annualConsumptionKwh: number): Promise<HouseholdConsumption> {
  const result = await sendJson<{ consumption: HouseholdConsumption }>(
    `/api/properties/${encodeURIComponent(propertyId)}/consumption`, { annualConsumptionKwh }, "PUT",
  );
  return result.consumption;
}

export type TariffStatus = {
  configured: boolean;
  annualEstimateSupported: boolean;
  utility: string;
  planId: string;
  verifiedRateInputs: {
    component: "import" | "export";
    planId: string;
    version: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    verifiedAt: string;
    sourceUrl: string;
    sourceSha256: string;
  }[];
  missing: string[];
  sources: { title: string; url: string; location: string }[];
};

export async function loadTariffStatus(): Promise<TariffStatus> {
  return sendJson<TariffStatus>("/api/economics/tariff-status", undefined, "GET");
}

export type AnalysisBills = { year: number; monthlyAmounts: number[] | null };

export type AnalysisTariffReference = {
  utility: string;
  planId: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
};

export type AnalysisEconomics = {
  estimatedAnnualElectricityCostUsd: number | null;
  estimatedAnnualSolarValueUsd: number | null;
  estimatedAnnualGridImportKwh: number | null;
  estimatedAnnualGridExportKwh: number | null;
  estimatedAnnualExportCreditUsd: number | null;
  estimatedAnnualSavingsUsd: number | null;
};

export type AnalysisRunInput = {
  propertyId: string;
  roofProfile: RoofProfileInput;
  solarSystem: SolarSystemInput;
  production: SolarEstimateResult;
  bills: AnalysisBills;
  annualConsumptionKwh: number | null;
  tariffReference: AnalysisTariffReference | null;
  economics: AnalysisEconomics | null;
};

export type AnalysisRun = AnalysisRunInput & {
  id: string;
  property: Property; // Frozen property snapshot, separate from its live relation.
  createdAt: string;
  updatedAt: string;
};

export type AnalysisRunSummary = {
  id: string;
  property: Pick<Property, "id" | "displayAddress">;
  systemCapacityKw: number;
  annualAcKwh: number;
  estimatedAnnualSavingsUsd: number | null;
  createdAt: string;
};

export async function listAnalysisRuns(): Promise<AnalysisRunSummary[]> {
  const result = await sendJson<{ runs: AnalysisRunSummary[] }>("/api/analysis-runs", undefined, "GET");
  return result.runs;
}

export async function getAnalysisRun(id: string): Promise<AnalysisRun> {
  const result = await sendJson<{ run: AnalysisRun }>(
    `/api/analysis-runs/${encodeURIComponent(id)}`, undefined, "GET",
  );
  return result.run;
}

export async function createAnalysisRun(input: AnalysisRunInput): Promise<AnalysisRun> {
  const result = await sendJson<{ run: AnalysisRun }>("/api/analysis-runs", input);
  return result.run;
}

export async function updateAnalysisRun(id: string, input: AnalysisRunInput): Promise<AnalysisRun> {
  const result = await sendJson<{ run: AnalysisRun }>(
    `/api/analysis-runs/${encodeURIComponent(id)}`, input, "PUT",
  );
  return result.run;
}

export async function deleteAnalysisRun(id: string): Promise<void> {
  await sendJson<void>(`/api/analysis-runs/${encodeURIComponent(id)}`, undefined, "DELETE");
}
