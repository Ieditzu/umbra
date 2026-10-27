# Measuring buildings from their shadows

Research direction and system design agreed on 27 October 2026. This document describes **proposed** work: nothing below is implemented yet, and no field measurement has been made. It replaces the old camera-based research direction in [`research-plan.md`](research-plan.md) and the paperwork in [`competition/`](competition/), which describe the earlier blind-corner camera project and no longer match the app.

## 1. The problem

Umbra plans walking routes through building shade, calculated from OpenStreetMap (OSM) footprints and heights by a server on the PC, with the phone showing the map. A shadow can only be computed for a building with a known height, and most buildings in Constanța have none. The bundled city snapshot ([manifest](../mobile/assets/data/manifest.json)) contains 51,428 buildings:

| Height source | Buildings | Share |
| --- | ---: | ---: |
| OSM `height` tag | 271 | 0.5% |
| Estimated from `building:levels` | 5,913 | 11.5% |
| Elevated or roof-only (not modelled) | 85 | 0.2% |
| **Missing** | **45,159** | **87.8%** |

The obvious fix is a global machine-learning height dataset. We tested the best open one, GlobalBuildingAtlas (GBA) [1], against Constanța's OSM data ([full results](research/gba-heights/README.md)). It covers 79% of buildings, but it **systematically underestimates tall buildings**. Blocks tagged 20–40 m come out about 16 m too low. Blocks with 9–12 floors average 1.36 m per floor, which is physically impossible. Those apartment blocks cast most of the useful street shade, so filling the gap with GBA would shorten exactly the shadows that matter.

The idea: **run Umbra's shadow engine backwards.** The app already knows where the Sun is, very accurately. Measure the length of a building's shadow, and the building's height follows from trigonometry. People with phones, laser meters or drones can measure buildings, and a shared database collects the results and feeds them back into the shadow map and route planning.

## 2. Research question and hypotheses

> **„Poate un telefon să măsoare înălțimea clădirilor din umbra lor, folosind poziția calculată a Soarelui, mai precis decât seturile de date globale — și cât de mult îmbunătățește asta traseele umbrite din Constanța?"**
>
> *Can a phone measure building heights from their shadows, using the computed position of the Sun, more accurately than global datasets — and how much does that improve shaded routes in Constanța?*

| # | Hypothesis | How it is tested |
| --- | --- | --- |
| H1 | With a tape or laser distance measurement, the shadow method is within one floor (±3 m) for at least 80% of buildings with a clear shadow on flat ground. | Field study against surveyed reference heights (§7). |
| H2 | The measured error follows the error model in §3: it grows with the distance-measuring error and with sun elevation, so measuring time can be chosen in advance. | Compare predicted and observed error across times of day and days. |
| H3 | Shadow measurements, even with phone GPS alone, are more accurate than GBA and than the floor-count estimate on the same buildings. | Same reference set, all methods evaluated on identical buildings. |
| H4 | Averaging several independent phone measurements of one building approaches the accuracy of a single laser measurement. | Repeated measurements by different people at different times. |
| H5 | Measured heights change the modelled shade on route segments compared with GBA or floor estimates. | Re-run the routing engine with each height source (§7.5). |

The exact thresholds are fixed before the main field study and are not changed afterwards.

## 3. The physics

### 3.1 Height from a shadow

On flat ground, a vertical edge of height *h* casts a shadow of length *L* away from the Sun:

**h = L · tan(e)**

where *e* is the Sun's elevation above the horizon. The engine already computes *e* and the Sun's azimuth *A* for any place and instant, using the NOAA/Meeus equations, which are tested against independent SPA references ([model](backend/model.md)).

Because the OSM footprint is known, the app knows where the shadow **must** fall. A roof corner at footprint corner *C* casts its shadow tip at

**T = C + h · cot(e) · û**

where *û* is the horizontal unit vector pointing away from the Sun (azimuth *A* + 180°). For every candidate height, the tip lies on one known line. That line is the basis of the measuring ruler in §5.

A roof **edge** casts a shadow line parallel to that edge, offset by *h · cot(e)* along *û*. So any point on the shadow boundary can be measured, not only the tip. This matters when the tip itself is hidden by a car or a tree.

