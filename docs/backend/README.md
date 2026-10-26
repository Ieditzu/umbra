> The current mobile app uses the Node computation server. Start both server and Expo with `npm --prefix mobile start -- --clear` from the repository root. See [mobile server instructions](mobile-server.md). The Go commands below are for the separate research/reference implementation.

# Umbra Go backend

This service implements the current Constanța walking/shade pilot. It has no camera or Periscope functionality. Source, tests and tooling live in `server/`; the mobile application is maintained separately and is not modified by this implementation.

## Install and prepare

Requirements: Go 1.24 or newer. Node.js 22.13+ is also required **for integration tests** that execute the existing mobile TypeScript validators. Neither Python nor npm dependencies are required by the service. Map polygon union/clipping uses the pinned pure-Go MIT-licensed `github.com/peterstace/simplefeatures/geom` dependency; CGO and native GIS libraries are not required. IANA time-zone data is embedded in the binary.

From the repository root:

```bash
cd server
go test ./...
go vet ./...
go build -o bin/umbra ./cmd/umbra
./bin/umbra prepare
./bin/umbra serve --addr 0.0.0.0:8000
```

By default, `prepare` retains the central reference pilot `constanta-central-v1` (approximately west 28.630 south 44.170 east 28.640 north 44.180). Exact routing boundaries now bound all four projected corners in EPSG:32635. `/health` identifies the loaded dataset. The mobile app uses a separate wider city dataset and calculates on-device without this API.

For the wider city rectangle covering Constanța, Mamaia and Palazu Mare (west 28.50 south 44.075 east 28.75 north 44.355), use `prepare --city --data /separate/cache/city/dataset.json`. A separate output path prevents replacing the central reference cache. This is an extract rectangle with a margin, not an administrative-boundary polygon. Both datasets retain a 500 m building buffer and the same pedestrian-access filters. Large-city preparation indexes building footprints so it does not scan every building for every road segment.

An offline OSM JSON extract can be supplied with `--extract /path/city-osm.json`. For reproducible PBF cropping and bundling, see [mobile data preparation](../mobile-data.md). This avoids repeated public Overpass requests when preparing a larger region. Source snapshot times and checksums remain in the normalized metadata. Overpass downloads are bounded to 150 MB and still have explicit timeouts with no automatic retries.

Buildings are fetched with a 500 m buffer. The normalized dataset and original OSM response are stored in the OS user cache, normally `~/.cache/umbra-server/constanta-central-v1/`, outside Git. An identical preparation reuses the normalized cache; if that is missing it reuses the raw query cache. Refresh is explicit:

```bash
./bin/umbra prepare --refresh
```

Do not refresh per request. The importer makes one sequential, bounded query with a project-identifying User-Agent, timeout and 40 MB response limit. Partial/error responses are rejected. It does not automatically retry HTTP 429 or 5xx responses. Respect the server's `Retry-After` and usage policy before retrying. For larger deployments use a regional extract or your own approved Overpass server; `--overpass URL` selects an alternative provider.

Both commands accept `--data /absolute/path/dataset.json`. `UMBRA_DATA_PATH` provides the default. Set the same path for preparation and serving. `UMBRA_ADDR` controls the default bind address. The API loads one immutable prepared snapshot at startup; restart after refreshing. It never downloads during a request. Missing or invalid data produces readiness 503 instead of sample routes.

## Phone connection

Find the computer's LAN address, for example with `hostname -I` on Linux. With phone and computer on the same network, set the mobile app's service URL to:

```text
http://192.168.1.20:8000
```

Replace the example IP with the computer's actual reachable LAN address. Open the firewall for that port if needed. `0.0.0.0` is the **server bind address**, not the URL to enter on the phone. `localhost` on the phone means the phone itself. Native mobile requests do not require browser CORS configuration. Public hosting requires HTTPS via a reverse proxy; this executable is intended for a trusted LAN pilot and does not add accounts or billing.

Check readiness:

```bash
curl http://127.0.0.1:8000/health
```

