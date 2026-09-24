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
