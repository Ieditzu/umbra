# Printable project documentation

[`umbra-documentatie.pdf`](umbra-documentatie.pdf) is the separate Romanian
project documentation requested for the stand: **five A4 pages, black and white**.
It explains the product, architecture, calculation models, installation,
measurements, privacy and reproduction. The scientific paper remains a separate
five-page document.

Rebuild from the repository root:

```bash
uv run --python 3.12 --with reportlab==4.4.9 --with pypdf \
  python scripts/build-documentation.py
```

The builder reads the current city index. It requires Noto Serif regular, bold
and italic plus Noto Sans Math under `/usr/share/fonts/noto/`, embeds the fonts
and asserts that the output remains five pages. Review every rendered page after
changing the content.

The longer [project guide](../project-guide.md) remains the repository's developer
reference. For the three presentation files and verified poster-size rule, use
the [print checklist](../print-checklist.md).
