"""Create the five-page Romanian project documentation, in black and white.

Run from the repository root:
    uv run --python 3.12 --with reportlab==4.4.9 --with pypdf \
        python scripts/build-documentation.py
"""
from pathlib import Path
import json

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Preformatted,
)
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/documentation/umbra-documentatie.pdf'
areas = json.loads((ROOT / 'mobile/assets/data/cities/index.json').read_text())['areas']
city_count = len({area['city'] for area in areas})
constanta = next(area for area in areas if area['city'] == 'constanta')
heights = f"{constanta['heights_count']:,}".replace(',', '.')
for name, file in [('Body', 'Regular'), ('BodyBold', 'Bold'), ('BodyItalic', 'Italic')]:
    pdfmetrics.registerFont(TTFont(name, f'/usr/share/fonts/noto/NotoSerif-{file}.ttf'))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='BodyBold', italic='BodyItalic', boldItalic='BodyBold')
pdfmetrics.registerFont(TTFont('Symbols', '/usr/share/fonts/noto/NotoSansMath-Regular.ttf'))
assert all(ord(symbol) in pdfmetrics.getFont('Symbols').face.charToGlyph for symbol in ('→', '≈'))
body = ParagraphStyle('Body', fontName='Body', fontSize=11.5, leading=15.5,
                      alignment=TA_JUSTIFY, textColor=colors.black, spaceAfter=7)
heading = ParagraphStyle('Heading', parent=body, fontName='BodyBold', fontSize=14,
                         leading=18, alignment=TA_LEFT, spaceBefore=9, spaceAfter=7,
                         keepWithNext=True)
title = ParagraphStyle('Title', parent=heading, fontSize=19, leading=24,
                       alignment=TA_CENTER, spaceBefore=0, spaceAfter=12)
small = ParagraphStyle('Small', parent=body, fontSize=9.5, leading=13, alignment=TA_LEFT)
cell = ParagraphStyle('Cell', parent=body, fontSize=10, leading=13, alignment=TA_LEFT, spaceAfter=0)
code = ParagraphStyle('Code', parent=small, fontName='Courier', fontSize=9, leading=12,
                      spaceBefore=3, spaceAfter=8)
story = []


def rich(text):
    for symbol in ('→', '≈'):
        text = text.replace(symbol, f'<font name="Symbols">{symbol}</font>')
    return text


def p(text, style=body):
    story.append(Paragraph(rich(text), style))


def h(text):
    p(text, heading)


def table(rows, widths):
    items = [[Paragraph(rich(f'<b>{v}</b>' if r == 0 else str(v)), cell)
              for v in row] for r, row in enumerate(rows)]
    tab = Table(items, colWidths=[w * cm for w in widths], hAlign='LEFT', repeatRows=1)
    tab.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), .5, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.extend([tab, Spacer(1, 8)])


def page(text):
    story.append(PageBreak())
    h(text)


p('UMBRA<br/>Documentația proiectului', title)
p('<b>Trasee pietonale adaptate umbrei urbane și măsurarea înălțimii clădirilor</b>',
  ParagraphStyle('Subtitle', parent=body, alignment=TA_CENTER, spaceAfter=12))
for author, school in [
    ('Eduard-Mihai Perjoc', 'Liceul Tehnologic de Marină'),
    ('Eduard-Andrei Haivas', 'Liceul Internațional de Informatică Constanța'),
    ('Cezar-Ștefan Manea', 'Liceul Tehnologic de Electrotehnică și Telecomunicații'),
]:
    p(f'<b>{author}</b> — {school}', small)
p('Clasa a X-a · Constanța<br/>Coordonator: prof. Ramona Rădulescu — Informatică pentru Viitor (IPV)<br/>'
  'Contact: radramra@gmail.com', small)
h('1. Scopul și funcțiile proiectului')
p('Umbra este o aplicație mobilă pentru Android și iOS care compară trasee pietonale în funcție de '
  'ora plecării, durata deplasării, umbra geometrică estimată și ocolul acceptat. Utilizatorul alege '
  'destinația, iar aplicația prezintă alternative distincte și permite urmărirea traseului prin GPS.')
p('Proiectul leagă două operații: calculul umbrelor din înălțimile clădirilor și estimarea înălțimilor '
  'din umbre măsurate. Valorile confirmate în aplicație actualizează modelul folosit la comparația '
  'traseelor. Prognoza meteo completează recomandarea prin estimarea radiației solare directe.')
