"""Import the user-supplied SCE NBT26 MIDAS CSV into a checked 2026 TS module.

Usage: python3 server/scripts/importSceNbt26.py '/path/to/NBT26 MIDAS File.csv'

The pinned digest makes a changed SCE file a deliberate review event. The source
format guide is https://www.sce.com/customer-service-center/help-center/solar/solar-billing-plan/understanding-export-pricing.
"""

from __future__ import annotations

import csv
import hashlib
import re
import sys
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zoneinfo import ZoneInfo

SOURCE_SHA256 = "1f4f60dde4f5bca3a65e6132f41a7d170ed348b4f53ee0effcfb3a444f23f596"
SOURCE_FORMAT_URL = (
    "https://www.sce.com/customer-service-center/help-center/solar/"
    "solar-billing-plan/understanding-export-pricing"
)
HEADERS = [
    "RIN", "RateName", "DateStart", "TimeStart", "DateEnd", "TimeEnd",
    "DayStart", "DayEnd", "ValueName", "Value", "Unit", "RateType", "Sector",
]
GENERATION_RIN = "USCA-XXSC-NB26-0000"
DELIVERY_RIN = "USCA-SCXX-NB26-0000"
RINS = (GENERATION_RIN, DELIVERY_RIN)
START_UTC = datetime(2026, 1, 1, 8, tzinfo=timezone.utc)
END_UTC = datetime(2027, 1, 1, 8, tzinfo=timezone.utc)
HOURS = 8760
PACIFIC = ZoneInfo("America/Los_Angeles")
VALUE_NAME = re.compile(r"^([A-Z][a-z]{2}) (Weekday|Weekend) HS(\d{1,2})$")
TIME_START = re.compile(r"^(\d{1,2}):00:00$")
EXPECTED_WEEKDAY_HOLIDAY_LABELS = {
    "2026-01-01", "2026-02-16", "2026-05-25", "2026-09-07",
    "2026-11-11", "2026-11-26", "2026-12-25",
}
OUTPUT = Path(__file__).resolve().parents[1] / "src/data/sceNbt26_2026.ts"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rate_literal(value: Decimal) -> str:
    if not value.is_finite() or value < 0:
        raise ValueError("NBT26 export price must be finite and nonnegative")
    if value.as_tuple().exponent < -5:
        raise ValueError("NBT26 export price has unexpected precision")
    return format(value, ".5f")


