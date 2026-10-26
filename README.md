# Umbra

A React Native app for planning walks with less estimated direct-sun exposure. **Sun position, building shadows and walking routes run on the phone. No API server or server address is required.** The current study area is a small pilot in central Constanța, Romania. See [the overview](overview.md).

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
- Open **Straturi** for map/satellite views and the **Clădiri 3D** switch on both iOS and Android. iOS uses Apple Maps/Flyover where available; Android also offers its native terrain layer. Actual 3D detail depends on provider coverage. The panel also contains shadow visibility, height sources and coverage limitations. Missing-height buildings appear as neutral footprints.
- **Setări** contains the maximum accepted walking detour. There is no server field.

Calculations use an approximately 2 MB real OSM snapshot bundled with the app: 1,023 walking nodes, 2,428 directed edges and 4,355 buffered building outlines, imported on 26 October 2026. Routing is limited to the pilot near `28.630–28.640° E, 44.170–44.180° N`; this is not whole-city coverage. Snapshot [metadata and checksum](mobile/assets/data/manifest.json) and [license/provenance](docs/mobile-data.md) are included.

The calculation engine works without network access. **Basemap tiles and address search still use Apple/Google services and may need internet.** GPS is used only in the foreground. Coordinates, viewport and selected time are not sent to an Umbra server. Native map/search providers have their own data handling.

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

Tests cover independent solar references, geometry, routing constraints, cancellation and real bundled data with network calls disabled. See the [recorded software verification](docs/mobile-verification.md). Exports verify JavaScript bundling, not on-device rendering; they are not installable APK/IPA files. Standalone Android builds require a restricted Google Maps key and native builds require signing; see [mobile documentation](docs/mobile-app.md).

## Data preparation and reference backend

The Go implementation remains an optional research/reference tool; **it is not needed to run the mobile app**. Developers can update the bundled OSM snapshot with Go 1.24+:

```bash
cd server
go run ./cmd/umbra prepare
cd ../mobile
node scripts/prepare-pilot.mjs /absolute/path/to/prepared/dataset.json
```

`prepare` prints the cache path. It reuses an existing snapshot; use `prepare --refresh` only for an intentional update. Review changed coverage, height provenance and the generated manifest before committing updated map data. The snapshot is ODbL-1.0; preserve attribution and its license notice.

To run the optional reference API separately:

```bash
cd server
go run ./cmd/umbra serve --addr 127.0.0.1:8000
```

See [backend documentation](docs/backend/README.md). The mobile app never calls it.

Historical parking-camera documents remain in `docs/`; the previous README is in [the archive](docs/archive/README.previous.md).
