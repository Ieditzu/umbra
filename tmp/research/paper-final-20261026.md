# UMBRA SmartRoute
## Optimizarea traseelor pietonale umbrite în condiții de incertitudine a înălțimilor clădirilor

Studiu de fundamentare științifică și protocol experimental pentru RoSEF 2026

Versiune documentată la 26 octombrie 2026. Raport despre sistemul final propus și contribuția UMBRA-R. Constanța este pilotul principal; extinderea în alte orașe este proiectată, fără validare geografică generală. Autorii, instituția și mentorul trebuie completați de echipă. Nu sunt disponibile rezultate proprii confirmate privind acuratețea în teren sau superioritatea UMBRA-R.

### Rezumat
Pietonii care se deplasează între aceleași puncte pot întâlni expuneri directe la soare diferite. Rutarea după umbră depinde de un model urban ale cărui înălțimi și căi pietonale pot fi incomplete. UMBRA SmartRoute este proiectată ca aplicație extensibilă geografic, care afișează umbrele clădirilor pentru data și ora alese și compară durata, distanța, expunerea estimată și ocolul. Întrebarea științifică este dacă modelarea incertitudinii înălțimilor permite alegerea mai fiabilă a rutelor umbrite. Contribuția propusă, UMBRA-R, combină durata cu expunerea medie și dezacordul dintre scenarii geometrice. Evaluarea planificată compară A, traseul rapid, B, rutarea nominală, și C, UMBRA-R, la aceeași limită de ocol. Constanța rămâne pilotul pentru validarea spațio-temporală a umbrelor prin puncte observate, fotografii, repere metrice și parcurgeri documentate. Un al doilea oraș poate fi investigat exploratoriu. Copia locală a proiectului conține un motor geometric și de rutare pe telefon; metoda C completă și încărcarea generică a altui oraș nu sunt demonstrate. Verificarea structurii datelor și testele software sunt separate de experimentele în teren. Lucrarea descrie sistemul final urmărit și un protocol falsificabil; nu afirmă încă reducerea reală a expunerii prin UMBRA-R.

Cuvinte cheie: rutare pietonală; umbrire urbană; OpenStreetMap; optimizare pe grafuri; incertitudine geometrică; validare experimentală.

## 1. Introducere și delimitarea problemei

Un traseu scurt nu este obligatoriu traseul cu cea mai mică expunere directă la soare. Fațadele, orientarea străzilor și momentul deplasării produc distribuții spațiale diferite ale umbrei. Studiile CoolWalks și Walking in the Shade arată că informația geometrică poate fi integrată în alegerea traseului [1, 2]. Pentru UMBRA, întrebarea practică este ce se întâmplă atunci când această informație este nesigură. O recomandare aparent favorabilă poate conduce la un ocol fără umbra anticipată dacă modelul supraestimează o clădire.

Proiectul urmărește o singură componentă a mediului pietonal: expunerea geometrică la radiația solară directă. Timpul petrecut în soare nu este echivalent cu temperatura aerului, temperatura resimțită, doza ultravioletă sau riscul medical. Aceste mărimi depind și de nori, vânt, umiditate, îmbrăcăminte, activitate și proprietățile suprafețelor. O afirmație despre confort termic ar necesita măsurători și un model suplimentar. Lucrarea nu deduce efecte fiziologice din simpla existență a umbrei.

Constanța este propusă ca studiu local, fără presupunerea că rezultatele altor orașe se transferă direct. O zonă pilot trebuie să cuprindă străzi cu alternative pietonale reale, clădiri de înălțimi diferite și spații accesibile verificabile. Nu se atribuie orașului procente de clădiri cu înălțime cunoscută sau valori climatice locale care nu au fost măsurate ori extrase dintr-o sursă documentată. Contextul climatic justifică interesul aplicației, dar nu înlocuiește verificarea datelor locale.

Obiectivul aplicativ este o recomandare explicabilă: utilizatorul alege originea, destinația, data, ora și toleranța la ocol, apoi compară alternative cu estimări de expunere și incertitudine. Obiectivul științific este mai restrâns: măsurarea diferenței dintre un model nominal și unul care folosește scenarii geometrice. Un rezultat negativ, în care penalizarea incertitudinii nu îmbunătățește expunerea observată, rămâne informativ și trebuie păstrat.

## 2. Stadiul actual al cercetării

### 2.1 Rutarea după umbră și rolul geometriei

Wolf, Vierø și Szell au publicat în 2025 studiul CoolWalks for active mobility in urban street networks, în Scientific Reports [1]. Autorii modelează alegerea rutelor printr-un parametru de evitare a soarelui și introduc CoolWalkability pentru caracterizarea oportunităților de mers la umbră. Analiza combină rețele sintetice și exemple din Manhattan, Barcelona și Valencia. Un rezultat important este că o grilă regulată idealizată, cu clădiri de înălțime constantă, nu produce automat avantaj pentru evitarea soarelui; variația geometriei și a înălțimilor contează. Indicatorul este o proprietate a posibilităților de rutare și nu o temperatură măsurată. Pentru UMBRA, lecția principală este că o rețea trasată pe axul străzii poate descrie insuficient umbra de pe trotuare. Studiul susține analiza sensibilității geometrice; nu demonstrează performanța UMBRA-R în Constanța.

Feng, Zhang, Xue, Chen și Meng descriu în 2024 sistemul Walking in the Shade: Shadow-oriented Navigation for Pedestrians [2]. Într-o zonă din München, ei combină o rețea pietonală OpenStreetMap corectată manual, modele urbane LoD2 și simularea umbrelor prin ray tracing. Utilizatorul poate favoriza trasee mai scurte sau mai umbrite, iar vizualizarea tridimensională sprijină verificarea. Fișa instituțională confirmă arhitectura generală și domeniul demonstrației; ea nu oferă toate detaliile de implementare. Nu se atribuie autorilor un algoritm exact de căutare sau un câștig numeric neverificat. Diferența urmărită de UMBRA este folosirea unor înălțimi incomplete și a unui model de incertitudine, cu o geometrie inițial mai simplă decât LoD2.

### 2.2 Integrarea umbrei în mediul pietonal

Wen și colaboratorii au publicat în 2025 Walking smart in the heat: A dynamic shade-oriented pathfinding approach to enhance pedestrian comfort in arid cities [3], asociat proiectului MIT Cooling Path. Metodologia analizează zone din jurul stațiilor de metrou din Dubai, combinând trasee exterioare și interioare, umbră de clădiri și arbori și recompense diferențiate. Pagina proiectului raportează, în medie, trasee optime umbrite cu 1,3% mai lungi și o reducere a expunerii de 8,8% [4]. Aceste valori aparțin studiului respectiv. Articolul discută necesitatea calibrării locale și limite privind accesul și deplasarea în interior. Pentru UMBRA este relevantă separarea dintre tipurile de umbră; nu este justificată transferarea coeficienților de confort din Dubai către Constanța fără validare.

Peng, Xiong și Zou au analizat în 2021 traseele optime după umbrire în climate calde și răcoroase [5]. Studiul din Peninsula Kowloon, Hong Kong, folosește date LiDAR, poziția solară și informații despre clădiri și vegetație. Evaluarea urmărește variațiile sezoniere și orare, inclusiv alegerea unor trasee mai însorite în sezonul rece. Modelul descris utilizează pixeli de 10 × 10 m, o rezoluție care poate pierde diferențe între trotuare apropiate. Relevanța pentru UMBRA este caracterul dependent de timp și de obiectiv al rutării. Limitarea evidențiată aici este necesitatea unei rezoluții compatibile cu decizia pietonală, nu o eroare demonstrată a studiului.

Verma, Mumm și Carlow au publicat în 2026 Seeking shade: an agent-based model to study shadow-focused pedestrian movement: Case study in Berlin [6]. Metadatele instituționale confirmă autorii, publicarea și orientarea către modelarea bazată pe agenți. În această documentare nu a putut fi consultat textul integral de la editor, care a returnat o eroare de acces. Prin urmare, articolul este folosit ca reper pentru simularea comportamentului pietonal, fără reconstruirea unor proceduri sau atribuirea unor rezultate numerice pe care textul primar accesibil nu le permite verificarea.

