// Editable poster: text, bars, axes, lines, tables and backgrounds are individual shapes.
const pptxgen = require('pptxgenjs');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
const stats = JSON.parse(fs.readFileSync(path.join(root, 'docs/research/gba-heights/summary.json')));
const sim = JSON.parse(fs.readFileSync(path.join(root, 'docs/paper/measurability.json')));
const pptx = new pptxgen();
pptx.defineLayout({name:'POSTER', width:16, height:24});
pptx.layout='POSTER'; pptx.author='Echipa Umbra'; pptx.title='UMBRA — poster științific';
const s = pptx.addSlide(); s.background={color:'FFFFFF'};
const C={ink:'321B40',copper:'B84419',muted:'625A6A',lilac:'AF9ABF',pale:'F1EDF5',grid:'DDD7E2',white:'FFFFFF'};
const rect=(x,y,w,h,color)=>s.addShape(pptx.ShapeType.rect,{x,y,w,h,line:{color,transparency:100},fill:{color}});
const line=(x1,y1,x2,y2,color=C.grid,width=0.7)=>s.addShape(pptx.ShapeType.line,{x:Math.min(x1,x2),y:Math.min(y1,y2),w:Math.abs(x2-x1)||0.001,h:Math.abs(y2-y1)||0.001,flipV:(y2-y1)*(x2-x1)<0,line:{color,width}});
const text=(t,x,y,w,h,size=13,opt={})=>s.addText(String(t),{x,y,w,h,fontFace:'Noto Sans',fontSize:size,color:opt.color||C.ink,bold:!!opt.bold,margin:0,breakLine:false,align:opt.align||'left',valign:'mid',fit:'shrink',...opt});
const band=(x,y,w,label)=>{rect(x,y,w,.34,C.ink);text(label,x+.12,y+.035,w-.2,.24,13,{bold:true,color:C.white});};
const fmt=(v,n=1)=>Number(v).toFixed(n).replace('.',',');

text('RoSEF 2026  /  TEHNOLOGIA INFORMAȚIEI ȘI COMUNICAȚIILOR',.6,.23,10,.25,12,{bold:true});
text('UMBRA',.55,.48,8.5,1.30,82,{bold:true});
text('Trasee umbrite.\nÎnălțimi din umbre.',9.45,.64,5.8,1.05,23,{bold:true,color:C.copper});
text('Aplicație mobilă + cercetare  /  Constanța',9.45,1.77,5.9,.28,12,{color:C.muted});
text('Eduard-Mihai Perjoc · Eduard-Andrei Haivas · Cezar-Ștefan Manea',.65,2.14,14.6,.3,15,{bold:true});
text('Clasa a X-a · Constanța    |    Coordonator: prof. Ramona Rădulescu',.65,2.53,14,.25,12,{color:C.muted});
line(.6,2.91,15.4,2.91,C.ink,1.5);

band(.6,3.05,4.65,'01  CE FACE APLICAȚIA UMBRA');
text('Pe unde mergi cu mai puțin soare?',.65,3.55,4.5,.40,16,{bold:true});
text('Alegi plecarea, destinația, ora și ocolul maxim acceptat.',.65,4.18,4.45,.62,13);
text('Serverul modelează Soarele și umbrele și compară traseele. Telefonul afișează harta și ghidarea GPS.',.65,4.92,4.45,.76,13);
text('„Măsoară clădirea”: GPS, ruletă/laser sau fotografie din dronă → înălțime și incertitudine.',.65,5.78,4.45,.70,12,{bold:true});
text('Înălțimi confirmate → umbre și trasee.\nSalvare locală; partajare opțională.',.65,6.57,4.5,.43,11,{color:C.copper});
band(.6,7.12,4.65,'02  PRINCIPIU ȘI METODĂ');
s.addImage({path:path.join(__dirname,'building-3d.png'),x:.70,y:7.56,w:4.25,h:2.12});
text('h',1.15,8.58,.3,.3,16,{bold:true}); text('L',3.05,9.40,.3,.3,16,{bold:true}); text('e',3.83,8.98,.3,.3,16,{bold:true});
text('h = L · tan(e)',.72,9.88,4.3,.45,25,{bold:true});
text('h: înălțime · L: lungimea umbrei · e: elevația Soarelui',.72,10.42,4.45,.30,11);

