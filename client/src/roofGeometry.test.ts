import { describe, expect, it } from "vitest";
import { serializeRoofRings } from "./roofGeometry";

const ring = [
  [-117.182, 34.055, 10],
  [-117.1819, 34.055, 10],
  [-117.1819, 34.0551, 10],
  [-117.182, 34.055, 10],
];

describe("roof outline serialization", () => {
  it("stores a closed WGS84 GeoJSON polygon without elevation", () => {
    expect(serializeRoofRings([ring])).toEqual({
      type: "Polygon",
      coordinates: [[
        [-117.182, 34.055],
        [-117.1819, 34.055],
        [-117.1819, 34.0551],
        [-117.182, 34.055],
      ]],
    });
  });

  it.each([
    [ring.slice(0, 3)],
    [[...ring.slice(0, 3), [-117.183, 34.055]]],
    [[[181, 34], [181.001, 34], [181.001, 34.001], [181, 34]]],
    [[[0, 0], [1, 0], [1, 1], [0, 0]]],
  ])("rejects invalid or oversized outlines", (rings) => {
    expect(() => serializeRoofRings([rings])).toThrow();
  });
});
