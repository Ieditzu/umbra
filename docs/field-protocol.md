# Umbra field protocol — shadow before line-of-sight

Film a **building corner** (a wall you can hide behind), not a pillar in an open plaza unless the walker is truly behind it.

## Geometry

```
  hidden path: walker starts here
  11 · · · · · 10
  =================  wall
                   | edge
                   | visible pavement  ← Camera 1
                   | walker later ENTERS the frame here
```

Sun must throw the walker's shadow **onto Camera 1's pavement** before their body clears the edge. If the shadow falls behind them, change corner or time of day.

At night, use a fixed streetlamp that illuminates the visible pavement before the walker reaches the corner. Record an empty calibration with the lamp on, then a trial with the same camera and lighting. In **Shadow area**, mark the lit pavement patch where the shadow should arrive, not the lamp fixture. Keep the first 1.8 seconds of the trial empty. Weak lamps, shifting light, or a shadow that never reaches the marked patch should produce no reliable warning. Night analysis currently runs on recorded trials, not the live camera preview.

## Camera 1 (main)

- Tape it down. Same pose for empty and trial. Stabilization off if it crops.
- Frame a wide route view: vertical edge + 1–2 m of pavement + the shadow path + enough of the opening for the walker’s **full body** to enter at the end. This is clearer evidence of `shadow → body entry`; do not make it a close facial shot.
- **empty**: 8–15 s, nobody approaching.
- **trial (mers)**: one continuous clip. Walker starts fully hidden. Shadow should appear on the pavement first. Then they walk into view.

If you see the person the whole time, or a hard shadow of someone walking in front of the camera, you are not testing a blind corner.

## Camera 2 (optional ground truth)

On the hidden path. Markers: ArUco `DICT_4X4_50` **10** near the corner, **11** far. Clap once so both cameras hear it. This labels where they were; Umbra does not use these pixels for the warning.

## Analysis outcomes

- `no_coverage` — no usable edge/pavement patch. Reframe.
- `no_reliable_signal` — empty or too weak. Valid on empty trials.
- `possible_motion` / `strong_motion` — pavement shadow, person not yet in frame.
- `early_warning` — shadow, then person; **lead time > 0**.
- `entered_view` — person appeared with no prior shadow warning.

## What to report

Lead time (s), fraction of approaches with lead time > 0, false-alert rate on empty trials, correct refusals, lighting and surface. Keep failures.

Do not hand-draw an ROI. Do not describe a synthetic demo as outdoor footage.
