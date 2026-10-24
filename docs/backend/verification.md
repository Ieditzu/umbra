# Verification and evidence limits

## Deterministic offline tests

From `server/`:

```bash
go test ./...
go test -race ./...
go vet ./...
go build -o bin/umbra ./cmd/umbra
```

Tests do not depend on public internet, the live OSM map, or the host's current date. Importer tests use a local HTTP fixture server; route tests set a fixed clock. The Node integration test runs the existing `mobile/src/domain/routes.ts` parser against an actual backend HTTP response using Node's TypeScript stripping. It requires Node 22.13+ and does not install packages or edit any mobile files. It fails rather than silently skipping if Node or the client contract is unavailable.

Coverage includes metric projection against a PROJ reference, positive height provenance and malformed heights, read-only import caching, incomplete-download rejection, access restrictions and explicit foot overrides, pedestrian one-way restrictions, excluding a path through a building, joining multipolygon outer fragments and preserving an inner courtyard, a simple independently checkable shadow, missing height/inventory, estimated-height disagreement, reviewed coverage boundaries, night/near-horizon behavior, road-centerline unknown exposure, solar position against independent pvlib values, DST repeated-hour instants, traversal-time classification, no route, outside coverage, past/naive dates, zero/maximum detour constraints, conservative treatment of unknown exposure, cancellation/deadline handling, readiness, HTTP request validation, and unchanged mobile response parsing.

Synthetic fixture geometry, fabricated buildings and mock exposure functions are used to isolate software behavior. They are **not** Constanța measurements and are not evidence of actual user benefit, street access, shade accuracy or thermal effects.

Numerical reference provenance: the WGS84 point `(longitude 28.6383, latitude 44.1733)` projects to approximately `(630966.86447, 4892426.12169)` in EPSG:32635 using PROJ. Solar test values were computed independently with pvlib 0.16.1 `solarposition.get_solarposition`, default NREL-SPA, using geometric `elevation` and `azimuth`. They are fixed numbers in Go tests; pvlib/Python is not a backend build or test dependency.

Map-overlay tests additionally check geometric shadow direction/length, exclusion of the original footprint, courtyard holes and concave outlines, tagged/estimated/unknown-height provenance, historical inspection, time changes, night, coverage clipping, cancellation/deadlines, content-type/body bounds and concurrent cache hits. The produced overlay is passed through the actual `mobile/src/domain/shadows.ts` parser, not a copied validator.

## Opt-in check of downloaded OSM data

Prepare a real snapshot explicitly, then run:

```bash
UMBRA_REAL_DATA="$HOME/.cache/umbra-server/constanta-central-v1/dataset.json" \
  go test ./tests -run TestPreparedPilotSmoke -v -count=1
```

Use the actual cache path if your OS/configuration differs. This opt-in test does not download anything. It finds connected endpoints using the imported graph, calculates a route, and prints model output. The default test suite skips this one because a local real dataset is optional.

To save the request/response for manual HTTP integration checking outside Git:

```bash
UMBRA_REAL_DATA="$HOME/.cache/umbra-server/constanta-central-v1/dataset.json" \
UMBRA_SMOKE_OUTPUT="$HOME/.cache/umbra-server/constanta-central-v1/smoke" \
  go test ./tests -run TestPreparedPilotSmoke -v -count=1
```

With the server running:

```bash
curl --fail-with-body http://127.0.0.1:8000/v1/routes/compare \
  -H 'Content-Type: application/json' \
  --data-binary @"$HOME/.cache/umbra-server/constanta-central-v1/smoke/request.json"
```

The saved request uses a future instant relative to execution; regenerate it if it has become stale. Set both environment variables on this explicit opt-in invocation only. The files contain actual selected endpoints and should not be committed as field evidence.

On 24 October 2026 the local cached-map check produced a 231.8 m route with duration 165.6 s, all exposure unknown, in approximately 0.16 s on the development host. Only one route was returned because no distinct conservative improvement was found. `/health` returned ready and a real HTTP response was accepted by the unchanged mobile parser. This single run is a software integration check, **not** a latency benchmark, field result, or demonstration of shade savings.

The subsequent integration run imported an OSM snapshot timestamped `2026-10-24T14:38:20Z`: 1,023 nodes, 2,428 directed edges, 4,355 buffered building outlines (827 floor estimates, 3 height tags, 3,516 missing heights and 9 unsupported elevated structures). Real HTTP responses for bbox `[28.630,44.170,28.640,44.180]` passed the mobile overlay parser: at `2026-10-24T09:00:00Z`, 906 polygon parts were returned (341 floor-estimated shadow parts and 565 unknown-height footprints); at noon UTC, 913 parts; at 21:00 UTC, `night` with zero daylight polygons. The single daytime calls took approximately 0.64 and 0.79 seconds on the development host. Parts are not unique-building counts. These are isolated software smoke checks, not a benchmark or field accuracy evidence. The actual HTTP route response also passed the current mobile route parser.

## Remaining independent validation

No field shadows, building heights, pedestrian access, crossings, actual walking durations or user exposure reductions have been independently validated. Before claiming practical performance:

1. Select a small connected pedestrian area and review sidewalk sides, crossings and access rules on site.
2. Record building-height sources and uncertainty; review obstructions omitted from OSM before supplying an audit.
3. Collect timestamped sun/shade observations at independently selected route positions and multiple times, including failures.
4. Lock the model and compare fastest and alternative walks on held-out routes/days, measuring sun duration, unknown duration and extra walking time separately.
5. Report route-level counts and error distributions. Do not treat adjacent samples as independent experiments.

Temperature, UV dose and medical outcomes are outside the implemented model and have not been measured. Successful exports or passing tests cannot establish them.
