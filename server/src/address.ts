export function normalizeAddress(address: string): string {
  return address.trim().replace(/\s+/gu, " ").toLowerCase();
}
