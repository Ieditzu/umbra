# UMBRA SmartRoute
## Optimizarea traseelor pietonale umbrite în condiții de incertitudine a înălțimilor clădirilor

Studiu de fundamentare științifică și protocol experimental pentru RoSEF 2026

Versiune documentată la 24 octombrie 2026. Zona propusă de studiu este Constanța, România. Autorii, instituția și mentorul nu au fost comunicați pentru această versiune și trebuie înscriși înainte de depunere. Statutul cercetării este de fundamentare bibliografică și metodă propusă, fără rezultate experimentale de teren.

### Rezumat
UMBRA SmartRoute investighează alegerea traseelor pietonale cu expunere redusă la soare atunci când înălțimile clădirilor sunt incomplete sau inexacte. Literatura arată că navigația orientată după umbră este deja un domeniu activ; în consecință, contribuția propusă nu constă în inventarea acestei navigații, ci în evaluarea efectului incertitudinii geometrice asupra recomandărilor. Pentru o zonă restrânsă din Constanța se propune compararea a trei metode: traseul cu durată minimă, rutarea după umbra nominală și UMBRA-R, o variantă cu penalizare explicită a incertitudinii. Modelul combină o rețea pietonală, contururi de clădiri, poziția solară și scenarii alternative de înălțime. Expunerea este exprimată în secunde petrecute în soare, iar performanța se evaluează prin comparații pereche, ocol, eroarea predicției și sensibilitatea la date lipsă. Protocolul separă verificarea software, experimentele pe geometrii controlate și observațiile pe teren. Nu sunt raportate reduceri măsurate ale expunerii pentru UMBRA, deoarece asemenea date nu au fost furnizate. Concluzia actuală este metodologică: proiectul poate susține o cercetare verificabilă dacă limitează aria pilot, păstrează evaluarea independentă și testează dacă tratarea incertitudinii aduce un beneficiu față de modelul nominal.

Cuvinte cheie: rutare pietonală; umbrire urbană; OpenStreetMap; optimizare pe grafuri; incertitudine geometrică; validare experimentală.

## 1 Introducere și delimitarea problemei

Un traseu scurt nu este obligatoriu traseul cu cea mai mică expunere directă la soare. Fațadele, orientarea străzilor și momentul deplasării produc distribuții spațiale diferite ale umbrei. Studiile CoolWalks și Walking in the Shade arată că informația geometrică poate fi integrată în alegerea traseului [1, 2]. Pentru UMBRA, întrebarea practică este ce se întâmplă atunci când această informație este nesigură. O recomandare aparent favorabilă poate conduce la un ocol fără umbra anticipată dacă modelul supraestimează o clădire.

Proiectul urmărește o singură componentă a mediului pietonal: expunerea geometrică la radiația solară directă. Timpul petrecut în soare nu este echivalent cu temperatura aerului, temperatura resimțită, doza ultravioletă sau riscul medical. Aceste mărimi depind și de nori, vânt, umiditate, îmbrăcăminte, activitate și proprietățile suprafețelor. O afirmație despre confort termic ar necesita măsurători și un model suplimentar. Lucrarea nu deduce efecte fiziologice din simpla existență a umbrei.

Constanța este propusă ca studiu local, fără presupunerea că rezultatele altor orașe se transferă direct. O zonă pilot trebuie să cuprindă străzi cu alternative pietonale reale, clădiri de înălțimi diferite și spații accesibile verificabile. Nu se atribuie orașului procente de clădiri cu înălțime cunoscută sau valori climatice locale care nu au fost măsurate ori extrase dintr-o sursă documentată. Contextul climatic justifică interesul aplicației, dar nu înlocuiește verificarea datelor locale.

Obiectivul aplicativ este o recomandare explicabilă: utilizatorul alege originea, destinația, data, ora și toleranța la ocol, apoi compară alternative cu estimări de expunere și incertitudine. Obiectivul științific este mai restrâns: măsurarea diferenței dintre un model nominal și unul care folosește scenarii geometrice. Un rezultat negativ, în care penalizarea incertitudinii nu îmbunătățește expunerea observată, rămâne informativ și trebuie păstrat.

## 2 Stadiul actual al cercetării

### 2 1 Rutarea după umbră și rolul geometriei

Wolf, Vierø și Szell au publicat în 2025 studiul CoolWalks for active mobility in urban street networks, în Scientific Reports [1]. Autorii modelează alegerea rutelor printr-un parametru de evitare a soarelui și introduc CoolWalkability pentru caracterizarea oportunităților de mers la umbră. Analiza combină rețele sintetice și exemple din Manhattan, Barcelona și Valencia. Un rezultat important este că o grilă regulată idealizată, cu clădiri de înălțime constantă, nu produce automat avantaj pentru evitarea soarelui; variația geometriei și a înălțimilor contează. Indicatorul este o proprietate a posibilităților de rutare și nu o temperatură măsurată. Pentru UMBRA, lecția principală este că o rețea trasată pe axul străzii poate descrie insuficient umbra de pe trotuare. Studiul susține analiza sensibilității geometrice; nu demonstrează performanța UMBRA-R în Constanța.

Feng, Zhang, Xue, Chen și Meng descriu în 2024 sistemul Walking in the Shade: Shadow-oriented Navigation for Pedestrians [2]. Într-o zonă din München, ei combină o rețea pietonală OpenStreetMap corectată manual, modele urbane LoD2 și simularea umbrelor prin ray tracing. Utilizatorul poate favoriza trasee mai scurte sau mai umbrite, iar vizualizarea tridimensională sprijină verificarea. Fișa instituțională confirmă arhitectura generală și domeniul demonstrației; ea nu oferă toate detaliile de implementare. Nu se atribuie autorilor un algoritm exact de căutare sau un câștig numeric neverificat. Diferența urmărită de UMBRA este folosirea unor înălțimi incomplete și a unui model de incertitudine, cu o geometrie inițial mai simplă decât LoD2.

### 2 2 Integrarea umbrei în mediul pietonal

Wen și colaboratorii au publicat în 2025 Walking smart in the heat: A dynamic shade-oriented pathfinding approach to enhance pedestrian comfort in arid cities [3], asociat proiectului MIT Cooling Path. Metodologia analizează zone din jurul stațiilor de metrou din Dubai, combinând trasee exterioare și interioare, umbră de clădiri și arbori și recompense diferențiate. Pagina proiectului raportează, în medie, trasee optime umbrite cu 1,3% mai lungi și o reducere a expunerii de 8,8% [4]. Aceste valori aparțin studiului respectiv. Articolul discută necesitatea calibrării locale și limite privind accesul și deplasarea în interior. Pentru UMBRA este relevantă separarea dintre tipurile de umbră; nu este justificată transferarea coeficienților de confort din Dubai către Constanța fără validare.

