import fs from 'node:fs/promises';
import path from 'node:path';
import {Presentation,PresentationFile} from '/Users/maneacezar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const ROOT='/Users/maneacezar/Documents/GitHub/umbra';
const DIR=path.join(ROOT,'work/prezentare-noua');
await fs.mkdir(path.join(DIR,'preview'),{recursive:true});
const C={dark:'#143B2C',green:'#00734B',leaf:'#BBD8A8',sage:'#DFE9D9',cream:'#FAF8F1',ink:'#183427',gray:'#53675A',white:'#FFFFFF',line:'#CFD9CA'};
let count=0;
function rect(s,x,y,w,h,fill,line='none',lw=0,rotation=0){return s.shapes.add({name:`shape-${++count}`,geometry:'rect',position:{left:x,top:y,width:w,height:h,rotation},fill,line:{fill:line,width:lw,style:'solid'}})}
function txt(s,v,x,y,w,h,sz=30,col=C.ink,bold=false){const t=s.shapes.add({name:`text-${++count}`,geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});t.text=v;t.text.insets=0;t.text.style={typeface:'Arial',fontSize:sz,color:col,bold,wrap:'square',verticalAlignment:'top'};return t;}
function ln(s,x1,y1,x2,y2,col=C.green,lw=3){const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy);return rect(s,(x1+x2)/2-L/2,(y1+y2)/2-lw/2,L,lw,col,'none',0,Math.atan2(dy,dx)*180/Math.PI);}
const pres=Presentation.create({slideSize:{width:1280,height:720}});pres.theme.defaultFont='Arial';
const speeches=[
`UMBRA compară trasee pietonale după durata mersului și umbra estimată. Harta ne ajută să vedem cum se schimbă umbrele în funcție de oră.`,
`Am pornit de la un experiment despre umbra unei persoane după colț. Apoi am folosit geometria umbrelor clădirilor pentru trasee, estimarea înălțimii și analiza unui punct de pe acoperiș. Întrebarea noastră este cu ce eroare putem estima înălțimea din umbră.`,
`Aplicația are trei funcții: compară traseele, estimează înălțimea clădirilor din umbră și calculează o estimare a energiei pentru panouri solare. Utilizatorul alege destinația și ora, poate selecta o clădire și poate introduce datele panoului. Estimarea solară nu demonstrează că instalarea este posibilă sau profitabilă.`,
`Pe teren plan, înălțimea este lungimea umbrei înmulțită cu tangenta elevației solare. Aplicația calculează unghiul Soarelui din loc, dată și oră; lungimea se introduce sau se estimează prin metodele disponibile. Măsurătorile confirmate după regulile aplicației pot fi folosite în calculul umbrelor și traseelor.`,
`În instantaneul OSM analizat pentru Constanța, Mamaia și Palazu Mare, 87,8% din 51.428 de clădiri nu aveau înălțime sau etaje. Pentru zece clădiri între 20 și 40 de metri, diferența medie dintre GBA și etichetele OSM a fost minus 15,7 metri. Aceasta este o comparație între baze de date, nu o măsurare independentă a preciziei.`,
`Datele despre clădiri și poziția Soarelui leagă traseele, estimarea înălțimilor și calculul pentru panouri. Acestea sunt estimări care depind de date și de condițiile modelului. Vă mulțumim!`
];
const times=[20,45,65,60,65,45];const sources=[['README.md'],['Fișa de înscriere','docs/istoric-proiect/README.md'],['README.md','docs/research/solar-panel-estimate.md'],['docs/shadow-heights.md'],['docs/research/gba-heights/summary.json','docs/paper/measurability.json'],['README.md']];
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

