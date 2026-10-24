# Umbra mobile foundation

## Scope

The current app is native React Native, not the removed React/Vite parking application. `mobile/src/app/` contains Expo Router screens; `components/` contains native UI, `domain/` contains pure validation/types, `services/` contains the calculation-service adapter, and `state/` contains transient planning state and persistent preferences.

The native basemap comes from Google Maps on Android and Apple Maps on iOS through `react-native-maps`. It is not a source of building heights for the future OSM shadow engine. Native map providers may have different building displays and coverage. A visible 3D building does not establish an available, measured height in OSM.

### Initial OSM coverage check

On 24 October 2026, a direct OSM API check of bbox `28.630,44.170,28.640,44.180` in Constanța returned 826 ways tagged `building`, 245 with `building:levels`, and none with `height`. Example: [way 47705352](https://www.openstreetmap.org/way/47705352) had `building:levels=4`. This is a small, nonrepresentative sample and counts only building ways, not a complete building/part/relation inventory. [Reproducible API query](https://api.openstreetmap.org/api/0.6/map?bbox=28.630,44.170,28.640,44.180).

Floor counts can support approximate extrusion, but floor height, roofs and building parts still need modelling and validation. Do not assign a precise measured height or trustworthy shadow coverage to the remaining footprints by default. This coverage check is not validation of any calculated shadow.

## Phone setup

1. In `mobile/`, run `npm ci` and `npm start`.
2. Open the project using a matching Expo Go version. SDK 57 was deliberately selected according to Expo's physical-device guidance during the SDK 58 transition.
3. Tap **A** and a map point for the origin; tap **B** and a map point for the destination. The first origin selection automatically switches to destination selection.
4. Alternatively, use the search icon for an address in Constanța, or the location icon for a one-time current-location lookup. Android's native geocoder requires foreground location permission. Search is only submitted explicitly, not on every keystroke.
5. Choose **Acum**, another date or another time. The device's time zone and an unambiguous UTC instant are sent to the service.
6. Set the maximum extra duration in **Preferințe**. It persists across restarts. Points, results and selected departure time do not persist.

There is no background location tracking or analytics SDK. Native maps/geocoding use their providers' network services. Coordinates are sent to the configured calculation endpoint only when the user requests a comparison. This does not control the server's own retention policy.

## Calculation-service contract

**No server is included yet.** Set a base URL in Preferences only when a compatible service exists. The client posts JSON to `<base URL>/v1/routes/compare`:

```json
{
  "schema_version": 1,
  "origin": { "latitude": 44.1733, "longitude": 28.6383 },
  "destination": { "latitude": 44.176, "longitude": 28.642 },
  "departure_at": "2026-10-25T09:00:00.000Z",
  "departure_timezone": "Europe/Bucharest",
  "max_extra_minutes": 5,
  "walking_speed_mps": 1.4
}
```

The response must contain `schema_version: 1`, the exact requested `departure_at`, a valid `generated_at`, a nonempty `method`, `warnings: string[]`, `attribution: string[]`, and one to three `routes`. These fields are a proposed integration contract, not an existing external API.

Each route contains a unique `id`, a unique `kind` (`fastest`, `balanced` or `shadiest`), positive `distance_m` and `duration_s`, and nonempty `segments`. A segment contains at least two `{latitude, longitude}` coordinates, positive `duration_s`, and `exposure` equal to `shade`, `sun` or `unknown`.

The client requires a fastest baseline, connected segments, total segment duration matching route duration within one second, endpoints within 150 m of requested points, and alternatives within the accepted detour. Unknown exposure remains a separate gray category; it is not counted as shade. Source warnings and attribution are displayed. All exposure is labelled estimated.

The server must additionally verify pedestrian access, lawful crossings, coverage, height quality, solar geometry and exposure at traversal time. Client validation cannot establish physical accuracy or route safety. The initial walking speed does not model signals or stops.

Requests time out after 20 seconds. Changing inputs or leaving the foreground cancels outstanding requests and stale responses cannot replace current results. No fallback invents route geometry or shadow metrics. A restarted app restores only the service URL and detour preference.

Public servers must use HTTPS. Local HTTP is allowed for development only; a physical phone needs the computer's reachable LAN IP, not `localhost`. Native standalone cleartext policies may need explicit development configuration. Do not put server secrets in the app URL or Expo public environment variables.

## Verification and deployment

Run `npm run typecheck`, `npm run lint`, `npm test`, and both platform exports from `mobile/`. Domain/API tests check invalid coordinates, stale responses, malformed geometry, unknown exposure, detour limits, endpoint configuration and cancellation. Fixtures are not field results.

An export checks Metro bundling, not native map rendering, permissions or geocoding on a phone. Those require a real device or configured emulator/simulator. Before release, test denied/approximate permissions, offline maps, address-search errors, date changes, Android back gestures, large text and iOS safe areas.

The template launcher artwork is provisional. Configure restricted Google Maps credentials for standalone Android builds, choose identifiers under the team's ownership (the current `ro.umbra.mobile` is a development placeholder), and configure signing/EAS only when preparing a native build. No build has been submitted to a store.

### Dependency audit

The initial SDK-57 dependency audit reports nine inherited findings (six high, three moderate), including Expo CLI's `node-forge`/Zod dependencies and Expo Router's URI decoding chain. This is not a clean security audit. Do not use `npm audit fix --force`: its suggested SDK downgrade is incompatible with this app. Keep the development server on a trusted network and resolve or assess these upstream advisories before release. Their exploitability in this app has not been established; the findings remain unresolved.

## References

- [Expo project setup and SDK transition](https://docs.expo.dev/get-started/create-a-project/)
- [SDK 57 native maps](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/)
- [SDK 57 location and geocoding](https://docs.expo.dev/versions/v57.0.0/sdk/location/)
- [OSM building-height and 3D tagging](https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings)
