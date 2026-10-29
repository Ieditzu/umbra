// Editable poster: text, bars, axes, lines, tables and backgrounds are individual shapes.
const pptxgen = require('pptxgenjs');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
const stats = JSON.parse(fs.readFileSync(path.join(root, 'docs/research/gba-heights/summary.json')));
const sim = JSON.parse(fs.readFileSync(path.join(root, 'docs/paper/measurability.json')));
const areas = JSON.parse(fs.readFileSync(path.join(root, 'mobile/assets/data/cities/index.json'))).areas;
require('node:assert/strict')(areas.length>0 && areas.every(a=>typeof a.city==='string' && (!a.heights || (a.heights_year===2012 && Number.isInteger(a.heights_count) && a.heights_count>=0))), 'Check city coverage and Copernicus source year before publishing the poster');
const cityCount = new Set(areas.map(a=>a.city)).size;
const constantaHeights = areas.find(a=>a.city==='constanta')?.heights_count||0;
const pptx = new pptxgen();
const SY=16*1189/841/24; // A0 (841 × 1189 mm) at the original 16 in width
pptx.defineLayout({name:'POSTER', width:16, height:24*SY});
pptx.layout='POSTER'; pptx.author='Echipa Umbra'; pptx.title='UMBRA — poster științific';
const s = pptx.addSlide(); s.background={color:'FFFFFF'};
const C={ink:'321B40',copper:'B84419',muted:'625A6A',lilac:'AF9ABF',pale:'F1EDF5',grid:'DDD7E2',white:'FFFFFF'};
const rect=(x,y,w,h,color)=>s.addShape(pptx.ShapeType.rect,{x,y:y*SY,w,h:h*SY,line:{color,transparency:100},fill:{color}});
const line=(x1,y1,x2,y2,color=C.grid,width=0.7)=>s.addShape(pptx.ShapeType.line,{x:Math.min(x1,x2),y:Math.min(y1,y2)*SY,w:Math.abs(x2-x1)||0.001,h:Math.abs(y2-y1)*SY||0.001,flipV:(y2-y1)*(x2-x1)<0,line:{color,width}});
const text=(t,x,y,w,h,size=13,opt={})=>s.addText(String(t),{x,y:y*SY,w,h:h*SY,fontFace:'Noto Sans',fontSize:Math.max(size,11),color:opt.color||C.ink,bold:!!opt.bold,margin:0,breakLine:false,align:opt.align||'left',valign:'mid',fit:'shrink',...opt});
const band=(x,y,w,label)=>{rect(x,y,w,.34,C.ink);text(label,x+.12,y+.035,w-.2,.24,13,{bold:true,color:C.white});};
const fmt=(v,n=1)=>Number(v).toFixed(n).replace('.',',');

text('RoSEF 2026  /  TEHNOLOGIA INFORMAȚIEI ȘI COMUNICAȚIILOR  /  APLICAȚIE MOBILĂ + CERCETARE',.6,.23,14.8,.25,12,{bold:true});
text('UMBRA',.55,.48,8.5,1.30,82,{bold:true});
text('Trasee umbrite.\nÎnălțimi din umbre.',9.45,.64,5.8,1.05,23,{bold:true,color:C.copper});
text('Eduard-Mihai Perjoc · Eduard-Andrei Haivas · Cezar-Ștefan Manea',.65,1.91,14.6,.3,14,{bold:true});
text('Clasa a X-a · Constanța    |    Coordonator: prof. Ramona Rădulescu',.65,2.27,14.6,.25,12,{color:C.muted});
rect(.6,2.68,14.8,1.08,C.pale);
text('ÎNTREBAREA ȘTIINȚIFICĂ',.8,2.77,14.3,.23,12,{bold:true,color:C.copper});
text('Cu ce eroare estimăm înălțimea clădirilor din umbre și când rămân vârfurile umbrelor neobstrucționate?',.8,3.07,14.3,.35,17,{bold:true});
text('Aplicăm înălțimile obținute la harta umbrelor și la comparația traseelor pietonale.',.8,3.49,14.3,.22,12,{color:C.muted});

