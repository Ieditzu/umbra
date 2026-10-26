from pathlib import Path
import re
root=Path('/Users/maneacezar/Documents/GitHub/umbra')
s=(root/'tmp/research/paper.md').read_text()
old=s[s.index('UMBRA SmartRoute investighează'):s.index('\n\nCuvinte cheie:')]
s=s.replace(old,'''Pietonii care se deplasează între aceleași puncte pot alege trasee cu expuneri solare diferite. Sistemele de rutare după umbră depind însă de modele urbane ale căror înălțimi pot fi incomplete sau inexacte. Cercetarea întreabă dacă tratarea explicită a acestei incertitudini permite recomandarea unor trasee cu expunere reală mai mică decât folosirea exclusivă a înălțimilor estimate, pentru aceeași limită de ocol. Propunem UMBRA-R, o metodă care combină durata deplasării, expunerea medie în scenarii geometrice și o penalizare a dezacordului dintre scenarii. Evaluarea planificată pentru o zonă pilot din Constanța compară traseul cel mai rapid A, rutarea după umbre nominale B și metoda UMBRA-R C. Corectitudinea geometrică se testează în scene cu soluție analitică, iar performanța rutelor se verifică folosind o geometrie de referință separată și observații independente în teren. În utilizarea zilnică, aplicația ar permite compararea compromisului dintre timpul suplimentar de mers și expunerea estimată la soare. Lucrarea prezintă fundamentarea, modelul și protocolul; nu sunt disponibile încă rezultate proprii confirmate privind reducerea expunerii. În revizuire au fost verificate prin execuție 12 teste ale logicii clientului software, care nu constituie teste ale motorului de umbre sau validare a rutării.''')
s=s.replace('### 2 3 Optimizarea robustă și poziționarea contribuției','### 2 3 Delimitarea contribuției originale')
start=s.index('| Studiu |');end=s.index('\n\nÎn sursele consultate',start)
s=s[:start]+'''| Studiu și problemă | Metodă și rezultat raportat | Limită relevantă și diferența UMBRA |
| CoolWalks 2025 [1] — oportunități de mers la umbră | Grafuri și geometrie; avantajul depinde de variația urbană, nu apare automat în grila ideală | Sensibil la reprezentarea rețelei; UMBRA testează înălțimi lipsă și o penalizare explicită |
| Feng și colab. 2024 [2] — navigație pietonală după umbră | OSM corectat, LoD2, ray tracing; sistem demonstrat într-o zonă din München | Rezumatul accesibil nu stabilește un câștig numeric; UMBRA investighează geometrie incompletă |
| Wen și colab. 2025 [3, 4] — trasee în mediul arid | Recompense dinamice și trasee interioare; MIT raportează +1,3% lungime și −8,8% expunere în medie | Calibrare locală necesară; UMBRA urmărește incertitudinea, fără transferul acestor procente |
| Peng și colab. 2021 [5] — trasee sezoniere umbrite sau însorite | LiDAR și geometrie solară; identifică orientări favorabile la ore și sezoane diferite | Discretizare de 10 m; UMBRA testează date verticale lipsă pe o rețea pietonală locală |
| Verma și colab. 2026 [6] — mișcare pietonală orientată după umbră | Modelare cu agenți; nu se reproduce un rezultat numeric din textul integral inaccesibil | Verificare limitată la metadate; UMBRA evaluează selecția rutei și erorile geometrice |
| Bertsimas și Sim 2003 [7] — decizii cu costuri incerte | Optimizare robustă cu conservatorism controlabil; rezultate de tractabilitate pentru cadrul definit | Nu este un model urban de umbre; UMBRA adaptează și evaluează incertitudinea geometrică |
''' + s[end:]
s=s.replace('Valoarea cercetării poate proveni dintr-o evaluare reproductibilă a legăturii dintre înălțimi, umbre și rute.','Valoarea cercetării poate proveni dintr-o evaluare reproductibilă a legăturii dintre înălțimi, umbre și rute. Rutarea după umbră și optimizarea robustă există deja. Contribuția propusă este adaptarea și evaluarea explicită a incertitudinii geometrice în rutarea pietonală după umbre, într-un experiment reproductibil pentru Constanța. Originalitatea trebuie susținută prin implementare și rezultate; formularea unei funcții matematice nu este suficientă.')
start=s.index('Întrebarea principală este');end=s.index('\n\nVariabilele independente',start)
s=s[:start]+'''Întrebarea principală este: „Poate un algoritm care ține cont de incertitudinea înălțimilor clădirilor să recomande trasee cu expunere solară reală mai mică decât un algoritm care folosește doar înălțimi estimate, pentru aceeași limită de ocol?” Răspunsul despre expunerea reală necesită observații. Geometria de referință din simulare oferă numai un test controlat al mecanismului.

| Ipoteză | Variabilă investigată | Experiment | Indicator | Când nu este susținută |
| H1 C reduce expunerea față de B | Metoda de rutare | E3 și E4, condiții pereche | Mediana E(B) − E(C), în secunde | Mediana ≤ 0 sau ocol depășit |
| H2 Lipsa înălțimilor afectează predicția nominală | Lipsă 0%, 25%, 50% | E2 cu referință păstrată | Eroare absolută a expunerii B | Eroarea nu crește față de cazul complet |
| H3 Avantajul C depinde de oră și de μ | Ora și penalizarea | E3 și sensibilitate | Diferențe ale avantajului B − C | Diferențele rămân sub pragul prestabilit |

Pentru H3, pragul de variație relevantă se fixează pe calibrare, peste eroarea numerică estimată, înaintea testului. Pentru H1 se raportează separat comparația simulată și cea observată; un avantaj numai în simulare nu confirmă afirmația despre realitate. În eșantion mic, semnul medianei descrie datele colectate, fără a demonstra automat generalizarea.'''+s[end:]
pos=s.index('\n\nToate lungimile se calculează')
s=s[:pos]+'''

### 4 3 Protocol executabil de audit OSM

Pasul 1 este fixarea unui poligon sau dreptunghi pilot și a tamponului pentru clădirile care pot proiecta umbre din exterior. Se salvează coordonatele și data extragerii. Pasul 2 este descărcarea obiectelor building și building:part prin Overpass sau din extrasul Geofabrik. O interogare pilot propusă este prezentată mai jos; dreptunghiul nu reprezintă întregul oraș. Interogarea nu a fost executată în această revizuire [8–10].

CODE [out:json][timeout:60];
CODE (nwr["building"](44.170,28.630,44.180,28.640);
CODE  nwr["building:part"](44.170,28.630,44.180,28.640););
CODE out body geom;

Pasul 3 este deduplicarea după tipul și identificatorul OSM, reconstruirea relațiilor și verificarea suprapunerilor dintre corpul principal și părți. Se numără separat clădirile, părțile și relațiile; însumarea lor fără control ar dubla inventarul. Pasul 4 este parsarea atributelor height, building:levels, min_height și source:height. Valorile cu unități neclare, negative sau incompatibile sunt trimise la verificare, fără conversii tăcute.

Pasul 5 este clasificarea provenienței. Clasa V înseamnă înălțime verificată prin măsurare sau sursă documentată și controlată; o valoare height singură nu o justifică. Clasa D înseamnă înălțime declarată în OSM, cu verificare independentă absentă. Clasa E înseamnă estimare din niveluri, model extern sau clasă locală, cu regulă și interval salvate. Clasa N înseamnă lipsa informației utilizabile. Intrările invalide rămân marcate separat până la corectare. Astfel, cunoscut în baza de date nu înseamnă obligatoriu cunoscut în realitate.

Pasul 6 este exportul unui CSV cu identificator, geometrie, atribute brute, H central, interval, clasă, sursă și motivul corecției. Se verifică manual un mic eșantion din fiecare clasă disponibilă. Pasul 7 este raportarea numărătorilor și a numitorului pentru aria exactă: număr de clădiri unice, height valid, numai niveluri, necunoscute și verificate independent. Procentele se calculează după extragere. Documentația locală conține o verificare pilot anterioară [16], dar inventarul nu a fost reprodus aici; nu este folosit ca procent confirmat pentru Constanța.
''' + s[pos:]
s=s.replace('EQ L = H / tan(α)','EQ L = H / tan(α)\n\nIntuitiv, o clădire mai înaltă produce o umbră mai lungă, iar un Soare mai ridicat o scurtează. H și L sunt în metri; α este un unghi, transmis funcției trigonometrice în radiani după conversia din grade. H provine din auditul clădirilor, iar α din calculul astronomic.')
s=s.replace('### 5 3 Limitele reprezentării','FIG SHADOW\n\nFigura 1. Secțiune verticală idealizată a unei clădiri și a umbrei sale. Desen propriu vectorial, fără scară; razele solare sunt paralele, terenul este plan. Figura explică modelul, nu reprezintă o măsurătoare.\n\n### 5 3 Limitele reprezentării')
s=s.replace('EQ C_nom(R) = T(R) + λ E(R, t₀, H_nom)','EQ C_nom(R) = T(R) + λ E(R, t₀, H_nom)\n\nIntuitiv, o secundă în soare adaugă λ secunde echivalente la cost, pe lângă timpul de mers. Traseul nominal R este evaluat cu un singur set de înălțimi H_nom; acesta este o estimare centrală, nu adevărul geometric.')
s=s.replace('EQ C_R(R) = T(R) + λ E_bar(R) + μ U(R)','EQ C_R(R) = T(R) + λ E_bar(R) + μ U(R)\n\nE_bar este notat și E_medie: media expunerilor în scenariile de înălțime. Intuitiv, μ controlează cât evităm un traseu ale cărui predicții se schimbă mult între scenarii. O valoare mare a lui U înseamnă dezacord în model, fără a demonstra că traseul este nefavorabil în realitate.')
pos=s.index('\n\n### 6 3 Cost aditiv')
s=s[:pos]+'''

| Simbol | Semnificație și unitate | Proveniență și utilizare |
| R, t₀, H | Rută; moment; vector de înălțimi în m | Graful și cererea; auditul geometriei |
| T, E, E_medie | Durată; expunere; media expunerii, toate în s | Lungimi și viteză; integrarea umbririi |
| U, K | Dispersie în s; număr de scenarii | Expuneri E_k, cu K ≥ 2 pentru abaterea standard |
| λ, μ | Ponderi fără unitate | Calibrare și sensibilitate, apoi valori fixate |
| δ, v | Ocol relativ fără unitate; viteză în m/s | Preferință experimentală; ipoteză declarată sau observație |

Exemplu matematic strict ilustrativ, fără rute reale: două candidate au T₁ = 600 s, E_medie₁ = 240 s, U₁ = 80 s și T₂ = 630 s, E_medie₂ = 220 s, U₂ = 10 s. La λ = 1 și μ = 0, costurile sunt 840 și 850 s echivalente, deci este aleasă prima. La μ = 1 devin 920 și 860, deci este aleasă a doua. Dacă T_min = 600 s și δ = 0,15, ambele respectă limita de 690 s. Exemplul arată mecanismul selecției; nu spune care rută are expunere reală mai mică.
''' + s[pos:]
s=s.replace('### 7 1 Alegerea unei soluții realizabile','FIG PIPELINE\n\nFigura 2. Fluxul propus de prelucrare. Desen propriu vectorial. Poziția Soarelui depinde de coordonate și timp; scenariile de înălțime reiau calculul umbrelor înaintea evaluării rutelor. Fluxul reprezintă arhitectura urmărită, nu componente toate funcționale.\n\n### 7 1 Alegerea unei soluții realizabile')
start=s.index('### 7 2 Stadiul verificat');end=s.index('\n\n## 8 ',start)
s=s[:start]+'''### 7 2 Stadiul verificat al proiectului

Inspecția codului confirmă componente de hartă și client: RouteMap.tsx gestionează punctele și afișarea segmentelor; routes.ts validează cereri și răspunsuri; routing.ts trimite cererea către un serviciu configurat. La 24 octombrie 2026 au fost executate cele 12 teste din mobile/tests/routes.test.mjs: 12 reușite, 0 eșecuri. Ele verifică date, răspunsuri simulate, expunerea necunoscută, ocolul și tratarea erorilor. Nu execută un motor de calcul al umbrelor și nu demonstrează o rută reală optimizată [16].

| Componentă | Rol | Stadiu la revizuire | Dovadă și limită |
| Interfață hartă | Alegerea A și B, afișare | Implementată în cod; execuție pe telefon neverificată aici | RouteMap.tsx și ecranul aplicației; fără captură nouă |
| Client și validare | Schimbul de date și verificări | Verificat prin 12 teste sintetice | routes.test.mjs; fără serviciu de calcul real |
| Import OSM | Rețea și clădiri | Descris în documentație; import reproductibil de verificat | docs/mobile-app.md; extras brut neinspectat în revizuire |
| Motor de umbre | Geometrie solară | Propus; fără teste proprii identificate | Documentația declară motorul neimplementat |
| Rutare nominală B | Optimizare după umbră | Propusă; funcționare nedemonstrată | Adapterul clientului nu calculează traseul |
| Rutare robustă C | Scenarii și penalizare | Propusă; funcționare nedemonstrată | Model matematic și protocol, fără rezultate de rutare |
| Validare pe teren | Control independent | Neefectuată în dovezile disponibile | Nu au fost furnizate fișe SmartRoute |

Documentația declară explicit că serviciul de calcul nu este implementat. Interfața conține tipurile fastest, balanced și shadiest; acestea nu reprezintă automat metodele experimentale A, B și C. UMBRA-R necesită identificator de metodă, scenarii și parametri proprii. Aplicația folosește un ocol în minute, pe când protocolul definește δ relativ: integrarea trebuie să transforme limita în B = δT_min sau să folosească T ≤ T_min + B pentru toate metodele. Un contract de date nu dovedește existența algoritmului.

Arhitectura urmărită separă importul, geometria, optimizarea și interfața. Un rezultat reproductibil trebuie să includă versiunea datelor, metoda, parametrii și motivele refuzului. Lipsa serviciului sau a acoperirii trebuie să producă o stare explicită. O hartă nativă vizibilă nu constituie o bază de date de înălțimi verificată.
''' + s[end:]
start=s.index('## 8 Protocolul experimental');end=s.index('\n\n## 9 ',start)
old8=s[start:end]
metrics=old8[old8.index('### 8 3 Indicatorii'):].replace('### 8 3 Indicatorii','### 8 6 Indicatorii')
s=s[:start]+'''## 8 Protocolul experimental

### 8 1 Condiții comune și împărțirea datelor

Toate cele patru experimente sunt „Protocol propus — neexecutat”. Testele clientului raportate în secțiunea 7.2 sunt o verificare software separată. Metoda A alege durata minimă; B folosește umbrele la înălțimile estimate; C adaugă scenarii și penalizarea incertitudinii. În fiecare comparație se păstrează punctele, ora, rețeaua, viteza, limita de ocol și criteriile de acces. B și C folosesc același set candidat și aceeași reevaluare temporală; diferă modelul incertitudinii și funcția de selecție.

Pilotul propus cuprinde 12 perechi origine–destinație: 4 pentru calibrare, 8 pentru test. Se aleg trei ore locale și se salvează momentele UTC, după verificarea elevației solare. Parametrii sunt fixați după calibrare. Pentru test se folosesc lipsuri de 0%, 25% și 50% și semințe publicate. Trei repetări ale fiecărei condiții dau 216 combinații simulate; la 0% măștile pot fi identice, deci repetarea nu aduce observații independente și nu trebuie supra-numărată. Numărul de perechi poate fi redus transparent dacă terenul sau timpul impun aceasta.

### 8 2 Experimentul 1 Corectitudinea geometriei

Statut: Protocol propus — neexecutat. Scopul este verificarea lungimii și direcției umbrei fără incertitudinea datelor urbane. Datele necesare sunt o clădire dreptunghiulară pe teren plan, o amprentă concavă și valori de H, A și α prescrise. Pentru scena de bază se aleg H = 10 m, A = 180° și α = 45°, astfel încât lungimea așteptată este 10 m, către nord.

Pașii sunt: 1 se proiectează geometria într-un sistem metric; 2 se calculează umbra; 3 se compară capătul și lungimea cu soluția analitică; 4 se repetă cu H dublat și cu α = 30°; 5 se verifică lipsa înălțimii, elevația sub prag și concavitatea; 6 se repetă cu pas de eșantionare înjumătățit. Se măsoară eroarea de lungime, eroarea de direcție și diferența dintre discretizări. Pentru scena analitică simplă se poate fixa anterior o toleranță de 0,01 m și 0,1°; acestea sunt ținte de test numeric, nu precizii promise pentru teren.

| Scenă și intrare | Referință matematică | Valoare calculată | Eroare și verdict |
| H 10 m, α 45°, A 180° | L 10 m, nord | De completat | De completat |
| H 20 m, α 45°, A 180° | L 20 m, nord | De completat | De completat |
| H 10 m, α 30°, A 180° | L ≈ 17,32 m, nord | De completat | De completat |

Interpretare: abaterile peste toleranță indică o problemă geometrică, de convenție unghiulară sau de unități și blochează comparația rutelor. Limita experimentului este că o geometrie ideală nu reproduce acoperișuri, arbori, pantă sau poziționarea trotuarelor. Reușita acestui test nu validează datele Constanței.

### 8 3 Experimentul 2 Efectul înălțimilor lipsă

Statut: Protocol propus — neexecutat. Scopul este izolarea pierderii informației verticale. Datele necesare sunt un inventar local cu geometrie de referință verificată, rețeaua, perechile fixate și listele clădirilor ascunse. Dacă referința nu poate fi verificată, experimentul rămâne o simulare pe geometrie presupusă, etichetată astfel.

Pașii sunt: 1 se salvează referința într-un fișier inaccesibil selecției; 2 se creează copii cu 0%, 25% și 50% înălțimi eliminate; 3 se aplică aceeași regulă de imputare pentru B și C; 4 C primește și intervalele de incertitudine; 5 se calculează rutele cu parametri fixați; 6 evaluatorul independent folosește referința pentru expunere. Se repetă cu măști aleatoare și cu grupuri spațiale, fără a reintroduce în algoritm înălțimile ascunse.

| Pereche, oră, mască | Lipsă și tip | Metodă | E_est s | E_ref s | Eroare absolută s |
| De completat | 0%, 25% sau 50%; aleator/grup | A, B sau C | De completat | De completat | De completat |

Se măsoară eroarea expunerii, ocolul și Δ_BC. Interpretarea urmărește dacă B devine mai fragilă și dacă C limitează această degradare. Un rezultat în care ambele se degradează este păstrat. Limitările sunt calitatea referinței și faptul că masca aleatoare nu reproduce toate mecanismele reale ale datelor lipsă. Ca analiză secundară se pot adăuga perturbări de ±10% și ±25%, declarate drept scenarii, nu erori locale cunoscute.

### 8 4 Experimentul 3 Comparația traseelor A B C

Statut: Protocol propus — neexecutat. Scopul este evaluarea beneficiului la același buget de ocol. Datele sunt rețeaua verificată, setul de test, trei momente de plecare, scenariile de înălțime și geometria de referință. A furnizează T_min; B și C sunt alese dintre aceleași candidate care respectă limita.

Pașii sunt: 1 se calculează A; 2 se generează și deduplică alternativele; 3 se fixează timpii de trecere; 4 se alege B după costul nominal și C după costul cu incertitudine; 5 se evaluează toate în referința independentă; 6 se salvează inclusiv refuzurile și rutele fără beneficiu. Pentru ocol relativ δ se folosește bugetul în secunde δT_min; acesta poate fi transmis interfeței în minute, fără rotunjiri care schimbă eligibilitatea. Se măsoară D, T, E_est, E_ref, U și timpul de calcul pe componente.

| Pereche și moment | Metodă | D m | T s | E_ref s | Ocol % | Calcul s |
| De completat | A | De completat | De completat | De completat | De completat | De completat |
| Aceleași condiții | B | De completat | De completat | De completat | De completat | De completat |
| Aceleași condiții | C | De completat | De completat | De completat | De completat | De completat |

Interpretarea folosește diferențele pereche, fără a alege numai cazurile favorabile. Se repetă analiza cu μ = 0 pentru a izola penalizarea și cu mai multe ore pentru H3. La K scenarii, aceeași clădire are o singură înălțime pe toată ruta; intervalele și distribuțiile se salvează. Convergența poate fi examinată prin K = 20 și K = 50 pe un subset, fără a prezenta media simulărilor ca probabilitate calibrată. Limita metodei candidate este că nu garantează optimul global dependent de timp.

### 8 5 Experimentul 4 Validarea pe teren

Statut: Protocol propus — neexecutat. Scopul este verificarea independentă a umbrei și, dacă sunt posibile parcurgeri comparabile, a expunerii rutelor. Se propun minimum șase puncte fixe pe segmente diferite și două momente cu Soare vizibil. Sunt necesare telefon cu ceas sincronizat, hartă, repere, fișă și fotografii fără persoane identificabile. Acest pilot este exploratoriu, nu un eșantion reprezentativ al orașului.

Pașii sunt: 1 se aleg punctele înaintea observației; 2 se înregistrează ora cu fus și reperul fizic; 3 se notează umbră, soare sau necunoscut, condițiile cerului și obiectul care umbrește; 4 se fotografiază geometria; 5 predicția se calculează pentru același moment; 6 se compară eticheta și, dacă există măsurare metrică, distanța până la limita umbrei. Pentru rute se notează intrările și ieșirile din umbră și opririle; alternativele se parcurg simultan sau cu ordine alternată și timpi documentați.

| Punct și moment | Reper și cer | Observat | Prezis | Eroare limită m | Foto și notă |
| De completat | De completat | Soare/umbră/necunoscut | De completat | Numai dacă măsurată | De completat |

Se măsoară acordul etichetelor, proporția necunoscută și E_obs pe rutele observate. Interpretarea separă erorile înălțimii, poziției trotuarului, vegetației și norilor; o fotografie întunecată nu este singură dovada umbrei geometrice. Limitele sunt poziționarea telefonului, variabilitatea vremii și sezonalitatea. Observațiile din octombrie pot verifica geometria, dar nu demonstrează efecte termice estivale. Valorile E_obs se adaugă în tabelul E3 numai pentru parcurgerile reale, într-o coloană distinctă.

''' + metrics + s[end:]
s=s.replace('### 10 2 Ce s-a obținut în această etapă','### 10 2 Stadiul experimental la data redactării')
start=s.index('Rezultatele efective ale etapei');end=s.index('\n\nDupă colectare, figurile prioritare',start)
s=s[:start]+'''Lucrarea reprezintă un studiu de fundamentare și un protocol experimental, nu o validare completă. Rezultatele existente sunt fundamentarea bibliografică, modelul matematic propus, metodologia și verificarea executată a celor 12 teste ale clientului, toate reușite. Inspecția codului confirmă prezența interfeței, fără verificare nouă pe telefon. Exemplul numeric este calcul matematic ilustrativ; nu este rezultat de rutare în Constanța.

Rezultatele încă necesare sunt auditul clădirilor, testele motorului geometric, implementarea și comparația A–B–C, verificările pe teren și timpii de calcul. Experimentele E1–E4 nu au fost executate în această revizuire. Nu se raportează o reducere procentuală proprie a expunerii. În tabelele de colectare, expresia „De completat” desemnează un câmp gol, fără valoare numerică; nu este o observație și nu intră în statistici.'''+s[end:]
start=s.index('UMBRA SmartRoute are o direcție de cercetare justificată');end=s.index('\n\n## Anexa A ',start)
s=s[:start]+'''La întrebarea principală, dovezile existente nu permit încă un răspuns afirmativ sau negativ despre expunerea solară reală. Modelul arată cum poate fi penalizată dependența unei rute de înălțimi incerte; exemplul ilustrativ demonstrează numai schimbarea selecției sub o funcție de cost. Cele 12 teste software confirmă verificări ale clientului și nu superioritatea UMBRA-R. Susținerea ipotezei H1 cere comparații pereche și observații independente, cu aceeași limită de ocol.

Direcția este justificată prin relația fizică dintre înălțime și umbră și prin literatura de rutare. Contribuția urmărită este o adaptare evaluată reproductibil, nu revendicarea invenției rutării umbrite sau a optimizării robuste. Prioritatea este o zonă restrânsă, un motor verificat și completarea experimentelor E1–E4. Dacă sunt disponibile numai simulări, concluzia trebuie limitată la scenariile și geometria folosite; rezultatele negative vor fi păstrate.

### 12 1 Relevanța practică pentru utilizarea zilnică

Pentru o deplasare de vară către școală, transport public sau o destinație apropiată, utilizatorul ar putea compara durata minimă cu o alternativă care estimează mai puțin timp în soare. Persoanele care preferă evitarea expunerii directe ar seta un buget de timp suplimentar și ar vedea atât beneficiul estimat, cât și zonele necunoscute. În zone cu clădiri înalte, ora poate schimba trotuarul favorabil; recomandarea trebuie recalculată pentru momentul mersului.

Preferințele personalizabile permit alegerea compromisului dintre timp, expunere și incertitudine. Aceste utilizări sunt scenarii propuse, care presupun un serviciu funcțional și validat. Estimarea umbrei nu demonstrează reducerea temperaturii corpului sau prevenirea unei afecțiuni. Vremea, accesul pietonal și calitatea datelor rămân condiții ale recomandării, afișate separat de un scor de expunere.

### 12 2 Dezvoltări ulterioare

Extensiile pot include vegetația, poziția incertă a trotuarelor, grafuri extinse în timp și verificări în mai multe sezoane. Se adaugă numai după identificarea erorii dominante în pilot. Un studiu al confortului termic necesită instrumente și variabile suplimentare; nu poate fi dedus din timpul geometric în soare. Extinderea geografică și vizualizarea 3D nu înlocuiesc validarea locală.
''' + s[end:]
start=s.index('Pentru susținerea orală se propune');end=s.index('\n\nO demonstrație ar trebui',start)
s=s[:start]+'''Se propune o susținere de aproximativ opt minute, fără statut de durată oficială. Minutele 0–1 explică problema și întrebarea; 1–2 prezintă literatura și contribuția; 2–3 explică figura umbrei; 3–4 arată costul și exemplul ilustrativ; 4–5 descriu cele patru experimente; 5–7 sunt rezervate demonstrației reale și rezultatelor disponibile; 7–8 prezintă limitele și concluzia. În absența motorului, intervalul demonstrației arată numai funcțiile verificate și explică explicit ce nu a fost executat. Opt minute sunt o propunere de organizare, nu o cerință RoSEF.'''+s[end:]
# Normalize heading numbering while retaining source wording.
s=re.sub(r'^(### )([0-9]+) ([0-9]+) ',r'\1\2.\3 ',s,flags=re.M)
s=re.sub(r'^(## )([0-9]+) ',r'\1\2. ',s,flags=re.M)
s=s.replace('Expunerile E_k','Expunerile E_k')
# Uniform DOI links and explicit documentary limits.
s=s.replace('DOI 10.1007/s10107-003-0396-4.','DOI https://doi.org/10.1007/s10107-003-0396-4.')
s=re.sub(r'DOI (10\.\d{4,9}/[^\s]+)',r'DOI https://doi.org/\1',s)
s=s.replace('Sursele web au fost consultate la 24 octombrie 2026.','Sursele web au fost consultate la 24 octombrie 2026. Revizuirea a reverificat prioritar metadatele și sursele primare disponibile; textul integral al studiului Verma rămâne neconsultat, iar verificarea Peng folosește pagina și fragmentele editorului. DOI-ul Bertsimas–Sim corect este 10.1007/s10107-003-0396-4, conform primei pagini a articolului.')
(root/'tmp/research/paper-revised.md').write_text(s)
print('Revised source words:',len(s.split()))