### 2.3 Delimitarea contribuției originale

Bertsimas și Sim au formulat un cadru consacrat pentru optimizare discretă și fluxuri în rețele cu date incerte [7]. Ideea de a controla conservatorismul unei decizii nu este nouă. UMBRA-R trebuie prezentat ca o adaptare experimentală la expunerea produsă de umbre urbane, cu propriile alegeri de reprezentare și validare. Adăugarea unei penalizări la Dijkstra nu demonstrează, singură, o contribuție algoritmică fundamentală. Valoarea cercetării poate proveni dintr-o evaluare reproductibilă a legăturii dintre înălțimi, umbre și rute. Rutarea după umbră și optimizarea robustă există deja. Contribuția propusă este adaptarea și evaluarea explicită a incertitudinii geometrice în rutarea pietonală după umbre, într-un experiment reproductibil pentru Constanța. Originalitatea trebuie susținută prin implementare și rezultate; formularea unei funcții matematice nu este suficientă.

| Studiu și problemă | Metodă și rezultat raportat | Limită relevantă și diferența UMBRA |
| CoolWalks 2025 [1] — oportunități de mers la umbră | Grafuri și geometrie; avantajul depinde de variația urbană, nu apare automat în grila ideală | Sensibil la reprezentarea rețelei; UMBRA testează înălțimi lipsă și o penalizare explicită |
| Feng și colab. 2024 [2] — navigație pietonală după umbră | OSM corectat, LoD2, ray tracing; sistem demonstrat într-o zonă din München | Rezumatul accesibil nu stabilește un câștig numeric; UMBRA investighează geometrie incompletă |
| Wen și colab. 2025 [3, 4] — trasee în mediul arid | Recompense dinamice și trasee interioare; MIT raportează +1,3% lungime și −8,8% expunere în medie | Calibrare locală necesară; UMBRA urmărește incertitudinea, fără transferul acestor procente |
| Peng și colab. 2021 [5] — trasee sezoniere umbrite sau însorite | LiDAR și geometrie solară; identifică orientări favorabile la ore și sezoane diferite | Discretizare de 10 m; UMBRA testează date verticale lipsă pe o rețea pietonală locală |
| Verma și colab. 2026 [6] — mișcare pietonală orientată după umbră | Modelare cu agenți; nu se reproduce un rezultat numeric din textul integral inaccesibil | Verificare limitată la metadate; UMBRA evaluează selecția rutei și erorile geometrice |
| Bertsimas și Sim 2003 [7] — decizii cu costuri incerte | Optimizare robustă cu conservatorism controlabil; rezultate de tractabilitate pentru cadrul definit | Nu este un model urban de umbre; UMBRA adaptează și evaluează incertitudinea geometrică |


În sursele consultate nu a fost identificată o demonstrație direct transferabilă a întregului protocol propus pentru Constanța. Această constatare delimitează documentarea efectuată și nu dovedește inexistența altor soluții. Căutarea a urmărit expresii precum shade-aware pedestrian routing, uncertain building heights și robust shortest path, cu prioritate pentru articole și pagini ale autorilor sau instituțiilor. Nu se revendică o premieră mondială și nu se confundă o căutare țintită cu o revizuire sistematică exhaustivă.

## 3. Întrebări de cercetare și ipoteze

Întrebarea principală este: „Poate un algoritm care ține cont de incertitudinea înălțimilor clădirilor să recomande trasee cu expunere solară reală mai mică decât un algoritm care folosește doar înălțimi estimate, pentru aceeași limită de ocol?” Răspunsul despre expunerea reală necesită observații. Geometria de referință din simulare oferă numai un test controlat al mecanismului.

| Ipoteză | Variabilă investigată | Experiment | Indicator | Când nu este susținută |
| H1 C reduce expunerea față de B | Metoda de rutare | E3 și E4, condiții pereche | Mediana E(B) − E(C), în secunde | Mediana ≤ 0 sau ocol depășit |
| H2 Lipsa înălțimilor afectează predicția nominală | Lipsă 0%, 25%, 50% | E2 cu referință păstrată | Eroare absolută a expunerii B | Eroarea nu crește față de cazul complet |
| H3 Avantajul C depinde de oră și de μ | Ora și penalizarea | E3 și sensibilitate | Diferențe ale avantajului B − C | Diferențele rămân sub pragul prestabilit |

Pentru H3, pragul de variație relevantă se fixează pe calibrare, peste eroarea numerică estimată, înaintea testului. Pentru H1 se raportează separat comparația simulată și cea observată; un avantaj numai în simulare nu confirmă afirmația despre realitate. În eșantion mic, semnul medianei descrie datele colectate, fără a demonstra automat generalizarea.

Variabilele independente sunt metoda de rutare, proporția înălțimilor ascunse, amplitudinea perturbării, ora și parametrii funcției de cost. Variabilele dependente sunt timpul în soare, eroarea estimării, durata, ocolul și timpul de calcul. Originea, destinația, rețeaua, viteza de referință și scenariile de test trebuie menținute comune între metode în fiecare comparație. Condițiile meteorologice se înregistrează ca factori de context, iar acoperirea vegetației se notează separat.

Contribuția proprie propusă are trei componente verificabile: o reprezentare documentată a înălțimilor și a incertitudinii lor, un cost de rutare care penalizează dezacordul dintre scenarii și un experiment controlat cu evaluare independentă. Un set de date local bine documentat și un rezultat negativ explicat pot fi mai valoroase științific decât o interfață cu multe funcții nevalidate. Numele UMBRA-R identifică această configurație experimentală și nu o certificare a superiorității sale.

## 4. Arhitectura aplicației finale

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

## 5. Date geografice și auditul pilotului Constanța

### 5.1 Surse și accesibilitate

OpenStreetMap oferă geometrii și atribute pentru drumuri, căi pietonale și clădiri. Documentația atributului height descrie înălțimea obiectului; building:levels poate sprijini o estimare separată [8]. Prezența unui atribut nu garantează verificarea lui prin măsurare. În registrul proiectului trebuie păstrate atât valoarea brută, cât și valoarea interpretată, sursa și metoda de obținere. O valoare declarată în OSM nu trebuie etichetată automat drept înălțime verificată.

Geofabrik pune la dispoziție un extras pentru România, inclusiv în format OSM PBF [9]. Acesta constituie o sursă accesibilă pentru extragerea zonei Constanța, fără a demonstra completitudinea locală. OSMnx permite descărcarea și modelarea rețelelor și a obiectelor geospațiale prin interogări spațiale [10]. Overpass poate fi o alternativă pentru o zonă mică. Pentru reproducibilitate, interogarea, conturul ariei, data extragerii și fișierul brut trebuie arhivate. La revizuire a fost inspectat pachetul local inclus în aplicație; acesta este un extras cu limite proprii, nu un recensământ administrativ al orașului.

GlobalBuildingAtlas este o sursă suplimentară de poligoane, înălțimi estimate și modele LoD1, descrisă de Zhu și colaboratorii [11]. Acoperirea globală justifică investigarea produsului pentru România, dar nu dovedește precizia fiecărei clădiri din Constanța. Înălțimile derivate automat trebuie comparate cu exemple locale. Termenii portalului indică CC BY-NC 4.0 pentru setul de date [12], iar articolul separă componente cu alte condiții de redistribuire. Licența articolului, a datelor și a codului nu este aceeași. Se arhivează termenii produsului efectiv utilizat înainte de a distribui date derivate.

Datele OSM sunt distribuite sub ODbL, cu cerințe de atribuire și condiții pentru bazele de date derivate [13]. Pe hartă se păstrează atribuirea contribuitorilor, iar în pachetul experimental se descrie proveniența. Harta de fundal și baza de date geometrică sunt componente distincte. Nu se presupune că reprezentarea tridimensională dintr-un serviciu comercial poate fi extrasă și reutilizată liber. Pentru experiment este suficientă o combinație documentată de date deschise și verificări proprii.

