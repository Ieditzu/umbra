from pathlib import Path
import re, math
from xml.sax.saxutils import escape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.graphics.shapes import Drawing, Rect, Line, Polygon, String, Circle, Wedge

ROOT=Path('/Users/maneacezar/Documents/GitHub/umbra')
OUT=ROOT/'output/research/UMBRA_SmartRoute_Studiu_Stiintific_RoSEF_2026_Revizuit.pdf'
fontdir=Path('/System/Library/Fonts/Supplemental')
for name,fn in [('Body','Times New Roman.ttf'),('Bold','Times New Roman Bold.ttf'),('Italic','Times New Roman Italic.ttf'),('Sans','Arial.ttf'),('SansBold','Arial Bold.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(fontdir/fn)))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='Bold',italic='Italic',boldItalic='Bold')
W=495.27
ink=colors.HexColor('#19232b'); accent=colors.HexColor('#304c57'); pale=colors.HexColor('#edf2f3')
body=ParagraphStyle('body',fontName='Body',fontSize=10.8,leading=13.6,alignment=TA_JUSTIFY,spaceAfter=6,allowWidows=0,allowOrphans=0,textColor=colors.black)
h1=ParagraphStyle('h1',parent=body,fontName='Bold',fontSize=13.5,leading=16.3,spaceBefore=12,spaceAfter=7,alignment=TA_LEFT,keepWithNext=True)
h2=ParagraphStyle('h2',parent=body,fontName='Bold',fontSize=11.5,leading=14,spaceBefore=9,spaceAfter=6,alignment=TA_LEFT,keepWithNext=True)
title=ParagraphStyle('title',parent=h1,fontSize=20,leading=24,spaceBefore=0,spaceAfter=6)
subtitle=ParagraphStyle('subtitle',parent=body,fontName='Bold',fontSize=13,leading=16,spaceAfter=10,alignment=TA_LEFT)
caption=ParagraphStyle('caption',parent=body,fontName='Italic',fontSize=9,leading=11,spaceAfter=9,alignment=TA_LEFT)
refstyle=ParagraphStyle('reference',parent=body,fontSize=9,leading=11.3,spaceAfter=6,alignment=TA_LEFT,splitLongWords=True)
code=ParagraphStyle('code',parent=body,fontName='Sans',fontSize=8.4,leading=11,spaceAfter=1,alignment=TA_LEFT,leftIndent=10)
eqstyle=ParagraphStyle('equation',parent=body,fontSize=12,leading=20,alignment=TA_CENTER,spaceBefore=5,spaceAfter=8)
cellstyle=ParagraphStyle('cell',parent=body,fontSize=8.3,leading=10.2,spaceAfter=0,alignment=TA_LEFT)

def fmt(s):
    s=escape(s)
    for old,new in {'₀':'0','₁':'1','₂':'2','₃':'3','ₖ':'k'}.items():
        s=s.replace(old,'<sub>'+new+'</sub>')
    for token,label in [('e_bar_e','e<sub>medie,e</sub>'),('E_bar','E<sub>medie</sub>'),('E_medie','E<sub>medie</sub>'),('C_nom','C<sub>nom</sub>'),('H_nom','H<sub>nom</sub>'),('E_metodă','E<sub>metodă</sub>'),('T_metodă','T<sub>metodă</sub>'),('T_min','T<sub>min</sub>'),('E_est','E<sub>est</sub>'),('E_ref','E<sub>ref</sub>'),('E_obs','E<sub>obs</sub>'),('Δ_BC','Δ<sub>BC</sub>'),('C_R','C<sub>R</sub>'),('E_A','E<sub>A</sub>'),('T_A','T<sub>A</sub>'),('E_k','E<sub>k</sub>'),('x_R','x<sub>R</sub>'),('l_e','l<sub>e</sub>'),('τ_e','τ<sub>e</sub>'),('w_e','w<sub>e</sub>'),('u_e','u<sub>e</sub>')]:
        s=s.replace(token,label)
    s=re.sub(r'(https?://\S+)',lambda m:m.group().replace('/','/\u200b').replace('-','-\u200b'),s)
    return s

def text(d,x,y,t,size=9,font='Sans',anchor='start',color=ink):
    d.add(String(x,y,t,fontName=font,fontSize=size,textAnchor=anchor,fillColor=color))

def arrow(d,x1,y1,x2,y2,color=accent):
    d.add(Line(x1,y1,x2,y2,strokeColor=color,strokeWidth=1))
    a=math.atan2(y2-y1,x2-x1);r=5
    pts=[x2,y2,x2-r*math.cos(a-.5),y2-r*math.sin(a-.5),x2-r*math.cos(a+.5),y2-r*math.sin(a+.5)]
    d.add(Polygon(pts,fillColor=color,strokeColor=color))

def shadow():
    d=Drawing(W,210)
    d.add(Rect(120,35,60,105,fillColor=pale,strokeColor=accent))
    d.add(Line(35,35,465,35,strokeColor=ink,strokeWidth=1))
    d.add(Line(180,35,420,35,strokeColor=accent,strokeWidth=5))
    d.add(Circle(68,190,10,fillColor=colors.HexColor('#efdca1'),strokeColor=ink))
    text(d,88,187,'Soare',9)
    arrow(d,85,182,420,35)
    d.add(Line(180,140,420,35,strokeColor=ink,strokeWidth=1))
    arrow(d,105,35,105,140);arrow(d,105,140,105,35)
    text(d,95,86,'H',11,anchor='end')
    arrow(d,180,17,420,17);arrow(d,420,17,180,17)
    text(d,300,3,'L = H / tan(α)',10,anchor='middle')
    text(d,150,85,'Clădire',9,anchor='middle')
    text(d,290,45,'Umbră pe sol',9,anchor='middle')
    text(d,426,46,'α',12)
    d.add(Line(420,35,395,35,strokeColor=ink))
    d.add(Line(420,35,397,45,strokeColor=ink))
    text(d,220,178,'Raze paralele • teren plan • fără scară',8)
    return d

def pipeline():
    d=Drawing(W,192)
    labels=[['Date OSM','rețea și clădiri'],['Model geometric','3D simplificat'],['Poziția Soarelui','coordonate și timp'],['Calculul umbrelor','poligoane pe sol'],['Scenarii de','incertitudine'],['Optimizarea','traseelor A B C'],['Comparația','rezultatelor']]
    pts=[(2,125),(130,125),(258,125),(386,125),(386,45),(258,45),(130,45)]
    for i,((x,y),ls) in enumerate(zip(pts,labels)):
        d.add(Rect(x,y,107,47,fillColor=pale,strokeColor=accent,strokeWidth=.7))
        text(d,x+53.5,y+28,ls[0],8.4,'SansBold','middle')
        text(d,x+53.5,y+13,ls[1],8.1,'Sans','middle')
    for i in range(3):arrow(d,pts[i][0]+108,148,pts[i+1][0]-2,148)
    arrow(d,439,124,439,94)
    arrow(d,385,68,367,68);arrow(d,257,68,239,68)
    d.add(Line(439,45,439,26,strokeColor=accent,strokeWidth=.7))
    d.add(Line(439,26,53,26,strokeColor=accent,strokeWidth=.7))
    text(d,245,8,'Scenariile reiau calculul umbrelor; evaluarea folosește o referință separată.',8,anchor='middle')
    return d

def table(rows):
    cells=[x.strip().strip('|').split('|') for x in rows]
    n=len(cells[0])
    if n==3: widths=[W*.25,W*.36,W*.39]
    elif n==4:widths=[W*.18,W*.23,W*.29,W*.30]
    elif n==5:widths=[W*.23,W*.18,W*.18,W*.19,W*.22]
    else:widths=[W/n]*n
    data=[]
    for i,row in enumerate(cells):
        data.append([Paragraph(('<b>'+fmt(v.strip())+'</b>') if i==0 else fmt(v.strip()),cellstyle) for v in row])
    t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),pale),('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#8d999e')),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    return t

