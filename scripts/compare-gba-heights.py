"""Compare GlobalBuildingAtlas (GBA) heights with OSM heights in the bundled city data.

Research-only; the app does not use GBA. GBA.LoD1 is CC BY-NC 4.0, so its per-building
values stay outside Git; this script writes only aggregate statistics and charts.

Run with:
    uv run --python 3.12 --with numpy==2.3.4 --with matplotlib==3.10.7 \
        python scripts/compare-gba-heights.py /path/e025_n45_e030_n40.json /path/output-dir

The GBA file is LoD1/europe/e025_n45_e030_n40.json from
https://huggingface.co/datasets/zhu-xlab/GBA.LoD1 (keys are source + OSM way id + ISO3).
"""

from __future__ import annotations

import base64
import csv
import gzip
import json
import re
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "mobile/assets/data/constanta-city.json"
GBA_KEY = re.compile(
    rb'"osm(\d+)ROU": \{"height": ([-0-9.eE]+|null), "var": ([-0-9.eE]+|null)\}'
)


def positive(value: str | None) -> float:
    """Same parsing as buildingHeight() in mobile/src/engine/data.ts."""
    if not value:
        return 0.0
    try:
        parsed = float(re.sub(r"\s*m$", "", value.strip()))
    except ValueError:
        return 0.0
    return parsed if np.isfinite(parsed) and parsed > 0 else 0.0


def height_source(tags: dict[str, str]) -> str:
    if (
        positive(tags.get("min_height"))
        or positive(tags.get("building:min_level"))
        or tags.get("building") == "roof"
    ):
        return "unsupported_elevated"
    if 0 < positive(tags.get("height")) <= 1000:
        return "osm_height_tag"
    if 0 < positive(tags.get("building:levels")) <= 150:
        return "estimated_from_levels"
    return "missing"


def ring_area(ring: list[dict]) -> float:
    x = np.array([p["x"] for p in ring])
    y = np.array([p["y"] for p in ring])
    return float(abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))) / 2)


def error_stats(error: np.ndarray) -> dict:
    if not len(error):
        return {"n": 0}
    return {
        "n": int(len(error)),
        "bias_m": round(float(error.mean()), 2),
        "mae_m": round(float(np.abs(error).mean()), 2),
        "rmse_m": round(float(np.sqrt((error**2).mean())), 2),
        "median_abs_m": round(float(np.median(np.abs(error))), 2),
        "within_3m_pct": round(float((np.abs(error) <= 3).mean() * 100), 1),
    }


def load_buildings() -> list[dict]:
    packed = json.loads(BUNDLE.read_text())
    raw = json.loads(gzip.decompress(base64.b64decode(packed["payload"])))
    rows = []
    for b in raw["buildings"]:
        kind, osm_id = b["id"].split("/")
        tags = b["tags"]
        rows.append(
            {
                "id": b["id"],
                "way_id": osm_id if kind == "way" else None,
                "source": height_source(tags),
                "tag_m": positive(tags.get("height")),
                "levels": positive(tags.get("building:levels")),
                "building": tags.get("building", ""),
                "area_m2": sum(ring_area(poly[0]) for poly in b["geometry"]),
            }
        )
    return rows


def load_gba(path: Path) -> dict[str, tuple[float, float]]:
    found = {}
    for m in GBA_KEY.finditer(path.read_bytes()):
        if m.group(2) != b"null":
            var = float(m.group(3)) if m.group(3) != b"null" else float("nan")
            found[m.group(1).decode()] = (float(m.group(2)), var)
    return found


