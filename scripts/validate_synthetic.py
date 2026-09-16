"""Record three reproducible software demonstrations, never field validation."""

import argparse
import json
import platform
from datetime import UTC, datetime
from pathlib import Path

import cv2
import numpy as np

from umbra import __version__
from umbra.pipeline import analyse_trial
from umbra.synthetic import generate_synthetic_bundle


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    cases = []
    for name, present, light in (("directional_target", True, "directional"),
                                  ("directional_empty", False, "directional"),
                                  ("flat_target", True, "flat")):
        bundle = generate_synthetic_bundle(args.data_dir / name, seed=7, frames=120,
                                            target_present=present, lighting=light)
        result = analyse_trial(calibration_path=bundle.calibration_path, main_path=bundle.main_path,
                               ground_truth_path=bundle.ground_truth_path, scene={}, track_length_m=None)
        cases.append({"case": name, "seed": 7, "frames": 120, "fps": 10,
                      "target_present": present, "lighting": light, "state": result["state"],
                      "confidence": result["confidence"], "metrics": result["metrics"]})
    payload = {"evidence_kind": "synthetic_software_demonstration", "field_validated": False,
               "generated_at": datetime.now(UTC).isoformat(),
               "software_version": __version__, "python": platform.python_version(),
               "opencv": cv2.__version__, "numpy": np.__version__, "cases": cases,
               "interpretation": "Three deterministic fixtures exercise behavior, not generalization. "
               "Per-frame threshold metrics are correlated; they are not independent field trials. "
               "No metric distance, lead-time or comparative superiority claim is supported."}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
