# Umbra

Umbra is a local research kit for testing whether a **visible cast shadow** at a blind corner can warn that someone is approaching **before they walk into the camera**.

It is not a camera that sees through walls. It is not Bouman-style penumbra reconstruction. It compares an empty calibration to a trial clip, tracks darkening on the pavement, then timestamps when a walker enters the frame. Lead time is that gap. It reports no coverage or no reliable signal when the evidence is weak.

## What is included

- A FastAPI local experiment service with SQLite metadata and external video storage.
- A React dashboard for browser-camera recording, local video import, job progress, result review, and exports.
- Automatic corner/pavement ROI with refusal rather than manual drawing.
- Empty-scene calibration, pavement-shadow residual tracking, a line-of-sight band for when the walker enters, a 1D shadow tracker, lead-time measurement, and confidence gating.
- Four heuristic signal summaries: frame difference, fixed signal threshold, coverage/coherence rule, and Umbra's adaptive method. These are not four trained-model evaluations.
- Optional ArUco 10/11 ground-truth camera for hidden-path labels, plus synthetic shadow-then-entry demos.
- Saved analysis history, self-contained HTML evidence reports, result JSON, prediction CSV, and downloadable evidence ZIP files kept locally.

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

1. Create a local scene and provide approximate capture time and location.
2. Tape the main camera on the **visible pavement + corner edge**, with enough of the opening that a walker can later enter the frame. Record an empty calibration, then one continuous trial: walker starts hidden, shadow should appear first, then they step into view.
3. Optional: a second camera on the hidden path with ArUco **10** (corner) and **11** (far). Clap for sync. This scores position; it is not the warning.
4. Import or record the clips, register a trial, run analysis.
5. Read lead time, shadow onset, line-of-sight onset, and the refusal reasons. Empty trials and no-coverage results count.

See [the field protocol](docs/field-protocol.md). The sun must throw the walker's shadow **onto the pavement the main camera sees**.

## RoSEF paperwork and demonstration

The [competition dossier](docs/competition/README.md) includes an editable Romanian document, English abstract, printable working poster, contribution declaration prompts, and recorded synthetic results. Current-edition rules, participant details, signatures and field results are still required before submission.

For a single-server, offline demonstration, run `make build`, then `uv run umbra-api` and open `http://127.0.0.1:8000`. Dependencies must be installed beforehand. Saved analyses can be reopened from each scene. Download the evidence ZIP, extract it, and open `report.html` offline; its diagnostic image is embedded.

Reproduce the documented software checks with:

```bash
uv run python scripts/validate_synthetic.py --data-dir ../umbra-data/submission-fixtures --output docs/competition/software-results.json
```

The estimator is heuristic. Confidence scores are not calibrated probabilities. Position is an image-derived proxy. Solar data is metadata only. Lead time is measured on the same main camera (pavement-shadow onset vs first in-frame body). The optional neural checkpoint is advisory. No held-out field performance has been established.

## Data and privacy

`UMBRA_DATA_DIR` defaults to a sibling `umbra-data` folder, outside this repository. It holds recordings, local SQLite metadata, synthetic data, checkpoints, and reports. No cloud API, account, identity model, or biometric classifier is used.

Use consented team participants or opaque targets only. Exported reports use trajectories and a corner/ROI diagnostic rather than direct-view ground-truth frames. Umbra is experimental research software, not a safety-critical, security, or surveillance system.

## Development

```bash
make test
make lint
make build
```

Related work: [Bouman et al., “Turning Corners into Cameras” (ICCV 2017)](https://openaccess.thecvf.com/content_iccv_2017/html/Bouman_Turning_Corners_Into_ICCV_2017_paper.html). Umbra does not implement that inverse problem. Synthetic results validate the software pipeline, not outdoor lead-time performance.
