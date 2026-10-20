"""Offline comparison of parking warning methods on independently labelled recordings.

Every method receives the same frames, media timestamps and detector outputs, causally.
Manifest labels are only used for scoring and never reach a warning algorithm.
Results are recorded-replay frame-time measurements. They exclude transport and display
latency and do not establish live, field or collision-prevention performance.
"""

from __future__ import annotations

import hashlib
import json
import math
import statistics
import time
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass
from itertools import product
from pathlib import Path

import cv2
import numpy as np

from .parking import ParkingTracker
from .parking_shadow import GroundShadowMonitor

# Each method is the union of its channels. "indirect" is an ablation of "combined".
METHODS: dict[str, tuple[str, ...]] = {
    "visible": ("visible",),
    "ground_change": ("ground_change",),
    "indirect": ("indirect",),
    "combined": ("visible", "indirect"),
}
METHOD_DESCRIPTIONS = {
    "visible": "Pretrained detector with image-space exit-path and lateral-approach tracking only.",
    "ground_change": "Plain difference from a past-frame median ground view, without colour, "
                     "texture, temporal, lighting or camera-motion checks.",
    "indirect": "Shadow channel alone: colour-attenuation, texture, temporal-track, lighting "
                "and camera-motion checks with refusal states (ablation).",
    "combined": "Visible-detector warnings or indirect shadow cues, as in the parking camera.",
}
# Channel scores: detector score of an alerting track, changed fraction of the ground zone,
# and texture correlation of a confirmed moving shadow cue.
THRESHOLDS: dict[str, tuple[float, ...]] = {
    "visible": (0.4, 0.5, 0.6, 0.7, 0.8),
    "ground_change": (0.005, 0.01, 0.02, 0.04, 0.08),
    "indirect": (0.55, 0.65, 0.75, 0.85),
}
PERSISTENCE = (1, 2, 3, 5)  # consecutive warning frames required before a warning onset
MERGE_GAP_S = 1.0  # warnings separated by less than this form one episode
INDIRECT_READY = {"watching", "possible_motion"}
DEFAULT_TARGETS = (0.0, 0.5, 1.0, 2.0)


class GroundChangeBaseline:
    """Simple ground-change detector used as a comparison baseline.

    It deliberately omits the shadow monitor's checks so the comparison shows what
    those checks contribute. It still resets on timestamp resets and stale gaps.
    """

    def __init__(self, zone: str = "ground", reference_frames: int = 12, pixel_threshold: float = 25):
        self.region = GroundShadowMonitor.ZONES[zone]
        self.reference_frames = reference_frames
        self.pixel_threshold = pixel_threshold
        self.last_time: float | None = None
        self.reset()

    def reset(self):
        self.reference: np.ndarray | None = None
        self.samples: list[np.ndarray] = []

    def update(self, frame: np.ndarray, now: float) -> dict:
        if self.last_time is not None and (now <= self.last_time or now - self.last_time > 2.5):
            self.reset()
        self.last_time = now
        height, width = frame.shape[:2]
        small = cv2.resize(frame, (480, round(height * 480 / width)))
        gray = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (3, 3), 0).astype(np.float32)
        if self.reference is not None and self.reference.shape != gray.shape:
            self.reset()
        if self.reference is None:
            self.samples.append(gray)
            if len(self.samples) < self.reference_frames:
                return {"available": False, "score": 0.0}
            self.reference = np.median(self.samples, axis=0)
            self.samples = []
        x, y, bw, bh = self.region
        gh, gw = gray.shape
        rows = slice(int(y * gh), int((y + bh) * gh))
        cols = slice(int(x * gw), int((x + bw) * gw))
        changed = np.abs(gray[rows, cols] - self.reference[rows, cols]) > self.pixel_threshold
        return {"available": True, "score": round(float(changed.mean()), 5)}


def replay(frames: Iterable[tuple[float, np.ndarray, list[dict], float]], zone: str = "ground") -> list[dict]:
    """Run all channels causally over (timestamp_s, frame, detections, detector_ms) items."""
    tracker = ParkingTracker()
    if zone != "ground":
        tracker.set_shadow_zone(zone)
    baseline = GroundChangeBaseline(zone)
    records = []
    for timestamp, frame, detections, detector_ms in frames:
        started = time.perf_counter()
        result = tracker.update(frame, [dict(item) for item in detections], timestamp)
        tracker_ms = (time.perf_counter() - started) * 1000
        started = time.perf_counter()
        change = baseline.update(frame, timestamp)
        baseline_ms = (time.perf_counter() - started) * 1000
        shadow = result["shadow"]
        records.append({
            "t": float(timestamp),
            "scores": {
                "visible": max((float(item.get("score", 0)) for item in result["detections"]
                                if item["risk"] != "observed"), default=0.0),
                "ground_change": change["score"],
                "indirect": max((float(cue["texture_correlation"]) for cue in shadow["cues"]), default=0.0),
            },
            "available": {
                "visible": result["state"] != "limited",
                "ground_change": change["available"],
                "indirect": shadow["state"] in INDIRECT_READY,
            },
            "ms": {"detector": float(detector_ms), "tracker": tracker_ms, "ground_change": baseline_ms},
        })
    return records