Peng, Xiong și Zou au analizat în 2021 traseele optime după umbrire în climate calde și răcoroase [5]. Studiul din Peninsula Kowloon, Hong Kong, folosește date LiDAR, poziția solară și informații despre clădiri și vegetație. Evaluarea urmărește variațiile sezoniere și orare, inclusiv alegerea unor trasee mai însorite în sezonul rece. Modelul descris utilizează pixeli de 10 × 10 m, o rezoluție care poate pierde diferențe între trotuare apropiate. Relevanța pentru UMBRA este caracterul dependent de timp și de obiectiv al rutării. Limitarea evidențiată aici este necesitatea unei rezoluții compatibile cu decizia pietonală, nu o eroare demonstrată a studiului.

Verma, Mumm și Carlow au publicat în 2026 Seeking shade: an agent-based model to study shadow-focused pedestrian movement: Case study in Berlin [6]. Metadatele instituționale confirmă autorii, publicarea și orientarea către modelarea bazată pe agenți. În această documentare nu a putut fi consultat textul integral de la editor, care a returnat o eroare de acces. Prin urmare, articolul este folosit ca reper pentru simularea comportamentului pietonal, fără reconstruirea unor proceduri sau atribuirea unor rezultate numerice pe care textul primar accesibil nu le permite verificarea.

### 2 3 Optimizarea robustă și poziționarea contribuției

Bertsimas și Sim au formulat un cadru consacrat pentru optimizare discretă și fluxuri în rețele cu date incerte [7]. Ideea de a controla conservatorismul unei decizii nu este nouă. UMBRA-R trebuie prezentat ca o adaptare experimentală la expunerea produsă de umbre urbane, cu propriile alegeri de reprezentare și validare. Adăugarea unei penalizări la Dijkstra nu demonstrează, singură, o contribuție algoritmică fundamentală. Valoarea cercetării poate proveni dintr-o evaluare reproductibilă a legăturii dintre înălțimi, umbre și rute.

| Studiu | Date și metodă | Ce justifică pentru UMBRA |
| CoolWalks 2025 [1] | Rețele urbane și umbre de clădiri | Controlul geometriei pietonale |
| Walking in the Shade 2024 [2] | OSM corectat și modele LoD2 | Separarea calității datelor de algoritm |
| Walking smart in the heat 2025 [3] | Rețele exterioare și interioare | Calibrarea obiectivului la context |
| Peng și colaboratorii 2021 [5] | LiDAR și variație sezonieră | Evaluarea la ore și date explicite |
| Seeking shade 2026 [6] | Modelare pietonală cu agenți | Extensie ulterioară către comportament |
| Bertsimas și Sim 2003 [7] | Optimizare cu costuri incerte | Controlul penalizării incertitudinii |

În sursele consultate nu a fost identificată o demonstrație direct transferabilă a întregului protocol propus pentru Constanța. Această constatare delimitează documentarea efectuată și nu dovedește inexistența altor soluții. Căutarea a urmărit expresii precum shade-aware pedestrian routing, uncertain building heights și robust shortest path, cu prioritate pentru articole și pagini ale autorilor sau instituțiilor. Nu se revendică o premieră mondială și nu se confundă o căutare țintită cu o revizuire sistematică exhaustivă.

## 3 Întrebări de cercetare și ipoteze

Întrebarea principală este următoarea: pe o rețea pietonală verificată din Constanța, modelarea incertitudinii înălțimilor reduce expunerea evaluată independent față de rutarea după umbre nominale, pentru aceeași limită de ocol? Referința independentă poate fi o geometrie verificată, în experimentul controlat, sau observația umbrei, în teren. Rezultatele celor două forme de evaluare vor fi raportate separat.

Ipoteza H1 afirmă că, în condiții de înălțimi lipsă sau perturbate, mediana diferenței pereche dintre expunerea metodei nominale și a UMBRA-R este pozitivă. Un avantaj apare numai dacă ocolul rămâne în limita prestabilită. Ipoteza nu este susținută dacă diferența este nulă ori negativă sau dacă beneficiul presupune depășirea limitei. Într-un eșantion mic, semnul medianei descrie datele colectate și nu dovedește automat un efect general în oraș.

Ipoteza H2 afirmă că eliminarea informațiilor despre înălțime mărește eroarea de predicție a metodei nominale, comparativ cu aceeași rețea cu date complete. Ipoteza H3 afirmă că beneficiul penalizării depinde de ora plecării și de parametrul de aversiune la incertitudine. O penalizare prea mare poate prefera trasee lungi, cu expunere mai mare. Acest risc este parte din întrebare, nu un caz care poate fi eliminat din raportare.

Variabilele independente sunt metoda de rutare, proporția înălțimilor ascunse, amplitudinea perturbării, ora și parametrii funcției de cost. Variabilele dependente sunt timpul în soare, eroarea estimării, durata, ocolul și timpul de calcul. Originea, destinația, rețeaua, viteza de referință și scenariile de test trebuie menținute comune între metode în fiecare comparație. Condițiile meteorologice se înregistrează ca factori de context, iar acoperirea vegetației se notează separat.

Contribuția proprie propusă are trei componente verificabile: o reprezentare documentată a înălțimilor și a incertitudinii lor, un cost de rutare care penalizează dezacordul dintre scenarii și un experiment controlat cu evaluare independentă. Un set de date local bine documentat și un rezultat negativ explicat pot fi mai valoroase științific decât o interfață cu multe funcții nevalidate. Numele UMBRA-R identifică această configurație experimentală și nu o certificare a superiorității sale.

## 4 Datele pentru zona pilot din Constanța

### 4 1 Surse și accesibilitate

OpenStreetMap oferă geometrii și atribute pentru drumuri, căi pietonale și clădiri. Documentația atributului height descrie înălțimea obiectului; building:levels poate sprijini o estimare separată [8]. Prezența unui atribut nu garantează verificarea lui prin măsurare. În registrul proiectului trebuie păstrate atât valoarea brută, cât și valoarea interpretată, sursa și metoda de obținere. O valoare declarată în OSM nu trebuie etichetată automat drept înălțime verificată.

