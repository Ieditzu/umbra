# Geometry and routing model

## Coordinate system and Sun

Geometry uses WGS84 / UTM zone 35N, EPSG:32635, in metres. A pure-Go Transverse Mercator forward/inverse implementation is restricted to this pilot near the zone's central meridian. Tests compare a reference coordinate independently computed with PROJ. Latitude/longitude are used only at import/API boundaries and for astronomical calculation, not as metric lengths.

Solar position uses the NOAA/Meeus equations for geometric elevation and true-north azimuth at an explicit UTC instant. The solar ray's bearing is projected into the local grid, accounting for UTM meridian convergence. Each sample uses its geographic location. Tests compare five independently precomputed pvlib/NREL-SPA values in Constanța in summer/winter and across the autumn DST transition. This is algorithm cross-checking, not field validation of the shadows. Refraction and a local terrain horizon are not modeled; elevations below 5 degrees are left unknown.

## Buildings and heights

An OSM building is a vertical opaque prism over its footprint. Multipolygons preserve outer rings and courtyard holes. A ground point is in the building's cast shadow if its ray toward the Sun enters the footprint at a ray height below the roof. This is equivalent to intersecting the ground with the swept/extruded footprint shadow and supports concave outlines without a convex-hull shortcut.

Heights retain provenance in the local dataset:

- `osm_height_tag`: an unambiguous positive numeric `height` in metres, optionally with an ` m` suffix. It is an **OSM tag**, not independently measured by this project.
- `estimated_from_levels`: floor count multiplied by an assumed 2.5–3.5 m/floor, with 0–3 m roof allowance on the upper bound. These are heuristic bounds, not established physical limits or confidence intervals. Both sweeps are tested: disagreement becomes unknown; agreement on obstruction is returned as **estimated** shade with a source warning.
- `missing`: no parsable height or floor count. No substitute height is invented. An intersecting ray remains unknown unless another modeled building already obstructs it.
- `unsupported_elevated`: positive `min_height` / `building:min_level` or roof-only geometry cannot be treated as a solid ground-level prism, so the uncertain ray is unknown.

Ambiguous ranges, semicolon values, feet and malformed numbers are not guessed. Buildings outside the fetch buffer, trees, canopies, temporary obstacles and terrain can affect the result. Absence from OSM does not mean absence in the world.

By default **unobstructed modeled rays remain unknown**, not sun, because the obstruction inventory is not verified complete. The pilot can still return modeled shade from a known footprint and compare a conservative exposure bound. Positive shade is conditional on OSM geometry, flat ground, and stated height assumptions. A finer real-world uncertainty model remains research work.

An operator may attach an obstruction-inventory audit with `prepare --refresh --audit /path/audit.json`. This is an explicit reviewed assertion, not something the program manufactures. JSON fields are:

```text
area: a Polygon represented as arrays of rings of {"x": metre_easting, "y": metre_northing}
max_obstacle_height_m: a positive audited height ceiling
source: nonempty reference to the inventory review
reviewed_at: a dated review record
```

Use EPSG:32635 and closed rings. Review ALL obstructions relevant to direct sunlight, including vegetation and structures absent from OSM. `sun` requires that the ray corridor out to `max_height / tan(elevation)` stays inside both this reviewed polygon and the imported area, and does not meet any unresolved obstruction. A local point observation of sunshine is not an inventory audit for other dates. No real audit is bundled and the downloaded pilot has none. Audits and building heights must be rechecked after changes to the site.

## Pedestrian graph

Only connections present in OSM node/way topology are used. Crossing lines do not connect unless they share a mapped node. The importer does not create links across courtyards, buildings, roads or gaps and does not infer sidewalk offsets. Edges intersecting building interiors are excluded. Building-boundary contact alone is allowed. Polygonal pedestrian plazas are not converted into synthetic shortcuts.

Public `footway`, `pedestrian`, `path` and `steps` ways are eligible. Stair, covered-path, bridge/tunnel/nonzero-layer exposure is unknown because a ground-level shadow is insufficient. Selected public `residential`, `living_street` and `service` ways may provide mapped walking connectivity, but road-centerline exposure is always unknown. Ways tagged `sidewalk=separate` are excluded so separately mapped paths must provide connectivity. Other road classes are excluded from this small pilot. This deliberately incomplete policy can produce disconnected routes rather than guessing where walking is allowed.

