# UMBRA SmartRoute

UMBRA SmartRoute este o aplicație web care găsește traseul pietonal cu cea mai mică expunere la soare între două puncte, în funcție de data și ora plecării.

### Cum funcționează
- Preia străzile și contururile clădirilor din OpenStreetMap.
- Folosește înălțimile clădirilor și poziția Soarelui pentru a calcula umbrele.
- Estimează ce porțiuni ale traseelor sunt umbrite la momentul parcurgerii lor.
- Compară traseul cel mai rapid cu cel mai umbrit și afișează distanța, durata și expunerea estimată la soare.

### Scop
Reducerea expunerii pietonilor la soare, în special vara, când temperaturile sunt ridicate.

### Implementare
Aplicația ar fi realizată în Python, folosind OSMnx pentru rețeaua pietonală, pvlib pentru poziția Soarelui și un algoritm de optimizare a traseelor.

Prima versiune ar acoperi o zonă restrânsă din Constanța. Înălțimile lipsă ale clădirilor ar fi estimate sau introduse manual.

### Partea de cercetare
Am compara traseele recomandate cu cele mai scurte trasee și am verifica pe teren precizia umbrelor calculate. Principalele rezultate urmărite ar fi reducerea timpului petrecut în soare și creșterea duratei deplasării.

**Obiectiv:** un prototip funcțional, accesibil de pe telefon, care demonstrează că umbrele urbane pot fi folosite pentru optimizarea traseelor pietonale.