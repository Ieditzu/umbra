# Hidden image lab

This is the first implemented experiment for [Umbra's blind-spot research direction](umbra-idea.en.md). It measures an empirical grayscale light-transport model and reconstructs a 2 × 2, 3 × 3 or 4 × 4 hidden image. It does not yet detect pedestrians or approaching traffic.

## Open the lab

Run `make research` and open `http://127.0.0.1:8002/periscope.html`. The existing Research studio has a **Hidden image lab** link. For development, run the Python API and Vite as described in README, then open `http://127.0.0.1:5173/periscope.html`.

## Physical arrangement

Use an existing display, a fixed camera, a matte white receiving board and cardboard. A dim room is a sensible starting point.

1. The hidden display must illuminate the white board.
2. An opaque edge must partially interrupt those light paths, so different display cells affect different parts of the board. A uniform glow alone usually does not contain enough spatial information.
3. The camera must see the board but have no direct view of the display. A separate cardboard baffle can block the camera-to-display sightline while preserving the useful display-to-board light paths.
4. Fix all components. Keep screen brightness constant. Turn off adaptive brightness, screen dimming and night-colour adjustments. Lock camera exposure, white balance and focus in the capture app where available.

The app's hidden-display window is the actual light source. Move it onto the display behind the baffle, make it fullscreen by double-clicking and keep it visible. Avoid changes in other illuminated screens during capture.

A browser camera can capture directly from localhost or HTTPS. Alternatively, take photographs with a phone's camera app and import them on the computer. Use the same camera, orientation, image dimensions and settings throughout. Uploaded photos are converted to bounded JPEGs in the browser before reaching the API.

## Calibration

1. Create an experiment. Start with **2 × 2** if the geometry is untested; **4 × 4** supports a coarse letter L but needs more distinguishable measurements.
2. Open **Open hidden display** and click **Show this calibration pattern**.
3. Capture the black reference. Select the white receiving area on the photograph by clicking its two corners, then save the area. Exclude other screens, lamps and any direct target image.
4. Capture the all-white reference, then each individual white cell against a black screen. Labels specify row and column. Importing/capturing advances the displayed calibration pattern; wait for the new pattern and camera exposure to settle before the next photograph.
5. Capture the final repeated black reference. This checks background drift during the sequence.
6. Click **Fit measured light response**.

There are `grid_side² + 3` captures: 7 for 2 × 2, 12 for 3 × 3, and 19 for 4 × 4. A failed check explains whether the signal is weak, the background changed, the response is inconsistent, highlights clipped, or cells cannot be distinguished. Try a smaller grid or change the geometry, then recapture. A saved calibration is invalidated when a capture or the receiving area changes.

The browser-camera capture button waits for the hidden display to acknowledge the current pattern, plus a minimum settling delay. Imported photographs rely on the operator matching each photograph to the correct label.

## Reconstruct an unfamiliar target

After a successful fit, open **Reconstruct image**. Draw a pattern, choose **Letter L**, or select a random pattern, then click **Show target on hidden display**. Photograph only the receiving surface and import/capture that photograph.

The solver receives the measured photograph and saved calibration. It does not receive the selected target. Its output is a fixed-scale grayscale grid. There is no letter classifier, generated image prior, or automatic contrast enhancement.

No useful change produces **No useful signal**. Measurements that disagree strongly with the calibrated model produce **Measurement mismatch**. Neither result is replaced by a guessed image. A truly black hidden target is indistinguishable from no measured change in this baseline.

## Model and limits

The approximate model is `measurement = background + A × hidden_image + noise`. Each column of A comes from the measured response to one white display cell. JPEG pixels are approximately linearized using the sRGB transfer curve; this is not radiometric RAW-camera calibration. The basis responses and white reference are fitted jointly to reduce accumulated background/quantization bias.

The inverse uses nonnegative, bounded ridge regression with pixel values in `[0, 1]`. Singular values check whether the measured cells are distinguishable. Repeated black captures estimate drift; the white reference checks additivity. Numerical thresholds are experimental defaults, not validated operating limits.

A small fit residual only shows consistency with the model. It does not prove that the recovered hidden image is correct. A directly visible target could also produce a strong but invalid experiment; keeping it optically hidden is the operator's responsibility. Exposure changes, camera movement, reflections, JPEG processing and changing room light can invalidate the model, including cases not caught by the checks.

This is an independently implemented empirical baseline inspired by computational imaging, not a reproduction of the Nature 2019 reconstruction algorithm. Adaptive measurement selection, colour reconstruction, physical-object reconstruction and traffic warning are future experiments.

## Evidence and storage

Each experiment persists under `UMBRA_DATA_DIR/periscope/<experiment-id>/`, outside Git. Immutable captures and model versions allow old results to retain their original calibration after recalibration.

- **Download image:** fixed-scale reconstructed PNG, available only for an accepted estimate.
- **Download evidence:** result JSON with values, consistency checks, algorithm version and calibration snapshot.
- **Download measured model:** NumPy NPZ with A, background, weights and regularization.
- **Download experiment:** ZIP containing the manifest, referenced calibration captures, models, test measurements and results. The display-control target is excluded from this inference evidence bundle.

The ZIP is for local numerical reproducibility. For a research evaluation, record independently selected target patterns and their times separately, then compare with the reconstructions. Include random patterns and failed trials, and hold out arrangements and sessions from development. Neither numerical unit tests nor replayed synthetic camera frames establish physical optical performance.

**Remove** archives an experiment under `periscope/.archive/<experiment-id>/`. The directory can be moved back into `periscope/` to recover it while the app is stopped. It is not permanently erased.

## Research references

- [Saunders, Murray-Bruce and Goyal: Computational periscopy with an ordinary digital camera (2019)](https://www.nature.com/articles/s41586-018-0868-6).
- [Authors' reproduction code and data](https://github.com/Computational-Periscopy/Ordinary-Camera).
- [Accepted Umbra project idea](umbra-idea.en.md).
