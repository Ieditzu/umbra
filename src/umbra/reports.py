"""Reproducible, local-only result artifacts."""

from __future__ import annotations

import base64
import csv
import html
import json
import subprocess
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .video import read_frames
from .vision import build_calibration_model, los_band


def _line_chart(values: list[float], *, width: int = 760, height: int = 150, colour: str = "#87f5c6") -> str:
    if not values:
        return "<p>No timeline was produced.</p>"
    maximum, minimum = max(values), min(values)
    span = max(maximum - minimum, 1e-6)
    points = " ".join(
        f"{index / max(1, len(values) - 1) * width:.1f},{height - 10 - (value - minimum) / span * (height - 20):.1f}"
        for index, value in enumerate(values)
    )
    return (
        f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="timeline chart">'
        f'<path d="M0 {height - 10}H{width}" stroke="#314554"/><polyline fill="none" '
        f'stroke="{colour}" stroke-width="3" points="{points}"/></svg>'
    )


def _track_heatmap(timeline: list[dict[str, Any]]) -> str:
    if not timeline:
        return "<p>No track probabilities were produced.</p>"
    columns = len(timeline)
    rows = len(timeline[0]["position_bins"])
    cell_width = 760 / columns
    cell_height = 160 / rows
    cells: list[str] = []
    for column, item in enumerate(timeline):
        for row, probability in enumerate(item["position_bins"]):
            opacity = 0.08 + 0.92 * float(probability) / max(item["position_bins"])
            cells.append(
                f'<rect x="{column * cell_width:.2f}" y="{(rows - row - 1) * cell_height:.2f}" '
                f'width="{cell_width + 0.2:.2f}" height="{cell_height + 0.2:.2f}" '
                f'fill="#6dd6ff" opacity="{opacity:.3f}"/>'
            )
    return f'<svg viewBox="0 0 760 160" role="img" aria-label="hidden-track probability heatmap">{"".join(cells)}</svg>'


def _read_frame(path: Path, timestamp_s: float = 0.0) -> np.ndarray | None:
    capture = cv2.VideoCapture(str(path))
    if timestamp_s:
        capture.set(cv2.CAP_PROP_POS_MSEC, timestamp_s * 1000)
    ok, frame = capture.read()
    capture.release()
    if not ok:
        return None
    if frame.shape[1] > 480:
        frame = cv2.resize(frame, (480, round(frame.shape[0] * 480 / frame.shape[1])))
    return frame


def _label(frame: np.ndarray, text: str, origin: tuple[int, int], colour: tuple[int, int, int]) -> None:
    x, y = origin
    (width, height), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.43, 1)
    cv2.rectangle(frame, (x - 3, max(0, y - height - 5)), (x + width + 3, y + 4), (8, 18, 24), -1)
    cv2.putText(frame, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.43, colour, 1, cv2.LINE_AA)


def _annotate_scene(
    frame: np.ndarray,
    assessment: dict[str, Any],
    title: str,
) -> np.ndarray:
    """Draw the automatically selected geometry, not an identity annotation."""

    overlay = frame.copy()
    edge, roi = assessment.get("edge"), assessment.get("roi")
    if edge:
        cv2.line(overlay, tuple(edge[:2]), tuple(edge[2:]), (90, 221, 255), 3)
        _label(overlay, "corner edge", (12, 22), (90, 221, 255))
    if roi:
        x, y, width, height = roi
        cv2.rectangle(overlay, (x, y), (x + width, y + height), (112, 243, 196), 2)
        _label(overlay, "pavement shadow ROI", (x + 4, min(overlay.shape[0] - 6, y + 18)), (196, 243, 112))
    entry_zone = assessment.get("entry_zone")
    if not entry_zone and roi:
        entry_zone = list(los_band(tuple(roi), overlay.shape[0], tuple(edge) if edge else None))
    if entry_zone:
        x, y, width, height = entry_zone
        cv2.rectangle(overlay, (x, y), (x + width, y + height), (230, 142, 255), 2)
        _label(overlay, "anonymous body-entry zone", (x + 4, min(overlay.shape[0] - 6, y + height - 6)), (255, 182, 243))
    _label(overlay, title, (12, overlay.shape[0] - 12), (235, 245, 242))
    return overlay


