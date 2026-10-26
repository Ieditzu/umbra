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

Datele incluse acoperă acum Constanța, Mamaia și Palazu Mare, într-un dreptunghi cu o marjă în jurul orașului. Setul OSM are 51.428 de contururi de clădiri și 50.071 de noduri pietonale și este păstrat comprimat în proiect și încărcat de serverul de pe PC. Înălțimile lipsă rămân necunoscute; umbrele sunt calculate din înălțimi etichetate sau estimări explicite bazate pe etaje. Straturile oferă hartă, satelit și clădiri 3D. Pe iOS, vederea Hartă desenează local contururile OSM cu MapLibre și un fundal gratuit OpenFreeMap; Satelit rămâne Apple Maps, iar Android păstrează Google Maps. Clădirile fără înălțime au un volum orientativ de 6 m exclusiv vizual, exclus din calculele umbrelor. Clădirile 3D afișate de Apple/Google nu furnizează automat înălțimi motorului OSM.

### Partea de cercetare
Am compara traseele recomandate cu cele mai scurte trasee și am verifica pe teren precizia umbrelor calculate. Principalele rezultate urmărite ar fi reducerea timpului petrecut în soare și creșterea duratei deplasării.

**Obiectiv:** un prototip funcțional, accesibil de pe telefon, care demonstrează că umbrele urbane pot fi folosite pentru optimizarea traseelor pietonale.


## Arhitectura curentă pentru testare

Calculele rulează pe PC: serverul Node încarcă datele pentru Constanța în worker threads și livrează traseele, umbrele și geometria clădirilor. Telefonul afișează harta și citește GPS-ul/busola. Comanda `npm --prefix mobile start -- --clear` pornește serverul și Expo; aplicația găsește automat API-ul prin conexiunea Expo. PC-ul trebuie să rămână pornit. Coordonatele, ora și zona vizibilă sunt trimise pentru calcul fără salvare pe disc. Randarea 3D rămâne pe telefon; performanța pe dispozitive reale necesită măsurare.
