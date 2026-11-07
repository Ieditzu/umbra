import fs from 'node:fs/promises';
import path from 'node:path';
import {Presentation,PresentationFile} from '/Users/maneacezar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const ROOT='/Users/maneacezar/Documents/GitHub/umbra';
const DIR=path.join(ROOT,'work/prezentare-10min');
await fs.mkdir(path.join(DIR,'preview'),{recursive:true});
const C={dark:'#143B2C',green:'#00734B',leaf:'#BBD8A8',sage:'#DFE9D9',cream:'#FAF8F1',ink:'#183427',gray:'#53675A',white:'#FFFFFF',line:'#CFD9CA'};
let count=0;
function rect(s,x,y,w,h,fill,line='none',lw=0,rotation=0){return s.shapes.add({name:`shape-${++count}`,geometry:'rect',position:{left:x,top:y,width:w,height:h,rotation},fill,line:{fill:line,width:lw,style:'solid'}})}
function txt(s,v,x,y,w,h,sz=30,col=C.ink,bold=false){const t=s.shapes.add({name:`text-${++count}`,geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});t.text=v;t.text.insets=0;t.text.style={typeface:'Arial',fontSize:sz,color:col,bold,wrap:'square',verticalAlignment:'top'};return t;}
function ln(s,x1,y1,x2,y2,col=C.green,lw=3){const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy);return rect(s,(x1+x2)/2-L/2,(y1+y2)/2-lw/2,L,lw,col,'none',0,Math.atan2(dy,dx)*180/Math.PI);}
const pres=Presentation.create({slideSize:{width:1280,height:720}});pres.theme.defaultFont='Arial';

