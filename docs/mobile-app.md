# Umbra mobile foundation

## Scope

The current app is native React Native, not the removed React/Vite parking application. `mobile/src/app/` contains Expo Router screens; `components/` contains native UI, `domain/` contains pure validation/types, `services/` contains the calculation-service adapter, and `state/` contains transient planning state and persistent preferences.

The native basemap comes from Google Maps on Android and Apple Maps on iOS through `react-native-maps`. It is not a source of building heights for the future OSM shadow engine. Native map providers may have different building displays and coverage. A visible 3D building does not establish an available, measured height in OSM.

### Initial OSM coverage check

On 24 October 2026, a direct OSM API check of bbox `28.630,44.170,28.640,44.180` in Constanța returned 826 ways tagged `building`, 245 with `building:levels`, and none with `height`. Example: [way 47705352](https://www.openstreetmap.org/way/47705352) had `building:levels=4`. This is a small, nonrepresentative sample and counts only building ways, not a complete building/part/relation inventory. [Reproducible API query](https://api.openstreetmap.org/api/0.6/map?bbox=28.630,44.170,28.640,44.180).

Floor counts can support approximate extrusion, but floor height, roofs and building parts still need modelling and validation. Do not assign a precise measured height or trustworthy shadow coverage to the remaining footprints by default. This coverage check is not validation of any calculated shadow.

## Phone setup

1. In `mobile/`, run `npm ci` and `npm start`.
2. Open the project using Expo Go for SDK 58. The app has been upgraded from SDK 57 to match the current iPhone Expo Go release. If Metro was running before the upgrade, stop it, run `npm ci`, then `npx expo start --clear`. Scan the new QR code rather than reopening an old recent-project entry. Physical iPhones can only install the current Expo Go release from the App Store.
3. Allow foreground location. A live blue dot replaces a manually selected origin. The camera follows the dot until you pan; the location button resumes following. A stale fix is hidden rather than presented as live.
4. Tap **Unde mergi?** for an address in Constanța, or long-press the map to set a destination. Android's native geocoder requires foreground location permission. No origin/destination A/B form is displayed.
5. Tap **Acum** at the top for the shadow time. Current-time shadows refresh by minute; a selected date/time stays fixed. The layer button opens shadow visibility and the height-source legend.
6. Set the maximum extra duration and service URL in **Setări**. Only these preferences persist. Points, results and selected departure time do not persist.

There is no background location tracking or analytics SDK. GPS watching stops when the app leaves the foreground and resumes on return if permission remains granted. Native maps/geocoding use their providers' network services. With a destination and a configured service, routes update automatically after useful movement (25 m, throttled to at least 10 seconds), input changes, or one minute. Visible map bounds and the selected instant are sent for enabled shadow overlays. These controls do not govern the server's own retention policy.

## Calculation-service contract

The Go service in `server/` implements the route and map-shadow contracts. Prepare its OSM snapshot and start it as described in `docs/backend/README.md`, then configure its reachable base URL in Settings. The client posts JSON to `<base URL>/v1/routes/compare`:

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

The response must contain `schema_version: 1`, the exact requested `departure_at`, a valid `generated_at`, a nonempty `method`, `warnings: string[]`, `attribution: string[]`, and one to three `routes`.

Each route contains a unique `id`, a unique `kind` (`fastest`, `balanced` or `shadiest`), positive `distance_m` and `duration_s`, and nonempty `segments`. A segment contains at least two `{latitude, longitude}` coordinates, positive `duration_s`, and `exposure` equal to `shade`, `sun` or `unknown`.

The client requires a fastest baseline, connected segments, total segment duration matching route duration within one second, endpoints within 150 m of requested points, and alternatives within the accepted detour. Unknown exposure remains a separate gray category; it is not counted as shade. Source warnings and attribution are displayed. All exposure is labelled estimated.

The server must additionally verify pedestrian access, lawful crossings, coverage, height quality, solar geometry and exposure at traversal time. Client validation cannot establish physical accuracy or route safety. The initial walking speed does not model signals or stops.

Requests time out after 20 seconds. Changing inputs or leaving the foreground cancels outstanding requests and stale responses cannot replace current results. No fallback invents route geometry or shadow metrics. A restarted app restores only the service URL and detour preference.

## Map-shadow overlay contract

The frontend requests `POST /v1/shadows` with `{ "at": "2026-10-24T12:00:00.000Z", "bounds": [28.630, 44.170, 28.640, 44.180] }`. Bounds are west/south/east/north. Requests debounce viewport movement by 500 ms and time out after 15 seconds. Old server/viewport/time responses are discarded. Hiding the layer or backgrounding the app cancels requests and hides the overlay.

The response is a GeoJSON `FeatureCollection` with `at` matching the requested instant, `state` (`available`, `night`, `low_sun`), `features`, `attribution: string[]`, and `warnings: string[]`. An optional `truncated` flag indicates clipping of the result count. Each feature is a closed Polygon in `[longitude, latitude]` order, with `properties.building_id` and `properties.height_source` equal to `osm_height`, `levels_estimate`, or `unknown`. Inner rings are supported.

Known-height shadow polygons are darker; estimated-height shadows are lighter. `unknown` features represent building footprints, not calculated shadow extents, and render as neutral outlines. The client rejects malformed geometry, wrong timestamps and oversized responses. There is no synthetic shadow display or placeholder route in the actual app. The Go service supplies modeled geometry from a prepared real OSM snapshot; it is not field-validated shadow measurement.

Public servers must use HTTPS. Local HTTP is allowed for development only; a physical phone needs the computer's reachable LAN IP, not `localhost`. Native standalone cleartext policies may need explicit development configuration. Do not put server secrets in the app URL or Expo public environment variables.

## Verification and deployment

Run `npm run typecheck`, `npm run lint`, `npm test`, and both platform exports from `mobile/`. Domain/API tests check invalid coordinates, stale responses, malformed geometry, unknown exposure, detour limits, endpoint configuration and cancellation. Fixtures are not field results.

An export checks Metro bundling, not native map rendering, permissions or geocoding on a phone. Those require a real device or configured emulator/simulator. Before release, test denied/approximate permissions, offline maps, address-search errors, date changes, Android back gestures, large text and iOS safe areas.

The template launcher artwork is provisional. Configure restricted Google Maps credentials for standalone Android builds, choose identifiers under the team's ownership (the current `ro.umbra.mobile` is a development placeholder), and configure signing/EAS only when preparing a native build. No build has been submitted to a store.

### Dependency audit

The SDK-58 dependency audit reports five inherited high-severity findings through Expo CLI's `node-forge`/Zod and certificate dependencies. The earlier SDK-57 audit had nine findings, including the Router URI decoding chain. This is not a clean security audit. Do not use `npm audit fix --force`: its suggested SDK downgrade is incompatible with this app. Keep the development server on a trusted network and resolve or assess the remaining upstream advisories before release. Their exploitability in this app has not been established; the findings remain unresolved.

## References

- [Expo project setup and SDK transition](https://docs.expo.dev/get-started/create-a-project/)
- [SDK 58 native maps](https://docs.expo.dev/versions/v58.0.0/sdk/map-view/)
- [SDK 58 location and geocoding](https://docs.expo.dev/versions/v58.0.0/sdk/location/)
- [OSM building-height and 3D tagging](https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings)
