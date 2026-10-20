# Umbra

## Studiul avertizării la colțuri fără vizibilitate directă prin analiza umbrelor

Autori: Perjoc Eduard-Mihai, Haivas Eduard-Andrei, Manea Cezar-Ștefan

Coordonator: Rădulescu Ramona

Localitate: Constanța

Document de lucru pentru RoSEF 2026. Stadiu: prototip software și protocol de cercetare. Rezultatele unei evaluări controlate vor fi adăugate după efectuarea experimentelor.

## Rezumat

Umbra investighează dacă o cameră fixă poate avertiza asupra apropierii unei persoane ascunse de un colț folosind umbra proiectată pe o suprafață vizibilă. Întrebarea centrală este cât timp util poate oferi această observație și în ce condiții devine nesigură. Dezvoltarea prototipului este documentată începând cu 15 septembrie 2026. Aplicația compară înregistrări cu o referință fără persoană, analizează întunecarea unei regiuni de pavaj și produce vizualizări pentru examinarea semnalului. Include o verificare a poziției Soarelui față de orizont și un mod experimental pentru suprafețe iluminate artificial.

Propunem o evaluare care separă prima umbră observabilă, prima alertă a algoritmului și prima vizibilitate directă a persoanei. Vom măsura timpul de avertizare obținut, apropierile ratate, alarmele false pe minut și frecvența refuzului de analiză în condiții nepotrivite. Scenele de evaluare vor fi separate de cele folosite pentru reglarea parametrilor. În prezent, prototipul permite pregătirea și examinarea experimentelor; performanța pe scene independente și funcționarea detectorului în timp real nu sunt încă demonstrate. Contribuția urmărită este stabilirea condițiilor în care umbra oferă informație utilă pentru avertizare și a limitelor acestei informații.

Cuvinte cheie: umbre proiectate, ocluzie, analiză video, avertizare anticipată, iluminare, evaluare experimentală.

## Problema de cercetare

O cameră orientată spre un colț poate pierde din vedere o persoană până când aceasta trece de marginea peretelui. În anumite configurații, umbra persoanei ajunge pe pavajul vizibil înaintea corpului. Dorim să aflăm dacă această diferență poate fi transformată într-o avertizare verificabilă.

Motivația aplicației este supravegherea unor zone cu vizibilitate limitată. Experimentul propus privește detectarea unei apropieri, nu identificarea unei intenții infracționale. O persoană care se apropie de colț poate fi un trecător obișnuit; etichetarea ei drept suspect nu rezultă din semnalul de umbră.

Întrebarea principală este: în ce condiții poate analiza umbrei produce o alertă înainte ca orice parte a persoanei să fie direct vizibilă, fără o frecvență inacceptabilă a alarmelor false?

## De ce problema este dificilă

Folosim data, ora și coordonatele geografice ale locului în care se află camera pentru a calcula poziția Soarelui față de acel punct, exprimată prin azimut și înălțime deasupra orizontului. În prototip, acest calcul permite verificarea prezenței Soarelui deasupra orizontului. Pentru a lega direcția luminii de umbra observată în imagine și de poziția persoanei ascunse, sunt necesare și orientarea camerei și geometria scenei.

Camera măsoară lumina reflectată de suprafață. Ea nu observă direct persoana ascunsă. O zonă care se întunecă poate reprezenta umbra unei persoane, dar poate apărea și din cauza variației expunerii, a norilor, a unui vehicul sau a unei surse de lumină în mișcare. Textura pavajului și compresia video pot fragmenta conturul umbrei.

Același contur observat poate proveni din poziții diferite ale persoanei dacă se modifică poziția sursei luminoase. Mai multe lămpi pot produce umbre suprapuse. O umbră difuză poate păstra informație despre mișcare fără să permită localizarea exactă a corpului. Din acest motiv, detectarea unei apropieri, estimarea poziției și reconstruirea posturii sunt probleme distincte.

O altă dificultate este evaluarea corectă. O umbră identificată retrospectiv după vizionarea întregului clip nu dovedește că un sistem ar fi emis atunci o alertă în timp real. Testarea trebuie să păstreze ordinea temporală și să evite utilizarea cadrelor viitoare pentru decizia curentă.