Geofabrik pune la dispoziție un extras pentru România, inclusiv în format OSM PBF [9]. Acesta constituie o sursă accesibilă pentru extragerea zonei Constanța, fără a demonstra completitudinea locală. OSMnx permite descărcarea și modelarea rețelelor și a obiectelor geospațiale prin interogări spațiale [10]. Overpass poate fi o alternativă pentru o zonă mică. Pentru reproducibilitate, interogarea, conturul ariei, data extragerii și fișierul brut trebuie arhivate. Nu s-a realizat în această etapă un recensământ al clădirilor din oraș.

GlobalBuildingAtlas este o sursă suplimentară de poligoane, înălțimi estimate și modele LoD1, descrisă de Zhu și colaboratorii [11]. Acoperirea globală justifică investigarea produsului pentru România, dar nu dovedește precizia fiecărei clădiri din Constanța. Înălțimile derivate automat trebuie comparate cu exemple locale. Termenii portalului indică CC BY-NC 4.0 pentru setul de date [12], iar articolul separă componente cu alte condiții de redistribuire. Licența articolului, a datelor și a codului nu este aceeași. Se arhivează termenii produsului efectiv utilizat înainte de a distribui date derivate.

Datele OSM sunt distribuite sub ODbL, cu cerințe de atribuire și condiții pentru bazele de date derivate [13]. Pe hartă se păstrează atribuirea contribuitorilor, iar în pachetul experimental se descrie proveniența. Harta de fundal și baza de date geometrică sunt componente distincte. Nu se presupune că reprezentarea tridimensională dintr-un serviciu comercial poate fi extrasă și reutilizată liber. Pentru experiment este suficientă o combinație documentată de date deschise și verificări proprii.

### 4 2 Auditul local și completarea înălțimilor

Aria pilot se alege după o inspecție preliminară a conectivității și a accesului. Se recomandă câteva străzi conectate, cu alternative între punctele terminale, în locul întregului oraș. Pentru fiecare clădire se creează câmpurile building_id, height_raw, height_m, source, method și uncertainty_class. Datele suspecte, unitățile neclare și geometriile invalide sunt păstrate într-un jurnal de corecții. Se raportează numărul total de clădiri, numărul cu height, numărul numai cu building:levels și numărul fără informație verticală.

Completitudinea geometrică se calculează ca p_height = N_height / N_buildings. Se raportează separat proporția clădirilor cu sursă verificată. Dacă o clădire are numai numărul de niveluri, înălțimea poate fi estimată ca H = n × h_etaj + h_acoperiș. Parametrii trebuie justificați prin câteva clădiri locale și însoțiți de intervale; alegerea unei valori convenabile nu o transformă în măsurătoare. Fără n, se poate folosi un interval pentru o clasă locală de clădiri, cu încredere redusă. Niciun interval nu este probabilistic valid doar fiindcă a fost introdus în program.

Toate lungimile se calculează într-un sistem de coordonate metric adecvat zonei, de exemplu UTM 35N, după verificarea transformării. Nu se calculează distanțe în metri direct din grade geografice. Trotuarele și traversările trebuie inspectate: o rută matematică nu este acceptabilă dacă traversează o clădire, un spațiu închis sau o arteră într-un loc nepermis. Eroarea laterală a rețelei poate conta la fel de mult ca înălțimea și trebuie tratată ca limitare independentă.

## 5 Modelul geometric al umbrei

### 5 1 Poziția solară și timpul

Poziția Soarelui este descrisă prin azimutul A și elevația α, calculate în funcție de coordonate, dată și moment. Azimutul se măsoară aici de la nord, în sens orar. O bibliotecă trebuie configurată și verificată după aceeași convenție. Algoritmul SPA al lui Reda și Andreas constituie un reper documentat [14], iar pvlib oferă funcții pentru poziția solară și solicită interpretarea corectă a marcajelor de timp [15]. Implementarea propusă folosește o bibliotecă verificată, în locul unei formule aproximative nesupuse testării.

Ora aleasă de utilizator se interpretează în Europe/Bucharest și se convertește într-un moment UTC neechivoc. Se păstrează data locală, fusul și deplasarea UTC, fără a fixa permanent un decalaj numeric. La tranzițiile orei sezoniere, o oră locală poate fi ambiguă sau inexistentă; intrarea trebuie clarificată ori respinsă. Folosirea orei calculatorului fără fus este o sursă de erori care poate deplasa semnificativ umbra, chiar dacă geometria clădirii este corectă.

### 5 2 Proiecția unei clădiri idealizate

Pentru un obiect vertical de înălțime H pe un plan orizontal și o sursă solară cu raze paralele, lungimea umbrei este:

EQ L = H / tan(α)

Formula se aplică pentru 0 < α < 90°. Cu axele est și nord, vectorul de translație al unui punct de la înălțimea H către sol este:

EQ d = −H cot(α) × (sin A, cos A)

Semnul negativ exprimă proiectarea în direcția opusă Soarelui. Pentru o amprentă P extrudată la înălțime constantă, regiunea umbrită pe sol este baleierea lui P pe segmentul dintre vectorii 0 și d. Aceasta include poligonul inițial și suprafețele generate de muchii. Reuniunea umbrelor tuturor clădirilor se intersectează cu geometria pietonală. Pentru amprente concave nu este corectă folosirea necondiționată a învelișului convex, care ar putea produce umbră artificială în goluri.

Exemplu strict analitic: pentru H = 12 m și α = 30°, rezultă L ≈ 20,78 m. Dacă singura eroare este ΔH = 3 m, atunci variația lungimii este aproximativ ΔL = 3 / tan(30°) ≈ 5,20 m. Aceste valori derivă din formula geometrică și nu reprezintă măsurători în Constanța. Exemplul arată de ce o eroare verticală modestă poate schimba clasificarea unui trotuar situat lângă limita umbrei.

Sensibilitatea locală este ∂L/∂H = cot(α). La elevații mici, erorile înălțimii au un efect mai mare asupra lungimii umbrei. Pentru α apropiat de zero, modelul devine instabil numeric și aria necesară de clădiri crește. Prima versiune poate limita evaluarea la α ≥ 10°, prag operațional propus, nu constantă fizică. Cazurile excluse se raportează, iar pragul se verifică prin analiză de sensibilitate. Când Soarele este sub orizont, nu se aplică formula unei umbre solare directe.

### 5 3 Limitele reprezentării

