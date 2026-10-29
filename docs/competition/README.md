# Umbra · dosar de lucru RoSEF

> **Arhivă — proiectul anterior cu cameră și detecție indirectă.** Instrucțiunile,
> comenzile și rezultatele de mai jos descriu acea implementare. Pentru proiectul
> actual, folosește [ghidul aplicației](../project-guide.md),
> [lucrarea științifică](../paper/umbra-lucrare.pdf) și
> [posterul curent](../poster/scientific/README.md). Nu porni componentele vechi
> pentru a rula aplicația mobilă actuală.

**Stare: proiect software demonstrabil; dosar pentru completare, nu înscriere finalizată.**

Deschide `umbra-dosar.docx` pentru fișa pregătitoare, rezumate RO/EN, raport, protocol, contribuții și pregătirea prezentării. `umbra-poster.pdf` este posterul de lucru, 80 × 120 cm, vertical. Textul editabil se află în `dossier.ro.md`; posterul și documentul se regenerează cu `scripts/build_paperwork.py`.

## Ce lipsește pentru depunere

- Ediția confirmată, regulamentul și formularul oficial actual, termenul și adresa de înscriere.
- Autorii, vârstele/clasele, instituția, coordonatorul, datele de contact, perioada lucrării, aportul individual și semnăturile reale.
- Datele de teren pentru orice afirmație despre funcționarea în exterior. Cele trei cazuri din `software-results.json` sunt exclusiv sintetice.

Nu trimite acest document ca formular oficial. Transferă răspunsurile în formularul ediției confirmate. Documentele personale se transmit separat, prin canalul organizatorului; nu se introduc în Git. Acceptarea unei lucrări aflate numai în stadiul de prototip software trebuie stabilită cu coordonatorul și organizatorul.

## Reguli și surse

Am verificat vizual [invitația și regulamentul RoSEF 2017, publicate de ISJ Neamț](https://www.isjneamt.ro/site/wp-content/uploads/2017/05/Invitatie-ROSEF2017.pdf), paginile PDF 2–6. Sunt o **bază istorică**, nu dovada cerințelor ediției curente. Rezumatul cerințelor istorice: înscriere cu rezumat și datele autorilor/instituției; coordonator; contribuții personale; echipă de cel mult trei elevi; eligibilitate și perioadă de lucru; exponat de maximum 50 × 80 × 120 cm și poster vertical de maximum 80 × 120 cm; prezentare și funcționare fără internet; respectarea siguranței standului. Formularul are o pagină a coordonatorului și una despre experiența participantului. Confirmă toate aceste elemente în regulamentul ediției tale.

[Calendarul oficial MEC 2026](https://www.edu.ro/sites/default/files/_fi%C8%99iere/Minister/2026/olimpiade_concursuri/calendare/05_Calendar_Concursuri_fara_finantare_MEC_2026.pdf), poziția 08, indică etapa națională în octombrie–noiembrie 2026 la Suceava. Calendarul nu furnizează singur formularul sau data-limită exactă. Termenele din 2017 sau 2025 nu sunt utilizate pentru înscrierea din 2026. Nu am presupus că regulile ISEF se aplică automat la RoSEF.

## Reproducere

Din rădăcina proiectului:

```bash
uv sync --extra dev
npm --prefix frontend ci
make test
make lint
make build
uv run python scripts/validate_synthetic.py --data-dir ../umbra-data/submission-fixtures --output docs/competition/software-results.json
uv run umbra-api
```

Deschide `http://127.0.0.1:8000`, rulează demonstrația, descarcă ZIP-ul și deschide `report.html` după extragere. Păstrează fiecare rezultat al experimentelor reale, inclusiv refuzurile și rezultatele nefavorabile. Configurațiile, versiunile și seed-ul testelor sintetice sunt în JSON.

Pentru documente, folosește un mediu separat cu `python-docx` și `reportlab`, apoi rulează `python scripts/build_paperwork.py`. Autorii trebuie să revizuiască și să înțeleagă tot textul înainte de a-l semna sau prezenta.

## Verificarea acestei versiuni

Au trecut 12 teste Python, verificările de lint Python/TypeScript și build-ul de producție. În browser au fost verificate demonstrația, redeschiderea unei analize salvate și afișarea refuzului pe o scenă fără muchie. ZIP-ul cu raport autonom, JSON și CSV este verificat prin test de integrare. Posterul a fost randat și inspectat vizual. Fișierul DOCX a fost verificat structural; paginarea și aspectul în Word nu au putut fi verificate vizual, deoarece LibreOffice/soffice nu este instalat. Captura unei camere fizice și modelul PyTorch opțional nu au fost testate în această sesiune.
