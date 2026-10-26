# Mobile and server verification

Current runtime uses the PC computation server; earlier sections record the preceding on-device implementation. Software checks performed on 26 October 2026. These are desktop execution/bundling checks, not measurements of mobile frame rate or shadow accuracy in the street.

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

## Building continuity during zoom

The zoom update passes all 58 Node tests, TypeScript checking, lint and both Metro/Hermes exports. Regression checks cover partial viewport replacements retaining previous geometry, identical-result updates doing no source work, empty truncated results preserving buildings, bounded cache eviction favoring incoming geometry, camera-center prioritization, and views wider than half a degree retaining local data.

With the 300 m loading margin, the real-data browser preview loaded 4,011 building polygon parts. Five zoom changes (18 → 15 → 17 → 13 → 18) with repeated partial viewport payloads retained all 4,011 parts and the same source, with zero full replacements or redundant diff calls. A subsequent empty truncated payload also retained the geometry. No browser errors were reported. This checks the embedded renderer in Chromium; physical iPhone zoom/gesture stability remains a device check. Detail is still bounded by the documented geometry/cache limits.

## PC computation backend

The current app calls the Node backend through Metro's `/umbra-api` proxy. The combined `npm --prefix mobile start -- --clear` launcher was exercised with a fresh backend, an existing unrelated Metro on port 8081, automatic Expo selection of port 8082, and shutdown of owned server/Metro children without stopping the unrelated process. The served iOS Expo manifest supplied `hostUri: 127.0.0.1:8082` for the loopback request; the app resolver derived the correct proxied API origin. LAN, emulator and tunnel URL discovery also have unit checks; no physical-phone LAN test is claimed.

The mobile suite now passes 63 Node tests, TypeScript checking and Expo lint. Three backend integration groups pass: HTTP schema/body/gzip/cache behavior; allowed proxy paths and an unavailable backend; and real city worker building/shadow/route results including cancellation. Server requests use the same corrected TypeScript polyline attachment model, rather than reverting to the older Go nearest-node path.

A warm desktop request through the running Metro proxy returned 558 building parts in approximately 139 ms and 147 daytime shadow parts in approximately 272 ms for viewport `[28.633,44.172,28.638,44.177]`. These are single loopback samples, not latency distributions, phone-network benchmarks or frame-rate measurements. Server geometry is capped at 2,500 parts / 70,000 vertices; the browser retains up to 5,000 parts / 120,000 vertices. Display coordinates alone are rounded to six decimals; shadow/source-height uncertainty remains unchanged.

Metro/Hermes exports succeed with approximately 6.3 MB iOS bytecode and 2.8 MB Android bytecode, compared with approximately 13 MB / 10 MB before offloading. The app no longer imports/decompresses/indexes the city snapshot or computes routes/shadow clipping. It still parses responses and renders 3D on the phone. Physical-device responsiveness, connectivity transitions and compass accuracy require device checks. No public backend deployment was made.

## Local preference restoration

Five additional regression tests exercise legacy migration and corrupt data, platform fallback, a fresh store restoring map/3D/shadow/time/detour values, serialization excluding coordinates/URLs, delayed reads merged with early changes, serialized in-flight writes and retry after a storage failure. All 68 mobile tests, TypeScript and lint pass. The map waits for restored preferences and ignores initial zero-pitch readback while applying saved 3D. Physical app-kill/relaunch persistence remains a device check; the tests use the same storage coordinator with an in-memory AsyncStorage-shaped adapter.

Both iOS and Android Metro/Hermes exports also pass for the preference update.

## Romania regions and solar shadow display

All 70 mobile tests, seven backend test groups, TypeScript and lint pass, along with iOS/Android exports. Added tests cover optional map-only shadows without mutating evidence heights, time-dependent geometry and camera-location solar metadata, 3D light mapping/style restoration, regional selection for București/Cluj/Timișoara/Iași, at most four simultaneous tile downloads and reuse, courtyard preservation and tile-edge rejoining. They do not measure source height accuracy.

Live OpenFreeMap checks loaded nine tiles each. The București central window `[26.097,44.431,26.107,44.439]` used 2,429,358 downloaded bytes and decoded 23,098 regional polygon components, returning 1,546 display parts and 1,349 illustrative shadow parts. For `2026-06-21T09:00:00Z` at 44.435° N / 26.102° E the model reported 63.7151° elevation and 136.6548° azimuth. A loopback request through Metro returned the București shadow response in approximately 3.76 seconds on a first region visit. These are one-off desktop samples, not phone/network performance distributions. The iOS embedded renderer was inspected in a 390×844 Chromium preview with the same geometry; this is not a physical iPhone capture.

A Cluj check decoded 16,382 regional polygon components and displayed 912 parts plus 696 illustrative shadow parts in `[23.587,46.768,23.596,46.773]`. Tile-derived heights remain unknown evidence and are used only as labeled display assumptions. Night still yields no daylight polygons.

The Constanța live failure was reproduced: the older running backend returned HTTP 422 `Câmpuri de cerere necunoscute` when receiving the newly added fields. The new backend accepts them; the client now distinguishes a required server restart from generic unavailability. The combined launcher's source watcher was observed restarting its backend while Metro stayed running on port 8093. A current loopback Constanța test returned HTTP 200 with 168 map shadow parts in `[28.633,44.172,28.638,44.177]`.


## City refresh and route start

The app now has 74 passing mobile tests. Added cases cover route progress and endpoint clamping, far-city source replacement without losing tilt, camera restoration, a single retry after backend interruption, and an explicit restart instruction for old-server unknown-field responses. TypeScript/lint and both exports pass. The București HTTP response was also passed through the exact app building validator: 1,546 features, 1,546 unique IDs and valid geometry.

The original browser city-switch check showed 269 rendered extrusion features in the camera after adding București geometry to a previously loaded Constanța source, with the 5,000-part cache cap. This did not reproduce the physical iPhone report. The renderer lifecycle was hardened to reset readiness on page load and use a content-version key, and distant-city changes now rebuild the index. Actual iPhone visibility after reload is still a user/device check. The new route button and compact panel passed bundling/type checks; physical navigation interaction has not been measured.