// 2. Scientific question and evolution.
{
 const s=slide(2,'Cum a evoluat ideea');
 txt(s,'De la un experiment cu umbre la o aplicație pentru oraș',68,160,1120,48,28,C.gray);
 const rows=[['01','Umbra unei persoane','Poate apărea înaintea persoanei, la un colț?'],['02','Umbra clădirilor','Unde cade umbra pe străzi și acoperișuri?'],['03','UMBRA astăzi','Trasee pietonale, măsurători și panouri solare.']];
 for(let i=0;i<3;i++){let y=241+i*109;txt(s,rows[i][0],70,y,65,42,26,C.green,true);txt(s,rows[i][1],155,y,560,44,29,C.ink,true);txt(s,rows[i][2],155,y+41,1010,38,24,C.gray);if(i<2){txt(s,'↓',85,y+60,40,40,28,C.green,true);}}
 txt(s,'Cât de precis putem estima înălțimea unei clădiri din umbră\nși cum alegem momentul măsurării?',70,601,1100,70,22,C.ink,true);
 txt(s,'Fișa de înscriere și cercetarea proiectului.',70,674,1100,23,16,C.gray);
}
// 3. Real screenshots from the app, alongside the choices it offers.
{
 const s=slide(3,'Cum funcționează aplicația');
 txt(s,'Alegi destinația și ora, apoi compari traseele.',68,160,1120,48,29,C.gray);
 const rows=[['Trasee pietonale','Compari durata și umbra estimată.'],['Măsoară clădirea','Estimezi înălțimea din lungimea umbrei.'],['Panou solar','Estimezi energia zilnică pe un acoperiș.']];
 for(let i=0;i<3;i++){let y=260+i*92;txt(s,rows[i][0],70,y,520,40,28,C.ink,true);txt(s,rows[i][1],70,y+39,560,35,22,C.gray);}
 txt(s,'Hartă 3D · GPS · oră selectată',70,564,610,42,25,C.green,true);
 txt(s,'Capturi din aplicație. Estimările depind de datele disponibile.',70,674,1080,23,16,C.gray);
 s.images.add({blob:new Uint8Array(await fs.readFile('/Users/maneacezar/Desktop/6666.jpeg')),contentType:'image/jpeg',position:{left:700,top:230,width:145,height:330},fit:'contain'});
 s.images.add({blob:new Uint8Array(await fs.readFile('/Users/maneacezar/Desktop/888.jpeg')),contentType:'image/jpeg',position:{left:865,top:230,width:145,height:330},fit:'contain'});
 s.images.add({blob:new Uint8Array(await fs.readFile('/var/folders/8t/xl8_r5dd75701y_vhvc841j80000gn/T/codex-clipboard-b872cabc-bae2-4e14-9522-6ae10fbb49da.png')),contentType:'image/png',position:{left:1030,top:230,width:145,height:330},fit:'contain'});
 txt(s,'Capturi din aplicație',700,575,480,23,15,C.gray);
}
// 5. Geometry and an example from the error model.
{
 const s=slide(4,'Cum măsurăm din umbră',C.sage);
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
 txt(s,'Unghiul Soarelui depinde de locul, data și ora măsurării.',70,591,1130,74,24,C.ink,true);
 txt(s,'Model geometric; teren plan. Valorile nu reprezintă măsurători de teren.',70,674,1100,23,16,C.gray);
}
// Preserve original two-column data layout; add seasonal chart below.
{
 const s=slide(5,'De ce contează înălțimea');
 txt(s,'Instantaneul OSM analizat: Constanța, Mamaia și Palazu Mare',68,151,1120,38,25,C.gray);
 txt(s,'87,8%',62,213,590,100,80,C.green,true);
 txt(s,'din 51.428 de clădiri nu au\nînălțime sau număr de etaje.',70,329,600,70,25,C.ink,true);
 rect(s,713,213,2,204,C.line);
 txt(s,'GBA față de OSM',765,212,430,38,25,C.green,true);
 txt(s,'−15,7 m',758,256,430,66,48,C.green,true);
 txt(s,'GBA: GlobalBuildingAtlas\nOSM: OpenStreetMap',765,330,440,55,20,C.green,true);
 txt(s,'10 clădiri cu înălțimea OSM între 20 și 40 m.',765,388,440,46,18,C.gray);
 txt(s,'Eroarea estimată în fiecare anotimp',70,451,720,35,25,C.green,true);
 txt(s,'Aceeași abatere de ±5 m la lungimea umbrei · amiaza solară',70,491,1100,29,19,C.gray);
 const rows=[['Primăvară',5.1],['Vară',13.2],['Toamnă',5.1],['Iarnă',2.1]];
 rows.forEach((r,i)=>{let x=70+i*285;txt(s,r[0],x,534,240,28,21,C.green,true);rect(s,x,579,r[1]*15,16,C.green);txt(s,'±'+String(r[1]).replace('.',',')+' m',x,602,240,28,22,C.ink,true);txt(s,'±'+String(Math.round(r[1]*5*10)/10).replace('.',',')+'%',x,634,240,26,19,C.green,true)});
 txt(s,'Procente: eroare relativă pentru h = 20 m. Model la echinocții/solstiții, nu precizie măsurată.',70,674,1100,23,16,C.gray);
}
// 6. A closing that connects the three functions.
{
 const s=slide(6,'Ce aduce UMBRA',C.dark);
 txt(s,'O singură hartă. Trei moduri de a folosi umbrele.',70,172,1110,55,33,C.leaf,true);
 txt(s,'Compari trasee pietonale după timp și umbră.\nEstimezi înălțimea clădirilor din umbra lor.\nAnalizezi potențialul unui panou într-un punct de pe acoperiș.',70,267,1100,170,28,C.white);
 rect(s,70,471,1080,2,'#6B916B');
 txt(s,'Datele despre clădiri și poziția Soarelui leagă\ncele trei funcții ale aplicației.',70,510,1100,80,29,'#D5E3D0');
 txt(s,'Vă mulțumim!',70,634,700,37,25,C.leaf,true);
}
pres.slides.items[0].speakerNotes.append('\nAsistență AI pentru redactare, documentare și design. Autorii verifică și își asumă conținutul. Documentele sursă separă funcțiile existente de cercetarea înălțimilor din umbre.\n');
await (await PresentationFile.exportPptx(pres)).save(path.join(DIR,'canva-import.pptx'));
for(let i=0;i<6;i++){const blob=await pres.export({slide:pres.slides.items[i],format:'png',scale:1.5});await fs.writeFile(path.join(DIR,'preview',`slide-${i+1}.png`),new Uint8Array(await blob.arrayBuffer()));}
await fs.writeFile(path.join(DIR,'notes.json'),JSON.stringify({times,total:elapsed,words:speeches.map(x=>x.split(/\s+/).length),speeches},null,2));
console.log('6 slide-uri. Total:',elapsed,'secunde. Cuvinte:',speeches.map(x=>x.split(/\s+/).length).join(','));
