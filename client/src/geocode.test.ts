import { afterEach, describe, expect, it, vi } from "vitest";
import { GeocodeError, geocodeStoredAddress } from "./geocode";

const candidate = {
  address: "380 New York St, Redlands, CA 92373",
  score: 100,
  location: { x: -117.1817, y: 34.0556 },
  attributes: { Addr_type: "PointAddress" },
};

afterEach(() => vi.unstubAllGlobals());

describe("stored ArcGIS geocoding", () => {
  it("requests stored results and returns an address-level match", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [candidate] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await geocodeStoredAddress("380 New York St, Redlands, CA", "test-key");
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("findAddressCandidates");
    expect(options.method).toBe("POST");
    const body = new URLSearchParams(options.body as string);
    expect(body.get("forStorage")).toBe("true");
    expect(body.get("outSR")).toBe("4326");
    expect(result).toEqual({
      displayAddress: candidate.address,
      latitude: 34.0556,
      longitude: -117.1817,
    });
  });

  it("returns no-match for results without a precise address", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] }),
    }));
    await expect(geocodeStoredAddress("Unknown address", "test-key"))
      .rejects.toMatchObject({ kind: "no-match" } satisfies Partial<GeocodeError>);
  });

  it("returns ambiguity for similarly ranked different addresses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [candidate, { ...candidate, address: "382 New York St, Redlands, CA", score: 99 }] }),
    }));
    await expect(geocodeStoredAddress("New York St", "test-key"))
      .rejects.toMatchObject({ kind: "ambiguous" } satisfies Partial<GeocodeError>);
  });

  it("reports a service error without exposing ArcGIS response details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: { message: "SECRET" } }),
    }));
    await expect(geocodeStoredAddress("380 New York St", "test-key"))
      .rejects.toMatchObject({ kind: "service" } satisfies Partial<GeocodeError>);
  });
});
