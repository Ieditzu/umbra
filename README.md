# Umbra

The local app now opens **[Parking camera](docs/parking-camera.md)**: a rear/parking-camera prototype for visible pedestrian/vehicle detection, lateral-approach warnings and experimental ground-shadow cues. Start `make research` and open `http://127.0.0.1:8002/`. It accepts browser/USB cameras, local video replay and private-LAN RTSP cameras without scene-training videos. The approximately 36 MB pretrained detector downloads on first start and then runs locally. Field accuracy and collision prevention are not established. [Project idea](docs/umbra-idea.en.md).

Umbra also includes a **public developer platform**: a Go API, customer dashboard, API keys, prepaid analysis credits, and optional Stripe Checkout. See [public platform setup and operations](docs/public-platform.md). The public service uses the Python engine as a private worker; the original local research workflow below remains available separately at `/research.html`.

```bash
cp .env.public.example .env.public
# Set random database and worker credentials, then:
docker compose --env-file .env.public up --build -d
```

Open `http://localhost:8000`. Stripe purchases stay disabled until all payment configuration is supplied. Verified accounts receive 10 starter credits.

For the original camera, scenes, trial labelling and saved research results, run **`make research`** and open **[Research studio](http://localhost:8002/research.html)**. It uses the existing research data directory from `.env` (normally `../umbra-data`). The local public site also links to it as **Research studio**. This runs alongside the public platform and requires no customer account or credits.

Umbra investigates whether **visible cast shadows** can provide reliable evidence of an occluded approach at a fixed camera. The proposed research will measure achieved warning time, false alarms, and performance across sunlight, streetlamps, and different recording locations.

The [research plan](docs/research-plan.md) defines the hypotheses, proposed recording experiments, independent labels, detector comparisons, and evaluation measures. These experiments are planned; research results have not yet been established.

The existing shadow-approach workflow compares an empty calibration to a trial clip, tracks darkening on the pavement, then timestamps when a walker enters the frame. Lead time is that gap. It reports no coverage or no reliable signal when the evidence is weak. The parking prototype adds a visible road-user baseline and experimental shadow cues; it does not provide vision through a completely closed opaque wall.

## What is included

- A FastAPI local experiment service with SQLite metadata and external video storage.
- A React dashboard for browser-camera recording, local video import, job progress, result review, and exports.
- Automatic corner/pavement ROI, with an optional reviewed phone-video shadow area when the automatic region is wrong.
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

Open `/research.html` at the URL printed by Vite (normally `http://127.0.0.1:5173/research.html`) and choose **Run synthetic demo**. The demo creates deterministic calibration, main-camera, ground-truth, labels, analysis, and export artifacts under `UMBRA_DATA_DIR`.

To include the compact temporal PyTorch model and synthetic pretraining route:

```bash
uv sync --extra dev --extra ml
```

The dashboard then enables **Pretrain temporal model**; the same route is available as `POST /api/v1/models/train` in the API docs at `http://127.0.0.1:8000/docs`. A synthetic checkpoint is advisory until validated on held-out field footage.

## Field workflow

1. Create a local scene and provide the recording time and location. Umbra displays the sun's elevation and bearing for the scene clock; freezing that clock lets you inspect a different time. Recorded analysis uses the scene's recording time. If the sun was below the horizon, select a stable streetlamp-lit pavement area in **Shadow area** on the trial; otherwise Umbra withholds a shadow warning. This does not map the light source into camera pixels.
2. Tape the main camera on a **wide route view**: the visible pavement, corner edge, shadow path, and enough of the opening to show the walker’s full body after entry. Record an empty calibration, then one continuous trial: walker starts hidden, shadow should appear first, then they step into view. Avoid a close facial shot; Umbra only uses anonymous foreground entry to timestamp the comparison.
3. Optional: a second camera on the hidden path with ArUco **10** (corner) and **11** (far). Clap for sync. This scores position; it is not the warning.
4. Import or record the clips, register a trial, run analysis.
5. If the automatic shadow area misses the pavement, open **Manual review → Phone shot**, pause on the empty pavement and click two corners around the place where the shadow will arrive. Mark the first visible body frame. Save, then rerun analysis. The first 1.8 seconds of the phone clip must still be empty; Umbra adapts its background to those frames. The **Drone shot** tab is for independent route labels.
6. Read lead time, shadow onset, line-of-sight onset, and the refusal reasons. Empty trials and no-coverage results count.

Analysis shows its current stage, completion percentage and elapsed time. Refreshing or reopening the research page resumes watching the saved job and opens the result when it is ready; the backend must keep running. Temporary connection failures are retried without starting another analysis. **Dismiss** stops watching, not the server job; its completed result remains in the trial's saved history.

See [the field protocol](docs/field-protocol.md). In daylight, the sun must throw the walker's shadow **onto the pavement the main camera sees**. At night, a streetlamp must light that pavement enough to cast a visible moving shadow. Film an empty calibration under the same lamp and keep the camera fixed. Mark the lit ground patch, not the lamp fixture.

For experimental live position estimates, save **Camera setup → Calibrate from walk** using a prior visible body/shadow walk, then start browser-camera detection or connect a LAN RTSP CCTV camera. The saved mapping is specific to that camera, light and route; it does not require future frames during live deployment. See [live camera calibration](docs/live-camera-calibration.md) for setup, refusal checks and validation limits.

## RoSEF paperwork and demonstration

The [competition dossier](docs/competition/README.md) includes an editable Romanian document, English abstract, printable working poster, contribution declaration prompts, and recorded synthetic results. Current-edition rules, participant details, signatures and field results are still required before submission.

For a single-server, offline demonstration, run `make build`, then `uv run umbra-api` and open `http://127.0.0.1:8000`. Dependencies must be installed beforehand. Saved analyses can be reopened from each scene. Download the evidence ZIP, extract it, and open `report.html` offline; its diagnostic image is embedded.

Reproduce the documented software checks with:

```bash
uv run python scripts/validate_synthetic.py --data-dir ../umbra-data/submission-fixtures --output docs/competition/software-results.json
```

The estimator is heuristic. Selecting a phone shadow area tunes the signal to that recording; it does not train a general neural model or establish performance on a new trial. Confidence scores are not calibrated probabilities. Position is an image-derived estimate. New recorded/live body-centre dots require a saved camera mapping from a prior visible calibration walk; the old fixed-depth shadow-ray marker is no longer used in new analyses. A replay of that calibration walk is not independent validation. Position estimates do not confirm a person, recover pose or physical lamp height, or override a refused night shadow warning. The optional neural checkpoint is advisory. No held-out field performance has been established.

## Data and privacy

For the local research service, `UMBRA_DATA_DIR` defaults to a sibling `umbra-data` folder, outside this repository. It holds recordings, local SQLite metadata, synthetic data, checkpoints, and reports. That local service uses no cloud API or accounts. The public platform uses verified accounts, private server storage and optional Stripe payments; see its [retention and operations guide](docs/public-platform.md). Neither interface performs biometric classification.

Use consented team participants or opaque targets only. Exported reports use trajectories and a corner/ROI diagnostic rather than direct-view ground-truth frames. Umbra is experimental research software, not a safety-critical, security, or surveillance system.

## Development

```bash
make test
make lint
make build
```

Frontend job-monitoring regression tests use Node 22.6 or newer: `npm --prefix frontend test`.

Related work: [Bouman et al., “Turning Corners into Cameras” (ICCV 2017)](https://openaccess.thecvf.com/content_iccv_2017/html/Bouman_Turning_Corners_Into_ICCV_2017_paper.html). Umbra does not implement that inverse problem. Synthetic results validate the software pipeline, not outdoor lead-time performance.
