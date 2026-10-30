from docx import Document
p=Document('docs/paper/umbra-lucrare.docx')
for para in p.paragraphs:
 t=para.text
 if t.startswith('În zilele caniculare'):
  para.runs[0].text='Proiectul a pornit de la detectarea unei persoane ascunse după colț, prin umbra vizibilă unei camere. Am extins folosirea geometriei umbrelor către trasee pietonale: Umbra compară rute după timpul și expunerea estimate. Serverul calculează poziția Soarelui, umbrele și traseele; telefonul afișează harta și poziția GPS. Folosim clădiri și drumuri OpenStreetMap (OSM) [1] și ecuațiile NOAA [2].'
 if t.startswith('Aplicația. Interfața'):
  for run in para.runs:
   run.text=run.text.replace('De aceea, fiecare înălțime măsurată transformă porțiuni necunoscute ale traseelor în porțiuni cu rezultat cert.', 'Înălțimile confirmate pot înlocui datele existente în calculul umbrelor și al traseelor; estimările păstrează incertitudinea.')
 if t.startswith('Concluzii:'):
  for run in para.runs:
   run.text=run.text.replace('Continuăm cu măsurători pe teren față de înălțimi de referință (telemetru și dronă), cu modul „Măsoară clădirea” în aplicație și cu o bază de date comună a înălțimilor măsurate de utilizatori.', 'Aplicația include modul „Măsoară clădirea” și o bază comună opțională; precizia metodei se verifică prin măsurători de teren comparate cu referințe independente.')
p.save('work/evolutie-umbra/umbra-lucrare-actualizata.docx')