### 5.2 Auditul local și completarea înălțimilor

Aria pilot se alege după o inspecție preliminară a conectivității și a accesului. Se recomandă câteva străzi conectate, cu alternative între punctele terminale, în locul întregului oraș. Pentru fiecare clădire se creează câmpurile building_id, height_raw, height_m, source, method și uncertainty_class. Datele suspecte, unitățile neclare și geometriile invalide sunt păstrate într-un jurnal de corecții. Se raportează numărul total de clădiri, numărul cu height, numărul numai cu building:levels și numărul fără informație verticală.

Completitudinea geometrică se calculează ca p_height = N_height / N_buildings. Se raportează separat proporția clădirilor cu sursă verificată. Dacă o clădire are numai numărul de niveluri, înălțimea poate fi estimată ca H = n × h_etaj + h_acoperiș. Parametrii trebuie justificați prin câteva clădiri locale și însoțiți de intervale; alegerea unei valori convenabile nu o transformă în măsurătoare. Fără n, se poate folosi un interval pentru o clasă locală de clădiri, cu încredere redusă. Niciun interval nu este probabilistic valid doar fiindcă a fost introdus în program.

### 5.3 Protocol executabil de audit OSM

Pasul 1 este fixarea unui poligon sau dreptunghi pilot și a tamponului pentru clădirile care pot proiecta umbre din exterior. Se salvează coordonatele și data extragerii. Pasul 2 este descărcarea obiectelor building și building:part prin Overpass sau din extrasul Geofabrik. O interogare pilot propusă este prezentată mai jos; dreptunghiul nu reprezintă întregul oraș. Interogarea nu a fost executată în această revizuire [8–10].

CODE [out:json][timeout:60];
CODE (nwr["building"](44.170,28.630,44.180,28.640);
CODE  nwr["building:part"](44.170,28.630,44.180,28.640););
CODE out body geom;

Pasul 3 este deduplicarea după tipul și identificatorul OSM, reconstruirea relațiilor și verificarea suprapunerilor dintre corpul principal și părți. Se numără separat clădirile, părțile și relațiile; însumarea lor fără control ar dubla inventarul. Pasul 4 este parsarea atributelor height, building:levels, min_height și source:height. Valorile cu unități neclare, negative sau incompatibile sunt trimise la verificare, fără conversii tăcute.

Pasul 5 este clasificarea provenienței. Clasa V înseamnă înălțime verificată prin măsurare sau sursă documentată și controlată; o valoare height singură nu o justifică. Clasa D înseamnă înălțime declarată în OSM, cu verificare independentă absentă. Clasa E înseamnă estimare din niveluri, model extern sau clasă locală, cu regulă și interval salvate. Clasa N înseamnă lipsa informației utilizabile. Intrările invalide rămân marcate separat până la corectare. Astfel, cunoscut în baza de date nu înseamnă obligatoriu cunoscut în realitate.

Pasul 6 este exportul unui CSV cu identificator, geometrie, atribute brute, H central, interval, clasă, sursă și motivul corecției. Se verifică manual un mic eșantion din fiecare clasă disponibilă. Pasul 7 este raportarea numărătorilor și a numitorului pentru aria exactă: număr de clădiri unice, height valid, numai niveluri, necunoscute și verificate independent. Procentele se calculează după extragere. Pachetul local actual a fost decomprimat și numărat la 26 octombrie 2026 [16]. Amprentele SHA-256 ale fișierului împachetat și ale JSON-ului decomprimat coincid cu manifestul. Sunt 50 071 noduri, 111 552 muchii orientate și 51 428 amprente de clădiri. Clasele sunt 271 cu atribut height, 5 913 estimate din niveluri, 45 159 fără înălțime și 85 structuri suspendate nesuportate. Aceste numărători descriu disponibilitatea în extrasul 28,50–28,75° E și 44,075–44,355° N, nu precizia ori completitudinea întregii Constanțe. Snapshotul declarat este 25 octombrie 2026, 21:21:21 UTC; o valoare height nu este automat măsurare validată.


Toate lungimile se calculează într-un sistem de coordonate metric adecvat zonei, de exemplu UTM 35N, după verificarea transformării. Nu se calculează distanțe în metri direct din grade geografice. Trotuarele și traversările trebuie inspectate: o rută matematică nu este acceptabilă dacă traversează o clădire, un spațiu închis sau o arteră într-un loc nepermis. Eroarea laterală a rețelei poate conta la fel de mult ca înălțimea și trebuie tratată ca limitare independentă.

## 6. Modelul geometric al umbrei

### 6.1 Poziția solară și timpul

Poziția Soarelui este descrisă prin azimutul A și elevația α, calculate în funcție de coordonate, dată și moment. Azimutul se măsoară aici de la nord, în sens orar. O bibliotecă trebuie configurată și verificată după aceeași convenție. Algoritmul SPA al lui Reda și Andreas constituie un reper documentat [14], iar pvlib oferă funcții pentru poziția solară și solicită interpretarea corectă a marcajelor de timp [15]. Motorul local inspectat implementează un calcul geometric NOAA/Meeus în solar.ts. Fișierele de test includ referințe SPA pentru anotimpuri și tranziția sezonieră, însă suita motorului nu a putut fi reexecutată complet în această revizuire din cauza dependențelor locale lipsă. SPA/pvlib rămân referințe pentru verificare independentă; nu sunt prezentate drept biblioteci folosite deja de aplicație.

Ora aleasă de utilizator se interpretează în Europe/Bucharest și se convertește într-un moment UTC neechivoc. Se păstrează data locală, fusul și deplasarea UTC, fără a fixa permanent un decalaj numeric. La tranzițiile orei sezoniere, o oră locală poate fi ambiguă sau inexistentă; intrarea trebuie clarificată ori respinsă. Folosirea orei calculatorului fără fus este o sursă de erori care poate deplasa semnificativ umbra, chiar dacă geometria clădirii este corectă.

### 6.2 Proiecția unei clădiri idealizate

Pentru un obiect vertical de înălțime H pe un plan orizontal și o sursă solară cu raze paralele, lungimea umbrei este:

EQ L = H / tan(α)

Intuitiv, o clădire mai înaltă produce o umbră mai lungă, iar un Soare mai ridicat o scurtează. H și L sunt în metri; α este un unghi, transmis funcției trigonometrice în radiani după conversia din grade. H provine din auditul clădirilor, iar α din calculul astronomic.

Formula se aplică pentru 0 < α < 90°. Cu axele est și nord, vectorul de translație al unui punct de la înălțimea H către sol este:

EQ d = −H cot(α) × (sin A, cos A)

Semnul negativ exprimă proiectarea în direcția opusă Soarelui. Pentru o amprentă P extrudată la înălțime constantă, regiunea umbrită pe sol este baleierea lui P pe segmentul dintre vectorii 0 și d. Aceasta include poligonul inițial și suprafețele generate de muchii. Reuniunea umbrelor tuturor clădirilor se intersectează cu geometria pietonală. Pentru amprente concave nu este corectă folosirea necondiționată a învelișului convex, care ar putea produce umbră artificială în goluri.

Exemplu strict analitic: pentru H = 12 m și α = 30°, rezultă L ≈ 20,78 m. Dacă singura eroare este ΔH = 3 m, atunci variația lungimii este aproximativ ΔL = 3 / tan(30°) ≈ 5,20 m. Aceste valori derivă din formula geometrică și nu reprezintă măsurători în Constanța. Exemplul arată de ce o eroare verticală modestă poate schimba clasificarea unui trotuar situat lângă limita umbrei.