source=(ROOT/'tmp/research/paper-revised.md').read_text()
lines=source.splitlines();story=[];i=0
equations={
'L = H / tan(α)':'L = H / tan(α)',
'd = −H cot(α) × (sin A, cos A)':'d = −H cot(α) · (sin A, cos A)',
'E(R, t₀, H) = ∫₀ᵀ [1 − s(x_R(u), t₀ + u, H)] du':'E(R, t<sub>0</sub>, H) = ∫<sub>0</sub><super>T</super> [1 − s(x<sub>R</sub>(u), t<sub>0</sub> + u, H)] du',
'C_nom(R) = T(R) + λ E(R, t₀, H_nom)':'C<sub>nom</sub>(R) = T(R) + λ · E(R, t<sub>0</sub>, H<sub>nom</sub>)',
'U(R) = sqrt{ Σₖ [E_k(R) − E_bar(R)]² / (K − 1) }':'U(R) = √{ [Σ<sub>k=1</sub><super>K</super> (E<sub>k</sub>(R) − E<sub>medie</sub>(R))²] / (K − 1) }',
'C_R(R) = T(R) + λ E_bar(R) + μ U(R)':'C<sub>R</sub>(R) = T(R) + λ · E<sub>medie</sub>(R) + μ · U(R)'}
while i<len(lines):
    line=lines[i].strip();i+=1
    if not line:continue
    if line.startswith('|'):
        rows=[line]
        while i<len(lines) and lines[i].startswith('|'):rows.append(lines[i]);i+=1
        story.extend([Spacer(1,3),table(rows),Spacer(1,9)]);continue
    if line.startswith('FIG '):
        drawing=shadow() if line=='FIG SHADOW' else pipeline()
        while i<len(lines) and not lines[i].strip():i+=1
        cap=lines[i].strip();i+=1
        story.append(KeepTogether([Spacer(1,5),drawing,Paragraph(fmt(cap),caption)]));continue
    if line.startswith('EQ '):
        expression=line[3:];story.append(Paragraph(equations.get(expression,fmt(expression)),eqstyle));continue
    if line.startswith('CODE '):story.append(Paragraph(escape(line[5:]),code));continue
    if line.startswith('# '):story.append(Paragraph(fmt(line[2:]),title));continue
    if line.startswith('## Optimizarea'):story.append(Paragraph(fmt(line[3:]),subtitle));continue
    if line.startswith('## '):story.append(Paragraph(fmt(line[3:]),h1));continue
    if line.startswith('### '):story.append(Paragraph(fmt(line[4:]),h2));continue
    st=refstyle if re.match(r'^\[\d+\]',line) else body
    story.append(Paragraph(fmt(line),st))

def chrome(c,doc):
    c.saveState();c.setFillColor(colors.HexColor('#53616a'));c.setFont('Sans',8)
    c.drawString(50,816,'UMBRA SmartRoute  |  Studiu științific  |  RoSEF 2026  |  Ediție revizuită')
    c.setStrokeColor(colors.HexColor('#cbd3d7'));c.setLineWidth(.35);c.line(50,807,545,807)
    c.setFont('Sans',8);c.drawString(50,27,'Fundamentare și protocol experimental • 24 octombrie 2026')
    c.drawRightString(545,27,str(doc.page));c.restoreState()

doc=SimpleDocTemplate(str(OUT),pagesize=(595.27,841.89),rightMargin=50,leftMargin=50,topMargin=49,bottomMargin=46,title='UMBRA SmartRoute — Optimizarea traseelor pietonale umbrite în condiții de incertitudine a înălțimilor clădirilor',author='',subject='Studiu revizuit și protocol experimental')
doc.build(story,onFirstPage=chrome,onLaterPages=chrome)
print(OUT)
