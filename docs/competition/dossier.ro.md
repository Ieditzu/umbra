# UMBRA
## Fișă pregătitoare pentru RoSEF

Estimarea experimentală a mișcării ascunse din variațiile luminii lângă un colț

STARE: proiect de document pentru completare. Formularul oficial al ediției și datele participanților nu au fost furnizate. Nu reprezintă o înscriere transmisă sau acceptată.

Titlul lucrării: Umbra — kit local pentru studierea mișcării ascunse din variațiile luminii.

Autor(i), clasă, vârstă: [DE COMPLETAT]. Instituție/localitate: [DE COMPLETAT].

Coordonator și date de contact: [DE COMPLETAT]. Liderul echipei, dacă este cazul: [DE COMPLETAT].

Ediție, categorie de vârstă și tip individual/echipă: [DE CONFIRMAT]. Încadrare propusă: Tehnologia informației, pentru contribuția software; de confirmat cu coordonatorul.

Perioada efectivă de lucru: [DE COMPLETAT]. Continuare a unui proiect anterior și îmbunătățiri realizate în perioada eligibilă: [DE COMPLETAT].

### Rezumat în limba română

Umbra este un prototip software local pentru investigarea variațiilor de lumină vizibile lângă un colț, ca indiciu al mișcării unui obiect aflat în afara câmpului vizual direct. Scopul este evaluarea unei proceduri de calibrare și estimare care poate refuza interpretarea atunci când indiciile sunt insuficiente. Sistemul utilizează o filmare de calibrare fără țintă, selectează automat o regiune a imaginii, normalizează expunerea și urmărește distribuția variațiilor temporale. O cameră separată poate furniza etichete de referință, fără a participa la estimarea principală. Aplicația oferă import și captură video, analiză locală și exporturi reproductibile. Verificarea disponibilă constă în demonstrații sintetice deterministe și teste software. Acestea permit verificarea fluxului și a cazurilor de refuz, dar nu demonstrează performanță la colțuri reale. Poziția este un indicator derivat din imagine, încă necalibrat fizic. Contribuția propusă este integrarea experimentului, a trasabilității și a refuzului explicit într-un instrument accesibil. Confirmarea ipotezei necesită înregistrări controlate în exterior și comparații pe scene neutilizate la ajustarea metodei.

Data, verificarea coordonatorului și semnătura: [DE COMPLETAT DE PERSOANA ÎNDREPTĂȚITĂ].

<!-- PAGE -->

## Experiența autorului și contribuțiile

Această pagină pregătește răspunsurile personale. Textul despre motivație, munca efectivă și ajutorul primit trebuie completat de participant; nu poate fi dedus numai din cod.

### Originea ideii

[DE COMPLETAT: situația concretă care a trezit interesul, când a fost identificată problema și ce surse au fost consultate.] Fundamentul științific indicat în proiect este lucrarea lui Bouman și colaboratorii din 2017. Principiul observării indirecte în jurul colțurilor este anterior proiectului Umbra.

### Etapele efectiv realizate

În depozit există generarea datelor sintetice, calibrarea și analiza imaginilor, stocarea locală, interfața și exporturile. Participantul va preciza pentru fiecare etapă datele, autorul și deciziile proprii: [DE COMPLETAT]. Realizarea unui modul în depozit nu dovedește că participantul l-a scris personal.

### Ajutor și instrumente utilizate

Această versiune a codului și documentației a primit asistență AI prin Codex pentru examinarea implementării, corectarea erorilor, generarea documentelor și rularea verificărilor. Autorii vor descrie exact ce au realizat și înțeles independent, ce au modificat și ce sprijin suplimentar au primit. Nu se declară întreaga implementare drept muncă exclusiv personală fără această delimitare.

Sprijinul coordonatorului sau al altor persoane: [DE COMPLETAT]. Surse, biblioteci și materiale reutilizate: Python, OpenCV, NumPy, FastAPI, React, SQLite, Astral; PyTorch este opțional. Versiunile aplicației sunt fixate în fișierele de dependențe.

