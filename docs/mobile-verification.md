# On-device engine verification

Software checks performed on 26 October 2026. These are desktop execution/bundling checks, not measurements of mobile frame rate or shadow accuracy in the street.

- TypeScript checking and Expo lint pass.
- Node tests exercise synthetic geometry/routing cases and the real bundled OSM snapshot with `fetch` disabled. Solar values are checked against the independent SPA reference cases also used by the Go tests, across seasons and the Romanian DST transition.
- Synthetic cases cover courtyard and concave geometry, floor-height uncertainty, missing heights, road-position uncertainty, daylight/night, disconnected paths, building-crossing endpoint snaps, detour limits, traversal timestamps, expired requests and cooperative cancellation.
- iOS and Android Metro/Hermes exports succeed with the bundled data and pure-JavaScript polygon library. The resulting JS bytecode bundle is approximately 4.3 MB per platform. These exports are not signed installable apps.

## Real-data checks

The bundled snapshot has OSM base timestamp `2026-10-26T09:40:41Z`; its checksum and import metadata are in `mobile/assets/data/manifest.json`.

A connected real OSM path was selected by following imported graph links until its endpoint was more than 200 m from its origin. The Go reference and TypeScript engine were given the same request. The fastest path measured:

| Engine | Distance | Duration |
| --- | ---: | ---: |
| Go reference using the unrounded cache | 231.803923 m | 165.574231 s |
| TypeScript using the millimetre-rounded bundle | 231.803644 m | 165.574031 s |

The small difference follows the packaging precision. This path's modeled exposure was entirely unknown in both implementations; it is not evidence of a useful shade improvement. Matching this one path does not establish equivalence of all routing candidates.

For viewport `[28.630, 44.170, 28.640, 44.180]` at `2026-10-24T09:00:00Z`, the local engine produced 906 polygon parts and passed the existing shadow-geometry contract validator. Polygon parts include neutral missing-height footprints and are not all shadows or distinct buildings. The test makes no network calls. Nighttime returns no daylight shadow polygons. Viewports extending beyond the pilot carry the partial-coverage flag.

## Remaining device and field checks

Open the app on a physical iPhone/Android device, allow GPS and choose a destination inside the pilot. Confirm that routes appear with no backend running, change the clock and check the shadow layer, pan rapidly and background/foreground the app. For a standalone build, verify calculations after a fully offline restart; basemap tiles and address search may still be unavailable offline.

Measure warm/cold calculation latency, memory and interaction responsiveness on real phones before claiming performance. Independently measure building heights and shadow edges on site before claiming geometric accuracy. The project has not yet performed these checks in this implementation.
