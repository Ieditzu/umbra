# Umbra

A React Native mobile app for planning walks with less estimated exposure to direct sunlight. The first study area is intended to be Constanța, Romania. See [the project overview](overview.md).

## Current implementation

The Android/iOS application lives in [`mobile/`](mobile/). It uses Expo SDK 58, TypeScript and Expo Router.

- A native map initially centered on Constanța.
- Start/destination selection by map tap, native address search, or foreground device location.
- Departure date/time and a maximum extra walking-time preference.
- Local preference storage without saving coordinates or route history.
- A typed, validated client contract for comparing fastest, balanced and shade-oriented routes.
- Segment colors for estimated shade, sun and **unknown** exposure when a calculation service returns real data.

**The routing/shadow calculation service is not implemented yet.** The app does not invent routes, shade percentages or weather measurements. Without a configured service, you can test maps, location, address search and planning inputs, but not calculate a shaded route. The native basemap is not the OSM building-shadow model.

## Run on your phone

Use Node.js 22.13+ and npm. Install Expo Go on your phone, then:

```bash
cd mobile
npm ci
npm start
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

Build the calculation service: a verified pedestrian network, building footprints/heights, time-dependent shadow geometry and route optimization under a detour limit. Independently validate shadows and walking paths in the pilot area. Missing heights must remain uncertain or explicitly estimated. A shaded route is not a temperature, UV-dose or medical-safety guarantee.

The previous parking-camera implementation was removed. Its documents remain historical material in `docs/`; the former root README is preserved at [`docs/archive/README.previous.md`](docs/archive/README.previous.md).