band(.6,3.93,4.65,'01  APLICAȚIA UMBRA');
text('Traseu mai rapid sau mai umbrit?',.65,4.39,4.5,.40,16,{bold:true});
text('Alegi destinația, ora plecării și ocolul acceptat. Umbra compară durata și expunerea estimată la soare.',.65,4.99,4.45,.76,13);
text('Clădiri + copaci + prognoză meteo: serverul calculează alternativele; telefonul afișează harta și urmărirea GPS.',.65,5.90,4.45,.77,12);
text('„Măsoară clădirea”: GPS, ruletă/laser sau fotografie din dronă → înălțime și incertitudine.',.65,6.80,4.45,.66,12,{bold:true});
text('Salvare locală; partajare opțională. Înălțimile confirmate actualizează modelul.',.65,7.55,4.5,.43,11,{color:C.copper});
band(.6,8.12,4.65,'02  PRINCIPIU ȘI METODĂ');
s.addImage({path:path.join(__dirname,'building-3d.png'),x:1.05+3.55*(1-SY)/2,y:8.57*SY,w:3.55*SY,h:1.77*SY});
text('h',1.42,9.37,.3,.3,15,{bold:true}); text('L',3.02,10.08,.3,.3,15,{bold:true}); text('e',3.66,9.73,.3,.3,15,{bold:true});
text('h = L · tan(e)',.72,10.29,4.3,.39,23,{bold:true});
text('h: înălțime · L: lungimea umbrei · e: elevația Soarelui',.72,10.73,4.45,.23,11);

