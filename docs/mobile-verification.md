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

## Free iOS 3D renderer and map styling

The iOS map view now embeds MapLibre GL JS 6.16.0 and its worker in the SDK-58-compatible WebView 14.0.1. Android retains the native renderer. TypeScript and lint pass; all 47 Node tests pass. Added checks cover viewport budgets and center priority, preserved courtyard rings, display-only fallback elevations without mutating calculation heights, rejected bridge messages, GPS accuracy geometry, source continuity across interactions/style reloads, and monotonic computation budgets under wall-clock changes.

The bundled real-data viewport `[28.628, 44.170, 28.645, 44.181]` produced 2,485 building polygon parts. Of these, 608 have tagged/floor-estimated heights; the remaining 1,877 receive a separate 6 m visual placeholder. All 2,485 can be shown as volumes, but placeholders remain unknown in the exposure engine. At `2026-06-21T09:00:00Z`, 721 modeled shadow parts were independently supplied to the renderer. These counts do not measure physical accuracy.

A Chromium WebGL preview at 390 × 844 pixels showed the real Constanța geometry at zoom 16.5 and pitch 55°. Browser checks confirmed the same building source and all 2,485 parts persisted when clearing shadows, setting a destination and recentering; pitch remained 55°. No browser errors were reported. This was a browser preview of the embedded renderer, not a physical iPhone capture or an end-to-end React Native UI test.

Current Metro/Hermes exports succeed for iOS (approximately 13 MB bytecode including the renderer) and Android (approximately 10 MB, native map). These are bundling checks only. Physical WKWebView rendering, two-finger gestures, memory and performance still require phone checks. Most OSM heights remain unknown, and the display fallback cannot establish actual heights or modeled shade.

## Compass direction and endpoint attachment

The additional checks cover compass quality, true/magnetic heading selection, smoothing through north, stale readings, cardinal-direction sector geometry and renderer source continuity. A browser preview showed the heading sector pointing east from the location dot; the preview injects synthetic sensor values and does not validate a phone magnetometer.

Routing regression cases now cover two interior points on a long street in either direction, a bent polyline, preserved one-way restrictions, unchanged shared graph state, a nearby accessible segment beyond a blocked connector, an address inside its own building with an unverified-entry warning, and endpoints more than 75 m from the graph. The earlier disconnected/building-blocked fixtures were adjusted so they remain disconnected/blocked under segment attachment, rather than only under the previous nearest-node implementation. These tests do not verify pedestrian access on site.

All 55 Node tests, TypeScript checking and Expo lint pass for the combined update. Both iOS and Android Metro/Hermes exports succeed. Physical compass alignment and field access remain unverified.