Modelul LoD1 presupune pereți verticali, acoperiș simplificat și teren aproximativ plan. Balcoanele, pasajele, streșinile, panta și retragerile etajelor pot produce diferențe față de observație. Copacii nu sunt reprezentați corect prin clădiri opace: coroanele au transparență variabilă și geometrie sezonieră. În aria pilot, vegetația se notează separat și segmentele dominate de ea se analizează distinct. O abatere produsă de un copac nu trebuie atribuită automat înălțimii unei clădiri.

Pentru a evita lipsa umbrelor provenite din afara zonei, aria clădirilor trebuie să depășească aria rutelor. Un tampon justificat geometric poate fi ales din H_max / tan(α_min), la care se adaugă toleranța de poziție. Înălțimea maximă presupusă și pragul solar se consemnează. Alegerea unui dreptunghi mic doar pentru a accelera calculul poate introduce o eroare sistematică la marginile hărții.

## 6 Expunerea și funcțiile de cost

### 6 1 Rețeaua pietonală și expunerea dependentă de timp

Rețeaua este un graf G = (V, E), cu noduri la conexiuni și muchii pentru segmente accesibile. Fiecare muchie e are lungimea l_e și durata τ_e. În modelul inițial, τ_e = l_e / v, unde v este o viteză de referință declarată. Viteza constantă este o simplificare; așteptarea la traversări și diferențele individuale se înregistrează separat atunci când există observații. Pe aceeași pereche origine–destinație, metodele trebuie evaluate cu aceleași ipoteze de deplasare.

Fie s(x, t, H) o funcție care valorează 1 dacă punctul x este umbrit la momentul t în geometria H și 0 dacă este însorit. Pentru un traseu R parcurs pe durata T, expunerea geometrică este:

EQ E(R, t₀, H) = ∫₀ᵀ [1 − s(x_R(u), t₀ + u, H)] du

Expunerea are unitatea secunde. Definiția urmărește momentul real al trecerii prin fiecare punct; umbra nu este presupusă fixă pe toată durata mersului. Numeric, integrala se aproximează prin eșantionare spațială și temporală. Pasul se alege înaintea experimentului și se verifică prin înjumătățire. Diferența dintre discretizări trebuie raportată; o densitate mare de puncte nu repară înălțimi greșite sau trotuare deplasate.

### 6 2 Modelul nominal și incertitudinea

Metoda nominală minimizează un compromis între durată și expunerea estimată la înălțimile centrale H_nom:

EQ C_nom(R) = T(R) + λ E(R, t₀, H_nom)

Coeficientul λ ≥ 0 este fără unitate, deoarece ambele componente sunt exprimate în secunde. El descrie o preferință și nu o relație medicală. Pentru același traseu, se generează K scenarii H^(1), …, H^(K) și expunerile E_k(R). Media lor este E_bar(R), iar dispersia dintre scenarii poate fi descrisă prin abaterea standard:

EQ U(R) = sqrt{ Σₖ [E_k(R) − E_bar(R)]² / (K − 1) }

Funcția propusă pentru evaluarea traseelor candidate este:

EQ C_R(R) = T(R) + λ E_bar(R) + μ U(R)

Și U este exprimată în secunde, astfel încât μ ≥ 0 este fără unitate. Dacă scenariile nu au o distribuție calibrată, media și abaterea standard sunt rezumate de scenarii și nu intervale de încredere despre realitate. Incertitudinea trebuie denumită precis: dezacord al modelului sub ipotezele de înălțime, nu probabilitate garantată de confort. Scenariile folosesc aceeași înălțime pentru o clădire pe toate muchiile și momentele unui parcurs, pentru a păstra dependențele geometrice.

### 6 3 Cost aditiv și robustețe de traseu

Pentru o variantă simplă se calculează, la o oră de referință, expunerea medie e_bar_e și abaterea standard u_e pe fiecare muchie. Costul w_e = τ_e + λ e_bar_e + μ u_e este nenegativ și aditiv. El poate fi minimizat prin Dijkstra. Totuși, suma abaterilor standard pe muchii nu este, în general, abaterea standard a expunerii totale: umbrele aceleiași clădiri produc dependențe. Varianta trebuie etichetată UMBRA-R aditiv, ca aproximare conservatoare în sensul dispersiei, fără garanție asupra expunerii reale.

Alternativa min–max minimizează T(R) + λ max_k E_k(R). Aceasta protejează față de cel mai nefavorabil scenariu inclus, dar poate fi prea conservatoare dacă intervalele sunt largi. O geometrie artificială extremă poate elimina aproape orice avantaj al umbrei. Prima implementare ar trebui să compare modelul nominal cu penalizarea moderată a dezacordului și să păstreze min–max ca analiză secundară. Un algoritm care optimizează costul mediu pe muchii nu rezolvă automat obiectivul min–max al întregului traseu.

Se impune și o limită explicită T(R) ≤ (1 + δ)T_min. De exemplu, δ = 0,15 poate fi un prag experimental prestabilit, fără statut de valoare optimă. Parametrii λ și μ se aleg pe trasee de calibrare, apoi se fixează înaintea testării independente. Compararea mai multor valori pe test și raportarea numai a celei mai bune ar supraestima performanța. Sensibilitatea la pragul de ocol și la ponderi se prezintă inclusiv când rezultatele sunt nefavorabile.

## 7 Algoritmul și arhitectura software propuse

### 7 1 Alegerea unei soluții realizabile

Dijkstra este adecvat pentru un graf cu ponderi fixe nenegative și are, cu o coadă de priorități uzuală, complexitatea O((|V| + |E|) log |V|). A* poate reduce căutarea dacă euristica este admisibilă. O limită inferioară bazată pe distanța în linie dreaptă împărțită la viteza maximă admisă este compatibilă cu ponderi care includ numai penalizări nenegative. O euristică bazată pe umbra presupusă poate supraestima și trebuie demonstrată, nu acceptată intuitiv.

Nici Dijkstra, nici A* în forma lor obișnuită nu garantează optimul pentru un cost care se modifică în timpul mersului. Plecarea mai târzie poate schimba expunerea fără a schimba durata fizică a segmentului. În prima versiune, soluția realistă este generarea unui set de rute candidate cu ponderi fixe, apoi reevaluarea lor cu umbre la timpii efectivi de trecere. Alegerea finală este optimă numai în setul candidat. Această limitare trebuie precizată la prezentarea rezultatelor.

