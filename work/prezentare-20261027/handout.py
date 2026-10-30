from pathlib import Path
import json
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4

HERE=Path(__file__).resolve().parent
OUT=HERE/'deliverables'
F=Path('/System/Library/Fonts/Supplemental')
for key,name in [('A','Arial.ttf'),('AB','Arial Bold.ttf')]:pdfmetrics.registerFont(TTFont(key,str(F/name)))
pdfmetrics.registerFontFamily('A',normal='A',bold='AB',italic='A',boldItalic='AB')
notes=json.loads((HERE/'speaker_notes.json').read_text())
green=colors.HexColor('#183D36')

# Backup slides, exactly matching the inspected slide images.
c=canvas.Canvas(str(OUT/'UMBRA_SmartRoute_Prezentare_5_minute.pdf'),pagesize=(960,540))
c.setTitle('UMBRA SmartRoute | Prezentare de 5 minute')
for i in range(1,7):
 c.drawImage(str(HERE/'previews'/f'slide-{i}.png'),0,0,960,540)
 c.showPage()
c.save()

W,H=A4
c=canvas.Canvas(str(OUT/'UMBRA_SmartRoute_Discurs_5_minute.pdf'),pagesize=A4)
c.setTitle('UMBRA SmartRoute | Discurs și repere pentru 5 minute')
c.setAuthor('Echipa UMBRA SmartRoute')
body=ParagraphStyle('body',fontName='A',fontSize=11.5,leading=16,textColor=green)
small=ParagraphStyle('small',fontName='A',fontSize=9.5,leading=13,textColor=colors.HexColor('#52645D'))
def para(txt,x,y,w,style=body):
 p=Paragraph(txt,style);_,h=p.wrap(w,1000);p.drawOn(c,x,y-h);return y-h
for page in range(3):
 c.setFillColor(green);c.setFont('AB',18);c.drawString(42,H-46,'UMBRA SmartRoute')
 c.setFont('A',11);c.drawString(42,H-66,'Discurs pentru 6 slide-uri. Durată planificată: 5:00.')
 y=H-97
 if page==0:
  y=para('562 de cuvinte. Respectă intervalele de mai jos și folosește pauzele pentru a indica schema sau graficul. Verifică durata reală prin repetiție cronometrată. Sursele și detaliile tehnice sunt și în notele PowerPoint.',42,y,W-84,small)-22
 for s in notes[page*2:page*2+2]:
  c.setFont('AB',13);c.setFillColor(green);c.drawString(42,y,f"{s['slide']}. {s['title']}");y-=22
  c.setFont('AB',10);c.drawString(42,y,f"{s['start']} - {s['end']}  /  {s['seconds']} secunde");y-=16
  y=para(s['speech'],42,y,W-84)-12
  y=para('<b>Reper:</b> '+s['cue'],42,y,W-84,small)-28
 assert y>50,('overflow',page,y)
 c.setFont('A',9);c.setFillColor(colors.HexColor('#52645D'));c.drawString(42,30,'Prezentare orală, fără citirea surselor sau a etichetelor tehnice.')
 c.drawRightString(W-42,30,f'{page+1} / 3');c.showPage()
c.save()
print('PDF-uri create: prezentare 6 pagini, discurs 3 pagini.')
