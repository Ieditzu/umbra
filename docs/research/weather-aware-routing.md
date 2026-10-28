# Trasee adaptate la nori și vreme

**Stadiu: prototip implementat, nevalidat în teren.**

Serverul compară alternativele deja generate folosind prognoza Open-Meteo pentru mijlocul aproximativ al traseului. Scorul experimental adună timpul de mers și radiația directă modelată împărțită la 150 W/m²; valoarea este o alegere provizorie, nu un prag validat. Folosește interpolare orară, un cache de 20 de minute și revine la calculul anterior când prognoza lipsește. Nu estimează poziția norilor pe străzi și nu calculează doza UV. Experimentele de mai jos rămân de făcut.

## Ideea pe înțelesul tuturor

Umbra caută în prezent trasee pietonale cu umbră estimată de clădiri și copaci. Când Soarele este puternic, un mic ocol prin umbră poate fi util. Când norii reduc mult lumina directă, același ocol poate să nu mai merite: aplicația ar putea recomanda drumul mai scurt și să păstreze traseul umbrit ca alternativă.

Aplicația ar folosi prognoza pentru locul și ora deplasării, împreună cu poziția Soarelui și geometria urbană. Ar putea afișa, de exemplu, „Traseu mai rapid: prognoza indică puțin soare direct” sau „Mai multă umbră, cu 3 minute în plus”. Acestea sunt exemple de interfață, nu rezultate măsurate. Nu presupunem că utilizatorul vrea mereu traseul cel mai scurt: alegerea dintre alternative rămâne disponibilă.

## Ce ne spune cercetarea

- Norii modifică atât lumina directă, cât și radiația difuză, venită din mai multe direcții. Un procent de nori nu spune singur câtă radiație ajunge la pieton. [NOAA: efectele norilor asupra UV](https://www.cpc.ncep.noaa.gov/products/stratosphere/uv_index/uv_clouds.shtml).
- Înnorat nu înseamnă automat protecție UV: norii subțiri pot lăsa să treacă mult UV, iar unele condiții îl pot chiar amplifica. Nici umbra unei clădiri nu elimină toată radiația difuză. [OMS: radiația ultravioletă](https://www.who.int/news-room/questions-and-answers/item/radiation-ultraviolet-(uv)).
- [Open-Meteo Weather Forecast API](https://open-meteo.com/en/docs) oferă, în funcție de model, acoperirea cu nori, radiația solară directă și difuză, indicele UV și prognoza de precipitații. Radiația orară este, de regulă, o medie pentru ora precedentă; momentul reprezentat trebuie tratat corect.
- Prognozele folosesc celule de ordinul kilometrilor, care depind de model și regiune. Prin urmare, nu putem afirma că știm exact unde se află umbra unui nor pe fiecare stradă. Pe distanțe scurte, două trasee pot primi aceeași prognoză; diferența locală continuă să vină în principal din clădiri și copaci.

## Propunerea pentru Umbra

1. Serverul cere prognoza pentru zona traseului și ora plecării: radiație directă și difuză, nori și, opțional, indice UV. Pentru trasee mai lungi, evaluează timpul estimat de trecere și celulele meteo distincte; evită cererile repetate pentru aceeași celulă și interval.
2. Motorul existent continuă să calculeze dacă un segment este în umbra geometrică a unei clădiri sau a unui copac. Separat, prognoza estimează câtă lumină directă este disponibilă în acea zonă și la acel moment. **Umbra necunoscută rămâne necunoscută**, iar norii nu sunt tratați ca umbră certă.
3. Un scor experimental compară durata și expunerea la **radiație solară directă estimată**, cu o limită aleasă de utilizator pentru ocol. Segmentele în umbră geometrică primesc un cost direct mai mic; estimările pentru copaci și înălțimile incerte își păstrează incertitudinea. Unitatea propusă pentru comparație este W/m² × minute, nu o doză UV personală.
4. Când prognoza indică radiație directă scăzută și diferența estimată dintre trasee este mică, se poate prefera traseul mai rapid. Când radiația directă este mai mare, un ocol umbrit poate deveni mai valoros. Pragurile sunt ipoteze de testat, nu valori stabilite științific.
5. Interfața arată durata, umbra geometrică estimată, ora prognozei și motivul recomandării. Dacă datele meteo lipsesc, sunt prea vechi sau ora cerută este în afara prognozei, aplicația revine la traseele actuale și spune că vremea nu a fost inclusă. Nu substituie valori fictive.

Radiația solară de bandă largă nu este echivalentă cu radiația UV și nici cu temperatura resimțită. Indicele UV ar fi prezentat separat, ca informație regională de prognoză, nu ca măsurare personală sau dovadă că un traseu este sigur. Probabilitatea și intensitatea ploii ar putea deveni un alt criteriu, ulterior; nu presupunem că un copac sau o clădire protejează sigur de ploaie.

## Întrebarea de cercetare

**Poate o prognoză de radiație solară să ajute Umbra să aleagă între un traseu mai rapid și unul mai umbrit, reducând expunerea directă estimată fără ocoluri inutile, în condiții diferite de nori?**

Comparăm pe aceleași perechi de puncte și ore: (A) traseul cel mai rapid, (B) recomandarea actuală bazată pe umbre geometrice și (C) propunerea cu prognoză. Stabilim dinainte limita de ocol și evaluăm separat zile senine, variabil înnorate și înnorate. Raportăm durata, lungimea, umbra și zona necunoscută, expunerea directă estimată, frecvența schimbării recomandării și cât de des lipsește prognoza.

Pentru validare în teren ar fi utile măsurători independente și sincronizate ale radiației directe sau globale și ale condițiilor meteo, pe trasee parcurse la ore comparabile. O fotografie ori simpla observație „înnorat” nu dovedește doza UV. Mai întâi se testează sensibilitatea la erori ale prognozei și lipsuri ale hărții; rezultatele simulate nu sunt rezultate de teren. Dacă nu avem instrumente adecvate, prezentăm doar comportamentul modelului și limitările sale.

## Implementare și limitări

Prototipul ar integra un client meteo pe serverul Node deja folosit de aplicație, cu cache limitat, expirare explicită, timeout și teste pentru lipsă de rețea, noapte, fus orar, trecerea dintre ore și valori lipsă. Ar păstra modul actual disponibil fără internet. Prognoza ar putea primi o coordonată rotunjită la celula meteo; furnizorul extern primește totuși locația cerută, deci acest lucru trebuie explicat utilizatorului.

Serviciul gratuit Open-Meteo permite utilizare necomercială în limitele publicate și cere atribuirea datelor; condițiile și eventualul cost trebuie reverificate înainte de lansare. [Termenii Open-Meteo](https://open-meteo.com/en/terms). Sursele, ora emiterii și ora prognozei trebuie păstrate în rezultatele experimentului, ca acesta să poată fi reprodus.

**Primul pas recomandat:** un prototip care compară traseul actual cu cel rapid pe aceleași date meteo, fără să schimbe încă recomandarea implicită. Numai după evaluare merită aleasă regula automată.
