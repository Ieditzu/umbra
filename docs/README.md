# Umbra documentation

Start with the [project guide](project-guide.md) for installation, phone use,
architecture, API, research reproduction and troubleshooting.

## Current implementation

| Topic | Document |
| --- | --- |
| Setup and user workflow | [Project guide](project-guide.md) |
| PC calculation server and privacy | [Mobile server](backend/mobile-server.md) |
| React Native integration and contracts | [Mobile application](mobile-app.md) |
| Prepared routing areas and rebuild pipeline | [City coverage](cities.md) |
| Original city snapshot and attribution | [Data provenance](mobile-data.md) |
| Measuring buildings and sharing heights | [Shadow heights](shadow-heights.md#implementation-status) |
| Forecast-based route selection | [Weather-aware routing](research/weather-aware-routing.md) |
| Software verification history | [Verification](mobile-verification.md) |

The current phone application uses the Node server. The [Go backend](backend/README.md)
is a separate preparation/reference implementation. Camera, parking and
Periscope documents describe earlier work; they are not setup instructions for
the current application.

## Research and presentation

The paper, poster and measurement documentation share this primary question:
**What error do shadow-based building-height estimates have, and when are shadow
tips unobstructed?** The application uses the resulting height ranges for shadow
maps and walking-route comparisons. Weather-based recommendation is a separate
implemented extension, with its own evaluation question.

- [GBA comparison](research/gba-heights/README.md): aggregate analysis and figures.
- [Scientific paper PDF](paper/umbra-lucrare.pdf) and [editable Word file](paper/umbra-lucrare.docx).
- [Poster files and Canva design](poster/scientific/README.md): use this document
  to identify the current editable design and print file.
- [Archived competition paperwork](competition/README.md): earlier camera project.

Use the source dates and sample sizes recorded with each analysis. The paper's
original Constanța OSM/GBA study is a dated research dataset; later city or
Copernicus updates do not automatically regenerate its results.
