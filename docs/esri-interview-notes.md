# Esri interview notes

## One-minute explanation

Property Solar Geo Intelligence is a local-first, one-property Web GIS PoC. An address is resolved through the local registry or ArcGIS stored geocoding, then shown as a target in Map and terrain-backed 3D. A user enters roof and system assumptions, explores date/time shadows visually, and obtains a backend PVWatts V8 monthly production estimate. Historical bills and annual consumption stay separate; the app does not claim a customer-specific SCE savings figure from incomplete tariff and hourly energy data. AnalysisRun snapshots let a saved result be viewed and edited later without silently changing another run.

## Design decisions

**Why is the problem spatial?** Solar planning starts with a real location. Address quality, coordinates, roof orientation, terrain, and surrounding 3D context affect what the user can inspect and which weather resource PVWatts uses. The application needs a map/scene tied to the selected property, not just an address string in a form.

**Why ArcGIS?** This implementation uses ArcGIS Maps SDK for JavaScript Map Components for interactive Map and 3D scenes, terrain/elevation, geocoding with storage permission, sketching, scene lighting, and ShadowCastAnalysis. Those capabilities support a connected spatial experience. ArcGIS does not supply a surveyed roof, guaranteed building geometry, or validated solar yield here.

**Why is sunlight visualization different from solar production?** Scene lighting and shadows answer “what could the scene look like at this date and time?” They depend on available 3D context and a visual roof outline. PVWatts answers “what AC energy might this assumed system produce by month?” It uses a solar/weather model and explicit roof/system inputs. The UI does not convert visible shadow into an annual energy-loss percentage.

**Why is PVWatts separate from ArcGIS?** ArcGIS handles geographic identification and visualization. PVWatts V8 calculates model-based monthly and annual AC production from coordinates and system assumptions. Express calls PVWatts so its key, validation, errors, and normalized response remain outside React.

**Why is utility economics separate from PVWatts?** PVWatts reports generation, not household self-consumption, time-of-use imports, eligible export credits, or a utility bill. Annual consumption and historical dollar bills cannot reveal hourly grid flows. The app includes reviewed SCE price inputs and narrow calculation primitives, yet keeps annual dollar results unavailable until account eligibility, co-timed energy, and billing/settlement rules are verified.

**How are React and ArcGIS lifecycles managed?** React renders one active Map or 3D component for the selected mode. The canvas waits for the ArcGIS view, then attaches its own marker, outline layer, and optional shadow analysis. It updates graphics for a new Property, aborts obsolete `goTo` navigation, ignores stale async loads, and cleans up owned graphics/layers/analysis on unmount. A GIS failure falls back to a retryable panel so the rest of Analyze remains usable. React Strict Mode is enabled.

**Why defer automatic roof extraction?** A geocoded address and ordinary 3D scene do not establish roof boundaries, tilt, usable area, obstructions, or structural suitability. The PoC asks the user to enter these assumptions and treats a sketch as a visual aid. That is more defensible than presenting an unverified roof reconstruction as a measurement.

**Why local-first?** The registry, configurations, bills, and saved runs live in a dedicated local PostgreSQL database, with no account system or cloud deployment required. External ArcGIS and PVWatts services are still called when needed. This keeps the PoC reproducible and its data flow easy to explain; it is not an offline application.

**Why AnalysisRun snapshots?** Current Property inputs can change. A run stores the property location/details, roof and system settings, PVWatts result, and electricity inputs that were displayed when saved. View restores those values; Edit updates the selected run only. The snapshot preserves the prior result rather than promising a future PVWatts call will return identical numbers. Sunlight exploration settings are not saved with the run.

## Demonstration path

1. Search an address twice to show a stored-geocode miss followed by a local registry hit, if the ArcGIS key and network are available.
2. Show the target marker in Map and 3D, sketch a simple outline if useful, and change the Sunlight & Shadow date/time. State that the scene is visual context, not a roof survey.
3. Save roof and system assumptions, request PVWatts monthly production, and point out the model warnings and separate electricity inputs.
4. Explain why Economics shows one **Economics estimate unavailable** state despite the reviewed SCE source material.
5. Save Analysis, open History, View, Edit, and confirm Delete. Show that an edited run does not change the current Property configuration or another run.

## Claim boundaries

- **IMPLEMENTED:** spatial exploration, user-adjustable assumptions, PVWatts production, local History snapshots, and reviewed SCE rate-input evidence.
- **PLANNED:** an annual financial result only after the required customer and interval data and complete tariff treatment are verified.
- **DEFERRED:** automatic/engineering-grade roof reconstruction and shading-loss derivation.
- **FUTURE:** broader utility and property coverage. No Phase 2 functionality is implied by this PoC.

For exact assumptions and source applicability, see [methodology and limitations](methodology-and-limitations.md) and [utility economics methodology](utility-economics-methodology.md).