### 3.2 Error model

Differentiating *h = L · tan(e)*:

**δh = tan(e) · δL + L · δe / cos²(e)**, or in relative terms: **δh / h = δL / L + δe / (sin e · cos e)**

- **Sun angle term:** the engine's tests allow at most 0.03° difference from the SPA reference. Unmodelled atmospheric refraction adds about 0.035° at 25° elevation and less at higher elevations. Together they add at most about 0.3% to the height error. Even 0.1° would add under 0.6%. This term is negligible, so the Sun works as a free, near-perfect protractor. A phone's tilt sensor is typically about 1° off, which is why a phone clinometer is worse than this.
- **Length term:** almost the whole error comes from measuring *L*. Each metre of length error becomes *tan(e)* metres of height error. The table below is for Constanța (44.17° N) at solar noon:

| Date | Noon sun elevation | Shadow of a 15 m block | Shadow of a 30 m block | Height error per 1 m of length error | Height error, phone GPS (±5 m) | Height error, laser (±0.3 m) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 21 June | 69.3° | 5.7 m | 11.4 m | 2.64 m | ±13.2 m | ±0.8 m |
| Equinox | 45.8° | 14.6 m | 29.1 m | 1.03 m | ±5.1 m | ±0.3 m |
| 27 October | 32.9° | 23.2 m | 46.3 m | 0.65 m | ±3.2 m | ±0.2 m |
| 21 December | 22.4° | 36.4 m | 72.8 m | 0.41 m | ±2.1 m | ±0.1 m |

The consequence: **a high Sun is bad for measuring.** A summer-noon phone measurement is nearly useless, while the same measurement in the morning or evening, or in autumn, is good. The app should recommend a time window and show the expected error before the user starts.

### 3.3 Umbra and penumbra

The Sun is not a point: its disc is about 0.53° wide. A shadow therefore has a dark core (the **umbra**) and a blurred edge (the **penumbra**). On flat ground the blurred edge is about

**w ≈ h · 0.0093 / sin²(e)** metres wide.

For a 30 m block that is 0.3 m at the summer noon Sun, 0.9 m at the October noon Sun and 1.9 m at the December noon Sun. Users mark the **middle** of the blurred band. Its width sets a lower limit on how precisely *L* can be read.

This produces a trade-off and a real research result:
- **Low Sun:** smaller height error per metre of length error, but long shadows that hit other buildings, plus a wide penumbra.
- **High Sun:** short shadows on open ground, but a large error amplification.

There should be a best elevation window, and H2 tests it.

### 3.4 What breaks the model

- **Rooftop structures.** Lift machine rooms and stair towers on Romanian apartment blocks cast the farthest shadow tip, but they are not the roof height. Measure the shadow of a **roof corner or roof edge**, not the highest point.
- **Sloped ground.** It changes *L* directly. Constanța is mostly flat; the slope is recorded where it is visible.
- **Obstructed tips.** The shadow may land on another building, a tree, a parked car or a fence. Such measurements are rejected rather than guessed.
- **No direct sun.** Clouds or haze give no sharp shadow, so nothing is measured.
- **Overhangs and parapets.** These shift the edge that casts the shadow. The user picks the outermost wall line, and the uncertainty widens by the overhang width where it is known.

## 4. Prior work and data

**Shadow-based height from imagery is well established — from above.**
- Satellite and aerial methods date back decades. A 1999 study measured 20 buildings on KVR-1000 imagery with about 1.7 m RMS error [3].
- A recent deep-learning version detects buildings and shadows with YOLOv7, regresses shadow length with ResNet18 and applies *h = L · tan(e)* across 42 cities [2].
- Street-level work estimates height from photos of the building itself rather than its shadow: EfficientNet on Toronto street views reports 1.21 m MAE [8], and CBHE uses building corners [9].

A quick search found **no** published work measuring building height from shadows at ground level with a phone, combining it with crowdsourced collection and routing. We will state this as "as far as we found", not as a proven first.

