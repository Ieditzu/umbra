# Parking warning method comparison

This tool addresses the research question in [the project idea](umbra-idea.en.md): can indirect shadow evidence give earlier useful warnings than a visible-object detector alone, without an unacceptable increase in false alerts? It replays labelled recordings through each method and compares them at matched false-alert rates. It measures recorded replays, not live or field performance.

## Methods

Every method receives the same frames, media timestamps and detector outputs, in order, with no future frames.

| Method | What warns |
| --- | --- |
| `visible` | Pretrained detector with the parking camera's image-space exit-path and lateral-approach tracking. |
| `ground_change` | Plain difference from a past-frame median ground view, without colour, texture, temporal, lighting or camera-motion checks. |
| `indirect` | The shadow channel alone, with its checks and refusal states (an ablation). |
| `combined` | `visible` or `indirect`, as in the parking camera. |

Each method has a small grid of operating points: a score threshold per channel (detector score, changed ground fraction or shadow texture correlation) and a persistence of 1, 2, 3 or 5 consecutive warning frames. Warnings less than 1 second apart are one episode.

## Recordings and labels

Record the trials described in the idea document: both sides, different speeds, stationary parked objects, empty trials, unrelated shadows and changing illumination. Keep recordings in `../umbra-data`, not in Git. Label each trial independently of the software's output, ideally by someone who does not see the warnings.

The easiest way to label is the **Label clips** page at `/label.html` (linked from the parking camera). Choose a batch of videos, pause at each moment and click **Shadow starts here**, **Visible here** and **Gone here**, or mark a clip **Nobody came**. Comma and period step one frame. No detection runs on that page. Labels stay in the browser until exported. **Export manifest** downloads `manifest.json`; save it in the same folder as the videos. **Load manifest** continues an earlier file.

The manifest can also be written by hand (paths are relative to the manifest):

```json
{
  "label_tolerance_s": 0.5,
  "trials": [
    {"id": "corner-l-01", "video": "corner-l-01.mp4", "split": "tune", "approach": true,
     "first_cue_s": 2.4, "first_visible_s": 3.9, "clear_s": 6.5, "zone": "left",
     "tags": ["left", "walk", "session-1"]},
    {"id": "empty-03", "video": "empty-03.mp4", "split": "test", "approach": false,
     "tags": ["light_change", "session-2"]}
  ]
}
```

- `approach`: whether a road user approaches the exit during the recording. One approach per clip.
- `first_cue_s`: media time of the first useful indirect cue, or `null` if none was observable.
- `first_visible_s`: first frame in which any part of the road user is directly visible.
- `clear_s`: when the road user no longer matters for the exit.
- `split`: `tune` trials choose operating points; `test` trials are reported with those points fixed. Put unfamiliar arrangements and later sessions in `test`.
- `zone`: the visible ground region (`ground`, `left` or `right`), as in the parking camera.
- `tags`: free text; results are also broken down per tag.

## Run

```bash
make evaluate MANIFEST=../umbra-data/trials/manifest.json OUTPUT=../umbra-data/results/comparison.json
```

or `uv run python scripts/evaluate_parking.py --manifest … --output …`. Options: `--max-fps` (default 10, like a live camera; 0 processes every frame) and `--targets` (false alerts per minute to match, default `0,0.5,1,2`). Detector results are cached per recording in a `detections/` folder beside the output. The cache is reused only while the video, model and frame rate match.

## Scoring

- **Approach window:** from `first_cue_s` (or `first_visible_s` when no cue was labelled) minus the label tolerance, to `clear_s`.
- **Warned:** a warning onset inside the window. An episode that started earlier and continues into the window is not credited.
- **Warning time:** `first_visible_s` minus that onset. Positive values mean the warning came before direct visibility.
- **False alert:** an onset outside every approach window, including any onset in an empty trial.
- **False alerts per minute:** false alerts divided by the recording time outside approach windows.
- **Unavailable fraction:** frames where none of the method's channels produced an estimate (learning a reference, camera moved, lighting changed, limited visibility).
- **Processing time:** detector plus tracker per frame on this computer, or the baseline alone for `ground_change`.

For each target rate, each method's operating point is chosen on the tuning trials: the most warned approaches within the target, then the longest median warning time. That point is applied unchanged to the test trials. The reported test false-alert rate can exceed the target; that is a result. Without test trials the tool reports on the tuning trials and flags `parameters_selected_on_reported_trials`. Do not present those numbers as a fair comparison.

## Limits

- Warning times are frame times. Subtract measured end-to-end latency before claiming a live benefit.
- Processing times from cached detections come from the run that filled the cache.
- A matching shadow cue is credited to the labelled approach; the reviewer must confirm that it came from that road user.
- Few trials give wide uncertainty. Report trial counts with every rate and do not call small-sample results accuracy.
- Results from a stopped camera do not transfer to a moving reversing vehicle. Evaluate camera movement separately.
