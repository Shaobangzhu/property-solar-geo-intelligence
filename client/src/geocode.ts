export type StoredGeocode = {
  displayAddress: string;
  latitude: number;
  longitude: number;
};

export type GeocodeErrorKind = "no-match" | "ambiguous" | "service" | "configuration";

export class GeocodeError extends Error {
  constructor(public readonly kind: GeocodeErrorKind, message: string) {
    super(message);
    this.name = "GeocodeError";
  }
}

type Candidate = {
  address: string;
  location: { x: number; y: number };
  score: number;
  attributes?: { Addr_type?: string };
};

const GEOCODE_URL = "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";
const ADDRESS_TYPES = new Set(["PointAddress", "Subaddress", "StreetAddress"]);

function isCandidate(value: unknown): value is Candidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Candidate>;
  return typeof candidate.address === "string" && candidate.address.trim().length > 0
    && typeof candidate.score === "number" && Number.isFinite(candidate.score)
    && typeof candidate.location?.x === "number" && Number.isFinite(candidate.location.x)
    && typeof candidate.location?.y === "number" && Number.isFinite(candidate.location.y)
    && candidate.location.x >= -180 && candidate.location.x <= 180
    && candidate.location.y >= -90 && candidate.location.y <= 90;
}

export async function geocodeStoredAddress(
  address: string,
  apiKey = import.meta.env.VITE_ARCGIS_API_KEY,
): Promise<StoredGeocode> {
  if (!apiKey?.trim()) {
    throw new GeocodeError("configuration", "ArcGIS geocoding is not configured. Add the client API key.");
  }

  const parameters = new URLSearchParams({
    f: "json",
    SingleLine: address,
    outFields: "Addr_type",
    outSR: "4326",
    maxLocations: "5",
    forStorage: "true",
    token: apiKey,
  });

  let response: Response;
  try {
    response = await fetch(GEOCODE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: parameters,
    });
  } catch {
    throw new GeocodeError("service", "ArcGIS geocoding could not be reached. Please try again.");
  }
  if (!response.ok) {
    throw new GeocodeError("service", "ArcGIS geocoding is unavailable. Check the API key and try again.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GeocodeError("service", "ArcGIS geocoding returned an unreadable response.");
  }
  if (!payload || typeof payload !== "object" || "error" in payload || !("candidates" in payload)
    || !Array.isArray(payload.candidates)) {
    throw new GeocodeError("service", "ArcGIS rejected stored geocoding. Check that the API key is valid and permits stored geocoding.");
  }

  const candidates = payload.candidates.filter(isCandidate)
    .filter((candidate) => ADDRESS_TYPES.has(candidate.attributes?.Addr_type ?? ""))
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 90) {
    throw new GeocodeError("no-match", "No precise residential address was found. Add city, state, and postal code, then try again.");
  }
  const rival = candidates.find((candidate) => candidate !== best
    && candidate.score >= best.score - 3
    && candidate.address.toLowerCase() !== best.address.toLowerCase());
  if (rival) {
    throw new GeocodeError("ambiguous", "Multiple addresses match. Enter a more specific street address, city, and postal code.");
  }

  return {
    displayAddress: best.address.trim(),
    latitude: best.location.y,
    longitude: best.location.x,
  };
}