**Global height datasets (the baselines).**
- **GlobalBuildingAtlas** [1]: per-building heights. Reported 1.5–8.9 m RMSE by continent; the authors trained on LiDAR mostly from North America, Europe and Oceania. In Constanța it underestimates tall blocks (§1).
- **3D-GloBFP** [4]: 1.9–14.6 m RMSE by region; reported to overestimate.
- **EUBUCCO** [5]: harmonised EU building data with 73% height coverage overall. Romania's heights probably come from OSM; to be checked.
- **Overture** [6]: sparse heights, mostly from US LiDAR.
- **Romanian LiDAR (ANCPI LAKI III)** [7]: covers parts of the south-west and north-east. Constanța is probably outside it, and we found no public download.

**Shadow-detection training data** for future automatic photo analysis: SBU, ISTD and CUHK-Shadow, with about 4k, 1.3k and 10.5k ground-level photos respectively [10]. Shadow detection with segment-anything models is an active topic [11].

**No model training is needed for the core method.** Physics gives the height. Machine learning could later help find the shadow edge in a photo automatically, using a pretrained detector rather than one trained by us. That is a stretch goal, because on-device inference needs a native module.

## 5. Measuring methods

| Method | Equipment | Typical length error | When to use |
| --- | --- | --- | --- |
| **Phone GPS** at the shadow tip, snapped to the ruler line | Phone only | 3–5 m in open sky, worse between blocks (to be measured) | Low sun only; many repeats |
| **Tape or laser distance** from the wall corner to the tip, typed into the app | Tape measure or laser meter | ~0.1–0.3 m plus the penumbra | Main method for the study |
| **Phone AR** (ARKit/ARCore ground-plane measuring) | Phone; requires a development build | Good up to ~10–15 m, drifts beyond | Short shadows |
| **Drone photo straight down** | Drone with camera | Pixel size from altitude and camera specs | Shadows on open ground; no walking needed |
| **Drone altitude at roof level** | Drone | ~1 m (to be checked on a known height) | **Reference height only** (not shadow-based) |
| **Laser meter's indirect height function** | Laser meter with tilt sensor | Instrument dependent | **Reference height only** |

### 5.1 Phone GPS with line snapping

The tip must lie on the known line from corner *C* along *û* (§3.1). The app projects the GPS fix onto that line, which removes the sideways component of the GPS error. Only the error along the line remains. Several fixes averaged while standing still, plus repeats at different times or by different people, reduce it further. Independent errors shrink roughly as 1/√n; H4 tests whether that holds.

### 5.2 Drone photo straight down

The photo stores the capture time, which gives the Sun's position. The scale comes from flight altitude, focal length and sensor size:

**ground size of one pixel = altitude × sensor width / (focal length × image width in pixels)**

Measure *L* in pixels, convert to metres and apply *h = L · tan(e)*. Keep the building near the image centre: tall objects lean outward away from the centre of a straight-down photo, and that lean distorts the wall base.

### 5.3 Drones: rules first

Romania follows the EU drone rules (Implementing Regulation (EU) 2019/947). Before any flight, check:
- operator registration with AACR, the Romanian civil aviation authority;
- the official no-fly-zone map, since Constanța has the port, military areas and other restricted airspace;
- the minimum pilot age (16 by default in the EU; national exceptions may apply);
- the rules for flying over people.

Fly only where it is allowed and with an adult responsible. If this is impractical, the laser meter replaces the drone as the reference instrument.

## 6. System design

### 6.1 Architecture

```
Phone + PC calculation server                Shared heights server (optional, online)
 ├─ bundled OSM snapshot (unchanged)          ├─ measurements  — every raw measurement
 ├─ cached heights file  ◄──── download ──────┤  building_heights — combined estimate
 ├─ local measurements                         ├─ moderation queue
 └─ upload queue  ─────────────── send ───────►└─ public export (heights file)
```