p('<b>Întrebarea științifică:</b> cu ce eroare estimăm înălțimea clădirilor din umbre și când rămân '
  'vârfurile umbrelor neobstrucționate? Documentația explică realizarea și folosirea sistemului; '
  'lucrarea științifică separată prezintă analiza datelor și simulările.')
table([
    ['Funcție', 'Rezultat pentru utilizator'],
    ['Compararea traseelor', 'Distanță, durată, expunere modelată și alternative în limita ocolului.'],
    ['Harta urbană', 'Clădiri, umbre și estimări de vegetație, pentru momentul selectat.'],
    ['Măsoară clădirea', 'Înălțime și incertitudine din distanță, moment și geometria umbrei.'],
    ['Baza comună', 'Partajare opțională a măsurătorilor și reutilizarea înălțimilor confirmate.'],
], [4.1, 12.3])
p(f'Catalogul publicat include {city_count} de orașe în {len(areas)} de zone, cu Bucureștiul împărțit '
  'în nouă zone suprapuse. Constanța este zona studiului inițial și a utilizării pe teren raportate de echipă.')

page('2. Arhitectura și organizarea aplicației')
p('Interfața este realizată în React Native, TypeScript și Expo SDK 58. Telefonul citește GPS-ul și '
  'busola, validează răspunsurile și desenează harta. Serverul Node.js de pe PC execută calculele '
  'geometrice și de rutare în worker threads, separat de procesarea cererilor HTTP.')
table([
    ['Componentă', 'Rol în sistem'],
    ['Aplicația mobilă', 'Selectarea destinației și a orei, afișarea alternativelor, navigare și măsurători.'],
    ['Proxy Metro', 'Transmite către server numai metodele și căile API permise, prin /umbra-api.'],
    ['Server și workers', 'Selectează zona, încarcă datele, calculează poziția Soarelui, umbrele și traseele.'],
    ['Date geografice', 'Grafuri pietonale, contururi OSM, înălțimi și surse separate pentru arbori.'],
    ['SQLite', 'Stochează măsurătorile partajate și starea înălțimilor confirmate.'],
    ['Servicii externe', 'OpenFreeMap pentru hartă și clădiri regionale; Open-Meteo pentru prognoză.'],
], [4.1, 12.3])
h('Fluxul unei cereri')
p('Telefon → conexiunea Expo/Metro → API Node → worker → graf și geometrie → răspuns validat → hartă. '
  'La prima cerere dintr-un oraș, workerul decodează setul comprimat și construiește indicii spațiali. '
  'Zonele utilizate recent rămân într-un cache limitat; datele nu sunt descărcate integral la fiecare cerere.')
h('Interfața API')
table([
    ['Cale', 'Utilizare'],
    ['GET /health', 'Identitatea serviciului și disponibilitatea workers.'],
    ['POST /v1/routes/compare', 'Puncte, oră, fus orar, viteză și ocol → trasee și avertizări.'],
    ['POST /v1/shadows', 'Zonă și moment → geometrii de umbră pentru hartă.'],
    ['POST /v1/buildings', 'Geometria clădirilor și proveniența înălțimilor.'],
    ['POST /v1/buildings/inspect', 'Clădirea selectată și colțurile utilizabile pentru măsurare.'],
    ['GET /v1/heights; /v1/measurements', 'Citirea înălțimilor comune; trimiterea și ștergerea măsurătorilor prin metodele dedicate.'],
], [6.0, 10.4])
p('Coordonatele cererilor sunt geografice; operațiile geometrice folosesc metri în UTM 35N. '
  'Datele GeoJSON folosesc ordinea longitudine, latitudine. Cererile au limite de timp și de dimensiune, '
  'iar răspunsurile păstrează avertizările privind datele lipsă sau rezultatele trunchiate.')

page('3. Modelele de calcul și sursele de date')
h('Poziția Soarelui și geometria umbrelor')
p('Poziția Soarelui este calculată cu ecuații NOAA/Meeus din loc și momentul real, exprimat printr-un '
  'timestamp cu fus orar explicit. Clădirile sunt modelate ca prisme verticale pe teren plan. '
  'Conturul și înălțimea determină proiecția umbrei în direcția opusă Soarelui. Curțile interioare '
  'și contururile concave sunt păstrate de operațiile geometrice.')
p('<b>Înălțimea din umbră: h = L · tan(e)</b>, unde h este înălțimea, L lungimea umbrei pe sol, iar e '
  'elevația Soarelui. Incertitudinea combină eroarea distanței, citirea penumbrei și eroarea unghiulară. '
  'Modelul simplificat δh ≈ tan(e) · δL explică influența orei asupra sensibilității la măsurarea distanței.')
