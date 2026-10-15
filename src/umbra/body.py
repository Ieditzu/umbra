"""Low-light upright-foreground evidence, separate from pavement shadow cues.

This is a silhouette heuristic, not a semantic person or pose model. Recorded
trials need an empty opening; no person-specific training or labels are used.
"""

from __future__ import annotations

import cv2
import numpy as np

from .vision import CalibrationModel, align_to_reference, grayscale

BodyBox = tuple[int, int, int, int]


def upright_foreground_box(mask: np.ndarray, previous: BodyBox | None = None) -> BodyBox | None:
    """Find an upright core before recovering its head, arms and visible legs.

    A cast shadow can touch a person's feet and create one very wide component.
    Vertical opening removes that thin tail instead of rejecting the entire
    person or putting a rectangle around both body and shadow.
    """
    height, width = mask.shape
    cleaned = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    vertical = cv2.morphologyEx(
        cleaned, cv2.MORPH_OPEN, np.ones((max(9, int(height * 0.07) | 1), 3), np.uint8),
    )
    count, labels, stats, _ = cv2.connectedComponentsWithStats(vertical)
    candidates: list[tuple[float, int]] = []
    for component in range(1, count):
        x, y, bw, bh, area = (int(v) for v in stats[component])
        if area < max(55, mask.size * 0.0006) or area > mask.size * 0.18:
            continue
        if y > height * 0.50 or bh < max(24, height * 0.16) or bh < bw * 1.3:
            continue
        score = float(area)
        if previous:
            px, py, pw, ph = previous
            distance = np.hypot(x + bw / 2 - px - pw / 2, y + bh / 2 - py - ph / 2)
            score *= 1.0 + max(0.0, 1.0 - distance / max(ph, 24))
        candidates.append((score, component))
    if not candidates:
        return None
    component = max(candidates)[1]
    x, y, bw, bh, core_area = (int(v) for v in stats[component])
    # Only recover foreground near the upright core. A head may be detached by
    # the vertical filter, while the ground tail must not expand the whole box.
    horizontal_pad = max(4, int(bh * 0.10))
    top_pad = max(6, int(bh * 0.22))
    bottom_pad = max(3, int(bh * 0.04))
    x0, x1 = max(0, x - horizontal_pad), min(width, x + bw + horizontal_pad)
    y0, y1 = max(0, y - top_pad), min(height, y + bh + bottom_pad)
    neighbourhood = cleaned[y0:y1, x0:x1]
    # Keep connected foreground and vertically aligned head fragments, not an
    # unrelated bright/noisy patch next to the person.
    n, local_labels, local_stats, _ = cv2.connectedComponentsWithStats(neighbourhood)
    selected = np.zeros_like(neighbourhood, dtype=bool)
    seed = (labels == component)[y0:y1, x0:x1]
    for local in range(1, n):
        lx, ly, lw, lh, area = (int(v) for v in local_stats[local])
        touches_seed = bool(np.any(seed & (local_labels == local)))
        above_core = y0 + ly + lh <= y + 3 and y - (y0 + ly + lh) <= max(6, bh * 0.08)
        overlaps_core = min(x0 + lx + lw, x + bw) - max(x0 + lx, x) >= min(lw, bw) * 0.3
        if touches_seed or (above_core and overlaps_core and area >= max(9, core_area * 0.025)):
            selected |= local_labels == local
    # Thin connected exposure fringes above the head should not stretch the
    # box upward. Recover a head only when several rows have real support.
    core_top = y - y0
    row_support = selected.sum(axis=1)
    recovered_top = core_top
    for row in range(max(0, core_top)):
        if np.min(row_support[row:row + 3]) >= max(4, bw * 0.22):
            recovered_top = row
            break
    selected[:recovered_top] = False
    yy, xx = np.where(selected)
    if not len(xx):
        return None
    return x0 + int(xx.min()), y0 + int(yy.min()), int(xx.max() - xx.min() + 1), int(yy.max() - yy.min() + 1)


def night_body_tracks(frames: list[np.ndarray], calibration: CalibrationModel) -> list[BodyBox | None]:
    """Detect low-light foreground without MOG absorbing a slow/stopped walker.

    The first 18 analysis samples supply a fixed, trial-aligned empty
    baseline. Robust gain/offset correction and per-pixel noise thresholds keep
    lamp flicker, sensor grain and empty/trial mismatch from becoming bodies.
    Missing foreground immediately removes a box; it is never extrapolated.
    """
    if not frames:
        return []
    registered = [align_to_reference(frame, calibration.background) for frame in frames]
    gray = [cv2.GaussianBlur(grayscale(frame), (3, 3), 0) for frame in registered]
    baseline_count = min(18, len(gray))
    opening = np.stack(gray[:baseline_count])
    reference = np.median(opening, axis=0)
    noise = np.std(opening, axis=0)
    threshold = np.maximum(7.0, noise * 3.5)
    usable = (reference > 15) & (reference < 225) & (noise < 5)
    previous: BodyBox | None = None
    consecutive = 0
    tracks: list[BodyBox | None] = []
    for index, current in enumerate(gray):
        if index < baseline_count or np.count_nonzero(usable) < 32:
            tracks.append(None)
            continue
        bg, observed = reference[usable], current[usable]
        # Fit two robust percentiles, then refine the offset on inliers. Using
        # just a global median fails on nearly black walls and warm lamp pools.
        bg_low, bg_high = np.percentile(bg, [20, 80])
        cur_low, cur_high = np.percentile(observed, [20, 80])
        gain = float(np.clip((cur_high - cur_low) / max(bg_high - bg_low, 1), 0.5, 2.0)) if bg_high - bg_low > 8 else 1.0
        offset = float(np.median(observed - gain * bg))
        residual = (current - offset) / gain - reference
        mask = np.abs(residual) > threshold
        # Large scene-wide changes are lighting/reframing, not an upright body.
        if np.mean(mask) > 0.35:
            proposed = None
        else:
            proposed = upright_foreground_box(mask, previous)
        if proposed is None:
            previous, consecutive = None, 0
            tracks.append(None)
            continue
        if previous:
            x, y, bw, bh = proposed
            px, py, pw, ph = previous
            distance = np.hypot(x + bw / 2 - px - pw / 2, y + bh / 2 - py - ph / 2)
            nearby = distance < max(24, ph * 0.65) and 0.45 < bh / max(ph, 1) < 2.2
            consecutive = consecutive + 1 if nearby else 1
        else:
            consecutive = 1
        previous = proposed
        tracks.append(proposed if consecutive >= 2 else None)
    return tracks