- **Works without the shared database.** Routes and shadows are currently calculated by the server on the PC ([overview](../overview.md)). The measurement itself (*h = L · tan e*) is light enough to run on the phone. The app downloads only the buildings that have been measured, a file of a few KB, and caches it. Measurements made without a connection wait in a queue.
- **Contributing is opt-in.** Without it, measurements stay on the phone and still improve that user's own shadows.
- **Server:** extend the existing Go reference server ([`server/`](../server/)) with SQLite. It already has an HTTP API, validation and tests. A serverless alternative (Cloudflare Workers with D1) avoids running a machine but adds a new stack; decide at implementation time.

### 6.2 Data model

**`measurements`**, one row per raw measurement:

| Field | Meaning |
| --- | --- |
| `id` | Random UUID |
| `osm_building` | `way/<id>`, matching the bundled data |
| `method` | `phone_gps`, `tape_laser`, `ar`, `drone_nadir`, `drone_altitude`, `laser_indirect` |
| `height_m`, `sigma_m` | Estimate and 1σ uncertainty from §3.2 |
| `corner`, `tip` | Footprint corner used and shadow-tip point (EPSG:32635 metres) |
| `length_m` | Measured shadow length |
| `sun_elevation_deg`, `sun_azimuth_deg` | Computed for `measured_at` and the corner location |
| `measured_at` | UTC instant |
| `obstruction`, `slope_note`, `rooftop_structure` | User checklist answers |
| `contributor` | Anonymous random install id; never a name or email |
| `app_version`, `engine_version` | For reproducibility |
| `status` | `pending`, `accepted`, `rejected`, `needs_review` |

**`building_heights`**, one row per building, recomputed when its measurements change: combined height and uncertainty, number of accepted measurements, methods used, last update and a confidence level.

### 6.3 Combining measurements

1. Reject a measurement that fails the checklist, has the Sun below 10°, or comes from a tip that is not on the ruler line within its tolerance.
2. Compare it with the median of the building's other measurements. Mark it `needs_review` if it differs by more than 3σ, or if it disagrees with the OSM floor count, taking 2.3–4.5 m per floor plus a roof allowance.
3. Combine accepted measurements with an inverse-variance weighted mean, so precise methods count more. The combined σ is 1/√(Σ 1/σᵢ²).
4. A building is **confirmed** with two independent accepted measurements that agree, or one tape, laser or drone measurement.

### 6.4 Integration with the engine

The engine already stores every height as a range plus a source label (`low_m`, `high_m`, `source` in [`data.ts`](../mobile/src/engine/data.ts)). A route sample counts as shade only when the Sun ray passes below `low_m`. A ray between `low_m` and `high_m` makes the sample unknown ([`exposure.ts`](../mobile/src/engine/exposure.ts)), and the map draws the `low_m` shadow ([`overlay.ts`](../mobile/src/engine/overlay.ts)). A narrow measured range therefore turns unknown samples into shade or not-blocked. A measured height becomes:

- `low_m = height − 2σ` and `high_m = height + 2σ`;
- a new `source` value, for example `measured_shadow` or `measured_reference`.

Shadow and routing logic stays unchanged: a range that is too wide still produces "unknown" rather than false shade. The map overlay's source labels (`osm_height`, `levels_estimate`, `unknown`) and the mobile parser need one new label for measured heights. Source priority is:

**confirmed measurement → OSM height tag → floor-count estimate → missing**

GBA is not merged into this chain (§6.6).

### 6.5 What the app shows

- **Straturi** gains a layer that colours building outlines by height source, with a legend:

| Colour | Source | Label in the app |
| --- | --- | --- |
| Green | Measured by Umbra users | „30,4 m ± 0,8 · 4 măsurători · laser + telefon" |
| Blue | OSM height tag | „din OpenStreetMap" |
| Light blue | Floor-count estimate | „estimat: 10 etaje → 25–38 m" |
| Orange, dashed (optional) | GBA | „estimare globală, imprecisă la blocuri înalte" |
| Grey | Unknown | „Măsoară clădirea →" |