Sensibilitatea locală este ∂L/∂H = cot(α). La elevații mici, erorile înălțimii au un efect mai mare asupra lungimii umbrei. Pentru α apropiat de zero, modelul devine instabil numeric și aria necesară de clădiri crește. Codul curent refuză proiecția normală sub α = 5°. Pentru experiment se poate impune anterior un prag mai restrictiv, de exemplu 10°, fără a-l confunda cu regula implementată. Ambele sunt praguri operaționale, nu constante fizice. Cazurile excluse se raportează, iar pragul se verifică prin analiză de sensibilitate. Când Soarele este sub orizont, nu se aplică formula unei umbre solare directe.

FIG SHADOW

Figura 2. Secțiune verticală idealizată a unei clădiri și a umbrei sale. Desen propriu vectorial, fără scară; razele solare sunt paralele, terenul este plan. Figura explică modelul, nu reprezintă o măsurătoare.

### 6.3 Limitele reprezentării

Modelul LoD1 presupune pereți verticali, acoperiș simplificat și teren aproximativ plan. Balcoanele, pasajele, streșinile, panta și retragerile etajelor pot produce diferențe față de observație. Copacii nu sunt reprezentați corect prin clădiri opace: coroanele au transparență variabilă și geometrie sezonieră. În aria pilot, vegetația se notează separat și segmentele dominate de ea se analizează distinct. O abatere produsă de un copac nu trebuie atribuită automat înălțimii unei clădiri.

Pentru a evita lipsa umbrelor provenite din afara zonei, aria clădirilor trebuie să depășească aria rutelor. Un tampon justificat geometric poate fi ales din H_max / tan(α_min), la care se adaugă toleranța de poziție. Înălțimea maximă presupusă și pragul solar se consemnează. Alegerea unui dreptunghi mic doar pentru a accelera calculul poate introduce o eroare sistematică la marginile hărții.

## 7. Expunerea și funcțiile de cost

### 7.1 Rețeaua pietonală și expunerea dependentă de timp

Rețeaua este un graf G = (V, E), cu noduri la conexiuni și muchii pentru segmente accesibile. Fiecare muchie e are lungimea l_e și durata τ_e. În modelul inițial, τ_e = l_e / v, unde v este o viteză de referință declarată. Viteza constantă este o simplificare; așteptarea la traversări și diferențele individuale se înregistrează separat atunci când există observații. Pe aceeași pereche origine–destinație, metodele trebuie evaluate cu aceleași ipoteze de deplasare.

Fie s(x, t, H) o funcție care valorează 1 dacă punctul x este umbrit la momentul t în geometria H și 0 dacă este însorit. Pentru un traseu R parcurs pe durata T, expunerea geometrică este:

EQ E(R, t₀, H) = ∫₀ᵀ [1 − s(x_R(u), t₀ + u, H)] du

Într-un inventar incomplet, clasificarea este ternară: umbră, soare sau necunoscut. Integrala binară de mai sus se aplică unei referințe definite sau punctelor clasificate. Se păstrează separat E_soare și E_necunoscut; o limită geometrică de expunere este [E_soare, E_soare + E_necunoscut]. Fără audit nu se înlocuiește necunoscut cu soare în raportarea observațiilor. O penalizare internă conservatoare poate trata necunoscut drept cost, dar acesta nu devine timp măsurat în soare.

Expunerea are unitatea secunde. Definiția urmărește momentul real al trecerii prin fiecare punct; umbra nu este presupusă fixă pe toată durata mersului. Numeric, integrala se aproximează prin eșantionare spațială și temporală. Pasul se alege înaintea experimentului și se verifică prin înjumătățire. Diferența dintre discretizări trebuie raportată; o densitate mare de puncte nu repară înălțimi greșite sau trotuare deplasate.

### 7.2 Modelul nominal și incertitudinea

Metoda nominală minimizează un compromis între durată și expunerea estimată la înălțimile centrale H_nom:

EQ C_nom(R) = T(R) + λ E(R, t₀, H_nom)

Intuitiv, o secundă în soare adaugă λ secunde echivalente la cost, pe lângă timpul de mers. Traseul nominal R este evaluat cu un singur set de înălțimi H_nom; acesta este o estimare centrală, nu adevărul geometric.

Coeficientul λ ≥ 0 este fără unitate, deoarece ambele componente sunt exprimate în secunde. El descrie o preferință și nu o relație medicală. Pentru același traseu, se generează K scenarii H^(1), …, H^(K) și expunerile E_k(R). Media lor este E_bar(R), iar dispersia dintre scenarii poate fi descrisă prin abaterea standard:

EQ U(R) = sqrt{ Σₖ [E_k(R) − E_bar(R)]² / (K − 1) }

Funcția propusă pentru evaluarea traseelor candidate este:

EQ C_R(R) = T(R) + λ E_bar(R) + μ U(R)

E_bar este notat și E_medie: media expunerilor în scenariile de înălțime. Intuitiv, μ controlează cât evităm un traseu ale cărui predicții se schimbă mult între scenarii. O valoare mare a lui U înseamnă dezacord în model, fără a demonstra că traseul este nefavorabil în realitate.

Și U este exprimată în secunde, astfel încât μ ≥ 0 este fără unitate. Dacă scenariile nu au o distribuție calibrată, media și abaterea standard sunt rezumate de scenarii și nu intervale de încredere despre realitate. Incertitudinea trebuie denumită precis: dezacord al modelului sub ipotezele de înălțime, nu probabilitate garantată de confort. Scenariile folosesc aceeași înălțime pentru o clădire pe toate muchiile și momentele unui parcurs, pentru a păstra dependențele geometrice.

| Simbol | Semnificație și unitate | Proveniență și utilizare |
| R, t₀, H | Rută; moment; vector de înălțimi în m | Graful și cererea; auditul geometriei |
| T, E, E_medie | Durată; expunere; media expunerii, toate în s | Lungimi și viteză; integrarea umbririi |
| U, K | Dispersie în s; număr de scenarii | Expuneri E_k, cu K ≥ 2 pentru abaterea standard |
| λ, μ | Ponderi fără unitate | Calibrare și sensibilitate, apoi valori fixate |
| δ, v | Ocol relativ fără unitate; viteză în m/s | Preferință experimentală; ipoteză declarată sau observație |

Exemplu matematic strict ilustrativ, fără rute reale: două candidate au T₁ = 600 s, E_medie₁ = 240 s, U₁ = 80 s și T₂ = 630 s, E_medie₂ = 220 s, U₂ = 10 s. La λ = 1 și μ = 0, costurile sunt 840 și 850 s echivalente, deci este aleasă prima. La μ = 1 devin 920 și 860, deci este aleasă a doua. Dacă T_min = 600 s și δ = 0,15, ambele respectă limita de 690 s. Exemplul arată mecanismul selecției; nu spune care rută are expunere reală mai mică.


### 7.3 Cost aditiv și robustețe de traseu

Pentru o variantă simplă se calculează, la o oră de referință, expunerea medie e_bar_e și abaterea standard u_e pe fiecare muchie. Costul w_e = τ_e + λ e_bar_e + μ u_e este nenegativ și aditiv. El poate fi minimizat prin Dijkstra. Totuși, suma abaterilor standard pe muchii nu este, în general, abaterea standard a expunerii totale: umbrele aceleiași clădiri produc dependențe. Varianta trebuie etichetată UMBRA-R aditiv, ca aproximare conservatoare în sensul dispersiei, fără garanție asupra expunerii reale.

Alternativa min–max minimizează T(R) + λ max_k E_k(R). Aceasta protejează față de cel mai nefavorabil scenariu inclus, dar poate fi prea conservatoare dacă intervalele sunt largi. O geometrie artificială extremă poate elimina aproape orice avantaj al umbrei. Prima implementare ar trebui să compare modelul nominal cu penalizarea moderată a dezacordului și să păstreze min–max ca analiză secundară. Un algoritm care optimizează costul mediu pe muchii nu rezolvă automat obiectivul min–max al întregului traseu.

Se impune și o limită explicită T(R) ≤ (1 + δ)T_min. De exemplu, δ = 0,15 poate fi un prag experimental prestabilit, fără statut de valoare optimă. Parametrii λ și μ se aleg pe trasee de calibrare, apoi se fixează înaintea testării independente. Compararea mai multor valori pe test și raportarea numai a celei mai bune ar supraestima performanța. Sensibilitatea la pragul de ocol și la ponderi se prezintă inclusiv când rezultatele sunt nefavorabile.