def operating_points(method: str) -> Iterator[dict]:
    channels = METHODS[method]
    for values in product(*(THRESHOLDS[channel] for channel in channels)):
        for persistence in PERSISTENCE:
            yield {"thresholds": dict(zip(channels, values, strict=True)), "persistence": persistence}


def warning_episodes(records: list[dict], point: dict) -> list[dict]:
    """Causal warning onsets: a warning starts once it has persisted for k frames."""
    episodes: list[dict] = []
    run, current = 0, None
    for record in records:
        warn = any(record["available"][channel] and record["scores"][channel] >= threshold
                   for channel, threshold in point["thresholds"].items())
        run = run + 1 if warn else 0
        if run < point["persistence"]:
            continue
        if current is not None and record["t"] - current["end_s"] <= MERGE_GAP_S:
            current["end_s"] = record["t"]
        else:
            current = {"onset_s": record["t"], "end_s": record["t"]}
            episodes.append(current)
    return episodes


def _duration(records: list[dict]) -> float:
    times = [record["t"] for record in records]
    if len(times) < 2:
        return 0.0
    return times[-1] - times[0] + statistics.median(np.diff(times))


def score_trial(trial: dict, records: list[dict], episodes: list[dict], tolerance_s: float) -> dict:
    """Classify warning onsets against the trial's manual labels.

    An approach's relevance window runs from its first useful indirect cue (or first
    direct visibility when no cue was labelled), minus the label tolerance, to its clear
    time. Onsets outside every window are false alerts. An episode that started before
    the window is not credited to the approach, even if it continues into it.
    """
    outcome = {"id": trial["id"], "approach": trial["approach"],
               "onsets_s": [round(item["onset_s"], 3) for item in episodes]}
    duration, window = _duration(records), 0.0
    if trial["approach"]:
        cue = trial.get("first_cue_s")
        start = (trial["first_visible_s"] if cue is None else cue) - tolerance_s
        end = trial["clear_s"]
        inside = [item for item in episodes if start <= item["onset_s"] <= end]
        false = [item for item in episodes if not start <= item["onset_s"] <= end]
        if records:
            window = max(0.0, min(end, records[-1]["t"]) - max(start, records[0]["t"]))
        onset = inside[0]["onset_s"] if inside else None
        outcome.update(warned=onset is not None,
                       warning_onset_s=None if onset is None else round(onset, 3),
                       warning_time_s=None if onset is None else round(trial["first_visible_s"] - onset, 3))
    else:
        false = episodes
    outcome.update(false_alerts=len(false), exposure_s=round(max(0.0, duration - window), 3))
    return outcome


@dataclass
class ReplayedTrial:
    trial: dict
    records: list[dict]


def _frame_ms(method: str, ms: dict) -> float:
    # Visible and indirect channels share the detector because shadows exclude detections.
    return ms["ground_change"] if method == "ground_change" else ms["detector"] + ms["tracker"]


def summarize(replayed: list[ReplayedTrial], method: str, point: dict, tolerance_s: float,
              include_trials: bool = True) -> dict:
    outcomes = [score_trial(item.trial, item.records, warning_episodes(item.records, point), tolerance_s)
                for item in replayed]
    approaches = [item for item in outcomes if item["approach"]]
    times = [item["warning_time_s"] for item in approaches if item["warned"]]
    exposure = sum(item["exposure_s"] for item in outcomes)
    false = sum(item["false_alerts"] for item in outcomes)
    frames = [record for item in replayed for record in item.records]
    channels = METHODS[method]
    unavailable = sum(not any(record["available"][channel] for channel in channels) for record in frames)
    ms = [_frame_ms(method, record["ms"]) for record in frames]
    summary = {
        "method": method, "point": point, "trials": len(outcomes), "approaches": len(approaches),
        "warned": len(times), "missed": len(approaches) - len(times),
        "warned_before_visible": sum(value > 0 for value in times),
        "median_warning_time_s": round(statistics.median(times), 3) if times else None,
        "false_alerts": false, "exposure_min": round(exposure / 60, 3),
        "false_alerts_per_min": round(false / (exposure / 60), 3) if exposure > 0 else None,
        "unavailable_fraction": round(unavailable / len(frames), 4) if frames else None,
        "processing_ms": {"median": round(float(np.median(ms)), 2), "p95": round(float(np.percentile(ms, 95)), 2)}
        if ms else None,
    }
    if include_trials:
        summary["trials_detail"] = outcomes
    return summary


