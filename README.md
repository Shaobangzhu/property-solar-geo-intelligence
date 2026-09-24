# Property Solar Geo Intelligence

Local-first Web GIS Proof of Concept for evaluating rooftop solar potential for one residential property at a time.

## Current scope: M2.5 Dedicated Local Database

The React/Vite frontend checks a local PostgreSQL property registry first, then uses ArcGIS stored geocoding for a new address. It saves the address and coordinates through the Express API and shows the Property Summary. After loading a property, the page shows an interactive ArcGIS Map or terrain-backed 3D scene with a target marker. Roof Profile and PVWatts production modeling are planned for later milestones.

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

Set `PSGI_POSTGRES_USER` and `PSGI_POSTGRES_PASSWORD` in the repository-root `.env`. Use a credential dedicated to this project. Set `server/.env` `DATABASE_URL` with the same user and password, using `postgresql://<user>:<password>@127.0.0.1:5433/property_solar_geo_intelligence?schema=public`. Set `client/.env` `VITE_ARCGIS_API_KEY` to an ArcGIS API key with **stored geocoding**, basemap, and elevation privileges. `PVWATTS_API_KEY` is reserved for a later backend-only integration. All real `.env` files are ignored by Git.

## Local Database

PostgreSQL runs in Docker as **`psgi-postgresql`**, using the **`property_solar_geo_intelligence`** database and Docker named volume **`psgi_postgres_data`**. It listens on container port 5432 and local host port **5433** (`127.0.0.1:5433`). The volume survives `docker compose down` and normal container recreation. This project does **not** reuse the Chaoran Property Intelligence PostgreSQL instance.

```sh
docker compose up -d postgres
docker compose ps
docker compose logs postgres
npm run prisma:migrate:deploy
```

Wait until `docker compose ps` reports PostgreSQL as healthy before running Prisma migrations or starting the backend. Prisma applies the existing Property migration; do not create the tables manually.

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