h('Sursele de înălțime')
p('Înălțimile OSM, estimările din etaje, estimările Copernicus și măsurătorile confirmate au '
  'proveniență distinctă. Înălțimile confirmate au prioritate. Copernicus Urban Atlas Building Block '
  f'Height 2012 completează {heights} de clădiri fără înălțime OSM în Constanța. '
  'Vechimea rasterului și intervalul euristic −5/+10 m sunt păstrate ca limite ale estimării. '
  'Volumele orientative de 6 m folosite la afișare nu sunt înălțimi măsurate.')
h('Trasee și expunere')
p('Motorul calculează mai întâi traseul cel mai rapid pe graful pietonal real. Caută apoi un număr '
  'limitat de alternative și evaluează expunerea la momentul estimat al trecerii pe fiecare segment. '
  'Alternativele respectă ocolul maxim; nu sunt adăugate variante duplicate pentru completarea interfeței. '
  'Căutarea nu garantează optimul global și nu creează legături pietonale inexistente.')
table([
    ['Categorie', 'Semnificație'],
    ['Umbră modelată', 'Obstrucție geometrică susținută de intervalul de înălțime.'],
    ['Umbră estimată', 'Estimări satelitare sau de vegetație, cu pondere redusă.'],
    ['Fără umbră identificată', 'Modelul nu găsește un obstacol; inventarul poate fi incomplet.'],
    ['Necunoscut', 'Informații insuficiente pentru clasificare.'],
], [5.0, 11.4])
p('Prognoza Open-Meteo reordonează alternativele existente după durata mersului și expunerea directă '
  'modelată. Ea descrie o celulă regională, nu poziția norilor pe străzi. Fără prognoză disponibilă, '
  'rămâne comparația geometrică. Umbra și scorul meteo nu reprezintă temperatură sau doză UV personală.')

page('4. Instalare și utilizare')
h('Pornirea pe PC și telefon')
p('Sunt necesare Node.js 22.13 sau mai nou, npm și Expo Go compatibil cu SDK 58. Din rădăcina '
  'depozitului se execută:')
story.append(Preformatted('npm --prefix mobile ci\nnpm --prefix mobile start -- --clear', code))
p('Comanda pornește serverul și Metro. PC-ul și telefonul trebuie să poată comunica; se scanează '
  'codul QR nou și se permite localizarea în prim-plan. Aplicația descoperă automat API-ul prin '
  'conexiunea Expo. Adresa localhost pe telefon indică telefonul, nu PC-ul. Serverul trebuie să '
  'rămână pornit pentru calcule noi. Nu există comutare automată la calcul complet pe telefon.')
h('Compararea și urmărirea traseelor')
p('<b>1.</b> Alege destinația prin „Unde mergi?” sau prin apăsare lungă pe hartă. '
  '<b>2.</b> Selectează ora prin „Acum” și ocolul de 0, 5, 10 sau 15 minute din setări. '
  '<b>3.</b> Compară variantele și pornește traseul ales. '
  '<b>4.</b> Urmărește poziția, distanța și timpul rămas. Mutarea manuală a hărții suspendă urmărirea; '
  'butonul de localizare o reia. „Ieși” încheie sesiunea de navigare.')
p('Straturile controlează harta, satelitul, clădirile 3D și umbrele. La noapte nu sunt desenate '
  'umbre solare. Vizibilitatea unei clădiri în hartă nu garantează existența unui graf pietonal '
  'pentru acea zonă. În afara orașelor pregătite pot fi afișate clădiri regionale fără rutare.')
h('Măsurarea unei clădiri')
p('Butonul riglă deschide „Măsoară clădirea”. Se alege clădirea și colțul acoperișului, apoi se '
  'introduce distanța cu ruleta/laserul, se colectează poziții GPS la vârful umbrei sau se introduc '
  'parametrii unei fotografii verticale din dronă. Se folosește momentul măsurării, nu ora de '
  'inspecție a hărții. Soarele sub 10°, vârful blocat și geometria necorespunzătoare sunt verificate; '
  'panta poate necesita revizuire. Măsurarea AR nu este implementată.')
p('Confirmarea software poate rezulta dintr-o măsurătoare acceptată cu ruleta/laserul sau din dronă, '
  'ori din două citiri independente concordante. Modul orb ascunde valorile cunoscute, iar '
  'referințele independente sunt exportate separat pentru analiză.')
