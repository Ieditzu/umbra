# Scientific poster — RoSEF 2026

Print `umbra-poster-print.pdf` at actual size: **80 × 120 cm, portrait**.

## Current editable Canva poster

**UMBRA — afilieri și format RoSEF 80 × 120 cm**
Design ID: `DAHZY6AHDbc`
Editor: https://www.canva.com/d/evpcoxAZT5M4XHD

This saved design replaces the damaged image-to-design conversion. Importing the
editable source preserved 126 text elements. The bar rectangles, axes, curve line
segments, section bands and table cells are individual vector elements. The 3D building illustration and QR code are images. The graphs use editable drawing elements;
they are not Canva spreadsheet-backed chart widgets.

`canva-layout.json` records the saved design and verification counts. Earlier
Canva designs are preserved so the team's previous work remains accessible.

## Files

- `umbra-poster-editable.pptx`: editable source, 323 shape elements including text,
  and two images (the building illustration and repository QR code). Import this file into Canva without image conversion.
- `build-editable.cjs`: creates the editable source directly from the analysis JSON.
- `export-editable.py`: scales its exported PDF to the required print dimensions
  and renders the preview with Poppler.
- `umbra-poster-print.pdf`: current single-page print file, exactly 800 × 1200 mm.
- `umbra-poster-preview.png`: current print preview.
- `building-3d.png`: AI-assisted illustration, not a measured building.
- `build.py` and `umbra-poster.svg`: retained earlier Matplotlib composition;
  these do not rebuild the current editable Canva poster.

## Rebuild

Requires Node.js with `pptxgenjs`, Noto Sans regular and bold, LibreOffice,
Python with `pypdf`, and Poppler (`pdftoppm`). Run from the repository root:

```bash
node docs/poster/scientific/build-editable.cjs
mkdir -p /tmp/umbra-poster-export
libreoffice -env:UserInstallation=file:///tmp/umbra-poster-lo-profile \
  --headless --convert-to pdf --outdir /tmp/umbra-poster-export \
  docs/poster/scientific/umbra-poster-editable.pptx
python docs/poster/scientific/export-editable.py \
  /tmp/umbra-poster-export/umbra-poster-editable.pdf
```

If `pptxgenjs` is installed outside Node's normal module search paths, set
`NODE_PATH` to that package directory. The PDF export step uses a separate
LibreOffice profile so it can run alongside a desktop LibreOffice session.

For a Canva revision, import the resulting PPTX and inspect the saved page.
Do not run image-to-design on a full-page screenshot: that conversion introduced
OCR errors and duplicate graph labels in the earlier poster.

## Revision on 29 October 2026

The scientific question spans the page beneath the masthead. The app section
explains route comparison, forecast use and shadow measurements. The final
section connects OSM/Copernicus sources, the 41 published cities, weather-aware
recommendations and optional shared heights. Coverage is read from the current
city index; the research graphs retain their original Constanța samples.
Each school appears below its author. The repository QR code is preserved.
The print size is corrected to 80 × 120 cm, verified against RoSEF 2026
Article 6(4), section II; see [print checklist](../../print-checklist.md).

## Data and interpretation

The reproducible inputs are:

- `docs/research/gba-heights/summary.json`: OSM coverage, GBA associations,
  height-per-floor medians and differences against OSM height tags.
- `docs/paper/measurability.json`: six simulated instants for 38,913 buildings.
- `mobile/assets/data/cities/index.json`: current city count and the Constanța
  Copernicus supplement; city zones are counted once per city.

Fig. 3 is the theoretical relation δh ≈ tan(e) · δL, using assumed length
errors of 5 m and 0.3 m. Fig. 4 considers obstruction by other buildings;
trees, vehicles, ground slope and physical access are outside that simulation.
OSM height tags are comparison data, not surveyed ground truth. No field sample
size or accuracy statistic was added.

The team confirmed on 28 October 2026 that the application had been tested
in Constanța. The poster includes that statement; numerical charts retain their
computational sources. Temperature and UV dose are not study outputs.

## Verification

On 29 October 2026 the PPTX and PDF were rendered and visually reviewed after
correcting axis units and legend spacing. The saved Canva import was checked:
126 native text elements and two images, the illustration and QR code. The
print PDF has one page and a media box of 2267.72 × 3401.57 pt (A0, 841 × 1189 mm).