Pseudocodul operațional este următorul: se validează intrarea și accesibilitatea; se calculează traseul cu durată minimă; se generează alternative distincte prin mai multe ponderi nominale și penalizări; se elimină rutele ce depășesc ocolul; se evaluează fiecare rută în aceleași scenarii la t₀ plus timpul parcurs; se calculează costul și dispersia; se selectează alternativa cu valoarea cea mai mică; se exportă scenariile, rutele și motivele selecției. Rutele duplicate se elimină după secvența muchiilor, nu după culoarea afișată.

Pentru M rute candidate, K scenarii și Q eșantioane pe rută, reevaluarea necesită aproximativ O(MKQ) interogări de umbrire, în afara construirii geometriei și a indexării spațiale. Aceste operații pot domina timpul de calcul; complexitatea Dijkstra nu descrie întregul sistem. Indicii spațiali, memorarea poziției solare și reutilizarea umbrelor pe intervale scurte pot reduce costul. Timpul se măsoară separat pentru pregătirea datelor, calculul umbrelor și selecția rutei.

O extensie mai riguroasă utilizează un graf extins în timp, cu stări (v, t_j) și tranziții ce reprezintă deplasarea la momente discrete. Dimensiunea crește cu numărul intervalelor temporale. Dacă se permite așteptarea, aceasta trebuie definită explicit; altfel algoritmul poate exploata o regulă de așteptare care nu corespunde utilizării. Pentru o săptămână de lucru, această extensie este opțională, după verificarea pipeline-ului static și a reevaluării temporale.

### 7 2 Stadiul verificat al proiectului

Documentația curentă a proiectului descrie o aplicație mobilă React Native cu hartă inițială pentru Constanța, alegerea originii și destinației, momentul plecării și preferința pentru timpul suplimentar [16]. Există un contract de date pentru primirea alternativelor și pentru segmente cu expunere cunoscută sau necunoscută. Documentația precizează că serviciul de calcul al rutelor și umbrelor nu este implementat. Această constatare provine din inspecția documentației, fără o verificare completă pe dispozitiv în această etapă.

Arhitectura propusă are patru componente: importul și auditul datelor, motorul geometric, optimizarea și interfața de prezentare. La fiecare răspuns, serviciul ar trebui să întoarcă ruta, lungimea, durata, expunerea estimată, indicatorul de dezacord și versiunea datelor. Lipsa calculului trebuie să producă o stare explicită, nu o rută demonstrativă prezentată ca reală. Afișarea unei hărți native nu dovedește existența unui model tridimensional al clădirilor.

## 8 Protocolul experimental

### 8 1 Comparația metodelor

Metoda A minimizează durata fără umbră. Metoda B minimizează costul nominal cu înălțimile centrale. Metoda C folosește UMBRA-R, cu scenarii și penalizarea dezacordului. Se păstrează aceeași rețea, aceleași puncte terminale, aceeași oră, aceeași viteză și aceeași limită de ocol. Când metoda C folosește un set candidat, și B trebuie evaluată într-un cadru comparabil. O îmbunătățire obținută doar prin generarea mai multor alternative nu poate fi atribuită exclusiv incertitudinii.

Se recomandă un pilot de 12 perechi origine–destinație, împărțite înaintea evaluării în 4 perechi pentru calibrare și 8 pentru test. Aceste numere sunt o propunere de proiectare, nu date colectate. Perechile trebuie să includă orientări și configurații diferite, cu distanțe fezabile pentru verificare. Trei ore de plecare și trei niveluri de lipsă a înălțimilor, 0%, 25% și 50%, produc 72 de combinații pe cele 8 perechi de test. Dacă fiecare mască este repetată cu trei semințe, rezultă 216 combinații simulate. Ele nu reprezintă 216 observații independente ale orașului.

În experimentele controlate, o geometrie de referință cu înălțimi verificate este ascunsă algoritmului și folosită numai pentru evaluare. Se elimină atribute din copia de intrare și se păstrează referința. În lipsa unei geometrii verificate, rezultatele se etichetează simulare sub ipoteze, iar concluziile despre expunerea reală se amână. O metodă nu trebuie evaluată numai cu scenariile pe care le-a folosit pentru alegerea traseului.

### 8 2 Lipsa datelor și perturbările

Se aplică atât eliminare aleatoare, cât și o mască spațială care ascunde înălțimile într-un grup de clădiri apropiate. Lipsa reală a datelor poate fi concentrată pe cartiere sau tipuri de clădiri; modelul complet aleator nu descrie toate situațiile. Se poate introduce suplimentar o perturbare multiplicativă de ±10% sau ±25%, cu distribuție și limitare explicitate. Aceste amplitudini sunt condiții experimentale. Nu se raportează ca erori cunoscute ale OSM pentru Constanța.

Fiecare clădire primește o singură valoare perturbată într-un scenariu, utilizată pe toate muchiile și momentele relevante. Se testează și o eroare sistematică de scară pentru mai multe clădiri, deoarece o estimare comună a înălțimii etajului poate produce erori corelate. Pentru Monte Carlo se începe cu un K modest, de exemplu 20, și se repetă cu K = 50 pe un subset. Stabilizarea alegerii rutei și a rezumatelor de expunere justifică alegerea bugetului; un K mai mare nu validează distribuția de intrare.

### 8 3 Indicatorii de performanță

Pentru fiecare rută se raportează distanța D = Σ l_e, durata T, expunerea estimată E_est și expunerea de referință E_ref. În teren se folosește E_obs, păstrată distinct de referința simulată. Procentul temporal umbrit este S = 100 × (1 − E/T), pentru T > 0. Acesta diferă de procentul distanței umbrite dacă viteza variază sau există opriri. Alegerea indicatorului trebuie să rămână consecventă în toate tabelele.

Reducerea relativă față de A este r = 100 × (E_A − E_metodă)/E_A, definită numai când E_A > 0. Ocolul temporal este d_T = 100 × (T_metodă − T_A)/T_A. Se raportează și diferența absolută în secunde, mai ușor de interpretat când expunerea inițială este mică. Dacă E_A = 0, reducerea relativă se notează nedefinită și se folosește diferența absolută. Nu se înlocuiește numitorul cu o constantă fără a explica schimbarea indicatorului.

Eroarea expunerii este |E_est − E_ref| sau |E_est − E_obs|, după tipul experimentului. Pentru eșantioane punctuale umbră–soare se raportează matricea de confuzie și acuratețea, fără a considera punctele consecutive observații independente. Stabilitatea geometrică între două rute se poate exprima prin J = lungime(comun)/lungime(reuniune), după împărțirea în muchii comune. Stabilitatea mare nu este obligatoriu un avantaj: un traseu poate rămâne constant și greșit. Interpretarea cere simultan expunerea și ocolul.

