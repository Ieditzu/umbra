import json, math, textwrap
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.patches import Polygon, Arc, Rectangle
import numpy as np

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
s=json.loads((ROOT/'docs/research/gba-heights/summary.json').read_text())
m=json.loads((ROOT/'docs/paper/measurability.json').read_text())
font='/usr/share/fonts/noto/NotoSans-Regular.ttf'
fm.fontManager.addfont(font);fm.fontManager.addfont('/usr/share/fonts/noto/NotoSans-Bold.ttf')
plt.rcParams.update({'font.family':['Noto Sans','DejaVu Sans'],'svg.fonttype':'path','font.size':13,'axes.spines.top':False,'axes.spines.right':False,'axes.labelcolor':'#321B40','text.color':'#321B40','xtick.color':'#321B40','ytick.color':'#321B40','axes.edgecolor':'#A69BAF','axes.titleweight':'bold','axes.titlesize':15,'axes.labelsize':13,'xtick.labelsize':12,'ytick.labelsize':12,'savefig.facecolor':'#FFFFFF','pdf.fonttype':42})
INK='#321B40';COPPER='#B84419';MUTED='#625A6A';LILAC='#AF9ABF';PALE='#F1EDF5';GRID='#E5E0E9';WHITE='#FFFFFF'
fig=plt.figure(figsize=(16,24),facecolor=WHITE)
def text(x,y,txt,size=14,bold=False,color=INK,width=None,ha='left',linespacing=1.35):
 if width:
  txt='\n'.join(textwrap.fill(p,width=width,break_long_words=False,break_on_hyphens=False) if p else '' for p in txt.split('\n'))
 return fig.text(x/16,1-y/24,txt,fontsize=size,fontweight='bold' if bold else 'normal',color=color,va='top',ha=ha,linespacing=linespacing)
def rule(x,y,w,color=GRID,lw=1):
 fig.add_artist(plt.Line2D([x/16,(x+w)/16],[1-y/24]*2,transform=fig.transFigure,color=color,lw=lw))
def band(x,y,w,label):
 fig.patches.append(Rectangle((x/16,1-(y+.36)/24),w/16,.36/24,transform=fig.transFigure,facecolor=INK,edgecolor='none'))
 text(x+.12,y+.045,label,14,True,WHITE)
def axis(x,y,w,h):return fig.add_axes([x/16,1-(y+h)/24,w/16,h/24])
def clean(ax):ax.set_axisbelow(True);ax.grid(axis='y',color=GRID,lw=.7);ax.spines['left'].set_visible(False);ax.tick_params(length=0,pad=7)
def ro(v,n=1):return f'{v:.{n}f}'.replace('.',',')

# Larger architectural masthead inspired by the earlier 3D poster.
text(.6,.24,'RoSEF 2026  /  TEHNOLOGIA INFORMAȚIEI ȘI COMUNICAȚIILOR',12,True,INK)
text(.48,.44,'UMBRA',94,True,INK)
text(9.45,.70,'Trasee umbrite.\nÎnălțimi din umbre.',23,True,COPPER)
text(9.45,1.84,'Aplicație mobilă + cercetare\nConstanța',13,False,MUTED)
text(.65,2.22,'Eduard-Mihai Perjoc · Eduard-Andrei Haivas · Cezar-Ștefan Manea',15,True,INK)
text(.65,2.56,'Clasa a X-a · Constanța     |     Coordonator: prof. Ramona Rădulescu',12,False,MUTED)
rule(.6,2.91,14.8,INK,2.5)

