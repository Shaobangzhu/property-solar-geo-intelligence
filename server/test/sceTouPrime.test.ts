import { describe, expect, it } from "vitest";
import { isSceTouPrimeHoliday, quoteSceTouPrimeEnergy, sceTouPrimeSnapshot }
  from "../src/sceTouPrime.js";

describe("filed SCE TOU-D Option PRIME snapshot", () => {
  it("keeps the four filed sheet revisions and separate bill components identifiable", () => {
    expect(sceTouPrimeSnapshot.effectiveFrom).toBe("2026-06-25");
    expect(sceTouPrimeSnapshot.effectiveTo).toBeNull();
    expect(sceTouPrimeSnapshot.source.sheets.map((sheet) => sheet.calPucSheet))
      .toEqual(["91200-E", "91355-E", "91356-E", "91357-E"]);
    expect(sceTouPrimeSnapshot.source.attachedFileSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(sceTouPrimeSnapshot.separateCharges.baseServicesUsdPerMeterDay).toBe(0.794);
    expect(sceTouPrimeSnapshot.separateCharges.fixedRecoveryUsdPerKwh).toBe(0.00619);
    expect(sceTouPrimeSnapshot.separateCharges.mcamUsdPerKwh).toBe(0.00223);
  });

  it("uses filed summer weekday energy rates at the 4 p.m. and 9 p.m. boundaries", () => {
    expect(quoteSceTouPrimeEnergy("2026-06-25", 15)).toMatchObject({
      season: "summer", dayType: "weekday", period: "offPeak",
      deliveryUsdPerKwh: 0.19649, bundledGenerationUsdPerKwh: 0.07049,
      bundledTouEnergyUsdPerKwh: 0.26698,
    });
    expect(quoteSceTouPrimeEnergy("2026-06-25", 16)).toMatchObject({
      season: "summer", period: "onPeak",
      deliveryUsdPerKwh: 0.29624, bundledGenerationUsdPerKwh: 0.29667,
      bundledTouEnergyUsdPerKwh: 0.59291,
    });
    expect(quoteSceTouPrimeEnergy("2026-06-25", 20).period).toBe("onPeak");
    expect(quoteSceTouPrimeEnergy("2026-06-25", 21).period).toBe("offPeak");
  });

  it("uses mid-peak instead of on-peak on summer weekends and listed holidays", () => {
    expect(quoteSceTouPrimeEnergy("2026-06-27", 16)).toMatchObject({
      dayType: "weekend", period: "midPeak", bundledTouEnergyUsdPerKwh: 0.40182,
    });
    expect(quoteSceTouPrimeEnergy("2026-09-07", 16)).toMatchObject({
      dayType: "holiday", period: "midPeak", bundledTouEnergyUsdPerKwh: 0.40182,
    });
  });

  it("changes season on October 1 and uses the winter 8 a.m. and 4 p.m. boundaries", () => {
    expect(quoteSceTouPrimeEnergy("2026-09-30", 16)).toMatchObject({
      season: "summer", period: "onPeak", bundledTouEnergyUsdPerKwh: 0.59291,
    });
    expect(quoteSceTouPrimeEnergy("2026-10-01", 7)).toMatchObject({
      season: "winter", period: "offPeak", bundledTouEnergyUsdPerKwh: 0.24633,
    });
    expect(quoteSceTouPrimeEnergy("2026-10-01", 8)).toMatchObject({
      season: "winter", period: "superOffPeak", bundledTouEnergyUsdPerKwh: 0.24633,
    });
    expect(quoteSceTouPrimeEnergy("2026-10-01", 15).period).toBe("superOffPeak");
    expect(quoteSceTouPrimeEnergy("2026-10-01", 16)).toMatchObject({
      period: "midPeak", deliveryUsdPerKwh: 0.30157,
      bundledGenerationUsdPerKwh: 0.26489, bundledTouEnergyUsdPerKwh: 0.56646,
    });
    expect(quoteSceTouPrimeEnergy("2026-10-01", 21).period).toBe("offPeak");
  });

  it("observes Sunday holidays on Monday, without moving Saturday holidays to Friday", () => {
    expect(isSceTouPrimeHoliday("2027-07-04")).toBe(true);
    expect(isSceTouPrimeHoliday("2027-07-05")).toBe(true);
    expect(isSceTouPrimeHoliday("2026-07-03")).toBe(false);
    expect(isSceTouPrimeHoliday("2026-07-04")).toBe(true);
    expect(isSceTouPrimeHoliday("2026-02-16")).toBe(true); // Third Monday.
    expect(isSceTouPrimeHoliday("2026-05-25")).toBe(true); // Last Monday.
    expect(isSceTouPrimeHoliday("2026-11-26")).toBe(true); // Fourth Thursday.
  });

  it("rejects unsupported dates and malformed local hours", () => {
    expect(() => quoteSceTouPrimeEnergy("2026-06-24", 16)).toThrow(/does not cover/u);
    expect(() => quoteSceTouPrimeEnergy("2026-02-30", 16)).toThrow(/real local calendar date/u);
    expect(() => quoteSceTouPrimeEnergy("2026-06-25T16:00:00Z", 16)).toThrow(/YYYY-MM-DD/u);
    for (const hour of [-1, 24, 16.5, Number.NaN]) {
      expect(() => quoteSceTouPrimeEnergy("2026-06-25", hour)).toThrow(/Local hour/u);
    }
  });
});
