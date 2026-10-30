import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const ROOT='/Users/maneacezar/Documents/GitHub/umbra';
const BUILD=path.join(ROOT,'work/prezentare-20261027');
const OUT=path.join(BUILD,'deliverables');
const SKILL='/Users/maneacezar/.codex/plugins/cache/openai-primary-runtime/presentations/26.1025.11240/skills/presentations';
const PY='/Users/maneacezar/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
process.env.RUNTIME_NODE_MODULES='/Users/maneacezar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {finalizePresentation,applyPresentationChartFont}=await import(pathToFileURL(path.join(SKILL,'container_tools/artifact_tool_utils.mjs')).href);
await fs.mkdir(OUT,{recursive:true});await fs.mkdir(path.join(BUILD,'previews'),{recursive:true});
const notes=JSON.parse(await fs.readFile(path.join(BUILD,'speaker_notes.json'),'utf8'));
const pres=Presentation.create({slideSize:{width:1280,height:720}});
const C={green:'#183D36',accent:'#00754A',mint:'#DCE8DD',cream:'#F7F5EF',ink:'#172B25',gray:'#52645D',light:'#E9EDE8',white:'#FFFFFF'};
let seq=0;
function shape(s,name,geometry,x,y,w,h,fill='none',stroke='none',lw=0){return s.shapes.add({name:`${name}-${++seq}`,geometry,position:{left:x,top:y,width:w,height:h},fill,line:{fill:stroke,width:lw,style:'solid'}})}
function text(s,value,x,y,w,h,size=30,color=C.ink,bold=false,name='body'){
 const a=shape(s,name,'textbox',x,y,w,h);a.text=value;a.text.insets=0;
 a.text.style={typeface:'Arial',fontSize:size,bold,color,verticalAlignment:'top',wrap:true};return a;
}
function rule(s,x,y,w,color=C.mint,h=2){shape(s,'rule','rect',x,y,w,h,color)}
function slide(n,title,dark=false){const s=pres.slides.add();s.background.fill=dark?C.green:C.cream;
 if(title)text(s,title,64,57,1152,88,56,dark?C.white:C.ink,true,'title');
 text(s,`${n} / 6`,1150,673,65,22,16,dark?'#C4D7CC':C.gray,false,'page');
 s.speakerNotes.text=`SLIDE ${n} | ${notes[n-1].start}–${notes[n-1].end} | ${notes[n-1].seconds} secunde\n\nDISCURS\n${notes[n-1].speech}\n\nREPER\n${notes[n-1].cue}\n\nSURSE (nu se citesc)\n${notes[n-1].sources.join('\n')}\n\nPlanul total este de 300 secunde. Verifică ritmul efectiv la repetiție.\n`;
 return s;
}
function routeLine(s,name,pts,color,width=4){
 const [a,b]=[pts[0],pts[pts.length-1]];
 const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
 return s.shapes.add({name,geometry:'rect',position:{left:(a[0]+b[0])/2-length/2,top:(a[1]+b[1])/2-width/2,width:length,height:width,rotation:Math.atan2(dy,dx)*180/Math.PI},fill:color,line:{fill:'none',width:0}});
}

// 1. Minimal, typographic cover. A quieter title leaves space for the spoken opening.
{
 const s=slide(1,null,true);
 text(s,'RoSEF 2026',68,58,900,36,25,'#AECFB9',true,'event');
 text(s,'UMBRA',60,157,1150,135,116,C.white,true,'title');
 text(s,'SmartRoute',66,295,1150,95,77,C.white,false,'subtitle');
 text(s,'Rute pietonale după umbră',68,416,1100,55,37,'#C9DDCE');
 rule(s,68,514,1120,'#497061');
 text(s,'Haivas Eduard Andrei, Manea Cezar Ștefan, Perjoc Eduard Mihai',68,544,1120,35,22,C.white);
 text(s,'ICHC / Telecom / Liceul de Marină, clasa a X-a',68,585,1120,30,21,'#C9DDCE');
 text(s,'Coordonator: Ramona Rădulescu',68,622,1100,30,21,'#C9DDCE');
}