## 8. Algoritmul și arhitectura software propuse

FIG PIPELINE

Figura 3. Fluxul propus de prelucrare. Desen propriu vectorial. Poziția Soarelui depinde de coordonate și timp; scenariile de înălțime reiau calculul umbrelor înaintea evaluării rutelor. Fluxul reprezintă arhitectura urmărită, nu componente toate funcționale.

FIG ROUTES

Figura 4. Comparația controlată a metodelor. Desen vectorial propriu. Aceleași intrări și aceeași limită de ocol; evaluatorul independent nu transmite algoritmilor înălțimile ascunse.

### 8.1 Alegerea unei soluții realizabile

Dijkstra este adecvat pentru un graf cu ponderi fixe nenegative și are, cu o coadă de priorități uzuală, complexitatea O((|V| + |E|) log |V|). A* poate reduce căutarea dacă euristica este admisibilă. O limită inferioară bazată pe distanța în linie dreaptă împărțită la viteza maximă admisă este compatibilă cu ponderi care includ numai penalizări nenegative. O euristică bazată pe umbra presupusă poate supraestima și trebuie demonstrată, nu acceptată intuitiv.

Nici Dijkstra, nici A* în forma lor obișnuită nu garantează optimul pentru un cost care se modifică în timpul mersului. Plecarea mai târzie poate schimba expunerea fără a schimba durata fizică a segmentului. În prima versiune, soluția realistă este generarea unui set de rute candidate cu ponderi fixe, apoi reevaluarea lor cu umbre la timpii efectivi de trecere. Alegerea finală este optimă numai în setul candidat. Această limitare trebuie precizată la prezentarea rezultatelor.

Pseudocodul operațional este următorul: se validează intrarea și accesibilitatea; se calculează traseul cu durată minimă; se generează alternative distincte prin mai multe ponderi nominale și penalizări; se elimină rutele ce depășesc ocolul; se evaluează fiecare rută în aceleași scenarii la t₀ plus timpul parcurs; se calculează costul și dispersia; se selectează alternativa cu valoarea cea mai mică; se exportă scenariile, rutele și motivele selecției. Rutele duplicate se elimină după secvența muchiilor, nu după culoarea afișată.

Pentru M rute candidate, K scenarii și Q eșantioane pe rută, reevaluarea necesită aproximativ O(MKQ) interogări de umbrire, în afara construirii geometriei și a indexării spațiale. Aceste operații pot domina timpul de calcul; complexitatea Dijkstra nu descrie întregul sistem. Indicii spațiali, memorarea poziției solare și reutilizarea umbrelor pe intervale scurte pot reduce costul. Timpul se măsoară separat pentru pregătirea datelor, calculul umbrelor și selecția rutei.

O extensie mai riguroasă utilizează un graf extins în timp, cu stări (v, t_j) și tranziții ce reprezintă deplasarea la momente discrete. Dimensiunea crește cu numărul intervalelor temporale. Dacă se permite așteptarea, aceasta trebuie definită explicit; altfel algoritmul poate exploata o regulă de așteptare care nu corespunde utilizării. Pentru o săptămână de lucru, această extensie este opțională, după verificarea pipeline-ului static și a reevaluării temporale.

### 8.2 Stadiul implementării și componentele planificate

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



## 9. Protocolul experimental

### 9.1 Condiții comune și împărțirea datelor

E1–E4 sunt protocoale de cercetare planificate, iar E5 este opțional. Există teste software și verificări istorice în repository, dar nu sunt echivalate cu executarea integrală a acestor experimente. Verificările reluate în revizuire sunt descrise în secțiunea 8.2. Metoda A alege durata minimă; B folosește umbrele la înălțimile estimate; C adaugă scenarii și penalizarea incertitudinii. În fiecare comparație se păstrează punctele, ora, rețeaua, viteza, limita de ocol și criteriile de acces. B și C folosesc același set candidat și aceeași reevaluare temporală; diferă modelul incertitudinii și funcția de selecție.

Pilotul propus cuprinde 12 perechi origine–destinație: 4 pentru calibrare, 8 pentru test. Se aleg trei ore locale și se salvează momentele UTC, după verificarea elevației solare. Parametrii sunt fixați după calibrare. Pentru test se folosesc lipsuri de 0%, 25% și 50% și semințe publicate. Trei repetări ale fiecărei condiții dau 216 combinații simulate; la 0% măștile pot fi identice, deci repetarea nu aduce observații independente și nu trebuie supra-numărată. Numărul de perechi poate fi redus transparent dacă terenul sau timpul impun aceasta.

### 9.2 Experimentul 1 Corectitudinea geometriei

Statut: Rezultat neobținut — experiment planificat. Scopul este verificarea lungimii și direcției umbrei fără incertitudinea datelor urbane. Datele necesare sunt o clădire dreptunghiulară pe teren plan, o amprentă concavă și valori de H, A și α prescrise. Pentru scena de bază se aleg H = 10 m, A = 180° și α = 45°, astfel încât lungimea așteptată este 10 m, către nord.

Pașii sunt: 1 se proiectează geometria într-un sistem metric; 2 se calculează umbra; 3 se compară capătul și lungimea cu soluția analitică; 4 se repetă cu H dublat și cu α = 30°; 5 se verifică lipsa înălțimii, elevația sub prag și concavitatea; 6 se repetă cu pas de eșantionare înjumătățit. Se măsoară eroarea de lungime, eroarea de direcție și diferența dintre discretizări. Pentru scena analitică simplă se poate fixa anterior o toleranță de 0,01 m și 0,1°; acestea sunt ținte de test numeric, nu precizii promise pentru teren.

| Scenă și intrare | Referință matematică | Valoare calculată | Eroare și verdict |
| H 10 m, α 45°, A 180° | L 10 m, nord | Rezultat neobținut | Rezultat neobținut |
| H 20 m, α 45°, A 180° | L 20 m, nord | Rezultat neobținut | Rezultat neobținut |
| H 10 m, α 30°, A 180° | L ≈ 17,32 m, nord | Rezultat neobținut | Rezultat neobținut |

Interpretare: abaterile peste toleranță indică o problemă geometrică, de convenție unghiulară sau de unități și blochează comparația rutelor. Limita experimentului este că o geometrie ideală nu reproduce acoperișuri, arbori, pantă sau poziționarea trotuarelor. Reușita acestui test nu validează datele Constanței.

### 9.3 Experimentul 2 Efectul înălțimilor lipsă

Statut: Rezultat neobținut — experiment planificat. Scopul este izolarea pierderii informației verticale. Datele necesare sunt un inventar local cu geometrie de referință verificată, rețeaua, perechile fixate și listele clădirilor ascunse. Dacă referința nu poate fi verificată, experimentul rămâne o simulare pe geometrie presupusă, etichetată astfel.

Pașii sunt: 1 se salvează referința într-un fișier inaccesibil selecției; 2 se creează copii cu 0%, 25% și 50% înălțimi eliminate; 3 se aplică aceeași regulă de imputare pentru B și C; 4 C primește și intervalele de incertitudine; 5 se calculează rutele cu parametri fixați; 6 evaluatorul independent folosește referința pentru expunere. Se repetă cu măști aleatoare și cu grupuri spațiale, fără a reintroduce în algoritm înălțimile ascunse.

| Pereche, oră, mască | Lipsă și tip | Metodă | E_est s | E_ref s | Eroare absolută s |
| Rezultat neobținut | 0%, 25% sau 50%; aleator/grup | A, B sau C | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut |

Se măsoară eroarea expunerii, ocolul și Δ_BC. Interpretarea urmărește dacă B devine mai fragilă și dacă C limitează această degradare. Un rezultat în care ambele se degradează este păstrat. Limitările sunt calitatea referinței și faptul că masca aleatoare nu reproduce toate mecanismele reale ale datelor lipsă. Ca analiză secundară se pot adăuga perturbări de ±10% și ±25%, declarate drept scenarii, nu erori locale cunoscute.

