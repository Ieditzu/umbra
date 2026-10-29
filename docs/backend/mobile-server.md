# Mobile computation server

## Start

From the repository root, after `npm --prefix mobile ci`:

```bash
npm --prefix mobile start -- --clear
```

This starts the Node calculation backend and Metro. Alternatively, run `npm --prefix mobile run server` and `npm --prefix mobile run metro -- --clear` in separate terminals. Node 22.13+ is required. There are no additional server dependencies or Go build steps.

`server/mobile-api.mjs` binds **127.0.0.1:8000**. `mobile/metro.config.js` wraps Metro with `scripts/api-proxy.cjs`; health, routes, shadows, buildings/inspection and the allow-listed shared-height paths are forwarded through `/umbra-api`. The app derives this origin from Expo's `hostUri`, with HTTPS for Expo tunnel hosts. The optional developer environment variable `EXPO_PUBLIC_API_URL` overrides it for a future hosted deployment; no URL is entered through the app UI. An internal port override must be supplied to both processes, or once to the combined launcher: `UMBRA_COMPUTE_PORT=8001 npm --prefix mobile start`.

The combined launcher detects an existing compatible backend, refuses an incompatible service on the same port, and stops its owned backend/Metro children on exit. An independently started compatible backend is reused, not owned. The combined launcher watches server/shared-engine sources and restarts its owned backend while leaving Metro running. A separately started backend still needs a manual restart after edits. Health capabilities detect an incompatible old service instead of silently reusing it.

## Calculation path

`server/compute/pool.mjs` uses one worker thread by default to avoid duplicating city data. Each reports ready after loading the tree catalogue and the city index (`server/compute/catalog.mjs`); it decodes and indexes a city snapshot only when a request falls inside that city, loads the walking graph only on the first route request, then keeps up to `UMBRA_CITY_CACHE` (default 1) recent areas in an LRU cache. Routes between two neighbouring București zones load a joined graph built from both zones' shared OSM node ids. `worker.mjs` runs the shared TypeScript engine, including current polyline snapping with request-local virtual nodes and unverified building-entry warnings. It does not switch back to the older Go nearest-node implementation. Engine unit tests can still execute offline on desktop, but no mobile screen imports `services/localEngine.ts` or the city loader.

The HTTP event loop stays separate from geometry/routing work. Jobs have a bounded queue (24), route-first priority, a 20-second request deadline, cancellation forwarding and a hard worker restart if cancellation is not acknowledged within five seconds. Shared engine work yields cooperatively; an individual bounded clipping operation is synchronous. Worker failures reject the active request and trigger bounded restart attempts. `/health` reports readiness once a worker has loaded its catalogues; city snapshots are decoded on first use.

Request JSON is limited to 16 KiB; unexpected fields, malformed bounds and invalid content types are rejected. Responses are capped at 8 MB before compression. Gzip runs asynchronously. Up to 12 static viewport results / 16 MB are cached in process memory. Routes are not cached. Cache capacity and worker count bound memory growth; this is not a tested public multi-tenant service.

| Endpoint | Payload | Result |
| --- | --- | --- |
| `GET /health` | none | service identity, schema and readiness |
| `POST /v1/routes/compare` | existing schema-1 route request | validated route comparison, `server/...` method |
| `POST /v1/shadows` | `{at, bounds, focus?, include_estimates?}` | GeoJSON accepted by `parseShadowLayer` |
| `POST /v1/buildings` | `{bounds, focus?}` | building GeoJSON with source and display heights |
| `POST /v1/buildings/inspect` | measurement-target request | selected building and candidate shadow corners |