# Lead with the actual application, alongside the research results.
band(.6,3.05,4.65,'01  CE FACE APLICAȚIA UMBRA')
text(.65,3.57,'Pe unde mergi cu mai puțin soare?',17,True,width=38)
text(.65,4.30,'Alegi plecarea, destinația, ora și ocolul maxim acceptat.',13,width=44)
text(.65,4.96,'Serverul modelează Soarele și umbrele și compară traseele. Telefonul afișează harta și ghidarea GPS.',13,width=44)
text(.65,5.84,'«Măsoară clădirea»: GPS, ruletă/laser sau fotografie din dronă → înălțime și incertitudine.',13,True,width=44)
text(.65,6.57,'Înălțimi confirmate → umbre și trasee.\nSalvare locală; partajare opțională.',11.5,color=COPPER)
band(.6,7.12,4.65,'02  PRINCIPIU ȘI METODĂ')
# Dedicated 3D illustration; text remains separate vector labels.
from PIL import Image
a=axis(.64,7.55,4.65,2.20)
a.imshow(Image.open(OUT/'building-3d.png'));a.axis('off')
a.text(.13,.49,'h',transform=a.transAxes,fontsize=17,fontweight='bold');a.text(.59,.025,'L',transform=a.transAxes,fontsize=17,fontweight='bold');a.text(.76,.25,'e',transform=a.transAxes,fontsize=17,fontweight='bold')
text(.72,9.88,'h = L · tan(e)',25,True)
text(.72,10.43,'h: înălțime · L: umbră pe sol · e: elevația Soarelui',11.5)

# Upper right data coverage chart.
band(5.75,3.05,9.65,'03  DATE ȘI REZULTATE')
text(5.80,3.57,'Fig. 1  Datele de înălțime lipsesc pentru 87,8% din clădiri',16,True)
a=axis(5.95,4.08,9.0,1.12)
vals=[271,5913,45159,85];colors=[INK,LILAC,COPPER,'#D2CBD7'];left=0
for v,c in zip(vals,colors):a.barh([0],[v],left=left,color=c,height=.7);left+=v
a.set_xlim(0,51428);a.axis('off');a.text(271+5913+45159/2,0,'45.159 fără înălțime sau etaje',ha='center',va='center',color=WHITE,fontsize=16,fontweight='bold')
text(5.95,5.20,'271 înălțimi OSM  ·  5.913 doar etaje  ·  85 alte cazuri',13)
text(5.95,5.61,'Instantaneu OSM: 51.428 clădiri; GBA asociat la 40.658 (79,1%).',13,color=MUTED)
text(5.80,6.26,'Fig. 2  Înălțimea GBA implicită pe etaj scade la blocurile înalte',16,True)
a=axis(6.48,6.93,8.45,2.48)
keys=['1-2 floors','3-4 floors','5-8 floors','9-12 floors'];vals=[s['levels_by_count'][k]['gba_m_per_floor_median'] for k in keys]
bars=a.bar(range(4),vals,color=[LILAC,LILAC,LILAC,COPPER],width=.58)
a.axhspan(2.5,3.5,color=INK,alpha=.055);a.axhline(2.5,color=MUTED,ls='--',lw=1);a.axhline(3.5,color=MUTED,ls='--',lw=1)
a.set_xticks(range(4),[f'{lab}\nn = {s["levels_by_count"][k]["n"]:,}'.replace(',','.') for lab,k in zip(['1–2 etaje','3–4 etaje','5–8 etaje','9–12 etaje'],keys)])
a.set_ylim(0,4.65);a.set_yticks([0,1,2,3,4]);a.set_ylabel('Mediana GBA / etaje (m)');clean(a)
for bar,v in zip(bars,vals):a.text(bar.get_x()+bar.get_width()/2,v+.10,ro(v,2),ha='center',fontsize=15,fontweight='bold',color=INK)
text(5.95,9.91,'Banda 2,5–3,5 m/etaj este o ipoteză orientativă, nu o referință măsurată.',12.5,color=MUTED)
text(5.95,10.27,'n total = 4.925; graficul arată 4.907 clădiri cu 1–12 etaje.',12.5,color=MUTED)