def load_2026(path: Path) -> tuple[dict[str, list[str]], list[str]]:
    rates: dict[str, list[str | None]] = {rin: [None] * HOURS for rin in RINS}
    labels: dict[str, list[str | None]] = {rin: [None] * HOURS for rin in RINS}
    holidays: set[str] = set()
    selected_rows = 0

    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != HEADERS:
            raise ValueError("NBT26 CSV header differs from the reviewed source")

        for row_number, row in enumerate(reader, start=2):
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"Malformed CSV row {row_number}")
            if row["RateName"] != "NBT26" or row["RIN"] not in RINS:
                raise ValueError(f"Unexpected vintage or RIN on row {row_number}")
            if row["Unit"] != "export $/kWh" or row["RateType"] != "TOU" or row["Sector"] != "All":
                raise ValueError(f"Unexpected rate unit or category on row {row_number}")
            # This reviewed file has zero in both day columns, despite the SCE
            # format guide describing day codes 1-8. Do not infer weekdays here.
            if row["DayStart"] != "0" or row["DayEnd"] != "0":
                raise ValueError(f"Unexpected day code on row {row_number}")
            if row["DateStart"] != row["DateEnd"]:
                raise ValueError(f"Interval crosses a UTC date on row {row_number}")
            start_match = TIME_START.fullmatch(row["TimeStart"])
            if start_match is None:
                raise ValueError(f"Invalid UTC start time on row {row_number}")
            hour = int(start_match.group(1))
            if hour > 23 or row["TimeEnd"] != f"{hour}:59:59":
                raise ValueError(f"Invalid hourly UTC end time on row {row_number}")
            try:
                utc_date = datetime.strptime(row["DateStart"], "%m/%d/%Y")
            except ValueError as error:
                raise ValueError(f"Invalid UTC date on row {row_number}") from error
            utc_start = utc_date.replace(hour=hour, tzinfo=timezone.utc)
            local_start = utc_start.astimezone(PACIFIC)
            if local_start.year != 2026:
                continue
            if not START_UTC <= utc_start < END_UTC:
                raise ValueError(f"2026 local hour outside expected UTC coverage on row {row_number}")

            value_name = VALUE_NAME.fullmatch(row["ValueName"])
            if value_name is None:
                raise ValueError(f"Invalid value name on row {row_number}")
            month_name, day_label, local_hour_text = value_name.groups()
            if month_name != local_start.strftime("%b") or int(local_hour_text) != local_start.hour:
                raise ValueError(f"UTC/Pacific month or hour mismatch on row {row_number}")
            local_date = local_start.date().isoformat()
            expected_day_label = (
                "Weekend" if local_start.weekday() >= 5
                or local_date in EXPECTED_WEEKDAY_HOLIDAY_LABELS else "Weekday"
            )
            if day_label != expected_day_label:
                raise ValueError(f"Weekday/weekend/holiday label mismatch on row {row_number}")
            if local_start.weekday() < 5 and day_label == "Weekend":
                holidays.add(local_date)

            try:
                value = rate_literal(Decimal(row["Value"]))
            except (InvalidOperation, ValueError) as error:
                raise ValueError(f"Invalid export price on row {row_number}") from error
            index = int((utc_start - START_UTC).total_seconds() // 3600)
            rin = row["RIN"]
            if rates[rin][index] is not None:
                raise ValueError(f"Duplicate {rin} UTC hour on row {row_number}")
            rates[rin][index] = value
            labels[rin][index] = row["ValueName"]
            selected_rows += 1

    if selected_rows != HOURS * 2:
        raise ValueError(f"Expected {HOURS * 2} selected rows, received {selected_rows}")
    if holidays != EXPECTED_WEEKDAY_HOLIDAY_LABELS:
        raise ValueError("2026 holiday labels differ from the reviewed source")
    if any(value is None for component in rates.values() for value in component):
        raise ValueError("Missing NBT26 UTC hour")
    if labels[GENERATION_RIN] != labels[DELIVERY_RIN]:
        raise ValueError("Generation and delivery hour labels differ")

    return {rin: [value for value in rates[rin] if value is not None] for rin in RINS}, sorted(holidays)


def array_source(name: str, values: list[str]) -> str:
    lines = [f"export const {name}: readonly number[] = Object.freeze(["]
    for index in range(0, len(values), 12):
        lines.append("  " + ", ".join(values[index:index + 12]) + ",")
    lines.append("]);")
    return "\n".join(lines)


def write_module(rates: dict[str, list[str]], holidays: list[str]) -> None:
    source = "\n".join([
        "// Generated by server/scripts/importSceNbt26.py from the pinned, user-supplied SCE MIDAS CSV.",
        "// Do not edit rate literals by hand. Coverage is local 2026, indexed by UTC hour.",
        "// Prices are export credit components, not an electricity bill or annual savings estimate.",
        f'export const sceNbt26SourceSha256 = "{SOURCE_SHA256}";',
        "export const sceNbt26Metadata = {",
        '  utility: "SCE",',
        '  planId: "NBT",',
        '  vintage: "NBT26",',
        '  sourceFileName: "NBT26 MIDAS File.csv",',
        f'  sourceFormatGuideUrl: "{SOURCE_FORMAT_URL}",',
        '  rateUnit: "USD/kWh",',
        '  intervalTimeZone: "UTC",',
        '  localTimeZone: "America/Los_Angeles",',
        '  localCoverageStart: "2026-01-01",',
        '  localCoverageEndExclusive: "2027-01-01",',
        '  utcCoverageStart: "2026-01-01T08:00:00Z",',
        '  utcCoverageEndExclusive: "2027-01-01T08:00:00Z",',
        '  hoursPerComponent: 8760,',
        f'  generationRin: "{GENERATION_RIN}",',
        f'  deliveryRin: "{DELIVERY_RIN}",',
        "  weekdayDatesLabeledWeekend: [" + ", ".join(f'"{day}"' for day in holidays) + "],",
        "} as const;",
        "",
        array_source("sceNbt26Generation2026", rates[GENERATION_RIN]),
        "",
        array_source("sceNbt26Delivery2026", rates[DELIVERY_RIN]),
        "",
    ])
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(source, encoding="utf-8")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: importSceNbt26.py '/path/to/NBT26 MIDAS File.csv'")
    source = Path(sys.argv[1])
    if sha256_file(source) != SOURCE_SHA256:
        raise SystemExit("Source SHA-256 differs from the reviewed NBT26 file; review before updating it.")
    rates, holidays = load_2026(source)
    write_module(rates, holidays)
    print(f"Wrote {OUTPUT} with {HOURS} UTC hours for each NBT26 export component.")


if __name__ == "__main__":
    main()