// 2. Editable architecture diagram, not a simulated screenshot.
{
 const s=slide(2,'Harta, ora și traseul');
 text(s,'Destinația, ora și ocolul acceptat',66,167,1100,48,34,C.accent,true);
 shape(s,'phone-node','rect',77,272,365,205,C.white,C.mint,2);
 text(s,'Telefon',102,295,310,48,37,C.ink,true);
 text(s,'Hartă și umbre estimate\nPoziție GPS și busolă',102,365,310,88,29,C.gray);
 shape(s,'pc-node','rect',791,272,404,205,C.white,C.mint,2);
 text(s,'Server pe PC',816,295,350,48,37,C.ink,true);
 text(s,'Poziția Soarelui\nCalculul umbrelor și rutelor',816,365,350,88,29,C.gray);
 shape(s,'request-arrow','rightArrow',480,326,260,28,C.accent);
 text(s,'Cerere și rezultat',479,381,280,40,23,C.gray);
 text(s,'Rută rapidă sau cu expunere redusă',77,509,1135,48,34,C.ink,true);
 text(s,'Rutare în Constanța. Clădiri și umbre orientative în alte regiuni din România.',77,568,1115,58,25,C.gray);
 text(s,'Schemă a prototipului actual. Pentru calcule, PC-ul rămâne pornit.',77,640,1090,26,19,C.gray);
}

// 3. Exact local values in an editable native chart.
{
 const s=slide(3,'Înălțimile lipsă schimbă umbrele');
 text(s,'87,8%',65,170,380,112,94,C.accent,true,'primary-metric');
 text(s,'45.159 din 51.428 clădiri\nfără înălțime OSM',68,285,375,79,28,C.ink);
 rule(s,69,386,365);
 text(s,'79,1%',65,407,380,88,76,C.green,true,'coverage-metric');
 text(s,'acoperire GlobalBuildingAtlas\n40.658 de clădiri asociate',68,502,380,82,27,C.gray);
 text(s,'Diferența medie GBA − OSM (m)',490,172,710,52,29,C.ink,true,'chart-heading');
 const chartLeft=528, chartTop=310, chartBottom=545;
 for(let v=0;v<=20;v+=5){
   const y=chartTop+v/20*(chartBottom-chartTop);
   rule(s,chartLeft,y,675,'#D7DFD6',1);
   text(s,v===0?'0 m':`−${v} m`,466,y-8,58,24,17,C.gray);
 }
 const bars=[['0–10 m','n = 45',-.13,'−0,1 m'],['10–20 m','n = 28',-5.14,'−5,1 m'],['20–40 m','n = 10',-15.69,'−15,7 m']];
 for(let i=0;i<bars.length;i++){
   const x=553+i*234,h=Math.max(2,Math.abs(bars[i][2])/20*(chartBottom-chartTop));
   text(s,bars[i][0],x-10,235,180,30,24,C.ink,true);
   text(s,bars[i][1],x-10,272,180,25,19,C.gray);
   shape(s,'gba-bar','rect',x,chartTop,110,h,C.accent);
   text(s,bars[i][3],x-8,chartTop+h+7,180,29,23,C.ink,true);
 }

 text(s,'Comparație cu etichete OSM, nu cu înălțimi măsurate în teren',490,581,710,63,23,C.gray);
 text(s,'Sursă: analiza locală GBA–OSM, 27.10.2026',68,666,1000,24,17,C.gray);
}

// 4. Editable physical diagram: the height, shadow length and solar angle.
{
 const s=slide(4,'Înălțimea din umbră');
 text(s,'h = L × tan(e)',65,158,1110,100,79,C.accent,true,'formula');
 shape(s,'vertical-building','rect',120,310,110,210,C.mint,C.green,3);
 routeLine(s,'ground',[[70,520],[770,520]],C.gray,3);
 routeLine(s,'sun-ray',[[130,260],[650,520]],C.green,4);
 shape(s,'shadow-length','rect',230,520,420,10,C.green);
 routeLine(s,'height-guide',[[96,310],[96,520]],C.accent,2);
 text(s,'h',63,397,35,42,35,C.accent,true);
 text(s,'L',420,542,50,45,35,C.accent,true);
 text(s,'e',568,489,35,32,25,C.accent,true);
 text(s,'Rază solară',290,275,215,40,24,C.gray);
 text(s,'L se măsoară',815,295,385,55,33,C.ink,true);
 text(s,'e se calculează din loc,\ndată și oră',815,368,385,94,29,C.gray);
 text(s,'h rezultă din geometrie',815,481,385,92,32,C.ink,true);
 text(s,'Putem obține înălțimi suficient de precise pentru harta umbrelor?',66,600,1145,45,29,C.ink,true);
 text(s,'Schemă pe teren plan. Metodă propusă, fără măsurători de teren încă.',66,665,1090,25,18,C.gray);
}

