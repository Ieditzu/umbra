# Bundled mobile pilot data

`mobile/assets/data/constanta-central.json` is a real OpenStreetMap-derived database, **not a recording, prediction fixture or measured shadow map**. It is bundled so Expo Go and installed apps calculate locally without a server. Its size is approximately 2 MB. It is intentionally tracked; do not replace it with synthetic geometry to make the demo look better.

The snapshot covers walking paths in the central-Constanța pilot (approximately longitude 28.630–28.640 and latitude 44.170–44.180) and building outlines in a 500 m buffer. Routing and rendered geometry stay within the projected pilot boundary. The geographic bounding rectangle is approximate because UTM north is rotated relative to true north.

The manifest beside the dataset records the OSM base timestamp, import time, SHA-256 checksum and counts: 1,023 nodes, 2,428 directed edges and 4,355 building outlines. The 26 October 2026 snapshot contains 3 explicit height tags, 827 floor-count estimates, 3,516 missing heights and 9 unsupported elevated footprints in the buffered area. These are data-availability counts, not accuracy measurements. Most heights remain unavailable.

## License and attribution

Database source: **© OpenStreetMap contributors**. The source and derived database are licensed under **Open Database License 1.0 (ODbL-1.0)**. This database license is separate from the repository's software license.

- [OSM copyright, attribution and data access](https://www.openstreetmap.org/copyright)
- [ODbL 1.0 license text](https://opendatacommons.org/licenses/odbl/1-0/)

Preserve attribution when distributing the app, produced maps and exported data. The database is supplied in the editable JSON form used by the app; any distributed adapted database remains subject to the ODbL's applicable share-alike obligations. No independent completeness or field-validation claim accompanies the data. The app displays attribution in its existing map layer/results panels.

## Reproduce or update

Using Go 1.24+ for developer preparation only:

```bash
cd server
go run ./cmd/umbra prepare
cd ../mobile
node scripts/prepare-pilot.mjs /absolute/cache/path/from/prepare/dataset.json
npm test
```

Preparation uses a read-only Overpass query. The exact endpoint, OSM snapshot time and query SHA-256 remain in the dataset metadata. A cached snapshot is reused unless the developer explicitly passes `prepare --refresh`. The packaging script rounds metric values to millimetres without removing geometry, changing access filters or inventing heights, and writes a manifest/checksum. Inspect the data and rerun mobile and reference tests before publishing an update. Release users do not need Go or Overpass access.

## Geometry dependency

Local polygon boolean operations use `polygon-clipping` under its [MIT license](polygon-clipping-LICENSE.md). Preserve this notice in redistribution. It has no custom native module and works with the existing Expo Go runtime. The Go reference tool separately retains its `simplefeatures` notice in `docs/backend/`.
