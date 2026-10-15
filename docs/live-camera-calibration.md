# Live position calibration

This is an experimental, saved **image-space mapping**, not physical reconstruction through a wall. A prior visible walk supplies paired body centres and complete shadow tips. The live estimator applies that saved mapping to new shadow observations. It does not use future frames from the live stream, infer identity, or establish criminal intent.

## Setup

1. Fix the camera, including its zoom/crop. Record an empty clip and a walk from behind the corner into view under the same light. Leave at least three seconds empty at the start of the walk; the first 18 analysis samples supply the reference.
2. Keep the complete shadow tip and visible person in view together for several frames. Calibration requires at least five usable pairs, sufficient travel, and a consistent internal fit. Clipped shadow tips are excluded.
3. Import the clips into a scene and add a trial. Open **Camera setup**, choose the calibration walk, and click **Calibrate from walk**. The mapping and empty-view reference persist on the local server across restarts.
4. For a browser/capture-card camera, click **Start camera**, then **Start detection**. For CCTV, choose **LAN CCTV · RTSP**, enter its RTSP address using a private LAN IP, and click **Connect CCTV**. Example address shape: `rtsp://192.168.1.20:554/stream`. Camera-specific paths and credentials must come from its configuration.
5. Keep the camera view, dominant light, ground route, and approximate subject height consistent with calibration. A different camera needs its own calibration. Replacing the empty recording invalidates the old mapping.

The dot estimates the body centre in camera pixels, with an error/extrapolation ring. It is not a measured physical distance or a calibrated statistical confidence interval. Absolute lamp/person heights in metres cannot be recovered from this calibration without a known physical scale. Different subject heights and paths can produce biased estimates even when basic rejection checks pass.

## What is checked

- Two consecutive compatible observations are required for a dot.
- Missing, clipped, far-out-of-range or off-route shadow evidence removes the dot; no gait or constant-speed animation substitutes for evidence.
- A visible upright body switches to a body box. Hidden estimates may not cross onto the visible side of the wall.
- Aspect-ratio changes and large background disagreement reject the camera view. These checks do not guarantee detection of every camera/light change.
- Browser overlays expire after one second without a timely observation. RTSP is drained into a single latest frame rather than a playback backlog. Stream failures stop detection.
- Up to four sessions are allowed. Unused sessions, including abandoned network-camera readers, expire after 45 seconds. Camera addresses/credentials are held in memory, not saved in scene metadata or browser storage.

Live processing currently runs while the research page requests frames; it is not an unattended CCTV alarm daemon. RTSP requires OpenCV's FFmpeg support and a reachable LAN camera. The default local API is unauthenticated and bound to loopback: do not expose it directly to the internet. Live browser frames are sent to that local API, processed, and discarded rather than saved as recordings.

## Recorded checks versus field validation

Recorded analyses use the same per-frame tracker and saved mapping as live input. New analyses without a mapping withhold the old shadow-ray dot. The source calibration ID is included in results. If the replay uses the same video that created the mapping, `evaluated_on_calibration_source` is true: this is a calibration demonstration, **not** an independent accuracy test.

The `noapte` walk can initialize a mapping without manually guessing a lamp height. Its five usable visible pairs provide only a limited internal consistency check. A separate consenting walk, stops/reversals, other heights, and empty negative trials are needed to measure actual position error and false detections. No physical RTSP camera or independent live field accuracy has been validated by the software tests.

Night-time position previews do not override the separate reviewed-streetlamp warning gate. A refused shadow-warning result is not promoted into a confirmed-person alarm merely because a position estimate is displayed.
