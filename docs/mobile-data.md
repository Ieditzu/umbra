> Current runtime: the Node server on the PC loads this snapshot; it is no longer imported into the mobile app. The on-device packaging details below describe the shared snapshot and previous runtime. See [PC server setup](backend/mobile-server.md).

# Bundled Constanța city data

`mobile/assets/data/constanta-city.json` holds a real OpenStreetMap-derived database in an openly decodable `umbra-gzip-json-v1` wrapper: base64-encoded gzip, approximately 7 MB packaged and 40 MB decoded. It replaces the small central pilot. It is bundled so calculation needs no server or download. It is not a recording, synthetic fixture or measured shadow map.

The city extract covers approximately 28.50–28.75 E and 44.075–44.355 N: Constanța, Mamaia, Palazu Mare and a margin. This is a rectangle, not an administrative-boundary polygon. Its metric bounds include all four projected corners in UTM 35N; buildings have a 500 m buffer. Paths can still be disconnected and OSM coverage incomplete.

The source snapshot is `2026-10-25T21:21:21Z`, from Geofabrik's Romania extract. The manifest records packed/raw SHA-256 checksums, source PBF checksum and import metadata. Counts: 50,071 walking nodes, 111,552 directed edges and 51,428 building outlines. Of the buildings, 271 have explicit height tags, 5,913 use floor-count estimates, 45,159 lack heights and 85 are unsupported elevated footprints. These are availability counts, not accuracy measurements.

The separate `constanta-heights-2012.json` adds Copernicus Urban Atlas Building Block Height 2012 (RO501 v010) samples for 16,243 buildings lacking OSM height and floor tags. `scripts/extract-copernicus-heights.py` transforms OSM polygons to EPSG:3035 and assigns only pixels whose centres fall in exactly one footprint; each height is the median of valid 10 m pixels. Source GeoTIFF SHA-256: `a89e2d4f27391d5515ebc9c6ccce933b7ed55693293762282b96acabc432975f`. The imagery is old; buildings may have changed. Against 47 available OSM height tags the median absolute difference is 4 m, mean absolute difference 11.36 m, and 45% are within 3 m; tags themselves are not surveyed ground truth. The routing range (height minus 5 m to height plus 10 m) is a heuristic, not a validated confidence interval. Estimates do not override OSM tags or measured heights and produce only estimated shade. © European Union, Copernicus Land Monitoring Service 2022, European Environment Agency (EEA). Source: https://land.copernicus.eu/en/products/urban-atlas/building-height-2012.

Suceava uses the Geofabrik Romania OSM snapshot `2026-10-28T21:21:02Z` and the same extraction pipeline, with 34,070 nodes, 68,670 directed edges and 34,056 buildings. Its Copernicus 2012 raster (RO512 v010; SHA-256 `9a9f30085f8d1229adb21dc1cb9639f22c2315b09fbdb5a94655ab41d549fcaf`) supplies estimates for 1,228 buildings without OSM height or floor tags. Comparing 4,739 overlapping OSM height tags gives median absolute difference 6 m and mean absolute difference 5.17 m; these tags are not verified ground truth. No field accuracy is claimed. Provenance and bundle checksums are in `suceava-manifest.json`.

## License and editable source

Database: **© OpenStreetMap contributors**, licensed under **Open Database License 1.0 (ODbL-1.0)**, separately from the software license.

- [OSM attribution and copyright](https://www.openstreetmap.org/copyright)
- [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- [Geofabrik Romania source](https://download.geofabrik.de/europe/romania.html)

Preserve attribution and applicable share-alike obligations when redistributing an adapted database. The app's layer/results panels display OSM attribution. The source representation is standard gzip/JSON, recoverable without proprietary tools:

```python
import base64, gzip, json
from pathlib import Path
packet = json.loads(Path("mobile/assets/data/constanta-city.json").read_text())
Path("/tmp/constanta-editable.json").write_bytes(gzip.decompress(base64.b64decode(packet["payload"])))
```

## Reproduce or update

Only developers need Go 1.24+, Python 3.12 and pyosmium. Keep downloaded PBF/raw extracts outside Git. The source used here was `romania-261025.osm.pbf` from Geofabrik (about 316 MiB); its SHA-256 is in the manifest. Review the source date before intentionally updating.

From the repository root, replacing `/path/cache` with a local cache directory:

```bash
uv run --python 3.12 --with osmium==4.3.0 python scripts/extract-city.py /path/cache/romania-261025.osm.pbf /path/cache/city-osm.json
cd server
go run ./cmd/umbra prepare --city --extract /path/cache/city-osm.json --data /path/cache/city/dataset.json
cd ../mobile
node scripts/prepare-city.mjs /path/cache/city/dataset.json
npm test
```

The crop retains original node/way/relation IDs, complete selected way references, multipolygon inner rings and access/barrier tags. The Go importer retains the existing walking-access filters and excludes building-crossing links. It now indexes footprints during city preparation. A separate `--data` path protects the central reference cache. Public Overpass remains an optional preparation source; repeated failing queries are not needed to run the app.

The packaging script rounds metric coordinates to millimetres, retains geometry and height provenance, removes unused descriptive building tags, and applies deterministic gzip/base64 packaging. It writes both packed/raw checksums and source/height counts. No heights or graph links are invented. Inspect changes and rerun software checks before publishing a new snapshot.

## Dependency notices

Local geometry uses `polygon-clipping` under its [MIT license](polygon-clipping-LICENSE.md). Streaming decompression uses `fflate` under its [MIT license](fflate-LICENSE.md). Neither needs a custom native module. Preserve these notices in redistribution. The Go reference tool separately retains the `simplefeatures` notice in `docs/backend/`.
