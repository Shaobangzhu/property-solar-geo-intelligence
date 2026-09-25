# Utility economics methodology (M7B)

Reviewed September 25, 2026. The supplied SCE filings and NBT26 MIDAS file provide **verified, versioned price inputs** for a limited 2026 SCE scenario. They do not, by themselves, support a property-specific annual bill or savings estimate. The application keeps Estimated Annual Electricity Cost, Estimated Solar Value, Estimated Grid Import, Estimated Grid Export, and Estimated Export Credit labeled **ESTIMATE — Unavailable** until the required customer and time-aligned energy inputs are present. It never presents gross export-credit accrual as guaranteed savings or a cash payout.

## Source register and applicability

| Source | Verified record and effective scope | Use and limit |
| --- | --- | --- |
| User-supplied SCE_Schedule_TOU-D_Current_2026.pdf, Schedule TOU-D Sheet 6 | Revised Cal. P.U.C. Sheet 91200-E, Advice 5829-E, effective June 1, 2026 | Exact Option PRIME delivery and bundled-generation energy prices; separate Fixed Recovery Charge and Base Services Charge. This sheet does not cover January–May 2026. |
| Same filing, Sheets 7–9 | Sheets 91355-E, 91356-E, and 91357-E, Advice 5837-E, effective June 25, 2026 | Delivery-component breakdown, TOU periods, holidays, and season boundaries. Treat the combined reviewed snapshot as applicable no earlier than June 25, 2026. The attached filing does not provide all prior 2026 revisions or prove that no later revision applies to a future bill. |
| User-supplied ELECTRIC_SCHEDULES_NBT.pdf, Schedule NBT | Sheets 2–8 and 22–23 have their own sheet numbers, advice numbers, and effective dates; notably Sheet 2: 89744-E, Advice 5533-E, April 23, 2025; Sheet 5: 87274-E, Advice 5170-E-A, December 14, 2023; Sheet 6: 85353-E, Advice 4961-E-A, March 1, 2023; Sheets 22–23: 87692-E / 87693-E, Advice 5228-E, February 15, 2024 | Establishes eligible import plan, import/export treatment, EEC vintage and lock-in, credit restrictions, conditional ACC Plus, and settlement. Each rule retains its own effective date; there is no single effective date for this 42-sheet compilation. [SCE filed Schedule NBT](https://www.sce.com/sites/default/files/custom-files/PDF_Files/ELECTRIC_SCHEDULES_NBT.pdf). |
| User-supplied NBT26 MIDAS File.csv | RateName NBT26; RIN USCA-XXSC-NB26-0000 for generation and USCA-SCXX-NB26-0000 for delivery; Unit “export $/kWh”; 184,080 hourly records per component. Source-file SHA-256: 1f4f60dde4f5bca3a65e6132f41a7d170ed348b4f53ee0effcfb3a444f23f596. | Provides a 2026-vintage hourly EEC schedule. Its records span local calendar years 2026–2046; later values must not be treated as guaranteed for every customer. SCE's [export-pricing guide](https://www.sce.com/customer-service-center/help-center/solar/solar-billing-plan/understanding-export-pricing) identifies the RIN components, UTC timestamp columns, Pacific prevailing time in ValueName, and the nine-year lock-in qualification. |

The attachment names, sheet numbers, advice numbers, effective dates, RINs, and CSV checksum are the source/reference metadata for these reviewed inputs. The CSV is user supplied; the SCE page confirms its format and NBT26 meaning, but the public download redirected to SharePoint sign-in during review, so an independent download-byte comparison was unavailable. The original file should be retained for any later re-audit. These documents are evidence, not instructions to enroll a customer or to infer that a particular property qualifies.

The earlier TOU-D-PRIME fact sheet is a 2020 consumer explainer with relative price symbols, not current filed rates. The previously supplied [NEM 2.0 Bill Guide](https://www.sce.com/factsheet/NEM2.0BillGuide) describes a different billing program; its rules must not be substituted for NBT. [CPUC's NEM/NBT overview](https://www.cpuc.ca.gov/industries-and-topics/electrical-energy/demand-side-management/customer-generation/net-energy-metering-and-net-billing) explains the distinction between self-consumption and avoided-cost-based export credit.

## Verified 2026 Option PRIME import prices

The following are the **standard, non-CPP Option PRIME** energy prices printed on Schedule TOU-D Sheet 6, effective June 1, 2026, in dollars per kWh. Bundled service uses both Delivery Service Total and Generation UG. These are energy components, not a complete bill, and do not include customer-specific discounts, taxes, other applicable charges, or later tariff revisions.

| Season and TOU period | Delivery Service Total ($/kWh) | Generation UG ($/kWh) |
| --- | ---: | ---: |
| Summer on-peak | 0.29624 | 0.29667 |
| Summer mid-peak | 0.29624 | 0.10558 |
| Summer off-peak | 0.19649 | 0.07049 |
| Winter mid-peak | 0.30157 | 0.26489 |
| Winter off-peak | 0.18675 | 0.05958 |
| Winter super-off-peak | 0.18675 | 0.05958 |

The same sheet separately lists a Fixed Recovery Charge of $0.00619/kWh and a Base Services Charge of $0.794/meter/day. Sheet 7 details delivery components and exclusions. Their bill treatment cannot be silently folded into a single import rate. Generation UG applies to SCE bundled customers; Community Choice Aggregation or Direct Access generation charges and credits require the other provider's tariff.

Sheets 8–9 define summer as June 1 through September 30 and winter as October 1 through May 31. For Option PRIME, summer weekday on-peak is 4–9 p.m.; summer weekend/holiday 4–9 p.m. is mid-peak; all other summer hours are off-peak. In winter, 4–9 p.m. is mid-peak, 9 p.m.–8 a.m. is off-peak, and 8 a.m.–4 p.m. is super-off-peak for both weekdays and weekends/holidays. Sheet 9 lists eight holidays and the observed-Monday rule for a listed holiday that falls on Sunday. These period rules became effective June 25, 2026, in the supplied snapshot. Pacific time, including daylight-saving transitions, must be used when mapping metered intervals to periods.

## Verified NBT export and billing rules

For residential NBT service, Sheet 2 requires the Prime option of TOU-D, subject to its stated exception for customers without an eligible TOU option. Sheet 3 assesses non-bypassable charges on **metered grid imports**, with account-specific exemptions. Sheet 4 calculates bundled import energy charges from the otherwise applicable tariff's delivery and generation rates.

Sheet 5 calculates bundled base Energy Export Credits (EECs) from **hourly grid exports** and the applicable hourly EEC price. The NBT26 CSV separates generation and delivery prices; both components apply only to an eligible bundled customer. For CCA, Community Aggregation, or Direct Access, SCE's delivery component does not establish the separate provider's generation credit. The file's DateStart/TimeStart and DateEnd/TimeEnd are UTC, while ValueName describes the month, weekday/weekend class, and local hour in Pacific prevailing time. The 2026 calendar slice contains an hourly generation and delivery record for each of the year's 8,760 hours. Handle Pacific daylight-saving transitions and holidays explicitly when matching export intervals; do not assign a row by UTC clock hour alone.

The supplied CSV has `DayStart=0` and `DayEnd=0` in every row, although SCE's format guide describes day codes 1–8. The importer checks the actual UTC timestamps and Pacific `ValueName` labels, and does not infer a day type from those zero columns. It preserves distinct UTC records for both occurrences of the repeated fall hour.

Sheet 6 ties a nine-year EEC price lock-in to the customer's **Original Permission to Operate (PTO) Date** for qualifying customers whose Original PTO Date falls from April 15, 2023 through December 31, 2027, while the interconnection agreement and same-customer/same-party conditions continue. Opt-out, a nonqualifying new occupant, or expiration can change the applicable vintage. The NBT26 file is therefore not automatically the correct export schedule for a property, and its far-future rows do not create a universal price guarantee.

Sheets 6 and 22 allow base EECs to offset eligible energy charges in the calculation month and carry unused EECs within the Relevant Period. Base EECs **cannot** offset non-bypassable charges, minimum charges, demand charges, or fixed charges. Sheets 7–8 give conditional ACC Plus adders, including a 2026 vintage rate of $0.016/kWh for qualifying residential non-equity customers or $0.037/kWh for qualifying residential equity customers. Eligibility depends on PTO date, customer status, and other filed conditions; no ACC Plus value is applied without verified eligibility. Its allowable charge offsets and carryover differ from base EECs.

Sheet 23 defines the annual settlement and possible Energy Export Credit Adjustment. Unused base EEC can ultimately be forfeited after the specified offsets. Net Surplus Compensation uses a separately posted rate and eligibility rules; it cannot be inferred from the NBT26 hourly EEC file. Thus **gross EEC accrual**, **applied export credit**, **annual settlement**, and **cash compensation** are distinct values. An annual estimate requires the correct Relevant Period and monthly credit ledger, not just a sum of hourly EEC prices.

## Calculation boundary

For household consumption and solar generation that refer to the **same metered interval**:

    0 <= self-consumption <= min(household consumption, solar generation)
    grid import = household consumption - self-consumption
    grid export = solar generation - self-consumption

Import energy charge uses each interval's selected effective TOU period and applicable tariff components. Gross base EEC accrual uses each eligible hourly export multiplied by the correct vintage's component prices. Applied EEC is limited by eligible monthly charges and carryover. Estimated Solar Value would compare two consistently modeled scenarios for the same load and tariff, with and without solar, including the relevant bill rules. It is not equal to total generation times a retail rate or to gross EEC accrual.

The application currently stores one **annual household consumption assumption**, twelve historical **dollar bills**, and PVWatts **monthly** generation. Those values do not determine hourly self-consumption, grid imports, or grid exports. Historical dollars cannot be converted to precise consumption kWh. ArcGIS shadow visualization does not provide a measured loss profile. The backend's interval calculation is an energy-charge primitive for explicit co-timed intervals; it is not a complete SCE bill calculator.

## Remaining unsupported inputs and decisions

1. Confirm the property's billing program, SCE bundled versus CCA/Direct Access supply, actual import plan, Original PTO Date, EEC vintage and lock-in status, ACC Plus eligibility, CARE/FERA or other exemptions, and billing Relevant Period. Neither the property address nor PVWatts response supplies these facts.
2. Supply co-timed household meter imports/load and solar production, or a clearly documented and validated interval-modeling method. The annual consumption input and monthly PVWatts production cannot be spread across TOU hours by assumption.
3. For a full calendar-year 2026 estimate, obtain the effective prior TOU-D-PRIME sheets for January–May and any subsequent revisions. The combined supplied snapshot is verified as of June 25, 2026; it cannot be applied retroactively to all of 2026. Later-year estimates require later import schedules and applicability checks.
4. Implement and verify complete bill treatment for the Base Services Charge, Fixed Recovery Charge, non-bypassable charges and exemptions, applicable discounts or credits, taxes and riders, base EEC restrictions/rollover, conditional ACC Plus, Relevant Period settlement, and Net Surplus Compensation. Test against an authoritative worked example or redacted actual bill before exposing dollar results.
5. Reconcile the customer's actual EEC vintage and any separate generation provider's export-credit rules. The user-supplied NBT26 file alone cannot establish eligibility or CCA/Direct Access compensation.

These gaps keep all five annual results unavailable rather than displaying zeros or fabricated values. The UI should explain which source data and customer inputs are present and which are still needed. Synthetic calculation fixtures remain labeled **TEST DATA — NOT CURRENT SCE RATES** and never become runtime tariff data.