# Mid two large result panels.
band(.6,11.03,7.1,'04  MODELUL INCERTITUDINII')
band(8.2,11.03,7.2,'05  FEZABILITATE GEOMETRICĂ')
text(.65,11.57,'Fig. 3  Eroarea lungimii se amplifică la Soare înalt',15,True)
text(8.25,11.57,'Fig. 4  Blocurile înalte au mai multe obstacole',15,True)
a=axis(1.35,12.18,5.98,3.0);e=np.linspace(10,75,200)
a.plot(e,5*np.tan(np.deg2rad(e)),color=COPPER,lw=2.8,label='GPS: δL = 5 m (ipoteză)')
a.plot(e,.3*np.tan(np.deg2rad(e)),color=INK,lw=2.8,label='Telemetru: δL = 0,3 m (ipoteză)')
for elev in [32.9,69.2]:a.scatter([elev],[5*math.tan(math.radians(elev))],color=COPPER,s=40,zorder=5)
a.annotate('27 oct, 12:00\n≈ 3,2 m',(32.9,5*math.tan(math.radians(32.9))),xytext=(17,6.3),fontsize=11.5,arrowprops=dict(arrowstyle='-',color=MUTED))
a.annotate('21 iun, 13:00\n≈ 13,2 m',(69.2,5*math.tan(math.radians(69.2))),xytext=(40,15.1),fontsize=11.5,arrowprops=dict(arrowstyle='-',color=MUTED))
a.set_xlim(10,75);a.set_ylim(0,19);a.set_xlabel('Elevația Soarelui e (grade)');a.set_ylabel('Eroare modelată δh (m)');clean(a);a.legend(loc='upper left',fontsize=10,frameon=False)
text(.78,15.73,'δh ≈ tan(e) · δL',20,True)
text(.78,16.16,'Graficul izolează eroarea lungimii. Nu reprezintă măsurători de precizie. Panta, penumbra și erorile de asociere nu sunt incluse.',13,width=65,color=MUTED)
a=axis(8.97,12.18,6.0,3.0)
inst=list(m['instants'].items());x=np.arange(6);v=[v['measurable_pct'] for _,v in inst];tall=[v['by_height_pct']['≥ 20 m'] for _,v in inst]
a.bar(x-.18,v,.34,color=LILAC,label='Toate clădirile (n = 38.913)');a.bar(x+.18,tall,.34,color=INK,label='Înălțime ≥20 m (n = 805)')
a.set_xticks(x,['27 oct\n10:00','27 oct\n12:00','27 oct\n14:00','21 iun\n09:00','21 iun\n13:00','21 iun\n17:00']);a.tick_params(axis='x',labelsize=10.5)
a.set_ylim(0,110);a.set_ylabel('Vârf de umbră neobstrucționat (%)');clean(a);a.axvline(2.5,color=MUTED,ls=':',lw=1)
for xx,vv in zip(x,v):a.text(xx-.18,vv+1.3,ro(vv),ha='center',fontsize=9.8)
a.legend(loc='upper left',fontsize=10.5,frameon=False,bbox_to_anchor=(-.04,1.12))
text(8.37,15.73,'Toamna: 85–90% total; 60–71% la ≥20 m.',17,True)
text(8.37,16.16,'Limită superioară în model: ignoră arborii, mașinile și accesul fizic. Înălțimi folosite: 261 OSM, 5.905 din etaje, 32.747 GBA.',13,width=65,color=MUTED)

# Table and reproducibility.
band(.6,17.42,7.1,'06  COMPARAȚIA GBA CU OSM')
band(8.2,17.42,7.2,'07  CERCETAREA SUSȚINE APLICAȚIA')
text(.65,17.95,'Tabelul 1  Diferențe GBA − înălțime etichetată OSM',14,True)
a=axis(.72,18.42,6.8,1.42);a.axis('off')
rows=[]
for key in ['0-10 m','10-20 m','20-40 m']:
 z=s['tagged_by_height'][key];rows.append([key.replace('-','–'),str(z['n']),ro(z['bias_m']),ro(z['mae_m']),ro(z['within_3m_pct'])+'%'])
