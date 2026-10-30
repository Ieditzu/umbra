import fs from 'node:fs/promises';
import path from 'node:path';
import {Presentation,PresentationFile} from '/Users/maneacezar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const ROOT='/Users/maneacezar/Documents/GitHub/umbra';
const DIR=path.join(ROOT,'work/prezentare-verde-v2');
await fs.mkdir(path.join(DIR,'preview'),{recursive:true});
const C={dark:'#143B2C',green:'#00734B',leaf:'#BBD8A8',sage:'#DFE9D9',cream:'#FAF8F1',ink:'#183427',gray:'#53675A',white:'#FFFFFF',line:'#CFD9CA'};
let count=0;
function rect(s,x,y,w,h,fill,line='none',lw=0,rotation=0){return s.shapes.add({name:`shape-${++count}`,geometry:'rect',position:{left:x,top:y,width:w,height:h,rotation},fill,line:{fill:line,width:lw,style:'solid'}})}
function txt(s,v,x,y,w,h,sz=30,col=C.ink,bold=false){const t=s.shapes.add({name:`text-${++count}`,geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});t.text=v;t.text.insets=0;t.text.style={typeface:'Arial',fontSize:sz,color:col,bold,wrap:'square',verticalAlignment:'top'};return t;}
function ln(s,x1,y1,x2,y2,col=C.green,lw=3){const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy);return rect(s,(x1+x2)/2-L/2,(y1+y2)/2-lw/2,L,lw,col,'none',0,Math.atan2(dy,dx)*180/Math.PI);}
const pres=Presentation.create({slideSize:{width:1280,height:720}});pres.theme.defaultFont='Arial';
const speeches=[
`Pe aceeași stradă, un trotuar poate fi în soare, iar celălalt în umbră. UMBRA ține cont de această diferență când alegem un traseu. În spatele hărții stă o întrebare simplă: de unde aflăm înălțimea clădirilor?`,
`Am pornit de la datele folosite de aplicație pentru Constanța, Mamaia și Palazu Mare. Setul conține peste cincizeci și una de mii de clădiri. Pentru aproape optzeci și opt la sută nu există informații despre înălțime sau numărul de etaje. Numai două sute șaptezeci și una au înălțimea trecută direct în OpenStreetMap. Alte clădiri au numărul de etaje, din care se poate face o estimare. Aici este problema pe care o tratăm: putem desena conturul unei clădiri, dar pentru umbra ei avem nevoie și de înălțime.`,
`Am verificat și GlobalBuildingAtlas, un set global de înălțimi estimate. Am găsit valori pentru aproximativ șaptezeci și nouă la sută dintre clădirile din datele noastre. Graficul arată diferența medie dintre aceste valori și înălțimile etichetate în OpenStreetMap. La clădirile joase diferența este mică. În grupul între douăzeci și patruzeci de metri, valorile GBA sunt în medie cu cincisprezece virgulă șapte metri mai mici. Grupul are zece clădiri, deci nu îl confundăm cu întregul oraș. Comparația este între două baze de date. Etichetele OSM sunt referința acestei analize, nu măsurători făcute de noi.`,
`Metoda folosește o relație geometrică simplă. Pe teren plan, înălțimea unei clădiri este lungimea umbrei înmulțită cu tangenta unghiului Soarelui. Unghiul se calculează din loc, dată și oră. Lungimea se măsoară între baza colțului clădirii și marginea umbrei produse de acel colț. Nu alegem vârful unei umbre care vine de la un copac sau de la o construcție de pe acoperiș. Astfel, o lungime măsurată la sol ne dă o estimare a înălțimii. Formula este cunoscută. Rolul ei în UMBRA este să lege o măsurare accesibilă de datele de care are nevoie harta și, mai departe, de calculul traseelor.`,
`Ora la care măsurăm contează mult. În exemplul de pe slide, păstrăm aceeași eroare de cinci metri la lungimea umbrei. Calculul arată o eroare de aproximativ trei virgulă doi metri în înălțime la amiază, în octombrie. Pentru o poziție înaltă a Soarelui, în iunie, efectul crește la treisprezece virgulă doi metri. Acestea sunt valori calculate cu modelul geometric. Un Soare mai jos reduce această amplificare, dar produce umbre mai lungi, care pot ajunge pe alte clădiri. De aceea contează împreună ora, terenul și marginea umbrei. La verificare comparăm aceleași clădiri cu o înălțime de referință și păstrăm condițiile de măsurare.`,
`În aplicație, informația urmează un traseu clar. Măsurarea umbrei ne ajută să estimăm înălțimea. Înălțimea, împreună cu sursa și precizia ei, intră în harta clădirilor. Din această hartă și poziția Soarelui se calculează umbrele la ora deplasării. Apoi comparăm durata și expunerea estimată pe trasee, în limita ocolului ales. Telefonul afișează harta, iar calculatorul execută calculele. Rutarea folosește în prezent rețeaua pregătită pentru Constanța. Același mod de lucru se poate aplica altor orașe, cu date potrivite pentru fiecare. Aceasta este legătura pe care o construiește UMBRA: măsurarea unei clădiri are un rol direct în felul în care alegem drumul. Vă mulțumim!`
];
const times=[20,45,55,60,60,60];const sources=[
['README.md','docs/paper/umbra-lucrare.pdf','https://www.apple.com/apple-events/','https://creative.starbucks.com/voice/','https://mitcommlab.mit.edu/eecs/commkit/slideshow/'],
['docs/shadow-heights.md §1','mobile/assets/data/constanta-city.json','https://www.openstreetmap.org/copyright'],
['docs/research/gba-heights/summary.json','docs/research/gba-heights/README.md','https://doi.org/10.5194/essd-17-6647-2025'],
['docs/shadow-heights.md §3','docs/paper/principiu.png','https://gml.noaa.gov/grad/solcalc/calcdetails.html'],
['docs/paper/measurability.json','docs/shadow-heights.md §3, §7','docs/paper/umbra-lucrare.pdf'],
['README.md','docs/shadow-heights.md §6, §7']];
let elapsed=0;
function clock(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;}
function slide(n,title,bg=C.cream){const s=pres.slides.add();s.background.fill=bg;
 const isDark=bg===C.dark;
 if(title)txt(s,title,64,54,1152,90,55,isDark?C.white:C.ink,true);
 txt(s,String(n).padStart(2,'0'),1181,670,45,24,17,isDark?'#BCD0BC':C.gray);
 s.speakerNotes.text=`${clock(elapsed)}–${clock(elapsed+times[n-1])} (${times[n-1]} secunde)\n\n${speeches[n-1]}\n\nSURSE\n${sources[n-1].join('\n')}\n`;
 elapsed+=times[n-1];return s;}