## Legătura cu cercetarea existentă

Bouman și colaboratorii au prezentat în 2017 o metodă de recuperare a informației despre scene ascunse folosind variații de lumină observate lângă muchiile pereților [1]. Lucrarea arată că ocluzia și iluminarea pot transporta informație despre mișcarea din afara câmpului vizual.

Umbra urmărește o problemă mai restrânsă: avertizarea prin umbre proiectate vizibile și caracterizarea erorilor în condiții apropiate de cele ale unei camere fixe. Prototipul actual nu reproduce algoritmul din [1]. Nu revendicăm inventarea observării indirecte și nici o noutate globală demonstrată. Contribuția de cercetare propusă este o evaluare reproductibilă a avertizării, inclusiv situațiile în care metoda trebuie să refuze o concluzie.

## Ipoteze de verificat

Prima ipoteză este că, atunci când geometria expune umbra înaintea persoanei, analiza temporală poate produce un timp de avertizare pozitiv. A doua este că persistența și coerența mișcării pot reduce alarmele false față de o simplă diferență de imagine. A treia este că poziția și numărul surselor de lumină modifică fiabilitatea, astfel încât rezultatele de zi și de noapte trebuie raportate separat.

Acestea sunt ipoteze pentru experimente. Nu sunt concluzii deja demonstrate.

## Prototipul realizat

Aplicația organizează scene, înregistrări și analize. Pentru analiza pe înregistrări, utilizatorul furnizează o referință fără persoană și un clip al apropierii de colț. O regiune de pavaj poate fi selectată manual. Analiza urmărește modificări de intensitate și mișcare, iar clipurile adnotate permit examinarea rezultatului.

Metadatele de timp și coordonate sunt folosite pentru calculul poziției solare și verificarea Soarelui față de orizont. Ele nu sunt suficiente pentru a transforma o umbră în coordonatele fizice ale persoanei: ar mai fi necesare orientarea camerei și geometria suprafeței. Modul experimental de noapte utilizează o regiune de pavaj iluminată și verificată de utilizator; nu localizează automat corpurile de iluminat.

Punctul verde din vizualizare este un indicator derivat din imagine, nu o măsurare validată a poziției ascunse. Interfața live afișează camera, dar detectorul live nu este implementat și validat în acest stadiu. Scorul de încredere este euristic, nu o probabilitate calibrată.

## Metoda experimentală propusă

Vom înregistra o cameră fixă orientată spre un colț și o suprafață pe care poate apărea umbra. Fiecare sesiune va include o referință fără persoană, apropieri repetate și secvențe negative fără apropiere. Vom documenta poziția camerei, traseul, lumina și setările de captură. O cameră de referință separată poate verifica deplasarea ascunsă; înregistrarea ei nu va fi folosită ca intrare pentru detector.

Vom modifica succesiv geometria, iluminarea și condițiile imaginii, pentru a putea atribui erorile unei cauze. Condițiile negative vor include schimbări de lumină și umbre fără apropiere relevantă. Eșantionul inițial va verifica protocolul de măsurare; numărul final de repetări va fi stabilit după estimarea variabilității.

Parametrii vor fi aleși pe un set de dezvoltare și fixați înaintea evaluării. Separarea se va face după colț și sesiune, nu prin împărțirea aleatorie a cadrelor aceluiași clip. Astfel, evaluarea nu va beneficia de aproape aceeași imagine pe care metoda a fost reglată.

Pentru regiunea selectată manual, selecția va avea loc pe cadrul gol. Dacă regiunea este aleasă după observarea traseului umbrei din clipul testat, vom raporta acea condiție separat ca analiză asistată. Referința calculată din primele 1,8 secunde ale clipului presupune un început fără persoană și va fi comparată separat cu referința goală înregistrată independent.

## Definirea măsurătorilor

Vom eticheta independent trei momente: `t_shadow`, prima umbră observabilă în regiunea urmărită; `t_visible`, primul cadru în care orice parte a persoanei devine direct vizibilă; și `t_alert`, prima alertă calificată a metodei. Folosirea primei părți vizibile a corpului evită exagerarea avertizării prin compararea cu apariția întregului corp.