### 9.4 Experimentul 3 Comparația traseelor A B C

Statut: Rezultat neobținut — experiment planificat. Scopul este evaluarea beneficiului la același buget de ocol. Datele sunt rețeaua verificată, setul de test, trei momente de plecare, scenariile de înălțime și geometria de referință. A furnizează T_min; B și C sunt alese dintre aceleași candidate care respectă limita.

Pașii sunt: 1 se calculează A; 2 se generează și deduplică alternativele; 3 se fixează timpii de trecere; 4 se alege B după costul nominal și C după costul cu incertitudine; 5 se evaluează toate în referința independentă; 6 se salvează inclusiv refuzurile și rutele fără beneficiu. Pentru ocol relativ δ se folosește bugetul în secunde δT_min; acesta poate fi transmis interfeței în minute, fără rotunjiri care schimbă eligibilitatea. Se măsoară D, T, E_est, E_ref, U și timpul de calcul pe componente.

| Pereche și moment | Metodă | D m | T s | E_ref s | Ocol % | Calcul s |
| Rezultat neobținut | A | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut |
| Aceleași condiții | B | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut |
| Aceleași condiții | C | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut |

Interpretarea folosește diferențele pereche, fără a alege numai cazurile favorabile. Se repetă analiza cu μ = 0 pentru a izola penalizarea și cu mai multe ore pentru H3. La K scenarii, aceeași clădire are o singură înălțime pe toată ruta; intervalele și distribuțiile se salvează. Convergența poate fi examinată prin K = 20 și K = 50 pe un subset, fără a prezenta media simulărilor ca probabilitate calibrată. Limita metodei candidate este că nu garantează optimul global dependent de timp.

### 9.5 Experimentul 4 Validarea spațio-temporală a umbrelor simulate

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

### 9.6 Experimentul 5 Transferul între orașe

Statut: Rezultat neobținut — experiment planificat, opțional. Scopul este separarea portabilității tehnice de precizia geografică. Se alege un al doilea oraș numai după verificarea accesului la date și a posibilității de observație; nu este revendicată acum o validare suplimentară. Sunt necesare un pachet nou cu CRS adecvat, licență și audit, câteva perechi cu alternative și puncte de teren separate de calibrare.

Procedura este: se păstrează versiunea algoritmului; se încarcă noul pachet și se verifică proiecția și poziția solară; se rulează aceleași scene sintetice E1; se execută perechi A–B–C la condiții documentate; se colectează un pilot E4 independent. Se raportează disponibilitatea height/niveluri, conectivitatea, rata refuzurilor, eroarea umbrei, expunerea și calculul. Parametrii transferați fără reglare sunt analiza principală; o recalibrare locală este o analiză separată, nu același experiment.

| Zonă și versiune | Portabilitate tehnică | Acuratețe și rute | Stadiu |
| Constanța | Cod și pachet inspectate | E2–E4 rămân de realizat | Fără validare de teren confirmată |
| Al doilea oraș, de selectat | Import, CRS și încărcare de verificat | Aceiași indicatori, audit separat | Rezultat neobținut — experiment planificat |

Reușita încărcării demonstrează numai compatibilitatea tehnică. Precizia mai slabă poate proveni din inventarul incomplet sau din forma orașului; nu se ascunde prin ajustări post-hoc. Un rezultat într-un al doilea oraș este exploratoriu și nu justifică o promisiune globală.



### 9.7 Indicatorii de performanță

Pentru fiecare rută se raportează distanța D = Σ l_e, durata T, expunerea estimată E_est și expunerea de referință E_ref. În teren se folosește E_obs, păstrată distinct de referința simulată. Procentul temporal umbrit este S = 100 × (1 − E/T), pentru T > 0. Acesta diferă de procentul distanței umbrite dacă viteza variază sau există opriri. Alegerea indicatorului trebuie să rămână consecventă în toate tabelele.

Reducerea relativă față de A este r = 100 × (E_A − E_metodă)/E_A, definită numai când E_A > 0. Ocolul temporal este d_T = 100 × (T_metodă − T_A)/T_A. Se raportează și diferența absolută în secunde, mai ușor de interpretat când expunerea inițială este mică. Dacă E_A = 0, reducerea relativă se notează nedefinită și se folosește diferența absolută. Nu se înlocuiește numitorul cu o constantă fără a explica schimbarea indicatorului.

Eroarea expunerii este |E_est − E_ref| sau |E_est − E_obs|, după tipul experimentului. Pentru eșantioane punctuale umbră–soare se raportează matricea de confuzie și acuratețea, fără a considera punctele consecutive observații independente. Stabilitatea geometrică între două rute se poate exprima prin J = lungime(comun)/lungime(reuniune), după împărțirea în muchii comune. Stabilitatea mare nu este obligatoriu un avantaj: un traseu poate rămâne constant și greșit. Interpretarea cere simultan expunerea și ocolul.

## 10. Verificarea software și independența evaluării

E1 verifică formulele, direcția umbrei, curțile și concavitatea; include compararea clasificării prin rază cu poligonul afișat. Pentru rutare se enumeră toate rutele într-un graf mic și se compară costurile fixe cu Dijkstra. Cu λ = μ = 0 se recuperează A, iar scenariile identice produc U = 0. Testele temporale verifică UTC, fusurile și timpii de trecere, nu numai ora plecării. La modificarea datei ori pachetului, memoria cache trebuie invalidată.

Experimentul controlat păstrează trei obiecte distincte: datele de intrare parțiale, scenariile pentru selecție și referința de evaluare. Accesul algoritmului la înălțimile ascunse invalidează comparația. Aceleași scenarii și semințe sunt folosite pentru B și C unde este relevant, iar referința nu este generată numai de ipotezele favorabile lui C. Parametrii se fixează pe calibrare; ablația μ = 0 izolează efectul penalizării. Pentru E4, observatorul nu trebuie să ajusteze eticheta după predicție.

Fișierele de test din repository constituie o bază software existentă, nu dovada executării acestei matrice complete de cercetare. Revizuirea a rulat doar verificările descrise în secțiunea 8.2. După refacerea dependențelor se reexecută întreaga suită și se păstrează jurnalul cu revizia codului; abia apoi se raportează rezultate curente ale motorului.


## 11. Analiza statistică și starea rezultatelor

### 11.1 Comparații pereche și eșantion mic

Pentru o pereche origine–destinație și o condiție comună, se calculează Δ_BC = E_ref(B) − E_ref(C). O valoare pozitivă favorizează C. Se prezintă toate diferențele, mediana, intervalul intercuartil și extremele. Pentru observațiile de teren se înlocuiește referința cu expunerea observată și se menține eticheta tipului de dovadă. Raportarea numai a procentului mediu poate ascunde un număr mic de rute mult îmbunătățite și multe rute fără beneficiu.

Orele, măștile și semințele pentru aceeași pereche nu sunt eșantioane independente ale structurii urbane. O variantă simplă este agregarea lor pe pereche înaintea comparației. Dacă sunt folosite intervale bootstrap, reeșantionarea se face la nivel de pereche sau de bloc experimental, nu pe puncte GPS consecutive. Cu numai câteva perechi, intervalele pot fi instabile și trebuie interpretate descriptiv. Un test de semn poate fi exploratoriu, dar puterea mică și ipotezele lui trebuie precizate; absența unei diferențe detectabile nu dovedește egalitatea metodelor.

Se separă analiza principală, cu parametrii fixați, de sensibilitatea la λ, μ, δ, numărul de scenarii și pasul de eșantionare. Pentru fiecare se raportează direcția efectului și cazurile în care alegerea se schimbă. Se păstrează toate perechile eligibile, inclusiv cele cu rezultate negative, lipsă de conexiune sau încălcări de ocol. Refuzurile și datele lipsă se raportează în numitorul potrivit, fără a fi transformate în expunere zero.

