# Data provenance and licensing

## Pilot and cache

The default reference pilot is a small central Constanța area around 28.630–28.640 E and 44.170–44.180 N. The separate `--city` extract covers Constanța, Mamaia and Palazu Mare within 28.50–28.75 E and 44.075–44.355 N, including a margin. Routing uses the selected area's metric rectangle (see README); bounds include all four projected corners. Buildings have a 500 m metric buffer. Ways use source OSM node IDs; no arbitrary geometric connections are inserted. The optional `--extract` import accepts a local reference-complete OSM JSON crop, with snapshot/source checksums recorded; it does not make an Overpass request.

`umbra prepare` downloads public OSM elements via the read-only Overpass interpreter, not the editing API, raster map tiles, or Nominatim. It stores the raw query response plus the normalized metric JSON dataset outside Git. The dataset records:

- OSM base timestamp and local import timestamp;
- provider endpoint and SHA-256 identifying the query/provider;
- CRS and exact metric pilot/import boundaries;
- original building tags, identifiers and height source;
- node/way identifiers and pedestrian-position reliability;
- excluded-edge and skipped-building counts;
- attribution/license and an explicit lack of field validation.

A provider/query change invalidates reuse of the normalized cache during explicit preparation. Repeated preparation with the same provider/query reuses it. Normal serving never contacts OSM. A raw response is reused if the normalized file is absent. `--refresh` explicitly redownloads the selected area and regenerates the snapshot. Cache updates use temporary files and atomic replacement; a failed import does not overwrite the previously usable normalized dataset. Restart the service to load a changed snapshot.

No map snapshot, cache, database, binary, or local smoke-test output is committed. `server/.gitignore` excludes local `bin/`, `data/`, `cache/` and coverage output. The default OS cache directory is outside the repository. If you override the path, use an external or ignored directory.

## Observed import on 24 October 2026

The development import with OSM base timestamp `2026-10-24T14:03:36Z` contained:

| Item | Count |
|---|---:|
| Retained walking nodes | 1,023 |
| Directed walking edges | 2,428 |
| Building outlines including buffer | 4,355 |
| Buildings with accepted OSM height tags | 3 |
| Buildings with floor-count height estimates | 827 |
| Buildings with missing heights | 3,516 |
| Unsupported elevated/roof-only structures | 9 |

These are import counts for one snapshot, not independent ground-truth measurements. The buffer explains why the building count exceeds the smaller sample in the mobile setup notes. Counts may change after refresh. The inventory has **not** been audited complete; no actual-sun percentage or actual shade improvement follows from these counts.

## License and provider use

Every successful comparison contains `© OpenStreetMap contributors`, the ODbL 1.0 license designation, and a link to the copyright page in `attribution`. The mobile contract already displays attribution. Preserve that attribution in demonstrations, screenshots, exports and derived products. Distributed derivative databases carry ODbL obligations; retain the source extract and provenance when sharing such data. The repository's software license is separate from the data license.

The importer uses one sequential bounded query and an identifying project User-Agent. Public Overpass infrastructure has availability and usage limits. Do not automate repeated refreshes, ignore rate limits, or distribute clients that each download the pilot on every request. For heavier use, choose an appropriate extract/self-hosted data service and observe its terms. No tile prefetching or bulk raster-tile downloads are performed.

References checked during implementation:

- [OpenStreetMap copyright and ODbL](https://www.openstreetmap.org/copyright)
- [Overpass API public instances and usage guidance](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances)
- [OSMF API policy](https://operations.osmfoundation.org/policies/api/) distinguishing editing API use from read-only alternatives
- [OSM access tagging](https://wiki.openstreetmap.org/wiki/Key:access)
- [OSM building heights](https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings)