tab=a.table(cellText=rows,colLabels=['OSM','n','Bias (m)','MAE (m)','În ±3 m'],loc='center',cellLoc='center',bbox=[0,0,1,1]);tab.auto_set_font_size(False);tab.set_fontsize(12.5)
for (i,j),cell in tab.get_celld().items():cell.set_edgecolor(WHITE);cell.set_linewidth(2);cell.set_facecolor(INK if i==0 else (PALE if i%2 else '#FAF8FC'));cell.set_text_props(color=WHITE if i==0 else INK,weight='bold' if i==0 else 'normal')
text(.78,20.06,'Referințe OSM, neverificate pe teren. Total n = 88; 5 cazuri ≥40 m sunt omise aici și includ etichete OSM suspecte.',12.5,width=67,color=MUTED)
text(.78,20.64,'Subset concordant cu etajele: n = 37; bias −5,0 m; MAE 6,1 m. Aceste diferențe nu stabilesc precizia absolută a GBA.',12.5,width=67,color=MUTED)
text(8.35,17.95,'Întrebarea științifică',14,True)
text(8.35,18.28,'Cât de precis putem estima înălțimea unei clădiri din umbră și cum alegem momentul măsurării?',14,True,width=61)
text(8.35,19.28,'De la măsurare la recomandare',14,True,COPPER)
text(8.35,19.65,'Lungimea umbrei + Soarele → înălțime estimată → verificări și confirmare în aplicație → actualizarea modelului de umbrire și a traseelor.',13,width=65)
text(8.35,20.48,'Software implementat. Precizia fizică și câștigul real pe trasee necesită încă validare independentă pe teren.',13,True,width=65)

# Evidence-status banner / references / institutional affiliations.
fig.patches.append(Rectangle((.6/16,1-22.02/24),14.8/16,.48/24,transform=fig.transFigure,facecolor=COPPER))
text(.78,21.65,'STADIUL DOVEZILOR: ANALIZĂ DE DATE + SIMULARE. FĂRĂ VALIDARE PE TEREN.',15,True,WHITE)
text(.65,22.24,'Surse și reproducere',12.5,True)
text(.65,22.54,'[1] OpenStreetMap contributors, extras 25.10.2026, ODbL.  [2] Zhu et al., GlobalBuildingAtlas, ESSD 17, 6647–6668 (2025).',10.5)
text(.65,22.83,'[3] NOAA/Meeus, geometrie solară.  [4] Reda & Andreas, Solar Energy 76, 577–589 (2004).  Cod: github.com/Ieditzu/umbra',10.5)
rule(.65,23.15,14.7)
text(.65,23.30,'Liceul Tehnologic de Marină · Liceul Internațional de Informatică Constanța',10.5)
text(.65,23.55,'Liceul Tehnologic de Electrotehnică și Telecomunicații · Coordonator: prof. Ramona Rădulescu',10.5)
text(15.35,23.55,'UMBRA / 2026',10.5,True,ha='right')
fig.savefig(OUT/'umbra-poster.svg',format='svg')
svg_path=OUT/'umbra-poster.svg'
svg_path.write_text('\n'.join(line.rstrip() for line in svg_path.read_text().splitlines())+'\n')
fig.savefig(OUT/'umbra-poster-preview.png',dpi=150)
# Scale the complete vector page and its content to the competition print size.
from io import BytesIO
from pypdf import PdfReader, PdfWriter
buffer=BytesIO()
fig.savefig(buffer,format='pdf',metadata={'Title':'UMBRA — poster științific RoSEF 2026','Author':'Eduard-Mihai Perjoc; Eduard-Andrei Haivas; Cezar-Ștefan Manea'})
buffer.seek(0)
reader=PdfReader(buffer)
page=reader.pages[0]
page.scale_to(800/25.4*72,1200/25.4*72)
writer=PdfWriter();writer.add_page(page)
writer.add_metadata({'/Title':'UMBRA — poster științific RoSEF 2026','/Author':'Eduard-Mihai Perjoc; Eduard-Andrei Haivas; Cezar-Ștefan Manea'})
with (OUT/'umbra-poster-print.pdf').open('wb') as f:writer.write(f)
print('Saved print PDF (800 × 1200 mm), SVG source and PNG preview.')