### 11.2 Stadiul experimental la data redactării

Rezultatele proprii verificate în revizuire sunt inventarul fișierului geografic și concordanța hash-urilor, inspecția integrării motorului local și testele clientului. Acestea demonstrează existența datelor și a unor componente software, fără a măsura umbra fizică. Rezultatele bibliografice și modelul matematic fundamentează proiectul final. Logurile de verificare istorice din repository sunt tratate ca documentație, nu ca măsurători reproduse în această sesiune.

Rezultatele încă necesare sunt E1 complet reluat, evaluările cu 25% și 50% înălțimi ascunse, comparația A–B–C cu C implementată, E4 pe puncte și rute și timpii pe dispozitiv. E5 este suplimentar. Nu se raportează o reducere proprie a expunerii și nu se confundă datele OSM reale cu adevărul geometric de teren. Câmpul „Rezultat neobținut — experiment planificat” nu este o observație numerică și nu intră în statistici.

| Metodă, pereche, oră și mască | D m / T_est s | E_est / E_ind s | S_timp % / ocol % | Eroare s / calcul s |
| A, aceleași condiții | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut |
| B, aceleași condiții | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut |
| C, aceleași condiții | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut | Rezultat neobținut |

Toate celulele necompletate din acest tabel au statutul „Rezultat neobținut — experiment planificat”. E_ind este etichetată E_ref pentru simulare sau E_obs pentru teren; cele două nu sunt amestecate. T_obs și durata opririlor se adaugă în registrul parcurgerilor. S_timp este procentul temporal de umbră; E_necunoscut și acoperirea se raportează în coloane separate când clasificarea este incompletă.

După colectare, figurile prioritare sunt o hartă cu rutele și zonele necunoscute, un grafic al diferențelor pereche B–C și un grafic expunere–ocol. Orice bandă de variație trebuie etichetată ca dispersie între scenarii sau interval statistic, după calcul. Nu se desenează bare cu performanțe fictive pentru a umple pagina. Hărțile finale trebuie să includă scara, orientarea, ora, sursele și versiunea datelor.

## 12. Discuții și limitări

Avantajul potențial al UMBRA-R este evitarea recomandărilor care depind de o umbră fragilă la modificarea înălțimilor. Totuși, incertitudinea nu este sinonimă cu expunerea nefavorabilă. O clădire cu înălțime necunoscută poate produce în realitate o umbră foarte bună. Penalizarea poate exclude acel traseu și poate crește timpul în soare. De aceea, proiectul trebuie să măsoare efectul final al alegerii, nu doar reducerea unui indicator intern de incertitudine.

Rezultatele negative pot avea explicații diferite: intervale prea largi, date de referință slabe, rețea fără alternative sau o oră la care toate rutele sunt asemănătoare. Aceste explicații trebuie verificate prin ablații. Compararea cu μ = 0 izolează efectul penalizării; compararea cu înălțimi cunoscute izolează lipsa datelor; folosirea acelorași candidate controlează efectul căutării. Ajustarea post-hoc a parametrilor până când C câștigă ar elimina caracterul falsificabil al experimentului.

Modelul nu include toate sursele de umbră și nici accesibilitatea completă pentru persoane cu mobilitate redusă. Treptele, bordurile, lățimea trotuarului și traversările pot necesita date suplimentare. O aplicație destinată utilizării reale nu trebuie să transforme ocolul pentru umbră într-un motiv de a ignora accesul legal sau siguranța deplasării. În acest studiu, accesibilitatea verificată este o condiție de eligibilitate a muchiei înaintea optimizării.

Generalizarea este limitată de aria pilot, numărul perechilor, sezon și distribuțiile de înălțime alese. Un rezultat bun în câteva străzi nu demonstrează performanță în întregul oraș. O geometrie LiDAR mai precisă poate modifica comparația dintre B și C, iar datele nominale foarte bune pot reduce utilitatea penalizării. Contribuția trebuie descrisă în raport cu aceste condiții, fără afirmații de superioritate universală.

## 13. Concluzii și continuarea cercetării

La întrebarea principală, dovezile existente nu permit încă un răspuns afirmativ sau negativ despre expunerea solară reală. Modelul arată cum poate fi penalizată dependența unei rute de înălțimi incerte; exemplul ilustrativ demonstrează numai schimbarea selecției sub o funcție de cost. Datele incluse și codul local susțin fezabilitatea tehnică a pipeline-ului; testele clientului nu demonstrează superioritatea UMBRA-R. Susținerea ipotezei H1 cere comparații pereche și observații independente, cu aceeași limită de ocol.

Direcția este justificată prin relația fizică dintre înălțime și umbră și prin literatura de rutare. Contribuția urmărită este o adaptare evaluată reproductibil, nu revendicarea invenției rutării umbrite sau a optimizării robuste. Prioritatea este completarea și verificarea metodelor experimentale B și C, apoi E1–E4 într-o zonă restrânsă. Arhitectura finală separă pachetul de oraș de algoritm, iar E5 verifică exploratoriu transferul. Dacă sunt disponibile numai simulări, concluzia trebuie limitată la scenariile și geometria folosite; rezultatele negative vor fi păstrate.

### 13.1 Relevanța practică pentru utilizarea zilnică

Pentru o deplasare de vară către școală, transport public sau o destinație apropiată, utilizatorul ar putea compara durata minimă cu o alternativă care estimează mai puțin timp în soare. Persoanele care preferă evitarea expunerii directe ar seta un buget de timp suplimentar și ar vedea atât beneficiul estimat, cât și zonele necunoscute. În zone cu clădiri înalte, ora poate schimba trotuarul favorabil; recomandarea trebuie recalculată pentru momentul mersului.

Preferințele personalizabile permit alegerea compromisului dintre timp, expunere și incertitudine. Aceste utilizări descriu sistemul final urmărit; motorul local din cod nu reprezintă o validare fizică a recomandărilor, iar încărcarea unui alt oraș rămâne proiectată. Estimarea umbrei nu demonstrează reducerea temperaturii corpului sau prevenirea unei afecțiuni. Vremea, accesul pietonal și calitatea datelor rămân condiții ale recomandării, afișate separat de un scor de expunere.

### 13.2 Dezvoltări ulterioare

Extensiile pot include vegetația, poziția incertă a trotuarelor, grafuri extinse în timp și verificări în mai multe sezoane. Se adaugă numai după identificarea erorii dominante în pilot. Un studiu al confortului termic necesită instrumente și variabile suplimentare; nu poate fi dedus din timpul geometric în soare. Extinderea geografică și vizualizarea 3D nu înlocuiesc validarea locală.


## Anexa A Plan de lucru și registru reproductibil

Prioritățile sunt fixarea ariei și referinței, refacerea mediului de test, reluarea E1, implementarea modurilor B și C, execuția E2–E3 și observațiile E4. E5 se efectuează numai dacă acestea sunt complete și există timp pentru o verificare reală. Extinderea interfeței și vizualizarea 3D nu înlocuiesc dovada că umbra simulată se apropie de cea observată.

Registrul fiecărei rulări trebuie să conțină run_id, versiunea codului, amprenta fișierelor de date, perechea origine–destinație, marcajele UTC și locale, metoda, λ, μ, δ, viteza, numărul scenariilor și sămânța. Rezultatele includ ruta ca listă de muchii, D, T, E_est, E_ref sau E_obs, U, timpul de calcul și motivul eventualului refuz. Datele brute se păstrează separat de fișierele curățate, iar corecțiile au explicații.

Fișa de teren include observation_id, segment_id, momentul exact, coordonata, reperul fizic, starea cerului, eticheta umbră–soare–necunoscut, sursa umbrei, fotografia și observațiile. Identitatea trecătorilor și istoricul personal al deplasărilor nu sunt necesare. Analiza trebuie să poată reconstrui fiecare valoare publicată pornind de la fișe și de la configurația rulării. Un fișier cu valori agregate, fără proveniență, nu este suficient pentru reproducere.

