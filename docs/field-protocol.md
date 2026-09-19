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

## Camera 1 (main)

- Tape it down. Same pose for empty and trial. Stabilization off if it crops.
- Frame: vertical edge + 1–2 m of pavement + a bit of the opening so the walker can enter at the end.
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