band(5.75,3.05,9.65,'03  DATE ȘI REZULTATE');
text('Fig. 1  Datele de înălțime lipsesc pentru 87,8% din clădiri',5.8,3.55,9.5,.38,15,{bold:true});
let bx=5.95, by=4.18, bw=8.9, bh=.52;
const chunks=[[271,C.ink],[5913,C.lilac],[45159,C.copper],[85,'D2CBD7']];
for(const [v,c] of chunks){const w=bw*v/51428;rect(bx,by,w,bh,c);bx+=w;}
text('45.159 fără înălțime sau etaje',8.5,4.25,5.5,.32,14,{color:C.white,bold:true,align:'center'});
text('271 înălțimi OSM · 5.913 doar etaje · 85 alte cazuri',5.95,4.90,9,.3,12);
text('Instantaneu OSM Constanța: 51.428 clădiri; GBA asociat la 40.658 (79,1%).',5.95,5.34,9,.3,12,{color:C.muted});
text('Fig. 2  Înălțimea GBA pe etaj scade la blocurile înalte',5.8,6.10,9.5,.35,15,{bold:true});
const lv=['1-2 floors','3-4 floors','5-8 floors','9-12 floors'].map(k=>stats.levels_by_count[k]);
const label=['1–2','3–4','5–8','9–12']; const gx=6.55, gy=6.88, gw=8.3, gh=2.45;
for(let n=0;n<=4;n++){let y=gy+gh-gh*n/4;line(gx,y,gx+gw,y);text(n,gx-.35,y-.12,.26,.22,10,{align:'right',color:C.muted});}
lv.forEach((v,i)=>{let x=gx+.58+i*1.98,h=gh*v.gba_m_per_floor_median/4;rect(x,gy+gh-h,.90,h,i===3?C.copper:C.lilac);text(fmt(v.gba_m_per_floor_median,2),x,gy+gh-h-.30,.9,.24,12,{bold:true,align:'center'});text(label[i]+' etaje\nn = '+v.n.toLocaleString('ro-RO'),x-.25,9.40,1.4,.48,10,{align:'center'});});
text('Mediana înălțimii GBA / etaje (m)',6.55,9.98,8.2,.25,11,{color:C.muted});
text('n = 4.925 asocieri; graficul prezintă 4.907 clădiri cu 1–12 etaje.',6.55,10.29,8.4,.3,11,{color:C.muted});

band(.6,11.05,7.1,'04  MODELUL INCERTITUDINII');
band(8.2,11.05,7.2,'05  FEZABILITATE GEOMETRICĂ');
text('Fig. 3  Eroarea crește la Soare înalt',.65,11.52,7,.34,15,{bold:true});
text('Fig. 4  Vârf de umbră neobstrucționat',8.25,11.52,7,.34,15,{bold:true});
// The curve is made of individual editable line segments.
text('Eroarea înălțimii δh (m)',1.20,12.29,5.95,.22,10,{color:C.muted});
let x0=1.20,y0=12.65,w0=5.95,h0=2.90;
for(let v=0;v<=15;v+=5){let y=y0+h0-h0*v/20;line(x0,y,x0+w0,y);text(v,x0-.36,y-.10,.25,.2,10,{align:'right',color:C.muted});}
for(let e=10;e<=70;e+=10){let x=x0+(e-10)/65*w0;text(e,x-.17,y0+h0+.12,.35,.23,10,{align:'center'});}
for(const [err,col] of [[5,C.copper],[.3,C.ink]]){for(let e=10;e<75;e+=1){const f=a=>Math.tan(a*Math.PI/180)*err;const x=x0+(e-10)/65*w0, x2=x0+(e+1-10)/65*w0;const y=y0+h0-h0*f(e)/20,y2=y0+h0-h0*f(e+1)/20;line(x,y,x2,y2,col,1.7);}}
text('GPS: δL = 5 m (ipoteză)',1.22,12.02,2.8,.25,10,{color:C.copper});
text('Telemetru: δL = 0,3 m (ipoteză)',4.05,12.02,3.0,.25,10);
text('Elevația Soarelui e (grade)',2.15,15.90,4.4,.26,11,{align:'center'});
text('δh ≈ tan(e) · δL',.78,16.34,5,.38,20,{bold:true});
text('Modelul izolează eroarea lungimii; curbele exprimă ipoteze, nu precizii măsurate.',.78,16.82,6.6,.62,11,{color:C.muted});

