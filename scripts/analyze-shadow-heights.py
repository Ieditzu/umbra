"""Analyse the shadow-height field study (docs/shadow-heights.md §7.4, phase 4).

Input: one or more study exports from the app (Setări → Exportă JSON), each holding
measurements and independent reference heights. Optionally a GBA LoD1 file for the
baseline (CC BY-NC 4.0: per-building values never leave this machine; only aggregates
and charts are written).

Run with:
    uv run --python 3.12 --with numpy==2.3.4 --with matplotlib==3.10.7 \\
        python scripts/analyze-shadow-heights.py OUT_DIR export1.json [export2.json ...] \\
        [--gba /path/e025_n45_e030_n40.json]

Self-test on synthetic data (checks the mechanics, not field accuracy):
    uv run --python 3.12 --with numpy==2.3.4 --with matplotlib==3.10.7 \\
        python scripts/analyze-shadow-heights.py --self-test

Errors are measured minus reference. Uncertainty intervals resample whole buildings,
because repeated measurements of one building are not independent.
"""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import math
import re
import sys
import tempfile
from collections import defaultdict
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
METHODS = ["tape_laser", "phone_gps", "drone_nadir"]
SUN_SIGMA_DEG = 0.065
BOOTSTRAP = 1000


def error_stats(error: np.ndarray) -> dict:
    """Same summary as scripts/compare-gba-heights.py."""
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


def load_exports(paths: list[Path]) -> tuple[list[dict], list[dict]]:
    measurements: dict[str, dict] = {}
    references: dict[str, dict] = {}
    for path in paths:
        data = json.loads(path.read_text("utf8"))
        if data.get("format") != "umbra-shadow-study-v1":
            raise SystemExit(f"{path}: not an Umbra study export")
        # Several phones may export the same shared measurement; ids deduplicate.
        for m in data["measurements"]:
            measurements[m["id"]] = m
        for r in data["references"]:
            references[r["id"]] = r
    return list(measurements.values()), list(references.values())


