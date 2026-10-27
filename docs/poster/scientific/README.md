# Current scientific poster — RoSEF 2026

**Print `umbra-poster-print.pdf` at 100% / actual size: 80 × 120 cm, portrait.** Do not print the older PDF in the parent folder by mistake. This is the combined poster with the large UMBRA masthead, detailed 3D building, four plots, comparison table and implemented-app section.

- `umbra-poster-print.pdf`: single-page print file, exact 800 × 1200 mm. Fonts are embedded; graphs and text are vector. The 3D building is an illustrative raster image, not measured evidence.
- `umbra-poster.svg`: scalable artwork used for the Canva layout, with text outlined to preserve Romanian glyphs.
- `umbra-poster-preview.png`: preview image.
- `building-3d.png`: AI-assisted illustrative building diagram. It is not a measured building or experimental result.
- `build.py`: reproducible poster and PDF generation.

Saved Canva design: **UMBRA — poster combinat — 3D și rezultate**, design ID `DAHZM0B_Iyg`.

Editor: https://www.canva.com/d/nYV9ZMQQaxolPKv

The Canva artwork is grouped vector content rather than separate typed text boxes. Change scientific content in `build.py`, rebuild, and replace the Canva artwork when revising it.

## Rebuild

From the repository root, with `uv` installed:

```bash
uv run --no-project --python 3.12 \
  --with matplotlib==3.10.7 \
  --with numpy==2.3.4 \
  --with pypdf==6.12.0 \
  python docs/poster/scientific/build.py
```

The script reads these existing tracked analysis outputs:

- `docs/research/gba-heights/summary.json`
- `docs/paper/measurability.json`

It expects Noto Sans regular and bold at `/usr/share/fonts/noto/NotoSans-Regular.ttf` and `/usr/share/fonts/noto/NotoSans-Bold.ttf`. On other systems, change the two font paths in the script to the installed Noto Sans files. Matplotlib's DejaVu Sans supplies mathematical symbols absent from Noto Sans. Neither font needs internet access during generation.

The composition is rendered at a smaller working size, then the PDF page **and its vector content** are scaled together to 800 × 1200 mm with pypdf. The final file has no crop marks or extra bleed; confirm any printer-specific finishing requirements with the print shop.

## Scientific scope

The charts show OSM coverage, consistency between GlobalBuildingAtlas and OSM floor counts, a theoretical shadow-length error model, and simulated shadow-tip availability. Table values are comparisons against volunteered OSM height tags, not surveyed ground truth. Sample sizes and modeling assumptions are retained beside the figures.

Section 01 prominently describes the implemented application as checked against commit `d5a7eae`: routing/shadow calculation, GPS/tape/drone-photo height inputs, uncertainty, local storage, optional sharing, and incorporation of heights confirmed by the application's rules. Software confirmation is not independent validation of physical measurement accuracy.

Section 07 connects the scientific question to the measurement-to-height-to-shadow-to-route workflow. The masthead names both shaded routes and height estimation.

No field measurements or demonstrated route improvements are invented. The stated GPS and tape/laser errors are assumptions in the simplified curve; the implementation also includes other uncertainty terms. The measured-height module's existence does not establish its field accuracy.

## Verification

On 27 October 2026:

- `pdfinfo`: one page, approximately 2267.72 × 3401.57 pt (800 × 1200 mm).
- `pdffonts`: Noto Sans and DejaVu Sans are embedded with Unicode mappings.
- The PDF was rendered with Poppler and visually inspected.
- Text extraction confirmed the implemented-app section and principal data values.

The reference scientific-poster example/template supplied by the team informed the emphasis on numbered figures, axes, sample sizes, methods and limitations. Their sample projects and data were not copied.
