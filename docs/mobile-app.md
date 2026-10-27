# Umbra mobile

## Architecture

The native React Native app uses Expo SDK 58 and Expo Router. `mobile/src/app/` contains screens; `components/` contains native UI; `domain/` contains contracts/validation; `engine/` contains the pure TypeScript solar, geometry, exposure, overlay and routing calculations. `services/calculations.ts` calls the PC API; the former `localEngine.ts` adapter remains a desktop reference helper. `state/` holds transient planning state and persistent map/time/detour preferences.

**Current default: calculations run on the PC.** `services/calculations.ts` discovers the server through the Expo connection and validates responses. `server/compute/` runs the shared TypeScript engine in Node worker threads using the existing city snapshot. No mobile screen imports the dataset loader or performs routing/clipping locally. The Go engine remains a separate preparation/reference tool. See [mobile computation server](backend/mobile-server.md).

The approximately 7 MB compressed city snapshot (40 MB decoded) stays in the repository for the server to load. It covers Constanța, Mamaia, Palazu Mare and a margin; provenance is in [mobile-data.md](mobile-data.md). It is no longer imported into the mobile bundle. Native geocoding and OpenFreeMap/Apple/Google basemaps remain separate services. Server computation and map-display geometry do not resolve missing source heights.

## Phone setup

1. In `mobile/`, run `npm ci` and `npm start -- --clear`. The latter starts both the PC calculation server and Metro.
2. Open the fresh QR code using Expo Go for SDK 58. Physical iPhones require the current Expo Go release. Stop any old Metro server before restarting.
3. Allow foreground location. The camera follows your live blue dot until you pan; the location button resumes following.
4. Tap **Unde mergi?** or long-press the map for a destination in the pilot. Native Android geocoding requires foreground location permission.
5. Tap **Acum** to select shadow time; current-time shadows refresh each minute. **Straturi** contains map/satellite views, a **Clădiri 3D** switch, shadow visibility and height-source/coverage notices. The **Înclină / Sus** map button controls camera tilt independently. **Hartă** uses the free local MapLibre renderer on iOS and Android; iOS satellite uses Apple `hybridFlyover` and Android satellite/terrain use Google Maps. Neither provider imagery nor display-only building heights supply data to the shadow engine.
6. Set the maximum detour in **Setări**. Map style, 3D, shadow visibility and selected date/time also persist locally. No server field is displayed.

Two-finger vertical dragging tilts the map directly, including on iOS; no prior 3D toggle is required. Camera readback synchronizes the camera control without modifying the saved 3D layer switch. Manual map gestures suspend GPS camera-following. Recentring and destination/route framing preserve the chosen pitch. iOS satellite keeps the same Flyover basemap while the angle changes, avoiding a native map-type reload.

During a viewport refresh, overlapping building/shadow geometry for the same instant remains visible until replacement data arrive. The local map retains up to 1,500 canopy/trunk features and 75,000 vertices across nearby viewports or time refreshes and prioritizes the current camera center. Tree models can remain visible while time-dependent shadows refresh; disabling the tree layer clears the cache. Its status remains loading; geometry from a different time or a disjoint viewport is not reused. Hiding the relevant layers clears their display. Stable polygon keys and memoized elements avoid remounting the overlay on unrelated screen clicks.

Expo Go loads its development bundle from Metro and reaches the PC calculation server through the same origin. Keep the PC running. A standalone release needs a deployed HTTPS backend configured at build time; no hosted deployment is included. Basemap/address providers are separate network dependencies.

## Local preferences

`preferenceStore.ts` uses AsyncStorage under the existing `umbra.preferences.v1` key, extending legacy detour-only records. `domain/preferences.ts` validates map style, booleans, permitted detour values and the optional ISO instant; unsupported iOS terrain falls back to map. **Acum** stores null and keeps advancing. An explicitly selected date/time restores that exact instant, including for historical shadow inspection; it does not advance to a new day automatically.

Map controls persist immediately after interaction. The detour screen retains its **Salvează** action. Writes are serialized so older asynchronous saves cannot replace newer changes. User changes during initial reading merge with restored fields. Read/write failures are surfaced and a failed unchanged save can be retried. Merely loading defaults does not write over existing preferences.

The map mounts after preferences are read; the restored 3D layer setting is independent of the initial top-down camera. The detour screen also derives its initial value from hydrated preferences. GPS, camera coordinates, destination, results, dialogs and obsolete API URLs are excluded from persistence. Only local configuration is stored; the PC backend is not needed to restore it.

## Free building and tree display

