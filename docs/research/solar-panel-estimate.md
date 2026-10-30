# Estimarea producției unui panou solar

Stadiu: funcție experimentală; nu a fost comparată cu măsurători ale unui panou real. Întrebarea de cercetare propusă este cât de mult se schimbă eroarea estimării zilnice când se adaugă umbrirea locală a acoperișului la o prognoză meteorologică. Îmbunătățirea nu a fost încă demonstrată.

## Instrumente studiate

- [PVGIS](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en) al Comisiei Europene estimează potențialul fotovoltaic folosind date climatice, caracteristicile sistemului și orizontul. Este o referință pentru resursa solară, nu o validare a prognozei zilnice Umbra.
- [NREL PVWatts](https://pvwatts.nrel.gov/) estimează energia unui sistem fotovoltaic. [Manualul PVWatts](https://pvwatts.nrel.gov/downloads/pvwattsv5.pdf) descrie o valoare implicită agregată de 14% pentru unele pierderi, inclusiv o componentă generică de umbrire; invertorul este modelat separat acolo. Umbra folosește 14% doar ca ipoteză globală simplificată, fără să implementeze complet PVWatts.
- [Google Solar API](https://developers.google.com/maps/documentation/solar/building-insights) folosește informații despre clădiri pentru configurații de panouri și potențial anual; [straturile sale](https://developers.google.com/maps/documentation/solar/data-layers) pot include modele de suprafață și umbrire orară. Necesită autentificare; disponibilitatea depinde de acoperire și de condițiile serviciului. Umbra nu folosește această API.
- [Open-Meteo](https://open-meteo.com/en/docs) furnizează prognoza radiației globale pe plan înclinat (GTI). Este o medie pe ora precedentă, în W/m², calculată pentru înclinarea și azimutul cerute; modelul presupune cer izotrop și albedo 20%. Azimutul folosit de serviciu este 0° sud, −90° est și 90° vest. Prognoza nu este o măsurare la panou.

## Metodă în Umbra

Utilizatorul selectează o clădire pe hartă, o zi din anul curent sau următor, puterea nominală în W, înclinarea și direcția. Pentru următoarele 15 zile se utilizează prognoza; pentru celelalte zile se folosește media aceleiași zile calendaristice din cei mai recenți trei ani anteriori, pe baza arhivei istorice Open-Meteo. Este o comparație sezonieră pe un eșantion mic, nu prognoza vremii din ziua aleasă sau o medie climatică reprezentativă. Pentru 29 februarie se folosesc ultimii trei ani bisecți. Serverul solicită GTI orar pentru ziua locală din România, incluzând intervalul care se încheie la miezul nopții următoare, și însumează mediile orare pentru iradierea zilnică H în kWh/m². Pentru zilele cu schimbarea orei sunt posibile 23 sau 25 de intervale orare.

Estimarea simplificată este **E ≈ (P / 1000) × H × 0,86 kWh**, unde P este puterea nominală în W. Valoarea presupune comportament liniar la 1000 W/m² și un factor global de pierderi de 14%; nu modelează temperatura celulelor, eficiența invertorului separat, degradarea, zăpada ori geometria electrică a mai multor panouri. Nu este implementarea completă PVWatts.

**Limită esențială:** punctul selectează o clădire și coordonatele prognozei, dar nu reconstruiește acoperișul și nu calculează umbrirea locală a panoului. Radiația prognozată are rezoluție meteo, nu la nivel de acoperiș. Nu se garantează instalabilitatea, producția, economiile sau performanța financiară. Rezultatul nu trebuie descris ca energie măsurată sau umbrire calculată de Umbra.

Economia afișată este energia estimată înmulțită cu prețul introdus de utilizator. Se presupune că întreaga energie este consumată pe loc la acel preț; nu sunt modelate consumul orar, energia injectată, compensația, taxele sau costul instalației. Prețul inițial de 1 leu/kWh este doar un exemplu editabil.

## Validare propusă

Colectați date orare de la un panou real cu putere, orientare și înclinare cunoscute, alături de un jurnal al umbririi și zile cu vreme diferită. Comparați estimarea publicată înainte de ziua respectivă cu energia măsurată de invertor, folosind eroarea absolută și eroarea relativă pentru zile cu producție nenulă. Păstrați separat zilele folosite pentru dezvoltare și testare. Comparați ulterior un model fără umbrire, unul cu o ipoteză fixă și un model de umbrire pe acoperiș, dacă geometria 3D și înălțimea panoului devin disponibile. Nicio comparație nu este încă realizată.
