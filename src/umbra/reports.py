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
from .vision import CalibrationModel, build_calibration_model, extract_scene_shadow_signal, los_band


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


def _hidden_motion_frames(result: dict[str, Any]) -> dict[int, float]:
    motion = result.get("hidden_motion")
    if not isinstance(motion, dict):
        return {}
    return {
        int(item["frame_index"]): float(item["progress_norm"])
        for item in motion.get("frames", [])
    }


def _draw_hidden_motion(frame: np.ndarray, progress: float) -> None:
    """A schematic of relative shadow travel, deliberately not placed on the hidden ground."""

    height, width = frame.shape[:2]
    panel_width = min(208, width - 16)
    if panel_width < 125 or height < 100:
        return
    panel = frame[35:99, 8:8 + panel_width]
    dark = np.full_like(panel, (8, 18, 24))
    frame[35:99, 8:8 + panel_width] = cv2.addWeighted(panel, 0.2, dark, 0.8, 0)
    cv2.putText(frame, "SHADOW-DERIVED MOTION", (14, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.34, (112, 243, 196), 1, cv2.LINE_AA)
    cv2.putText(frame, "relative travel, not body position", (14, 94), cv2.FONT_HERSHEY_SIMPLEX, 0.29, (190, 205, 208), 1, cv2.LINE_AA)
    start_x, end_x, line_y = 24, 8 + panel_width - 17, 71
    cv2.line(frame, (start_x, line_y), (end_x, line_y), (93, 115, 119), 2, cv2.LINE_AA)
    marker_x = int(round(start_x + np.clip(progress, 0.0, 1.0) * (end_x - start_x)))
    cv2.line(frame, (start_x, line_y), (marker_x, line_y), (112, 243, 196), 2, cv2.LINE_AA)
    cv2.circle(frame, (marker_x, line_y), 9, (65, 99, 95), 1, cv2.LINE_AA)
    cv2.circle(frame, (marker_x, line_y), 4, (112, 243, 196), -1, cv2.LINE_AA)


def _draw_hidden_position(frame: np.ndarray, progress: float, path: list[list[float]]) -> None:
    """Draw a green estimated-position dot along the automatically inferred hidden route."""
    height, width = frame.shape[:2]
    start, corner = path
    fraction = float(np.clip(progress, 0.0, 1.0))
    first = (int(round(start[0] * width)), int(round(start[1] * height)))
    last = (int(round(corner[0] * width)), int(round(corner[1] * height)))
    point = (int(round(first[0] + fraction * (last[0] - first[0]))),
             int(round(first[1] + fraction * (last[1] - first[1]))))
    green = (70, 235, 80)
    cv2.line(frame, first, last, (48, 135, 60), max(1, width // 500), cv2.LINE_AA)
    radius = max(5, width // 90)
    cv2.circle(frame, point, radius + 3, (12, 28, 18), -1, cv2.LINE_AA)
    cv2.circle(frame, point, radius, green, -1, cv2.LINE_AA)
    cv2.circle(frame, point, radius + 1, (225, 255, 225), max(1, width // 800), cv2.LINE_AA)
    _label(frame, "HIDDEN POSITION ESTIMATE", (10, 20), green)


def _draw_shadow_derived_overlay(
    frame: np.ndarray,
    progress: float,
    result: dict[str, Any],
) -> None:
    motion = result.get("hidden_motion")
    path = motion.get("overlay_path") if isinstance(motion, dict) else None
    if isinstance(path, list) and len(path) == 2:
        _draw_hidden_position(frame, progress, path)
    else:
        _draw_hidden_motion(frame, progress)


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
    if not entry_zone and roi and assessment.get("roi_source") != "manual_phone":
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


def _body_evidence_box(motion: np.ndarray, *, top_height: int, left_edge: int) -> tuple[int, int, int, int] | None:
    """Find a compact, moving part of an anonymous body entering the frame.

    The current field clip deliberately contains only a lower-body fragment.
    That is still body evidence, but it is not enough to claim a full-body
    detection.  Restricting the cue to a moving entry object prevents static
    pavement texture from becoming a false person box.
    """

    cropped = motion[:top_height, left_edge:]
    cleaned = cv2.morphologyEx(cropped.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates: list[tuple[float, tuple[int, int, int, int]]] = []
    for contour in contours:
        area = float(cv2.contourArea(contour))
        x, y, width, height = cv2.boundingRect(contour)
        # The visible part of the walker arrives through the upper pavement
        # edge. Large regions are exposure/camera movement, not body evidence.
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
    """Box the combined moving dark pavement patches that form one shadow."""

    cue = motion[:top_height, left_edge:] & darkened[:top_height, left_edge:]
    cue = cv2.morphologyEx(cue.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cue = cv2.morphologyEx(cue, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    contours, _ = cv2.findContours(cue, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    fragments: list[tuple[int, int, int, int]] = []
    for contour in contours:
        area = float(cv2.contourArea(contour))
        x, y, width, height = cv2.boundingRect(contour)
        if area < max(26.0, cue.size * 0.0008) or area > cue.size * 0.20:
            continue
        # The body fragment enters through y=0. Its cast shadow is a flatter
        # patch of pavement below it, often split into several components.
        if y <= 3 or height > width * 1.4:
            continue
        fragments.append((x, y, width, height))
    if not fragments:
        return None
    x0 = min(fragment[0] for fragment in fragments)
    y0 = min(fragment[1] for fragment in fragments)
    x1 = max(fragment[0] + fragment[2] for fragment in fragments)
    y1 = max(fragment[1] + fragment[3] for fragment in fragments)
    if (x1 - x0) * (y1 - y0) > cue.size * 0.34:
        return None
    return left_edge + x0, y0, x1 - x0, y1 - y0


def _visible_body_box(motion: np.ndarray) -> tuple[int, int, int, int] | None:
    """Find a moving upright region after a reviewed body-entry timestamp."""

    height, width = motion.shape
    cropped = motion[:, : int(width * 0.78)]
    cleaned = cv2.morphologyEx(cropped.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates: list[tuple[float, tuple[int, int, int, int]]] = []
    for contour in contours:
        area = float(cv2.contourArea(contour))
        x, y, box_width, box_height = cv2.boundingRect(contour)
        if area < max(100.0, motion.size * 0.0008) or area > motion.size * 0.30:
            continue
        if y > height * 0.62 or box_height < height * 0.12 or box_height < box_width * 0.8:
            continue
        candidates.append((area, (x, y, box_width, box_height)))
    if not candidates:
        return None
    anchor = max(candidates, key=lambda item: item[0])[1]
    ax, ay, aw, ah = anchor
    # Background subtraction often separates the head, torso and shoes. Join
    # nearby vertical pieces while excluding the flat cast shadow on ground.
    related = [anchor]
    for contour in contours:
        area = float(cv2.contourArea(contour))
        x, y, box_width, box_height = cv2.boundingRect(contour)
        if area < 75 or box_height < 12 or y > height * 0.9:
            continue
        if x + box_width < ax - 16 or x > ax + aw + 36:
            continue
        if y > height * 0.75 and box_height < 18:
            continue
        related.append((x, y, box_width, box_height))
    x0 = min(box[0] for box in related)
    y0 = min(box[1] for box in related)
    x1 = max(box[0] + box[2] for box in related)
    y1 = max(box[1] + box[3] for box in related)
    return x0, y0, x1 - x0, y1 - y0


def _overhead_tracks(
    frames: list[np.ndarray],
    background_gray: np.ndarray,
    review: dict[str, Any],
) -> list[tuple[tuple[int, int, int, int] | None, tuple[int, int, int, int] | None]] | None:
    """Track a dark overhead walker and its ground shadow as separate objects."""

    samples = review.get("samples")
    if not isinstance(samples, list) or not samples:
        return None
    height, width = frames[0].shape[:2]
    seed = samples[0]
    if not isinstance(seed, dict):
        return None
    route_y = int(float(seed.get("y", 0.5)) * height)
    y0, y1 = max(0, route_y - 42), min(height, route_y + 42)
    pavement_level = float(np.quantile(background_gray[y0:y1], 0.6))
    dark_cutoff = float(np.clip(pavement_level * 0.23, 30.0, 48.0))
    previous_x = float(seed.get("x", 0.0)) * width
    tracks: list[tuple[tuple[int, int, int, int] | None, tuple[int, int, int, int] | None]] = []
    for frame in frames:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
        subject_mask = ((gray[y0:y1] < dark_cutoff) & (background_gray[y0:y1] - gray[y0:y1] > 12)).astype(np.uint8)
        subject_mask = cv2.morphologyEx(subject_mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        contours, _ = cv2.findContours(subject_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates: list[tuple[float, tuple[int, int, int, int]]] = []
        for contour in contours:
            area = float(cv2.contourArea(contour))
            x, local_y, box_width, box_height = cv2.boundingRect(contour)
            if area < 90 or box_width < 10 or box_width > width * 0.13 or box_height < 14 or box_height > height * 0.24:
                continue
            centre_x = x + box_width / 2
            distance = abs(centre_x - previous_x)
            if distance > width * 0.13:
                continue
            candidates.append((area * 0.003 - distance, (x, y0 + local_y, box_width, box_height)))
        body_box = max(candidates, key=lambda item: item[0])[1] if candidates else None
        shadow_box = None
        if body_box:
            bx, by, bw, bh = body_box
            previous_x = bx + bw / 2
            sx0, sx1 = bx + bw - 2, min(width, bx + bw + int(width * 0.22))
            sy0, sy1 = max(y0, by - 6), min(y1, by + bh + 6)
            if sx1 > sx0 and sy1 > sy0:
                local_gray = gray[sy0:sy1, sx0:sx1]
                local_background = background_gray[sy0:sy1, sx0:sx1]
                shadow_mask = ((local_background - local_gray > 18) & (local_gray < local_background * 0.72)).astype(np.uint8)
                shadow_mask = cv2.morphologyEx(shadow_mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
                shadow_mask = cv2.morphologyEx(shadow_mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
                shadow_local = _dynamic_box(shadow_mask, min_area=45.0)
                if shadow_local:
                    sx, sy, sw, sh = shadow_local
                    shadow_box = sx0 + sx, sy0 + sy, sw, sh
        tracks.append((body_box, shadow_box))
    visible = [(i, box) for i, (box, _) in enumerate(tracks) if box is not None]
    if len(visible) < len(frames) * 0.65:
        return None
    first_x = visible[0][1][0]
    last_x = visible[-1][1][0]
    if abs(last_x - first_x) < width * 0.25:
        return None
    return tracks


def _scene_tuned_visualization(
    calibration: CalibrationModel,
    frames: list[np.ndarray],
    timestamps: list[float],
    result: dict[str, Any],
    destination: Path,
) -> str | None:
    """Replay the same reviewed pavement signal that produced the result."""

    height, width = frames[0].shape[:2]
    x, y, roi_width, roi_height = (int(value) for value in result["scene_assessment"]["roi"])
    signal = extract_scene_shadow_signal(frames, calibration, (x, y, roi_width, roi_height))
    temporary_path = destination / "_analysis-visualization-source.mp4"
    output_path = destination / "analysis-visualization.mp4"
    writer = cv2.VideoWriter(str(temporary_path), cv2.VideoWriter_fourcc(*"mp4v"), 10.0, (width, height))
    if not writer.isOpened():
        return None
    motion_model = cv2.createBackgroundSubtractorMOG2(history=36, varThreshold=20, detectShadows=False)
    entry_time = result.get("los_onset_s")
    motion_frames = _hidden_motion_frames(result)
    try:
        for index, (frame, timestamp, cue) in enumerate(zip(frames, timestamps, signal, strict=True)):
            visual = frame.copy()
            motion = motion_model.apply(frame) == 255
            mask = cue["shadow_mask"].astype(np.uint8).copy()
            score = float(cue["presence"])
            body_marked = isinstance(entry_time, (int, float)) and timestamp >= float(entry_time)
            body_box = _visible_body_box(motion) if body_marked else None
            if body_box:
                bx, by, bw, bh = body_box
                mx0, my0 = max(0, bx - x), max(0, by - y)
                mx1, my1 = min(roi_width, bx + bw - x), min(roi_height, by + bh - y)
                if mx1 > mx0 and my1 > my0:
                    mask[my0:my1, mx0:mx1] = 0
            shadow_seen = score >= 0.5 and bool(mask.any())
            if shadow_seen:
                patch = visual[y : y + roi_height, x : x + roi_width]
                tint = patch.copy()
                tint[mask > 0] = (112, 243, 196)
                visual[y : y + roi_height, x : x + roi_width] = cv2.addWeighted(patch, 0.6, tint, 0.4, 0)
                local_box = cv2.boundingRect(cv2.findNonZero(mask))
                sx, sy, sw, sh = local_box
                _draw_live_box(visual, (x + sx, y + sy, sw, sh), "shadow cue", (112, 243, 196))
            if body_box:
                _draw_live_box(visual, body_box, "anonymous body", (230, 142, 255))
            if index in motion_frames and not body_marked and not body_box:
                progress = motion_frames[index]
                _draw_shadow_derived_overlay(visual, progress, result)
            state = "BODY VISIBLE" if body_box else "BODY ENTRY MARK" if body_marked else "SHADOW CUE" if shadow_seen else "WATCHING PAVEMENT"
            colour = (230, 142, 255) if body_marked else (112, 243, 196) if shadow_seen else (90, 221, 255)
            header = f"{state}  S {score * 100:02.0f}%" if shadow_seen else state
            (header_width, _), _ = cv2.getTextSize(header, cv2.FONT_HERSHEY_SIMPLEX, 0.36, 1)
            header_x = max(7, width - header_width - 16)
            cv2.rectangle(visual, (header_x - 5, 6), (width - 6, 27), (7, 17, 22), -1)
            cv2.putText(visual, header, (header_x, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.36, colour, 1, cv2.LINE_AA)
            writer.write(visual)
    finally:
        writer.release()
    return output_path.name if _encode_h264(temporary_path, output_path) else None


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
    if assessment.get("roi_source") == "manual_phone":
        return _scene_tuned_visualization(calibration, main_frames, timestamps, result, destination)
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
    body_candidate: tuple[int, int, int, int] | None = None
    body_candidate_frames = 0
    motion_frames = _hidden_motion_frames(result)
    entry_time = result.get("los_onset_s")
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
            proposed_body = _body_evidence_box(motion, top_height=top_height, left_edge=left_edge) if index >= baseline_count else None
            if proposed_body is None:
                body_candidate = None
                body_candidate_frames = 0
            elif body_candidate is not None:
                prior_x, prior_y, prior_width, prior_height = body_candidate
                proposed_x, proposed_y, proposed_width, proposed_height = proposed_body
                near_prior = np.hypot(
                    proposed_x + proposed_width / 2 - (prior_x + prior_width / 2),
                    proposed_y + proposed_height / 2 - (prior_y + prior_height / 2),
                ) < max(42.0, target_width * 0.11)
                body_candidate_frames = body_candidate_frames + 1 if near_prior else 1
                body_candidate = proposed_body
            else:
                body_candidate = proposed_body
                body_candidate_frames = 1
            body_box = body_candidate if body_candidate_frames >= 2 else None
            shadow_seen = shadow_box is not None
            body_seen = body_box is not None
            state = "BODY EVIDENCE" if body_seen else "SHADOW CUE" if shadow_seen else "WATCHING PAVEMENT"
            colour = (230, 142, 255) if body_seen else (112, 243, 196) if shadow_seen else (90, 221, 255)
            shadow_score = float(point.get("presence_probability", 0.0)) * 100
            header = f"{state}  S {shadow_score:02.0f}%"
            (header_width, _), _ = cv2.getTextSize(header, cv2.FONT_HERSHEY_SIMPLEX, 0.36, 1)
            header_x = max(7, target_width - header_width - 16)
            cv2.rectangle(visual, (header_x - 5, 6), (target_width - 6, 27), (7, 17, 22), -1)
            cv2.putText(visual, header, (header_x, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.36, colour, 1, cv2.LINE_AA)
            if shadow_box:
                _draw_live_box(visual, shadow_box, "shadow cue", (190, 72, 245))
            if body_box:
                _draw_live_box(visual, body_box, "anonymous body", (230, 142, 255))
            if index in motion_frames and not body_seen and (
                not isinstance(entry_time, (int, float)) or timestamp < float(entry_time)
            ):
                progress = motion_frames[index]
                _draw_shadow_derived_overlay(visual, progress, result)
            if body_seen:
                _label(visual, "partial body observed", (12, target_height - 31), (255, 182, 243))
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
    overhead_tracks = _overhead_tracks(frames, background_gray, review)
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
            if overhead_tracks is not None:
                overhead_body, overhead_shadow = overhead_tracks[index]
                if overhead_shadow:
                    sx, sy, sw, sh = overhead_shadow
                    cv2.rectangle(visual, (sx, sy), (sx + sw, sy + sh), (112, 243, 196), 2)
                    _label(visual, "shadow cue", (sx + 3, min(height - 6, sy + sh + 15)), (112, 243, 196))
                if overhead_body:
                    _draw_live_box(visual, overhead_body, "anonymous body", (230, 142, 255))
                writer.write(visual)
                continue
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
<h2>Scene assessment and event frames</h2>{overlay}
<p class="muted">The downloadable evidence ZIP includes browser-playable corner-trial and hidden-path videos when rendering was available. They draw the selected shadow evidence and review labels; they do not identify the walker.</p>
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