## Anexa B Susținerea științifică în fața juriului

Se propune o susținere de aproximativ opt minute, fără statut de durată oficială. Minutele 0–1 explică problema și întrebarea; 1–2 prezintă literatura și contribuția; 2–3 explică figura umbrei; 3–4 arată costul și exemplul ilustrativ; 4–5 descriu cele patru experimente; 5–7 sunt rezervate demonstrației reale și rezultatelor disponibile; 7–8 prezintă limitele și concluzia. Dacă mediul de rulare nu este funcțional, intervalul demonstrației prezintă numai dovezile disponibile și explică explicit ce nu a fost executat. C nu trebuie reprezentată prin ruta shadiest curentă fără implementarea și identificarea metodei. Opt minute sunt o propunere de organizare, nu o cerință RoSEF.

Demonstrația finală urmărește o singură pereche de puncte, aceeași oră și cele trei metode A, B și C, după implementarea lor distinctă. Se afișează separat timpul, expunerea și incertitudinea. Modificarea unei înălțimi ilustrează sensibilitatea, fără a fi numită validare în teren. Pentru funcții încă neimplementate se prezintă schema de lucru. Planul de rezervă este o înregistrare a unei rulări reale, cu configurație și date exportate; o animație ilustrativă trebuie etichetată ca atare.

La întrebarea despre noutate, răspunsul susținut de această documentare este că rutarea după umbră există, iar UMBRA investighează efectul informațiilor geometrice incomplete într-un protocol local. La întrebarea despre Dijkstra, explicația este că acesta rezolvă costul aditiv fix; reevaluarea temporală și dispersia de traseu cer pași suplimentari. La întrebarea despre înălțimi, se prezintă registrul surselor și intervalele, fără a numi estimările măsurători.

La întrebarea despre superioritate se arată comparațiile pereche și condițiile în care metoda eșuează. La întrebarea despre contribuția elevilor se prezintă numai activitățile executate efectiv, rolurile și jurnalul de lucru. Utilizarea AI pentru documentare, redactare sau programare trebuie declarată corespunzător în documentele concursului [17]; autorii trebuie să verifice sursele și să poată explica formulele și codul. Nici această redactare asistată, nici existența unui prototip nu substituie experimentele.

## Bibliografie

[1] Wolf H, Vierø AR, Szell M. 2025. CoolWalks for active mobility in urban street networks. Scientific Reports 15, 14911. DOI https://doi.org/10.1038/s41598-025-97200-2. https://doi.org/10.1038/s41598-025-97200-2

[2] Feng Y, Zhang P, Xue J, Chen Z, Meng L. 2024. Walking in the Shade: Shadow-oriented Navigation for Pedestrians. Proceedings of the 32nd ACM SIGSPATIAL International Conference on Advances in Geographic Information Systems, pp. 677–680. DOI https://doi.org/10.1145/3678717.3691287. Fișă instituțională consultată: https://portal.fis.tum.de/en/publications/walking-in-the-shade-shadow-oriented-navigation-for-pedestrians/

[3] Wen J, Abuhani DA, Mazzarello M, Duarte F, Norford L, Xu R, Wong NH, Ratti C. 2025. Walking smart in the heat: A dynamic shade-oriented pathfinding approach to enhance pedestrian comfort in arid cities. Computers, Environment and Urban Systems 122, 102337. DOI https://doi.org/10.1016/j.compenvurbsys.2025.102337. Text disponibil prin MIT: https://senseable.mit.edu/papers/pdf/20250911_Wen-etal_WalkingSmart_CEUS.pdf

[4] MIT Senseable City Lab. Cooling Path. Pagină instituțională a proiectului. https://senseable.mit.edu/cooling-path/

[5] Peng F, Xiong Y, Zou B. 2021. Identifying the optimal travel path based on shading effect at pedestrian level in cool and hot climates. Urban Climate 40, 100988. DOI https://doi.org/10.1016/j.uclim.2021.100988. https://www.sciencedirect.com/science/article/pii/S2212095521002182

[6] Verma D, Mumm O, Carlow VM. 2026. Seeking shade: an agent-based model to study shadow-focused pedestrian movement: Case study in Berlin. Transportation Research Interdisciplinary Perspectives 36, 101883. DOI https://doi.org/10.1016/j.trip.2026.101883. Metadate instituționale consultate: https://research.tue.nl/nl/publications/seeking-shade-an-agent-based-model-to-study-shadow-focused-pedest/ Textul integral al editorului nu a fost accesibil în această verificare.

[7] Bertsimas D, Sim M. 2003. Robust discrete optimization and network flows. Mathematical Programming 98, 49–71. DOI https://doi.org/10.1007/s10107-003-0396-4. Copie a autorului: https://web.mit.edu/dbertsim/www/papers/melvyn/Robust-Discrete-Optimization-And-Network-Flows-MP98.pdf

[8] OpenStreetMap contributors. Key height. Documentație comunitară privind atributul de înălțime. https://wiki.openstreetmap.org/wiki/Key:height

[9] Geofabrik. Download OpenStreetMap data for Romania. https://download.geofabrik.de/europe/romania.html

[10] OSMnx. Getting Started. Documentația proiectului software. https://osmnx.readthedocs.io/en/stable/getting-started.html

[11] Zhu XX, Chen S, Zhang F, Shi Y, Wang Y. 2025. GlobalBuildingAtlas: an open global and complete dataset of building polygons, heights and LoD1 3D models. Earth System Science Data 17, 6647–6668. DOI https://doi.org/10.5194/essd-17-6647-2025. https://essd.copernicus.org/articles/17/6647/2025/ Setul de date: DOI https://doi.org/10.14459/2025mp1782307.

[12] GlobalBuildingAtlas. Terms of Use. https://tubvsig-so2sat-vm1.srv.mwn.de/terms_of_use.html

[13] OpenStreetMap Foundation. Copyright and License. https://www.openstreetmap.org/copyright

[14] Reda I, Andreas A. Solar Position Algorithm for Solar Radiation Applications. NREL/TP-560-34302, versiune revizuită în ianuarie 2008. https://docs.nrel.gov/docs/fy08osti/34302.pdf

[15] pvlib python. Solar position calculation. Documentația funcției get_solarposition. https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.solarposition.get_solarposition.html

[16] UMBRA. Repository local, revizia f71e140, inspectat la 26 octombrie 2026. Fișiere: mobile/src/engine/{data,geometry,solar,overlay,exposure,routing}.ts; mobile/src/services/localEngine.ts; mobile/assets/data/manifest.json; docs/mobile-verification.md. Proveniență a datelor și dovezi software; fără validare independentă în teren. Adresa origin: https://github.com/Ieditzu/umbra (acces web 404 la revizuire; analiza folosește copia locală).

[17] Societatea Științifică Cygnus. Regulament specific de organizare și desfășurare RoSEF, nr. 1119 din 29 decembrie 2025, publicat pentru ediția 2026. https://cygnus.org.ro/wp-content/uploads/2026/05/Regulament-RoSEF-2026.pdf

[18] Societatea Științifică Cygnus. Anunțurile oficiale RoSEF 2026. https://cygnus.org.ro/

Documentarea inițială este din 24 octombrie 2026; la 26 octombrie au fost reverificate prioritar sursele instituționale CoolWalks, Feng, MIT Cooling Path, copia Bertsimas–Sim și regulamentul. Celelalte referințe sunt păstrate din documentarea inițială; textul integral al studiului Verma rămâne neconsultat, iar verificarea Peng folosește pagina și fragmentele editorului. DOI-ul Bertsimas–Sim corect este 10.1007/s10107-003-0396-4, conform primei pagini a articolului. Rezultatele numerice ale MIT sunt atribuite exclusiv cercetării citate. Documentele de referință furnizate de utilizator au orientat forma academică și delimitarea temei, fără a fi tratate ca dovezi experimentale pentru SmartRoute. Textul și verificarea bibliografică au beneficiat de asistență AI; identitatea autorilor și contribuțiile lor efective trebuie completate de echipă.
