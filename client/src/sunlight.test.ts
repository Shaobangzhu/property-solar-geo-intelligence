import { describe, expect, it } from "vitest";
import { createDefaultSunlightSettings, parseSunlightSettings, type SunlightSettings } from "./sunlight";

const settings: SunlightSettings = {
  date: "2026-06-21",
  time: "13:15",
  utcOffsetHours: -7,
  shadowsEnabled: true,
};

describe("sunlight settings", () => {
  it("defaults to the device-local date at noon with shadows off", () => {
    const now = new Date("2026-09-24T04:30:00.000Z");
    const result = createDefaultSunlightSettings(now);
    expect(result.date).toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
    expect(result.time).toBe("12:00");
    expect(result.utcOffsetHours).toBe(-now.getTimezoneOffset() / 60);
    expect(result.shadowsEnabled).toBe(false);
  });

  it("converts property-local wall time to an instant and a bounded 30-minute analysis window", () => {
    const parsed = parseSunlightSettings(settings);
    expect(parsed.instant.toISOString()).toBe("2026-06-21T20:15:00.000Z");
    expect(parsed.calendarDate.getFullYear()).toBe(2026);
    expect(parsed.calendarDate.getMonth()).toBe(5);
    expect(parsed.calendarDate.getDate()).toBe(21);
    expect(parsed.calendarDate.getHours()).toBe(12);
    expect(parsed.startTimeOfDay).toBe(13 * 3_600_000 + 15 * 60_000);
    expect(parsed.endTimeOfDay).toBe(13 * 3_600_000 + 45 * 60_000);
    expect(parsed.utcOffsetHours).toBe(-7);
  });

  it("caps the shadow window at midnight", () => {
    const parsed = parseSunlightSettings({ ...settings, time: "23:45", utcOffsetHours: 5.75 });
    expect(parsed.startTimeOfDay).toBe(23 * 3_600_000 + 45 * 60_000);
    expect(parsed.endTimeOfDay).toBe(24 * 3_600_000);
    expect(parsed.instant.toISOString()).toBe("2026-06-21T18:00:00.000Z");
  });

  it("accepts leap day and rejects invalid calendar dates", () => {
    expect(parseSunlightSettings({ ...settings, date: "2024-02-29" }).calendarDate.getDate()).toBe(29);
    for (const date of ["2025-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "0000-01-01", "June 21"]) {
      expect(() => parseSunlightSettings({ ...settings, date })).toThrow("Enter a valid date.");
    }
  });

  it("rejects invalid times and offsets", () => {
    for (const time of ["24:00", "9:00", "12:60", "", "12:00:00"]) {
      expect(() => parseSunlightSettings({ ...settings, time })).toThrow("Enter a time");
    }
    for (const utcOffsetHours of [-12.25, 14.25, 5.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => parseSunlightSettings({ ...settings, utcOffsetHours })).toThrow("UTC offset");
    }
    expect(parseSunlightSettings({ ...settings, utcOffsetHours: -12 }).utcOffsetHours).toBe(-12);
    expect(parseSunlightSettings({ ...settings, utcOffsetHours: 14 }).utcOffsetHours).toBe(14);
  });
});
