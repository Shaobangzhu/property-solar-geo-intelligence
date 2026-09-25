# Property Solar Geo Intelligence

Local-first Web GIS Proof of Concept for evaluating rooftop solar potential for one residential property at a time.

## Current scope: M4 Sunlight & Shadow Experience

The React/Vite frontend checks a local PostgreSQL property registry first, then uses ArcGIS stored geocoding for a new address. It saves the address and coordinates through the Express API and shows the Property Summary. After loading a property, the page shows an interactive ArcGIS Map or terrain-backed 3D scene with a target marker. A Roof Profile stores user-adjustable planning assumptions and an optional visual roof outline. The Sunlight & Shadow panel lets you visually explore the 3D scene at different dates and times. Solar production and PVWatts modeling are planned for later milestones.

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

Wait until `docker compose ps` reports PostgreSQL as healthy before running Prisma migrations or starting the backend. Prisma applies the Property, RoofProfile, SolarSystemConfiguration, and MonthlyElectricityBill migrations; do not create the tables manually.

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
