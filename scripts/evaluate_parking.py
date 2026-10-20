"""Compare parking warning methods on labelled recordings (recorded replay, not field validation)."""

import argparse
import json
import platform
from datetime import UTC, datetime
from pathlib import Path

import cv2
import numpy as np

from umbra import __version__
from umbra.config import get_settings
from umbra.parking_detector import MODEL_SHA256, RoadUserDetector, install_model
from umbra.parking_eval import DEFAULT_TARGETS, METHODS, evaluate_manifest


def _cell(value):
    return "-" if value is None else str(value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True, help="JSON trial manifest")
    parser.add_argument("--output", type=Path, required=True, help="JSON results file")
    parser.add_argument("--cache-dir", type=Path, help="detector cache (default: next to the output)")
    parser.add_argument("--max-fps", type=float, default=10, help="processed frame rate, 0 for every frame")
    parser.add_argument("--targets", default=",".join(str(value) for value in DEFAULT_TARGETS),
                        help="comma-separated false alerts per minute to match")
    args = parser.parse_args()
    targets = [float(value) for value in args.targets.split(",") if value.strip()]
    detector = RoadUserDetector(install_model(get_settings().model_dir / "parking"))
    cache_dir = args.cache_dir or args.output.parent / "detections"
    payload = {
        "generated_at": datetime.now(UTC).isoformat(), "software_version": __version__,
        "python": platform.python_version(), "opencv": cv2.__version__, "numpy": np.__version__,
        **evaluate_manifest(args.manifest, detector.detect, f"yolox:{MODEL_SHA256}", cache_dir,
                            args.max_fps or None, targets),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    split = payload["reported_split"]
    print(f"Reported on {payload['reported_trials']} {split} trials"
          + (" (parameters selected on the same trials)" if payload["parameters_selected_on_reported_trials"] else ""))
    print(f"{'target/min':>10} {'method':<14} {'warned':>7} {'early':>6} {'median s':>9} {'FA/min':>7} {'unavail':>8}")
    for row in payload["matched"]:
        for method in METHODS:
            result = row["methods"][method]
            if not result["available"]:
                print(f"{row['target_false_alerts_per_min']:>10} {method:<14} no tuning point meets this rate")
                continue
            print(f"{row['target_false_alerts_per_min']:>10} {method:<14} "
                  f"{result['warned']:>3}/{result['approaches']:<3} {result['warned_before_visible']:>6} "
                  f"{_cell(result['median_warning_time_s']):>9} {_cell(result['false_alerts_per_min']):>7} "
                  f"{_cell(result['unavailable_fraction']):>8}")
    print(f"Full results: {args.output}")


if __name__ == "__main__":
    main()
