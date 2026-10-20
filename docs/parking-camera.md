# Parking camera

The local app opens the parking view at `/parking.html`. It is a research prototype for rear/parking-camera approach warnings. See [the project idea](umbra-idea.en.md).

## Start

Run `make research`, then open `http://127.0.0.1:8002/`. The server redirects to the parking camera. In development, start the Python API and Vite, then open Vite's root URL or `/parking.html`.

- **Camera:** choose Start camera and allow access. Browser cameras need localhost or HTTPS. USB cameras appear as browser camera devices; a capture adapter is required for a non-USB automotive camera.
- **Video:** choose a local browser-supported parking clip, then Start detection. Frames are processed sequentially using media timestamps. Pause clears active warnings; seeking resets tracking on a backward timestamp or a large gap.
- **LAN camera:** enter an RTSP URL using a private LAN IP address, then Connect camera. The URL is kept in memory. This uses the same restricted RTSP connection rules as the original research camera.

No scene registration, training videos or hidden-screen calibration is required for visible road-user detection. On first start, the server downloads the approximately 36 MB OpenCV Zoo YOLOX model to `UMBRA_DATA_DIR/models/parking/`, checks its pinned SHA-256 and stores the Apache-2.0 model license alongside it. Later starts use the local model. Internet access is needed for that initial download only.

The original scenes, video imports, saved analyses and camera mappings remain under **Saved trials** at `/research.html`.

## What the view means

Boxes show visible detections for person, bicycle, motorcycle, car, bus and truck. Scores are model scores, not calibrated probabilities of collision.

The central corridor is a normalized image region. A repeatedly detected object's bottom-center point inside that region produces **Object in the exit path**. Repeated lateral movement toward the corridor, after approximate background-motion compensation, can produce **Approaching from left/right**.

The algorithm uses image coordinates, not physical speed, distance, steering or time to collision. Guides are image references. Mirroring transforms both boxes and warning direction. Sound is off until enabled by the user.

No current warning is reported as **Observing · check surroundings**. This is not a clear-path signal. Missing, delayed or stale frames clear annotations and warnings. Very dark or largely overexposed frames report limited visibility.

## Distance estimates

Each visible road user gets an approximate distance range, shown on its box (enable **Objects**), after a warning message and as the nearest visible object below the feed. Ranges come from two image cues. Both assume an undistorted camera:

- **Size:** typical real heights per class divided by the box height. The person range is 1.0–1.95 m, so a child is never assumed to be an adult far away. A box cut off by the frame edge only gives an upper bound (`< 3.0 m`).
- **Ground contact (optional):** the camera's height above the ground and downward tilt, with the row where the box meets the ground, assuming flat ground and allowing ±2° of tilt error. Near the horizon this cue is refused.

When both cues agree, the overlap is shown; when they disagree, the union is shown so the nearer possibility is not hidden. Estimates are smoothed per tracked object and cleared when settings change. Objects estimated beyond 40 m get no distance.

Set the camera's vertical field of view under **Distance settings** (about 40–50° for laptop and USB webcams, often 80–120° for rear parking cameras). Settings are remembered in this browser and included in the session log. To check them, place a person at a measured distance and adjust the field of view until the range contains it.

These are estimates, not measurements, and do not change warnings. A person partly hidden behind a car, fisheye distortion, sloped ground, wrong settings or an unusually sized object can make something look farther away than it is. Distance accuracy has not been evaluated.

## Indirect approach cues

The shadow channel now starts automatically, independently of visible-object detections. Keep the camera stopped with a clear view of lit pavement for at least twelve processed frames. The median of those past frames becomes a fixed ground reference. This is not certified empty: an object or shadow already present can become part of it. No training clip, hidden-route mapping or future frame is used.

The monitor examines the lower 58% of the image by default. In **Ground observation settings**, choose all lower ground, left ground or right ground according to the actual visible pavement. These are image regions, not an automatic understanding of the road. **Relearn stopped view** discards the reference. The selected region appears when Guides is enabled.