- **Tapping a building** shows its height, uncertainty, sources and measurement count, plus a button to measure it.
- **The „Măsoară clădirea" flow:**
  1. Choose the building and the roof corner. The app suggests corners whose shadow should fall on open ground.
  2. The app shows the Sun's elevation, the expected error for each method right now, and a warning when the Sun is too high or too low.
  3. A ruler is drawn on the map from the corner along the shadow direction, with height marks ("aici = 15 m").
  4. Pick a method, mark the tip (GPS, a typed distance, or AR) and answer the checklist: obstruction, slope, rooftop structure, sharp shadow.
  5. A result card shows the height ± uncertainty. It is saved locally and can optionally be shared.

### 6.6 Licensing

| Data | License | Rule |
| --- | --- | --- |
| OSM snapshot | ODbL 1.0 | Keep the attribution. A database derived from OSM and published must stay ODbL. |
| Umbra users' measurements | Ours, decided by the team | Publishing them under ODbL keeps them compatible with OSM. |
| GBA | CC BY-NC 4.0 | Research baseline only. Never merged into the shared database, never uploaded to OSM. Any in-app layer must be a separate file with its own attribution, non-commercial only. |

Users' own on-site measurements may be added to OSM; OSM accepts survey data. Bulk uploads fall under OSM's import guidelines, so start with careful manual edits.

### 6.7 Privacy

The current README promises that coordinates are not sent to an Umbra server. Contributing would change that, so:

- Sharing is opt-in, with clear consent, and the README and privacy text are updated before release.
- Only the shadow-tip point and building id are sent, never a location history.
- Contributor ids are random and anonymous; each user can delete their own measurements.
- No photos are uploaded in the first version, since they can show faces and licence plates.
- GDPR applies, and some users, including the team, may be minors: keep data minimal and have a coordinator review the consent text.

### 6.8 Abuse protection

- Rate limits per install id and per IP address.
- The automatic plausibility checks in §6.3.
- An admin review command for `needs_review` measurements.
- A building height only changes in the public heights file after it is confirmed.

### 6.9 Competition setting

The 2017 RoSEF rules required demonstrations to work without internet (see [competition notes](competition/README.md)); the team's check of the 2026 regulation is in `output/research/RoSEF_2026_Cerinte_verificate.md` on the [`research/smartroute`](https://github.com/Ieditzu/umbra/blob/research/smartroute/output/research/RoSEF_2026_Cerinte_verificate.md) branch. The stand demo should not depend on internet access: the PC calculation server runs locally, measurements are stored locally, and the shared database is an online extra.

## 7. Field study

### 7.1 Buildings

- **Pilot:** 5–10 buildings of different heights.
- **Main study:** at least 30 buildings, spread across 1–4-floor houses, P+4 blocks, P+8 to P+10 blocks and taller buildings, in several neighbourhoods.
- Prefer corners whose shadow falls on open, flat ground (car parks, squares).
- Fix the building list **before** looking at any results, and do not drop buildings because their results look bad.

### 7.2 Reference heights

At least one independent reference per building:
- the laser meter's indirect height function;
- the drone altitude at roof level;
- a documented floor count with a measured floor-to-floor height.

The OSM tags are only a weak check, given the errors found in §1. Record each instrument's own accuracy by measuring a few objects of known height.

### 7.3 Procedure

For each building, measure on several occasions (morning, around noon, afternoon; and on other days where possible) with:
1. phone GPS at the tip;
2. tape or laser from the corner to the tip;
3. AR where the shadow is short;
4. the drone photo, where flying is allowed.

At least two people measure the same buildings independently. The person measuring does not see the reference height, so it cannot influence where they mark the tip. Every attempt is logged, including rejected and failed ones.

### 7.4 Analysis

For each method:
- **Error statistics:** bias, MAE, RMSE, median absolute error and share within ±3 m (one floor).
- **Bland–Altman plot:** error against the average of method and reference.
- **Error against sun elevation**, compared with the prediction from §3.2 (H2).
- **Agreement between observers.**
- **Convergence:** error against the number of averaged phone measurements (H4).
- **Baselines:** GBA, 3D-GloBFP and floors × typical floor height, evaluated on the same buildings (H3).

Uncertainty intervals are computed by resampling whole buildings, because repeated measurements of one building are not independent.

### 7.5 Effect on routes

