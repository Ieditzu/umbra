# Umbra

A React Native app for planning walks with less estimated direct-sun exposure. **Sun position, building shadows and walking routes run on the phone. No API server or server address is required.** Bundled data cover Constanța, Mamaia and Palazu Mare, Romania. See [the overview](overview.md).

## Start

Use Node.js 22.13+ and Expo Go for SDK 58. From the repository root:

```bash
npm --prefix mobile ci
npm --prefix mobile start -- --clear
```

Stop any previous Expo server with **Ctrl+C**, then scan the new QR code with Expo Go on Android or the Camera app on iOS. Normally the computer and phone share a network. The computer only serves the development bundle; it does not calculate routes or shadows. Installed native builds do not require a running computer. Expo Go still needs Metro to load/reload the development project.

Only iOS and Android are enabled; open the app in Expo Go rather than a web browser. If switching from the older SDK-57 project, reinstall dependencies and scan a fresh QR code. For configured emulators, use `npm --prefix mobile run android` or `npm --prefix mobile run ios` (iOS requires macOS/Xcode).

## Use

- Allow foreground location. The map follows your live position; panning stops following and the location button resumes it.
- Tap **Unde mergi?** or long-press the map to choose a destination. Routes recalculate after useful movement or a minute.
- Tap **Acum** to select a different date/time. Shadows follow that instant; at night there are no daylight shadow polygons.
- Use the **3D** button or drag vertically with two fingers to tilt the map. On iOS, **Hartă** renders bundled OSM building outlines using MapLibre, with a free OpenFreeMap basemap: no Google key or paid account. Missing-height buildings have a **display-only 6 m placeholder**, excluded from shadow calculations. **Satelit** uses Apple imagery/Flyover where available. Android keeps its native Google renderer and terrain layer. **Straturi** contains map choices, shadow visibility and height-source notices.
- **Setări** contains the maximum accepted walking detour. There is no server field.

Calculations use a compressed real OSM snapshot bundled with the app (approximately 7 MB packaged, 40 MB decoded): 50,071 walking nodes, 111,552 directed edges and 51,428 building outlines. The city extract spans approximately `28.50–28.75° E, 44.075–44.355° N`, including Constanța, Mamaia, Palazu Mare and a margin. It replaces the central-only pilot; this rectangle is not an administrative boundary. Snapshot [metadata and checksums](mobile/assets/data/manifest.json) and [license/provenance](docs/mobile-data.md) are included.

The calculation engine works without network access. **Basemap tiles and address search still use OpenFreeMap/Apple/Google services and may need internet.** GPS is used only in the foreground. Coordinates, viewport and selected time are not sent to an Umbra server. Map/search providers have their own data handling. OpenFreeMap receives viewport-dependent tile requests, not Umbra route calculations.

Unknown heights and incomplete obstruction inventory remain uncertain. Unmodeled areas are not automatically called sunny. Routes are experimental geometric estimates, not temperature/UV measurements or validated route-safety advice. Real-phone performance and shadow accuracy still require device/field checks.

## Checks

```bash
cd mobile
npm run typecheck
npm run lint
npm test
npm run export:android
npm run export:ios
```

`npm ci` also regenerates the bundled iOS renderer; after editing `mobile/map-web/map.js`, run `npm --prefix mobile run build:map`.

Tests cover independent solar references, geometry, routing constraints, cancellation and real bundled data with network calls disabled. See the [recorded software verification](docs/mobile-verification.md). Exports verify JavaScript bundling, not on-device rendering; they are not installable APK/IPA files. Standalone Android builds require a restricted Google Maps key and native builds require signing; see [mobile documentation](docs/mobile-app.md).

## Data preparation and reference backend

The Go implementation remains an optional research/reference tool; **it is not needed to run the mobile app**. Developers can build a city dataset from a local OSM extract, then package it:

```bash
cd server
go run ./cmd/umbra prepare --city --extract /absolute/path/to/city-osm.json --data /absolute/path/to/city/dataset.json
cd ../mobile
node scripts/prepare-city.mjs /absolute/path/to/city/dataset.json
```

See [data preparation](docs/mobile-data.md) for downloading a source extract and reproducible cropping. Go 1.24+ and Python/pyosmium are developer tools only. Review changed coverage, height provenance and the generated manifest before committing updated map data. The snapshot is ODbL-1.0; preserve attribution and its license notice. Default Go `prepare` still retains its separate central reference pilot.

To run the optional reference API separately:

```bash
cd server
go run ./cmd/umbra serve --addr 127.0.0.1:8000
```

See [backend documentation](docs/backend/README.md). The mobile app never calls it.

Historical parking-camera documents remain in `docs/`; the previous README is in [the archive](docs/archive/README.previous.md).
