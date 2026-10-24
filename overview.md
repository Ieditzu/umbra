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
Interfața mobilă este realizată în React Native, cu Expo și TypeScript. Motorul de calcul este planificat separat, în Python, folosind OSMnx pentru rețeaua pietonală, pvlib pentru poziția Soarelui și un algoritm de optimizare a traseelor.

Prima implementare mobilă include harta nativă, alegerea punctelor, localizarea la cerere, căutarea adreselor, data/ora plecării și preferința de ocol. Clientul are un contract pentru serviciul de calcul, dar motorul de trasee și umbre nu este încă implementat. Nu se afișează trasee sau rezultate fictive în lipsa lui.

Prima versiune ar acoperi o zonă restrânsă din Constanța. Înălțimile lipsă ale clădirilor ar fi estimate sau introduse manual, cu sursa și incertitudinea marcate. Acoperirea locală a înălțimilor OpenStreetMap trebuie verificată înainte de alegerea zonei de studiu.

### Partea de cercetare
Am compara traseele recomandate cu cele mai scurte trasee și am verifica pe teren precizia umbrelor calculate. Principalele rezultate urmărite ar fi reducerea timpului petrecut în soare și creșterea duratei deplasării.

**Obiectiv:** un prototip funcțional, accesibil de pe telefon, care demonstrează că umbrele urbane pot fi folosite pentru optimizarea traseelor pietonale.