### Contribuția personală

[DE COMPLETAT PENTRU FIECARE AUTOR: modul/experiment, decizia proprie, intervalul de lucru, fișierul sau înregistrarea care o documentează.] Aspectele propuse pentru discuție sunt organizarea experimentului local, selecția automată a regiunii și păstrarea rezultatelor cu explicații și refuzuri.

Sursa principală de informare, modul în care participantul a aflat despre concurs și opiniile personale cerute de formular: [DE COMPLETAT].

Nume, semnătură și dată pentru fiecare participant: [DE COMPLETAT].

<!-- PAGE -->

## Raport tehnic: întrebare și metodă

### Întrebarea de cercetare

Poate o cameră RGB fixă, calibrată cu o secvență fără țintă, să extragă indicii utile despre mișcarea ascunsă din variațiile luminii de lângă un colț? Ipoteza de testat este că adaptarea la scenă și selecția conservatoare a rezultatelor reduc alarmele false față de o regulă fixă. Ipoteza nu este considerată confirmată.

### Fundament și limite fizice

Un colț poate modula lumina care ajunge pe o suprafață vizibilă. Lucrarea de referință a lui Bouman și colaboratorii motivează cercetarea [S3]. Umbra explorează practic acest subiect cu echipament accesibil. O umbră direct vizibilă și o variație slabă de penumbră sunt condiții distincte și trebuie etichetate separat în experimente.

### Implementarea actuală

Calibrarea folosește mediana cadrelor, variația pixelilor și o mască stabilă. Detecția liniilor caută o muchie aproximativ verticală și alege o regiune relativ uniformă. O muchie din imagine nu dovedește singură că geometria fizică este adecvată. Cadrele sunt redimensionate la cel mult 480 pixeli lățime și eșantionate aproximativ la 10 cadre/s; analiza este limitată la 600 de eșantioane.

Normalizarea expunerii și diferența față de fundal produc un semnal de întunecare. Centrul ponderat al acestui semnal este transformat într-o distribuție pe 16 poziții și netezit temporal. Scorurile combină intensitatea semnalului, stabilitatea, coerența și dezacordul unor reguli simple. Valorile denumite probabilitate și încredere în API sunt scoruri euristice, fără calibrare probabilistică pe date de teren.

Regulile de comparație implementate folosesc energia diferenței, un prag fix și acoperirea/coerența. Nu reprezintă o comparație realizată între patru modele instruite. Poziția solară este metadată contextuală, nu un model optic invers utilizat în inferență. Rețeaua PyTorch opțională produce numai o indicație separată după preantrenare sintetică.

### Evaluarea

Etichetele de referință se potrivesc după timp, inclusiv decalajul audio. Eșantioanele fără markeri valizi și începutul adaptării fundalului sunt excluse. Fără sincronizare suficientă, evaluarea este reținută. Detecția automată a prim-planului poate rata o țintă staționară și necesită verificare vizuală.

<!-- PAGE -->

## Rezultate disponibile și interpretare

{{SOFTWARE_RESULTS}}

### Ce înseamnă numerele

F1, precizia și recall-ul folosesc un prag de 0,5 pe scorul fiecărui eșantion, înaintea deciziei globale de refuz. De aceea, un clip refuzat poate conține eșantioane peste prag. Rata alarmelor false este FP/(FP+TN); dacă nu există eșantioane negative, este indisponibilă. Eroarea de poziție este media distanței absolute normalizate pe eșantioanele cu țintă.

Cadrele consecutive sunt corelate. Cele 120 de cadre nu reprezintă 120 de experimente independente. Cazurile folosesc același generator simplificat și același seed; nu susțin intervale de încredere sau generalizare între colțuri. Scorul de încredere al programului nu este probabilitatea demonstrată că estimarea este corectă.

### Concluzie susținută

