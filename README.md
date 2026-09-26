# Property Solar Geo Intelligence

Local-first Web GIS Proof of Concept for evaluating rooftop solar potential for one residential property at a time.

## Current scope: M8 Saved Analysis and History

The React/Vite frontend checks a local PostgreSQL property registry first, then uses ArcGIS stored geocoding for a new address. It saves the address and coordinates through the Express API and shows the Property Summary. After loading a property, the page shows an interactive ArcGIS Map or terrain-backed 3D scene with a target marker. A Roof Profile stores user-adjustable planning assumptions and an optional visual roof outline. The Sunlight & Shadow panel lets you visually explore the 3D scene at different dates and times. PVWatts estimates monthly solar generation, and historical bill entry records actual monthly bill dollars. The Economics panel records a separate annual household consumption assumption and waits for verified tariff and time-aligned energy data before showing any dollar estimate. **Save Analysis** stores a run-specific snapshot in PostgreSQL; **History** lets you view, edit, search, and delete saved runs.

### Prerequisites

- Node.js 24 or later
- Docker with the Docker Compose plugin for the dedicated local PostgreSQL database

### Configure environment variables

Copy the examples if the local files do not already exist, then set local values. Do not commit the resulting `.env` files.

```sh
cp -n .env.example .env
cp -n client/.env.example client/.env
cp -n server/.env.example server/.env
```

Set `PSGI_POSTGRES_USER` and `PSGI_POSTGRES_PASSWORD` in the repository-root `.env`. Use a credential dedicated to this project. Set `server/.env` `DATABASE_URL` with the same user and password, using `postgresql://<user>:<password>@127.0.0.1:5433/property_solar_geo_intelligence?schema=public`. Set `client/.env` `VITE_ARCGIS_API_KEY` to an ArcGIS API key with **stored geocoding**, basemap, and elevation privileges. Set `server/.env` `PVWATTS_API_KEY` for backend-only production estimates. A missing key leaves property and roof features available and returns a clear error when an estimate is requested. All real `.env` files are ignored by Git.

## Local Database

PostgreSQL runs in Docker as **`psgi-postgresql`**, using the **`property_solar_geo_intelligence`** database and Docker named volume **`psgi_postgres_data`**. It listens on container port 5432 and local host port **5433** (`127.0.0.1:5433`). The volume survives `docker compose down` and normal container recreation. This project does **not** reuse the Chaoran Property Intelligence PostgreSQL instance.

```sh
docker compose up -d postgres
docker compose ps
docker compose logs postgres
npm run prisma:migrate:deploy
```

Wait until `docker compose ps` reports PostgreSQL as healthy before running Prisma migrations or starting the backend. Prisma applies the Property, RoofProfile, SolarSystemConfiguration, MonthlyElectricityBill, HouseholdConsumption, and AnalysisRun migrations; do not create the tables manually. After updating an existing M7B checkout to M8, run `npm run prisma:migrate:deploy` before starting the app so History can use the new table. The same migration command must run against the destination PostgreSQL database before starting a deployed M8 backend.

For normal development, run `docker compose up -d postgres` first, `npm --prefix server run dev` in one terminal, and `npm --prefix client run dev` in another. The database survives Express, Vite, and container restarts.

Stop the database without deleting its data:

```sh
docker compose down
```

**`docker compose down -v` deletes the PostgreSQL volume and its data**; use it only to intentionally reset the local database. Database exports and data directories must not be committed.

### Commands

```sh
npm install
npm --prefix client install
npm --prefix server install
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
npm run prisma:validate
npm run prisma:migrate:deploy
```

Run the migration before searching properties. The frontend runs at Vite's default URL and proxies `/api` requests to the API at `http://localhost:3001`. The health endpoint is `GET /api/health` and responds with `{ "status": "ok" }`.

