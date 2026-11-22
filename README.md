# FogliaMI

Flora e fauna di Milano a 8 bit: https://nashkaze.github.io/fogliami/

Mappa interattiva di flora e fauna di Milano in stile pixel art anni '90. Un'unica pagina HTML che legge i dati in diretta dalle fonti aperte. Fanno eccezione le tabelle botaniche scritte a mano (fioriture, allergeni, nomi comuni) e i file in `data/` (censimento degli alberi, copie dei livelli del Comune, schede delle specie, fauna e conteggi da GBIF).

## Struttura

| File | Contenuto |
|---|---|
| `src/a_tables.js` | Configurazione (URL delle fonti, chiave CARTO), palette, tabelle di fioritura e allergeni, nomi comuni |
| `src/b_sprites.js` | Sprite pixel art generati da codice, animazione della schermata di caricamento |
| `src/c_core.js` | Utilità, lettura ZIP/CSV/GeoJSON a flusso, mappa di base, livello sprite su canvas, NIL, archivio alberi e catena delle fonti |
| `src/d_app.js` | Disegno di alberi e fauna, popup, iNaturalist/GBIF/eBird, livelli vettoriali del Comune, lettura del KML dei glicini (non collegata al menu: in attesa del permesso dell'autore) |
| `src/e_ui.js` | Metriche per NIL, coropletica, classifica, incroci, pannello, geolocalizzazione, avvio |
| `src/style.css`, `src/body.html` | Stile e struttura della pagina |
| `build.py` | Concatena tutto in `index.html` |
| `data/nil.geojson` | Copia dei confini dei NIL (ds964, PGT 2030, fermi al 2020). È la prima scelta; il portale è il ripiego |
| `data/parchi.json` | Copia dei parchi e giardini (ds89, versione del 06/05/2024) con le sole colonne usate e coordinate al metro: 1,1 MB, 180 KB compressi, contro 5 MB non compressi dal portale. È la prima scelta; il portale è il ripiego. Da rigenerare se il Comune aggiorna il dataset |
| `data/gbif_fauna.json` | Punti di fauna da GBIF: fino a 3.000 osservazioni eBird degli ultimi 3 anni (dataset EOD) e 600 per ciascuno dei due maggiori atlanti, con nomi italiani da iNaturalist. 53 KB compressi contro 1,5 MB per ogni 300 record chiesti dal vivo (GBIF non comprime). Generato da `tools/gbif_fauna.py` |
| `data/gbif_nil.json` | Conteggi GBIF delle occorrenze animali per NIL, generati da `tools/gbif_nil_counts.py` |
| `tools/gbif_nil_counts.py` | Rigenera `data/gbif_nil.json` (88 richieste in sequenza a GBIF, circa due minuti): da rilanciare ogni tanto |
| `data/wiki.json` | Per ogni specie (o genere) del censimento: voce di Wikipedia (it, altrimenti en), prima frase, foto da Wikimedia Commons con autore e licenza. Generato da `tools/wiki_species.py` (circa 15 minuti); copertura: 88,7% degli alberi con la scheda della specie, 11% del genere, 99,6% con foto |
| `data/wiki_fauna.json` | Lo stesso per 542 specie animali (eBird, atlanti e le 500 più osservate su iNaturalist a Milano): foto di Commons usata solo se l'osservazione non ne ha una. Generato da `tools/wiki_fauna.py` (circa 25 minuti) |
| `data/monumentali_schede.json` | Schede dei 13 alberi monumentali, chiavate sull'ID del dataset ds2489: nome proprio, storia in 2-3 righe, età, fauna, stato di salute, link aggiornato alla pagina del Comune, foto. Compilato a mano dalle pagine del Comune (aggiornate al 16/06/2026), che bloccano i programmi automatici: va rivisto ogni tanto. Foto da Wikimedia Commons per 7 alberi (campo `prob` = attribuzione probabile); per gli altri il popup usa la foto della specie da `wiki.json` |
| `tools/wiki_species.py` | Rigenera `data/wiki.json`, una richiesta al secondo |
| `tools/copie_comune.py` | Rigenera le copie dei dati del Comune: `parchi.json`, `nil.geojson`, `orti.geojson`, `giardini.geojson`, `monumentali.geojson`. La pagina le legge per prime, con il portale come ripiego: il portale a volte li serve senza CORS, a volte accetta la connessione e poi non risponde |
| `.github/workflows/aggiorna-dati.yml` | Aggiornamento automatico: il primo di ogni mese esegue `gbif_nil_counts`, `gbif_fauna` e `copie_comune`; `wiki_species` e `wiki_fauna` a gennaio, aprile, luglio e ottobre. Salva i file cambiati e il sito si ripubblica. Avvio manuale da Actions → Aggiorna i dati |
| `data/alberi.zip` | Censimento degli alberi del Comune (ds2484, 31/03/2024, 247.779 alberi), ridotto alle colonne usate e compresso (2,6 MB) |

Si modifica `src/`, poi si rigenera:

```
python3 build.py          # scrive index.html
python3 build.py v9       # scrive fogliami-v9.html (copia di lavoro, ignorata da git)
```

Dipendenze esterne caricate da CDN: Leaflet 1.9.4 (con hash di integrità) e il font Press Start 2P.

## Fonti

| Fonte | Stato al 17/11/2026 |
|---|---|
| Comune di Milano: NIL, residenti per NIL (ds27, via SQL sul DataStore), parchi e giardini, orti urbani, giardini condivisi, alberi monumentali, indici di calore e verde per NIL (ds2811, ds2813), aree verdi per tipologia 2014 (ds339) | Il 22/11/2026 il portale accetta le connessioni e non risponde, anche da Milano. La pagina parte lo stesso dalle copie in `data/`; residenti, indici e aree per tipologia non hanno copia e in quei casi mancano |
| Comune di Milano: alberi (ds2484) | **Ritirato dal portale** (pagina 404, API 403). La pagina usa la copia in `data/alberi.zip` e lo cerca solo se questa non si carica: se torna pubblico va aggiornata la copia |
| Vecchio geoportale ArcGIS (livello Alberi) | Server non raggiungibile. Ancora in catena: candidato alla rimozione |
| OpenStreetMap via Overpass | Ripiego per gli alberi, mai provato dal vivo |
| iNaturalist, GBIF | Formato verificato su risposte reali, flusso completo non provato dal vivo |
| GBIF, conteggi per NIL | Precalcolati in `data/gbif_nil.json`: chiesti dal vivo (88 richieste a visita) GBIF rispondeva 429 e bloccava anche i punti |
| eBird | Via GBIF (dataset EOD) in `data/gbif_fauna.json`: l'API di eBird vuole una chiave personale che i termini vietano di condividere |
| CARTO Basemaps | Da fine agosto 2026 richiede una chiave. Funziona con la chiave in `a_tables.js` |
| Pollini, Landsat | Sezioni predisposte, nessuna fonte integrata |

Catena degli alberi all'avvio: copia nel repository (`data/alberi.zip`, con un secondo tentativo) → file salvato nel browser (IndexedDB) → portale del Comune → geoportale → OpenStreetMap. Un file diverso si può sempre caricare a mano dal pannello Livelli.

## Problemi aperti e prossimi passi

1. **Lentezza al caricamento.** Ipotesi da verificare: la schermata aspetta gli alberi fino a 14 s e le tre pagine iNaturalist (con pausa di 1 s tra l'una e l'altra). Idee: aprire la mappa appena pronti NIL e parchi, togliere il geoportale dalla catena, una sola pagina iNaturalist all'avvio.
2. **Alberi senza caricamento a mano.** Fatto: `data/alberi.zip`, ricavato da `ds2484_alberi_20240331.geojson` (colonne lon, lat, genere, specie, varieta, h_m, diam_tronc, diam_chiom, localita, anno di impianto; coordinate a 6 decimali).
3. **Chiave CARTO pubblica.** Vincolata al dominio `nashkaze.github.io` (verificato: 200 da quel dominio, 403 da altri). Il campo nel pannello è stato tolto. Aprendo `index.html` come file locale la mappa di base non compare.
4. **Varianti CARTO.** La pagina usa `light_nolabels` e `light_only_labels`, non documentate con il nuovo schema a chiave. Se mancano, ripiega da sola su `light_all`.
5. **Zoom massimo.** La mappa arriva al livello 21; i tasselli si fermano al 18 e oltre vengono ingranditi. Etichette fino al 19. Sprite degli alberi: 48 px al 20, 64 px al 21.
6. **Geolocalizzazione.** Funziona solo in https (GitHub Pages). Da provare su telefono vero.
6b. **iPhone, barra di Safari.** La pagina è alta 120px più dello schermo: Safari disegna sotto la sua barra galleggiante solo il contenuto che sporge oltre il fondo, mentre gli elementi fissi vengono tagliati (verificato con varianti di prova su iOS, 20/11/2026). Scorrimento e zoom della pagina sono bloccati; gli elementi in basso sono rialzati di 120px. Tutto dentro `@supports (-webkit-touch-callout:none)`.
7. **Icone.** I glicini seguono la scala degli alberi. Orti, giardini condivisi e monumentali sono ancora più grandi: decidere se allinearli.
8. **Tabelle botaniche.** Fioriture e allergeni sono approssimazioni scritte a mano per genere, senza fonte verificata.

## Crediti e licenze

Dati © Comune di Milano (CC BY 4.0), iNaturalist e GBIF (licenza per record), OpenStreetMap contributors (ODbL), tasselli © CARTO. Leaflet (BSD-2), Press Start 2P (SIL OFL). Sprite originali generati dal codice.
