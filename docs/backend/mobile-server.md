# Mobile computation server

## Start

From the repository root, after `npm --prefix mobile ci`:

```bash
npm --prefix mobile start -- --clear
```

This starts the Node calculation backend and Metro. Alternatively, run `npm --prefix mobile run server` and `npm --prefix mobile run metro -- --clear` in separate terminals. Node 22.13+ is required. There are no additional server dependencies or Go build steps.

`server/mobile-api.mjs` binds **127.0.0.1:8000**. `mobile/metro.config.js` wraps Metro with `scripts/api-proxy.cjs`; only health, routes, shadows and buildings are forwarded through `/umbra-api`. The app derives this origin from Expo's `hostUri`, with HTTPS for Expo tunnel hosts. The optional developer environment variable `EXPO_PUBLIC_API_URL` overrides it for a future hosted deployment; no URL is entered through the app UI. An internal port override must be supplied to both processes, or once to the combined launcher: `UMBRA_COMPUTE_PORT=8001 npm --prefix mobile start`.

The combined launcher detects an existing compatible backend, refuses an incompatible service on the same port, and stops its owned backend/Metro children on exit. An independently started compatible backend is reused, not owned. It must be restarted after editing backend/engine files. Metro code reloads do not restart the backend.

## Calculation path

`server/compute/pool.mjs` owns two worker threads; each loads/decodes/indexes the checked-in city snapshot once. `worker.mjs` runs the shared TypeScript engine, including current polyline snapping with request-local virtual nodes and unverified building-entry warnings. It does not switch back to the older Go nearest-node implementation. Engine unit tests can still execute offline on desktop, but no mobile screen imports `services/localEngine.ts` or the city loader.

The HTTP event loop stays separate from geometry/routing work. Jobs have a bounded queue (24), route-first priority, a 20-second request deadline, cancellation forwarding and a hard worker restart if cancellation is not acknowledged within five seconds. Shared engine work yields cooperatively; an individual bounded clipping operation is synchronous. Worker failures reject the active request and trigger bounded restart attempts. `/health` reports readiness once a worker has loaded its snapshot.

Request JSON is limited to 16 KiB; unexpected fields, malformed bounds and invalid content types are rejected. Responses are capped at 8 MB before compression. Gzip runs asynchronously. Up to 12 static viewport results / 16 MB are cached in process memory. Routes are not cached. Cache capacity and worker count bound memory growth; this is not a tested public multi-tenant service.

| Endpoint | Payload | Result |
| --- | --- | --- |
| `GET /health` | none | service identity, schema and readiness |
| `POST /v1/routes/compare` | existing schema-1 route request | validated route comparison, `server/...` method |
| `POST /v1/shadows` | `{at, bounds}` | GeoJSON accepted by `parseShadowLayer` |
| `POST /v1/buildings` | `{bounds, focus?}` | building GeoJSON with source and display heights |

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
