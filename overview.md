# Umbra

Umbra este o aplicație mobilă React Native pentru Android și iOS care urmărește să găsească trasee pietonale cu expunere mai mică la soare între două puncte, în funcție de data și ora plecării și de ocolul acceptat.

### Cum funcționează
- Preia străzile și contururile clădirilor din OpenStreetMap.
- Folosește înălțimile clădirilor și poziția Soarelui pentru a calcula umbrele.
- Estimează ce porțiuni ale traseelor sunt umbrite la momentul parcurgerii lor.
- Compară traseul cel mai rapid cu cel mai umbrit și afișează distanța, durata și expunerea estimată la soare.

### Scop
Reducerea expunerii pietonilor la soare, în special vara, când temperaturile sunt ridicate.

### Implementare
Interfața mobilă este realizată în React Native, cu Expo și TypeScript. Backend-ul este implementat în Go: import OSM explicit și păstrat în cache, graf pietonal, poziția Soarelui prin ecuații NOAA/Meeus și geometrie în metri (EPSG:32635). Valorile solare sunt comparate în teste cu referințe pvlib; pvlib nu este o dependență a serverului.

Aplicația mobilă afișează harta pe tot ecranul, urmărește locația în prim-plan și cere doar destinația prin „Unde mergi?”. Stratul de umbre folosește ora selectată și zona vizibilă. API-ul oferă comparația traseelor și poligoane de umbre; rezultatele lipsă nu sunt înlocuite cu date fictive. Testele verifică integrarea software, nu demonstrează încă precizia în teren.

Prima versiune ar acoperi o zonă restrânsă din Constanța. Înălțimile lipsă ale clădirilor ar fi estimate sau introduse manual, cu sursa și incertitudinea marcate. Acoperirea locală a înălțimilor OpenStreetMap trebuie verificată înainte de alegerea zonei de studiu.

### Partea de cercetare
Am compara traseele recomandate cu cele mai scurte trasee și am verifica pe teren precizia umbrelor calculate. Principalele rezultate urmărite ar fi reducerea timpului petrecut în soare și creșterea duratei deplasării.

**Obiectiv:** un prototip funcțional, accesibil de pe telefon, care demonstrează că umbrele urbane pot fi folosite pentru optimizarea traseelor pietonale.
