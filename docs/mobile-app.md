# Umbra mobile

## Architecture

The native React Native app uses Expo SDK 58 and Expo Router. `mobile/src/app/` contains screens; `components/` contains native UI; `domain/` contains contracts/validation; `engine/` contains the pure TypeScript solar, geometry, exposure, overlay and routing calculations. `services/localEngine.ts` loads the bundled OSM dataset once and caches four shadow layers. `state/` holds transient planning state and the persistent detour preference.

**There is no runtime API dependency.** The Go engine in `server/` remains a data-preparation and reference implementation. The unused HTTP adapter remains available for reference contract tests, but no mobile screen imports it. Old saved API URLs are ignored and removed when preferences are saved. Coordinates and results are not persisted by Umbra.

The approximately 2 MB pilot snapshot is installed with the app, including in release builds. There is no compulsory first-run network download or automatic data refresh. Its bounds, date, counts, reproducible preparation command and ODbL attribution are documented in [mobile-data.md](mobile-data.md). Native Apple/Google basemaps and geocoding are separate network services; a visible 3D building in a basemap is not a source of OSM height data.

## Phone setup

1. In `mobile/`, run `npm ci` and `npm start -- --clear`.
2. Open the fresh QR code using Expo Go for SDK 58. Physical iPhones require the current Expo Go release. Stop any old Metro server before restarting.
3. Allow foreground location. The camera follows your live blue dot until you pan; the location button resumes following.
4. Tap **Unde mergi?** or long-press the map for a destination in the pilot. Native Android geocoding requires foreground location permission.
5. Tap **Acum** to select shadow time; current-time shadows refresh each minute. The layer button shows visibility, source legend and coverage notices.
6. Set the maximum detour in **Setări**. Only this preference persists. No server field is displayed.

Expo Go needs the development bundle from Metro, but performs the calculations on the device. An installed standalone build needs no computer. Native maps/address search may need internet even though the calculation engine does not.

## Local calculations

`initializeDataset` validates schema/CRS, connected edge endpoints, finite geometry and closed building rings, recomputes lengths and height provenance, and creates a 100 m building index. Geometry is in WGS84 / UTM zone 35N metres, including solar grid convergence.

`solarPosition` uses NOAA/Meeus equations at the actual UTC instant, tested against independent SPA reference values across seasons and DST. Overlay polygons sweep complete building prisms away from the Sun, preserving concavities and courtyards with the pure-JavaScript `polygon-clipping` library. The building footprint is subtracted, then geometry is clipped to the viewport and pilot. Limits are 2,000 polygons, 60,000 output vertices, 1,024 input vertices and 64 rings per polygon. Omitted operations and truncation remain explicit warnings.

Tagged heights are distinguished from assumed floor-count heights (2.5–3.5 m/floor plus up to 3 m for roofs). The displayed floor-count shadow uses the lower height. Missing/elevated heights display footprints, not invented shadows. Below 5° solar elevation there are no calculated daylight polygons; below −0.833° the state is night.

Routes use directed Dijkstra on the imported public walking graph. Endpoints must be inside the pilot and within 75 m of an existing node; snapping across a building is rejected. Off-network access is excluded from distance/time. Twelve bounded shadow/diversity-weighted searches generate candidates. Exposure is re-evaluated along each candidate at its own traversal times, at most 10 m/10 s apart. Unknown exposure is penalized as possible sun, never counted as shade. Without a complete obstruction audit the engine does not infer direct sun from absent OSM obstructions. Alternatives must improve modeled sun-plus-unknown time and respect the accepted detour; otherwise only fastest is returned.

Pure TypeScript work yields to the event loop after approximately 6 ms between operations, supports AbortSignal, and has computation budgets (18 s routing, 12 s overlays). Individual polygon operations are synchronous and cannot be interrupted internally; vertex caps bound them. This is cooperative scheduling on the JS thread, not a native background worker or a phone-frame-rate guarantee. The UI debounces viewport updates 500 ms, rejects stale results, and cancels on input changes, layer hiding or backgrounding.

GPS runs only in the foreground, with stale fixes hidden. Routes refresh after movement of at least 25 m (minimum 10 s between movement refreshes), input changes or one minute. Umbra sends no coordinates, viewport or timestamps to a calculation server. Native map/search providers handle their own requests.

## Validation and limitations

Run `npm run typecheck`, `npm run lint`, `npm test`, and both platform exports. Synthetic tests verify mechanisms, not field accuracy. A real bundled-data smoke test disables fetch, constructs a connected walking request and calculates daytime map geometry without a server. Contracts still validate connected routes, exposure categories and detour limits.

The Go reference API uses the same data model but a separate polygon library. Exact vertex order, simplification and candidate sampling can differ. Mobile candidate scoring samples actual polyline distance rather than the chord between edge endpoints. No equivalence of global optima is claimed.

Exports check Metro/Hermes bundling, not native rendering, GPS behavior or performance on a physical phone. Before release, test permissions, offline calculation after app restart, address-search failures, repeated panning/time changes, background cancellation, large text and safe areas. Configure restricted Google Maps credentials for standalone Android, owned application identifiers and signing. Template artwork and `ro.umbra.mobile` are provisional; no store submission has been made.

Flat-ground shadows ignore trees, clouds, terrain and temporary obstacles; missing heights and OSM completeness remain uncertain. Walking speed is constant without signal/stop delays. These outputs are not field-validated temperature, UV or collision-safety measurements.

### Dependency audit

The SDK-58 dependency audit reports five inherited high-severity findings through Expo CLI's node-forge/Zod and certificate dependencies. Their exploitability here has not been established; they remain unresolved. Do not use `npm audit fix --force` to downgrade to an incompatible Expo SDK.

## References

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)
- [polygon-clipping implementation and license](https://github.com/mfogel/polygon-clipping)
- [OSM attribution](https://www.openstreetmap.org/copyright)