def main(gba_path: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    rows = load_buildings()
    gba = load_gba(gba_path)
    for r in rows:
        # Relations are skipped: GBA keys carry no element type, so a relation id
        # could collide with an unrelated way of the same number.
        hit = gba.get(r["way_id"]) if r["way_id"] else None
        r["gba_m"], r["gba_var"] = hit if hit else (None, None)

    summary: dict = {
        "gba_file": gba_path.name,
        "romanian_osm_keys_in_gba_tile": len(gba),
        "bundle_buildings": len(rows),
        "coverage": {},
    }
    newest = max(int(r["way_id"]) for r in rows if r["gba_m"] is not None)
    unmatched = [int(r["way_id"]) for r in rows if r["way_id"] and r["gba_m"] is None]
    summary["unmatched_ways_newer_than_newest_matched_way"] = {
        "unmatched_ways": len(unmatched),
        "newer": sum(i > newest for i in unmatched),
        "newest_matched_way_id": newest,
    }
    for source in ["osm_height_tag", "estimated_from_levels", "missing", "unsupported_elevated", "all"]:
        group = [r for r in rows if source == "all" or r["source"] == source]
        matched = sum(r["gba_m"] is not None for r in group)
        summary["coverage"][source] = {
            "buildings": len(group),
            "with_gba_height": matched,
            "pct": round(100 * matched / max(len(group), 1), 1),
        }

    # 1. Buildings with an OSM height tag: the only direct height reference here.
    tagged = [r for r in rows if r["source"] == "osm_height_tag" and r["gba_m"] is not None]
    tag = np.array([r["tag_m"] for r in tagged])
    est = np.array([r["gba_m"] for r in tagged])
    err = est - tag
    summary["tagged"] = error_stats(err)
    summary["tagged"]["pearson_r"] = round(float(np.corrcoef(tag, est)[0, 1]), 3)
    summary["tagged"]["gba_equals_tag_within_10cm"] = int((np.abs(err) <= 0.1).sum())
    # OSM tags are volunteered, not audited: keep a subset whose height and floor
    # count agree (2.5-4.5 m per floor) so single bad tags cannot drive the result.
    lv_tag = np.array([r["levels"] for r in tagged])
    agree = (lv_tag > 0) & (tag >= 2.5 * lv_tag) & (tag <= 4.5 * lv_tag)
    summary["tagged_consistent_with_levels"] = error_stats(err[agree])
    summary["tagged_consistent_with_levels"]["tag_levels_pairs"] = int((lv_tag > 0).sum())
    summary["tagged_by_height"] = {}
    for lo, hi in [(0, 10), (10, 20), (20, 40), (40, 1000)]:
        sel = (tag >= lo) & (tag < hi)
        summary["tagged_by_height"][f"{lo}-{hi} m"] = error_stats(err[sel])
    var = np.array([r["gba_var"] for r in tagged])
    ok = np.isfinite(var) & (var > 0)
    summary["tagged_var_check"] = {
        "note": "GBA 'var' semantics unverified; both readings reported",
        "within_1.96_sqrt_var_pct": round(float((np.abs(err[ok]) <= 1.96 * np.sqrt(var[ok])).mean() * 100), 1),
        "within_1.96_var_pct": round(float((np.abs(err[ok]) <= 1.96 * var[ok]).mean() * 100), 1),
    }

    # 2. Floor counts: not a measured height. Compare implied metres per floor and
    # the engine's own bounds [2.5 L, 3.5 L + 3] instead of claiming an error.
    floors = [r for r in rows if r["source"] == "estimated_from_levels" and r["gba_m"] is not None]
    lv = np.array([r["levels"] for r in floors])
    gh = np.array([r["gba_m"] for r in floors])
    per_floor = gh / lv
    inside = (gh >= 2.5 * lv) & (gh <= 3.5 * lv + 3)
    summary["levels"] = {
        "n": int(len(floors)),
        "gba_m_per_floor_median": round(float(np.median(per_floor)), 2),
        "gba_m_per_floor_iqr": [round(float(q), 2) for q in np.percentile(per_floor, [25, 75])],
        "inside_engine_bounds_pct": round(float(inside.mean() * 100), 1),
        "below_bounds_pct": round(float((gh < 2.5 * lv).mean() * 100), 1),
        "above_bounds_pct": round(float((gh > 3.5 * lv + 3).mean() * 100), 1),
        "vs_3m_per_floor": error_stats(gh - 3.0 * lv),
    }
    summary["levels_by_count"] = {}
    for lo, hi in [(1, 3), (3, 5), (5, 9), (9, 13), (13, 200)]:
        sel = (lv >= lo) & (lv < hi)
        if sel.any():
            summary["levels_by_count"][f"{lo}-{hi - 1} floors"] = {
                "n": int(sel.sum()),
                "gba_m_per_floor_median": round(float(np.median(per_floor[sel])), 2),
                "inside_engine_bounds_pct": round(float(inside[sel].mean() * 100), 1),
                "vs_3m_per_floor": error_stats(gh[sel] - 3.0 * lv[sel]),
            }

    # 3. Missing-height buildings that GBA could fill.
    missing = [r for r in rows if r["source"] == "missing" and r["gba_m"] is not None]
    mh = np.array([r["gba_m"] for r in missing])
    summary["missing_filled_by_gba"] = {
        "n": int(len(mh)),
        "height_percentiles_m": {p: round(float(np.percentile(mh, p)), 1) for p in [10, 25, 50, 75, 90, 99]},
        "median_area_m2": round(float(np.median([r["area_m2"] for r in missing])), 1),
    }

    (out / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    plt.rcParams.update({"font.size": 10, "savefig.dpi": 200})

    # Black-and-white friendly figures for the printed paper.
    fig, ax = plt.subplots(figsize=(4.6, 4.2))
    top = 60.0
    shown = (tag <= top) & (est <= top)
    ax.scatter(tag[shown & ~agree], est[shown & ~agree], s=10, facecolors="none",
               edgecolors="black", linewidths=0.6, label="etichetă OSM")
    ax.scatter(tag[shown & agree], est[shown & agree], s=12, color="black",
               label="etichetă confirmată de nr. de etaje")
    ax.plot([0, top], [0, top], "k--", lw=0.8, label="egalitate (1:1)")
    ax.set_xlim(0, top), ax.set_ylim(0, top)
    if (~shown).any():
        ax.text(top * 0.98, 1, f"{int((~shown).sum())} punct(e) > {top:.0f} m nefigurat(e)",
                ha="right", va="bottom", fontsize=8)
    ax.set_xlabel("Înălțime etichetată în OSM (m)")
    ax.set_ylabel("Înălțime GlobalBuildingAtlas (m)")
    ax.legend(loc="upper left", frameon=False)
    fig.tight_layout(), fig.savefig(out / "gba-vs-osm-tag.png"), plt.close(fig)

    fig, ax = plt.subplots(figsize=(6.2, 3.8))
    counts = sorted({int(x) for x in lv if x == int(x) and x <= 16})
    data = [gh[lv == c] for c in counts]
    ax.boxplot(data, positions=counts, widths=0.6, showfliers=False,
               medianprops={"color": "black"})
    xs = np.array(counts)
    ax.plot(xs, 2.5 * xs, "k:", lw=1, label="limite motor: 2,5·N și 3,5·N + 3 m")
    ax.plot(xs, 3.5 * xs + 3, "k:", lw=1)
    ax.set_xlabel("Număr de etaje în OSM (building:levels)")
    ax.set_ylabel("Înălțime GBA (m)")
    ax.legend(loc="upper left", frameon=False)
    fig.tight_layout(), fig.savefig(out / "gba-vs-levels.png"), plt.close(fig)

    with (Path(sys.argv[2]) / "per-building.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader(), writer.writerows(rows)
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