// A geographic figure from the real bundled OSM snapshot, not a generated app screenshot.
const map=JSON.parse(await fs.readFile(path.join(DIR,'map.json'),'utf8'));
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="750" height="1150" viewBox="0 0 750 1150"><rect width="750" height="1150" fill="#DFE9D9"/>${map.roads.map(p=>`<polyline points="${p.map(v=>v.join(',')).join(' ')}" fill="none" stroke="#FAF8F1" stroke-width="5"/>`).join('')}${map.buildings.map(b=>`<polygon points="${b.points.map(v=>v.join(',')).join(' ')}" fill="${b.known?'#365F39':'#8CA583'}" stroke="#DFE9D9" stroke-width="1.4"/>`).join('')}</svg>`;
const mp=Presentation.create({slideSize:{width:750,height:1150}});const ms=mp.slides.add();ms.images.add({svg,position:{left:0,top:0,width:750,height:1150},fit:'contain'});
const mb=await mp.export({slide:ms,format:'png',scale:1.3});const mapPath=path.join(DIR,'constanta.png');await fs.writeFile(mapPath,new Uint8Array(await mb.arrayBuffer()));

// 1. A fresh, light cover. One real geographic visual and a clear project title.
{
 const s=slide(1,null);
 rect(s,832,0,448,720,C.sage);
 s.images.add({blob:new Uint8Array(await fs.readFile(mapPath)),contentType:"image/png",position:{left:832,top:0,width:448,height:687},fit:'cover'});
 rect(s,832,687,448,33,C.sage);
 txt(s,'Constanța. Date: © OpenStreetMap contributors',849,695,418,20,14,C.gray);
 txt(s,'RoSEF 2026',65,62,710,32,23,C.green,true);
 txt(s,'UMBRA',57,164,738,130,115,C.dark,true);
 txt(s,'Înălțimea clădirilor\ndin umbră',65,322,710,146,51,C.ink,true);
 txt(s,'Pentru trasee pietonale mai umbrite',65,494,735,48,31,C.green);
 txt(s,'Haivas Eduard Andrei, Manea Cezar Ștefan,\nPerjoc Eduard Mihai',65,579,735,63,22,C.ink);
 txt(s,'Clasa a X-a. Coordonator: Ramona Rădulescu',65,656,730,30,20,C.gray);
}

// 2. Slightly more information, arranged around one clear data point.
{
 const s=slide(2,'Datele din Constanța');
 txt(s,'51.428 de clădiri',66,161,1000,54,36,C.gray);
 txt(s,'87,8%',58,254,638,150,126,C.green,true);
 txt(s,'fără informații despre\nînălțime sau etaje',68,416,615,107,40,C.ink,true);
 txt(s,'Conturul există. Pentru umbră\neste nevoie și de înălțime.',68,557,630,83,28,C.gray);
 const rows=[['271','cu înălțime etichetată'],['5.913','cu număr de etaje'],['45.159','fără informații de înălțime']];
 for(let i=0;i<3;i++){const y=233+i*121;txt(s,rows[i][0],780,y,405,58,45,i===2?C.green:C.ink,true);txt(s,rows[i][1],780,y+59,419,41,25,C.gray);if(i<2)rect(s,780,y+109,420,1,C.line);}
 txt(s,'Constanța, Mamaia și Palazu Mare. 85 de contururi ridicate sau de acoperiș rămân în afara categoriilor de mai sus.',68,672,1078,25,15,C.gray);
}

// 3. Chart marks, values, category labels and the takeaway all occupy separate areas.
{
 const s=slide(3,'Comparația cu datele globale');
 txt(s,'GlobalBuildingAtlas (GBA) față de înălțimile etichetate în OSM',67,158,1120,50,29,C.gray);
 const plotX=400,zero=1080,scale=30;
 for(const tick of [0,5,10,15,20]){const x=zero-tick*scale;rect(s,x,247,1,315,C.line);txt(s,tick===0?'0':`−${tick}`,x-22,579,55,30,21,C.gray);}
 txt(s,'Diferența medie (m)',900,222,290,35,23,C.gray);
 const bars=[['0–10 m','45 de clădiri',.13,'−0,1 m'],['10–20 m','28 de clădiri',5.14,'−5,1 m'],['20–40 m','10 clădiri',15.69,'−15,7 m']];
 for(let i=0;i<3;i++){
  const yy=278+i*98;
  txt(s,bars[i][0],70,yy-6,245,38,32,C.ink,true);txt(s,bars[i][1],71,yy+35,260,30,22,C.gray);
  const ww=Math.max(4,bars[i][2]*scale);rect(s,zero-ww,yy+2,ww,43,i===2?C.dark:C.green);
  txt(s,bars[i][3],zero+22,yy+5,133,37,28,C.green,true);
 }
 txt(s,'La clădirile înalte, GBA dă valori mai mici.',69,621,1130,44,32,C.ink,true);
 txt(s,'Referință: etichete OSM. Comparație între baze de date. Analiză locală, 27.10.2026.',69,674,1090,23,16,C.gray);
}

// 4. A large physical diagram, with no text crossing the ray or the ground line.
{
 const s=slide(4,'Înălțimea din umbră',C.sage);
 txt(s,'h = L × tan(e)',716,234,510,92,62,C.dark,true);
 txt(s,'L: lungimea umbrei\ne: unghiul Soarelui\nh: înălțimea clădirii',720,353,470,138,31,C.ink);
 txt(s,'Locul, data și ora\nne dau unghiul e.',720,525,470,91,29,C.gray);
 rect(s,127,262,110,241,C.cream,C.dark,3);
 ln(s,75,505,649,505,C.gray,3);
 ln(s,158,211,613,505,C.dark,4);
 rect(s,237,505,376,12,C.green);
 ln(s,101,262,101,503,C.green,2);
 txt(s,'h',65,359,38,50,37,C.green,true);
 txt(s,'L',412,539,43,43,34,C.green,true);
 txt(s,'e',550,466,35,33,25,C.green,true);
 txt(s,'Rază solară',330,239,238,37,25,C.gray);
 txt(s,'Măsurăm de la baza colțului\npână la marginea umbrei lui.',70,596,630,77,29,C.ink);
 txt(s,'Relație geometrică pentru o clădire verticală și teren plan.',720,654,465,44,17,C.gray);
}

// 5. A positive research result from the error model, explicitly labelled as calculated.
{
 const s=slide(5,'Ora măsurării contează');
 txt(s,'Aceeași abatere de ±5 m. Efect diferit asupra înălțimii.',68,161,1120,49,32,C.gray);
 const x0=111,y0=552,scale=20;
 rect(s,90,y0,579,2,C.line);
 for(const [x,val,date,angle,label] of [[154,3.2,'27 octombrie, 12:00','e = 32,9°','±3,2 m'],[416,13.2,'21 iunie, 13:00','e = 69,2°','±13,2 m']]){
  rect(s,x,y0-val*scale,139,val*scale,C.green);
  txt(s,label,x-16,y0-val*scale-56,205,45,33,C.dark,true);
  txt(s,date,x-35,574,240,34,24,C.ink,true);
  txt(s,angle,x-17,619,214,33,23,C.gray);
 }
 txt(s,'Soarele aflat sus\namplifică eroarea.',756,262,456,97,39,C.ink,true);
 txt(s,'Când Soarele e jos, umbrele sunt\nmai lungi și pot întâlni obstacole.',756,391,450,92,28,C.gray);
 txt(s,'Verificare: aceeași clădire,\nore diferite și o înălțime\nde referință independentă.',756,518,450,114,27,C.ink);
 txt(s,'Exemplu calculat cu modelul geometric. Se arată efectul erorii de lungime asupra înălțimii.',69,674,1095,23,16,C.gray);
}

// 6. Product workflow plus a proper ending, not a development-status report.
{
 const s=slide(6,'Cum ajungem la traseu',C.dark);
 const steps=[['01','Măsurarea','Lungimea umbrei'],['02','Înălțimea','Valoare și precizie'],['03','Harta','Umbre la ora aleasă'],['04','Traseul','Durată și expunere']];
 for(let i=0;i<4;i++){
  const x=68+i*300;
  txt(s,steps[i][0],x,195,250,37,26,C.leaf,true);
  txt(s,steps[i][1],x,251,278,49,34,C.white,true);
  txt(s,steps[i][2],x,316,279,68,24,'#D5E3D0');
  rect(s,x,410,252,2,'#5D7D59');
 }
 txt(s,'UMBRA',62,467,1130,94,77,C.white,true);
 txt(s,'Alegi traseul și după umbră.',69,570,1139,65,45,C.leaf);
 txt(s,'Rutare în Constanța. Aceeași metodă de lucru pentru datele altor orașe.',69,666,1090,25,18,'#D5E3D0');
}
pres.slides.items[0].speakerNotes.append('\nAsistență AI pentru redactare, documentare și design. Autorii verifică și își asumă conținutul. Documentele sursă separă funcțiile existente de cercetarea înălțimilor din umbre.\n');
await (await PresentationFile.exportPptx(pres)).save(path.join(DIR,'canva-import.pptx'));
for(let i=0;i<6;i++){const blob=await pres.export({slide:pres.slides.items[i],format:'png',scale:1.5});await fs.writeFile(path.join(DIR,'preview',`slide-${i+1}.png`),new Uint8Array(await blob.arrayBuffer()));}
await fs.writeFile(path.join(DIR,'notes.json'),JSON.stringify({times,total:elapsed,words:speeches.map(x=>x.split(/\s+/).length),speeches},null,2));
console.log('6 slide-uri. Total:',elapsed,'secunde. Cuvinte:',speeches.map(x=>x.split(/\s+/).length).join(','));
