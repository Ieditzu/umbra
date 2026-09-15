# Umbra

Umbra is a local, confidence-aware research kit for testing whether subtle natural-light changes beside a building corner can support a coarse estimate of hidden motion.

It is not a camera that sees through walls. It reports anonymous movement only—track position range, direction, speed class, and confidence—and explicitly returns no coverage or no reliable signal when the evidence is weak.

## What is included

- A FastAPI local experiment service with SQLite metadata and external video storage.
- A React dashboard for browser-camera recording, local video import, job progress, result review, and exports.
- Automatic corner/ROI selection with refusal rather than manual ROI drawing.
- Empty-scene calibration, exposure normalization, temporal residual analysis, a 1D probability tracker, and confidence gating.
- Four comparison methods: frame difference, fixed temporal signal, geometry/sun rule, and Umbra's adaptive method.
- Controlled ground-truth support using ArUco IDs 10 and 11, plus synthetic data for an immediate end-to-end demo.
- HTML evidence reports, result JSON, and prediction CSV files kept locally.

## Quick start

Umbra uses an `uv`-managed Python 3.12 environment because scientific wheels may not support the host's newest Python yet.

```bash
cp .env.example .env
uv python install 3.12
uv sync --extra dev
npm --prefix frontend install
```

Start the API in one terminal and the dashboard in another:

```bash
uv run umbra-api
npm --prefix frontend run dev
```

Open the URL printed by Vite (normally `http://127.0.0.1:5173`) and choose **Run synthetic demo**. The demo creates deterministic calibration, main-camera, ground-truth, labels, analysis, and export artifacts under `UMBRA_DATA_DIR`.

To include the compact temporal PyTorch model and synthetic pretraining route:

```bash
uv sync --extra dev --extra ml
```

The dashboard then enables **Pretrain temporal model**; the same route is available as `POST /api/v1/models/train` in the API docs at `http://127.0.0.1:8000/docs`. A synthetic checkpoint is advisory until validated on held-out field footage.

## Field workflow

1. Create a local scene and provide approximate capture time and location. Browser location permission is optional; imported footage can use typed values.
2. Lock the main camera on the visible pavement or wall near the corner. Record an empty calibration clip first, then a trial clip where the target stays out of direct view.
3. Record the hidden track with a separate ground-truth camera. Put printed ArUco marker **10** at the corner-side endpoint and marker **11** at the far endpoint. Use a shared clap or audible cue when possible.
4. Import or record the main clips, import ground truth, register a trial, and run analysis.
5. Read the confidence reasons before interpreting the estimated trace. Low-confidence, no-signal, and no-coverage outputs are valid outcomes.

See [the field protocol](docs/field-protocol.md) for the controlled-study checklist.

## Data and privacy

`UMBRA_DATA_DIR` defaults to a sibling `umbra-data` folder, outside this repository. It holds recordings, local SQLite metadata, synthetic data, checkpoints, and reports. No cloud API, account, identity model, or biometric classifier is used.

Use consented team participants or opaque targets only. Exported reports use trajectories and a corner/ROI diagnostic rather than direct-view ground-truth frames. Umbra is experimental research software, not a safety-critical, security, or surveillance system.

## Development

```bash
make test
make lint
make build
```

The scientific framing is based on [Bouman et al., “Turning Corners into Cameras: Principles and Methods” (ICCV 2017)](https://openaccess.thecvf.com/content_iccv_2017/html/Bouman_Turning_Corners_Into_ICCV_2017_paper.html). Synthetic results validate only the software pipeline, not real-world non-line-of-sight performance.