def _scene_overlay(
    calibration_path: Path,
    main_path: Path,
    assessment: dict[str, Any],
    result: dict[str, Any],
    destination: Path,
) -> str | None:
    """Create a contact sheet with the geometry and detected event frames."""

    frames: list[np.ndarray] = []
    calibration = _read_frame(calibration_path)
    if calibration is not None:
        frames.append(_annotate_scene(calibration, assessment, "calibration: selected geometry"))
    for key, label in (("shadow_onset_s", "shadow onset"), ("los_onset_s", "body-entry onset")):
        timestamp = result.get(key)
        if isinstance(timestamp, (int, float)):
            frame = _read_frame(main_path, float(timestamp))
            if frame is not None:
                frames.append(_annotate_scene(frame, assessment, f"{label}: {float(timestamp):.2f} s"))
    if not frames:
        return None
    widest = max(frame.shape[1] for frame in frames)
    normalized = [
        frame if frame.shape[1] == widest else cv2.resize(frame, (widest, round(frame.shape[0] * widest / frame.shape[1])))
        for frame in frames
    ]
    divider = np.full((5, widest, 3), (8, 18, 24), dtype=np.uint8)
    sheet = normalized[0]
    for frame in normalized[1:]:
        sheet = np.vstack((sheet, divider, frame))
    overlay_path = destination / "scene_assessment.png"
    cv2.imwrite(str(overlay_path), sheet)
    return overlay_path.name


def _encode_h264(temporary_path: Path, output_path: Path) -> bool:
    """Convert OpenCV's intermediate video into a video browser can play."""

    try:
        encoded = subprocess.run(
            [
                "ffmpeg", "-y", "-v", "error", "-i", str(temporary_path), "-an", "-c:v", "libx264",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output_path),
            ],
            check=False, capture_output=True, timeout=120,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        temporary_path.unlink(missing_ok=True)
        return False
    temporary_path.unlink(missing_ok=True)
    if encoded.returncode != 0 or not output_path.exists():
        output_path.unlink(missing_ok=True)
        return False
    return True


def _dynamic_box(
    mask: np.ndarray,
    *,
    min_area: float,
    vertical: bool = False,
    preferred_point: tuple[int, int] | None = None,
) -> tuple[int, int, int, int] | None:
    """Return one defensible foreground box from a binary cue mask."""

    cleaned = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates: list[tuple[float, tuple[int, int, int, int]]] = []
    for contour in contours:
        area = float(cv2.contourArea(contour))
        if area < min_area or area > mask.size * 0.42:
            continue
        x, y, width, height = cv2.boundingRect(contour)
        if vertical and height < width * 0.72:
            continue
        score = area
        if preferred_point is not None:
            centre = (x + width / 2, y + height / 2)
            score -= 0.14 * float(np.hypot(centre[0] - preferred_point[0], centre[1] - preferred_point[1]))
        candidates.append((score, (x, y, width, height)))
    return max(candidates, key=lambda candidate: candidate[0])[1] if candidates else None


def _draw_live_box(frame: np.ndarray, box: tuple[int, int, int, int], label: str, colour: tuple[int, int, int]) -> None:
    x, y, width, height = box
    cv2.rectangle(frame, (x, y), (x + width, y + height), colour, 2)
    _label(frame, label, (x + 3, max(17, y - 5)), colour)


