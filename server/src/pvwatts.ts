import { z } from "zod";
import type { SolarSystemInput } from "./solarSystems.js";

const finiteOutput = z.number().finite().nonnegative();
const pvWattsResponseSchema = z.object({
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  outputs: z.object({
    ac_monthly: z.array(finiteOutput).length(12),
    ac_annual: finiteOutput,
    capacity_factor: finiteOutput.optional(),
  }),
  station_info: z.object({
    lat: z.number().finite().min(-90).max(90),
    lon: z.number().finite().min(-180).max(180),
    distance: finiteOutput.optional(),
    weather_data_source: z.string().optional(),
  }).optional(),
});

export type TwelveMonths = [number, number, number, number, number, number,
  number, number, number, number, number, number];

export type SolarProductionEstimate = {
  monthlyAcKwh: TwelveMonths;
  annualAcKwh: number;
  capacityFactor?: number;
  resource?: {
    latitude: number;
    longitude: number;
    distanceMeters?: number;
    source?: string;
  };
};

export type SolarEstimateInputs = SolarSystemInput & {
  latitude: number;
  longitude: number;
  tiltDegrees: number;
  azimuthDegrees: number;
};

export const solarEstimateInputsSchema = z.object({
  preset: z.enum(["small", "medium", "large", "custom"]),
  systemCapacityKw: z.number().finite().min(0.05).max(100),
  systemLossPercent: z.number().finite().min(-5).max(99),
  moduleType: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  arrayType: z.union([z.literal(0), z.literal(1)]),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  tiltDegrees: z.number().finite().min(0).max(90),
  azimuthDegrees: z.number().finite().min(0).lt(360),
}).strict().superRefine((value, context) => {
  const capacities = { small: 4, medium: 7, large: 10 } as const;
  if (value.preset !== "custom" && value.systemCapacityKw !== capacities[value.preset]) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Preset capacity does not match." });
  }
});

export type SolarEstimateResult = { estimate: SolarProductionEstimate; warnings: string[] };

export class SolarEstimateError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function buildPvWattsUrl(input: SolarEstimateInputs, apiKey: string): URL {
  const url = new URL("https://developer.nlr.gov/api/pvwatts/v8.json");
  const values = {
    api_key: apiKey,
    system_capacity: input.systemCapacityKw,
    losses: input.systemLossPercent,
    module_type: input.moduleType,
    array_type: input.arrayType,
    tilt: input.tiltDegrees,
    azimuth: input.azimuthDegrees,
    lat: input.latitude,
    lon: input.longitude,
    timeframe: "monthly",
  };
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, String(value));
  return url;
}

export function normalizePvWattsResponse(payload: unknown, apiKey: string): SolarEstimateResult {
  const parsed = pvWattsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new SolarEstimateError(502, "PVWatts returned an unexpected response. Try again later.");
  }
  if (parsed.data.errors?.length) {
    throw new SolarEstimateError(502, "PVWatts could not calculate an estimate for these inputs.");
  }
  const { outputs, station_info: station } = parsed.data;
  return {
    estimate: {
      monthlyAcKwh: outputs.ac_monthly as TwelveMonths,
      annualAcKwh: outputs.ac_annual,
      ...(outputs.capacity_factor === undefined ? {} : { capacityFactor: outputs.capacity_factor }),
      ...(station ? { resource: {
        latitude: station.lat,
        longitude: station.lon,
        ...(station.distance === undefined ? {} : { distanceMeters: station.distance }),
        ...(station.weather_data_source === undefined ? {} : { source: station.weather_data_source }),
      } } : {}),
    },
    warnings: (parsed.data.warnings ?? []).map((warning) => warning
      .replaceAll(apiKey, "[redacted]")
      .replaceAll(encodeURIComponent(apiKey), "[redacted]")
      .slice(0, 500)),
  };
}

export function createPvWattsEstimator(apiKey: string | undefined, fetcher: typeof fetch = fetch) {
  return async (input: SolarEstimateInputs): Promise<SolarEstimateResult> => {
    if (!apiKey) throw new SolarEstimateError(503, "PVWatts is not configured on the server.");
    const url = buildPvWattsUrl(input, apiKey);
    let response: Response;
    try {
      response = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new SolarEstimateError(502, "PVWatts could not be reached. Try again later.");
    }
    if (response.status === 429) {
      throw new SolarEstimateError(429, "PVWatts rate limit reached. Please try again later.");
    }
    if (response.status === 422) {
      throw new SolarEstimateError(422, "PVWatts rejected the estimate inputs. Check the solar assumptions.");
    }
    if (!response.ok) {
      throw new SolarEstimateError(502, "PVWatts is unavailable. Try again later.");
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new SolarEstimateError(502, "PVWatts returned an unexpected response. Try again later.");
    }
    return normalizePvWattsResponse(payload, apiKey);
  };
}