Enter a full street address, city, and state on `/analyze`. On a local miss, the browser calls the [ArcGIS Geocoding service](https://developers.arcgis.com/rest/geocode/find-address-candidates/) with `forStorage=true`, then saves one address-level result. Ambiguous or imprecise matches are not saved. Optional property details are manual entries.

The visualization offers exactly two modes: **Map** and **3D**. The 3D scene uses ArcGIS world elevation and an oblique camera. The marker identifies the saved address coordinates; it is not a surveyed roof position or a detailed house model. The browser creates one ArcGIS view per active mode, updates the marker and camera when the property changes, and releases the view when the mode is switched or the page is unmounted.

The **Roof Profile** panel loads the current profile for each property and lets you enter usable roof area, tilt, azimuth, and an optional shading factor. Azimuth is clockwise from north; shading is a 0–1 fraction of estimated sunlight loss. Tilt must be 0–90 degrees, and azimuth must be at least 0 and less than 360 degrees. Use **Save Roof Profile** to create or update it. `GET /api/properties/:id/roof-profile` loads the profile; `PUT /api/properties/:id/roof-profile` validates and saves it. Each property has at most one current profile.

Optionally, choose the polygon tool in **Map** mode to draw one roof outline, then save the Roof Profile. The outline is stored as WGS84 GeoJSON and appears in Map and 3D. The 3D overlay follows visible scene surfaces for legibility. It is a planning visualization only: neither its area nor its vertical placement is an engineering measurement. Enter usable area separately based on your own assumption. **Remove outline** clears the draft; save again to persist the removal.

In **Sunlight & Shadow**, choose a date and local time, then set the property's UTC offset. The offset defaults to your device's current offset and should be adjusted for properties in other time zones or when daylight saving time applies. Switch to **3D** to see the simulated sun position. **Show shadows** enables direct shadows from available 3D objects. If a roof outline exists, it also adds a [ShadowCastAnalysis](https://developers.arcgis.com/javascript/latest/references/core/analysis/ShadowCastAnalysis/) overlay clipped to that outline for up to 30 minutes after the selected time. The overlay is an accumulated shadow visualization, separate from the scene's light at the selected instant. It is removed when shadows are turned off or the scene unmounts.

Visible shadows depend on 3D building context. Terrain and the saved 2D outline do not provide a measured roof model or reliable shading loss. The Roof Profile's `estimatedShadingFactor` remains an explicit manual assumption and is not derived from this visualization or sent to PVWatts.

In **Solar System**, select a generic 4 kW, 7 kW, or 10 kW preset, or enter a custom capacity up to 100 kW. Set system losses, module type, and fixed roof/open-rack mounting. `GET /api/properties/:id/solar-system` loads the current configuration, and `PUT` to the same path validates and saves it. Saving with a Roof Profile also requests an estimate; **Estimate production** runs it again later. Usable roof area is recorded as an assumption but does not automatically size the system.

`POST /api/solar/estimate` accepts only a property ID. Express reads the saved property coordinates, Roof Profile tilt and azimuth, and Solar System settings, then calls the current [PVWatts V8 API](https://developer.nlr.gov/docs/solar/pvwatts/v8/) with monthly output. The normalized response contains January–December AC energy in kWh, annual AC energy in kWh, optional capacity factor and weather resource details, plus separate warnings. The PVWatts credential is used only by Express and is never sent to React or returned with the estimate. The manually entered `estimatedShadingFactor` and ArcGIS shadow visualization are not applied to PVWatts losses; enter any desired loss assumption explicitly in **System losses**. The result is a planning estimate, not a measured or guaranteed yield.

In **Historical Electricity Bill & Solar Value**, choose a bill year and click **Enter Monthly Bills**. Enter January through December in USD; blank fields save as $0.00. Saving updates all twelve months in one database transaction. Reopen the modal or reload the property and year to edit existing values. The gray chart displays only saved historical bills, with a zero-height bar for a $0 month. It does not calculate solar value or utility-specific economics. `GET /api/properties/:id/electricity-bills?year=YYYY` loads a year, and `PUT /api/properties/:id/electricity-bills` saves `{ "year": YYYY, "monthlyAmounts": [12 numbers] }`.

To run the optional local PostgreSQL integrity test after applying migrations, use `RUN_DB_TESTS=1 npm --prefix server run test -- monthlyBills.db.test.ts`. It creates and deletes a temporary property and checks monthly uniqueness and transaction rollback.

The **Economics Estimate** panel records one annual household consumption assumption in kWh per property through `GET` and `PUT /api/properties/:id/consumption`. It never derives kWh from historical bill dollars. Historical bills, household consumption, PVWatts generation, self-consumption, grid imports, and grid exports remain separate concepts. The tariff domain supports utility and plan identifiers, effective dates and versions, seasons, weekday/weekend time-of-use periods, import rates, and export-credit source/vintage metadata. The synthetic tariff fixture under `server/test/fixtures/` is **TEST DATA — NOT CURRENT SCE RATES** and is never loaded at runtime.

M7B includes the supplied filed TOU-D-PRIME energy-rate snapshot effective June 25, 2026, and the 2026 hourly generation and delivery Energy Export Credit rows from the supplied NBT26 MIDAS file. Both retain their source and version metadata. The server can quote these rates for an eligible, bundled SCE NBT26 interval and calculate separate import energy charges and **gross** export-credit accrual; this is not a full bill or an applied credit. `/api/economics/tariff-status` reports the verified inputs, while the five requested annual metrics remain **ESTIMATE — Unavailable** because the app lacks the customer's confirmed tariff and NBT26 eligibility, co-timed load and solar profiles, and complete billing/settlement inputs. An arbitrary `TARIFF_CATALOG_PATH` JSON file cannot self-certify SCE estimates; a complete tariff record must be reconciled with official sources and explicitly reviewed in code. See [utility economics methodology](docs/utility-economics-methodology.md) for exact sheet references, rates, source hashes, assumptions, and remaining gaps.

The checked-in 2026 export-rate module can be reproduced with `python3 server/scripts/importSceNbt26.py '/path/to/NBT26 MIDAS File.csv'`. The importer requires the exact reviewed source checksum and validates both hourly components, units, coverage, local labels, holidays, and daylight-saving transitions. A revised source file requires review before its checksum or rates are updated.

## Saved analyses and History (M8)

On `/analyze`, load a property, save a Roof Profile and Solar System configuration, and run a PVWatts production estimate. Wait for the historical-bill and annual-consumption inputs to load. **Save Analysis** then creates a new `AnalysisRun`; each save from a new analysis creates a separate run, so one property can have many runs. The selected bill year is retained even when no monthly bills were entered (`monthlyAmounts: null`); annual household consumption may also be absent. Saving requires the property, roof assumptions, system assumptions, and a completed production estimate. It does not calculate missing electricity economics.

An AnalysisRun stores a JSONB snapshot of the displayed property details and coordinates, roof assumptions and outline, solar configuration, monthly and annual PVWatts production and warnings, the selected bill year with twelve bill values or `null` when none were entered, annual household consumption when present, and tariff/economics fields if supported. The current M7B workflow saves those tariff/economics fields as `null`: verified rate inputs alone do not support a customer-specific annual dollar result. The row also retains its Property relation, system size, annual production, and timestamps. Viewing a saved run restores its snapshot, including the map location, even if the property's current profile or electricity inputs later change. Deleting a Property also deletes its related runs.

Open `/history` to see saved runs ordered newest first. The table shows property address, system size, annual production, estimated annual savings when available, and creation time. Search filters by address. **View** opens a read-only snapshot on Analyze. **Edit** opens that specific run as a draft; **Save Changes** updates only that run. Changes to its roof, solar, bill, and consumption assumptions do not update the property's current records or another saved run. Editing production uses the backend-only PVWatts preview endpoint with the run's frozen coordinates and draft roof/system settings; **Save Changes** keeps the new estimate with that run. A fresh PVWatts call can differ from its previously saved result. **Delete** requires confirmation and removes the row immediately; a run deleted elsewhere is handled as already deleted.

The local API routes are:

| Action | Endpoint |
| --- | --- |
| List saved runs | `GET /api/analysis-runs` |
| Load one run | `GET /api/analysis-runs/:id` |
| Create a run | `POST /api/analysis-runs` |
| Update one run | `PUT /api/analysis-runs/:id` |
| Delete one run | `DELETE /api/analysis-runs/:id` |
| Preview production for edited assumptions | `POST /api/solar/estimate-preview` |

The API validates the snapshot and rejects updates that try to move a run to another Property. Missing runs return 404. Annual tariff and economics output fields remain unsupported until the required customer eligibility, interval energy data, and billing rules are available. To run the optional database CRUD/integrity test after applying migrations, use `RUN_DB_TESTS=1 npm --prefix server run test -- analysisRuns.db.test.ts`.
