# Umbra

A React Native mobile app for planning walks with less estimated exposure to direct sunlight. The first study area is intended to be Constanța, Romania. See [the project overview](overview.md).

## Start

From the repository root:

```bash
npm --prefix mobile start -- --clear
```

On first setup or after dependency updates, run `npm --prefix mobile ci` first. Stop any previous Expo server with **Ctrl+C**, then scan the new QR code with **Expo Go** on your phone.

## Start the backend

Requires **Go 1.24+**. The Go backend lives in `server/` on this integrated branch (and on `master` after the PR is merged).

First setup, from this repository's root:

```bash
cd server
go run ./cmd/umbra prepare
go run ./cmd/umbra serve --addr 0.0.0.0:8000
```

`prepare` downloads and caches the Constanța pilot data outside Git. It may take a few minutes and needs internet. Serving uses that local snapshot without downloading on requests.

For subsequent starts, from this repository's root:

```bash
cd server
go run ./cmd/umbra serve --addr 0.0.0.0:8000
```

Keep the backend running in its terminal and start the mobile app in another. Check readiness with:

```bash
curl http://127.0.0.1:8000/health
```

In the app, open **Setări → Server** and enter `http://YOUR_COMPUTER_LAN_IP:8000`. Find the computer's addresses with `hostname -I` on Linux and choose its reachable LAN address. Phone and computer must be on the same network. Do not enter `localhost` or `0.0.0.0` as the phone's server address.

This backend provides route comparisons and the `/v1/shadows` map-overlay endpoint for a limited central-Constanța pilot. It does not cover the whole city. Choose a daytime instant using the map clock to inspect shadows; current nighttime returns no daylight shadow polygons.

## Current implementation

The Android/iOS application lives in [`mobile/`](mobile/). It uses Expo SDK 58, TypeScript and Expo Router.

Only iOS and Android are enabled. Open the QR code in Expo Go, not as a browser website. A web-bundling error does not mean that a successfully bundled iOS app failed; restart Metro after changing platform configuration.

- A full-screen native map with continuous foreground location, camera following and recentering.
- A single **Unde mergi?** destination search; long-press the map to choose a destination. There are no A/B input fields or tutorial panels.
- A time selector and a validated map-shadow overlay client, refreshed by minute and viewport.
- Departure date/time and a maximum extra walking-time preference.
- Local preference storage without saving coordinates or route history.
- A typed, validated client contract for comparing fastest, balanced and shade-oriented routes.
- Segment colors for estimated shade, sun and **unknown** exposure when a calculation service returns real data.

The Go API serves calculated building shadows and walking-route comparisons from cached OSM data. Missing-height buildings are neutral footprint outlines, not invented shadows. All results are model estimates, not field validation. The native basemap is separate from the OSM shadow calculation layer.

## Run on your phone

Use Node.js 22.13+ and npm. Install Expo Go on your phone, then:

```bash
cd mobile
npm ci
npm start -- --clear
```

Scan the QR code using Expo Go on Android or the Camera app on iOS. Keep the phone and computer on the same network. If local networking fails, try `npx expo start --tunnel` (which can require an additional tunnel package).

Use Expo Go for SDK 58. Physical iPhones cannot install an older Expo Go from the App Store. If you previously started the SDK-57 project, stop Metro with Ctrl+C, run `npm ci`, then `npx expo start --clear` and scan the new QR code. Native maps require internet; Android address search also requires foreground location permission. Map selection remains available if location permission is denied.

For an already configured Android emulator, use `npm run android`. iOS simulators require macOS/Xcode. Standalone Android builds need a restricted Google Maps SDK key; Expo Go uses its own configuration. See [mobile setup and API contract](docs/mobile-app.md).

## Checks

```bash
cd mobile
npm run typecheck
npm run lint
npm test
npm run export:android
npm run export:ios
```

Exports verify JavaScript bundling; they are not installable APK/IPA files or proof of on-device behavior. Domain tests use clearly synthetic fixtures, not measured routing results.

## Next implementation milestone

Independently validate shadows and walking paths in the pilot area and test the complete flow on physical phones. Expand coverage only after reviewing data quality. Missing heights must remain uncertain or explicitly estimated. A shaded route is not a temperature, UV-dose or medical-safety guarantee.

The previous parking-camera implementation was removed. Its documents remain historical material in `docs/`; the former root README is preserved at [`docs/archive/README.previous.md`](docs/archive/README.previous.md).