def reference_heights(references: list[dict]) -> dict[str, tuple[float, float]]:
    """Inverse-variance mean per building; σ=0 references are treated as 0.1 m."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in references:
        groups[r["osm_building"]].append(r)
    result = {}
    for building, refs in groups.items():
        w = np.array([1 / max(r["sigma_m"], 0.1) ** 2 for r in refs])
        h = np.array([r["height_m"] for r in refs])
        result[building] = (float((w * h).sum() / w.sum()), float(1 / math.sqrt(w.sum())))
    return result


def bootstrap_ci(rows: list[dict], metric, rng: np.random.Generator) -> list[float] | None:
    """95% interval of a metric when whole buildings are resampled."""
    by_building: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        by_building[row["building"]].append(row["error"])
    buildings = list(by_building)
    if len(buildings) < 3:
        return None
    values = []
    for _ in range(BOOTSTRAP):
        pick = rng.choice(len(buildings), len(buildings), replace=True)
        errors = np.concatenate([by_building[buildings[i]] for i in pick])
        values.append(metric(errors))
    return [round(float(np.percentile(values, 2.5)), 2), round(float(np.percentile(values, 97.5)), 2)]


def predicted_sigma(m: dict) -> float:
    """Recorded σ already includes instrument, penumbra and sun-angle terms (§3.2)."""
    return float(m["sigma_m"])


def city_tags() -> dict[str, dict]:
    if not BUNDLE.exists():
        return {}
    packed = json.loads(BUNDLE.read_text("utf8"))
    raw = json.loads(gzip.decompress(base64.b64decode(packed["payload"])))
    return {b["id"]: b["tags"] for b in raw["buildings"]}


def positive(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        parsed = float(re.sub(r"\s*m$", "", value.strip()))
    except ValueError:
        return 0.0
    return parsed if math.isfinite(parsed) and parsed > 0 else 0.0


def gba_heights(path: Path | None, wanted: set[str]) -> dict[str, float]:
    if not path:
        return {}
    ids = {b.split("/")[1]: b for b in wanted if b.startswith("way/")}
    result = {}
    for match in GBA_KEY.finditer(path.read_bytes()):
        way = match.group(1).decode()
        if way in ids and match.group(2) != b"null":
            result[ids[way]] = float(match.group(2))
    return result


def analyse(measurements: list[dict], references: list[dict], out: Path, gba: Path | None = None, seed: int = 7) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)
    refs = reference_heights(references)
    statuses = defaultdict(lambda: defaultdict(int))
    for m in measurements:
        statuses[m["method"]][m["status"]] += 1
    # Rejected attempts are counted but not scored: their inputs failed §6.3 step 1.
    rows = [
        {
            "id": m["id"],
            "building": m["osm_building"],
            "method": m["method"],
            "observer": m.get("observer", ""),
            "measured": m["height_m"],
            "reference": refs[m["osm_building"]][0],
            "error": m["height_m"] - refs[m["osm_building"]][0],
            "sigma": predicted_sigma(m),
            "elevation": m["sun_elevation_deg"],
            "at": m["measured_at"],
        }
        for m in measurements
        if m["status"] != "rejected" and m["osm_building"] in refs
    ]
    summary: dict = {
        "buildings_with_reference": len(refs),
        "measurements_total": len(measurements),
        "attempts_by_status": {k: dict(v) for k, v in statuses.items()},
        "methods": {},
        "note": "Field results; errors are measured minus independent reference height.",
    }
    for method in METHODS:
        mine = [r for r in rows if r["method"] == method]
        if not mine:
            continue
        error = np.array([r["error"] for r in mine])
        sigma = np.array([r["sigma"] for r in mine])
        z = error / sigma
        stats = error_stats(error)
        stats["buildings"] = len({r["building"] for r in mine})
        stats["mae_ci95_m"] = bootstrap_ci(mine, lambda e: np.abs(e).mean(), rng)
        stats["rmse_ci95_m"] = bootstrap_ci(mine, lambda e: np.sqrt((e**2).mean()), rng)
        # H2: is the recorded σ honest? About 95% of errors should fall within 2σ.
        stats["within_2sigma_pct"] = round(float((np.abs(z) <= 2).mean() * 100), 1)
        stats["error_vs_sigma_spearman"] = spearman(np.abs(error), sigma)
        summary["methods"][method] = stats
    summary["h1_tape_laser_within_one_floor_pct"] = summary["methods"].get("tape_laser", {}).get("within_3m_pct")
    summary["observer_agreement"] = observer_agreement(rows)
    summary["phone_gps_convergence"] = convergence(rows, rng)
    summary["baselines"] = baselines(rows, refs, gba)
    figures(rows, summary, out)
    (out / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    return summary


def spearman(a: np.ndarray, b: np.ndarray) -> float | None:
    if len(a) < 3:
        return None
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    c = np.corrcoef(ra, rb)[0, 1]
    return None if not math.isfinite(c) else round(float(c), 2)


def observer_agreement(rows: list[dict]) -> dict:
    """Mean of per-observer means compared within each building and method."""
    pairs = []
    groups: dict[tuple[str, str], dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for r in rows:
        if r["observer"]:
            groups[(r["building"], r["method"])][r["observer"]].append(r["measured"])
    for observers in groups.values():
        means = [np.mean(v) for v in observers.values()]
        for i in range(len(means)):
            for j in range(i + 1, len(means)):
                pairs.append(abs(means[i] - means[j]))
    if not pairs:
        return {"pairs": 0}
    pairs_arr = np.array(pairs)
    return {
        "pairs": len(pairs),
        "mean_abs_difference_m": round(float(pairs_arr.mean()), 2),
        "median_abs_difference_m": round(float(np.median(pairs_arr)), 2),
    }


def convergence(rows: list[dict], rng: np.random.Generator) -> list[dict]:
    """H4: error of the mean of n phone readings, over random orderings per building."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if r["method"] == "phone_gps":
            groups[r["building"]].append(r)
    result = []
    for n in range(1, 11):
        errors = []
        for readings in groups.values():
            if len(readings) < n:
                continue
            for _ in range(50):
                pick = rng.choice(len(readings), n, replace=False)
                errors.append(np.mean([readings[i]["measured"] for i in pick]) - readings[0]["reference"])
        if errors:
            e = np.array(errors)
            result.append({"n": n, "buildings": sum(len(v) >= n for v in groups.values()), "mae_m": round(float(np.abs(e).mean()), 2)})
    return result


