import fs from 'node:fs/promises';
import path from 'node:path';
import {Presentation,PresentationFile} from '/Users/maneacezar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const ROOT='/Users/maneacezar/Documents/GitHub/umbra';
const DIR=path.join(ROOT,'work/prezentare-solara');
await fs.mkdir(path.join(DIR,'preview'),{recursive:true});
const C={dark:'#143B2C',green:'#00734B',leaf:'#BBD8A8',sage:'#DFE9D9',cream:'#FAF8F1',ink:'#183427',gray:'#53675A',white:'#FFFFFF',line:'#CFD9CA'};
let count=0;
function rect(s,x,y,w,h,fill,line='none',lw=0,rotation=0){return s.shapes.add({name:`shape-${++count}`,geometry:'rect',position:{left:x,top:y,width:w,height:h,rotation},fill,line:{fill:line,width:lw,style:'solid'}})}
function txt(s,v,x,y,w,h,sz=30,col=C.ink,bold=false){const t=s.shapes.add({name:`text-${++count}`,geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});t.text=v;t.text.insets=0;t.text.style={typeface:'Arial',fontSize:sz,color:col,bold,wrap:'square',verticalAlignment:'top'};return t;}
function ln(s,x1,y1,x2,y2,col=C.green,lw=3){const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy);return rect(s,(x1+x2)/2-L/2,(y1+y2)/2-lw/2,L,lw,col,'none',0,Math.atan2(dy,dx)*180/Math.PI);}
const pres=Presentation.create({slideSize:{width:1280,height:720}});pres.theme.defaultFont='Arial';
const speeches=[
`Pe aceeași stradă putem merge pe un trotuar în soare sau pe unul în umbră. UMBRA ajută pietonii să compare traseele și după umbra estimată, nu doar după durata drumului.`,
`Proiectul a pornit de la un experiment despre o persoană aflată după colț. Am comparat o scenă goală cu o filmare de mers și am urmărit dacă umbra apare în imagine înaintea persoanei. Apoi am folosit geometria umbrelor într-o altă direcție: o hartă care ne ajută să alegem trasee pietonale.`,
`În aplicație alegem destinația și ora plecării. Calculatorul folosește clădirile, rețeaua pietonală și poziția Soarelui pentru a estima umbrele și a compara traseele. Telefonul afișează harta și poziția prin GPS. Putem compara variante rapide, echilibrate sau cu mai multă umbră, în limita ocolului ales. Aplicația are rețele pregătite pentru București și celelalte reședințe de județ. Pentru a calcula umbra unei clădiri avem însă nevoie de înălțimea ei.`,
`În datele OpenStreetMap analizate pentru Constanța, Mamaia și Palazu Mare, optzeci și șapte virgulă opt la sută dintre cele cincizeci și una de mii patru sute douăzeci și opt de clădiri nu aveau înălțimea sau numărul de etaje. Am comparat și GlobalBuildingAtlas cu etichetele OSM. În grupul de zece clădiri între douăzeci și patruzeci de metri, diferența medie GBA minus OSM a fost minus cincisprezece virgulă șapte metri. Aceasta este o comparație între baze de date, nu o măsurare independentă pe teren. Datele lipsă ne-au dus la întrebarea de cercetare.`,
`Cu ce eroare putem estima înălțimea din umbră și când rămâne vârful umbrei neobstrucționat? Pe teren plan folosim relația h egal L înmulțit cu tangenta elevației solare. Aplicația calculează unghiul după loc, dată și oră, iar lungimea poate fi măsurată cu ruleta, laserul, GPS-ul sau dintr-o fotografie aeriană. O valoare confirmată după regulile aplicației poate fi folosită la calculul umbrelor și traseelor. Precizia trebuie comparată cu înălțimi de referință măsurate independent.`,
`Aceeași geometrie este folosită într-o funcție experimentală pentru panouri solare. Alegem clădirea, ziua, puterea nominală, orientarea și înclinarea. Aplicația estimează energia zilnică folosind un model simplificat de cer senin și umbra directă a clădirilor asupra unui punct de pe acoperiș. Un interval arată unele incertitudini de înălțime. Este o estimare, nu producție măsurată: modelul nu include norii sau toate obstacolele și nu a fost comparat cu un panou real.`,
`UMBRA leagă datele despre oraș de două întrebări practice: ce traseu alegem și cum poate influența umbra un panou solar. Datele despre clădiri și măsurarea înălțimilor stau la baza ambelor estimări. Vă mulțumim!`
];
const times=[20,35,50,55,55,45,40];const sources=[['README.md'],['Fișa de înscriere RoSEF','docs/istoric-proiect/README.md'],['README.md','mobile/src/components/RouteCard.tsx'],['scripts/build-paper.py','docs/research/gba-heights/summary.json'],['docs/shadow-heights.md','scripts/build-paper.py'],['docs/research/solar-panel-estimate.md','server/compute/solar-power.mjs','README.md'],['README.md']];
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
 s.images.add({blob:new Uint8Array(await fs.readFile("/Users/maneacezar/Desktop/000.jpeg")),contentType:"image/jpeg",position:{left:832,top:0,width:448,height:687},fit:'cover'});
 rect(s,832,687,448,33,C.sage);
 txt(s,'Captură din aplicația UMBRA · Constanța',849,695,418,20,14,C.gray);
 txt(s,'RoSEF 2026',65,62,710,32,23,C.green,true);
 txt(s,'UMBRA',57,164,738,130,115,C.dark,true);
 txt(s,'Trasee pietonale\ncu mai multă umbră',65,322,710,146,51,C.ink,true);
 txt(s,'Hărți, umbre și măsurarea clădirilor',65,494,735,48,28,C.green);
 txt(s,'Haivas Eduard Andrei, Manea Cezar Ștefan,\nPerjoc Eduard Mihai',65,579,735,63,22,C.ink);
 txt(s,'Clasa a X-a. Coordonator: Ramona Rădulescu',65,656,730,30,20,C.gray);
}

