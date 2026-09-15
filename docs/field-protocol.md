# Umbra controlled field protocol

## Before recording

- Obtain consent from every participant. Use an opaque board or wheeled silhouette if a person is not necessary.
- Do not point the main camera at people who are directly visible. It should see only the visible-side pavement/wall and corner edge.
- Fix the main camera physically. Disable digital stabilization if it causes crop changes.
- Print ArUco dictionary `DICT_4X4_50` markers with IDs **10** and **11**. Put ID 10 at the hidden-track endpoint nearest the corner and ID 11 at the far endpoint. Measure their separation.
- Place the ground-truth camera so both markers and the full controlled track are visible. It is a labeling device, not an input to the main inference model.

## Capture order

1. Record 8–15 seconds of empty main-camera calibration footage under the same lighting and exposure conditions as the trial.
2. Start the main and ground-truth cameras. Make a shared audible clap or sharp visual cue in both recordings if possible.
3. Move the target along the hidden track while keeping it outside the main camera's direct line of sight.
4. Repeat target-present and target-absent trials. Record surface, weather, cloud cover, time, and any camera changes in the scene notes.

## Acceptance rules

- If Umbra reports `no_coverage`, reframe the main camera or wait for directional light; do not hand-draw a replacement ROI.
- If ground-truth synchronization confidence is low, do not report position error for that trial.
- Treat `possible_motion` as an observation requiring further controlled trials, not an alert.
- Test at least three corners and leave one whole corner out of each model comparison split.

## What to report

For each method, retain presence precision/recall/F1, false-alert rate, normalized or metric position error, direction accuracy, lead time where direct visibility can be measured, calibration time, and correct-refusal rate. Report lighting and surface conditions with every aggregate result.
