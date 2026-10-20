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

## Shadow cues

With the camera stopped and the visible ground clear of moving traffic, open **Blind-spot shadow cues** and select **Set empty view**. The next eight frames establish a background. Keep the camera and illumination stable.

The experimental detector examines elongated dark changes on the lower visible ground, excludes visible detected object boxes and requires a moving cue across multiple observations. A cue is labelled **Changing shadow · check the blind spot**, with an unconfirmed source. It does not identify a pedestrian, reconstruct a body or locate someone behind a wall.

Camera movement or substantial view/lighting change invalidates the reference. Visible-object detection remains available; capture a new ground reference once stopped. The dark-change heuristic can confuse other image changes with shadows and has not been field-validated.

## Evidence and current limits

The software is not connected to steering or braking and has not been tested as an automotive safety system. The object detector only sees visible features. Small/occluded objects, low light, glare, wide-angle distortion, rapid motion and background parallax can cause missed detections or false warnings. Approximate camera-motion compensation is not calibrated vehicle ego-motion.

Verification includes unit/API tests, synthetic tracking tests and a real pretrained-model smoke check on a published example image. These do not establish accuracy for parking footage. Evaluate controlled real clips with independent visibility/approach labels and report false alerts, missed approaches, warning lead time and latency. Keep recorded-replay performance distinct from actual live camera performance.

Camera frames are processed locally and not recorded by this mode. Browser imports remain local files; the service receives sampled JPEG frames. **Download session log** exports up to 10,000 timestamped detection/alert records without raw images or RTSP credentials. A new session starts a new in-memory log; download before starting another session or closing the page. Reference-setting timestamps are not currently recorded separately, so annotate that action in the experiment notebook.

Processing runs while the page is visible. This is not an unattended vehicle service. Reopen the camera after a long background pause if its session expires.

## Model provenance

- OpenCV Zoo, `object_detection_yolox`, revision `47534e27c9851bb1128ccc0102f1145e27f23f98`.
- Model `object_detection_yolox_2022nov.onnx`, SHA-256 `c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063`.
- [Official preprocessing and inference example](https://github.com/opencv/opencv_zoo/tree/47534e27c9851bb1128ccc0102f1145e27f23f98/models/object_detection_yolox).
- Model license: Apache License 2.0, copyright (c) 2021–2022 Megvii Inc. Stored with downloaded weights; weights are not committed to Git.