Candidate shadows must attenuate the reference's colour channels similarly and preserve local ground texture. Global channel gains compensate modest brightness/white-balance changes. Detected road-user boxes are excluded. Separate candidate tracks require displacement across at least three observations; shadows need not be horizontal. The UI outlines the measured patch, not an invented hidden person. A shadow warning can occur with zero visible road-user detections. Static changes, dark textureless foreground and unsupported camera motion are rejected in the controlled software tests.

**Moving shadow · check the blind spot** is an indirect cue with an unconfirmed source, not a classification of a hidden pedestrian or a hidden-vehicle location. Shadow travel direction is image motion; it is not necessarily the direction of the hidden person. Textureless ground, multiple lights, colour-changing illumination, weak shadows and moving textured objects can defeat these tests.

Small estimated camera movements accumulate relative to the reference. Camera movement, unreliable background tracking, substantial view change or a large lighting change suspends indirect warnings and starts reference learning again. Visible-object detection remains available. This first implementation targets a stopped camera observing the exit **before** reversing; it does not establish shadow sensing from a moving reversing vehicle. Check the **Indirect** status below the feed to see learning, monitoring and unavailable states. Object boxes can be enabled separately with **Objects**.

## Review warning time

Each temporally grouped shadow warning becomes an unreviewed episode, even if no road user appears. For a video replay, pause at the first frame where any part of the corresponding approaching person or vehicle is directly visible, then select **First visible here** for the matching episode. Alternatively enter its exact media time. **Unrelated cue** marks a warning with no related approach; **Reset label** removes a review. These are human annotations, never automatic ground truth. A paused seek can be used to inspect the first visible frame without feeding that frame to the estimator. Resuming after a backward seek or a gap greater than 2.5 seconds starts a new segment and reference; old-segment annotations cannot be attached to reused IDs.

Lead time is `first visible frame time - first warning-trigger frame time`. The trigger timestamp is when temporal confirmation first succeeds, not backdated to the first weak candidate. Negative values are retained. These are **frame-time** measurements: they exclude inference, transport and display latency. Frame logs include processing duration; achieved live warning benefit must subtract end-to-end latency and be validated independently. An early shadow cue is not necessarily from the subsequently appearing actor; the reviewer must establish the correspondence.

The summary covers reviewed warning episodes only. Unreviewed cues are not successful detections; missed approaches and no-warning trials are not counted by this panel. Do not call the displayed counts accuracy, recall or a false-alert rate. A full experiment requires independently labelled approach/no-approach clips, including failures, and a visible-detector-only comparison using the same recordings. The [method comparison](parking-evaluation.md) tool scores such clips.

## Evidence and current limits

The software is not connected to steering or braking and has not been tested as an automotive safety system. The object detector only sees visible features. Small/occluded objects, low light, glare, wide-angle distortion, rapid motion and background parallax can cause missed detections or false warnings. Approximate camera-motion compensation is not calibrated vehicle ego-motion.

Verification includes unit/API tests, synthetic tracking tests and a real pretrained-model smoke check on a published example image. These do not establish accuracy for parking footage. Evaluate controlled real clips with independent visibility/approach labels and report false alerts, missed approaches, warning lead time and latency. Keep recorded-replay performance distinct from actual live camera performance.

Camera frames are processed locally and not recorded by this mode. Browser imports remain local files; the service receives sampled JPEG frames. **Download session log** exports up to 10,000 frame/action records, including shadow contours, texture/attenuation measurements, detector results, processing durations, reference/zone actions and manual reviews. It includes up to 20 segment summaries, each retaining its latest 100 warning episodes. No raw images or RTSP credentials are exported. A new session starts a new in-memory log; download before starting another session or closing the page. No performance claims should be drawn from truncated logs.

Processing runs while the page is visible. This is not an unattended vehicle service. Reopen the camera after a long background pause if its session expires.

## Model provenance

- OpenCV Zoo, `object_detection_yolox`, revision `47534e27c9851bb1128ccc0102f1145e27f23f98`.
- Model `object_detection_yolox_2022nov.onnx`, SHA-256 `c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063`.
- [Official preprocessing and inference example](https://github.com/opencv/opencv_zoo/tree/47534e27c9851bb1128ccc0102f1145e27f23f98/models/object_detection_yolox).
- Model license: Apache License 2.0, copyright (c) 2021–2022 Megvii Inc. Stored with downloaded weights; weights are not committed to Git.
