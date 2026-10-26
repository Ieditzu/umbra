# Umbra

A React Native walking map for Constanța, Mamaia and Palazu Mare with estimated building shadows and shade-aware routes. **The PC calculates routes, sunlight and building geometry; the phone displays the map and reads GPS/compass.** No server address needs to be entered in the app. See [the overview](overview.md).

## Run on your PC and phone

Install Node.js **22.13+** and Expo Go for SDK 58. From the repository root:

```bash
npm --prefix mobile ci
npm --prefix mobile start -- --clear
```

This starts **both the calculation server and Expo**. Stop any older Expo process with **Ctrl+C** first. Scan the new QR code with Expo Go on Android or the Camera app on iPhone. Normally the PC and phone must share Wi-Fi. Keep this command running while using the app; **Ctrl+C** stops both processes it started.

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
- Tap **Unde mergi?** or long-press the map to choose a destination. Routes attach to walking segments and refresh after useful movement or a minute.
- Tap **Acum** to change date/time. At night no daylight shadow polygons are drawn.
- Tap **3D** or drag vertically with two fingers. iOS **Hartă** uses MapLibre and a free OpenFreeMap basemap; no Google iOS key is needed. **Satelit** uses Apple imagery. Android retains its native Google map and terrain layer.
- **Straturi** controls map style and shadows. Missing OSM heights get a display-only 6 m building volume, excluded from shadow calculations. OSM omissions and geometry budgets can limit detail.
- **Setări** contains the maximum walking detour.

The city snapshot has 50,071 walking nodes, 111,552 directed edges and 51,428 building outlines. The server reads the existing compressed snapshot from `mobile/assets/data/constanta-city.json`; no separate download/preparation step is needed. It decodes/indexes the data in two Node worker threads. The app no longer loads that dataset or performs route/shadow calculations. Server responses are compressed and bounded; the renderer keeps a limited geometry cache. The GPU still draws 3D on the phone, so this does not establish a device frame-rate guarantee.

The PC must stay on and reachable for new routes, buildings and shadows. **There is no automatic on-phone calculation fallback.** Basemap tiles and address search also need their providers. An installed standalone app will need a deployed HTTPS backend configured by the developer with `EXPO_PUBLIC_API_URL`; this implementation is configured for PC testing through Expo.

GPS origin/destination, chosen time and viewport are sent to the PC for calculation. The server does not write those requests to disk or request logs; bounded viewport-result caches exist in server memory. Map style, 3D, shadow visibility, selected date/time and detour preference are saved locally on the phone and restored on reopening. Map controls save automatically; the detour screen uses **Salvează**. **Acum** remains a live clock when selected. GPS, destination and routes are not persisted. OpenFreeMap/Apple/Google handle their own map/search requests. See [server architecture and privacy](docs/backend/mobile-server.md) and [data provenance](docs/mobile-data.md).

Unknown heights, missing obstructions, trees, weather and terrain remain uncertain. Unmodeled exposure is not counted as shade. These are experimental geometric estimates, not field-validated temperature, UV or route-safety measurements.

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

To prepare a replacement city dataset from a local OSM extract:

```bash
cd server
go run ./cmd/umbra prepare --city --extract /absolute/path/to/city-osm.json --data /absolute/path/to/city/dataset.json
cd ../mobile
node scripts/prepare-city.mjs /absolute/path/to/city/dataset.json
```

Review coverage, height provenance and generated metadata before replacing the snapshot. Preserve ODbL attribution. Go 1.24+ and Python/pyosmium are data-preparation tools only.

Historical parking-camera documents remain in `docs/`; the previous README is in [the archive](docs/archive/README.previous.md).