def baselines(rows: list[dict], refs: dict[str, tuple[float, float]], gba: Path | None) -> dict:
    """H3: other height sources evaluated on exactly the measured buildings."""
    buildings = {r["building"] for r in rows}
    tags = city_tags()
    out = {}
    floor = []
    osm = []
    for b in buildings:
        t = tags.get(b, {})
        levels = positive(t.get("building:levels"))
        if levels:
            # Midpoint of the engine's 2.5–3.5 m per floor + up to 3 m roof range.
            floor.append(levels * 3.0 + 1.5 - refs[b][0])
        if positive(t.get("height")):
            osm.append(positive(t.get("height")) - refs[b][0])
    out["floor_count_midpoint"] = error_stats(np.array(floor))
    out["osm_height_tag"] = error_stats(np.array(osm))
    g = gba_heights(gba, buildings)
    out["gba"] = error_stats(np.array([g[b] - refs[b][0] for b in g])) if gba else {"n": 0, "note": "no GBA file given"}
    return out


def figures(rows: list[dict], summary: dict, out: Path) -> None:
    if not rows:
        return
    colours = {"tape_laser": "#1f6f43", "phone_gps": "#c2410c", "drone_nadir": "#2f62c9"}
    # Poster graphic (§8): measured against reference for each method.
    fig, ax = plt.subplots(figsize=(6, 6))
    top = max(max(r["reference"] for r in rows), max(r["measured"] for r in rows)) * 1.1
    ax.plot([0, top], [0, top], color="#888", lw=1)
    ax.fill_between([0, top], [-3, top - 3], [3, top + 3], color="#ddd", alpha=0.5, label="±3 m (one floor)")
    for method in METHODS:
        mine = [r for r in rows if r["method"] == method]
        if mine:
            ax.errorbar(
                [r["reference"] for r in mine], [r["measured"] for r in mine],
                yerr=[r["sigma"] for r in mine], fmt="o", ms=4, alpha=0.8,
                color=colours[method], label=f"{method} (n={len(mine)})",
            )
    ax.set(xlim=(0, top), ylim=(0, top), xlabel="Reference height (m)", ylabel="Shadow-measured height (m)")
    ax.legend(loc="upper left", fontsize=8)
    fig.tight_layout()
    fig.savefig(out / "measured-vs-reference.png", dpi=180)
    plt.close(fig)
    # Bland–Altman per method.
    fig, ax = plt.subplots(figsize=(7, 4))
    for method in METHODS:
        mine = [r for r in rows if r["method"] == method]
        if mine:
            mean = [(r["measured"] + r["reference"]) / 2 for r in mine]
            ax.scatter(mean, [r["error"] for r in mine], s=14, color=colours[method], label=method)
            e = np.array([r["error"] for r in mine])
            if len(e) > 1:
                for y in (e.mean(), e.mean() + 1.96 * e.std(ddof=1), e.mean() - 1.96 * e.std(ddof=1)):
                    ax.axhline(y, color=colours[method], lw=0.8, ls="--")
    ax.axhline(0, color="#555", lw=0.8)
    ax.set(xlabel="Mean of method and reference (m)", ylabel="Method − reference (m)", title="Bland–Altman")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(out / "bland-altman.png", dpi=180)
    plt.close(fig)
    # H2: observed error against sun elevation, with each reading's predicted ±2σ.
    fig, ax = plt.subplots(figsize=(7, 4))
    for method in METHODS:
        mine = sorted((r for r in rows if r["method"] == method), key=lambda r: r["elevation"])
        if mine:
            ax.scatter([r["elevation"] for r in mine], [r["error"] for r in mine], s=14, color=colours[method], label=method)
            ax.plot([r["elevation"] for r in mine], [2 * r["sigma"] for r in mine], color=colours[method], lw=0.8, alpha=0.6)
            ax.plot([r["elevation"] for r in mine], [-2 * r["sigma"] for r in mine], color=colours[method], lw=0.8, alpha=0.6)
    ax.axhline(0, color="#555", lw=0.8)
    ax.set(xlabel="Sun elevation (°)", ylabel="Error (m)", title="Error against sun elevation (lines: predicted ±2σ)")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(out / "error-vs-elevation.png", dpi=180)
    plt.close(fig)
    conv = summary["phone_gps_convergence"]
    if conv:
        fig, ax = plt.subplots(figsize=(5, 3.5))
        ax.plot([c["n"] for c in conv], [c["mae_m"] for c in conv], "o-", color=colours["phone_gps"], label="observed")
        first = conv[0]["mae_m"]
        ax.plot([c["n"] for c in conv], [first / math.sqrt(c["n"]) for c in conv], "--", color="#888", label="1/√n")
        ax.set(xlabel="Phone readings averaged", ylabel="MAE (m)", title="H4: convergence")
        ax.legend(fontsize=8)
        fig.tight_layout()
        fig.savefig(out / "gps-convergence.png", dpi=180)
        plt.close(fig)