function page(title,num){let s=pres.slides.add();s.background.fill=C.cream;txt(s,title,64,54,1152,90,50,C.ink,true);txt(s,num,1181,670,45,24,17,C.gray);return s;}
function block(s,title,body,x,y,w=520){txt(s,title,x,y,w,42,27,C.green,true);txt(s,body,x,y+50,w,140,24,C.ink);}
{
let s=page('Cum alegem traseul','04');
txt(s,'Comparăm timpul de mers cu expunerea estimată la soare.',70,157,1130,70,28,C.gray);
const steps=[['1. Datele de intrare','Punct de plecare, destinație, oră și ocolul acceptat.'],['2. Calculul umbrelor','Geometria clădirilor și poziția Soarelui determină zonele umbrite.'],['3. Compararea rutelor','Utilizatorul vede alternativele și alege compromisul potrivit.']];
steps.forEach((r,i)=>{const x=70+i*390;rect(s,x,268,360,235,C.sage);txt(s,r[0],x+20,290,320,50,25,C.green,true);txt(s,r[1],x+20,354,315,130,24,C.ink);});
txt(s,'Ora contează: aceeași stradă poate fi umbrită dimineața și expusă după-amiaza.',70,546,1100,80,27,C.ink,true);
txt(s,'Umbra calculată este o estimare geometrică; nu reprezintă o măsurare a temperaturii sau a radiației UV.',70,665,1100,35,16,C.gray);
s.speakerNotes.text='Durată: 65 secunde. Arătați cum se alege destinația și ora. Explicați că alternativele sunt comparate, nu că există un traseu universal optim. Sursă: README.md, docs/backend/mobile-server.md.';
}
{
let s=page('Când putem măsura umbra?','07');
txt(s,'Vârful umbrei trebuie să rămână liber de alte clădiri.',70,155,1130,48,28,C.gray);
const vals=[[90.1,70.9,'27 oct · 12:00'],[96,78.8,'21 iun · 13:00']];
vals.forEach((v,i)=>{let x=110+i*330;v.slice(0,2).forEach((n,j)=>{let h=n*2.65;rect(s,x+j*110,520-h,75,h,j?C.dark:C.green);txt(s,String(n).replace('.',',')+'%',x+j*110-5,520-h-39,115,33,22,C.ink,true)});txt(s,v[2],x-5,538,280,36,23,C.ink,true)});
rect(s,110,603,20,20,C.green);txt(s,'Toate clădirile: n = 38.913',145,597,610,35,20,C.gray);rect(s,110,638,20,20,C.dark);txt(s,'Clădiri ≥ 20 m: n = 805',145,632,610,35,20,C.gray);
block(s,'Două condiții diferite','O umbră poate fi ușor de observat, dar sensibilă la erori de lungime. Alegem ora după ambele criterii.',800,251,400);
txt(s,'Vara: umbre mai scurte. Iarna: umbre mai lungi, cu risc de suprapunere.',800,474,400,120,24,C.green,true);
txt(s,'Simulare pe contururi de clădiri; procente de eligibilitate geometrică, nu de acuratețe. Sursă: measurability.json.',70,685,1120,24,15,C.gray);
s.speakerNotes.text='Durată: 70 secunde. Aceste procente indică umbre neobstrucționate în simulare. Nu sunt procentul predicțiilor corecte. Arborii, accesul fizic și mașinile nu sunt incluse.';
}
{
let s=page('Cum verificăm metoda pe teren','08');
txt(s,'Protocol de validare: comparăm estimarea cu o referință independentă.',70,159,1120,65,27,C.gray);
block(s,'01 · Măsurarea','Notăm clădirea, locul, data și ora. Măsurăm umbra și repetăm observația în mai multe momente.',70,263);
block(s,'02 · Referința','Folosim o înălțime verificată independent. Nu tratăm automat o etichetă de hartă drept adevăr.',680,263);
block(s,'03 · Erorile','Calculăm diferența în metri și eroarea relativă. Raportăm numărul de clădiri și metoda de măsurare.',70,464);
block(s,'04 · Comparația','Separăm cazurile cu umbre libere de cele obstrucționate și comparăm orele și instrumentele.',680,464);
txt(s,'Protocol propus; analiza bazelor de date și simulările sunt distincte de validarea experimentală.',70,682,1120,25,16,C.gray);
s.speakerNotes.text='Durată: 60 secunde. Prezentați protocolul drept modalitate de verificare, fără să declarați măsurători sau rezultate inexistente. Sursă: docs/shadow-heights.md.';
}
{
let s=page('De la umbră la energie solară','09');
txt(s,'Selectăm un acoperiș și estimăm energia pentru configurația aleasă.',70,158,1120,70,27,C.gray);
block(s,'Ce introduce utilizatorul','Data, puterea totală a panourilor, înclinarea, orientarea și prețul energiei.',70,262,690);
block(s,'Ce arată aplicația','Un interval de energie zilnică și valoarea ei estimată. Umbrirea incertă poate lărgi intervalul.',70,447,690);
s.images.add({blob:new Uint8Array(await fs.readFile('/var/folders/8t/xl8_r5dd75701y_vhvc841j80000gn/T/codex-clipboard-b872cabc-bae2-4e14-9522-6ae10fbb49da.png')),contentType:'image/png',position:{left:880,top:203,width:205,height:445},fit:'contain'});
txt(s,'Exemplu din aplicație',850,653,350,25,17,C.gray);
txt(s,'Estimare pentru comparație; nu garantează producția, rentabilitatea sau posibilitatea instalării.',70,687,1120,25,16,C.gray);
s.speakerNotes.text='Durată: 75 secunde. Explicați captura ca exemplu de rezultat al aplicației, nu energie măsurată. Puterea nominală nu este energia zilnică. Valoarea energiei nu este profit: investiția și consumul nu sunt modelate. Sursă: docs/research/solar-panel-estimate.md și captura furnizată.';
}
await (await PresentationFile.exportPptx(pres)).save(path.join(DIR,'slides-noi.pptx'));
for(let i=0;i<4;i++){const b=await pres.export({slide:pres.slides.items[i],format:'png',scale:1});await fs.writeFile(path.join(DIR,'preview',`slide-${i+1}.png`),new Uint8Array(await b.arrayBuffer()));}
