export type RoofGeometry = {
  type: "Polygon";
  coordinates: [number, number][][];
};

// Store a small, closed WGS84 GeoJSON outline. It is a visual aid, not an area measurement.
export function serializeRoofRings(rings: number[][][]): RoofGeometry {
  if (rings.length !== 1 || rings[0].length < 4 || rings[0].length > 101) {
    throw new Error("Draw one simple roof outline with 3–100 vertices.");
  }
  const coordinates = rings[0].map((point): [number, number] => {
    const [longitude, latitude] = point;
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error("The roof outline contains invalid coordinates.");
    }
    return [longitude, latitude];
  });
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]
    || new Set(coordinates.slice(0, -1).map(([x, y]) => `${x},${y}`)).size < 3) {
    throw new Error("Draw a closed roof outline with at least three distinct corners.");
  }
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  if (Math.max(...longitudes) - Math.min(...longitudes) > 0.02
    || Math.max(...latitudes) - Math.min(...latitudes) > 0.02) {
    throw new Error("The outline is too large for a single property.");
  }
  return { type: "Polygon", coordinates: [coordinates] };
}
