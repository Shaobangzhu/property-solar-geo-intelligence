import type { Property } from "../propertyApi";

export type PropertyLocation = Pick<Property, "id" | "displayAddress" | "latitude" | "longitude">;

export function hasValidCoordinates(property: PropertyLocation | null): property is PropertyLocation {
  return property !== null
    && Number.isFinite(property.latitude)
    && Number.isFinite(property.longitude)
    && property.latitude >= -90 && property.latitude <= 90
    && property.longitude >= -180 && property.longitude <= 180;
}
