import fs from 'node:fs/promises';
import path from 'node:path';
import {Presentation,PresentationFile} from '/Users/maneacezar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const ROOT='/Users/maneacezar/Documents/GitHub/umbra';
const DIR=path.join(ROOT,'work/prezentare-concisa');
await fs.mkdir(path.join(DIR,'preview'),{recursive:true});
const C={dark:'#143B2C',green:'#00734B',leaf:'#BBD8A8',sage:'#DFE9D9',cream:'#FAF8F1',ink:'#183427',gray:'#53675A',white:'#FFFFFF',line:'#CFD9CA'};
let count=0;
function rect(s,x,y,w,h,fill,line='none',lw=0,rotation=0){return s.shapes.add({name:`shape-${++count}`,geometry:'rect',position:{left:x,top:y,width:w,height:h,rotation},fill,line:{fill:line,width:lw,style:'solid'}})}
function txt(s,v,x,y,w,h,sz=30,col=C.ink,bold=false){const t=s.shapes.add({name:`text-${++count}`,geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});t.text=v;t.text.insets=0;t.text.style={typeface:'Arial',fontSize:sz,color:col,bold,wrap:'square',verticalAlignment:'top'};return t;}
function ln(s,x1,y1,x2,y2,col=C.green,lw=3){const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy);return rect(s,(x1+x2)/2-L/2,(y1+y2)/2-lw/2,L,lw,col,'none',0,Math.atan2(dy,dx)*180/Math.PI);}
const pres=Presentation.create({slideSize:{width:1280,height:720}});pres.theme.defaultFont='Arial';
const speeches=[
`UMBRA pornește de la o idee simplă: o umbră ne poate da informații despre obiectul care o produce. În prezent, folosim această idee pentru a calcula trasee pietonale și a compara expunerea la soare.`,
`La înscriere, am studiat dacă umbra unei persoane poate apărea într-o imagine înaintea persoanei, la un colț fără vizibilitate. Am comparat o scenă goală cu o filmare de mers și o vedere de referință. Apoi am folosit geometria umbrelor în altă aplicație: traseele pietonale. Pentru a calcula umbra unei clădiri avem nevoie de înălțimea ei, care lipsește adesea din hartă. De aici vine întrebarea noastră: în ce condiții putem estima înălțimea din umbră și cât de precisă este metoda față de GlobalBuildingAtlas?`,
`În UMBRA alegem destinația și ora plecării. Calculatorul folosește clădirile, rețeaua pietonală și poziția Soarelui ca să estimeze umbrele și să compare drumurile. Telefonul afișează harta, clădirile tridimensionale și navigarea prin GPS. Aplicația poate propune până la trei variante: traseul rapid, unul echilibrat și unul cu mai multă umbră, în limita ocolului ales. Pentru fiecare sunt afișate distanța, durata și umbra modelată. Traseele folosesc rețeaua pregătită pentru Constanța, Mamaia și Palazu Mare.`,
`Am analizat datele pentru zona Constanța. Din cele cincizeci și una de mii patru sute douăzeci și opt de clădiri, aproape optzeci și opt la sută nu au înălțime sau număr de etaje în setul folosit. Am comparat și estimările GlobalBuildingAtlas cu înălțimile etichetate în OpenStreetMap. Pentru grupul de zece clădiri între douăzeci și patruzeci de metri, valorile GBA sunt, în medie, cu cincisprezece virgulă șapte metri mai mici decât cele din OSM. Este o comparație între două baze de date; ea nu înlocuiește măsurătorile de teren.`,
`Modul de măsurare folosește relația dintre înălțime, lungimea umbrei și unghiul Soarelui. Pe teren plan, înălțimea este lungimea umbrei înmulțită cu tangenta unghiului solar. Aplicația calculează unghiul după loc, dată și oră. Lungimea poate fi obținută cu ruleta sau laserul, prin GPS ori dintr-o fotografie aeriană. O măsurare confirmată poate intra în calculul umbrei și al traseelor. În exemplul calculat, aceeași abatere de cinci metri la lungime produce aproximativ trei virgulă doi metri eroare în octombrie și treisprezece virgulă doi în iunie. Rezultatul arată de ce momentul măsurării contează.`,
`Aceste părți lucrează împreună. Datele despre clădiri și poziția Soarelui dau o estimare a umbrelor. Apoi aplicația compară variantele de traseu după timp și expunere. Utilizatorul alege cât timp în plus acceptă să meargă și ce drum preferă. Astfel, informația obținută din umbre devine un criteriu practic în alegerea traseului. Vă mulțumim!`
];
const times=[20,55,55,60,65,45];const sources=[
['README.md','Fișa de înscriere RoSEF'],
['Fișa de înscriere RoSEF, paginile 1–2','docs/istoric-proiect/README.md','docs/shadow-heights.md'],
['README.md','mobile/src/domain/routes.ts','mobile/src/components/RouteCard.tsx'],
['docs/research/gba-heights/summary.json','mobile/assets/data/constanta-city.json','https://doi.org/10.5194/essd-17-6647-2025'],
['README.md','docs/shadow-heights.md — Implementation status','docs/paper/measurability.json','https://gml.noaa.gov/grad/solcalc/calcdetails.html'],
['README.md','mobile/src/app/index.tsx']];
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
 txt(s,'Trasee pietonale\ncu mai multă umbră',65,322,710,146,51,C.ink,true);
 txt(s,'Hărți, umbre și măsurarea clădirilor',65,494,735,48,28,C.green);
 txt(s,'Haivas Eduard Andrei, Manea Cezar Ștefan,\nPerjoc Eduard Mihai',65,579,735,63,22,C.ink);
 txt(s,'Clasa a X-a. Coordonator: Ramona Rădulescu',65,656,730,30,20,C.gray);
}

