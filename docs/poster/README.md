> **Latest poster (29 October 2026):** the combined scientific/app version is in [`scientific/`](scientific/README.md). Its print file is [`scientific/umbra-poster-print.pdf`](scientific/umbra-poster-print.pdf), exactly 80 × 120 cm. The files described below are the earlier map-background version, preserved for reference.

# Poster

`umbra-poster-print.pdf` is the print file: one page of exactly 80 × 120 cm, vertical, the maximum allowed by the RoSEF 2026 rules. Print it at 100% scale. Everything is vector (text, charts, map) except the QR code, which is a sharp 1-bit image. `poster-preview.png` is a small preview.

## Design

- **The background is real data.** It shows Tomis Nord at a scale of 1:1000 (1 mm on the poster = 1 m in the city), with building shadows calculated by Umbra for 27 October 2026 at 10:00 (Sun elevation 27.8°, azimuth 150°).
- **The gap is visible.** Only buildings whose height the app knows (an OSM height or floor count) are filled in and cast a shadow. Buildings without a height are drawn as outlines.
- **Consistent light direction.** The sun sits at the bottom right, where it really was for those shadows, and every card casts a hard shadow in the same direction as the buildings.
- **Fonts:** Bricolage Grotesque (from Google Fonts) and Inter.

## Rebuild

From the repository root:

```bash
uv run --python 3.12 --with numpy==2.3.4 --with shapely==2.1.2 --with pyproj==3.7.2 python scripts/poster-map.py docs/poster/map.svg
uv run --python 3.12 --with numpy==2.3.4 --with matplotlib==3.10.7 --with qrcode==8.2 --with pillow python scripts/poster-figures.py ~/.cache/umbra-research/gba-out/per-building.csv docs/poster
chromium --headless=new --no-pdf-header-footer --virtual-time-budget=15000 --print-to-pdf=docs/poster/umbra-poster-print.pdf "file://$PWD/docs/poster/poster.html"
```

The second step needs `per-building.csv` from `scripts/compare-gba-heights.py`. That file is kept outside Git because the GBA data is licensed CC BY-NC. Rendering needs internet access to load the Bricolage Grotesque font. Text changes, such as the contact email, go in `poster.html`.

The earlier Canva version (`gba-etaje.png`, `metoda.png`, `rezultate.png`) is no longer used for print.
