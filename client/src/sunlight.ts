export type SunlightSettings = {
  date: string;
  time: string;
  utcOffsetHours: number;
  shadowsEnabled: boolean;
};

const MINUTES_IN_DAY = 24 * 60;
const MILLISECONDS_IN_MINUTE = 60_000;
const ANALYSIS_WINDOW_MINUTES = 30;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function createDefaultSunlightSettings(now = new Date()): SunlightSettings {
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: "12:00",
    utcOffsetHours: -now.getTimezoneOffset() / 60,
    shadowsEnabled: false,
  };
}

export function parseSunlightSettings(settings: SunlightSettings): {
  instant: Date;
  calendarDate: Date;
  startTimeOfDay: number;
  endTimeOfDay: number;
  utcOffsetHours: number;
} {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(settings.date);
  if (!dateMatch) {
    throw new Error("Enter a valid date.");
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error("Enter a valid date.");
  }

  const utcMidnight = new Date(0);
  utcMidnight.setUTCHours(0, 0, 0, 0);
  utcMidnight.setUTCFullYear(year, month - 1, day);
  if (utcMidnight.getUTCFullYear() !== year || utcMidnight.getUTCMonth() !== month - 1
    || utcMidnight.getUTCDate() !== day) {
    throw new Error("Enter a valid date.");
  }

  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(settings.time);
  if (!timeMatch) {
    throw new Error("Enter a time from 00:00 to 23:59.");
  }

  const offset = settings.utcOffsetHours;
  if (!Number.isFinite(offset) || offset < -12 || offset > 14 || !Number.isInteger(offset * 4)) {
    throw new Error("UTC offset must be from −12 to +14 hours in 15-minute steps.");
  }

  const minutes = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
  const calendarDate = new Date(0);
  calendarDate.setFullYear(year, month - 1, day);
  calendarDate.setHours(12, 0, 0, 0);

  return {
    instant: new Date(utcMidnight.getTime() + minutes * MILLISECONDS_IN_MINUTE
      - offset * 60 * MILLISECONDS_IN_MINUTE),
    calendarDate,
    startTimeOfDay: minutes * MILLISECONDS_IN_MINUTE,
    endTimeOfDay: Math.min(minutes + ANALYSIS_WINDOW_MINUTES, MINUTES_IN_DAY)
      * MILLISECONDS_IN_MINUTE,
    utcOffsetHours: offset,
  };
}