## 9 Verificarea software și validarea pe teren

### 9 1 Teste sintetice necesare

Testele unitare trebuie să folosească situații cu răspuns cunoscut. Pentru geometrie, o clădire dreptunghiulară și un Soare din sud trebuie să proiecteze umbra către nord. La α = 45°, un obiect vertical de înălțime H are umbra de lungime H. Dublarea înălțimii dublează lungimea pentru același unghi. O amprentă concavă verifică dacă algoritmul introduce suprafețe inexistente; o stradă pe limita umbrei verifică toleranțele geometrice.

Pentru costuri, se construiește un graf mic în care toate rutele pot fi enumerate. Dijkstra trebuie să coincidă cu enumerarea când ponderile sunt fixe și nenegative. Cu λ = μ = 0, se recuperează traseul de durată minimă. Cu scenarii identice, dispersia trebuie să fie zero. O clădire fără înălțime trebuie să activeze regula de estimare ori starea de incertitudine, nu valoarea zero implicită. Testele temporale includ marcaje UTC echivalente și ore locale problematice la schimbarea sezonieră.

Se verifică limita de ocol, respingerea rutelor inaccesibile, absența unei conexiuni și reproducibilitatea seminței. O modificare a orei trebuie să declanșeze recalculul umbrelor. Eșantionarea se repetă la pas mai fin pentru estimarea erorii numerice. Toate testele descrise aici sunt cerințe propuse; lucrarea nu afirmă că au fost executate. Rezultatele lor vor fi păstrate într-un raport cu versiunea codului, intrările și verificările așteptate.

### 9 2 Protocolul de observație

Validarea în teren începe cu segmente, înaintea rutelor complete. Se aleg puncte lângă limite de umbră și puncte de control clar umbrite ori însorite. Pentru fiecare se înregistrează coordonata, precizia estimată a poziției, data, momentul cu fus, vizibilitatea Soarelui și sursa umbrei. Fotografierea trebuie să permită recunoașterea geometriei, fără persoane identificabile. Se păstrează o schiță a poziției și un reper fizic, deoarece GPS-ul telefonului poate fi insuficient lângă clădiri.

Umbra prezisă se calculează pentru momentul observației, nu pentru ora la care este analizată fotografia. Se compară etichetele punctuale și, unde există repere metrice, poziția limitei umbrei. Norii se notează separat: absența unei umbre vizibile sub cer acoperit nu dovedește automat o eroare de înălțime. Punctele incerte nu se forțează în clase binare; se păstrează eticheta necunoscut și proporția ei.

Pentru rute complete se notează momentele de intrare și ieșire din umbră, opririle și viteza. Ideal, două echipe parcurg alternativele simultan. Dacă este disponibil un singur observator, ordinea se alternează, iar diferențele de oră și vreme se raportează. Compararea rutelor parcurse la momente îndepărtate poate confunda metoda cu schimbarea umbrei. Reevaluarea la timpii observați ajută, dar nu elimină complet această limitare.

Nu sunt necesare experimente pe caniculă pentru verificarea geometrică. Campania din octombrie poate testa poziția umbrei și funcționarea metodei, fără a demonstra beneficiile termice ale unei zile de vară. Scenariile estivale simulate se raportează separat de observațiile din octombrie. Nu se recomandă traversări periculoase, intrarea în proprietăți private sau fotografierea persoanelor fără acord. Protocolul urmărește mediul construit și funcționarea algoritmului, fără colectarea de date medicale.

## 10 Analiza statistică și starea rezultatelor

### 10 1 Comparații pereche și eșantion mic

Pentru o pereche origine–destinație și o condiție comună, se calculează Δ_BC = E_ref(B) − E_ref(C). O valoare pozitivă favorizează C. Se prezintă toate diferențele, mediana, intervalul intercuartil și extremele. Pentru observațiile de teren se înlocuiește referința cu expunerea observată și se menține eticheta tipului de dovadă. Raportarea numai a procentului mediu poate ascunde un număr mic de rute mult îmbunătățite și multe rute fără beneficiu.

Orele, măștile și semințele pentru aceeași pereche nu sunt eșantioane independente ale structurii urbane. O variantă simplă este agregarea lor pe pereche înaintea comparației. Dacă sunt folosite intervale bootstrap, reeșantionarea se face la nivel de pereche sau de bloc experimental, nu pe puncte GPS consecutive. Cu numai câteva perechi, intervalele pot fi instabile și trebuie interpretate descriptiv. Un test de semn poate fi exploratoriu, dar puterea mică și ipotezele lui trebuie precizate; absența unei diferențe detectabile nu dovedește egalitatea metodelor.

Se separă analiza principală, cu parametrii fixați, de sensibilitatea la λ, μ, δ, numărul de scenarii și pasul de eșantionare. Pentru fiecare se raportează direcția efectului și cazurile în care alegerea se schimbă. Se păstrează toate perechile eligibile, inclusiv cele cu rezultate negative, lipsă de conexiune sau încălcări de ocol. Refuzurile și datele lipsă se raportează în numitorul potrivit, fără a fi transformate în expunere zero.

### 10 2 Ce s-a obținut în această etapă

Rezultatele efective ale etapei sunt documentare și metodologice: au fost identificate antecedentele relevante, a fost delimitată contribuția, a fost formulat un model cu unități consistente și a fost stabilită o procedură de evaluare. Documentația software disponibilă permite descrierea interfeței, fără a demonstra calculul rutelor [16]. Exemplul numeric al lungimii umbrei este o consecință analitică a modelului idealizat. Nu există în această versiune măsurători proprii care să susțină o reducere procentuală a expunerii.

REZULTATE EXPERIMENTALE NECESARE: auditul local al datelor; raportul testelor geometrice; comparația A–B–C; observațiile umbrelor; timpii de calcul; analiza diferențelor și a ocolului. Câmpurile de mai jos rămân explicit necompletate. Simbolul ND înseamnă nedeterminat, nu zero și nu rezultat favorabil.

| Indicator propriu | A durată minimă | B nominal | C UMBRA-R |
| Număr de rute evaluate | ND | ND | ND |
| Expunere de referință în secunde | ND | ND | ND |
| Expunere observată în secunde | ND | ND | ND |
| Ocol temporal în procente | ND | ND | ND |
| Eroare absolută în secunde | ND | ND | ND |
| Timp de calcul în secunde | ND | ND | ND |

