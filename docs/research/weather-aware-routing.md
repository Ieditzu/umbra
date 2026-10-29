# Trasee adaptate la nori și vreme

**Stadiu: implementat în aplicație; evaluarea avantajului meteo este un studiu separat.**

Serverul compară alternativele deja generate folosind prognoza Open-Meteo pentru mijlocul aproximativ al traseului. Scorul experimental adună timpul de mers și radiația directă modelată împărțită la 150 W/m²; valoarea este o alegere provizorie, nu un prag validat. Folosește interpolare orară, un cache de 20 de minute și revine la calculul anterior când prognoza lipsește. Nu estimează poziția norilor pe străzi și nu calculează doza UV. Experimentele de mai jos rămân de făcut.

## Ideea pe înțelesul tuturor

Umbra caută trasee pietonale cu umbră estimată de clădiri și copaci. Când Soarele este puternic, un mic ocol prin umbră poate fi util. Când prognoza indică puțină radiație directă, scorul poate prefera drumul mai rapid; celelalte alternative rămân selectabile.

Aplicația folosește prognoza pentru locul și ora deplasării, împreună cu poziția Soarelui și geometria urbană. Varianta aleasă primește marcajul **Recomandat**. Opțiunea **Straturi → Nori** ascunde pictograma decorativă; nu dezactivează prognoza sau calculul. Alegerea dintre alternative rămâne disponibilă.

## Ce ne spune cercetarea

- Norii modifică atât lumina directă, cât și radiația difuză, venită din mai multe direcții. Un procent de nori nu spune singur câtă radiație ajunge la pieton. [NOAA: efectele norilor asupra UV](https://www.cpc.ncep.noaa.gov/products/stratosphere/uv_index/uv_clouds.shtml).
- Înnorat nu înseamnă automat protecție UV: norii subțiri pot lăsa să treacă mult UV, iar unele condiții îl pot chiar amplifica. Nici umbra unei clădiri nu elimină toată radiația difuză. [OMS: radiația ultravioletă](https://www.who.int/news-room/questions-and-answers/item/radiation-ultraviolet-(uv)).
- [Open-Meteo Weather Forecast API](https://open-meteo.com/en/docs) oferă, în funcție de model, acoperirea cu nori, radiația solară directă și difuză, indicele UV și prognoza de precipitații. Radiația orară este, de regulă, o medie pentru ora precedentă; momentul reprezentat trebuie tratat corect.
- Prognozele folosesc celule de ordinul kilometrilor, care depind de model și regiune. Prin urmare, nu putem afirma că știm exact unde se află umbra unui nor pe fiecare stradă. Pe distanțe scurte, două trasee pot primi aceeași prognoză; diferența locală continuă să vină în principal din clădiri și copaci.

## Modelul implementat

1. Serverul cere `direct_radiation_instant` și `cloud_cover` pentru mijlocul traseului, rotunjit la 0,02°. Păstrează prognoza în memorie timp de 20 de minute. Nu cere în acest flux radiație difuză, UV sau o prognoză separată pentru fiecare stradă.
2. Motorul geometric păstrează clasificarea segmentelor. La evaluarea meteo, umbra are factor 0, umbra estimată factor 0,5, iar celelalte categorii factor 1. Necunoscutul nu devine soare confirmat.
3. Scorul este `durata_s + Σ(radiația_directă × factor × durata_segmentului_s) / 150`. Prognoza se interpolează între ore și se evaluează la momentele parcurgerii, în subintervale de cel mult cinci minute. Ponderea de 150 W/m² este o alegere de model.
4. Se recomandă scorul minim dintre alternativele deja generate, care respectă ocolul acceptat. Această etapă nu inventează trasee și nu caută un optim global nou.
5. Fără prognoză utilizabilă sau acoperire temporală completă, serverul marchează vremea indisponibilă și păstrează comparația geometrică.

Radiația solară de bandă largă nu este echivalentă cu radiația UV și nici cu temperatura resimțită. Indicele UV ar fi prezentat separat, ca informație regională de prognoză, nu ca măsurare personală sau dovadă că un traseu este sigur. Probabilitatea și intensitatea ploii ar putea deveni un alt criteriu, ulterior; nu presupunem că un copac sau o clădire protejează sigur de ploaie.

## Întrebarea de cercetare

**Poate o prognoză de radiație solară să ajute Umbra să aleagă între un traseu mai rapid și unul mai umbrit, reducând expunerea directă estimată fără ocoluri inutile, în condiții diferite de nori?**

Comparăm pe aceleași perechi de puncte și ore: (A) traseul cel mai rapid, (B) recomandarea actuală bazată pe umbre geometrice și (C) propunerea cu prognoză. Stabilim dinainte limita de ocol și evaluăm separat zile senine, variabil înnorate și înnorate. Raportăm durata, lungimea, umbra și zona necunoscută, expunerea directă estimată, frecvența schimbării recomandării și cât de des lipsește prognoza.

Pentru validare în teren ar fi utile măsurători independente și sincronizate ale radiației directe sau globale și ale condițiilor meteo, pe trasee parcurse la ore comparabile. O fotografie ori simpla observație „înnorat” nu dovedește doza UV. Mai întâi se testează sensibilitatea la erori ale prognozei și lipsuri ale hărții; rezultatele simulate nu sunt rezultate de teren. Dacă nu avem instrumente adecvate, prezentăm doar comportamentul modelului și limitările sale.

## Implementare și limitări

Clientul meteo este în `server/compute/weather.mjs`, iar testele deterministe sunt în `server/compute/weather.test.mjs`. Cererea are un timeout de 1,8 s; cache-ul conține cel mult 100 de locații. Coordonata rotunjită este trimisă către Open-Meteo; cererile meteo necesită internet. Calculele geometrice pe datele pregătite nu depind de disponibilitatea prognozei.

Serviciul gratuit Open-Meteo permite utilizare necomercială în limitele publicate și cere atribuirea datelor; condițiile și eventualul cost trebuie reverificate înainte de lansare. [Termenii Open-Meteo](https://open-meteo.com/en/terms). Sursele, ora emiterii și ora prognozei trebuie păstrate în rezultatele experimentului, ca acesta să poată fi reprodus.

**Evaluare următoare:** comparația descrisă mai sus între traseul rapid, alegerea geometrică și recomandarea meteo, pe aceleași puncte, ore și limite de ocol. Această evaluare este separată de studiul OSM/GBA și al umbrelor din lucrarea și posterul curente.
