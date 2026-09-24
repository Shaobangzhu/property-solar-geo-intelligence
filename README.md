# Property Solar Geo Intelligence

Local-first Web GIS Proof of Concept for evaluating rooftop solar potential for one residential property at a time.

## Current scope: M2 Property Map and 3D Scene

The React/Vite frontend checks a local PostgreSQL property registry first, then uses ArcGIS stored geocoding for a new address. It saves the address and coordinates through the Express API and shows the Property Summary. After loading a property, the page shows an interactive ArcGIS Map or terrain-backed 3D scene with a target marker. Roof Profile and PVWatts production modeling are planned for later milestones.

### Prerequisites

- Node.js 24 or later
- A local PostgreSQL database for Prisma migrations and future persistence

### Configure environment variables

Copy the examples and set local values. Do not commit the resulting `.env` files.

```sh
cp client/.env.example client/.env
cp server/.env.example server/.env
```

Set `server/.env` `DATABASE_URL` to the local PostgreSQL connection string. Set `client/.env` `VITE_ARCGIS_API_KEY` to an ArcGIS API key with **stored geocoding**, basemap, and elevation privileges. `PVWATTS_API_KEY` is reserved for a later backend-only integration and is not used in M2. The two `.env` files are ignored by Git.

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
