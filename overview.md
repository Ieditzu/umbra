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
Interfața mobilă este realizată în React Native, cu Expo și TypeScript. Poziția Soarelui, umbrele și traseele sunt calculate direct pe telefon, dintr-un snapshot OSM real inclus în aplicație. Nu este necesar un server API sau introducerea unei adrese. Motorul folosește ecuații NOAA/Meeus, geometrie în metri (EPSG:32635) și un graf pietonal. Implementarea Go rămâne unealtă de pregătire a datelor și referință pentru verificări. Valorile solare sunt comparate în teste cu referințe SPA/pvlib; pvlib nu este o dependență mobilă.

Aplicația mobilă afișează harta pe tot ecranul, urmărește locația în prim-plan și cere doar destinația prin „Unde mergi?”. Stratul de umbre folosește ora selectată și zona vizibilă. Calculele funcționează fără rețea; harta de bază și căutarea adreselor pot necesita internet prin furnizorii nativi. Rezultatele lipsă nu sunt înlocuite cu date fictive. Testele verifică mecanismele software și datele reale incluse, nu demonstrează încă precizia în teren sau performanța pe telefon.

Prima versiune ar acoperi o zonă restrânsă din Constanța. Înălțimile lipsă ale clădirilor ar fi estimate sau introduse manual, cu sursa și incertitudinea marcate. Acoperirea locală a înălțimilor OpenStreetMap trebuie verificată înainte de alegerea zonei de studiu.

### Partea de cercetare
Am compara traseele recomandate cu cele mai scurte trasee și am verifica pe teren precizia umbrelor calculate. Principalele rezultate urmărite ar fi reducerea timpului petrecut în soare și creșterea duratei deplasării.

**Obiectiv:** un prototip funcțional, accesibil de pe telefon, care demonstrează că umbrele urbane pot fi folosite pentru optimizarea traseelor pietonale.