Shared storage adds `GET /v1/heights`, measurement submission/deletion and public
building summaries. The [project guide](../project-guide.md#api-and-configuration)
lists all paths; [measurement documentation](../shadow-heights.md#implementation-status)
describes validation and ownership. SQLite defaults to `.umbra-data/heights.sqlite3`;
`UMBRA_HEIGHTS_DB` selects another path and `UMBRA_HEIGHTS=off` disables storage.
The proxy forwards only the documented methods, including the allowed `since`
query for the heights file.

Bounds are WGS84 `[west,south,east,north]`. Routes validate actual departure instants. Shadow inspection supports historical times. Building requests return up to 2,500 parts / 70,000 vertices with 150 m preloading and camera-center priority. Display coordinates are rounded to six decimal degrees (~11 cm latitude precision); this is not a claim of source accuracy. Missing heights remain zero in the engine with separate display-only placeholders.

## Phone work and limits

The phone reads GPS/compass, validates results, parses JSON, maintains camera state and renders the map. It no longer decompresses/indexes the 40 MB dataset or runs Dijkstra/shadow clipping. The WebView keeps at most 5,000 building parts / 120,000 vertices, incrementally updating by stable ID. Offloading CPU calculations does not remove GPU, WebView or network limits. Physical-device frame-rate improvements have not been measured.

If the PC is stopped or disconnected, new calculations fail with an actionable message. They do not silently fall back to heavy phone work or fabricate results. Existing visible building geometry remains until replacement; shadow-time/viewport validity rules are unchanged.

The app sends route endpoints, selected time and viewport/focus to the server. There is no request logging or disk persistence of these values; bounded viewport caches and pending jobs are transient. The backend listens only on loopback and is reached through the development connection. This PC-testing setup has not been deployed as a public service. A hosted release would require a configured HTTPS origin and deployment-specific access/load controls.

## Validation

```bash
npm --prefix mobile run test:server
npm --prefix mobile test
npm --prefix mobile run typecheck
npm --prefix mobile run lint
```

HTTP tests cover gzip, validation, cache boundaries, proxy routing, unavailable backends, worker cancellation and real-data building/shadow/route results. Phone permissions, compass orientation, network changes and frame rate still need physical-device checks.


## Regional building coverage and Sun

Outside the bundled city areas listed in `mobile/assets/data/cities/index.json`, the HTTP layer selects a zoom-14 3×3 tile window around the camera inside a broad Romania envelope (20.2–30° E, 43.5–48.4° N). This rectangle also includes some border surroundings; it is not an administrative boundary. OpenFreeMap's public TileJSON supplies the current tile snapshot. Requests use a project User-Agent, at most four concurrent downloads, 4 MB per tile and 12 MB per window. Shared in-flight requests and a bounded 32-tile / 16 MB cache avoid repeated downloads. No full-country download occurs and no regional data are written to disk.

Workers use `@mapbox/vector-tile` and `pbf` to decode only building polygons. Tile buffers are clipped to exact tile edges, corresponding pieces are joined, courtyards retained, and component geometry receives stable hashed IDs. Each worker caches one decoded region. Empty graph arrays are explicitly allowed only for building-map datasets; these data never become a walking graph. Walking routes use the prepared areas in the city index; see [current coverage](../cities.md).

Render heights remain separate from source heights: `umbra:render_height` is a display hint, while the building's evidence height stays unknown. Optional lighter `display_estimate` shadow polygons use that hint or 6 m; they do not feed route scoring. Source-supported heights and floor estimates retain their categories. Elevated/roof-only structures are excluded from assumed solid-ground shadows. Sun elevation and azimuth are computed at the camera focus (or covered viewport center) and selected UTC instant, returned as metadata, and drive iOS 3D lighting too. Night/low-Sun limits remain in force. The bounded tile window and fixed UTM-35N flat-ground projection are approximation limits across Romania, particularly toward its west; no surveyed accuracy is claimed.

Regional data attribution is included in responses and map credits. Dependencies are installed with the mobile project, including Node-only decoder dev dependencies; `npm --prefix mobile ci` installs everything for PC testing. The OpenFreeMap service needs network access and has no availability guarantee. See its [terms](https://openfreemap.org/) and [decoder source](https://github.com/mapbox/vector-tile-js).


## Mapped tree data

Workers load the compact `mobile/assets/data/romania-trees.json` snapshot and index points and mapped row segments in geographic cells. For each city or regional dataset, the server builds a separate tree spatial index; it never adds tree canopies to the building index used for pedestrian network attachment. Map shadows include green `tree_canopy` and `tree_estimate` polygons only when display estimates are enabled. Tree data contributes the distinct `estimated_shade` category to prepared-city route scoring. The snapshot is dated, incomplete and assumed canopy dimensions/foliage make the results approximate. See `docs/mobile-app.md` for the model and limitations.


The Constanța worker also indexes an offline 4 m canopy estimate derived from Meta/WRI imagery (2019–2020) after masking OSM buildings and known trees. It is an additional modeled source, not a verified tree inventory. Its `satellite_canopy` and `satellite_estimate` features are distinct from OSM canopy features. Route scoring assigns all modeled tree/canopy shade the existing estimated-shade category. Countrywide satellite coverage is not included. See `docs/mobile-app.md` for provenance and processing.
