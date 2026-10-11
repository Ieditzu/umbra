# Umbra research plan

Umbra investigates whether shadows visible to a fixed camera can provide reliable evidence of an approach while the person remains occluded by a corner. The proposed contribution is an experimental characterization of warning time, false alarms, and failure conditions across sunlight and streetlamps. Novelty relative to published work still requires a literature review.

This document describes proposed research. The controlled experiments, detector comparisons, and field evaluation have not yet been carried out.

## Research questions and hypotheses

| Question | Hypothesis to evaluate | Evidence needed |
| --- | --- | --- |
| Does the shadow provide useful advance warning? | Detection precedes direct visibility when the geometry exposes the shadow first. | Independently labelled visibility times and alert timestamps. |
| What distinguishes approach evidence from changing light? | Temporal tracking and refusal gates improve the tradeoff between detections and false alarms. | Independent baseline detectors and negative clips with moving light or flicker. |
| What changes between sunlight and streetlamps? | Light position, shadow contrast, and multiple sources alter the available warning and reliability. | Controlled variation of those factors. |
| Does calibration remain useful over time? | Camera movement and lighting drift degrade performance despite a previously suitable empty reference. | Later sessions and deliberately perturbed references. |
| Does the method transfer across locations? | Errors change on unseen corners and later recording sessions. | A fixed method evaluated on recordings withheld from development. |

The CCTV motivation is advance warning of an occluded approach. The proposed experiments will measure approach detection; they will not label criminal intent or measure robbery prevention.

## Observation model

The observable is a change in the brightness of visible pavement relative to an empty reference. The hidden person's location, the light source, the wall, and the receiving surface jointly determine whether a measurable shadow reaches the camera's view.

Define three independently reviewed events:

- `t_shadow`: first visible cast-shadow evidence in the receiving area.
- `t_visible`: first frame in which any part of the person is directly visible. This is earlier than full-body visibility and is the conservative comparison for a corner warning.
- `t_alert`: first qualifying alert actually issued by the method.

Available shadow lead is `t_visible - t_shadow`. Achieved warning time is `t_visible - t_alert`. These quantities must be reported separately: recognizing shadow onset after reviewing a complete clip does not establish that a live method could have alerted at that moment.

Absolute hidden position requires additional geometry and independent position labels. The present green-dot overlay is an image-derived proxy and is excluded from claims about position accuracy until validated against those labels. Camera bearing and ground geometry are needed before sun azimuth can be used to map a shadow to physical position.

## Proposed controlled recording experiments

Use a fixed camera viewing a corner and receiving pavement. Record an empty reference and a trial under the same lighting and camera settings. Document camera placement, the walking route, light conditions, and recording timestamps.

Review the footage to label direct visibility and cast-shadow onset independently from Umbra's output. Keep reference trajectories and evaluation labels outside the detector inputs.

Vary the factors in stages so a failure can be attributed to a specific change:

1. Geometry: wall position, camera height and angle, approach direction, and distance from the corner.
2. Illumination: directional sunlight; one point or spot lamp; then multiple lamps. Vary source position, brightness, and shadow softness.
3. Surface and camera: pavement texture, reflective patches, noise, exposure variation, frame rate, resolution, and compression.
4. Distractors: no approaching person, lamp flicker, moving headlights, unrelated moving shadows, and visible foreground motion.

Start with a small planned set of conditions and repeated trials. Choose a larger sample size after an initial experiment estimates variability. Record the capture settings and trial identifiers so each result can be traced to its source footage.

Use different corners and light arrangements for development and evaluation. Repeating recordings at one corner does not establish performance at an unseen location.

## Evaluation across recording locations

Record multiple corners and separate sessions. Each session includes an empty reference, approaches with different speeds and directions, and negative clips. Include both suitable and unsuitable lighting rather than selecting only scenes where a long shadow is obvious.

Review `t_shadow` and `t_visible` without seeing the detector's alerts. For a subset, use two reviewers and report disagreement. A reference camera is optional for approach detection but necessary when assessing hidden trajectory or physical position independently.

Group splits by corner and session. Fit parameters and choose thresholds on the development set, then lock them before evaluating held-out recordings. Report daylight and night results separately as well as overall results.

The current manually selected pavement area should be chosen on an empty frame. Selecting an area after inspecting where the test shadow travels gives the method extra information; label that experiment as an assisted condition. Evaluate automatic and assisted area selection separately.

## Comparisons and ablations

Implement each comparison as a detector that produces its own alert timestamps:

- Whole-frame background difference.
- Fixed threshold on the same pavement area.
- Pavement darkening with temporal persistence but no position tracker.
- Umbra with tracking and refusal gates.

Use equivalent calibration information and the same event rules. Compare at matched false-alert rates or provide complete threshold curves. The current software's heuristic summary scores do not yet constitute this benchmark.

Remove one component at a time to assess its contribution: exposure correction, temporal coherence, tracker, and refusal gate. Compare a separate empty reference with the current first-1.8-second trial baseline. The latter assumes an empty opening and must be stated explicitly.

For a future live method, each decision must use only frames available up to that time. Complete-clip normalization, future frames, and retrospective onset selection require a separate offline result label.

## Measurements

Report achieved warning time as a distribution and the fraction of approaches warned before direct visibility. Include missed approaches and late alerts; do not compute a success rate only on clips that alerted.

Measure false alerts per minute of negative footage. Define an alert episode and a reset rule before evaluation so many alert frames from one event are not counted as separate alarms. Also report negative-clip specificity and approach detection rate.

Report abstention rate and accepted-trial performance together. Assess refusals on pre-labelled unsuitable conditions. A method that refuses nearly everything should not appear successful merely because its accepted trials are accurate.

Use frame-level precision and recall as secondary diagnostics. Split those from event-level detection measures. Report uncertainty intervals with resampling grouped by scene or session, and give counts and recording durations beside percentages.

The current confidence score is heuristic. Calling it a probability requires a separate calibration study. Position error in metres likewise requires a calibrated ground plane and independent truth.

## Deliverables and present status

The research deliverables are a reproducible scene and capture specification, a labelled dataset manifest, independently timed detector comparisons, threshold curves, warning-time distributions, ablation results, and a failure analysis with representative clips.

Current software includes recorded-video processing, empty references, pavement selection, shadow diagnostics, a sun horizon check, and a streetlamp-area path. The live view remains a camera preview. Existing synthetic software checks establish neither real streetlamp performance nor unseen-scene performance. Controlled field experiments, the causal live detector, and the independent baseline benchmark are proposed work.

The first proposed research milestone is a small recording experiment containing approaches and negative cases, with independent visibility labels. Use it to assess the measurement protocol and identify failures before expanding the experiment to more locations and lighting conditions.