Există un flux software reproductibil de la clipuri la rezultate și export. Cazurile sintetice documentează comportamentul acestei implementări. Nu au fost furnizate înregistrări de teren, rezultate independente între colțuri sau măsurători ale timpului de avertizare. Nu se afirmă precizie în metri, funcționare universală, superioritate față de alte metode ori utilizare sigură în trafic.

### Rezultatele de teren

Număr de colțuri și încercări: NECOLECTAT. Condiții, repartizarea dezvoltare/test, etichete revizuite și rezultate pe metodă: NECOLECTAT. Această secțiune se înlocuiește numai cu date efectiv măsurate, păstrând cazurile nereușite.

Scalarea unui indicator normalizat cu lungimea pistei nu validează corespondența dintre pixel și poziția fizică. Până la verificarea acestei corespondențe, valorile metrice oferite opțional de program sunt estimări exploratorii.

<!-- PAGE -->

## Protocol pentru încheierea cercetării

### Echipament și pregătire

Cameră RGB fixată, laptop, a doua cameră pentru referință, țintă opacă pe roți sau panou, ruletă și markeri ArUco 10/11. În prima etapă se preferă obiectele în locul participanților umani. Se aleg spații controlate, fără trafic și fără trecători înregistrabili. Se consemnează acordul pentru folosirea spațiului și, când este cazul, al participanților.

### Plan propus înainte de colectare

Se testează trei colțuri distincte, două condiții de iluminare și câte zece încercări pentru fiecare combinație: cinci cu țintă și cinci fără țintă, în ordine aleatorizată. Total propus: 60 de încercări. Este un plan de lucru, nu un număr de experimente deja efectuate. Se notează direcția și viteza planificate, suprafața, umbrele directe, norii și modificările camerei.

La fiecare configurație se filmează 8–15 secunde fără țintă. Camera de referință include o perioadă inițială fără țintă pentru adaptare și ambii markeri pe toată durata utilă. Se măsoară distanța markerilor. Un semnal comun audio permite sincronizarea. Ținta rămâne complet ascunsă pentru camera principală în intervalul evaluat.

### Separarea dezvoltării de evaluare

În fiecare dintre cele trei împărțiri, un colț întreg este rezervat testării, iar deciziile și pragurile sunt stabilite pe celelalte două. Niciun cadru sau etichetă din colțul de test nu este folosit la reglaj. Calibrarea fără țintă a colțului nou este permisă și consemnată. Se păstrează aceleași intervale, etichete și criterii pentru toate metodele.

### Fișa unei încercări

ID; dată/oră/fus; colț; condiție; suprafață; cameră și expunere; calibrare; țintă prezentă/absentă; direcție; distanță markeri; fișiere; semnal sincronizare și offset; validitatea etichetelor; versiune software; rezultat; motivul refuzului; observații și abatere de la protocol.

### Criterii și analiză

Se verifică etichetele independent de predicții și se păstrează intervalele nevalide ca necunoscute, nu ca absențe. Se raportează matricea TP/FP/FN/TN, F1, rata alarmelor false și acoperirea evaluării. Se raportează separat refuzurile și rezultatele acceptate, pe colț și iluminare. Măsurarea timpului de anticipare necesită un eveniment separat de vizibilitate directă; versiunea curentă nu îl măsoară automat.

<!-- PAGE -->

## Demonstrație și prezentare

### Demonstrație locală

Instalează dependențele și construiește interfața înaintea concursului. Pornește aplicația cu „uv run umbra-api” și deschide http://127.0.0.1:8000. Rulează demonstrația sintetică, arată tipul dovezii și explicația deciziei, apoi descarcă ZIP-ul. Deschide raportul extras fără conexiune la internet. Păstrează un exemplar verificat pe laptop pentru cazul în care demonstrația nu poate fi rulată.

Arată și cazul fără țintă și o condiție cu semnal slab. Nu descrie o animație sintetică drept filmare în exterior. Nu este necesară conectarea camerei la stand pentru demonstrația software.