def _foot_entry_box(motion: np.ndarray, *, top_height: int, left_edge: int) -> tuple[int, int, int, int] | None:
    """Find a small moving lower-leg or shoe entering through the top of frame.

    The current field clip deliberately contains no full body.  Restricting this
    cue to a compact moving object touching the top pavement edge prevents a
    generic foreground detector from boxing static pavement texture.
    """

    cropped = motion[:top_height, left_edge:]
    cleaned = cv2.morphologyEx(cropped.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates: list[tuple[float, tuple[int, int, int, int]]] = []
    for contour in contours:
        area = float(cv2.contourArea(contour))
        x, y, width, height = cv2.boundingRect(contour)
        # A foot/lower leg arrives through the upper pavement edge.  Large
        # regions are exposure/camera movement, not a defensible foot cue.
        if y > 4 or area < 45 or area > cropped.size * 0.09:
            continue
        if width < 7 or width > cropped.shape[1] * 0.30 or height < 16 or height > top_height * 0.62:
            continue
        compactness = area / max(1.0, width * height)
        if compactness < 0.10:
            continue
        candidates.append((area + height * 3.0, (left_edge + x, y, width, height)))
    return max(candidates, key=lambda candidate: candidate[0])[1] if candidates else None


def _shadow_box_from_motion(
    motion: np.ndarray,
    darkened: np.ndarray,
    *,
    top_height: int,
    left_edge: int,
) -> tuple[int, int, int, int] | None:
    """Select a moving, darker-than-baseline pavement patch as a shadow cue."""

    cue = motion[:top_height, left_edge:] & darkened[:top_height, left_edge:]
    box = _dynamic_box(cue, min_area=max(40.0, cue.size * 0.0015))
    if box is None:
        return None
    x, y, width, height = box
    # Do not call an object that enters at the frame edge a shadow.  Its shadow
    # is normally a flatter patch on the pavement below it.
    if y <= 3 or height > width * 1.4:
        return None
    return left_edge + x, y, width, height


def _analysis_visualization(
    calibration_path: Path,
    main_path: Path,
    assessment: dict[str, Any],
    result: dict[str, Any],
    destination: Path,
) -> str | None:
    """Render a browser-compatible visual explanation of the analysis stream."""

    if not assessment.get("roi"):
        return None
    try:
        calibration_frames, _, _ = read_frames(calibration_path, target_fps=10, max_frames=180)
        calibration = build_calibration_model(calibration_frames)
        main_frames, timestamps, _ = read_frames(main_path, target_fps=10, max_frames=600)
    except (OSError, ValueError):
        return None
    target_height, target_width = calibration.background.shape
    main_frames = [
        frame if frame.shape[:2] == (target_height, target_width)
        else cv2.resize(frame, (target_width, target_height), interpolation=cv2.INTER_AREA)
        for frame in main_frames
    ]
    if not main_frames:
        return None
    temporary_path = destination / "_analysis-visualization-source.mp4"
    output_path = destination / "analysis-visualization.mp4"
    writer = cv2.VideoWriter(
        str(temporary_path), cv2.VideoWriter_fourcc(*"mp4v"), 10.0, (target_width, target_height)
    )
    if not writer.isOpened():
        return None
    timeline = result.get("timeline", [])
    baseline_count = min(len(main_frames), 18)
    baseline_gray = np.median(
        np.stack([cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) for frame in main_frames[:baseline_count]]), axis=0
    ).astype(np.float32)
    motion_model = cv2.createBackgroundSubtractorMOG2(history=36, varThreshold=20, detectShadows=False)
    top_height = max(1, int(target_height * 0.55))
    left_edge = int(target_width * 0.15)
    foot_candidate: tuple[int, int, int, int] | None = None
    foot_candidate_frames = 0
    try:
        for index, (frame, timestamp) in enumerate(zip(main_frames, timestamps, strict=True)):
            point = timeline[min(index, len(timeline) - 1)] if timeline else {}
            visual = frame.copy()
            current_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
            motion = motion_model.apply(frame) == 255
            darkened = current_gray < baseline_gray - 10.0
            shadow_box = _shadow_box_from_motion(
                motion, darkened, top_height=top_height, left_edge=left_edge
            ) if index >= baseline_count else None
            proposed_foot = _foot_entry_box(motion, top_height=top_height, left_edge=left_edge) if index >= baseline_count else None
            if proposed_foot is None:
                foot_candidate = None
                foot_candidate_frames = 0
            elif foot_candidate is not None:
                prior_x, prior_y, prior_width, prior_height = foot_candidate
                proposed_x, proposed_y, proposed_width, proposed_height = proposed_foot
                near_prior = np.hypot(
                    proposed_x + proposed_width / 2 - (prior_x + prior_width / 2),
                    proposed_y + proposed_height / 2 - (prior_y + prior_height / 2),
                ) < max(42.0, target_width * 0.11)
                foot_candidate_frames = foot_candidate_frames + 1 if near_prior else 1
                foot_candidate = proposed_foot
            else:
                foot_candidate = proposed_foot
                foot_candidate_frames = 1
            foot_box = foot_candidate if foot_candidate_frames >= 2 else None
            shadow_seen = shadow_box is not None
            foot_seen = foot_box is not None
            state = "FOOT ENTRY" if foot_seen else "SHADOW CUE" if shadow_seen else "WATCHING PAVEMENT"
            colour = (230, 142, 255) if foot_seen else (112, 243, 196) if shadow_seen else (90, 221, 255)
            shadow_score = float(point.get("presence_probability", 0.0)) * 100
            header = f"{state}  S {shadow_score:02.0f}%"
            (header_width, _), _ = cv2.getTextSize(header, cv2.FONT_HERSHEY_SIMPLEX, 0.36, 1)
            header_x = max(7, target_width - header_width - 16)
            cv2.rectangle(visual, (header_x - 5, 6), (target_width - 6, 27), (7, 17, 22), -1)
            cv2.putText(visual, header, (header_x, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.36, colour, 1, cv2.LINE_AA)
            if shadow_box:
                _draw_live_box(visual, shadow_box, "shadow cue", (190, 72, 245))
            if foot_box:
                _draw_live_box(visual, foot_box, "foot entry", (230, 142, 255))
            if foot_seen:
                _label(visual, "lower leg / foot observed", (12, target_height - 31), (255, 182, 243))
            elif shadow_seen:
                _label(visual, "shadow precedes body", (12, target_height - 31), (196, 243, 112))
            writer.write(visual)
    finally:
        writer.release()
    return output_path.name if _encode_h264(temporary_path, output_path) else None


def _hidden_path_visualization(
    ground_truth_path: Path | None,
    manual_review: dict[str, Any] | None,
    destination: Path,
) -> str | None:
    """Render the optional hidden-path reference as a second annotated movie."""

    if ground_truth_path is None:
        return None
    try:
        frames, timestamps, _ = read_frames(ground_truth_path, target_fps=10, max_frames=600)
    except (OSError, ValueError):
        return None
    if not frames:
        return None
    height, width = frames[0].shape[:2]
    temporary_path = destination / "_hidden-path-source.mp4"
    output_path = destination / "hidden-path-visualization.mp4"
    writer = cv2.VideoWriter(str(temporary_path), cv2.VideoWriter_fourcc(*"mp4v"), 10.0, (width, height))
    if not writer.isOpened():
        return None
    background_gray = np.median(
        np.stack([cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) for frame in frames]), axis=0
    ).astype(np.float32)
    review = manual_review or {}
    raw_samples = review.get("samples", [])
    samples = sorted(
        [sample for sample in raw_samples if isinstance(sample, dict)], key=lambda sample: float(sample.get("timestamp_s", 0))
    ) if isinstance(raw_samples, list) else []

    subtractor = cv2.createBackgroundSubtractorMOG2(history=24, varThreshold=20, detectShadows=True)
    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    previous_body: tuple[int, int, int, int] | None = None
    previous_body_age = 99

    def choose_person_box(frame: np.ndarray) -> tuple[int, int, int, int] | None:
        nonlocal previous_body, previous_body_age
        try:
            raw_boxes, weights = hog.detectMultiScale(frame, winStride=(8, 8), padding=(8, 8), scale=1.05)
        except cv2.error:
            return None
        candidates: list[tuple[float, tuple[int, int, int, int]]] = []
        for raw_box, raw_weight in zip(raw_boxes, weights, strict=False):
            x, y, box_width, box_height = (int(value) for value in raw_box)
            if box_height < box_width * 1.25:
                continue
            score = float(raw_weight)
            if previous_body is not None:
                prior_x, prior_y, prior_width, prior_height = previous_body
                distance = float(np.hypot(x + box_width / 2 - (prior_x + prior_width / 2), y + box_height / 2 - (prior_y + prior_height / 2)))
                score -= min(1.0, distance / max(1, width * 0.20))
            candidates.append((score, (x, y, box_width, box_height)))
        if not candidates:
            return None
        previous_body = max(candidates, key=lambda candidate: candidate[0])[1]
        previous_body_age = 0
        return previous_body

    try:
        for index, (frame, timestamp) in enumerate(zip(frames, timestamps, strict=True)):
            visual = frame.copy()
            header = f"HIDDEN PATH  {timestamp:05.2f}s"
            (header_width, _), _ = cv2.getTextSize(header, cv2.FONT_HERSHEY_SIMPLEX, 0.36, 1)
            header_x = max(7, width - header_width - 16)
            cv2.rectangle(visual, (header_x - 5, 6), (width - 6, 27), (7, 17, 22), -1)
            cv2.putText(visual, header, (header_x, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (112, 243, 196), 1, cv2.LINE_AA)
            motion = subtractor.apply(frame)
            preferred_point = None
            if samples:
                sample_times = [float(sample.get("timestamp_s", 0)) for sample in samples]
                if sample_times[0] <= timestamp <= sample_times[-1]:
                    x = float(np.interp(timestamp, sample_times, [float(sample.get("x", 0)) for sample in samples]))
                    y = float(np.interp(timestamp, sample_times, [float(sample.get("y", 0)) for sample in samples]))
                    preferred_point = (int(np.clip(x, 0, 1) * (width - 1)), int(np.clip(y, 0, 1) * (height - 1)))
            body_box = choose_person_box(frame)
            if body_box is None and previous_body is not None and previous_body_age < 5:
                body_box = previous_body
            if body_box is None and index >= 12:
                body_box = _dynamic_box(
                    motion == 255,
                    min_area=max(70.0, width * height * 0.002),
                    vertical=True,
                    preferred_point=preferred_point,
                )
                if body_box:
                    previous_body = body_box
                    previous_body_age = 0
            previous_body_age += 1
            if body_box:
                _draw_live_box(visual, body_box, "anonymous body", (230, 142, 255))
                bx, by, bw, bh = body_box
                shadow_y = min(height - 1, by + int(bh * 0.62))
                shadow_x0 = max(0, bx - int(width * 0.24))
                shadow_x1 = min(width, bx + bw + int(width * 0.24))
                current_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
                shadow_mask = current_gray[shadow_y:height, shadow_x0:shadow_x1] < background_gray[shadow_y:height, shadow_x0:shadow_x1] - 10.0
                shadow_box = _dynamic_box(
                    shadow_mask,
                    min_area=max(28.0, shadow_mask.size * 0.008),
                )
                if shadow_box:
                    sx, sy, sw, sh = shadow_box
                    _draw_live_box(visual, (shadow_x0 + sx, shadow_y + sy, sw, sh), "shadow cue", (190, 72, 245))
            elif index >= 12:
                shadow_box = _dynamic_box(motion == 127, min_area=max(70.0, width * height * 0.002))
                if shadow_box:
                    _draw_live_box(visual, shadow_box, "shadow cue", (190, 72, 245))
            writer.write(visual)
    finally:
        writer.release()
    return output_path.name if _encode_h264(temporary_path, output_path) else None


def _value(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.3f}"
    return html.escape(str(value))


def write_artifacts(
    *,
    run_directory: Path,
    report_directory: Path,
    analysis_id: str,
    result: dict[str, Any],
    calibration_path: Path,
    main_path: Path,
    ground_truth_path: Path | None = None,
    manual_ground_truth: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Persist JSON/CSV/HTML plus a non-identifying scene diagnostic image."""

    destination = run_directory / analysis_id
    destination.mkdir(parents=True, exist_ok=True)
    visualization_name = _analysis_visualization(
        calibration_path, main_path, result["scene_assessment"], result, destination
    )
    hidden_visualization_name = _hidden_path_visualization(ground_truth_path, manual_ground_truth, destination)
    result["visualization"] = {"available": bool(visualization_name), "filename": visualization_name}
    result["visualizations"] = {
        "corner_trial_available": bool(visualization_name),
        "hidden_path_available": bool(hidden_visualization_name),
    }
    result_path = destination / "result.json"
    result_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    predictions_path = destination / "predictions.csv"
    timeline = result.get("timeline", [])
    with predictions_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "timestamp_s",
                "presence_probability",
                "los_probability",
                "position_norm",
                "signal_energy",
            ],
        )
        writer.writeheader()
        writer.writerows({key: item.get(key) for key in writer.fieldnames} for item in timeline)
    overlay_name = _scene_overlay(calibration_path, main_path, result["scene_assessment"], result, destination)
    probability = [float(item["presence_probability"]) for item in timeline]
    positions = [float(item["position_norm"]) for item in timeline]
    baselines = result.get("baselines", {})
    baseline_rows = "".join(
        "<tr><td>{}</td><td>{}</td><td>{}</td></tr>".format(
            html.escape(name.replace("_", " ").title()),
            _value(values.get("presence_probability")),
            _value(values.get("state")),
        )
        for name, values in baselines.items()
    )
    metrics_rows = "".join(
        "<tr><td>{}</td><td>{}</td></tr>".format(html.escape(key.replace("_", " ").title()), _value(value))
        for key, value in result.get("metrics", {}).items()
    )
    reasons = "".join(f"<li>{html.escape(str(reason))}</li>" for reason in result.get("reasons", []))
    scene = result["scene_assessment"]
    overlay = (
        f'<img src="data:image/png;base64,{base64.b64encode((destination / overlay_name).read_bytes()).decode()}" alt="Automatic corner and ROI overlay">'
        if overlay_name
        else "<p>Scene overlay could not be decoded.</p>"
    )
    report = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Umbra evidence report {analysis_id}</title>
<style>
body {{ background:#0b1218; color:#e8f0f4; font:15px system-ui,sans-serif; margin:0; }}
main {{ max-width:960px; margin:auto; padding:38px 24px 70px; }}
h1 {{ margin-bottom:4px; }} .muted {{ color:#98aab7; }} .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; }}
.card {{ background:#14212b; border:1px solid #29404e; border-radius:12px; padding:15px; }}
.state {{ color:#87f5c6; font-weight:700; text-transform:uppercase; }} table {{ width:100%; border-collapse:collapse; }} td,th {{ padding:8px; text-align:left; border-bottom:1px solid #29404e; }}
svg {{ width:100%; background:#0e1a22; border-radius:8px; }} img {{ max-width:100%; border-radius:8px; }}
@media print {{ body {{ background:#fff; color:#111; }} .card {{ border-color:#bbb; background:#fff; }} svg {{ background:#f6f6f6; }} }}
</style></head><body><main>
<p class="muted">LOCAL-ONLY • CONSENT-BASED RESEARCH ARTIFACT</p>
<h1>Umbra evidence report</h1><p class="state">{html.escape(result['state'])}</p>
<p><strong>Evidence: {_value(result.get('evidence', {}).get('kind', 'unclassified'))}.</strong>
{_value(result.get('evidence', {}).get('limitation', 'Field performance has not been established.'))}</p>
<div class="grid"><section class="card"><strong>Confidence</strong><br>{_value(result['confidence'])}</section>
<section class="card"><strong>Shadow evidence</strong><br>{_value(result.get('presence_probability'))}</section>
<section class="card"><strong>Lead time (s)</strong><br>{_value(result.get('lead_time_s'))}</section>
<section class="card"><strong>Line of sight</strong><br>{_value(result.get('los_onset_s'))}</section></div>
<h2>Why Umbra made this decision</h2><ul>{reasons}</ul>
<h2>Automatic scene assessment and event frames</h2>{overlay}
<p class="muted">The downloadable evidence ZIP includes browser-playable corner-trial and hidden-path videos when rendering was available. They draw the selected geometry and review labels; they do not identify the walker.</p>
<div class="grid"><section class="card"><strong>Coverage</strong><br>{_value(scene['coverage_score'])}</section>
<section class="card"><strong>Calibration stability</strong><br>{_value(scene['calibration_stability'])}</section>
<section class="card"><strong>ROI quality</strong><br>{_value(scene['roi_score'])}</section></div>
<h2>Pavement-shadow probability over time</h2>{_line_chart(probability)}
<h2>Estimated shadow-track probability</h2>{_track_heatmap(timeline)}
<h2>Estimated normalized shadow position</h2>{_line_chart(positions, colour='#6dd6ff')}
<p>Position is an unvalidated image-derived track proxy. Lead time is shadow onset minus the first line-of-sight frame on the same camera. These are not Bouman penumbra reconstructions.</p>
<h2>Method comparison</h2><table><tr><th>Method</th><th>Presence probability</th><th>State</th></tr>{baseline_rows}</table>
<h2>Ground-truth evaluation</h2><table>{metrics_rows}</table>
<p>Metrics use timestamp-matched valid labels. Missing metrics mean evaluation was unavailable. Automatic field labels require review.</p>
<h2>Reproduction details</h2><pre style="white-space:pre-wrap;overflow-wrap:anywhere">{html.escape(json.dumps(result.get('provenance', {}), indent=2))}</pre>
<p class="muted">The annotated frames show only automatic corner, pavement, and anonymous entry-zone geometry. Umbra does not identify a person or infer pose. Low-confidence and no-coverage results are expected safety behavior.</p>
</main></body></html>"""
    report_directory.mkdir(parents=True, exist_ok=True)
    report_path = report_directory / f"{analysis_id}.html"
    report_path.write_text(report, encoding="utf-8")
    return {
        "result": str(result_path),
        "predictions": str(predictions_path),
        "report": str(report_path),
        "overlay": str(destination / overlay_name) if overlay_name else "",
        "visualization": str(destination / visualization_name) if visualization_name else "",
        "hidden_path_visualization": str(destination / hidden_visualization_name) if hidden_visualization_name else "",
    }