// 2. Origin, experiment and current research question.
{
 const s=slide(2,'Originea și întrebarea de cercetare');
 txt(s,'Experimentul inițial',70,172,1010,45,31,C.green,true);
 txt(s,'Am comparat o scenă goală cu o filmare de mers,\npentru a urmări umbra unei persoane înainte de apariția ei.',70,224,1115,88,27,C.ink);
 rect(s,70,337,1120,2,C.line);
 txt(s,'Întrebarea de cercetare',70,370,1100,45,31,C.green,true);
 txt(s,'În ce condiții putem estima înălțimea clădirilor din umbră\nși cât de precisă este metoda față de GlobalBuildingAtlas?',70,424,1110,102,30,C.ink,true);
 txt(s,'De la analiza umbrelor în imagini la folosirea lor pe harta orașului.',70,584,1110,47,25,C.gray);
 txt(s,'Fișa de înscriere și istoricul proiectului.',70,674,1080,23,16,C.gray);
}
// 3. Map and walking route choices, using product labels.
{
 const s=slide(3,'Cum funcționează aplicația');
 txt(s,'Alegi destinația și ora; aplicația calculează umbrele și traseele.',68,159,1125,48,29,C.gray);
 const rows=[['Rapid','Durata cea mai mică'],['Echilibrat','Durată și umbră estimate'],['Mai multă umbră','În limita ocolului ales']];
 for(let i=0;i<3;i++){let y=259+i*95;txt(s,rows[i][0],70,y,470,45,32,C.ink,true);txt(s,rows[i][1],580,y+3,590,40,26,C.gray);if(i<2)rect(s,70,y+74,1120,1,C.line);}
 txt(s,'Harta arată clădirile și umbrele; GPS-ul urmărește traseul ales.',70,575,1115,46,26,C.green,true);
 txt(s,'Rutare: Constanța, Mamaia și Palazu Mare. Până la trei variante disponibile.',70,674,1100,23,16,C.gray);
}
// 4. Dataset and the team's comparison of two height sources.
{
 const s=slide(4,'Ce arată datele despre clădiri');
 txt(s,'Datele aplicației pentru Constanța, Mamaia și Palazu Mare',68,159,1120,48,29,C.gray);
 txt(s,'87,8%',62,255,590,139,109,C.green,true);
 txt(s,'din 51.428 de clădiri nu au\nînălțime sau număr de etaje.',70,407,600,85,29,C.ink,true);
 rect(s,713,257,2,290,C.line);
 txt(s,'Comparația GBA – OSM',765,256,430,45,29,C.ink,true);
 txt(s,'−15,7 m',758,328,430,85,58,C.green,true);
 txt(s,'Diferența medie pentru cele 10 clădiri\ncu înălțimea OSM între 20 și 40 m.',765,428,436,82,25,C.gray);
 txt(s,'Valorile compară două baze de date; OSM este referința acestei analize.',70,674,1100,23,16,C.gray);
}
// 5. Geometry and an example from the error model.
{
 const s=slide(5,'Măsurarea înălțimii din umbră',C.sage);
 rect(s,127,252,110,229,C.cream,C.dark,3);
 ln(s,75,483,649,483,C.gray,3);
 ln(s,158,203,613,483,C.dark,4);
 rect(s,237,483,376,12,C.green);
 ln(s,101,252,101,481,C.green,2);
 txt(s,'h',65,355,38,50,37,C.green,true);
 txt(s,'L',412,506,43,43,34,C.green,true);
 txt(s,'e',550,442,35,33,25,C.green,true);
 txt(s,'Rază solară',330,226,238,37,25,C.gray);
 txt(s,'h = L × tan(e)',715,218,510,90,60,C.dark,true);
 txt(s,'L: lungimea umbrei\ne: unghiul Soarelui\nh: înălțimea estimată',720,323,470,132,29,C.ink);
 txt(s,'Măsurare: ruletă sau laser, GPS\nsau fotografie aeriană.',720,485,475,77,25,C.gray);
 txt(s,'Exemplu calculat: aceeași eroare de ±5 m la lungimea umbrei poate însemna\n±3,2 m la 32,9° sau ±13,2 m la 69,2°.',70,591,1130,74,24,C.ink);
 txt(s,'Model geometric; teren plan. Valorile nu reprezintă măsurători de teren.',70,674,1100,23,16,C.gray);
}
// 6. Product-centered closing.
{
 const s=slide(6,null,C.dark);
 s.images.add({blob:new Uint8Array(await fs.readFile(mapPath)),contentType:'image/png',position:{left:824,top:0,width:456,height:720},fit:'cover'});
 txt(s,'UMBRA',66,72,700,55,34,C.leaf,true);
 txt(s,'O hartă care\nte ajută să\nalegi traseul.',65,178,720,238,60,C.white,true);
 rect(s,70,447,510,2,'#6B916B');
 txt(s,'Compari traseele după durată\nși după umbra estimată.',70,478,700,85,30,'#D5E3D0');
 txt(s,'Vă mulțumim!',70,627,670,42,26,C.leaf,true);
 txt(s,'Date hartă: © OpenStreetMap contributors',844,690,420,20,13,C.gray);
}
pres.slides.items[0].speakerNotes.append('\nAsistență AI pentru redactare, documentare și design. Autorii verifică și își asumă conținutul. Documentele sursă separă funcțiile existente de cercetarea înălțimilor din umbre.\n');
await (await PresentationFile.exportPptx(pres)).save(path.join(DIR,'canva-import.pptx'));
for(let i=0;i<6;i++){const blob=await pres.export({slide:pres.slides.items[i],format:'png',scale:1.5});await fs.writeFile(path.join(DIR,'preview',`slide-${i+1}.png`),new Uint8Array(await blob.arrayBuffer()));}
await fs.writeFile(path.join(DIR,'notes.json'),JSON.stringify({times,total:elapsed,words:speeches.map(x=>x.split(/\s+/).length),speeches},null,2));
console.log('6 slide-uri. Total:',elapsed,'secunde. Cuvinte:',speeches.map(x=>x.split(/\s+/).length).join(','));
