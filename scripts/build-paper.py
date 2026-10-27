"""Build the competition paper (Romanian, black and white) on top of the contest's Word model.

Numbers come from the analysis outputs, so the text cannot drift from the data:
    docs/research/gba-heights/summary.json   (scripts/compare-gba-heights.py)
    docs/paper/measurability.json            (scripts/shadow-measurability.py)

Run with:
    uv run --python 3.12 --with python-docx==1.2.0 \
        python scripts/build-paper.py "/path/scientific-paper-model.docx" docs/paper/umbra-lucrare.docx
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Mm, Pt

ROOT = Path(__file__).resolve().parent.parent
PAPER = ROOT / "docs/paper"
GBA = json.loads((ROOT / "docs/research/gba-heights/summary.json").read_text())
MEASURE = json.loads((PAPER / "measurability.json").read_text())
FONT = "Times New Roman"


def num(value: float, digits: int = 1) -> str:
    """Romanian number format: decimal comma, dot for thousands."""
    text = f"{value:,.{digits}f}"
    return text.replace(",", "§").replace(".", ",").replace("§", ".").replace("-", "−")


def runs(paragraph, text: str, size: float = 12) -> None:
    """Tiny markup: **bold**, *italic*, ^superscript^, ~subscript~."""
    for part in re.split(r"(\*\*.+?\*\*|\*.+?\*|\^.+?\^|~.+?~)", text):
        if not part:
            continue
        run = paragraph.add_run(part.strip("*^~") if part[0] in "*^~" else part)
        run.font.name, run.font.size = FONT, Pt(size)
        run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
        run.bold = part.startswith("**")
        run.italic = part.startswith("*") and not part.startswith("**")
        run.font.superscript = part.startswith("^")
        run.font.subscript = part.startswith("~")


def para(doc, text: str = "", *, align=WD_ALIGN_PARAGRAPH.JUSTIFY, size: float = 12,
         before: float = 0, after: float = 6, keep: bool = False, spacing: float = 1.15):
    p = doc.add_paragraph()
    f = p.paragraph_format
    f.alignment, f.space_before, f.space_after = align, Pt(before), Pt(after)
    f.line_spacing, f.keep_with_next = spacing, keep
    runs(p, text, size)
    return p


def heading(doc, text: str) -> None:
    para(doc, f"**{text}**", align=WD_ALIGN_PARAGRAPH.LEFT, before=10, after=4, keep=True)


def caption(doc, text: str, keep: bool = False) -> None:
    para(doc, text, align=WD_ALIGN_PARAGRAPH.CENTER, size=10, before=2, after=8, keep=keep, spacing=1.0)


def figure(doc, image: Path, width_cm: float) -> None:
    p = para(doc, align=WD_ALIGN_PARAGRAPH.CENTER, after=0, keep=True, spacing=1.0)
    p.add_run().add_picture(str(image), width=Cm(width_cm))


def borders(table) -> None:
    props = table._tbl.tblPr
    edges = OxmlElement("w:tblBorders")
    for edge in ["top", "left", "bottom", "right", "insideH", "insideV"]:
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single"), el.set(qn("w:sz"), "4"), el.set(qn("w:color"), "000000")
        edges.append(el)
    props.append(edges)


def table(doc, rows: list[list[str]], widths_cm: list[float]) -> None:
    t = doc.add_table(rows=len(rows), cols=len(rows[0]))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    borders(t)
    for r, values in enumerate(rows):
        for c, value in enumerate(values):
            cell = t.cell(r, c)
            cell.width = Cm(widths_cm[c])
            p = cell.paragraphs[0]
            p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER if c else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_after = Pt(0)
            runs(p, f"**{value}**" if r == 0 else value, size=10)
    para(doc, after=2, size=4, spacing=1.0)


def page_number_footer(section) -> None:
    p = section.footer.paragraphs[0]
    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    runs(p, "Pagina ", size=10)
    run = p.add_run()
    run.font.name, run.font.size = FONT, Pt(10)
    for kind, text in [("begin", None), (None, "PAGE"), ("end", None)]:
        if kind:
            el = OxmlElement("w:fldChar")
            el.set(qn("w:fldCharType"), kind)
        else:
            el = OxmlElement("w:instrText")
            el.set(qn("xml:space"), "preserve")
            el.text = text
        run._element.append(el)


def start(model: Path):
    doc = Document(str(model))
    body = doc.element.body
    for child in list(body):
        if child.tag != qn("w:sectPr"):
            body.remove(child)
    normal = doc.styles.default(WD_STYLE_TYPE.PARAGRAPH)
    normal.font.name, normal.font.size = FONT, Pt(12)
    section = doc.sections[0]
    section.page_width, section.page_height = Mm(210), Mm(297)
    for side in ["left_margin", "right_margin", "top_margin", "bottom_margin"]:
        setattr(section, side, Cm(2.2))
    section.header_distance = section.footer_distance = Cm(1.0)
    header = section.header.paragraphs[0]
    header.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    runs(header, "RoSEF 2026 — Tehnologia Informației și Comunicațiilor", size=9)
    page_number_footer(section)
    return doc


def build(model: Path, output: Path) -> None:
    cov, tag, lv = GBA["coverage"], GBA["tagged_by_height"], GBA["levels_by_count"]
    instants = MEASURE["instants"]
    oct_noon = instants["27 oct 12:00"]
    measurable_oct = [instants[k]["measurable_pct"] for k in instants if k.startswith("27 oct")]
    measurable_jun = [instants[k]["measurable_pct"] for k in instants if k.startswith("21 iun")]
    tall_oct = [instants[k]["by_height_pct"]["≥ 20 m"] for k in instants if k.startswith("27 oct")]

    doc = start(model)
    para(doc, "**Măsurarea înălțimii clădirilor din umbra lor pentru trasee pietonale umbrite în Constanța**",
         align=WD_ALIGN_PARAGRAPH.CENTER, size=16, after=8, spacing=1.0)
    for line, after in [
        ("Eduard-Mihai PERJOC (elev)^1^, Eduard-Andrei HAIVAS (elev)^2^, Cezar-Ștefan MANEA (elev)^3^", 0),
        ("Profesor coordonator: Ramona RĂDULESCU^4^", 0),
        ("^1^ Clasa a X-a, Liceul Tehnologic de Marină, Constanța, județul Constanța", 0),
        ("^2^ Clasa a X-a, Liceul Internațional de Informatică Constanța, județul Constanța", 0),
        ("^3^ Clasa a X-a, Liceul Tehnologic de Electrotehnică și Telecomunicații, Constanța, județul Constanța", 0),
        ("^4^ Catedra de …, [Liceul / Colegiul …], Constanța, județul Constanța", 0),
        ("Contact: [adresa@email.com]", 10),
    ]:
        para(doc, line, align=WD_ALIGN_PARAGRAPH.CENTER, size=11, after=after, spacing=1.0)

    para(doc, "**Rezumat**", align=WD_ALIGN_PARAGRAPH.LEFT, after=2, keep=True)
    para(doc, (
        "Aplicația noastră, Umbra, recomandă trasee pietonale prin umbra clădirilor, dar umbra poate fi calculată "
        "numai pentru clădirile cu înălțime cunoscută. În Constanța, 87,8% dintre cele 51.428 de clădiri din "
        "OpenStreetMap nu au nicio informație despre înălțime. Am evaluat setul global GlobalBuildingAtlas și am "
        "constatat că subestimează sistematic blocurile înalte: pentru blocurile cu 9–12 etaje rezultă o valoare "
        f"mediană de {num(lv['9-12 floors']['gba_m_per_floor_median'], 2)} m pe etaj. Propunem măsurarea înălțimii din lungimea "
        "umbrei, după relația h = L · tan e, unde unghiul Soarelui e este calculat de aplicație. Modelul erorilor arată "
        "că precizia depinde aproape numai de măsurarea lungimii, iar măsurătorile trebuie făcute cu Soarele jos. "
        f"Pe contururile reale ale orașului, la 27 octombrie, {num(min(measurable_oct), 0)}–{num(max(measurable_oct), 0)}% "
        "dintre clădiri au un vârf de umbră neobstrucționat de alte clădiri. Metoda poate completa datele lipsă "
        "prin măsurători făcute de utilizatori."
    ), after=4)
    para(doc, "**Cuvinte-cheie:** înălțimea clădirilor, umbre, poziția Soarelui, OpenStreetMap, trasee pietonale",
         align=WD_ALIGN_PARAGRAPH.LEFT, after=4)

    heading(doc, "1. INTRODUCERE")
    para(doc, (
        "În zilele caniculare, umbra clădirilor face mersul pe jos mai suportabil. Am realizat Umbra, o aplicație "
        "mobilă care recomandă trasee pietonale cu mai multă umbră. Un server care rulează pe calculator "
        "calculează poziția Soarelui, umbrele și traseele, iar telefonul afișează harta și citește GPS-ul. "
        "Sistemul folosește contururile clădirilor și rețeaua de alei din OpenStreetMap (OSM) [1] și ecuațiile "
        "NOAA pentru poziția Soarelui [2]."
    ))
    para(doc, (
        "Umbra unei clădiri poate fi calculată numai dacă îi cunoaștem înălțimea. Din cele 51.428 de clădiri din "
        "datele aplicației (Constanța, Mamaia și Palazu Mare), doar 271 (0,5%) au înălțimea înregistrată în OSM și "
        "5.913 (11,5%) au numărul de etaje; 45.159 (87,8%) nu au nicio informație. Seturile globale obținute prin "
        "învățare automată, precum GlobalBuildingAtlas (GBA) [3], par o soluție, dar precizia lor într-un oraș "
        "românesc nu era cunoscută."
    ))
    para(doc, (
        "Există mai multe seturi globale de înălțimi. GBA raportează erori pătratice medii între 1,5 și 8,9 m, "
        "în funcție de continent [3]; 3D-GloBFP raportează între 1,9 și 14,6 m [7]; EUBUCCO armonizează datele "
        "europene, dar preia înălțimile din surse naționale sau din OSM [8]. Toate sunt estimate din imagini de "
        "satelit sau compilate din alte surse, iar precizia lor variază mult de la o regiune la alta."
    ))
    para(doc, (
        "Calcularea înălțimii din umbră este cunoscută în teledetecție, unde se aplică imaginilor din satelit [4]. "
        "Noi propunem folosirea ei la sol, cu telefonul: aplicația calculează unghiul Soarelui, iar utilizatorul "
        "măsoară doar lungimea umbrei. Scopul lucrării este (1) să evaluăm GBA pe clădirile din Constanța, "
        "(2) să stabilim, printr-un model al erorilor, în ce condiții metoda umbrei este precisă și (3) să estimăm "
        "câte clădiri pot fi măsurate astfel. Ipoteza noastră este că măsurarea umbrei poate fi mai precisă decât "
        "GBA pentru blocurile înalte, deoarece eroarea ei depinde aproape numai de lungimea măsurată."
    ))

    heading(doc, "2. MATERIALE ȘI METODE")
    para(doc, (
        "**Aplicația.** Interfața este scrisă în TypeScript, cu React Native și Expo, pentru Android și iOS; "
        "motorul de calcul rulează pe un server Node.js. Datele pentru Constanța sunt păstrate comprimat în "
        "proiect: 50.071 de noduri și 111.552 de muchii ale rețelei pietonale și 51.428 de contururi de clădiri, "
        "în coordonate metrice (UTM, EPSG:32635). Umbra arborilor este estimată separat, cu pondere redusă; "
        "lucrarea de față se ocupă numai de clădiri. Fiecare "
        "clădire are un interval de înălțime: o înălțime etichetată dă un interval îngust, iar numărul de etaje "
        "N dă intervalul 2,5·N – 3,5·N + 3 m. Un punct al traseului este considerat umbrit numai dacă raza "
        "Soarelui trece sub limita inferioară; între cele două limite rezultatul este „necunoscut”, iar clădirile "
        "fără înălțime nu produc umbră. De aceea, fiecare înălțime măsurată transformă porțiuni necunoscute ale "
        "traseelor în porțiuni cu rezultat cert."
    ))
    para(doc, (
        "**Date.** Am folosit extrasul OSM din 25.10.2026 inclus în aplicație [1] și fișierul GBA pentru regiunea "
        "25–30° E, 40–45° N [3]. GBA folosește identificatorii OSM ai clădirilor, așa că am asociat clădirile "
        f"direct, după identificator: {num(cov['all']['with_gba_height'], 0)} de clădiri "
        f"({num(cov['all']['pct'])}%) au o înălțime GBA. Ca referință am folosit înălțimile din OSM "
        f"({tag['0-10 m']['n'] + tag['10-20 m']['n'] + tag['20-40 m']['n'] + tag['40-1000 m']['n']} de clădiri "
        f"asociate) și numărul de etaje ({num(GBA['levels']['n'], 0)} de clădiri). Analizele sunt scrise în "
        "Python și pot fi repetate cu scripturile din proiect."
    ))
    para(doc, (
        "**Principiul metodei.** O muchie verticală de înălțime h aruncă pe teren plat o umbră de lungime L "
        "(Figura 1). Dacă e este unghiul Soarelui deasupra orizontului, atunci h = L · tan e. Aplicația calculează "
        "e pentru data, ora și locul măsurării, cu ecuațiile NOAA/Meeus [2], [5], verificate în teste cu "
        "algoritmul de referință SPA [6]. Pentru că OSM oferă conturul clădirii, aplicația știe și direcția "
        "umbrei: vârful umbrei unui colț C se află pe dreapta C + h · cot e · u, unde u este direcția opusă "
        "Soarelui. Pe hartă, această dreaptă devine o riglă gradată în metri de înălțime."
    ))
    figure(doc, PAPER / "principiu.png", 12.5)
    caption(doc, "Figura 1. Principiul metodei: înălțimea rezultă din lungimea umbrei și unghiul Soarelui")
    para(doc, (
        "**Modelul erorilor.** Prin diferențierea relației obținem δh = tan e · δL + L · δe / cos²e. "
        "Testele aplicației limitează diferența față de algoritmul SPA la 0,03°; împreună cu refracția atmosferică, "
        "nemodelată (circa 0,035° la 25°), aceasta adaugă cel mult aproximativ 0,3% la eroarea înălțimii. "
        "Practic, întreaga eroare provine din măsurarea lungimii: fiecare metru greșit în L produce tan e metri de "
        "eroare în h. Marginea umbrei nu este netă, deoarece discul Soarelui are 0,53°; lățimea zonei de penumbră "
        "este aproximativ h · 0,0093 / sin²e. Am considerat două metode de măsurare a lungimii: poziția GPS a "
        "telefonului în vârful umbrei (eroare presupusă ±5 m) și ruleta sau telemetrul laser (eroare presupusă "
        "±0,3 m). Aceste valori trebuie verificate pe teren."
    ))
    para(doc, (
        "**Câte clădiri pot fi măsurate.** Vârful umbrei poate cădea pe o altă clădire sau în umbra ei. Am "
        "considerat o clădire măsurabilă dacă vârful umbrei unuia dintre colțuri se află pe marginea propriei "
        "umbre, linia de la colț la vârf nu traversează altă clădire, iar vârful nu cade pe altă clădire sau în "
        f"umbra ei. Am analizat {num(MEASURE['buildings_with_height'], 0)} de clădiri, cu înălțimea din OSM, "
        "3 m pe etaj sau, în lipsă, din GBA, la șase momente (ora României), cu poziția Soarelui calculată de "
        "aplicație. Copacii, mașinile și panta nu există în date, deci rezultatul este o limită superioară."
    ))
    para(doc, (
        "**Protocolul de validare propus.** Pentru verificarea pe teren am stabilit dinainte următorii pași: "
        "cel puțin 30 de clădiri, de la case cu 1–2 etaje la blocuri cu peste 10 etaje, alese înainte de "
        "măsurare; o înălțime de referință pentru fiecare, măsurată cu telemetrul laser sau cu drona; măsurarea "
        "umbrei la cel puțin trei ore diferite, cu GPS-ul telefonului și cu ruleta sau telemetrul; cel puțin doi "
        "observatori, care nu cunosc înălțimea de referință. Vom raporta eroarea medie, eroarea absolută medie, "
        "procentul de clădiri în ±3 m (un etaj) și variația erorii cu unghiul Soarelui, inclusiv măsurătorile "
        "eșuate."
    ))

    heading(doc, "3. REZULTATE")
    para(doc, (
        "**Evaluarea GBA.** Pentru clădirile joase, GBA este apropiat de înălțimile din OSM, dar eroarea crește "
        "rapid cu înălțimea și este aproape mereu negativă (Tabelul 1). Pentru cele "
        f"{GBA['tagged_consistent_with_levels']['n']} de clădiri la care înălțimea din OSM concordă cu numărul "
        f"de etaje, eroarea medie este {num(GBA['tagged_consistent_with_levels']['bias_m'])} m."
    ), keep=True)
    caption(doc, "Tabelul 1. Diferența GBA − OSM, după înălțimea înregistrată în OSM", keep=True)
    rows = [["Înălțime OSM", "Clădiri", "Eroare medie", "Eroare absolută medie", "În ±3 m"]]
    for key, label in [("0-10 m", "0–10 m"), ("10-20 m", "10–20 m"), ("20-40 m", "20–40 m")]:
        s = tag[key]
        rows.append([label, str(s["n"]), f"{num(s['bias_m'])} m", f"{num(s['mae_m'])} m", f"{num(s['within_3m_pct'], 0)}%"])
    table(doc, rows, [3.2, 2.0, 3.0, 4.0, 2.2])
    newer = GBA["unmatched_ways_newer_than_newest_matched_way"]
    para(doc, (
        "Figura 3 arată că aproape toate clădirile cu peste 20 m se află mult sub dreapta de egalitate. Am observat și că "
        f"GBA folosește o versiune mai veche a OSM: {num(newer['newer'], 0)} dintre cele "
        f"{num(newer['unmatched_ways'], 0)} de clădiri fără înălțime GBA au fost cartate după cea mai recentă "
        "clădire prezentă în GBA. Din același motiv, doar 88 dintre cele 271 de clădiri cu înălțime etichetată "
        "au putut fi comparate."
    ), keep=True)
    figure(doc, ROOT / "docs/research/gba-heights/gba-vs-osm-tag.png", 8.5)
    caption(doc, "Figura 3. Înălțimea GBA față de înălțimea etichetată în OSM; punctele pline sunt clădirile "
                 "la care înălțimea concordă cu numărul de etaje")
    para(doc, (
        "Numărul de etaje confirmă tendința (Figura 2). Mediana înălțimii GBA pe etaj scade de la "
        f"{num(lv['1-2 floors']['gba_m_per_floor_median'], 2)} m pentru clădirile cu 1–2 etaje la "
        f"{num(lv['5-8 floors']['gba_m_per_floor_median'], 2)} m pentru 5–8 etaje și "
        f"{num(lv['9-12 floors']['gba_m_per_floor_median'], 2)} m pentru 9–12 etaje. Doar "
        f"{num(lv['9-12 floors']['inside_engine_bounds_pct'])}% dintre clădirile cu 9–12 etaje au în GBA o "
        "înălțime în intervalul folosit de aplicație (2,5–3,5 m pe etaj, plus 3 m)."
    ), keep=True)
    figure(doc, ROOT / "docs/research/gba-heights/gba-vs-levels.png", 12.5)
    caption(doc, "Figura 2. Înălțimea GBA în funcție de numărul de etaje din OSM; liniile punctate arată 2,5 m "
                 "și 3,5 m pe etaj (plus 3 m)")
    para(doc, (
        "**Precizie și măsurabilitate.** Tabelul 2 prezintă, pentru fiecare moment, unghiul Soarelui, lungimea "
        "umbrei unei clădiri de 15 m, eroarea prevăzută a înălțimii pentru cele două metode de măsurare și "
        "procentul de clădiri cu vârful umbrei neobstrucționat."
    ), keep=True)
    caption(doc, "Tabelul 2. Eroarea prevăzută a înălțimii pentru o eroare a lungimii de ±5 m (GPS) și ±0,3 m "
                 "(telemetru) și procentul de clădiri măsurabile", keep=True)
    rows = [["Moment", "Unghiul Soarelui", "Umbra la 15 m", "Eroare GPS", "Eroare telemetru",
             "Măsurabile", "Măsurabile ≥ 20 m"]]
    for label, s in instants.items():
        t = math.tan(math.radians(s["elevation_deg"]))
        rows.append([label, f"{num(s['elevation_deg'])}°", f"{num(s['shadow_length_m_for_15m'])} m",
                     f"±{num(5 * t)} m", f"±{num(0.3 * t)} m", f"{num(s['measurable_pct'])}%",
                     f"{num(s['by_height_pct']['≥ 20 m'])}%"])
    table(doc, rows, [2.5, 2.2, 2.4, 2.1, 2.4, 2.2, 2.6])

    heading(doc, "4. DISCUȚII ȘI CONCLUZII")
    para(doc, (
        "GBA nu poate completa înălțimile lipsă din Constanța pentru blocurile înalte. Folosit în aplicație, ar "
        "scurta aproximativ la jumătate umbrele blocurilor cu 9–12 etaje, adică exact umbrele care acoperă "
        "trotuarele. Pentru clădirile sub 10 m, GBA rămâne o estimare utilizabilă."
    ))
    para(doc, (
        "Modelul erorilor arată că metoda umbrei poate fi precisă dacă lungimea este măsurată corect: cu ruleta sau "
        "telemetrul, eroarea prevăzută rămâne sub 1 m la toate momentele analizate. Cu GPS-ul telefonului, eroarea "
        f"este de ±{num(5 * math.tan(math.radians(oct_noon['elevation_deg'])))} m la amiază pe 27 octombrie, dar "
        "crește mult vara la amiază, când Soarele este sus. Prin urmare, aplicația trebuie să recomande ora "
        "măsurării. Analiza măsurabilității arată că, din punctul de vedere al clădirilor vecine, "
        f"{num(min(measurable_oct), 0)}–{num(max(measurable_oct), 0)}% dintre clădiri pot fi măsurate toamna și "
        f"{num(min(measurable_jun), 0)}–{num(max(measurable_jun), 0)}% vara. Pentru clădirile de cel puțin 20 m, "
        f"procentul scade la {num(min(tall_oct), 0)}–{num(max(tall_oct), 0)}% toamna, deoarece umbrele lor lungi "
        "ajung mai des pe alte clădiri."
    ))
    para(doc, (
        "Din aceste rezultate rezultă câteva reguli practice pentru aplicație. Măsurătorile cu GPS ar trebui făcute "
        "când Soarele are între aproximativ 20° și 40°: mai sus, eroarea crește rapid; mai jos, umbrele devin "
        "foarte lungi, ajung pe alte clădiri, iar penumbra se lățește (aproape 1 m pentru un bloc de 30 m la 33°). "
        "Utilizatorul trebuie să marcheze mijlocul penumbrei și să aleagă un colț al acoperișului, nu camera "
        "liftului de pe terasă, care aruncă umbra cea mai lungă. Mai multe măsurători independente ale aceleiași "
        "clădiri, făcute la ore diferite sau de persoane diferite, pot fi combinate printr-o medie ponderată cu "
        "precizia fiecărei metode."
    ))
    para(doc, (
        "Ipoteza noastră este susținută de analiză, dar nu este încă confirmată experimental: măsurătorile pe "
        "teren nu au fost efectuate. Studiul are și alte limite. Referințele din OSM sunt introduse de voluntari "
        "și conțin erori evidente; analiza măsurabilității ignoră copacii, mașinile și panta; am folosit o singură "
        "poziție a Soarelui pentru întreg orașul."
    ))
    para(doc, (
        "**Concluzii:** (1) 87,8% dintre clădirile din Constanța nu au înălțime în OSM, iar GBA subestimează "
        "sistematic blocurile înalte; (2) metoda umbrei depinde aproape numai de măsurarea lungimii și trebuie "
        "aplicată cu Soarele jos; (3) majoritatea clădirilor au cel puțin un colț a cărui umbră poate fi măsurată. "
        "Continuăm cu măsurători pe teren față de înălțimi de referință (telemetru și dronă), cu modul „Măsoară "
        "clădirea” în aplicație și cu o bază de date comună a înălțimilor măsurate de utilizatori."
    ))

    heading(doc, "MULȚUMIRI")
    para(doc, "Mulțumim doamnei profesoare Ramona Rădulescu pentru îndrumare și contributorilor OpenStreetMap pentru datele deschise.")

    heading(doc, "BIBLIOGRAFIE")
    for ref in [
        "[1] Contributorii OpenStreetMap, extras pentru România (Geofabrik), download.geofabrik.de/europe/romania.html, "
        "accesat la 25.10.2026. Licență ODbL 1.0.",
        "[2] NOAA Global Monitoring Laboratory, Solar Calculation Details, gml.noaa.gov/grad/solcalc/calcdetails.html, "
        "accesat la 27.10.2026.",
        "[3] Zhu, X. X., Chen, S., Zhang, F., Shi, Y., Wang, Y., „GlobalBuildingAtlas: an open global and complete "
        "dataset of building polygons, heights and LoD1 3D models”, Earth System Science Data, nr. 17(12), 2025, "
        "pp. 6647–6668.",
        "[4] Chaudhry, Qureshi, Jabbar, Taj, „Building Height Estimation Using Shadow Length in Satellite Imagery”, "
        "arXiv:2411.09411, 2024.",
        "[5] Meeus, J., Astronomical Algorithms, ed. a 2-a, Willmann-Bell, 1998.",
        "[6] Reda, I., Andreas, A., „Solar position algorithm for solar radiation applications”, Solar Energy, "
        "nr. 76(5), 2004, pp. 577–589.",
        "[7] Che, Y. și colab., „3D-GloBFP: the first global three-dimensional building footprint dataset”, "
        "Earth System Science Data, nr. 16(11), 2024, essd.copernicus.org/articles/16/5357/2024, accesat la 27.10.2026.",
        "[8] Milojevic-Dupont, N. și colab., „EUBUCCO v0.1: European building stock characteristics in a common "
        "and open database for 200+ million individual buildings”, Scientific Data, nr. 10, 2023.",
    ]:
        para(doc, ref, align=WD_ALIGN_PARAGRAPH.LEFT, size=10, after=2, spacing=1.0)

    output.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(output))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    build(Path(sys.argv[1]), Path(sys.argv[2]))