Re-run the routing engine on a fixed set of trips with each height source: missing (current), floor estimate, GBA, and measured heights. Measure:
- the share of walking time in modelled shade versus unknown;
- how often the recommended route changes;
- the shift of shadow edges on sidewalks.

A 2 m height error moves a shadow edge by 2·cot(e) m, which is about 3 m at 33° and roughly a sidewalk's width.

## 8. Competition deliverables

- **Paper** (3–5 pages, black and white): problem and GBA finding → physics and error model → methods and field protocol → results (error tables, error against elevation, comparison with baselines, route effect) → limitations.
- **Documentation** (5 pages maximum, black and white): app architecture, solar and shadow engine, measuring flow, server and database, privacy and licensing, tests.
- **Poster** (colour, size from the current regulation): the main graphic plots measured height against reference height for each method next to GBA, plus a diagram of the formula and a map of the measured buildings.

## 9. Implementation phases

Not started; each phase begins on the team's go-ahead.

1. **Local measuring mode:** ruler, methods, checklist, local storage and new height source values in the engine, with tests. Offline only.
2. **Pilot field test:** 5–10 buildings, to check the protocol and the error model.
3. **Server and shared database:** endpoints, combination and moderation, heights file download, opt-in upload, privacy text.
4. **Main field study and analysis script**, extending [`compare-gba-heights.py`](../scripts/compare-gba-heights.py).
5. **Route-effect analysis.**
6. **Paper, documentation and poster.**

Sketch of the planned endpoints:
- `GET /v1/heights?since=…` returns changed confirmed heights;
- `POST /v1/measurements` stores a measurement;
- `DELETE /v1/measurements/{id}` deletes one, by its owner's install id;
- `GET /v1/buildings/{osm_id}` returns one building's measurements and status.

## 10. Open questions

- Authors, coordinator and category details for the current RoSEF edition, its rules, the poster size and whether offline demos are required.
- Available equipment: a laser meter (with an indirect height function?), a drone (model, registration, an adult pilot?) and phones for AR.
- Server hosting: Go server with SQLite on which machine, or Cloudflare.
- Whether to show GBA in the app at all, given its weakness on tall blocks and its non-commercial license.
- Who reviews the consent and privacy text.

## Sources

1. Zhu, X. X. et al., „GlobalBuildingAtlas: an open global and complete dataset of building polygons, heights and LoD1 3D models", *Earth System Science Data* 17(12), 2025, pp. 6647–6668. https://doi.org/10.5194/essd-17-6647-2025 — data: https://huggingface.co/datasets/zhu-xlab/GBA.LoD1
2. Chaudhry et al., „Building Height Estimation Using Shadow Length in Satellite Imagery", arXiv:2411.09411, 2024. https://arxiv.org/abs/2411.09411v1
3. KVR-1000 shadow-based building height study, *Spatial Information Research*, 1999. https://koreascience.kr/article/JAKO199911922994087.pub
4. Che et al., „3D-GloBFP: the first global three-dimensional building footprint dataset", *Earth System Science Data* 16, 2024. https://essd.copernicus.org/articles/16/5357/2024/
5. Milojevic-Dupont et al., „EUBUCCO v0.1", *Scientific Data*, 2023. https://doi.org/10.1038/s41597-023-02040-2
6. Overture Maps, buildings guide. https://docs.overturemaps.org/guides/buildings
7. LAKI III project (ANCPI), EEA Grants. https://eeagrants.org/node/19232
8. „Single-image building height estimation using EfficientNet", *Findings*. https://findingspress.org/article/116609
9. „CBHE: Corner-based Building Height Estimation for Complex Street Scene Images", arXiv:1904.11128. https://arxiv.org/pdf/1904.11128
10. Hu et al., „Revisiting Shadow Detection: A New Benchmark Dataset for Complex World" (CUHK-Shadow), arXiv:1911.06998. https://arxiv.org/pdf/1911.06998
11. „AdapterShadow: Adapting Segment Anything Model for Shadow Detection", arXiv:2311.08891. https://arxiv.org/pdf/2311.08891
12. NOAA solar calculation details. https://gml.noaa.gov/grad/solcalc/calcdetails.html
