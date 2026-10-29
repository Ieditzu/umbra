"""Scale a PDF exported from the editable PPTX to the A0 (84,1 × 118,9 cm) print size.

Usage: python export-editable.py /path/to/umbra-poster-editable.pdf
"""
from pathlib import Path
import subprocess
import sys

from pypdf import PdfReader, PdfWriter

out = Path(__file__).resolve().parent
reader = PdfReader(sys.argv[1])
if len(reader.pages) != 1:
    raise ValueError('The poster must contain exactly one page')
page = reader.pages[0]
page.scale_to(841 / 25.4 * 72, 1189 / 25.4 * 72)
writer = PdfWriter()
writer.add_page(page)
writer.add_metadata({'/Title': 'UMBRA — poster științific', '/Author': 'Echipa Umbra'})
target = out / 'umbra-poster-print.pdf'
with target.open('wb') as stream:
    writer.write(stream)
subprocess.run([
    'pdftoppm', '-png', '-singlefile', '-scale-to', '2400', str(target),
    str(out / 'umbra-poster-preview'),
], check=True)
