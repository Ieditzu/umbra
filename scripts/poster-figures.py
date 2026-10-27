"""Colour figures and QR code for the competition poster.

Run with:
    uv run --python 3.12 --with numpy==2.3.4 --with matplotlib==3.10.7 --with qrcode==8.2 \
        python scripts/poster-figures.py ~/.cache/umbra-research/gba-out/per-building.csv docs/poster
"""

import csv
import json
import math
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import qrcode
from matplotlib.patches import Arc, Circle, Polygon, Rectangle

ROOT = Path(__file__).resolve().parent.parent
NAVY, SUN, SHADE, INK, MUTED = "#0F5257", "#FF6F59", "#3D4B5C", "#1B1B1B", "#8A96A3"  # teal, coral
plt.rcParams.update({"font.size": 16, "font.family": "Inter", "svg.fonttype": "none", "axes.edgecolor": MUTED, "axes.labelcolor": INK,
                     "xtick.color": INK, "ytick.color": INK, "axes.spines.top": False,
                     "axes.spines.right": False, "savefig.dpi": 300})


def principle(out: Path) -> None:
    e = math.radians(33)
    h, base = 3.0, 1.2
    length = h / math.tan(e)
    fig, ax = plt.subplots(figsize=(10, 4.6))
    ax.add_patch(Polygon([(base, 0), (base + length, 0), (base, h * 0.0)], closed=True, color=SHADE))
    ax.fill_between([base, base + length], -0.16, 0, color=SHADE)
    ax.add_patch(Rectangle((0, 0), base, h, color=NAVY))
    for row in range(5):
        for col in range(2):
            ax.add_patch(Rectangle((0.2 + col * 0.5, 0.35 + row * 0.55), 0.3, 0.3, color="#9CC9C4"))
    ax.plot([-0.6, base + length + 2.0], [0, 0], color=MUTED, lw=2)
    sx, sy = base - 1.75, h + 1.75 * math.tan(e)
    ax.add_patch(Circle((sx - 0.25, sy + 0.17), 0.32, color=SUN))
    ax.plot([sx, base + length], [sy, 0], color=SUN, lw=3, ls="--")
    ax.add_patch(Arc((base + length, 0), 1.8, 1.8, theta1=180 - math.degrees(e), theta2=180, color=INK, lw=2))
    ax.text(base + length - 1.3, 0.2, "e", fontsize=24, style="italic", color=INK)
    ax.annotate("", xy=(-0.3, h), xytext=(-0.3, 0), arrowprops={"arrowstyle": "<->", "lw": 2, "color": INK})
    ax.text(-0.45, h / 2, "h", fontsize=26, style="italic", ha="right", va="center", color=INK)
    ax.annotate("", xy=(base + length, -0.45), xytext=(base, -0.45), arrowprops={"arrowstyle": "<->", "lw": 2, "color": INK})
    ax.text(base + length / 2, -0.7, "L = lungimea umbrei (măsurată)", fontsize=17, ha="center", va="top", color=INK)
    ax.text(base + length + 0.4, h * 0.8, "h = L · tan e", fontsize=30, fontweight="bold", color=NAVY)
    ax.text(base + length + 0.4, h * 0.8 - 0.45, "e = unghiul Soarelui,\ncalculat de aplicație", fontsize=16, va="top", color=INK)
    ax.set_xlim(-1.2, base + length + 4.0), ax.set_ylim(-1.3, sy + 0.7)
    ax.set_aspect("equal"), ax.axis("off")
    fig.tight_layout(pad=0.1)
    for ext in ("png", "svg"):
        fig.savefig(out / f"metoda.{ext}", transparent=True)
    plt.close(fig)


