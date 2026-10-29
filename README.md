# Umbra

A React Native map with building geometry and estimated solar shadows across Romania. Shade-aware walking routes use prepared OpenStreetMap city graphs for București and all 41 county seats, generated automatically (see [city coverage](docs/cities.md)). **The PC calculates routes, sunlight and building geometry; the phone displays the map and reads GPS/compass.** No server address needs to be entered in the app. See [the overview](overview.md).

## Run on your PC and phone

Install Node.js **22.13+** and Expo Go for SDK 58. From the repository root:

```bash
npm --prefix mobile ci
npm --prefix mobile start -- --clear
```

This starts **both the calculation server and Expo**. Stop any older Expo process with **Ctrl+C** first. Scan the new QR code with Expo Go on Android or the Camera app on iPhone. Normally the PC and phone must share Wi-Fi. Keep this command running while using the app; **Ctrl+C** stops both processes it started.

The combined launcher automatically reloads its backend after edits to server/shared engine files. Stop a separately started older backend before relaunching; incompatible old versions are reported explicitly.

The app automatically reaches the backend through the same Expo connection, at `/umbra-api`. There is no IP/server field to configure. The backend uses `127.0.0.1:8000` internally; Metro forwards the permitted API paths. If you already started this backend separately, the launcher reuses it and leaves it running on exit. Go is not required for this workflow.

To launch the two processes separately, use **two terminals**, from the repository root:

```bash
# Terminal 1 — calculation server
npm --prefix mobile run server
```

```bash
# Terminal 2 — Expo
npm --prefix mobile run metro -- --clear
```

The server's readiness endpoint is `http://127.0.0.1:8000/health`. The forwarded endpoint is `http://127.0.0.1:8081/umbra-api/health` when Metro uses its default port. It reports `ready: true` after loading the city snapshot. If another program occupies port 8000, stop it or start both processes with a different internal port:

```bash
UMBRA_COMPUTE_PORT=8001 npm --prefix mobile start -- --clear
```

For an emulator, use `npm --prefix mobile run android` or `npm --prefix mobile run ios` (the iOS simulator requires macOS/Xcode). Only Android and iOS are app targets; there is no web app.

## Use

- Allow foreground location. The map follows your live position; panning stops following and the location button resumes it. The blue sector shows the phone's compass direction even when stationary; it hides if direction readings are unavailable.
- Tap **Unde mergi?** or long-press the map to choose a destination. Select a calculated route and tap **Pornește traseul** to zoom in and follow GPS with remaining time/distance and estimated arrival. The expand icon fits the whole route; the location icon recenters and resumes following after you move the map. **Ieși** returns to alternatives. Routes refresh after useful movement or a minute.
- Tap **Acum** to change date/time. At night no daylight shadow polygons are drawn.
- **Straturi → Clădiri 3D** enables buildings and tree models. **Înclină / Sus** and two-finger dragging control the camera independently, so models remain visible from above. The standard **Hartă** uses MapLibre/OpenFreeMap on both platforms; satellite uses the native map and Android terrain remains native.
- **Straturi** controls map style and shadows. **Umbre orientative** adds lighter shadows from map-render heights or a 6 m fallback when source height is missing. Their direction and length use the selected instant and Sun position at the viewed location; map-only assumptions are excluded from route exposure. The option is saved locally. OSM omissions and geometry budgets can limit detail.

In the covered cities, buildings without OSM height or floor tags can also receive satellite-derived height estimates from Copernicus Urban Atlas Building Block Height (2012 where the city has a file). They are matched to unambiguous 10 m raster pixels and labelled with their source and year. These old estimates may be wrong for changed buildings; their −5/+10 m range is a heuristic, not a validated confidence interval. Route shadows from this source are marked estimated and receive reduced weight. OSM and user-measured heights take priority; buildings still without a height stay unknown, never counted as sun or shade. © European Union, Copernicus Land Monitoring Service 2022, European Environment Agency (EEA). See [city coverage](docs/cities.md) and [data provenance](docs/mobile-data.md).

The Romania-wide OSM tree dataset supplies mapped trees in every covered city. Missing trees and changes since the satellite images can affect the results.
- **Setări** contains the maximum walking detour.

The server finds the prepared area for each request by position from `mobile/assets/data/cities/index.json`; no city is named in its code and no separate download/preparation step is needed. It decodes a city the first time it is used (about 3 s) and keeps a few recent ones per worker (`UMBRA_CITY_CACHE`, default 3); startup no longer waits for city data. București is split into overlapping zones; a route can join two neighbouring zones. Constanța and Suceava keep their earlier snapshots (`constanta-city.json`, `suceava-city.json`). For other areas in Romania, the PC downloads a bounded 3×3 group of OpenFreeMap vector tiles around the viewed position and decodes building footprints on a worker. The first visit needs internet; requests are cached in memory. This is on-demand coverage, not a downloaded nationwide offline model. Tile geometry can be generalized and render heights are assumptions, not verified height tags. The app no longer loads that dataset or performs route/shadow calculations. Server responses are compressed and bounded; the renderer keeps a limited geometry cache. The GPU still draws 3D on the phone, so this does not establish a device frame-rate guarantee.

The PC must stay on and reachable for new routes, buildings and shadows. **There is no automatic on-phone calculation fallback.** Basemap tiles and address search also need their providers. An installed standalone app will need a deployed HTTPS backend configured by the developer with `EXPO_PUBLIC_API_URL`; this implementation is configured for PC testing through Expo.