// 5. A large, explicitly labelled hypothesis and an editable validation sequence.
{
 const s=slide(5,'Cum verificăm în realitate');
 text(s,'IPOTEZĂ',66,180,385,35,25,C.accent,true);
 text(s,'±3 m',62,236,400,110,94,C.green,true);
 text(s,'pentru cel puțin 80%',67,357,405,54,35,C.ink,true);
 text(s,'Clădiri cu umbră clară\npe teren plat',67,434,385,90,29,C.gray);
 text(s,'Nu este un rezultat obținut',67,553,385,76,28,C.accent,true);
 const rows=[['01','Cel puțin 30 de clădiri','Selectate înainte de măsurare'],['02','Referință independentă','Separată de estimarea din umbră'],['03','Umbră măsurată repetat','Ore diferite și doi observatori'],['04','Erori și efect asupra rutelor','Aceleași clădiri pentru toate metodele']];
 for(let i=0;i<rows.length;i++){
   const y=176+i*113;
   text(s,rows[i][0],513,y+2,58,40,27,C.accent,true);
   text(s,rows[i][1],587,y,620,49,31,C.ink,true);
   text(s,rows[i][2],588,y+51,621,45,24,C.gray);
   if(i<3)rule(s,588,y+100,622);
 }
 text(s,'Calibrare separată de test. Raportăm și încercările eșuate.',66,665,1100,25,18,C.gray);
}

// 6. The current contribution and the next falsifiable step.
{
 const s=slide(6,'Ce avem și ce urmează',true);
 text(s,'REALIZAT',68,190,510,35,25,'#A7D1B6',true);
 text(s,'Prototip de hartă și rutare\nComparație locală GBA–OSM',68,257,525,124,32,C.white);
 text(s,'DE VALIDAT',674,190,535,35,25,'#A7D1B6',true);
 text(s,'Măsurarea din umbre\nEfectul asupra traseelor',674,257,535,124,32,C.white);
 rule(s,68,429,1140,'#497061');
 text(s,'Înălțimi verificate pentru rute\numbrite mai bine fundamentate',67,462,1140,130,48,C.white,true);
 text(s,'Extindere în alte orașe, după auditul datelor',68,612,1130,35,24,'#C9DDCE');
 text(s,'AI: asistență la redactare și design. Fără rezultate de teren generate.',68,669,1080,23,16,'#C9DDCE');
}

// Research/design sources are in the notes, not cluttering the talk.
pres.slides.items[0].speakerNotes.append('\n\nDESIGN ȘI STRUCTURĂ\nhttps://www.apple.com/apple-events/\nhttps://creative.starbucks.com/color/\nhttps://creative.starbucks.com/typography/\nhttps://gradcareers.cornell.edu/spotlights/tips-for-a-5-minute-research-presentation/\nhttps://www.sciencesocieties.org/canvas/submit/rapidfire\nInspirație vizuală, fără siglele sau afilierea acestor branduri. Recomandările altor concursuri nu sunt reguli RoSEF.\n');
pres.slides.items[5].speakerNotes.append('\nUMBRA-R din documentele vechi rămâne o direcție propusă. Această prezentare urmărește direcția de cercetare curentă din docs/shadow-heights.md.\nRegulament RoSEF furnizat, art.7: creativitate30, știință20, obiective10, complexitate15, prezentare15, oficiu10. Contribuțiile individuale se declară numai conform muncii reale. Limita de5 minute este cerința utilizatorului.\n');

const draft=path.join(BUILD,'canva-corrected.pptx');
await (await PresentationFile.exportPptx(pres)).save(draft);
await fs.mkdir(path.join(BUILD,'canva-ready'),{recursive:true});
for(let i=0;i<6;i++){
 const blob=await pres.export({slide:pres.slides.items[i],format:'png',scale:1.5});
 await fs.writeFile(path.join(BUILD,'canva-ready',`slide-${i+1}.png`),new Uint8Array(await blob.arrayBuffer()));
}
console.log(draft);
