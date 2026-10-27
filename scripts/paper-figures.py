"""Black-and-white figures for the competition paper.

Run with:
    uv run --python 3.12 --with numpy==2.3.4 --with matplotlib==3.10.7 \
        python scripts/paper-figures.py docs/paper
"""

import math
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Arc, Polygon, Rectangle


def principle(out: Path) -> None:
    """Side view: a roof corner of height h casts a shadow tip at distance L."""
    e = math.radians(33)
    h, base = 3.0, 1.2
    length = h / math.tan(e)
    fig, ax = plt.subplots(figsize=(6.0, 2.5))
    ax.add_patch(Rectangle((0, 0), base, h, facecolor="white", edgecolor="black", hatch="///", lw=1))
    ax.add_patch(Polygon([(base, 0), (base + length, 0), (base, 0.02)], closed=True, facecolor="black"))
    ax.fill_between([base, base + length], -0.12, 0, color="0.25")
    ax.plot([-0.4, base + length + 1.6], [0, 0], "k", lw=1)
    # Sun ray grazing the roof corner and reaching the shadow tip.
    ax.plot([base - 1.3, base + length], [h + 1.3 * math.tan(e), 0], "k--", lw=1)
    ax.annotate("", xy=(base - 0.9, h + 0.9 * math.tan(e)), xytext=(base - 1.25, h + 1.25 * math.tan(e)),
                arrowprops={"arrowstyle": "->", "lw": 1})
    ax.text(base - 1.3, h + 1.3 * math.tan(e) + 0.15, "raza Soarelui", fontsize=9, ha="left")
    ax.add_patch(Arc((base + length, 0), 1.6, 1.6, theta1=180 - math.degrees(e), theta2=180, lw=1))
    ax.text(base + length - 1.15, 0.18, "e", fontsize=11, style="italic")
    ax.annotate("", xy=(-0.25, h), xytext=(-0.25, 0), arrowprops={"arrowstyle": "<->", "lw": 1})
    ax.text(-0.38, h / 2, "h", fontsize=11, style="italic", ha="right", va="center")
    ax.annotate("", xy=(base + length, -0.35), xytext=(base, -0.35), arrowprops={"arrowstyle": "<->", "lw": 1})
    ax.text(base + length / 2, -0.62, "L (umbra măsurată)", fontsize=9, ha="center", va="top")
    ax.text(base + length + 0.3, h * 0.72, "h = L · tan e", fontsize=12, ha="left")
    ax.text(base + length + 0.3, h * 0.72 - 0.55, "e calculat de aplicație\ndin dată, oră și poziție", fontsize=8.5, ha="left", va="top")
    ax.set_xlim(-0.9, base + length + 3.3), ax.set_ylim(-1.1, h + 1.3 * math.tan(e) + 0.5)
    ax.set_aspect("equal"), ax.axis("off")
    fig.tight_layout(pad=0.1)
    fig.savefig(out / "principiu.png", dpi=300)
    plt.close(fig)


if __name__ == "__main__":
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/paper")
    target.mkdir(parents=True, exist_ok=True)
    principle(target)
