# Umbra: seeing into blind spots through indirect light

Project direction agreed on 20 October 2026. This document describes the intended application and proposed research; it does not report validated performance.

## The purpose

Umbra aims to help people detect what is approaching from a blind spot before they have to enter that space themselves.

Consider a driver leaving a car park. A wall blocks the view of the pavement. To check for an approaching pedestrian or cyclist, the driver has to move forward, potentially entering their path before seeing them. Umbra would investigate whether light and shadows visible to a camera can reveal useful information about that hidden approach earlier.

The same need occurs at building exits, between parked vehicles, and at corridor junctions used by pedestrians and wheelchair users. The first application to investigate is a car-park exit with an obstructed view, reproduced in a controlled model before considering a full-scale site.

**The goal is to reduce situations in which someone must expose themselves to a possible hazard simply to find out whether it is there.**

## The idea

Objects outside a camera's direct view can still affect light reaching visible surfaces. Under suitable geometry and illumination, an obstruction partially blocks different light paths, creating patterns that contain information about the hidden scene.

Umbra would measure those patterns and attempt to recover a coarse image or spatial representation of the hidden area. Where the measurements support it, successive estimates could indicate an object's position and movement toward the visible path.

A useful output might be an approximate hidden-region view, a movement indicator, or an early warning. The output must reflect the information actually recovered; uncertain measurements should produce an unavailable or uncertain result.

Light must have a path from the hidden area to a surface the camera can observe. This does not provide vision through a completely closed opaque wall.

## The first demonstration

Place a screen displaying a large letter, such as L, behind a cardboard barrier. A fixed camera observes only a matte white receiving surface. After calibration, Umbra attempts to reconstruct unfamiliar patterns from the camera measurements alone.

The reconstruction program receives the calibration and measured camera images, never the hidden test pattern. Test letters and random patterns are selected independently of calibration.

This experiment establishes whether the apparatus recovers spatial information. The next stage replaces the screen with illuminated physical shapes and moving objects in a model of a blind car-park exit. Success with a bright display alone does not establish detection of real pedestrians.

## The research question

**How much useful information about a hidden approach can an ordinary camera recover from indirect light, and under which conditions does that information arrive early enough to help?**

One proposed contribution is adaptive measurement selection: choosing among available measurement positions to reduce reconstruction uncertainty. Compare it with fixed, uniformly spaced, and randomly selected positions using the same capture budget. Initially, an operator can move the apparatus between marked positions; that experiment does not yet demonstrate an autonomous system.

Keep two related experiments distinct: detecting a visible cast shadow and reconstructing a hidden scene from indirect light. Each needs its own method, baseline, and evidence. Their potential combination must be tested.

## What we would measure

- Reconstruction error on previously unseen patterns and physical targets.
- Achieved warning time relative to the first direct visibility of the approaching object.
- Missed approaches, false alerts, and the frequency of uncertain or unavailable results.
- Processing and acquisition time, including any movement of the apparatus.
- Sensitivity to ambient light, receiving-surface texture, camera movement, and geometry changes.
- Performance on sessions and arrangements withheld from development.

Live decisions must use only measurements available at that moment. Report all tested conditions, including failures. Compare practical alternatives, including direct cameras and mirrors, to establish where indirect sensing could add value.

## Research foundation

- [Computational periscopy with an ordinary digital camera, Nature (2019)](https://www.nature.com/articles/s41586-018-0868-6): a foundation for reconstructing hidden images from occlusion-dependent indirect light.
- [Boston University: Can Technology Eliminate Blind Spots?](https://www.bu.edu/articles/2019/can-technology-eliminate-blind-spots/): explanation of the experiment, physical-target demonstrations, and lighting limitations.
- [MIT CSAIL: Helping self-driving cars see around corners](https://www.csail.mit.edu/news/helping-self-driving-cars-see-around-corners): related work on shadow-based early warning in a parking garage and with an autonomous wheelchair.

These sources establish prior work, not Umbra's performance or worldwide novelty. The team's contribution must be demonstrated through its own apparatus, algorithms, comparisons, and measurements.
