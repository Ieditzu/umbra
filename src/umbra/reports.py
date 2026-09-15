"""Reproducible, local-only result artifacts."""

from __future__ import annotations

import csv
import html
import json
from pathlib import Path
from typing import Any

import cv2


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


def _scene_overlay(calibration_path: Path, assessment: dict[str, Any], destination: Path) -> str | None:
    capture = cv2.VideoCapture(str(calibration_path))
    ok, frame = capture.read()
    capture.release()
    if not ok:
        return None
    edge, roi = assessment.get("edge"), assessment.get("roi")
    if edge:
        cv2.line(frame, tuple(edge[:2]), tuple(edge[2:]), (255, 221, 90), 3)
    if roi:
        x, y, width, height = roi
        cv2.rectangle(frame, (x, y), (x + width, y + height), (112, 243, 196), 2)
    overlay_path = destination / "scene_assessment.png"
    cv2.imwrite(str(overlay_path), frame)
    return overlay_path.name


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
) -> dict[str, str]:
    """Persist JSON/CSV/HTML plus a non-identifying scene diagnostic image."""

    destination = run_directory / analysis_id
    destination.mkdir(parents=True, exist_ok=True)
    result_path = destination / "result.json"
    result_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    predictions_path = destination / "predictions.csv"
    timeline = result.get("timeline", [])
    with predictions_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["timestamp_s", "presence_probability", "position_norm", "signal_energy"],
        )
        writer.writeheader()
        writer.writerows({key: item.get(key) for key in writer.fieldnames} for item in timeline)
    overlay_name = _scene_overlay(calibration_path, result["scene_assessment"], destination)
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
        f'<img src="/artifacts/runs/{analysis_id}/{overlay_name}" alt="Automatic corner and ROI overlay">'
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
<div class="grid"><section class="card"><strong>Confidence</strong><br>{_value(result['confidence'])}</section>
<section class="card"><strong>Motion probability</strong><br>{_value(result.get('presence_probability'))}</section>
<section class="card"><strong>Direction</strong><br>{_value(result.get('direction'))}</section>
<section class="card"><strong>Speed class</strong><br>{_value(result.get('speed_class'))}</section></div>
<h2>Why Umbra made this decision</h2><ul>{reasons}</ul>
<h2>Automatic scene assessment</h2>{overlay}
<div class="grid"><section class="card"><strong>Coverage</strong><br>{_value(scene['coverage_score'])}</section>
<section class="card"><strong>Calibration stability</strong><br>{_value(scene['calibration_stability'])}</section>
<section class="card"><strong>ROI quality</strong><br>{_value(scene['roi_score'])}</section></div>
<h2>Presence probability over time</h2>{_line_chart(probability)}
<h2>Estimated hidden-track probability</h2>{_track_heatmap(timeline)}
<h2>Estimated normalized position</h2>{_line_chart(positions, colour='#6dd6ff')}
<h2>Method comparison</h2><table><tr><th>Method</th><th>Presence probability</th><th>State</th></tr>{baseline_rows}</table>
<h2>Ground-truth evaluation</h2><table>{metrics_rows}</table>
<p class="muted">This report is not evidence of a person's identity, pose, or appearance. Low-confidence and no-coverage results are expected safety behavior.</p>
</main></body></html>"""
    report_directory.mkdir(parents=True, exist_ok=True)
    report_path = report_directory / f"{analysis_id}.html"
    report_path.write_text(report, encoding="utf-8")
    return {
        "result": str(result_path),
        "predictions": str(predictions_path),
        "report": str(report_path),
        "overlay": str(destination / overlay_name) if overlay_name else "",
    }