def self_test() -> None:
    """Synthetic study with known error sizes; verifies statistics and outputs."""
    rng = np.random.default_rng(1)
    measurements, references = [], []
    for b in range(20):
        building = f"way/{9000 + b}"
        height = float(rng.uniform(6, 40))
        references.append({"id": f"ref-{b:05d}", "osm_building": building, "method": "laser_indirect",
                           "height_m": height, "sigma_m": 0.3, "measured_at": "2026-10-27T10:00:00Z", "note": "", "observer": "T"})
        for k, (method, sigma) in enumerate([("tape_laser", 0.4), ("phone_gps", 4.0)] + [("phone_gps", 4.0)] * 3):
            observer = "AA" if k % 2 else "BB"
            measurements.append({
                "id": f"m-{b:03d}-{k:02d}", "osm_building": building, "method": method, "observer": observer,
                "height_m": height + float(rng.normal(0, sigma)), "sigma_m": sigma,
                "sun_elevation_deg": float(rng.uniform(15, 50)), "measured_at": f"2026-10-27T{8 + k:02d}:00:00Z",
                "status": "accepted", "reason": "",
            })
        measurements.append({**measurements[-1], "id": f"r-{b:03d}", "status": "rejected", "reason": "low_sun", "height_m": 999.0})
    with tempfile.TemporaryDirectory() as tmp:
        export = Path(tmp) / "export.json"
        export.write_text(json.dumps({"format": "umbra-shadow-study-v1", "measurements": measurements, "references": references}))
        m, r = load_exports([export, export])
        assert len(m) == len(measurements), "duplicate exports are merged by id"
        s = analyse(m, r, Path(tmp) / "out")
        laser, gps = s["methods"]["tape_laser"], s["methods"]["phone_gps"]
        assert laser["n"] == 20 and gps["n"] == 80
        assert laser["mae_m"] < 0.6 < gps["mae_m"], (laser, gps)
        assert laser["within_3m_pct"] == 100.0
        assert 85 <= gps["within_2sigma_pct"] <= 100, gps
        assert laser["mae_ci95_m"][0] <= laser["mae_m"] <= laser["mae_ci95_m"][1]
        assert s["attempts_by_status"]["phone_gps"]["rejected"] == 20, "rejected attempts are counted"
        conv = s["phone_gps_convergence"]
        assert conv[0]["n"] == 1 and conv[-1]["n"] == 4 and conv[-1]["mae_m"] < conv[0]["mae_m"]
        assert s["observer_agreement"]["pairs"] > 0
        for name in ["summary.json", "measured-vs-reference.png", "bland-altman.png", "error-vs-elevation.png", "gps-convergence.png"]:
            assert (Path(tmp) / "out" / name).exists(), name
    print("self-test passed")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("out", nargs="?", type=Path)
    parser.add_argument("exports", nargs="*", type=Path)
    parser.add_argument("--gba", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.out or not args.exports:
        parser.error("give an output directory and at least one export")
    measurements, references = load_exports(args.exports)
    if not references:
        sys.exit("No reference heights in the exports: add them in the app (Adaugă înălțime de referință).")
    summary = analyse(measurements, references, args.out, args.gba)
    print(json.dumps(summary["methods"], indent=2))


if __name__ == "__main__":
    main()
