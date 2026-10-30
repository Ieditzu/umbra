from pathlib import Path
import re
ROOT=Path('/Users/maneacezar/Documents/GitHub/umbra')
s=(ROOT/'tmp/research/paper-revised.md').read_text()

def replace_between(start,end,new):
    global s
    a=s.index(start);b=s.index(end,a);s=s[:a]+new+s[b:]

s=s.replace('Versiune documentată la 24 octombrie 2026. Zona propusă de studiu este Constanța, România. Autorii, instituția și mentorul nu au fost comunicați pentru această versiune și trebuie înscriși înainte de depunere. Statutul cercetării este de fundamentare bibliografică și metodă propusă, fără rezultate experimentale de teren.','Versiune documentată la 26 octombrie 2026. Raport despre sistemul final propus și contribuția UMBRA-R. Constanța este pilotul principal; extinderea în alte orașe este proiectată, fără validare geografică generală. Autorii, instituția și mentorul trebuie completați de echipă. Nu sunt disponibile rezultate proprii confirmate privind acuratețea în teren sau superioritatea UMBRA-R.')
replace_between('Pietonii care se deplasează','\n\nCuvinte cheie:', '''Pietonii care se deplasează între aceleași puncte pot întâlni expuneri directe la soare diferite. Rutarea după umbră depinde de un model urban ale cărui înălțimi și căi pietonale pot fi incomplete. UMBRA SmartRoute este proiectată ca aplicație extensibilă geografic, care afișează umbrele clădirilor pentru data și ora alese și compară durata, distanța, expunerea estimată și ocolul. Întrebarea științifică este dacă modelarea incertitudinii înălțimilor permite alegerea mai fiabilă a rutelor umbrite. Contribuția propusă, UMBRA-R, combină durata cu expunerea medie și dezacordul dintre scenarii geometrice. Evaluarea planificată compară A, traseul rapid, B, rutarea nominală, și C, UMBRA-R, la aceeași limită de ocol. Constanța rămâne pilotul pentru validarea spațio-temporală a umbrelor prin puncte observate, fotografii, repere metrice și parcurgeri documentate. Un al doilea oraș poate fi investigat exploratoriu. Copia locală a proiectului conține un motor geometric și de rutare pe telefon; metoda C completă și încărcarea generică a altui oraș nu sunt demonstrate. Verificarea structurii datelor și testele software sunt separate de experimentele în teren. Lucrarea descrie sistemul final urmărit și un protocol falsificabil; nu afirmă încă reducerea reală a expunerii prin UMBRA-R.''')
s=s.replace('Contribuția proprie propusă are trei componente verificabile:', 'Contribuția proprie propusă are trei componente verificabile:')
newarch='''## 4. Arhitectura aplicației finale

### 4.1 Modelul digital al orașului și vizualizarea umbrelor

Sistemul final propus separă cinci niveluri: pachetul geografic, modelul geometric, evaluarea expunerii, optimizarea și interfața. Datele geografice cuprind rețeaua pietonală și amprentele clădirilor din OSM sau surse compatibile. Pentru fiecare obiect, înălțimea provine din height, niveluri, un produs extern licențiat sau o verificare locală. Proveniența și intervalul de incertitudine sunt păstrate până la afișare. Datele brute și geometria derivată au versiuni distincte, astfel încât o hartă și un traseu să poată fi reconstruite din aceeași configurație.

Modelul inițial LoD1 extrudează amprentele la înălțimile selectate, pe teren aproximativ plan. Coordonatele, data și momentul UTC determină azimutul și elevația solară. Amprentele sunt proiectate în direcția opusă Soarelui, reunite și intersectate cu poliliniile pietonale. Motorul pentru afișare calculează poligoane de umbră în fereastra hărții; motorul pentru expunere poate testa direct intersecția razei către Soare cu prismele. Cele două reprezentări trebuie comparate prin aceleași scene de test, deoarece o imagine plauzibilă nu demonstrează corectitudinea clasificării rutei.

Umbrele sunt recalculate la modificarea orei și la momentele de traversare ale segmentelor. Un rezultat întârziat nu trebuie să înlocuiască o cerere mai nouă. Calculele anulate, aria neacoperită și geometria nesuportată produc stări explicite. Memoria cache folosește cel puțin versiunea zonei, momentul, fereastra și configurația înălțimilor; două scenarii diferite nu trebuie să reutilizeze accidental aceeași umbră.

Interfața finală va afișa clădiri, drumuri pietonale, umbre estimate și zone necunoscute. Culorile trebuie să distingă umbra susținută de model, intervalul incert și amprentele fără înălțime. O regiune fără poligon de umbră nu este automat soare: lipsa unui obstacol din inventar poate ascunde o umbră reală. Stratul de fond Apple/Google și reprezentarea sa 3D sunt distincte de geometria folosită la calcul. Arborii, balcoanele, pantele, norii și datele eronate limitează apropierea dintre model și realitate.

FIG CITY

Figura 1. Arhitectura multi-oraș propusă. Desen vectorial propriu. Motorul și pachetul local există în cod; registrul și încărcarea generică a altor orașe sunt proiectate. Validarea rămâne locală fiecărei zone.

### 4.2 Extinderea geografică și pachetele de oraș

Generalitatea metodei înseamnă că grafurile, geometria solară și scenariile pot descrie o altă zonă cu date compatibile. Implementarea acestei generalități cere un registru de orașe și un format comun. Fiecare pachet propus conține city_id, limite, sistem de coordonate, versiunea grafului, sursa și data OSM, clădiri, clasele înălțimilor, licență, verificări de integritate și raportul de calitate. Selectarea orașului încarcă și verifică pachetul, fără a modifica logica funcțiilor de cost.

O transformare metrică adecvată fiecărei zone este esențială. Codul curent folosește EPSG:32635 și referințe explicite la Constanța; acestea trebuie parametrizate, nu copiate orbește într-un oraș îndepărtat. Poziția solară folosește coordonatele zonei și momentul UTC, iar eticheta locală a orei provine din fusul IANA ales. Intervalele de înălțime și parametrii de calibrare nu sunt transferați ca adevăruri universale. O clădire cu același număr de niveluri poate avea altă structură în alt context urban.

În zona fără suficiente înălțimi se afișează incertitudinea și se poate oferi numai A sau o comparație parțială. Dacă rețeaua este deconectată ori punctele sunt în afara acoperirii, se refuză ruta afectată, cu motiv. Un sistem sigur din punct de vedere al integrității informației nu inventează clădiri, conexiuni sau soare. Acoperirea unui pachet nu dovedește accesul legal al fiecărei muchii și nici inventarul complet al obstacolelor.

Validarea este o a treia dimensiune, distinctă de metodă și implementare. Constanța este pilotul principal propus; nu există în acest raport rezultate de teren confirmate nici pentru acesta. Experimentul E5 poate verifica transferul într-un al doilea oraș, după audit și adaptarea proiecției. Posibilitatea de a încărca o hartă nu dovedește aceeași precizie în toate orașele. Nu se promite acoperire globală.

### 4.3 Interfața și funcționalitățile utilizatorului

Fluxul final urmărit este: utilizatorul selectează zona și deschide harta; verifică limitele de acoperire; stabilește A și B; alege data, ora și bugetul de ocol; solicită alternativele; compară distanța, durata, expunerea și incertitudinea. Modificarea orei actualizează umbra și ruta. Originea poate proveni dintr-o poziție GPS sau dintr-un punct ales explicit; nivelul de precizie GPS trebuie afișat, deoarece poziția aproximativă poate schimba trotuarul atribuit.

| Funcționalitate finală | Comportament urmărit | Dovadă necesară înainte de revendicare |
| Hartă, clădiri și drumuri | Straturi cu atribuirea datelor și limite de acoperire | Verificare pe dispozitiv și potrivirea cu pachetul |
| Umbre la data și ora alese | Poligoane și necunoscut distinct | Scene geometrice și validare E4 |
| Alternative A B C | Același buget de ocol și aceleași intrări | Rulări E3 cu metodă și parametri exportați |
| Comparația expunerii | Secunde în soare, umbră și necunoscut | Concordanță între afișare și integrarea pe rută |
| Schimbarea orașului | Selectarea unui pachet compatibil | Import, verificare și experiment E5 |

O hartă tridimensională nativă nu certifică modelul de calcul. În această revizuire nu s-au obținut capturi noi din aplicația pornită și nu sunt inserate machete prezentate ca dovezi. Diagramele sunt explicative și sunt etichetate ca arhitectură, nu ca interfață finalizată.

'''
s=s.replace('## 4. Datele pentru zona pilot din Constanța',newarch+'## 4. Date geografice și auditul pilotului Constanța')
s=s.replace('Prezența unui atribut nu garantează verificarea lui prin măsurare.','Prezența unui atribut nu garantează verificarea lui prin măsurare.')
s=s.replace('Nu s-a realizat în această etapă un recensământ al clădirilor din oraș.','La revizuire a fost inspectat pachetul local inclus în aplicație; acesta este un extras cu limite proprii, nu un recensământ administrativ al orașului.')
s=s.replace('Documentația locală conține o verificare pilot anterioară [16], dar inventarul nu a fost reprodus aici; nu este folosit ca procent confirmat pentru Constanța.','Pachetul local actual a fost decomprimat și numărat la 26 octombrie 2026 [16]. Amprentele SHA-256 ale fișierului împachetat și ale JSON-ului decomprimat coincid cu manifestul. Sunt 50 071 noduri, 111 552 muchii orientate și 51 428 amprente de clădiri. Clasele sunt 271 cu atribut height, 5 913 estimate din niveluri, 45 159 fără înălțime și 85 structuri suspendate nesuportate. Aceste numărători descriu disponibilitatea în extrasul 28,50–28,75° E și 44,075–44,355° N, nu precizia ori completitudinea întregii Constanțe. Snapshotul declarat este 25 octombrie 2026, 21:21:21 UTC; o valoare height nu este automat măsurare validată.')
s=s.replace('Implementarea propusă folosește o bibliotecă verificată, în locul unei formule aproximative nesupuse testării.','Motorul local inspectat implementează un calcul geometric NOAA/Meeus în solar.ts. Fișierele de test includ referințe SPA pentru anotimpuri și tranziția sezonieră, însă suita motorului nu a putut fi reexecutată complet în această revizuire din cauza dependențelor locale lipsă. SPA/pvlib rămân referințe pentru verificare independentă; nu sunt prezentate drept biblioteci folosite deja de aplicație.')
s=s.replace('Prima versiune poate limita evaluarea la α ≥ 10°, prag operațional propus, nu constantă fizică.','Codul curent refuză proiecția normală sub α = 5°. Pentru experiment se poate impune anterior un prag mai restrictiv, de exemplu 10°, fără a-l confunda cu regula implementată. Ambele sunt praguri operaționale, nu constante fizice.')
s=s.replace('Figura 1. Secțiune verticală','Figura 2. Secțiune verticală')
s=s.replace('Figura 2. Fluxul propus','Figura 3. Fluxul propus')
# Tri-state exposure is necessary for honest evaluation with incomplete inventories.
anchor='Expunerea are unitatea secunde.'
s=s.replace(anchor,'''Într-un inventar incomplet, clasificarea este ternară: umbră, soare sau necunoscut. Integrala binară de mai sus se aplică unei referințe definite sau punctelor clasificate. Se păstrează separat E_soare și E_necunoscut; o limită geometrică de expunere este [E_soare, E_soare + E_necunoscut]. Fără audit nu se înlocuiește necunoscut cu soare în raportarea observațiilor. O penalizare internă conservatoare poate trata necunoscut drept cost, dar acesta nu devine timp măsurat în soare.

'''+anchor)
replace_between('### 7.2 Stadiul verificat al proiectului','\n\n## 8. Protocolul experimental', '''### 7.2 Stadiul implementării și componentele planificate

Copia locală identifică origin ca https://github.com/Ieditzu/umbra și revizia inspectată ca f71e140. Accesul web la adresă a returnat 404; analiza se bazează pe fișierele locale, fără a presupune identitatea cu o stare distantă inaccesibilă. Au fost inspectate motorul TypeScript, legarea lui în aplicație, manifestul și testele. Arhitectura finală pornește de la acest motor local; serverul Go este o unealtă de referință, nu o condiție de utilizare a aplicației [16].

| Componentă | Dovezi în copia locală | Stadiu și limită |
| Hartă și straturi | RouteMap.tsx, useShadowLayer.ts | Cod pentru poligoane, rută și poziție; fără verificare nouă pe telefon |
| Date geografice | constanta-city.json și manifest.json | Decomprimare, numărători și hash verificate; fără audit în teren |
| Poziție solară și umbre | solar.ts, overlay.ts, exposure.ts | Implementate în cod; reluarea completă a testelor motorului blocată de dependențe |
| Rutare locală | routing.ts, localEngine.ts, PlannerProvider.tsx | Dijkstra, candidate și reevaluare temporală în cod; fără performanță măsurată pe telefon aici |
| Metoda B experimentală | Modelul nominal din raport | Necesită mod distinct și export pentru comparație controlată |
| UMBRA-R C complet | Funcție de cost și protocol | Scenarii de înălțime și dispersie pe rută încă de implementat și evaluat |
| Extindere multi-oraș | Pregătire pachet; încărcare actuală fixă Constanța | Registru, selecție de pachet și CRS parametrizat propuse |
| Validare fizică | Fișe E4 și E5 propuse | Nicio campanie de teren confirmată în dovezile inspectate |

Motorul curent folosește intervale pentru înălțimi și clasifică prudent expunerea. Pentru lipsa unui inventar auditat, absența umbrei este necunoscut, nu soare confirmat. Selecția candidatelor minimizează un upperSun care include soarele plus necunoscutul; nu calculează încă media și dispersia pe scenarii cerute de C. Etichetele fastest, balanced și shadiest din interfață nu sunt dovada implementării separate a A, B și C. Calculul umbrei afișate din limita inferioară a înălțimii trebuie explicat distinct de umbra nominală experimentală.

Au fost reexecutate cele 12 teste din routes.test.mjs, toate reușite. La tentativa întregii suite, runnerul a raportat 23 verificări reușite și 3 eșecuri: fișierele engine și packedData nu au putut fi încărcate din cauza pachetelor lipsă, iar verificarea SDK nu a găsit instalarea Expo. Acestea sunt blocaje de mediu, nu rezultate de acuratețe a umbrelor. Documentația conține verificări anterioare mai ample, care nu sunt declarate drept reexecutate aici. Nu s-au măsurat precizia în teren, latența pe telefon sau avantajul UMBRA-R.

''')
# Add routing-method diagram before algorithm section, preserve the earlier detailed mathematics.
marker='### 7.1 Alegerea unei soluții realizabile'
s=s.replace(marker,'''FIG ROUTES

Figura 4. Comparația controlată a metodelor. Desen vectorial propriu. Aceleași intrări și aceeași limită de ocol; evaluatorul independent nu transmite algoritmilor înălțimile ascunse.

'''+marker)
s=s.replace('Toate cele patru experimente sunt „Protocol propus — neexecutat”. Testele clientului raportate în secțiunea 7.2 sunt o verificare software separată.','E1–E4 sunt protocoale de cercetare planificate, iar E5 este opțional. Există teste software și verificări istorice în repository, dar nu sunt echivalate cu executarea integrală a acestor experimente. Verificările reluate în revizuire sunt descrise în secțiunea 7.2.')
s=s.replace('Statut: Protocol propus — neexecutat.','Statut: Rezultat neobținut — experiment planificat.')
s=s.replace('De completat','Rezultat neobținut')
# E4 becomes the central independent validation, replacing duplicated field paragraphs below.
replace_between('### 8.5 Experimentul 4 Validarea pe teren','\n\n### 8.6 Indicatorii', '''### 8.5 Experimentul 4 Validarea spațio-temporală a umbrelor simulate

Statut: Rezultat neobținut — experiment planificat. Obiectivul central este măsurarea apropierii umbrei afișate de umbra observată, nu declararea identității lor. Datele necesare sunt versiunea hărții, coordonatele și reperele punctelor, momentele UTC și locale, configurația înălțimilor, fotografii și fișe independente. Interfața trebuie să exporte sau să salveze poligonul simulat pentru momentul observației, nu doar o imagine fără metadate.

Eșantionarea propusă selectează înaintea predicției șase clădiri accesibile din cel puțin trei străzi, cu înălțimi și orientări diferite. Două clădiri sunt alocate calibrării, patru testului. La fiecare clădire se fixează patru puncte cu repere: aproape de limita probabilă, de-o parte și de alta și un control mai îndepărtat. Două momente cu Soare vizibil produc până la 48 observații, dintre care cel mult 32 de test. Numerele sunt o țintă de colectare, nu un eșantion deja realizat. Repetările aceleiași clădiri nu sunt independente; intervalele se calculează pe blocuri de clădire.

Pașii sunt: 1 se fixează lista punctelor și împărțirea calibrare/test înaintea evaluării; 2 se sincronizează ceasurile și se salvează ora cu fus; 3 se generează umbra la exact momentele programate; 4 observatorul notează fără a consulta eticheta prezisă umbră, soare ori necunoscut și sursa ei; 5 se realizează fotografii cu reper de poziție și, unde este posibil, scară metrică; 6 se compară observațiile cu poligonul și clasificarea la aceleași coordonate; 7 se calculează indicatorii; 8 se clasifică sursele erorilor fără a elimina cazurile nefavorabile.

FIG VALIDATION

Figura 5. Validarea spațio-temporală independentă. Desen propriu vectorial. Predicția și observația sunt reunite după identificator și moment; punctele de test nu sunt folosite la reglarea parametrilor.

Coordonata GPS este însoțită de precizia raportată, fără a o trata ca eroare gaussiană sau limită garantată. În canion urban se prioritizează reperele fizice și o măsurare locală a distanței, deoarece GPS-ul poate deplasa punctul pe celălalt trotuar. Dacă distanța față de limita umbrei este comparabilă cu incertitudinea poziției, observația se marchează ambiguă și se raportează separat. La măsurarea limitei se folosesc transecte prestabilite pe sol și un reper metric; distanța măsurată și incertitudinea măsurării rămân în fișă.

Cerul se notează la fiecare observație. Norii pot elimina contrastul umbrei fără ca geometria clădirii să fie greșită. Observațiile sub nor se păstrează cu etichetă meteo și nu se forțează în soare/umbră geometrică. Umbra arborilor este marcată ca sursă distinctă; o eroare produsă de un copac nu trebuie atribuită înălțimii clădirii. Nu se fotografiază persoane identificabile fără acord și nu se traversează în locuri nepermise.

Pe punctele cu referință clară se definește umbra drept clasa pozitivă. TP înseamnă umbră prezisă și observată, FP umbră prezisă dar soare observat, FN soare prezis dar umbră observată, TN soare în ambele. Acuratețea pe predicții binare este (TP + TN)/N_bin, precizia umbrei TP/(TP + FP), iar sensibilitatea TP/(TP + FN). Un numitor zero produce indicator nedefinit, nu 100%. Predicțiile necunoscute nu sunt șterse: se raportează acoperirea N_bin/N_ref, numărul abținerilor și sensibilitatea operațională TP/N_ref_umbră. Astfel, un sistem care declară numai câteva umbre ușoare nu pare automat precis pe întregul eșantion.

Pentru fiecare transect se măsoară abaterea limitei în metri; dacă sensul este definit, se păstrează și semnul. Pentru o rută se înregistrează momentele de intrare și ieșire din umbră, opririle și vremea. E_obs este suma duratelor însorite observate, iar eroarea de predicție este |E_est − E_obs|, numai pe acoperire comparabilă. În prezența intervalelor necunoscute se raportează limite și acoperire, nu un număr exact inventat. A, B și C se parcurg simultan cu observatori diferiți sau în ordine alternată cu diferențele temporale documentate.

| Fișă de colectare E4 | Câmpuri obligatorii |
| Punct observat | ID, clădire, coordonate, reper, incertitudine de poziție |
| Moment și condiții | Dată, UTC, oră locală, cer, sursa umbrei |
| Pereche de etichete | Prezis și observat: umbră, soare ori necunoscut |
| Limită geometrică | Transect, abatere m, instrument și incertitudine |
| Trasabilitate | Foto, versiune date/cod, parametri, calibrare sau test |
| Stadiu | Rezultat neobținut — experiment planificat |

Interpretarea cere concordanță și acoperire raportate împreună, precum și erori în metri și secunde. Dacă erorile cresc la clădiri estimate, se verifică ipoteza înălțimii; dacă sunt concentrate lateral, se investighează rețeaua. Fără măsurători de înălțime nu se poate atribui unic cauza. O campanie din octombrie validează geometria la acele date, nu beneficiul termic al verii. E4 rămâne limitat de vreme, dimensiunea pilotului și accesibilitate.

### 8.6 Experimentul 5 Transferul între orașe

Statut: Rezultat neobținut — experiment planificat, opțional. Scopul este separarea portabilității tehnice de precizia geografică. Se alege un al doilea oraș numai după verificarea accesului la date și a posibilității de observație; nu este revendicată acum o validare suplimentară. Sunt necesare un pachet nou cu CRS adecvat, licență și audit, câteva perechi cu alternative și puncte de teren separate de calibrare.

Procedura este: se păstrează versiunea algoritmului; se încarcă noul pachet și se verifică proiecția și poziția solară; se rulează aceleași scene sintetice E1; se execută perechi A–B–C la condiții documentate; se colectează un pilot E4 independent. Se raportează disponibilitatea height/niveluri, conectivitatea, rata refuzurilor, eroarea umbrei, expunerea și calculul. Parametrii transferați fără reglare sunt analiza principală; o recalibrare locală este o analiză separată, nu același experiment.

| Zonă și versiune | Portabilitate tehnică | Acuratețe și rute | Stadiu |
| Constanța | Cod și pachet inspectate | E2–E4 rămân de realizat | Fără validare de teren confirmată |
| Al doilea oraș, de selectat | Import, CRS și încărcare de verificat | Aceiași indicatori, audit separat | Rezultat neobținut — experiment planificat |

Reușita încărcării demonstrează numai compatibilitatea tehnică. Precizia mai slabă poate proveni din inventarul incomplet sau din forma orașului; nu se ascunde prin ajustări post-hoc. Un rezultat într-un al doilea oraș este exploratoriu și nu justifică o promisiune globală.

''')
s=s.replace('### 8.6 Indicatorii de performanță','### 8.7 Indicatorii de performanță')
# Remove duplicated general field protocol; keep verification design concise.
replace_between('## 9. Verificarea software și validarea pe teren','\n\n## 10. Analiza statistică', '''## 9. Verificarea software și independența evaluării

E1 verifică formulele, direcția umbrei, curțile și concavitatea; include compararea clasificării prin rază cu poligonul afișat. Pentru rutare se enumeră toate rutele într-un graf mic și se compară costurile fixe cu Dijkstra. Cu λ = μ = 0 se recuperează A, iar scenariile identice produc U = 0. Testele temporale verifică UTC, fusurile și timpii de trecere, nu numai ora plecării. La modificarea datei ori pachetului, memoria cache trebuie invalidată.

Experimentul controlat păstrează trei obiecte distincte: datele de intrare parțiale, scenariile pentru selecție și referința de evaluare. Accesul algoritmului la înălțimile ascunse invalidează comparația. Aceleași scenarii și semințe sunt folosite pentru B și C unde este relevant, iar referința nu este generată numai de ipotezele favorabile lui C. Parametrii se fixează pe calibrare; ablația μ = 0 izolează efectul penalizării. Pentru E4, observatorul nu trebuie să ajusteze eticheta după predicție.

Fișierele de test din repository constituie o bază software existentă, nu dovada executării acestei matrice complete de cercetare. Revizuirea a rulat doar verificările descrise în secțiunea 7.2. După refacerea dependențelor se reexecută întreaga suită și se păstrează jurnalul cu revizia codului; abia apoi se raportează rezultate curente ale motorului.
''')
replace_between('Lucrarea reprezintă un studiu de fundamentare și un protocol experimental, nu o validare completă.','\n\nDupă colectare, figurile prioritare', '''Rezultatele proprii verificate în revizuire sunt inventarul fișierului geografic și concordanța hash-urilor, inspecția integrării motorului local și testele clientului. Acestea demonstrează existența datelor și a unor componente software, fără a măsura umbra fizică. Rezultatele bibliografice și modelul matematic fundamentează proiectul final. Logurile de verificare istorice din repository sunt tratate ca documentație, nu ca măsurători reproduse în această sesiune.

Rezultatele încă necesare sunt E1 complet reluat, evaluările cu 25% și 50% înălțimi ascunse, comparația A–B–C cu C implementată, E4 pe puncte și rute și timpii pe dispozitiv. E5 este suplimentar. Nu se raportează o reducere proprie a expunerii și nu se confundă datele OSM reale cu adevărul geometric de teren. Câmpul „Rezultat neobținut — experiment planificat” nu este o observație numerică și nu intră în statistici.

| Metodă, pereche, oră și mască | D m / T_est s | E_est / E_ind s | S_timp % / ocol % | Eroare s / calcul s |
| A, aceleași condiții | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut |
| B, aceleași condiții | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut |
| C, aceleași condiții | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut |

Toate celulele necompletate din acest tabel au statutul „Rezultat neobținut — experiment planificat”. E_ind este etichetată E_ref pentru simulare sau E_obs pentru teren; cele două nu sunt amestecate. T_obs și durata opririlor se adaugă în registrul parcurgerilor. S_timp este procentul temporal de umbră; E_necunoscut și acoperirea se raportează în coloane separate când clasificarea este incompletă.''')
s=s.replace('Cele 12 teste software confirmă verificări ale clientului și nu superioritatea UMBRA-R.','Datele incluse și codul local susțin fezabilitatea tehnică a pipeline-ului; testele clientului nu demonstrează superioritatea UMBRA-R.')
s=s.replace('Prioritatea este o zonă restrânsă, un motor verificat și completarea experimentelor E1–E4.','Prioritatea este completarea și verificarea metodelor experimentale B și C, apoi E1–E4 într-o zonă restrânsă. Arhitectura finală separă pachetul de oraș de algoritm, iar E5 verifică exploratoriu transferul.')
s=s.replace('Aceste utilizări sunt scenarii propuse, care presupun un serviciu funcțional și validat.','Aceste utilizări descriu sistemul final urmărit; motorul local din cod nu reprezintă o validare fizică a recomandărilor, iar încărcarea unui alt oraș rămâne proiectată.')
# Remove obsolete seven-day schedule, retain technical reproducibility records.
replace_between('În prima zi se fixează aria','\n\nRegistrul fiecărei rulări', '''Prioritățile sunt fixarea ariei și referinței, refacerea mediului de test, reluarea E1, implementarea modurilor B și C, execuția E2–E3 și observațiile E4. E5 se efectuează numai dacă acestea sunt complete și există timp pentru o verificare reală. Extinderea interfeței și vizualizarea 3D nu înlocuiesc dovada că umbra simulată se apropie de cea observată.''')
s=s.replace('Exemplul numeric este calcul matematic ilustrativ; nu este rezultat de rutare în Constanța.','Exemplul numeric este calcul matematic ilustrativ; nu este rezultat de rutare în Constanța.')
s=s.replace('În absența motorului, intervalul demonstrației arată numai funcțiile verificate și explică explicit ce nu a fost executat.','Dacă mediul de rulare nu este funcțional, intervalul demonstrației prezintă numai dovezile disponibile și explică explicit ce nu a fost executat. C nu trebuie reprezentată prin ruta shadiest curentă fără implementarea și identificarea metodei.')
s=s.replace('O demonstrație ar trebui să arate o singură pereche de puncte, aceeași oră și cele trei alternative.','Demonstrația finală urmărește o singură pereche de puncte, aceeași oră și cele trei metode A, B și C, după implementarea lor distinctă.')
s=s.replace('[16] UMBRA. Documentație internă a proiectului. README.md și documentația aplicației mobile, versiunea locală inspectată la 24 octombrie 2026. Sursă pentru stadiul declarat al implementării, fără statut de validare experimentală independentă.','[16] UMBRA. Repository local, revizia f71e140, inspectat la 26 octombrie 2026. Fișiere: mobile/src/engine/{data,geometry,solar,overlay,exposure,routing}.ts; mobile/src/services/localEngine.ts; mobile/assets/data/manifest.json; docs/mobile-verification.md. Proveniență a datelor și dovezi software; fără validare independentă în teren. Adresa origin: https://github.com/Ieditzu/umbra (acces web 404 la revizuire; analiza folosește copia locală).')
s=s.replace('Sursele web au fost consultate la 24 octombrie 2026. Revizuirea a reverificat prioritar metadatele și sursele primare disponibile;','Documentarea inițială este din 24 octombrie 2026; la 26 octombrie au fost reverificate prioritar sursele instituționale CoolWalks, Feng, MIT Cooling Path, copia Bertsimas–Sim și regulamentul. Celelalte referințe sunt păstrate din documentarea inițială;')
# Renumber original sections after insertion; leave the new section 4 and its children untouched.
pos=s.index('## 4. Date geografice')
front,tail=s[:pos],s[pos:]
tail=re.sub(r'^(## |### )(\d+)(\.[\d]+)?(\.? )',lambda m:m.group(1)+str(int(m.group(2))+1)+(m.group(3) or '')+m.group(4),tail,flags=re.M)
s=front+tail
s=s.replace('secțiunea 7.2','secțiunea 8.2').replace('secțiunea 7.2','secțiunea 8.2')
# Standardize output dates; keep historical source timestamps within narrative.
(ROOT/'tmp/research/paper-final-20261026.md').write_text(s)
print('Final source words',len(s.split()))
