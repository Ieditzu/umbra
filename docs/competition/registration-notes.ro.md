# Umbra

## Pregătirea înscrierii RoSEF 2026

Aceste note însoțesc lucrarea și rezumatele. Ele sunt pentru verificarea echipei și coordonatorului, nu o declarație semnată și nici o confirmare de eligibilitate.

## Surse și limite de conformitate

Am consultat vizual cele două pagini ale formularului furnizat, `Fisa Rosef.pdf`. Acesta cere denumirea proiectului, autorii, mentorul, instituțiile, rezumatul în spațiul alocat, tipul proiectului, secțiunea tematică, categoria de vârstă, sursa informației despre concurs și utilizarea platformelor AI. A doua pagină cere originea ideii, etapele, ajutorul primit și contribuțiile personale. Există câmpuri pentru avizare, semnături și acord GDPR.

Formularul nu precizează pe paginile examinate anul ediției, perioada înscrierii, lungimea unei lucrări separate sau formatul ei. Referința de regulament din dosarul vechi este documentul RoSEF 2017 publicat de ISJ Neamț. Nu poate confirma regulile ediției curente. Lucrarea și rezumatele sunt materiale pregătitoare, nu documente declarate conforme cu un regulament actual încă neverificat.

Sursă istorică: https://www.isjneamt.ro/site/wp-content/uploads/2017/05/Invitatie-ROSEF2017.pdf

Ediția vizată, confirmată de echipă, este RoSEF 2026. Calendarul Ministerului Educației și Cercetării pentru concursurile naționale școlare fără finanțare în 2026 indică etapa națională RoSEF în octombrie-noiembrie 2026, la Suceava, și etapa județeană în martie-mai. Calendarul confirmă perioada generală a etapei naționale, nu termenul de înscriere, eligibilitatea acestui proiect sau regulamentul de redactare. Coordonatorul trebuie să verifice accesul la etapa națională și cerințele actuale direct cu organizatorii.

Calendar oficial 2026: https://www.edu.ro/sites/default/files/_fi%C8%99iere/Minister/2026/olimpiade_concursuri/calendare/05_Calendar_Concursuri_fara_finantare_MEC_2026.pdf

## Date cunoscute

Titlu pentru înscriere: Umbra. Tip: în echipă. Localitate: Constanța. Coordonator: Rădulescu Ramona.

| Autor | Unitate indicată de echipă |
| --- | --- |
| Perjoc Eduard-Mihai | Liceul de Marină |
| Haivas Eduard-Andrei | Liceul Teoretic Internațional de Informatică |
| Manea Cezar-Ștefan | Liceul Tehnologic de Electrotehnică și Telecomunicații |

Denumirile oficiale ale unităților trebuie verificate de coordonator. Categoria B a fost indicată de echipă; formularul o definește pentru 16-19 ani, deci eligibilitatea fiecărui membru trebuie confirmată pentru ediția aleasă. Secțiunea III Tehnologia informației este o propunere potrivită prototipului software, nu o alegere deja confirmată. Statutul de continuare a unui proiect anterior nu se deduce din faptul că există versiuni software.

Datele de contact se vor copia din informațiile confirmate de mentor în formularul final. Nu le repetăm în aceste documente care pot ajunge într-un repository public.

## Texte propuse pentru pagina echipei

### Originea ideii

Proiectul pornește de la o limită a camerelor orientate spre colțuri: persoana poate fi ascunsă, în timp ce umbra ei ajunge deja într-o regiune vizibilă. Am ales să investigăm dacă această observație poate susține o avertizare verificabilă. Problema ne-a condus la analiza iluminării, a geometriei și a erorilor de interpretare a imaginilor.

Acest text descrie rațiunea tehnică a proiectului. Dacă ideea a pornit de la un incident sau o experiență personală, autorii trebuie să adauge numai relatarea reală.

### Etapele parcurse

Dezvoltarea software este documentată din 15 septembrie 2026. Am realizat structura aplicației pentru scene și înregistrări, apoi am revizuit analiza umbrelor și vizualizările rezultatelor. Am introdus metadate de timp și coordonate pentru verificarea poziției solare și un mod experimental pentru regiuni iluminate artificial. În etapa actuală, am formulat un protocol care separă avertizarea realizată de simpla apariție vizibilă a umbrei. Evaluarea controlată pe scene independente urmează să fie realizată.

### Ajutor primit și platforme AI

Pentru platforme AI, răspunsul propus este Da. Formulare scurtă: „Asistență la dezvoltarea și revizuirea codului, depanare și redactarea materialelor pregătitoare.”

Formulare extinsă: „Am utilizat un asistent AI pentru propuneri de implementare, depanare și structurarea documentației. Materialele și codul rezultate necesită verificarea și asumarea de către echipă. Experimentele, rezultatele și contribuțiile personale trebuie documentate de autori.”

Nu declarați că toate verificările au fost deja efectuate. Ajutorul efectiv al profesorului sau al altor persoane se adaugă după confirmare; nu se presupune o contribuție din simpla prezență a numelui pe formular.

### Contribuțiile personale

De completat de fiecare autor cu activități efectiv realizate și dovezi, fără atribuiri inventate.

- Perjoc Eduard-Mihai: [activități realizate, interval, fișier sau experiment care le documentează].
- Haivas Eduard-Andrei: [activități realizate, interval, fișier sau experiment care le documentează].
- Manea Cezar-Ștefan: [activități realizate, interval, fișier sau experiment care le documentează].

## Verificări înainte de înscriere

1. Confirmați regulamentul aplicabil ediției 2026, termenul de înscriere și condițiile de acces la etapa națională cu organizatorii sau coordonatorul. Nu folosiți calendarul din 2017 drept calendar curent.
2. Confirmați categoria de vârstă, instituțiile și secțiunea tematică.
3. Completați contribuțiile individuale și verificați toate afirmațiile despre activitatea echipei.
4. Copiați rezumatul în formular și verificați vizual încadrarea în casetă.
5. Lăsați semnăturile și certificările persoanelor autorizate. Formularul cere mentorului să certifice finalizarea în anul școlar în curs; această certificare nu este îndeplinită automat de existența unui prototip.

## Pregătirea discuției cu juriul

O introducere scurtă poate fi: „Studiem dacă umbra unei persoane poate oferi unei camere fixe avertizare înainte ca persoana să apară de după colț. Provocarea este să separăm această informație de schimbările obișnuite de lumină și să măsurăm cât timp câștigă efectiv algoritmul. Avem prototipul de analiză; protocolul ne va permite să testăm avertizarea, alarmele false și situațiile în care metoda trebuie să refuze o concluzie.”

La întrebarea despre poziția persoanei, explicați că indicatorul actual este o estimare derivată din imagine. Localizarea în metri ar necesita geometrie calibrată și adevăr de referință independent. La întrebarea despre funcționarea live, separați previzualizarea camerei de detectorul live, care rămâne de implementat și validat.

Pentru susținerea tehnică, pregătiți o diagramă a camerei și colțului, un clip original alături de rezultatul lui, definițiile momentelor măsurate și cel puțin un caz de eșec. Completați demonstrația cu date reale după experiment, nu cu procente sau grafice ilustrative prezentate ca rezultate.