După colectare, figurile prioritare sunt o hartă cu rutele și zonele necunoscute, un grafic al diferențelor pereche B–C și un grafic expunere–ocol. Orice bandă de variație trebuie etichetată ca dispersie între scenarii sau interval statistic, după calcul. Nu se desenează bare cu performanțe fictive pentru a umple pagina. Hărțile finale trebuie să includă scara, orientarea, ora, sursele și versiunea datelor.

## 11 Discuții și limitări

Avantajul potențial al UMBRA-R este evitarea recomandărilor care depind de o umbră fragilă la modificarea înălțimilor. Totuși, incertitudinea nu este sinonimă cu expunerea nefavorabilă. O clădire cu înălțime necunoscută poate produce în realitate o umbră foarte bună. Penalizarea poate exclude acel traseu și poate crește timpul în soare. De aceea, proiectul trebuie să măsoare efectul final al alegerii, nu doar reducerea unui indicator intern de incertitudine.

Rezultatele negative pot avea explicații diferite: intervale prea largi, date de referință slabe, rețea fără alternative sau o oră la care toate rutele sunt asemănătoare. Aceste explicații trebuie verificate prin ablații. Compararea cu μ = 0 izolează efectul penalizării; compararea cu înălțimi cunoscute izolează lipsa datelor; folosirea acelorași candidate controlează efectul căutării. Ajustarea post-hoc a parametrilor până când C câștigă ar elimina caracterul falsificabil al experimentului.

Modelul nu include toate sursele de umbră și nici accesibilitatea completă pentru persoane cu mobilitate redusă. Treptele, bordurile, lățimea trotuarului și traversările pot necesita date suplimentare. O aplicație destinată utilizării reale nu trebuie să transforme ocolul pentru umbră într-un motiv de a ignora accesul legal sau siguranța deplasării. În acest studiu, accesibilitatea verificată este o condiție de eligibilitate a muchiei înaintea optimizării.

Generalizarea este limitată de aria pilot, numărul perechilor, sezon și distribuțiile de înălțime alese. Un rezultat bun în câteva străzi nu demonstrează performanță în întregul oraș. O geometrie LiDAR mai precisă poate modifica comparația dintre B și C, iar datele nominale foarte bune pot reduce utilitatea penalizării. Contribuția trebuie descrisă în raport cu aceste condiții, fără afirmații de superioritate universală.

## 12 Concluzii și continuarea cercetării

UMBRA SmartRoute are o direcție de cercetare justificată dacă tratează calitatea informației geometrice ca variabilă experimentală. Literatura confirmă existența rutării după umbră, astfel încât originalitatea trebuie căutată în formalizarea și evaluarea efectelor înălțimilor incerte. Lucrarea propune un cost explicabil, o aproximare aditivă și o selecție între candidate reevaluate temporal. Acestea sunt metode de investigat, nu rezultate validate.

Recomandarea este continuarea cu o contribuție restrânsă: o zonă reală, trei metode comparate, o limită comună de ocol și o referință independentă. Prioritatea imediată este motorul geometric și obținerea dovezilor, înaintea extinderii hărții sau a vizualizării tridimensionale. Dacă datele de teren nu pot fi obținute, proiectul poate raporta riguros o simulare și limitele ei, fără a revendica o reducere reală a expunerii pietonilor.

Într-o etapă ulterioară se pot adăuga modelarea vegetației, incertitudinea poziției trotuarelor, grafuri extinse în timp și calibrarea pe mai multe zone și sezoane. Un studiu al confortului termic necesită instrumente și variabile suplimentare. Evoluția către asemenea funcții trebuie ghidată de eroarea observată și de întrebările rămase deschise. Concluzia finală despre eficiența UMBRA-R poate fi formulată numai după completarea comparației experimentale.

## Anexa A Plan de lucru și registru reproductibil

În prima zi se fixează aria, întrebarea, indicatorul principal și împărțirea perechilor. În a doua zi se extrag datele și se verifică rețeaua și câteva înălțimi. În a treia zi se implementează proiecția umbrei și testele analitice. În a patra zi se compară A, B și varianta C simplificată. În a cincea zi se colectează observațiile și se rulează scenariile cu parametri fixați. În a șasea zi se analizează toate rezultatele, inclusiv eșecurile. În a șaptea zi se actualizează documentul și se repetă demonstrația. Acesta este un plan orientativ; intervalul 24–29 octombrie oferă numai șase zile înainte de începerea concursului [18], deci activitățile trebuie comprimate sau reduse.

Setul obligatoriu include geometria reală, poziția solară, umbrele, comparația A–B–C și exportul rezultatelor. Varianta C poate rămâne o penalizare aditivă documentată dacă optimizarea de traseu completă nu este fezabilă. Vizualizarea 3D, întregul oraș, prognoza meteo și simulările extinse sunt opționale. Dacă timpul nu permite observații suficiente, se reduce numărul perechilor și se declară limita, fără multiplicarea artificială a eșantionului prin semințe.

Registrul fiecărei rulări trebuie să conțină run_id, versiunea codului, amprenta fișierelor de date, perechea origine–destinație, marcajele UTC și locale, metoda, λ, μ, δ, viteza, numărul scenariilor și sămânța. Rezultatele includ ruta ca listă de muchii, D, T, E_est, E_ref sau E_obs, U, timpul de calcul și motivul eventualului refuz. Datele brute se păstrează separat de fișierele curățate, iar corecțiile au explicații.

Fișa de teren include observation_id, segment_id, momentul exact, coordonata, reperul fizic, starea cerului, eticheta umbră–soare–necunoscut, sursa umbrei, fotografia și observațiile. Identitatea trecătorilor și istoricul personal al deplasărilor nu sunt necesare. Analiza trebuie să poată reconstrui fiecare valoare publicată pornind de la fișe și de la configurația rulării. Un fișier cu valori agregate, fără proveniență, nu este suficient pentru reproducere.

## Anexa B Susținerea științifică în fața juriului

Pentru susținerea orală se propune o variantă flexibilă de aproximativ opt minute, fără a o prezenta ca durată impusă oficial. Ordinea recomandată este problema și întrebarea, literatura, contribuția, geometria, modelul incertitudinii, protocolul, rezultatele efective și limitele. În lipsa rezultatelor, secțiunea respectivă prezintă stadiul real și experimentul pregătit. Materialul de față este un studiu scris, nu un set de diapozitive încărcate cu paragrafe.