GPS origin/destination, chosen time and viewport are sent to the PC for calculation. The server does not write those requests to disk or request logs; bounded viewport-result caches exist in server memory. For route weather, Open-Meteo receives the route midpoint rounded to 0.02 degrees; its forecast is cached in server memory for 20 minutes. Opt-in shadow measurements (below) are the only data it stores. Map style, 3D, shadow visibility, selected date/time and detour preference are saved locally on the phone and restored on reopening. Map controls save automatically; the detour screen uses **Salvează**. **Acum** remains a live clock when selected. GPS, destination and routes are not persisted. OpenFreeMap also receives the server’s regional tile requests. Apple/Google handle native map/search requests. See [server architecture and privacy](docs/backend/mobile-server.md) and [data provenance](docs/mobile-data.md).

Route recommendations experimentally combine walking time, geometric shade and Open-Meteo's hourly forecast of direct solar radiation. The chosen alternative is marked **Recomandat**, and all available alternatives remain selectable. **Straturi → Nori** hides the decorative weather icon in the route panel; the preference is saved on the phone and does not disable the forecast. The weighting is provisional and the forecast represents a regional cell, not cloud positions above individual streets. Unknown exposure remains unknown; the result is not a UV, heat or safety measurement. If weather cannot be obtained or does not cover the trip, the existing route calculation works without it. Weather requests require internet; Open-Meteo's free API is subject to its non-commercial terms and attribution. See [weather routing research](docs/research/weather-aware-routing.md).

The route card also distinguishes **fără umbră identificată** from exposure that cannot be evaluated due to uncertain geometry or low Sun. This indicates only that no modeled obstacle blocks the Sun; incomplete map data and weather can change the result. It is not verified direct sunlight and receives the same conservative routing weight as unknown exposure.

Mapped trees and rows, and modeled canopy areas in Constanța from Meta/WRI satellite imagery (2019–2020), appear as approximate green canopies when **Clădiri 3D** is enabled or when **Umbre** and **Estimări și copaci** are enabled. Tree models use the loaded building footprints and road/footpath centerlines for visual clearance; missing or incomplete map data can still cause placement errors. Pedestrian paths remain in the routing network even though their basemap lines are hidden. The server estimates tree shade and considers it with reduced weight when comparing routes; unknown height and canopy size use defaults. Deciduous and unknown trees have no modelled foliage November–March, while evergreen trees retain it. Coverage is incomplete; unmapped trees, weather and terrain remain uncertain. Unmodeled exposure is not counted as shade. These are experimental geometric estimates, not field-validated temperature, UV or route-safety measurements.

The ruler button opens **Măsoară clădirea**: tap a building, follow the orange ruler from the suggested roof corner, then type a tape/laser distance, stand at the shadow tip for a GPS reading, or enter a straight-down drone photo. The app computes *h = L · tan(e)* with an uncertainty and stores the measurement on the phone. Once a building is confirmed (one tape/laser or drone reading, or two agreeing independent readings), its height range replaces the OSM or floor-count height in shadows and routes.

Sharing is off by default. With **Setări → Contribuie la baza comună**, measurements are also uploaded to the shared heights database on the PC server (SQLite in `.umbra-data/`, ignored by Git). They are uploaded with an anonymous install id and without positions. The server recomputes each height, and every phone then uses the confirmed shared heights. Uploads can be deleted at any time. Moderators use `server/heights/admin.mjs`. Field-study tools (observer initials, blind mode, reference heights, JSON/CSV export) and the analysis scripts are described in [measuring buildings from their shadows](docs/shadow-heights.md#implementation-status). Measurements are unvalidated estimates until the field study is done.

## Checks

```bash
cd mobile
npm run typecheck
npm run lint
npm test
npm run test:server
npm run export:android
npm run export:ios
```

Node tests cover solar references, geometry, routing, server discovery and response validation. Backend tests exercise HTTP/proxy behavior and real city calculations in a worker. Exports check JavaScript bundling, not physical-phone performance or compass accuracy. See [software verification](docs/mobile-verification.md).

`npm ci` rebuilds the embedded iOS renderer automatically. After changing `mobile/map-web/map.js`, run `npm --prefix mobile run build:map`.

## Reference backend and data preparation

The Go implementation remains a separate research/reference tool. It is **not** the backend used by `npm start`. Its API lacks the current mobile building-display endpoint and should not replace the Node computation server. See [Go backend documentation](docs/backend/README.md).

To rebuild the city snapshots from a new Geofabrik extract (OSM crop, Go importer, packaging, Copernicus heights and the city index):

```bash
uv run --python 3.12 --with osmium==4.3.0 --with rasterio --with pyproj --with 'pyjwt[crypto]' \
  python -I scripts/build-cities.py /absolute/path/to/romania-YYMMDD.osm.pbf [--only cluj-napoca,iasi]
```

The Copernicus CLMS service key goes in `.umbra-data/copernicus/service-key.json` (ignored by Git; never commit it). See [city coverage](docs/cities.md) for the steps, sources and limitations. Review coverage, height provenance and generated metadata before replacing a snapshot. Preserve ODbL attribution. Go 1.24+ and Python/pyosmium are data-preparation tools only.

Historical parking-camera documents remain in `docs/`; the previous README is in [the archive](docs/archive/README.previous.md).


If shadows say **Repornește serverul de pe PC**, stop the old command with **Ctrl+C**, run `npm --prefix mobile start -- --clear`, and reload Expo Go. An old running backend cannot understand fields added by a freshly updated app. **Straturi** also shows the computed Sun elevation and azimuth. At night, daylight shadows remain empty; mapped tree canopies may remain visible.

After an embedded-map update, use a complete **Reload in Expo Go**. The renderer is versioned by its bundled content and resets readiness during page reload, so it does not lose geometry commands before initialization. Long jumps between cities refresh the spatial index; nearby zoom/pan retains incremental updates.
