# On-device engine verification

Software checks performed on 26 October 2026. These are desktop execution/bundling checks, not measurements of mobile frame rate or shadow accuracy in the street.

- TypeScript checking and Expo lint pass.
- Node tests exercise synthetic geometry/routing cases and the real bundled OSM snapshot with `fetch` disabled. Solar values are checked against the independent SPA reference cases also used by the Go tests, across seasons and the Romanian DST transition.
- Synthetic cases cover courtyard and concave geometry, floor-height uncertainty, missing heights, road-position uncertainty, daylight/night, disconnected paths, building-crossing endpoint snaps, detour limits, traversal timestamps, expired requests and cooperative cancellation.
- Initial central-only iOS and Android Metro/Hermes exports succeeded with approximately 4.3 MB bytecode per platform. The later city exports are recorded below. These exports are not signed installable apps.

## Real-data checks

The earlier central-only snapshot had OSM base timestamp `2026-10-26T09:40:41Z`. The following reference comparison records that historical pilot; the current city snapshot and its checksums are in `mobile/assets/data/manifest.json`.

A connected real OSM path was selected by following imported graph links until its endpoint was more than 200 m from its origin. The Go reference and TypeScript engine were given the same request. The fastest path measured:

| Engine | Distance | Duration |
| --- | ---: | ---: |
| Go reference using the unrounded cache | 231.803923 m | 165.574231 s |
| TypeScript using the millimetre-rounded bundle | 231.803644 m | 165.574031 s |

The small difference follows the packaging precision. This path's modeled exposure was entirely unknown in both implementations; it is not evidence of a useful shade improvement. Matching this one path does not establish equivalence of all routing candidates.

For viewport `[28.630, 44.170, 28.640, 44.180]` at `2026-10-24T09:00:00Z`, the local engine produced 906 polygon parts and passed the existing shadow-geometry contract validator. Polygon parts include neutral missing-height footprints and are not all shadows or distinct buildings. The test makes no network calls. Nighttime returns no daylight shadow polygons. Viewports extending beyond the pilot carry the partial-coverage flag.

## City coverage and native layers update

The replacement city extract uses source snapshot `2026-10-25T21:21:21Z`: 50,071 walking nodes, 111,552 directed edges and 51,428 building outlines. It includes Constanța, Mamaia and Palazu Mare with a margin. The mobile wrapper is approximately 7 MB of gzip/base64 JSON, decoding to approximately 40 MB of normalized data. Decode/validation and all calculations run locally; tests disable fetch for the real-data flow.

The central viewport now returns 937 polygon parts without partial coverage. Additional daytime viewports produced the following results (parts can be shadows or neutral missing-height footprints, not distinct buildings):

| Viewport | Modeled shadow parts | Total parts |
| --- | ---: | ---: |
| Inel II | 142 | 360 |
| Tomis Nord | 141 | 263 |
| Mamaia | 25 | 78 |
| Palazu Mare | 43 | 222 |
| Poarta 6 | 17 | 66 |

All five viewports are inside coverage. The connected city-graph smoke walk is approximately 240.58 m; it is a different graph/request from the historical pilot comparison, so no performance or accuracy improvement is inferred from its length. Full-city checks cover spatial ray indexing, long low-sun shadows and admissible detour pruning. All 39 mobile Node tests pass, including streaming UTF-8 decoding and packed/raw checksums. The importer has a separate pyosmium fixture check retaining inner rings, original references and access tags. Go race tests/vet and TypeScript/lint checks pass.

Metro/Hermes exports for both iOS and Android succeed with the city bundle (approximately 10 MB bytecode per platform). Native layers support standard/hybrid maps and 3D camera tilt on both platforms; iOS uses satellite Flyover when selected, while Android additionally offers native terrain. Tests verify the platform mapping, not provider imagery availability. The 3D switch preserves camera-following behavior; actual imagery and elevation detail depend on native provider coverage.

## Remaining device and field checks

Open the app on a physical iPhone/Android device, allow GPS and choose a destination inside the pilot. Confirm that routes appear with no backend running, change the clock and check the shadow layer, pan rapidly and background/foreground the app. For a standalone build, verify calculations after a fully offline restart; basemap tiles and address search may still be unavailable offline.

Measure warm/cold calculation latency, memory and interaction responsiveness on real phones before claiming performance. Independently measure building heights and shadow edges on site before claiming geometric accuracy. The project has not yet performed these checks in this implementation.