O demonstrație ar trebui să arate o singură pereche de puncte, aceeași oră și cele trei alternative. Se afișează separat timpul, expunerea și incertitudinea. Modificarea unei înălțimi ilustrează sensibilitatea, fără a fi numită validare în teren. Pentru funcții încă neimplementate se prezintă schema de lucru. Planul de rezervă este o înregistrare a unei rulări reale, cu configurație și date exportate; o animație ilustrativă trebuie etichetată ca atare.

La întrebarea despre noutate, răspunsul susținut de această documentare este că rutarea după umbră există, iar UMBRA investighează efectul informațiilor geometrice incomplete într-un protocol local. La întrebarea despre Dijkstra, explicația este că acesta rezolvă costul aditiv fix; reevaluarea temporală și dispersia de traseu cer pași suplimentari. La întrebarea despre înălțimi, se prezintă registrul surselor și intervalele, fără a numi estimările măsurători.

La întrebarea despre superioritate se arată comparațiile pereche și condițiile în care metoda eșuează. La întrebarea despre contribuția elevilor se prezintă numai activitățile executate efectiv, rolurile și jurnalul de lucru. Utilizarea AI pentru documentare, redactare sau programare trebuie declarată corespunzător în documentele concursului [17]; autorii trebuie să verifice sursele și să poată explica formulele și codul. Nici această redactare asistată, nici existența unui prototip nu substituie experimentele.

## Bibliografie

[1] Wolf H, Vierø AR, Szell M. 2025. CoolWalks for active mobility in urban street networks. Scientific Reports 15, 14911. DOI 10.1038/s41598-025-97200-2. https://doi.org/10.1038/s41598-025-97200-2

[2] Feng Y, Zhang P, Xue J, Chen Z, Meng L. 2024. Walking in the Shade: Shadow-oriented Navigation for Pedestrians. Proceedings of the 32nd ACM SIGSPATIAL International Conference on Advances in Geographic Information Systems, pp. 677–680. DOI 10.1145/3678717.3691287. Fișă instituțională consultată: https://portal.fis.tum.de/en/publications/walking-in-the-shade-shadow-oriented-navigation-for-pedestrians/

[3] Wen J, Abuhani DA, Mazzarello M, Duarte F, Norford L, Xu R, Wong NH, Ratti C. 2025. Walking smart in the heat: A dynamic shade-oriented pathfinding approach to enhance pedestrian comfort in arid cities. Computers, Environment and Urban Systems 122, 102337. DOI 10.1016/j.compenvurbsys.2025.102337. Text disponibil prin MIT: https://senseable.mit.edu/papers/pdf/20250911_Wen-etal_WalkingSmart_CEUS.pdf

[4] MIT Senseable City Lab. Cooling Path. Pagină instituțională a proiectului. https://senseable.mit.edu/cooling-path/

[5] Peng F, Xiong Y, Zou B. 2021. Identifying the optimal travel path based on shading effect at pedestrian level in cool and hot climates. Urban Climate 40, 100988. DOI 10.1016/j.uclim.2021.100988. https://www.sciencedirect.com/science/article/pii/S2212095521002182

[6] Verma D, Mumm O, Carlow VM. 2026. Seeking shade: an agent-based model to study shadow-focused pedestrian movement: Case study in Berlin. Transportation Research Interdisciplinary Perspectives 36, 101883. DOI 10.1016/j.trip.2026.101883. Metadate instituționale consultate: https://research.tue.nl/nl/publications/seeking-shade-an-agent-based-model-to-study-shadow-focused-pedest/ Textul integral al editorului nu a fost accesibil în această verificare.

[7] Bertsimas D, Sim M. 2003. Robust discrete optimization and network flows. Mathematical Programming 98, 49–71. DOI 10.1007/s10107-003-0396-4. Copie a autorului: https://web.mit.edu/dbertsim/www/papers/melvyn/Robust-Discrete-Optimization-And-Network-Flows-MP98.pdf

[8] OpenStreetMap contributors. Key height. Documentație comunitară privind atributul de înălțime. https://wiki.openstreetmap.org/wiki/Key:height

[9] Geofabrik. Download OpenStreetMap data for Romania. https://download.geofabrik.de/europe/romania.html

[10] OSMnx. Getting Started. Documentația proiectului software. https://osmnx.readthedocs.io/en/stable/getting-started.html

[11] Zhu XX, Chen S, Zhang F, Shi Y, Wang Y. 2025. GlobalBuildingAtlas: an open global and complete dataset of building polygons, heights and LoD1 3D models. Earth System Science Data 17, 6647–6668. DOI 10.5194/essd-17-6647-2025. https://essd.copernicus.org/articles/17/6647/2025/ Setul de date: DOI 10.14459/2025mp1782307.

[12] GlobalBuildingAtlas. Terms of Use. https://tubvsig-so2sat-vm1.srv.mwn.de/terms_of_use.html

[13] OpenStreetMap Foundation. Copyright and License. https://www.openstreetmap.org/copyright

[14] Reda I, Andreas A. Solar Position Algorithm for Solar Radiation Applications. NREL/TP-560-34302, versiune revizuită în ianuarie 2008. https://docs.nrel.gov/docs/fy08osti/34302.pdf

[15] pvlib python. Solar position calculation. Documentația funcției get_solarposition. https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.solarposition.get_solarposition.html

[16] UMBRA. Documentație internă a proiectului. README.md și documentația aplicației mobile, versiunea locală inspectată la 24 octombrie 2026. Sursă pentru stadiul declarat al implementării, fără statut de validare experimentală independentă.

[17] Societatea Științifică Cygnus. Regulament specific de organizare și desfășurare RoSEF, nr. 1119 din 29 decembrie 2025, publicat pentru ediția 2026. https://cygnus.org.ro/wp-content/uploads/2026/05/Regulament-RoSEF-2026.pdf

[18] Societatea Științifică Cygnus. Anunțurile oficiale RoSEF 2026. https://cygnus.org.ro/

Sursele web au fost consultate la 24 octombrie 2026. Rezultatele numerice ale MIT sunt atribuite exclusiv cercetării citate. Documentele de referință furnizate de utilizator au orientat forma academică și delimitarea temei, fără a fi tratate ca dovezi experimentale pentru SmartRoute. Textul și verificarea bibliografică au beneficiat de asistență AI; identitatea autorilor și contribuțiile lor efective trebuie completate de echipă.