// 2. Origins and transition to the application.
{
 const s=slide(2,'De la prima idee la UMBRA');
 txt(s,'Experimentul inițial',70,177,1000,45,31,C.green,true);
 txt(s,'Am analizat dacă umbra unei persoane apare în imagine\nînainte ca persoana să iasă de după colț.',70,229,1100,88,28,C.ink);
 rect(s,70,346,1120,2,C.line);
 txt(s,'Direcția de astăzi',70,385,1050,45,31,C.green,true);
 txt(s,'Folosim geometria umbrelor clădirilor pentru a compara\ntrasee pietonale și pentru a studia acoperișurile.',70,441,1100,99,30,C.ink,true);
 txt(s,'Fișa de înscriere și istoricul proiectului.',70,674,1050,23,16,C.gray);
}
// 3. Real screenshots from the app, alongside the choices it offers.
{
 const s=slide(3,'Cum funcționează aplicația');
 txt(s,'Alegi destinația și ora, apoi compari traseele.',68,160,1120,48,29,C.gray);
 const rows=[['Rapid','Durata cea mai mică'],['Echilibrat','Durată și umbră estimate'],['Mai multă umbră','În limita ocolului ales']];
 for(let i=0;i<3;i++){let y=260+i*92;txt(s,rows[i][0],70,y,380,40,29,C.ink,true);txt(s,rows[i][1],70,y+39,435,35,23,C.gray);}
 txt(s,'Hartă 3D și navigare prin GPS',70,564,610,42,26,C.green,true);
 txt(s,'Rețele pietonale în București și alte 40 de reședințe de județ.',70,674,1080,23,16,C.gray);
 s.images.add({blob:new Uint8Array(await fs.readFile('/Users/maneacezar/Desktop/6666.jpeg')),contentType:'image/jpeg',position:{left:747,top:213,width:190,height:411},fit:'contain'});
 s.images.add({blob:new Uint8Array(await fs.readFile('/Users/maneacezar/Desktop/888.jpeg')),contentType:'image/jpeg',position:{left:970,top:213,width:190,height:411},fit:'contain'});
 txt(s,'Capturi din aplicație',750,633,400,23,15,C.gray);
}
// 4. Dataset and the team's comparison of two height sources.
{
 const s=slide(4,'Ce arată datele despre clădiri');
 txt(s,'Instantaneul OSM analizat: Constanța, Mamaia și Palazu Mare',68,159,1120,48,29,C.gray);
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
 const s=slide(5,'Cum estimăm înălțimea',C.sage);
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
 txt(s,'Ruletă sau laser, GPS\nsau fotografie aeriană.',720,485,475,77,25,C.gray);
 txt(s,'Întrebarea: cu ce eroare estimăm înălțimea și când\nrămâne vârful umbrei neobstrucționat?',70,591,1130,74,24,C.ink,true);
 txt(s,'Model geometric; teren plan. Valorile nu reprezintă măsurători de teren.',70,674,1100,23,16,C.gray);
}
// 6. The newer photovoltaic feature.
{
 const s=slide(6,'Umbra și panourile solare');
 txt(s,'O altă utilizare a geometriei clădirilor',68,161,1100,48,29,C.gray);
 const rows=[['01','Alegi clădirea și ziua','Selectezi un punct de pe acoperiș.'],['02','Introduci datele panoului','Puterea, înclinarea și orientarea.'],['03','Primești o estimare','Energie zilnică și efectul umbrei clădirilor.']];
 for(let i=0;i<3;i++){let y=250+i*113;txt(s,rows[i][0],70,y,70,42,27,C.green,true);txt(s,rows[i][1],160,y-2,600,45,31,C.ink,true);txt(s,rows[i][2],160,y+43,1010,36,25,C.gray);}
 txt(s,'Model simplificat de cer senin · funcție experimentală',70,620,1110,36,22,C.green,true);
 txt(s,'Estimare la un punct de pe acoperiș; nu include norii și nu este energie măsurată.',70,674,1100,23,16,C.gray);
}
// 6. Product-centered closing.
{
 const s=slide(7,null,C.dark);
 s.images.add({blob:new Uint8Array(await fs.readFile('/Users/maneacezar/Desktop/000.jpeg')),contentType:'image/jpeg',position:{left:824,top:0,width:456,height:720},fit:'cover'});
 txt(s,'UMBRA',66,72,700,55,34,C.leaf,true);
 txt(s,'O hartă care\nte ajută să\nalegi traseul.',65,178,720,238,60,C.white,true);
 rect(s,70,447,510,2,'#6B916B');
 txt(s,'Compari traseele după durată\nși după umbra estimată.',70,478,700,85,30,'#D5E3D0');
 txt(s,'Vă mulțumim!',70,627,670,42,26,C.leaf,true);
}
pres.slides.items[0].speakerNotes.append('\nAsistență AI pentru redactare, documentare și design. Autorii verifică și își asumă conținutul. Documentele sursă separă funcțiile existente de cercetarea înălțimilor din umbre.\n');
await (await PresentationFile.exportPptx(pres)).save(path.join(DIR,'canva-import.pptx'));
for(let i=0;i<7;i++){const blob=await pres.export({slide:pres.slides.items[i],format:'png',scale:1.5});await fs.writeFile(path.join(DIR,'preview',`slide-${i+1}.png`),new Uint8Array(await blob.arrayBuffer()));}
await fs.writeFile(path.join(DIR,'notes.json'),JSON.stringify({times,total:elapsed,words:speeches.map(x=>x.split(/\s+/).length),speeches},null,2));
console.log('7 slide-uri. Total:',elapsed,'secunde. Cuvinte:',speeches.map(x=>x.split(/\s+/).length).join(','));