A ready response includes `ready: true`, map counts, height-source counts, the OSM snapshot timestamp and `field_validated: false`. Without data, `/health`, `/v1/routes/compare` and `/v1/shadows` return 503. After loading, the process serves the same snapshot even if the upstream provider is unavailable.

## Route request

`POST /v1/routes/compare` uses schema version 1 from `mobile/src/domain/routes.ts`. No fields have been added to or removed from that contract. The following illustrates the pilot coordinates; use a current/future departure instant and points near mapped paths:

```bash
curl --fail-with-body http://127.0.0.1:8000/v1/routes/compare \
  -H 'Content-Type: application/json' \
  --data '{
    "schema_version": 1,
    "origin": {"latitude": 44.1733, "longitude": 28.6383},
    "destination": {"latitude": 44.1760, "longitude": 28.6370},
    "departure_at": "2026-10-25T09:00:00.000Z",
    "departure_timezone": "Europe/Bucharest",
    "max_extra_minutes": 5,
    "walking_speed_mps": 1.4
  }'
```

The request example in the older mobile integration document has a destination longitude of 28.642, outside **this** pilot. This backend rejects it with 422; it does not silently expand coverage. Choose points inside the pilot. Points snap to existing nodes within 75 m; no off-network connecting edge is generated. A snap crossing a building interior is rejected. Snapping distances are reported in warnings. Duration starts on the mapped node and does not include reaching that node from the requested location.

The exact `departure_at` string is echoed, including its original offset and fractional-second spelling. `departure_timezone` must be an IANA zone. An explicit UTC instant avoids the ambiguity of repeated local times during DST. The API validates required fields, geographic bounds, current/future departure (60 s grace), 25 m–20 km endpoint separation, positive speed and detour values 0/5/10/15. The solar model is limited to years 2000–2100; the pilot has a four-hour planning horizon including the detour allowance. Native client requests use a 1.4 m/s default.

Responses contain the fastest route and at most two distinct useful alternatives. Every route has connected metric-derived geometry converted back to WGS84 coordinates and positive segment durations summing to total duration. Non-success responses use `{"detail":"..."}`: 422 for input/coverage/connectivity failures, 413 for bodies over 16 KiB, 415 for unsupported content type, and 503 for missing data, capacity or compute timeout. At most two calculations run concurrently. The compute budget is 12 s, leaving room under the mobile client's 20 s timeout. These are budgets, not a latency guarantee on every host.

## Map shadows

```bash
curl --fail-with-body http://127.0.0.1:8000/v1/shadows \
  -H 'Content-Type: application/json' \
  --data '{"at":"2026-10-24T09:00:00.000Z","bounds":[28.630,44.170,28.640,44.180]}'
```

The endpoint implements the mobile GeoJSON contract in `docs/mobile-app.md`. Bounds are west/south/east/north; historical and future inspection instants in 2000–2100 are allowed. Polygons are clipped to both viewport and pilot, preserving inner rings. Responses echo the requested instant, classify `available`/`night`/`low_sun`, and disclose `partial_coverage`, height provenance, warnings and attribution. Missing or elevated/unsupported heights produce footprint outlines, never fabricated shadow extents.

At night or below the five-degree solar cutoff, no daylight shadows are drawn. Floor-estimated shadows use the lower assumed height, consistent with the routing model's conservative shade label; the larger possible shadow remains uncertain. The model assumes flat terrain and opaque vertical prisms, not detailed roofs, trees or weather.

The endpoint shares the two-calculation capacity limit with routing. It has a 12-second cooperative budget, an eight-entry immutable response cache, a 16 KiB request cap, a 4.9 MB response cap, and at most 2,000 polygon features/60,000 coordinates. Very complex building polygons are omitted with a warning; truncation is flagged so users can zoom in. Invalid/outside viewports return 422, malformed content types 415, oversized bodies 413, and unavailable/busy calculation 503. Serving never downloads OSM data.

## Model and research evidence

Read [model and limits](model.md), [verification](verification.md) and [data/licensing](data.md) before interpreting results. All outputs estimate **geometric direct-sun obstruction**, not temperature, UV dose, physiological exposure or medical safety. OSM ways and crossings have not been independently verified in the field. The service is a research pilot, not validated turn-by-turn navigation.
