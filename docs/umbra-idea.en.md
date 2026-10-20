# Umbra: a parking-exit camera with blind-spot approach warnings

Agreed project direction, clarified on 20 October 2026. This document distinguishes the intended application, current prototype and research still needed.

## The idea

**Umbra is a camera-based parking assistant intended to warn about pedestrians, cyclists and vehicles approaching across the exit path when reversing out of a parking space or leaving a car park with an obstructed view.**

Imagine reversing out between two parked cars. Their bodies block the view of traffic approaching from either side. Similarly, a wall beside a driveway can hide the pavement until the front or rear of the car has already entered it. The driver's practical need is to obtain useful information before moving into that hidden traffic path.

Umbra aims to combine ordinary camera detections with evidence from visible light and shadows that may arrive before the approaching object becomes directly visible. The intended interface is a rear/parking camera view with object annotations, left/right approach warnings, and an optional warning sound.

The purpose is daily parking and blind-spot awareness. The same sensing approach could eventually complement perception in autonomous vehicles. That would require a separately validated integration; the current application does not operate vehicle controls.

## What the camera would do

1. Show the real camera view and detect visible road users: people, bicycles, motorcycles, cars, buses and trucks.
2. Track their image-space movement and identify objects occupying the displayed exit corridor or approaching it from a side.
3. Where the camera can observe suitable illuminated ground, examine changing shadows for additional evidence of an unseen approach.
4. Present the warning together with its basis. A visible detected person and an unconfirmed shadow cue are different observations.

A fully hidden road user cannot be identified by an ordinary object detector alone. Recovering useful hidden-scene information requires an indirect light path and suitable conditions. It does not provide vision through a completely closed opaque wall.

## The implemented starting point

The **Parking camera** is the local application's main view at `/parking.html`.

- Browser/USB camera, local video replay and private-LAN RTSP camera inputs.
- A pretrained COCO road-user detector running locally through OpenCV, without per-scene training videos or an account.
- Image-space object tracking, approximate background-motion compensation, exit-path warnings and lateral-approach warnings.
- Optional mirrored view, image-reference parking guides and user-enabled warning sounds.
- An automatic past-frame ground reference while stopped, with colour-attenuation and texture-preservation checks, separate moving-shadow tracks and measured-contour overlays. Indirect cues do not depend on a visible person detection.
- Manual first-visibility/unrelated-cue reviews, signed frame-time lead measurements and bounded exportable evidence logs. Labels do not drive the warning algorithm.
- Removal of stale detections when frames stop arriving or a video is paused.

These are prototype features, not field-validated collision-prevention performance. Image guides do not measure distance. A warning does not establish a collision trajectory, and absence of a warning does not establish a clear path. Shadows do not establish a hidden object's identity or exact position.

The indirect channel currently requires a stopped camera with suitable illuminated, textured pavement. It suspends on unsupported motion or large lighting changes. Extending this to a moving reversing vehicle is unresolved research, not an implemented capability. Frame-time lead measurements exclude end-to-end latency; a live benefit must be evaluated separately.

## The research contribution to investigate

**Can indirect shadow evidence provide earlier useful warnings than a visible-object detector alone, without an unacceptable increase in false alerts?**

The comparison should include:

- The visible-object detector alone.
- A simple ground-change detector.
- The combined method with temporal checks, camera-motion checks and uncertainty/refusal handling.

The team's own contribution should be demonstrated in the evidence-selection and warning method, its operating limits, and reproducible evaluation. Using a pretrained detector is a baseline, not a claim of inventing object detection. Shadow-based corner warning also has prior research.

## How we would demonstrate it

Begin with a model of an obstructed parking exit and illuminated moving physical targets. Then conduct consented, controlled recordings at a full-scale corner with the camera stopped, followed by separately evaluated slow camera movement. Keep test subjects out of live vehicle traffic.

Independently label the first useful indirect cue, the first direct visibility of any part of the road user, and the actual warning timestamp. Test both sides, different approach speeds, stationary parked objects, empty trials, unrelated shadows and changing illumination. Evaluate unfamiliar arrangements and later sessions after fixing the method's parameters.

Measure achieved warning time, missed approaches, false alerts, processing latency and the frequency of unavailable estimates. Compare alternatives at matched false-alert rates. Test camera movement and illumination changes explicitly, rather than assuming a stationary-camera result transfers to a reversing vehicle.

## Research foundation

- [MIT CSAIL: Helping self-driving cars see around corners](https://www.csail.mit.edu/news/helping-self-driving-cars-see-around-corners): prior shadow-based warning experiments in a parking garage and with an autonomous wheelchair.
- [OpenCV Zoo YOLOX detector](https://github.com/opencv/opencv_zoo/tree/main/models/object_detection_yolox): the pretrained visible-object baseline used by the prototype.
- [Parking camera setup and limitations](parking-camera.md).

These sources establish prior work. Umbra's benefit, novelty and suitability for deployment must be established by the team's own experiments.