### Firul prezentării

În primul minut explică problema și întrebarea. În următoarele două minute descrie ce măsoară camera și rolul calibrării. Arată apoi un rezultat, un refuz și diferența dintre scor și dovadă. Explică propria contribuție și ajutorul primit. Încheie prezentarea pregătită cu limitele și experimentul necesar pentru confirmare; păstrează timp pentru întrebări. Durata efectivă se adaptează programului ediției.

### Întrebări pentru pregătire

De ce nu este vedere prin pereți? Camera măsoară lumină de pe suprafața vizibilă. Cum știi unde era ținta? Printr-o înregistrare separată și etichete sincronizate, revizuite. Ce este nou? Integrarea particulară a experimentului și refuzului, nu descoperirea principiului fizic. Ce nu ai demonstrat? Performanța la colțuri reale și corespondența fizică a poziției. De ce poate greși? Umbre independente, mișcarea camerei, expunerea, reflexiile și geometria pot produce indicii similare.

### Stand și documente

Plan de stand: laptop cu alimentator intact și cabluri fixate, poster vertical și dosar. Dimensiunea posterului de lucru este 80 × 120 cm, aleasă după regulamentul istoric; confirmă limita actuală înainte de tipărire. Nu include public date personale sensibile sau filmări de referință cu persoane identificabile. Nu porni experimente optice suplimentare la stand fără evaluarea coordonatorului.

Înainte de depunere: confirmă ediția/formularul, completează autorii și contribuțiile, verifică afirmațiile față de rezultate și obține semnăturile reale. Dosarul nu a fost transmis organizatorilor.

<!-- PAGE -->

## Surse și statutul documentării

### S1. Reguli istorice

Invitație RoSEF 2017, document al concursului publicat de Inspectoratul Școlar Județean Neamț. Paginile PDF 2–4: regulament; paginile 5–6: formular. Folosit pentru structura pregătitoare, nu pentru a certifica eligibilitatea la ediția curentă.

https://www.isjneamt.ro/site/wp-content/uploads/2017/05/Invitatie-ROSEF2017.pdf

### S2. Calendar oficial 2026

Ministerul Educației și Cercetării, Calendarul concursurilor fără finanțare MEC 2026, poziția 08: RoSEF, etapa națională octombrie–noiembrie 2026, Suceava. Data exactă, înscrierea și formularul curent necesită confirmare separată. Ediția vizată de participant nu a fost confirmată.

https://www.edu.ro/sites/default/files/_fi%C8%99iere/Minister/2026/olimpiade_concursuri/calendare/05_Calendar_Concursuri_fara_finantare_MEC_2026.pdf

### S3. Fundament științific

Katherine L. Bouman și colaboratorii. Turning Corners Into Cameras: Principles and Methods. ICCV, 2017. Lucrare de referință indicată în proiect. Principiile ei nu constituie validare a implementării Umbra.

https://openaccess.thecvf.com/content_iccv_2017/html/Bouman_Turning_Corners_Into_ICCV_2017_paper.html

### English abstract

Umbra is a local software prototype for investigating whether light variations beside a corner contain useful evidence of hidden motion. An empty-scene video provides calibration; the pipeline automatically selects an image region, normalizes exposure, extracts temporal darkening cues and smooths a coarse position proxy. It returns explicit refusal states when scene quality or signal strength is inadequate. A separate camera can provide synchronized evaluation labels without contributing to the main inference. The application supports video capture, import, saved analyses and portable evidence exports. Available results come from deterministic synthetic demonstrations and software tests. They exercise the implementation but do not establish outdoor sensing performance, physically calibrated position, or superiority over other methods. The proposed contribution is a reproducible, confidence-aware experimental workflow. Controlled trials across held-out corners are required before the research hypothesis can be assessed. The optional neural model is advisory; the primary estimator uses heuristics whose confidence scores have not been calibrated on field data.
