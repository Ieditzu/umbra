import fs from 'node:fs/promises';
import path from 'node:path';
import {Presentation,PresentationFile} from '/Users/maneacezar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const ROOT='/Users/maneacezar/Documents/GitHub/umbra';
const DIR=path.join(ROOT,'work/prezentare-verde-v3');
await fs.mkdir(path.join(DIR,'preview'),{recursive:true});
const C={dark:'#143B2C',green:'#00734B',leaf:'#BBD8A8',sage:'#DFE9D9',cream:'#FAF8F1',ink:'#183427',gray:'#53675A',white:'#FFFFFF',line:'#CFD9CA'};
let count=0;
function rect(s,x,y,w,h,fill,line='none',lw=0,rotation=0){return s.shapes.add({name:`shape-${++count}`,geometry:'rect',position:{left:x,top:y,width:w,height:h,rotation},fill,line:{fill:line,width:lw,style:'solid'}})}
function txt(s,v,x,y,w,h,sz=30,col=C.ink,bold=false){const t=s.shapes.add({name:`text-${++count}`,geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});t.text=v;t.text.insets=0;t.text.style={typeface:'Arial',fontSize:sz,color:col,bold,wrap:'square',verticalAlignment:'top'};return t;}
function ln(s,x1,y1,x2,y2,col=C.green,lw=3){const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy);return rect(s,(x1+x2)/2-L/2,(y1+y2)/2-lw/2,L,lw,col,'none',0,Math.atan2(dy,dx)*180/Math.PI);}
const pres=Presentation.create({slideSize:{width:1280,height:720}});pres.theme.defaultFont='Arial';
const speeches=[
`Pe aceeași stradă, un trotuar poate fi în soare, iar celălalt în umbră. UMBRA este o aplicație care ține cont de această diferență când alegem drumul. Vă arătăm cum funcționează și de unde obține informațiile despre clădiri.`,
`În aplicație alegem destinația și ora plecării. Harta arată clădirile și umbrele estimate pentru momentul ales. Telefonul folosește poziția GPS și afișează traseul, iar calculatorul calculează geometria clădirilor, poziția Soarelui, umbrele și variantele de drum. Putem vedea și clădirile în trei dimensiuni. Pe parcurs, aplicația afișează distanța rămasă și ora estimată a sosirii. Harta și umbrele sunt disponibile pe zone din România; traseele se calculează pe rețeaua pregătită pentru Constanța, Mamaia și Palazu Mare.`,
`Aplicația compară până la trei variante: Rapid, Echilibrat și Mai multă umbră. Pentru fiecare vedem durata, distanța și timpul estimat în umbră. Putem stabili cât timp în plus acceptăm să mergem. Alegem apoi traseul potrivit și îl urmărim pe hartă. Pentru calcul, aplicația folosește rețeaua pietonală și umbra estimată pe segmentele drumului, la momentul în care sunt parcurse. Acolo unde datele nu ajung pentru o estimare, expunerea este afișată ca necunoscută.`,
`O hartă bună are nevoie de mai mult decât conturul clădirilor. În datele pentru Constanța, Mamaia și Palazu Mare avem cincizeci și una de mii patru sute douăzeci și opt de clădiri, dar aproape optzeci și opt la sută nu au informații despre înălțime sau etaje. Pentru a calcula umbra unei clădiri, avem nevoie și de înălțimea ei. Aici intervine partea de cercetare a proiectului.`,
`Din butonul de măsurare alegem o clădire și urmărim pe hartă direcția umbrei. Lungimea se poate introduce după o măsurare cu ruleta sau laserul, cu poziția GPS ori dintr-o fotografie făcută de sus. Aplicația calculează unghiul Soarelui în funcție de loc, dată și oră și estimează înălțimea prin formula de pe ecran. O măsurare confirmată poate fi folosită în calculul umbrelor și al traseelor. Pe teren plan, trebuie să alegem umbra colțului clădirii, nu umbra unui obiect de pe acoperiș.`,
`Ora măsurării contează. În acest exemplu calculat, folosim aceeași abatere de cinci metri la lungimea umbrei. La un unghi solar de treizeci și două virgulă nouă grade, efectul asupra înălțimii este de aproximativ trei virgulă doi metri. La șaizeci și nouă virgulă două grade, ajunge la treisprezece virgulă doi metri. Un Soare mai jos reduce această amplificare, dar umbrele mai lungi pot întâlni obstacole. Valorile de aici sunt calculate cu modelul geometric.`,
`De la măsurare la alegerea unui drum, toate părțile lucrează împreună. Înălțimea unei clădiri ajută la calculul umbrei; harta și ora aleasă arată unde poate cădea aceasta; iar traseele compară durata și expunerea estimată. Utilizatorul hotărăște cât ocol acceptă și ce variantă alege. Rețeaua de rutare folosită acum este pentru Constanța și împrejurimi; aceeași metodă poate fi aplicată și în alte orașe, cu datele necesare. UMBRA adaugă un criteriu simplu când alegem drumul: cât timp petrecem la umbră. Vă mulțumim!`
];
const times=[20,45,50,35,55,45,50];const sources=[
['README.md','docs/paper/umbra-lucrare.pdf'],
['README.md — Use','mobile/src/app/index.tsx','https://www.openstreetmap.org/copyright'],
['mobile/src/domain/routes.ts','mobile/src/components/RouteCard.tsx','README.md'],
['docs/shadow-heights.md §1','mobile/assets/data/constanta-city.json'],
['README.md — Use','docs/shadow-heights.md — Implementation status','mobile/src/engine/shadowMeasure.ts','https://gml.noaa.gov/grad/solcalc/calcdetails.html'],
['docs/paper/measurability.json','docs/shadow-heights.md §3'],
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

// 2. The application: what a user sees and how it operates.
{
 const s=slide(2,'Ce face aplicația UMBRA');
 txt(s,'Harta se schimbă odată cu ora aleasă.',68,165,1080,55,34,C.gray);
 const rows=[['01','Alegi destinația','Pe hartă sau prin căutare.'],['02','Vezi ora și umbrele','Clădiri 3D și umbre estimate.'],['03','Pornești la drum','GPS, timp rămas și ora sosirii.']];
 for(let i=0;i<3;i++){let y=270+i*115;txt(s,rows[i][0],69,y,95,42,27,C.green,true);txt(s,rows[i][1],160,y-4,570,45,33,C.ink,true);txt(s,rows[i][2],160,y+42,570,38,25,C.gray);}
 s.images.add({blob:new Uint8Array(await fs.readFile(mapPath)),contentType:'image/png',position:{left:885,top:218,width:310,height:397},fit:'cover'});
 txt(s,'Hartă din date OpenStreetMap',885,628,310,28,15,C.gray);
 txt(s,'Telefonul afișează harta. Calculatorul pregătește umbrele și traseele.',69,674,1090,23,16,C.gray);
}
// 3. Clear product choices: no fabricated journey statistics.
{
 const s=slide(3,'Cum alegem traseul');
 txt(s,'Comparăm variantele după timp, distanță și umbră.',68,161,1120,49,31,C.gray);
 const rows=[['01','Rapid','Ajungi în cel mai scurt timp.'],['02','Echilibrat','Un compromis între timp și umbră.'],['03','Mai multă umbră','Cauți mai multă umbră în limita ocolului.']];
 for(let i=0;i<3;i++){const y=252+i*113;txt(s,rows[i][0],70,y,65,43,28,C.green,true);txt(s,rows[i][1],160,y-2,470,48,34,C.ink,true);txt(s,rows[i][2],574,y+3,610,41,26,C.gray);if(i<2)rect(s,70,y+88,1125,1,C.line);}
 txt(s,'Tu alegi cât timp în plus accepți să mergi.',70,611,1100,46,30,C.green,true);
 txt(s,'Până la trei variante, în funcție de drumurile și datele disponibile.',70,674,1080,23,16,C.gray);
}
// 4. Why building heights matter to the app.
{
 const s=slide(4,'De ce avem nevoie de înălțimi');
 txt(s,'51.428 de clădiri în zona Constanța',66,161,1100,54,34,C.gray);
 txt(s,'87,8%',58,254,638,150,126,C.green,true);
 txt(s,'fără informații despre\nînălțime sau etaje',68,416,615,107,40,C.ink,true);
 txt(s,'Pentru a calcula umbra unei clădiri,\navem nevoie și de înălțimea ei.',68,557,660,83,27,C.gray);
 const rows=[['271','cu înălțime etichetată'],['5.913','cu număr de etaje'],['45.159','fără informații de înălțime']];
 for(let i=0;i<3;i++){const y=233+i*121;txt(s,rows[i][0],780,y,405,58,45,i===2?C.green:C.ink,true);txt(s,rows[i][1],780,y+59,419,41,25,C.gray);if(i<2)rect(s,780,y+109,420,1,C.line);}
 txt(s,'Constanța, Mamaia și Palazu Mare. Alte 85 de contururi nu intră în categoriile de mai sus.',68,672,1078,25,15,C.gray);
}
// 4. A large physical diagram, with no text crossing the ray or the ground line.
{
 const s=slide(5,'Înălțimea din umbră',C.sage);
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
 txt(s,'Ruletă sau laser · GPS · fotografie aeriană',70,596,630,77,25,C.ink);
 txt(s,'Relație geometrică pentru o clădire verticală și teren plan.',720,654,465,44,17,C.gray);
}

// 5. A positive research result from the error model, explicitly labelled as calculated.
{
 const s=slide(6,'Ora măsurării contează');
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
 const s=slide(7,'Cum ajungem la traseu',C.dark);
 const steps=[['01','Clădirile','Contur și înălțime'],['02','Soarele','Loc, dată și oră'],['03','Umbrele','Estimare pe hartă'],['04','Traseul','Durată și expunere']];
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
for(let i=0;i<7;i++){const blob=await pres.export({slide:pres.slides.items[i],format:'png',scale:1.5});await fs.writeFile(path.join(DIR,'preview',`slide-${i+1}.png`),new Uint8Array(await blob.arrayBuffer()));}
await fs.writeFile(path.join(DIR,'notes.json'),JSON.stringify({times,total:elapsed,words:speeches.map(x=>x.split(/\s+/).length),speeches},null,2));
console.log('7 slide-uri. Total:',elapsed,'secunde. Cuvinte:',speeches.map(x=>x.split(/\s+/).length).join(','));