Timpul disponibil din umbră este `t_visible - t_shadow`. Timpul de avertizare realizat este `t_visible - t_alert`. Un rezultat pozitiv pentru a doua diferență indică o alertă înaintea vizibilității directe. O alertă târzie are o diferență negativă. Apropierea ratată va fi numărată ca eșec, nu eliminată din evaluare.

Vom raporta distribuția timpului de avertizare și proporția apropierilor avertizate la timp. Alarmele false vor fi măsurate pe minut de înregistrare negativă, folosind o regulă prestabilită pentru începutul și încheierea unui episod de alarmă. Vom publica și rata refuzurilor, durata înregistrărilor și numărul de evenimente. Performanța calculată numai pe încercările acceptate poate ascunde un detector care refuză aproape toate scenele.

Etichetele de vizibilitate vor fi stabilite fără afișarea alertelor detectorului. Pentru un subset, doi evaluatori vor eticheta independent, iar dezacordul va fi raportat. Intervalele de incertitudine vor ține cont de gruparea încercărilor pe scenă sau sesiune.

## Comparații și verificarea componentelor

Comparațiile propuse sunt diferența de fundal pe întregul cadru, un prag fix pe aceeași regiune de pavaj, o variantă cu persistență temporală și metoda Umbra cu urmărire și verificări de acceptare. Fiecare va trebui implementată ca detector separat, cu propriile momente de alertă și aceleași condiții de acces la calibrare.

Vom compara metodele la rate similare de alarme false sau prin curbe complete de prag. Eliminarea succesivă a corecției expunerii, a persistenței și a urmăririi va arăta ce aduce fiecare componentă. Scorurile de comparație existente în aplicație nu constituie încă acest experiment independent.

## Perioada proiectului și activitatea documentată

Data de început declarată de echipă este 27 august 2026. Până la 20 octombrie 2026, perioada calendaristică este de 7 săptămâni și 5 zile. Această dată declarată trebuie susținută prin evidențele reale ale echipei; nu reprezintă, singură, dovada unor activități sau experimente efectuate. Istoricul repository-ului înregistrează prima versiune la 15 septembrie 2026 și documentează dezvoltarea software de la acea dată.

| Perioadă | Activitate și sursa evidenței |
| --- | --- |
| 27 august 2026 | Începutul proiectului declarat de echipă; activitățile inițiale și dovezile aferente urmează să fie precizate de autori |
| 15 septembrie 2026 | Inițializarea proiectului și realizarea structurii aplicației pentru experimente locale |
| 16 septembrie 2026 | Materiale pregătitoare pentru RoSEF și revizuiri ale dovezilor software |
| 17 până la 24 septembrie 2026 | Revizuiri ale organizării scenelor, analizei, interfeței și modului experimental pentru iluminare artificială |
| Stadiul acestei lucrări | Formularea protocolului de evaluare și delimitarea rezultatelor ce necesită măsurare |

Cronologia descrie dezvoltarea software. Nu echivalează cu o campanie de experimente finalizată și nu stabilește contribuția individuală a fiecărui autor.

## Stadiu și concluzie

Rezultatul realizat este un prototip care permite pregătirea și inspectarea analizelor pe înregistrări. O concluzie despre fiabilitate necesită însă încercări negative, scene independente și măsurarea timpului de avertizare. Nu prezentăm aici procente de succes sau poziții în metri care nu au fost măsurate.

Valoarea cercetării propuse este stabilirea limitei dintre o umbră care oferă avertizare și o variație de imagine care produce doar o impresie convingătoare. Chiar dacă unele configurații nu permit avertizarea, documentarea lor ar putea defini condițiile de utilizare ale unui viitor detector pentru camere fixe.

## Bibliografie

[1] Katherine L. Bouman și colaboratorii. Turning Corners Into Cameras: Principles and Methods. Proceedings of ICCV, 2017, pp. 2270-2278. https://openaccess.thecvf.com/content_iccv_2017/html/Bouman_Turning_Corners_Into_ICCV_2017_paper.html

[2] Repository Umbra. Istoric de versiuni și cod sursă consultate la 8 octombrie 2026. Document intern de evidență tehnică.

[3] Umbra research plan. `docs/research-plan.md`. Protocol propus, nu rezultate experimentale.