def select_point(summaries: list[dict], target: float) -> dict | None:
    """Most approaches warned, then the longest median warning time, within the target rate."""
    eligible = [item for item in summaries
                if item["false_alerts_per_min"] is not None and item["false_alerts_per_min"] <= target + 1e-9]
    if not eligible:
        return None
    return max(eligible, key=lambda item: (
        item["warned"],
        -math.inf if item["median_warning_time_s"] is None else item["median_warning_time_s"],
        -item["false_alerts_per_min"]))


def compare(replayed: list[ReplayedTrial], targets: Iterable[float] = DEFAULT_TARGETS,
            tolerance_s: float = 0.5) -> dict:
    """Fix each method's operating point on tuning trials, then report on test trials."""
    tune = [item for item in replayed if item.trial["split"] == "tune"]
    test = [item for item in replayed if item.trial["split"] == "test"]
    if not tune:
        raise ValueError("Add tuning trials: operating points must be fixed before reporting test trials")
    reported = test or tune
    sweep = {method: [summarize(tune, method, point, tolerance_s, include_trials=False)
                      for point in operating_points(method)] for method in METHODS}
    tags = sorted({tag for item in reported for tag in item.trial["tags"]})
    matched = []
    for target in targets:
        row = {"target_false_alerts_per_min": target, "methods": {}}
        for method in METHODS:
            chosen = select_point(sweep[method], target)
            if chosen is None:
                row["methods"][method] = {"available": False,
                                          "reason": "No tuning operating point meets this false-alert rate."}
                continue
            result = summarize(reported, method, chosen["point"], tolerance_s)
            result["available"] = True
            result["tuning"] = {key: chosen[key] for key in
                                ("approaches", "warned", "median_warning_time_s", "false_alerts_per_min")}
            result["by_tag"] = {tag: summarize([item for item in reported if tag in item.trial["tags"]],
                                               method, chosen["point"], tolerance_s, include_trials=False)
                                for tag in tags}
            row["methods"][method] = result
        matched.append(row)
    return {"reported_split": "test" if test else "tune",
            "parameters_selected_on_reported_trials": not test,
            "tuning_trials": len(tune), "reported_trials": len(reported),
            "matched": matched, "tuning_sweep": sweep}


def load_manifest(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    trials = data.get("trials") if isinstance(data, dict) else None
    if not isinstance(trials, list) or not trials:
        raise ValueError("Manifest needs a non-empty trials list")
    tolerance = data.get("label_tolerance_s", 0.5)
    if not isinstance(tolerance, int | float) or not 0 <= tolerance <= 5:
        raise ValueError("label_tolerance_s must be between 0 and 5 seconds")
    seen, checked = set(), []
    for raw in trials:
        if not isinstance(raw, dict) or not isinstance(raw.get("id"), str) or not raw["id"]:
            raise ValueError("Every trial needs a text id")
        trial_id = raw["id"]
        if trial_id in seen:
            raise ValueError(f"Duplicate trial id {trial_id}")
        seen.add(trial_id)
        video = (path.parent / str(raw.get("video", ""))).resolve()
        if not video.is_file():
            raise ValueError(f"{trial_id}: video not found at {video}")
        split = raw.get("split", "test")
        zone = raw.get("zone", "ground")
        tags = raw.get("tags", [])
        if split not in {"tune", "test"}:
            raise ValueError(f"{trial_id}: split must be tune or test")
        if zone not in GroundShadowMonitor.ZONES:
            raise ValueError(f"{trial_id}: zone must be ground, left or right")
        if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
            raise ValueError(f"{trial_id}: tags must be a list of text")
        if not isinstance(raw.get("approach"), bool):
            raise ValueError(f"{trial_id}: approach must be true or false")
        trial = {**raw, "video": video, "split": split, "zone": zone, "tags": tags}
        if raw["approach"]:
            visible, clear, cue = raw.get("first_visible_s"), raw.get("clear_s"), raw.get("first_cue_s")
            for name, value in (("first_visible_s", visible), ("clear_s", clear)):
                if not isinstance(value, int | float) or value < 0:
                    raise ValueError(f"{trial_id}: approach trials need {name} in seconds")
            if cue is not None and (not isinstance(cue, int | float) or not 0 <= cue <= visible):
                raise ValueError(f"{trial_id}: first_cue_s must be null or no later than first_visible_s")
            if clear < visible:
                raise ValueError(f"{trial_id}: clear_s must not precede first_visible_s")
        elif any(raw.get(name) is not None for name in ("first_visible_s", "clear_s", "first_cue_s")):
            raise ValueError(f"{trial_id}: empty trials must not carry approach timestamps")
        checked.append(trial)
    return {"label_tolerance_s": float(tolerance), "trials": checked}


def read_video(path: Path, max_fps: float | None = 10) -> Iterator[tuple[float, np.ndarray]]:
    """Yield (media time, frame), subsampled to at most max_fps like the live camera."""
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise ValueError(f"Could not open video {path}")
    fps = capture.get(cv2.CAP_PROP_FPS)
    step = 1 / max_fps if max_fps else 0.0
    index, previous, emitted = -1, -math.inf, None
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            index += 1
            timestamp = capture.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if timestamp <= previous and fps > 0:
                timestamp = index / fps  # Some containers report no per-frame times.
            previous = timestamp
            if emitted is not None and timestamp - emitted < step - 1e-6:
                continue
            emitted = timestamp
            yield round(timestamp, 4), frame
    finally:
        capture.release()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while block := handle.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def cached_detections(video: Path, detector: Callable[[np.ndarray], list[dict]], detector_id: str,
                      cache_path: Path, max_fps: float | None) -> list[dict]:
    """Run the detector once per recording; reuse results while video, model and rate match."""
    key = {"video_sha256": _sha256(video), "detector": detector_id, "max_fps": max_fps}
    if cache_path.is_file():
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        if cached.get("key") == key:
            return cached["frames"]
    frames = []
    for timestamp, frame in read_video(video, max_fps):
        started = time.perf_counter()
        detections = detector(frame)
        frames.append({"t": timestamp, "detections": detections,
                       "ms": round((time.perf_counter() - started) * 1000, 2)})
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps({"key": key, "frames": frames}), encoding="utf-8")
    return frames