h('Partajare și confidențialitate')
p('Salvarea este locală; contribuția la baza comună se activează explicit. Serverul verifică '
  'clădirea și colțul OSM și recalculează înălțimea, înainte de publicarea valorilor confirmate. '
  'Baza SQLite se află în .umbra-data/, în afara Git. Utilizatorul poate șterge propriile încărcări. '
  'Nu se trimit fotografii sau istoric GPS în acest flux; identificatorul clădirii și colțul identifică '
  'totuși un loc. Datele traseului sunt trimise PC-ului pentru calcul, fără jurnalizare pe disc în server.')

page('5. Reproducere, verificare și livrabile')
h('Separarea datelor de studiu de funcțiile aplicației')
p('Studiul inițial folosește instantaneul OSM al Constanței din 25 octombrie 2026. Extinderea '
  'ulterioară a aplicației și înălțimile Copernicus nu înlocuiesc automat eșantioanele cercetării.')
table([
    ['Analiză', 'Date utilizate și fișier reproductibil'],
    ['Acoperire OSM', '51.428 de clădiri; 45.159 fără înălțime sau etaje în instantaneul studiului.'],
    ['GBA față de OSM', '4.925 de asocieri cu etaje; 88 cu înălțimi OSM. Rezumat: docs/research/gba-heights/summary.json.'],
    ['Fezabilitatea măsurării', '38.913 clădiri, șase momente; docs/paper/measurability.json. Obstacolele modelate sunt alte clădiri.'],
    ['Fluxul de evaluare pe teren', 'Analiza primește exporturi JSON/CSV din aplicație, cu referințe independente și încercări salvate.'],
], [5.0, 11.4])
p('Scripturile compare-gba-heights.py și shadow-measurability.py reproduc analizele. '
  'analyze-shadow-heights.py calculează erorile din exporturile de studiu, iar '
  'server/compute/route-effect.mjs compară efectul surselor de înălțime asupra traseelor. '
  'Datele brute, bazele de date și acreditările rămân în afara Git.')
h('Verificarea software')
story.append(Preformatted('npm --prefix mobile run typecheck\nnpm --prefix mobile run lint\nnpm --prefix mobile test\nnpm --prefix mobile run test:server', code))
p('Testele verifică ecuațiile solare față de referințe, geometria, contractele, limitele de ocol, '
  'regulile măsurătorilor și răspunsurile serverului. Testele sintetice controlează intrările; '
  'verificările pe date OSM controlează integrarea datelor reale. Exporturile Android/iOS verifică '
  'împachetarea aplicației. Măsurătorile independente stabilesc separat precizia fizică și avantajul pe trasee.')
h('Fișiere pentru prezentare')
p('<b>Lucrare:</b> docs/paper/umbra-lucrare.pdf, A4, alb-negru, cinci pagini. '
  '<b>Documentație:</b> prezentul document, A4, alb-negru, cinci pagini. '
  '<b>Poster:</b> docs/poster/scientific/umbra-poster-print.pdf, color, 80 × 120 cm, vertical. '
  'Fișierul PPTX și designul Canva păstrează textele și graficele editabile.',
  ParagraphStyle('DeliveryFiles', parent=body, alignment=TA_LEFT))
p('Regulamentul RoSEF 2026 publicat de Societatea Științifică Cygnus, art. 6 alin. (4), '
  'secțiunea II, stabilește limita de 80 × 120 cm pentru poster. Tipărirea se face la dimensiunea '
  'reală a PDF-ului. Sursa: cygnus.org.ro/wp-content/uploads/2026/05/Regulament-RoSEF-2026.pdf.', small)
p('Cod și documentație completă: github.com/Ieditzu/umbra. Surse: © OpenStreetMap contributors '
  '(ODbL); Copernicus Land Monitoring Service / EEA; Open-Meteo (CC BY 4.0); '
  'GlobalBuildingAtlas pentru comparația de cercetare. Proveniența și licențele sunt descrise '
  'în docs/mobile-data.md și docs/cities.md.', small)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.black)
    canvas.setFont('Body', 8)
    canvas.drawString(2.2 * cm, 1.25 * cm, 'UMBRA · Documentația proiectului · RoSEF 2026')
    canvas.drawRightString(A4[0] - 2.2 * cm, 1.25 * cm, f'{doc.page} / 5')
    canvas.restoreState()


OUT.parent.mkdir(parents=True, exist_ok=True)
doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=2.2 * cm,
                        leftMargin=2.2 * cm, topMargin=1.8 * cm, bottomMargin=1.9 * cm,
                        title='Umbra — documentația proiectului', author='Echipa Umbra')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
assert len(PdfReader(OUT).pages) == 5, 'Adjust layout: documentation must remain five pages'
print(OUT)