text('Clădiri eligibile în simulare (%)',8.65,12.29,6.2,.22,10,{color:C.muted});
const inst=Object.entries(sim.instants), qx=8.65,qy=12.65,qw=6.2,qh=2.88;
for(let n=0;n<=100;n+=20){let y=qy+qh-qh*n/100;line(qx,y,qx+qw,y);text(n,qx-.45,y-.10,.38,.20,10,{align:'right',color:C.muted});}
inst.forEach(([k,v],i)=>{let x=qx+.14+i*1.0,h=qh*v.measurable_pct/100,h2=qh*v.by_height_pct['≥ 20 m']/100;rect(x,qy+qh-h,.30,h,C.lilac);rect(x+.32,qy+qh-h2,.30,h2,C.ink);text(fmt(v.measurable_pct),x-.04,qy+qh-h-.23,.4,.20,9,{align:'center'});text(k.replace(' ', '\n'),x-.12,15.62,.90,.48,9,{align:'center'});});
rect(8.65,12.08,.15,.09,C.lilac);
text('Toate clădirile (n = 38.913)',8.9,12.04,2.9,.22,10,{color:C.muted});
rect(11.8,12.08,.15,.09,C.ink);
text('Înălțime ≥ 20 m (n = 805)',12.05,12.04,2.8,.22,10);
text('Toamna: 85–90% total; 60–71% la ≥ 20 m.',8.35,16.34,6.7,.35,15,{bold:true});
text('Simulare: obstacolele sunt celelalte clădiri. Arborii, mașinile și accesul fizic nu sunt incluse.',8.35,16.82,6.7,.62,11,{color:C.muted});

band(.6,17.75,7.1,'06  COMPARAȚIA GBA CU OSM');
band(8.2,17.75,7.2,'07  CERCETAREA SUSȚINE APLICAȚIA');
text('Tabelul 1  Diferențe GBA − înălțime etichetată OSM',.65,18.22,7,.32,13,{bold:true});
const cols=[.75,2.45,3.15,4.55,5.8], widths=[1.65,.7,1.35,1.2,1.05];
const rows=[['OSM','n','Bias (m)','MAE (m)','În ±3 m'],...['0-10 m','10-20 m','20-40 m'].map((k,i)=>{let z=stats.tagged_by_height[k];return [['0–10 m','10–20 m','20–40 m'][i],z.n,fmt(z.bias_m),fmt(z.mae_m),fmt(z.within_3m_pct)+'%'];})];
rows.forEach((row,r)=>{let y=18.74+r*.40;row.forEach((v,i)=>{rect(cols[i],y,widths[i],.38,r===0?C.ink:(r%2?C.pale:'F9F7FA'));text(v,cols[i]+.03,y+.06,widths[i]-.06,.25,11,{align:'center',bold:r===0,color:r===0?C.white:C.ink});});});
text('Referințe OSM; total n = 88. Cinci cazuri ≥ 40 m sunt omise din tabel.',.78,20.55,6.65,.55,11,{color:C.muted});
text('Subset concordant cu etajele: n = 37; bias −5,0 m; MAE 6,1 m.',.78,21.18,6.65,.55,11,{color:C.muted});
text('Întrebarea științifică',8.35,18.24,6.7,.30,13,{bold:true});
text('Cât de precis putem estima înălțimea unei clădiri din umbră și cum alegem momentul măsurării?',8.35,18.64,6.7,.70,14,{bold:true});
text('De la măsurare la recomandare',8.35,19.55,6.7,.32,13,{bold:true,color:C.copper});
text('Lungimea umbrei + poziția Soarelui → înălțime estimată → confirmare în aplicație → actualizarea umbrelor și traseelor.',8.35,19.98,6.7,.78,12);
text('Testată pe teren în Constanța. Trasee umbrite în București și în toate reședințele de județ; înălțimi confirmate de utilizatori.',8.35,20.93,6.7,.67,12,{bold:true});
rect(.6,22.00,14.8,.48,C.copper);text('REZULTATE COMPUTAȚIONALE: ANALIZA DATELOR OSM / GBA ȘI SIMULAREA UMBRELOR',.78,22.09,14.3,.26,13,{color:C.white,bold:true});
text('Surse: OpenStreetMap contributors (ODbL); Zhu et al., GlobalBuildingAtlas, ESSD 2025; NOAA/Meeus; Reda & Andreas, Solar Energy 2004.',.65,22.66,14.5,.48,10,{color:C.muted});
line(.65,23.22,15.35,23.22);
text('Liceul Tehnologic de Marină · Liceul Internațional de Informatică Constanța · Liceul Tehnologic de Electrotehnică și Telecomunicații',.65,23.30,14.6,.25,9);
text('Coordonator: prof. Ramona Rădulescu · Informatică pentru Viitor · radramra@gmail.com     |     github.com/Ieditzu/umbra',.65,23.59,14.6,.25,9,{color:C.muted});
pptx.writeFile({fileName:path.join(__dirname,'umbra-poster-editable.pptx')});