def replay_trial(trial: dict, detector: Callable[[np.ndarray], list[dict]], detector_id: str,
                 cache_dir: Path, max_fps: float | None) -> ReplayedTrial:
    detections = cached_detections(trial["video"], detector, detector_id,
                                   cache_dir / f"{trial['id']}.detections.json", max_fps)

    def frames():
        count = 0
        for timestamp, frame in read_video(trial["video"], max_fps):
            if count >= len(detections) or abs(timestamp - detections[count]["t"]) > 1e-3:
                raise ValueError(f"{trial['id']}: cached detections do not match the decoded video")
            item = detections[count]
            count += 1
            yield timestamp, frame, item["detections"], item["ms"]
        if count != len(detections):
            raise ValueError(f"{trial['id']}: cached detections do not match the decoded video")

    return ReplayedTrial(trial, replay(frames(), trial["zone"]))


def evaluate_manifest(manifest_path: Path, detector: Callable[[np.ndarray], list[dict]], detector_id: str,
                      cache_dir: Path, max_fps: float | None = 10,
                      targets: Iterable[float] = DEFAULT_TARGETS) -> dict:
    manifest = load_manifest(manifest_path)
    replayed = [replay_trial(trial, detector, detector_id, cache_dir, max_fps) for trial in manifest["trials"]]
    for item in replayed:  # Keep local absolute paths out of shareable results.
        item.trial = {**item.trial, "video": item.trial["video"].name}
    return {
        "evidence_kind": "recorded_replay_method_comparison",
        "field_validated": False,
        "manifest_sha256": _sha256(manifest_path),
        "detector": detector_id,
        "max_fps": max_fps,
        "label_tolerance_s": manifest["label_tolerance_s"],
        "methods": METHOD_DESCRIPTIONS,
        "definitions": {
            "warning_time_s": "first_visible_s minus the first warning onset inside the approach window; "
                              "positive means before direct visibility. Frame time only.",
            "false_alert": "a warning onset outside every labelled approach window, including all "
                           "onsets in empty trials.",
            "exposure_min": "recording time outside approach windows, the false-alert rate denominator.",
            "unavailable_fraction": "frames where none of the method's channels could produce an estimate.",
            "processing_ms": "detector plus tracker per frame (baseline alone for ground_change), "
                             "measured on this computer; excludes capture, transport and display.",
            "matched": "per target rate, each method's operating point with the most warned approaches "
                       "on tuning trials, then the longest median warning time, applied unchanged to "
                       "reported trials.",
        },
        "interpretation": "Recorded replay with manual labels. Shadow cues are unconfirmed indirect "
                          "evidence, not identified hidden people. A small set of trials does not "
                          "establish field accuracy, live warning benefit or collision prevention.",
        **compare(replayed, targets, manifest["label_tolerance_s"]),
        "trials": [item.trial for item in replayed],
    }