def gba_levels(per_building: Path, out: Path) -> None:
    with per_building.open() as f:
        rows = [r for r in csv.DictReader(f) if r["source"] == "estimated_from_levels" and r["gba_m"]]
    lv = np.array([float(r["levels"]) for r in rows])
    gh = np.array([float(r["gba_m"]) for r in rows])
    counts = list(range(1, 13))
    plt.rcParams["font.size"] = 21
    fig, ax = plt.subplots(figsize=(10, 6.4))
    xs = np.array([0.5, 12.5])
    ax.fill_between(xs, 2.5 * xs, 3.5 * xs + 3, color=SUN, alpha=0.25, lw=0, label="înălțime plauzibilă pentru nr. de etaje (2,5–3,5 m/etaj)")
    box = ax.boxplot([gh[lv == c] for c in counts], positions=counts, widths=0.6, showfliers=False,
                     patch_artist=True, medianprops={"color": SUN, "lw": 3})
    for patch in box["boxes"]:
        patch.set(facecolor=NAVY, edgecolor=NAVY)
    for part in ["whiskers", "caps"]:
        for line in box[part]:
            line.set(color=NAVY, lw=1.5)
    ax.set_xlim(0.5, 12.5), ax.set_ylim(0, 48)
    ax.set_xlabel("Număr de etaje (OpenStreetMap)"), ax.set_ylabel("Înălțime GlobalBuildingAtlas (m)")
    ax.legend(loc="upper left", frameon=False)
    fig.tight_layout()
    for ext in ("png", "svg"):
        fig.savefig(out / f"gba-etaje.{ext}", transparent=True)
    plt.close(fig)
    plt.rcParams["font.size"] = 16


def measurability(out: Path) -> None:
    data = json.loads((ROOT / "docs/paper/measurability.json").read_text())["instants"]
    labels = list(data)
    allp = [data[k]["measurable_pct"] for k in labels]
    tall = [data[k]["by_height_pct"]["≥ 20 m"] for k in labels]
    gps = [5 * math.tan(math.radians(data[k]["elevation_deg"])) for k in labels]
    laser = [0.3 * math.tan(math.radians(data[k]["elevation_deg"])) for k in labels]
    x = np.arange(len(labels))
    fig, (a, b) = plt.subplots(1, 2, figsize=(16, 6))
    a.bar(x - 0.2, allp, 0.4, color=NAVY, label="toate clădirile")
    a.bar(x + 0.2, tall, 0.4, color=SUN, label="clădiri ≥ 20 m")
    a.set_ylim(0, 118), a.set_ylabel("Clădiri măsurabile (%)"), a.set_xticks(x, labels, rotation=30, ha="right")
    a.legend(loc="upper center", ncol=2, frameon=False), a.set_title("Vârf de umbră liber de alte clădiri", color=INK)
    b.bar(x - 0.2, gps, 0.4, color=MUTED, label="GPS telefon (±5 m)")
    b.bar(x + 0.2, laser, 0.4, color=NAVY, label="telemetru (±0,3 m)")
    b.axhline(3, color=SUN, lw=2.5, ls="--"), b.text(-0.45, 3.4, "1 etaj ≈ 3 m", color=SUN, ha="left", fontsize=15)
    b.set_ylabel("Eroarea înălțimii (± m)"), b.set_xticks(x, labels, rotation=30, ha="right")
    b.legend(loc="upper left", frameon=False), b.set_title("Eroarea prevăzută a înălțimii", color=INK)
    fig.tight_layout()
    for ext in ("png", "svg"):
        fig.savefig(out / f"rezultate.{ext}", transparent=True)
    plt.close(fig)


def measurable_poster(out: Path) -> None:
    """Single large panel for the printed poster: share of buildings with a free shadow tip."""
    data = json.loads((ROOT / "docs/paper/measurability.json").read_text())["instants"]
    labels = list(data)
    x = np.arange(len(labels))
    with plt.rc_context({"font.size": 24}):
        fig, ax = plt.subplots(figsize=(11, 6.2))
        ax.bar(x - 0.2, [data[k]["measurable_pct"] for k in labels], 0.4, color=NAVY, label="toate clădirile")
        ax.bar(x + 0.2, [data[k]["by_height_pct"]["≥ 20 m"] for k in labels], 0.4, color=SUN, label="clădiri ≥ 20 m")
        ax.set_ylim(0, 115), ax.set_yticks([0, 25, 50, 75, 100]), ax.set_ylabel("măsurabile (%)")
        ax.set_xticks(x, ["\n".join(k.rsplit(" ", 1)) for k in labels])
        ax.legend(loc="upper center", ncol=2, frameon=False)
        fig.tight_layout()
        fig.savefig(out / "masurabile.svg", transparent=True)
        plt.close(fig)


def qr(out: Path) -> None:
    img = qrcode.make("https://github.com/Ieditzu/umbra", box_size=20, border=2)
    img.save(out / "qr-github.png")


if __name__ == "__main__":
    target = Path(sys.argv[2]); target.mkdir(parents=True, exist_ok=True)
    principle(target), gba_levels(Path(sys.argv[1]), target), measurability(target), measurable_poster(target), qr(target)
