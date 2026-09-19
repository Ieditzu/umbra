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
from .vision import build_calibration_model, los_band, normalised_residual


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
    roi = tuple(assessment["roi"])
    timeline = result.get("timeline", [])
    shadow_onset = result.get("shadow_onset_s")
    entry_onset = result.get("los_onset_s")
    entry_source = str(result.get("entry_source", "automatic")).replace("_", " ")
    try:
        for index, (frame, timestamp) in enumerate(zip(main_frames, timestamps, strict=True)):
            point = timeline[min(index, len(timeline) - 1)] if timeline else {}
            visual = _annotate_scene(frame, assessment, "")
            x, y, width, height = roi
            residual = normalised_residual(frame, calibration)
            patch = residual[y : y + height, x : x + width]
            lit = calibration.lit_mask[y : y + height, x : x + width]
            shadow_mask = (patch < -max(3.0, calibration.noise * 1.35)) & lit
            tint = visual[y : y + height, x : x + width].copy()
            tint[shadow_mask] = (190, 72, 245)
            visual[y : y + height, x : x + width] = cv2.addWeighted(
                visual[y : y + height, x : x + width], 0.55, tint, 0.45, 0
            )
            shadow_seen = isinstance(shadow_onset, (int, float)) and timestamp >= shadow_onset
            body_seen = isinstance(entry_onset, (int, float)) and timestamp >= entry_onset
            state = "BODY ENTERED" if body_seen else "SHADOW DETECTED" if shadow_seen else "WATCHING PAVEMENT"
            colour = (112, 243, 196) if shadow_seen else (90, 221, 255)
            cv2.rectangle(visual, (7, 7), (target_width - 7, 65), (7, 17, 22), -1)
            cv2.putText(visual, f"UMBRA  {state}", (15, 29), cv2.FONT_HERSHEY_SIMPLEX, 0.53, colour, 2, cv2.LINE_AA)
            shadow_score = float(point.get("presence_probability", 0.0)) * 100
            body_score = float(point.get("los_probability", 0.0)) * 100
            cv2.putText(
                visual,
                f"t {timestamp:05.2f}s   shadow {shadow_score:02.0f}%   body {body_score:02.0f}%",
                (15, 51), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (232, 244, 240), 1, cv2.LINE_AA,
            )
            if body_seen:
                _label(visual, f"body entry ({entry_source})", (12, target_height - 31), (255, 182, 243))
            elif shadow_seen:
                _label(visual, "shadow precedes body", (12, target_height - 31), (196, 243, 112))
            writer.write(visual)
    finally:
        writer.release()
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
        return None
    temporary_path.unlink(missing_ok=True)
    if encoded.returncode != 0 or not output_path.exists():
        output_path.unlink(missing_ok=True)
        return None
    return output_path.name


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
) -> dict[str, str]:
    """Persist JSON/CSV/HTML plus a non-identifying scene diagnostic image."""

    destination = run_directory / analysis_id
    destination.mkdir(parents=True, exist_ok=True)
    visualization_name = _analysis_visualization(
        calibration_path, main_path, result["scene_assessment"], result, destination
    )
    result["visualization"] = {"available": bool(visualization_name), "filename": visualization_name}
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
<p class="muted">The downloadable evidence ZIP includes the browser-playable analysis visualization when rendering was available. It draws the automatically selected geometry and shadow evidence; it does not identify the walker.</p>
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
    }