band(5.75,3.93,9.65,'03  CERCETARE: DATE ȘI REZULTATE');
text('Fig. 1  În OSM, 87,8% dintre clădiri nu au înălțime sau etaje',5.8,4.39,9.5,.38,15,{bold:true});
let bx=5.95, by=5.02, bw=8.9, bh=.52;
const chunks=[[271,C.ink],[5913,C.lilac],[45159,C.copper],[85,'D2CBD7']];
for(const [v,c] of chunks){const w=bw*v/51428;rect(bx,by,w,bh,c);bx+=w;}
text('45.159 fără înălțime sau etaje',8.5,5.09,5.5,.32,14,{color:C.white,bold:true,align:'center'});
text('271 înălțimi OSM · 5.913 doar etaje · 85 alte cazuri',5.95,5.72,9,.3,12);
text('Studiu Constanța, OSM 25.10.2026: 51.428 clădiri; GBA asociat la 40.658.',5.95,6.11,9,.3,12,{color:C.muted});
text('În aplicație, Copernicus 2012 adaugă '+constantaHeights.toLocaleString('ro-RO')+' estimări pentru clădiri fără înălțimi OSM.',5.95,6.51,9,.32,12,{color:C.copper});
text('Fig. 2  Înălțimea GBA pe etaj scade la blocurile înalte',5.8,7.05,9.5,.35,15,{bold:true});
const lv=['1-2 floors','3-4 floors','5-8 floors','9-12 floors'].map(k=>stats.levels_by_count[k]);
const label=['1–2','3–4','5–8','9–12']; const gx=6.55, gy=7.78, gw=8.3, gh=1.88;
for(let n=0;n<=4;n++){let y=gy+gh-gh*n/4;line(gx,y,gx+gw,y);text(n,gx-.35,y-.12,.26,.22,10,{align:'right',color:C.muted});}
lv.forEach((v,i)=>{let x=gx+.58+i*1.98,h=gh*v.gba_m_per_floor_median/4;rect(x,gy+gh-h,.90,h,i===3?C.copper:C.lilac);text(fmt(v.gba_m_per_floor_median,2),x,gy+gh-h-.30,.9,.24,12,{bold:true,align:'center'});text(label[i]+' etaje\nn = '+v.n.toLocaleString('ro-RO'),x-.25,9.73,1.4,.48,10,{align:'center'});});
text('Mediana înălțimii GBA / etaje (m)',6.55,10.30,8.2,.25,11,{color:C.muted});
text('n = 4.925 asocieri; graficul arată 4.907 clădiri cu 1–12 etaje.',6.55,10.62,8.4,.3,11,{color:C.muted});

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
band(8.2,17.75,7.2,'07  DE LA DATE LA TRASEU');
text('Tabelul 1  Diferențe GBA − înălțime etichetată OSM',.65,18.22,7,.32,13,{bold:true});
const cols=[.75,2.45,3.15,4.55,5.8], widths=[1.65,.7,1.35,1.2,1.05];
const rows=[['OSM','n','Bias (m)','MAE (m)','În ±3 m'],...['0-10 m','10-20 m','20-40 m'].map((k,i)=>{let z=stats.tagged_by_height[k];return [['0–10 m','10–20 m','20–40 m'][i],z.n,fmt(z.bias_m),fmt(z.mae_m),fmt(z.within_3m_pct)+'%'];})];
rows.forEach((row,r)=>{let y=18.74+r*.40;row.forEach((v,i)=>{rect(cols[i],y,widths[i],.38,r===0?C.ink:(r%2?C.pale:'F9F7FA'));text(v,cols[i]+.03,y+.06,widths[i]-.06,.25,11,{align:'center',bold:r===0,color:r===0?C.white:C.ink});});});
text('Referințe OSM; total n = 88. Cinci cazuri ≥ 40 m sunt omise din tabel.',.78,20.55,6.65,.55,11,{color:C.muted});
text('Subset concordant cu etajele: n = 37; bias −5,0 m; MAE 6,1 m.',.78,21.18,6.65,.55,11,{color:C.muted});
const conclusions=[
  ['1. Mai multe înălțimi disponibile','Date OSM în '+cityCount+' orașe; Copernicus 2012 completează înălțimi lipsă unde are acoperire. Măsurătorile confirmate au prioritate.'],
  ['2. Recomandare adaptată vremii','Prognoza Open-Meteo ajustează alegerea între alternative, în funcție de radiația directă și durata mersului.'],
  ['3. Măsurare → hartă → traseu','Telefonul salvează măsurători; baza comună este opțională. Serverul recalculează înălțimile și actualizează umbrele.'],
];
conclusions.forEach(([head,body],i)=>{let y=18.22+i*.98;text(head,8.35,y,6.9,.32,14,{bold:true});text(body,8.35,y+.36,6.9,.56,12);});
text('Testată pe teren în Constanța. Rutare în '+cityCount+' orașe publicate; extindere automată prin catalogul de date.',8.35,21.18,6.9,.55,12,{bold:true,color:C.copper});
rect(.6,22.00,14.8,.48,C.copper);text('CONCLUZIE: ÎNĂLȚIMILE LOCALE ȘI MOMENTUL MĂSURĂRII CONTEAZĂ ÎN MODELAREA UMBRELOR.',.78,22.09,14.3,.26,14,{color:C.white,bold:true});
text('Surse: © OpenStreetMap contributors (ODbL); GlobalBuildingAtlas (ESSD 2025); Open-Meteo (CC BY 4.0); NOAA/Meeus.\nCopernicus: © European Union, Copernicus Land Monitoring Service 2022, European Environment Agency (EEA).',.65,22.66,13.2,.48,10,{color:C.muted});
line(.65,23.22,14.1,23.22);
s.addImage({path:path.join(root,'docs/poster/qr-github.png'),x:14.4,y:22.58*SY,w:1.0,h:1.0});
text('Liceul Tehnologic de Marină · Liceul Internațional de Informatică Constanța · Liceul Tehnologic de Electrotehnică și Telecomunicații',.65,23.30,13.4,.25,9);
text('Coordonator: prof. Ramona Rădulescu · Informatică pentru Viitor · radramra@gmail.com     |     github.com/Ieditzu/umbra',.65,23.59,13.4,.25,9,{color:C.muted});
pptx.writeFile({fileName:path.join(__dirname,'umbra-poster-editable.pptx')});