The iOS and Android wrappers select `LocalRouteMap` for **Hartă**; satellite and Android terrain stay on `NativeRouteMap`. The local map runs bundled MapLibre GL JS 6.16.0 inside SDK-58's Expo-Go-included WebView 14.0.1. It needs no Google iOS key, paid account or custom native build. The visible design takes the bright map, pale building volumes and compact blue controls as references from [Plimb's public App Store screenshots](https://apps.apple.com/us/app/plimb-cucere%C8%99te-harta/id6788684964), retaining Umbra's routing workflow.

`engine/buildings.ts` runs on a server worker and extracts full polygons and courtyard holes from the same snapshot, independently of shadow visibility or time. Each server request loads up to 2,500 polygon parts / 70,000 vertices, prioritizing the actual camera center when limited (not the center of a tilted horizon bounding box). A 150 m margin preloads nearby geometry. Wide views are clipped to the local dataset before projection. Zoom in for denser detail. OSM omissions remain omissions. Heights use the tagged value or lower floor estimate; missing/unsupported heights retain `height: 0` for calculations and receive a separate **display_height: 6** solely for the visual model. Optional lighter map-only shadows can use these volumes; they never improve route exposure estimates. They do not represent measured elevations.

The WebView and sources remain mounted on ordinary UI updates; GPS, time, destination and shadow changes update individual sources. The previous building geometry remains until a new viewport result arrives. The browser retains up to 5,000 building parts / 120,000 vertices across viewports. Incoming parts have priority at the cap. Stable feature IDs drive incremental `updateData` additions/removals; unchanged geometry causes no source update, and an empty truncated result cannot clear the cache. Cache eviction under those caps still limits wide-view detail. Two-finger tilt, long-press destination selection, route framing and the GPS accuracy circle are supported. Explicitly switching between satellite and map replaces the renderer.

`map-web/map.js` contains browser behavior. `scripts/build-local-map.mjs` bundles both MapLibre and its worker using esbuild into `src/generated/localMapHtml.ts`; run `npm run build:map` after editing it. `npm ci` regenerates it automatically. The embedded renderer can retain already received geometry on a plain background, but new geometry requires the PC server; optional base tiles/style/fonts come from [OpenFreeMap](https://openfreemap.org/) and need connectivity. No CDN script is executed. Its tile requests reveal the viewed area to that provider; GPS/time/route/viewport requests now go to the PC server; the basemap provider does not receive those calculation requests. Attribution remains visible. The MapLibre license is embedded and copied to `docs/licenses/maplibre-gl.txt`.

The bridge validates coordinates and viewport messages. External navigation is restricted to attribution links. Generation/abort guards discard stale viewport results. Browser checks and platform exports do not establish WKWebView performance on physical iPhones.

## Shared calculations on the PC

Node workers decompress the gzip/base64 snapshot with a declared-size limit before building the graph and spatial index. The former cooperative `unpackDataset` helper remains available for independent desktop engine tests, rather than the phone runtime. `initializeDataset` validates schema/CRS, connected edge endpoints, finite geometry and closed rings, recomputes lengths/heights and creates a 100 m building index. Geometry is in WGS84 / UTM zone 35N metres, including solar grid convergence. Each worker loads the dataset once per server process. Overlay generation uses nearby indexed footprints and prioritizes modeled shadows over neutral outlines at the feature budget. Routing candidate searches prune edges that cannot fit the accepted detour using an admissible geometric lower bound; long ray queries visit only touched grid cells.

`solarPosition` uses NOAA/Meeus equations at the actual UTC instant, tested against independent SPA reference values across seasons and DST. Overlay polygons sweep complete building prisms away from the Sun, preserving concavities and courtyards with the pure-JavaScript `polygon-clipping` library. The building footprint is subtracted, then geometry is clipped to the viewport and pilot. Limits are 2,000 polygons, 60,000 output vertices, 1,024 input vertices and 64 rings per polygon. Omitted operations and truncation remain explicit warnings.

Tagged heights are distinguished from assumed floor-count heights (2.5–3.5 m/floor plus up to 3 m for roofs). The displayed floor-count shadow uses the lower height. Missing/elevated heights display footprints, not invented shadows. Below 5° solar elevation there are no calculated daylight polygons; below −0.833° the state is night.

Routes use directed Dijkstra on the imported public walking graph. Endpoints must be inside coverage and within 75 m of an accessible walking polyline. Request-local virtual nodes split the actual directed geometry at each projected point, including both directions and two endpoints on the same edge; the shared snapshot remains unchanged. Nearby accessible segments are tried when a closer connector crosses another building. A GPS fix or address inside its own building can project outside that footprint, with an explicit unverified-entry warning. This does not invent an entrance or route through the building. Off-network access is excluded from distance/time/exposure. Missing graph connectivity and connectors through other buildings still fail. Twelve bounded shadow/diversity-weighted searches generate candidates. Exposure is re-evaluated along each candidate at its own traversal times, at most 10 m/10 s apart. Unknown exposure is penalized as possible sun, never counted as shade. Without a complete obstruction audit the engine does not infer direct sun from absent OSM obstructions. Alternatives must improve modeled sun-plus-unknown time and respect the accepted detour; otherwise only fastest is returned.

Pure TypeScript work yields to the event loop after approximately 6 ms between operations, supports AbortSignal, and has computation budgets (18 s routing, 12 s overlays). Individual polygon operations are synchronous and cannot be interrupted internally; vertex caps bound them. This shared scheduling runs within Node worker threads, separate from the HTTP loop; it is not a phone-frame-rate guarantee. The UI debounces viewport updates 500 ms, rejects stale results, and cancels on input changes, layer hiding or backgrounding.

GPS runs only in the foreground, with stale fixes hidden. `useDeviceHeading` separately watches the device compass after a location fix is available; it does not use GPS travel direction. A ground-projected blue sector updates while stationary on both renderers, using true heading when available or calibrated magnetic heading as a fallback. Circular smoothing crosses north along the short arc and updates at most ten times per second. The sector disappears for uncalibrated/invalid readings, readings older than ten seconds, absent GPS, or backgrounding. Pending sensor subscriptions are removed on teardown/resume races. Heading updates change only a map source/polygon, without recentering the camera or recalculating routes. Sensor behavior still needs physical-device testing. Routes refresh after movement of at least 25 m (minimum 10 s between movement refreshes), input changes or one minute. Umbra sends route coordinates, viewport/focus and timestamps to the PC calculation server without disk persistence or request logging. Map/search providers handle their own requests.

## Validation and limitations

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:server`, and both platform exports. Synthetic tests verify mechanisms, not field accuracy. A real bundled-data smoke test disables fetch, constructs a connected walking request and calculates daytime map geometry without a server. Contracts still validate connected routes, exposure categories and detour limits.

The Go reference API uses the same data model but a separate polygon library. Exact vertex order, simplification and candidate sampling can differ. Mobile candidate scoring samples actual polyline distance rather than the chord between edge endpoints. No equivalence of global optima is claimed.

Exports check Metro/Hermes bundling, not native rendering, GPS behavior or performance on a physical phone. Before release, test permissions, clear failures when the PC is unreachable, address-search failures, repeated panning/time changes, background cancellation, large text and safe areas. Configure restricted Google Maps credentials for standalone Android, owned application identifiers and signing. Template artwork and `ro.umbra.mobile` are provisional; no store submission has been made.

Flat-ground shadows include simplified mapped tree canopies, but ignore unmapped trees, clouds, terrain and temporary obstacles; missing heights and OSM completeness remain uncertain. Walking speed is constant without signal/stop delays. These outputs are not field-validated temperature, UV or collision-safety measurements.

### Dependency audit

The SDK-58 dependency audit reports five inherited high-severity findings through Expo CLI's node-forge/Zod and certificate dependencies. Their exploitability here has not been established; they remain unresolved. Do not use `npm audit fix --force` to downgrade to an incompatible Expo SDK.

## References

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)
- [polygon-clipping implementation and license](https://github.com/mfogel/polygon-clipping)
- [Expo SDK 58 WebView](https://docs.expo.dev/versions/v58.0.0/sdk/webview/)
- [OpenFreeMap](https://openfreemap.org/)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
- [OSM attribution](https://www.openstreetmap.org/copyright)


## Romania map layers

Building and shadow requests outside the bundled city use bounded OpenFreeMap regions prepared on the PC; see [regional backend details](backend/mobile-server.md). Search no longer appends Constanța, so cities such as București can be located. A far-away destination frames that city rather than the midpoint of a cross-country origin/destination pair. The current route graph remains the prepared Constanța graph. The persistent **Umbre orientative** toggle controls visual render-height/fallback shadows; it does not change route exposure. The layer panel shows the server's Sun elevation/azimuth at the camera location. Native maps and iOS MapLibre render the estimated category more lightly; iOS extrusion lighting uses the same Sun direction.


## Route start and renderer lifecycle

The selected route exposes **Pornește traseul**. Starting enables camera-follow at zoom 18 (native MapKit altitude 220 m), replacing the alternatives with a destination header, remaining time/distance, estimated arrival and **Ieși**. The expand icon fits the full route without ending navigation; the location icon recenters at navigation zoom and resumes following. Manual map gestures pause camera-follow. Route recalculations do not force overview while navigating, and subsequent GPS fixes preserve the camera zoom. Map controls sit above the measured bottom panel. Foreground fixes project onto the route polyline to estimate remaining route distance/time; off-route or missing GPS states are shown. Arrival also requires proximity to the actual destination, rather than only the snapped graph endpoint. Destination changes stop the session. Navigation state and GPS are transient; saved map preferences remain independent. This is route following; maneuver instructions and voice guidance are not implemented. Existing routing coverage is unchanged.

The embedded HTML exports a content hash used as the WebView key/base URL. Renderer updates mount a fresh page; `onLoadStart` resets readiness before resending data, and the last camera is restored. City jumps beyond 0.25° refresh the source index/cache instead of combining distant city data. Nearby viewport updates retain the incremental cache. One bounded retry after a connection failure/503 helps bridge backend reloads; cancellation and the overall request deadline still apply. These changes require a complete Expo Go reload after upgrading; physical iPhone confirmation remains necessary.


## Tree coverage and model

The server loads a derived Romania OSM tree/row snapshot (`romania-trees.json`, Geofabrik source dated 2026-10-25T21:21:21Z). The reproducible extractor is `scripts/extract-trees.py`; the raw PBF remains outside Git. The snapshot contains 78,814 individually mapped trees and 3,650 mapped rows; a rectangular Constanța region contains 639 individual trees and a rectangular București region 49,150. These are counts of mapped features, not a complete inventory.

Canopies use recorded height and crown diameter when usable, otherwise 8 m height and 6 m diameter; the canopy base is assumed at 40% of height. Individual trees are cylindrical and mapped rows are contiguous strips with assumed width, so gaps, crown shape and leaf transmission are simplified. Deciduous or unknown foliage is omitted November–March (UTC month), and evergreen/needleleaved trees retain foliage. Green canopy polygons and estimated shadows appear with the shadow and estimates controls enabled. The server displays at most 500 nearby tree records per view within the existing overall geometry budget. Truncation and absent source data do not prove no trees exist.

Routes in the existing Constanța graph use ray/canopy intersection at estimated passage times and mark tree-derived shade `estimated_shade`, distinct from building-derived shade and unknown. Candidate scoring gives estimated tree shade half the penalty of unknown exposure; it is not verified or a measurement of UV or temperature. The visibility switch affects map display, not route calculation. Further validation against photographs or surveyed trees is needed.


### Constanța satellite canopy supplement

The PC server also loads `mobile/assets/data/constanta-canopy.json`, a derived 4 m canopy mask from the [Meta/WRI High Resolution Canopy Height Map](https://registry.opendata.aws/dataforgood-fb-forests/) (Tolan et al. 2024, WRI and Meta, CC BY 4.0; source imagery © Maxar). The corresponding source tile is `120323002`; imagery in the Constanța pilot spans 2019–2020 and Tomis Mall/Tomis Nord imagery is dated 2019-10-21. The data is a prediction, not an individual-tree inventory, and may contain errors or changes since acquisition.

`scripts/extract-canopy.py` reprojects and averages the raster onto a 4 m UTM grid; cells with estimated height ≥3 m and ≤60 m are polygonized, simplified, and clipped out of known OSM building footprints and a small buffer around mapped trees and rows. Contiguous pixels become canopy areas, not artificially generated individual trees. Raster clipping is approximate, can remove genuine trees near buildings and can still retain non-tree false positives. The server treats each area as an approximate canopy prism with height from the raster and unknown foliage: dormant November–March. Estimated shadows and route influence remain uncertain. Geometry is limited to the existing Constanța city dataset; other cities continue to use OSM trees and rows.

On the iOS and Android **Hartă** renderer, the **Clădiri 3D** switch displays procedural low-poly tree models with trunks and rounded crowns, using estimated canopy heights. Satellite-derived canopy patches and tree rows use multiple deterministic illustrative positions inside each mapped area, avoiding polygon holes; individually mapped OSM trees retain one model. These are not surveyed individual trees. Models are limited to 700 per viewport and shared evenly among visible patches, rendered with shared Three.js meshes, and fall back to simple volumes if initialization fails. The models remain visible from directly above when the switch is on; camera tilt is independent. With models off, the 2D view uses flat green canopy outlines when estimates are enabled. Blue-grey polygons represent estimated shadows. Models load even with shadows hidden. Satellite and terrain native maps currently display flat canopy polygons.