The importer respects `foot`, `access`, `oneway:foot`, restricted barriers, and excludes conditional-access ways it cannot interpret. General vehicle one-way tags do not impose pedestrian one-way restrictions. Access, conditional or temporary rules absent from OSM remain unknown; public access and crossings still require field verification. Stairs are not a wheelchair-accessibility claim. Walking time uses geometric length / speed with no extra slope, stairs, traffic-signal or waiting-time penalty.

## Alternatives and traversal time

First, ordinary metric Dijkstra finds the fastest route on the eligible prepared graph at the requested constant speed. A bounded deterministic set of shadow-weighted and diversity-penalized Dijkstra runs generates candidates. Candidate generation uses approximate arrival times from fastest distances to guide its weights; it is not an exact dynamic-programming optimizer.

Each candidate is then evaluated independently on its own traversal clock. Every edge is sampled at most 10 m and 10 s apart, classifying each piece at its midpoint time/location. Sun motion is recomputed for those instants. A segment is therefore a discretized estimate, not an exact shadow-boundary intersection. The clock starts at the snapped origin node. There are at most 20,000 sample pieces per candidate and 5,000 output exposure segments. Deadline/cancellation checks bound work. Adjacent pieces with the same label are merged while preserving their geometry.

Unknown duration is never counted as shade. The selection score is `sun_seconds + unknown_seconds`, a conservative upper bound on modeled possible-sun time, not a measurement of actual sunshine. An alternative must improve this score by more than 1 s and fit the same extra-duration budget. Longer all-unknown walks do not count as improvements. The lowest-score candidate is labeled `shadiest` **among evaluated candidates**. A distinct shorter compromise may be `balanced`; duplicate geometries are not returned. No global optimum is claimed. Detour budget zero still permits a distinct equal-duration candidate.

Night (solar center below -0.833 degrees) and near-horizon periods return `unknown` with an explicit reason. When the entire planning interval is dark/low Sun, only the fastest candidate is considered. No nighttime benefit is described as shade.

## Displayed map polygons

`POST /v1/shadows` projects each usable building's vertical prism away from the Sun and unions the footprint, translated footprint, and swept exterior/interior boundary faces. It then subtracts the original footprint and clips to the pilot/viewport. Concavities and courtyard holes are preserved; a convex hull is not used. The pinned `simplefeatures/geom` library performs polygon overlays in metres. Output is converted to WGS84 GeoJSON rings.

Tagged heights produce `osm_height` polygons. Floor-count estimates produce `levels_estimate` polygons using their lower assumed height, not a claimed mean or measured height. Missing/elevated geometry produces `unknown` footprint outlines. The map is a geometric visualization, not evidence that unshaded pixels are sunny or that all obstructions are known. Results at the solar cutoff/night have no daylight shadow polygons. A pilot-center solar position is used for this small-area display; route samples continue to use their own time/location.

## Contract coordination proposals

The existing contract is implemented unchanged. For a future coordinated frontend/backend version consider per-segment height/position provenance, sun-exposure bounds, explicit night classification and snapped endpoints with access distances. These would avoid placing all explanations in global warnings. They are proposals only; schema version 1 still has exactly `shade`, `sun`, `unknown` and the existing route fields.

## References

- [NOAA solar calculation details](https://gml.noaa.gov/grad/solcalc/calcdetails.html) and its published Meeus-based calculation spreadsheet. NOAA notes that its web calculator is no longer actively supported; this service does not call that calculator.
- [pvlib solar-position documentation](https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.solarposition.get_solarposition.html) for the independent numerical test references.
- [EPSG:32635 definition via PROJ](https://proj.org/en/stable/operations/projections/utm.html).
- [OSM building tagging](https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings).
- [Simple Features polygon operations](https://github.com/peterstace/simplefeatures/tree/v0.59.0), MIT license; see [license notice](simplefeatures-LICENSE.txt).
