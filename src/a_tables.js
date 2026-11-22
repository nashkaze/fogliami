'use strict';
/* =====================================================================
   FOGLIAMI — flora e fauna di Milano a 8 bit. Pagina unica, dati letti in diretta dalle fonti.
   Eccezioni: le tabelle botaniche (fioriture, allergeni, nomi comuni),
   compilate a mano e dichiarate come approssimazioni nella scheda Info,
   e i file in data/ (censimento degli alberi, conteggi GBIF per NIL).
   ===================================================================== */

const CFG = {
  ckan: 'https://dati.comune.milano.it',
  // Dataset del Comune (CKAN). Gli URL di download vengono risolti a runtime
  // con package_show; quelli qui sotto sono il ripiego se la risoluzione fallisce.
  pkg: {
    nil:      {id: 'ds964-nil-vigenti-pgt-2030', fmt: 'GeoJSON', local: 'data/nil.geojson', localFirst: true, url: '/dataset/e8e765fc-d882-40b8-95d8-16ff3d39eb7c/resource/9c4e0776-56fc-4f3d-8a90-f4992a3be426/download/ds964_nil_wm.geojson'},
    parchi:   {id: 'ds89_infogeo_parchi_giardini_localizzazione_', fmt: 'GeoJSON', local: 'data/parchi.json', localFirst: true, url: '/dataset/8920bbea-fe1a-4061-8c6e-0746d95316c1/resource/7cba11e7-c236-49a7-aef4-4db6329eec5d/download/parchi.geojson'},
    orti:     {id: 'ds2186-infogeo-orti-urbani-localizzazione', fmt: 'GeoJSON', local: 'data/orti.geojson', localFirst: true, url: '/dataset/8f85ebf9-73c7-45cc-a428-66d56b7b46a4/resource/3c052ee5-47d8-4902-b2be-85e053a4ed41/download/ds2186_aree_orti_comunali.geojson'},
    giardini: {id: 'ds2187-infogeo-giardini-condivisi-localizzazione', fmt: 'GeoJSON', local: 'data/giardini.geojson', localFirst: true, url: '/dataset/57c2441d-69f1-42b9-a83d-41d8b98ddcbd/resource/df9a8989-51e2-4927-aef3-0487a80dc75e/download/ds2187_giardini_condivisi.geojson'},
    monum:    {id: 'ds2489-gli-alberi-monumentali-nel-comune-di-milano', fmt: 'GeoJSON', local: 'data/monumentali.geojson', localFirst: true, url: '/dataset/4e405e99-895e-486c-be70-f8c759e47b31/resource/ea95b273-0a6d-444a-a1fb-b83eae24ce4d/download/alberi_monumentali_031123_final.geojson'}
  },
  // Risorse interrogate via DataStore (API SQL / search)
  rs: {
    pop:   '6fd7172e-4c9a-48ee-b866-2c74c401c214', // ds27 residenti per NIL, serie storica
    heat:  '347d0c56-7d28-44ec-960b-4c8c1641058d', // ds2811 esposizione al calore per NIL (SPOTTED, lug 2024)
    green: '2848da75-9ed1-4e6a-93b3-c899e1c19b71', // ds2813 indice di verde urbano per NIL (SPOTTED, lug 2024)
    tipo:  'bd55cd57-4dd7-4d72-b182-de4f4b7de8c6'  // ds339 aree verdi per tipologia e affidatario (2014)
  },
  // ALBERI. Stato al 16/11/2026: il dataset ds2484 risulta ritirato dal portale
  // (pagina 404, API 403). La pagina lo cerca solo se la copia nel sito non si carica.
  treesPkg: ['ds2484_infogeo_alberi_localizzazione', '609a5892-f5fa-4fa3-98e3-eab9ebeba5b8'],
  // Vecchio geoportale ArcGIS (livello "Alberi"): al 16/11/2026 il server non risponde.
  // Tentativo lasciato in catena perché costa poco. NON TESTATO: i campi sono dedotti a runtime.
  // Copia del censimento ufficiale (ds2484, aggiornato al 31/03/2024) pubblicata accanto alla pagina:
  // CSV ridotto alle colonne utili e compresso. Licenza CC BY 4.0, © Comune di Milano.
  treesRepo: {url: 'data/alberi.zip', n: 247779, date: '31/03/2024'},
  arcgisTrees: 'https://geoportale.comune.milano.it/arcgisportalh/rest/services/OperationalLayers/Patrimonio_Verde_Realtime/MapServer/1',
  // OpenStreetMap via Overpass (CORS aperto). NON TESTATO da questo ambiente di sviluppo.
  overpass: ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'],
  inat: 'https://api.inaturalist.org/v1/observations',
  gbif: 'https://api.gbif.org/v1/occurrence/search',
  wikiFauna: 'data/wiki_fauna.json', // lo stesso per le specie animali: tools/wiki_fauna.py
  wiki: 'data/wiki.json', // voce di Wikipedia, foto e licenza per specie: tools/wiki_species.py
  monumSchede: 'data/monumentali_schede.json', // schede dei 13 alberi monumentali, riassunte a mano dalle pagine del Comune (che bloccano i programmi automatici)
  gbifNilCounts: 'data/gbif_nil.json', // conteggi per NIL precalcolati con tools/gbif_nil_counts.py
  gbifInat: '50c9509d-22c7-4a22-a47d-8c48425ef4a7', // dataset iNaturalist dentro GBIF: escluso per non contare due volte
  gbifFauna: 'data/gbif_fauna.json', // eBird (via GBIF, l'API di eBird vuole una chiave personale non condivisibile) e atlanti: tools/gbif_fauna.py
  cartoKey: 'cb1_5agz_1_f1a0c909ef4a187a638aa616', // chiave gratuita CARTO Basemaps, vincolata al dominio nashkaze.github.io dal pannello CARTO
  center: [45.4642, 9.19],
  bbox: {s: 45.386, w: 9.04, n: 45.536, e: 9.28},
  smallPop: 1000
};

const PAL = {ink:'#1b1c2e',night:'#2a2d4a',slate:'#4a5273',fog:'#8b93b5',paper:'#f2ecd8',sand:'#e0d3a8',white:'#fffdf4',
  leaf1:'#1f5c3a',leaf2:'#3a8f4b',leaf3:'#7cc35a',lime:'#c4e86b',water:'#3f7fbf',sky:'#8fd0e8',sun:'#f6c644',
  orange:'#e8853a',red:'#c9413f',pink:'#f09ac0',violet:'#8f6ad0',brown:'#7a4b2b'};

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MESI3 = ['G','F','M','A','M','G','L','A','S','O','N','D'];

/* ---------------------------------------------------------------------
   FIORITURE — tabella compilata a mano, a livello di genere.
   Mesi indicativi per la Pianura Padana (±2-3 settimane secondo annata,
   esposizione e cultivar). v = fioritura vistosa (ornamentale);
   c = colore usato sulla mappa. Non deriva da un dataset: è
   un'approssimazione dichiarata, da sostituire con dati fenologici veri.
   --------------------------------------------------------------------- */
const FIORI = {
  Corylus:{m:[1,2,3],c:'#e6d36a'}, Alnus:{m:[2,3],c:'#b98a4a'}, Ulmus:{m:[2,3],c:'#b5553a'},
  Parrotia:{m:[2,3],c:'#c9413f',v:1}, Cupressus:{m:[2,3,4],c:'#d9c07a'}, Taxus:{m:[2,3,4],c:'#d9c07a'},
  Populus:{m:[3,4],c:'#c9a0a0'}, Salix:{m:[3,4],c:'#e6d36a'}, Acer:{m:[3,4],c:'#d8e36a'},
  Prunus:{m:[3,4],c:'#f7b6d2',v:1}, Magnolia:{m:[3,4],c:'#fbe3ee',v:1}, Pyrus:{m:[3,4],c:'#ffffff',v:1},
  Fraxinus:{m:[3,4],c:'#9c8a6a'}, Malus:{m:[4,5],c:'#f9c9d6',v:1}, Betula:{m:[4],c:'#d6c65a'},
  Carpinus:{m:[4],c:'#c9d36a'}, Ostrya:{m:[4],c:'#c9d36a'}, Celtis:{m:[4],c:'#b8d06a'}, Zelkova:{m:[4],c:'#b8d06a'},
  Platanus:{m:[4,5],c:'#c9b36a'}, Quercus:{m:[4,5],c:'#c9c95a'}, Fagus:{m:[4,5],c:'#c9c95a'},
  Cercis:{m:[4,5],c:'#d6409f',v:1}, Aesculus:{m:[4,5],c:'#fff3d6',v:1}, Paulownia:{m:[4,5],c:'#a98be0',v:1},
  Crataegus:{m:[4,5],c:'#ffffff',v:1}, Morus:{m:[4,5],c:'#c9d36a'}, Juglans:{m:[4,5],c:'#b8c05a'},
  Ginkgo:{m:[4,5],c:'#d6d66a'}, Liquidambar:{m:[4,5],c:'#c9d36a'}, Pinus:{m:[4,5],c:'#e0c860'},
  Picea:{m:[4,5],c:'#c96a5a'}, Wisteria:{m:[4,5],c:'#a98be0',v:1}, Sorbus:{m:[5],c:'#ffffff',v:1},
  Laburnum:{m:[5],c:'#f6c644',v:1}, Davidia:{m:[5],c:'#ffffff',v:1}, Robinia:{m:[5,6],c:'#ffffff',v:1},
  Liriodendron:{m:[5,6],c:'#f0c060',v:1}, Gleditsia:{m:[5,6],c:'#c9d36a'}, Olea:{m:[5,6],c:'#f2ecd8'},
  Melia:{m:[5,6],c:'#c9a8e8',v:1}, Tamarix:{m:[5,6],c:'#f09ac0',v:1}, Diospyros:{m:[5,6],c:'#f2ecd8'},
  Trachycarpus:{m:[5,6],c:'#f6d35a'}, Tilia:{m:[6,7],c:'#f0e070',v:1}, Catalpa:{m:[6,7],c:'#ffffff',v:1},
  Ligustrum:{m:[6,7],c:'#ffffff',v:1}, Ailanthus:{m:[6,7],c:'#d8d86a'}, Castanea:{m:[6,7],c:'#f0e0a0'},
  Koelreuteria:{m:[6,7],c:'#f6c644',v:1}, Albizia:{m:[6,7,8],c:'#f48fb1',v:1}, Styphnolobium:{m:[7,8],c:'#fff8dc',v:1},
  Sophora:{m:[7,8],c:'#fff8dc',v:1}, Lagerstroemia:{m:[7,8,9],c:'#e85aa0',v:1}, Hibiscus:{m:[7,8,9],c:'#e8a0d0',v:1},
  Cedrus:{m:[9,10],c:'#d9c07a'}, Eriobotrya:{m:[11,12],c:'#f2ecd8',v:1}
};
// Eccezioni a livello di specie (chiave in minuscolo, corrispondenza per prefisso)
const FIORI_SP = {
  'magnolia grandiflora':{m:[5,6,7],c:'#fffbe8',v:1}, 'fraxinus ornus':{m:[4,5],c:'#ffffff',v:1},
  'acer campestre':{m:[4,5],c:'#d8e36a'}, 'prunus cerasifera':{m:[3],c:'#f7b6d2',v:1},
  'prunus serrulata':{m:[4],c:'#f48fb1',v:1}, 'prunus laurocerasus':{m:[4,5],c:'#ffffff',v:1},
  'quercus ilex':{m:[5,6],c:'#c9c95a'}, 'tilia tomentosa':{m:[6,7],c:'#f0e070',v:1}
};

/* ---------------------------------------------------------------------
   ALLERGENI — potenziale allergenico del polline per genere.
   l: 3 alto, 2 medio, 1 basso; m: mesi di pollinazione indicativi.
   Sintesi a mano delle classi di allergenicità comunemente riportate nei
   calendari pollinici del Nord Italia: indicativa, non è un dato medico.
   --------------------------------------------------------------------- */
const ALLERG = {
  Betula:{l:3,m:[3,4,5]}, Corylus:{l:3,m:[1,2,3]}, Alnus:{l:3,m:[1,2,3]}, Carpinus:{l:3,m:[3,4,5]}, Ostrya:{l:3,m:[4,5]},
  Cupressus:{l:3,m:[1,2,3,4]}, Cupressocyparis:{l:3,m:[2,3,4]}, Chamaecyparis:{l:2,m:[3,4]}, Thuja:{l:2,m:[2,3,4]},
  Juniperus:{l:2,m:[2,3,4]}, Calocedrus:{l:2,m:[2,3]}, Cryptomeria:{l:3,m:[2,3]}, Taxus:{l:2,m:[2,3,4]},
  Olea:{l:3,m:[5,6]}, Platanus:{l:2,m:[4,5]}, Fraxinus:{l:2,m:[3,4,5]}, Quercus:{l:2,m:[4,5,6]}, Fagus:{l:2,m:[4,5]},
  Ligustrum:{l:2,m:[6,7]}, Morus:{l:2,m:[4,5]}, Broussonetia:{l:2,m:[4,5]},
  Populus:{l:1,m:[3,4]}, Salix:{l:1,m:[3,4]}, Ulmus:{l:1,m:[2,3]}, Acer:{l:1,m:[3,4]}, Tilia:{l:1,m:[6,7]},
  Castanea:{l:1,m:[6,7]}, Juglans:{l:1,m:[4,5]}, Pinus:{l:1,m:[4,5,6]}, Cedrus:{l:1,m:[9,10]}, Ailanthus:{l:1,m:[6,7]},
  Celtis:{l:1,m:[4]}, Zelkova:{l:1,m:[4]}, Liquidambar:{l:1,m:[4,5]}
};
const ALL_LBL = ['', 'basso', 'medio', 'alto'];
const ALL_COL = ['', PAL.sun, PAL.orange, PAL.red];

const NOMI = {Platanus:'Platano',Tilia:'Tiglio',Acer:'Acero',Celtis:'Bagolaro',Carpinus:'Carpino',Quercus:'Quercia',Prunus:'Ciliegio / pruno',
  Ulmus:'Olmo',Fraxinus:'Frassino',Populus:'Pioppo',Robinia:'Robinia',Aesculus:'Ippocastano',Pinus:'Pino',Cedrus:'Cedro',Betula:'Betulla',
  Magnolia:'Magnolia',Ginkgo:'Ginkgo',Liquidambar:'Liquidambar',Sophora:'Sofora',Styphnolobium:'Sofora',Morus:'Gelso',Pyrus:'Pero',Malus:'Melo',
  Liriodendron:'Albero dei tulipani',Gleditsia:'Spino di Giuda',Cercis:'Albero di Giuda',Lagerstroemia:'Lagerstroemia',Cupressus:'Cipresso',
  Taxus:'Tasso',Alnus:'Ontano',Corylus:'Nocciolo',Salix:'Salice',Fagus:'Faggio',Juglans:'Noce',Ailanthus:'Ailanto',Catalpa:'Catalpa',
  Koelreuteria:'Koelreuteria',Ligustrum:'Ligustro',Paulownia:'Paulonia',Zelkova:'Zelkova',Ostrya:'Carpino nero',Olea:'Olivo',Picea:'Abete rosso',
  Abies:'Abete',Albizia:'Albizia',Crataegus:'Biancospino',Hibiscus:'Ibisco',Parrotia:'Parrotia',Castanea:'Castagno',Wisteria:'Glicine',
  Thuja:'Tuia',Sequoia:'Sequoia',Metasequoia:'Metasequoia',Taxodium:'Cipresso calvo',Melia:'Albero dei rosari',Eriobotrya:'Nespolo del Giappone',
  Diospyros:'Cachi',Ficus:'Fico',Laurus:'Alloro',Ilex:'Agrifoglio',Sorbus:'Sorbo',Trachycarpus:'Palma di Fortune',Broussonetia:'Gelso da carta'};

const GRUPPI = {Aves:'uccelli',Insecta:'insetti',Mammalia:'mammiferi',Reptilia:'rettili',Amphibia:'rettili',altro:'altro'};
const GR_LBL = {uccelli:'Uccelli',insetti:'Insetti',mammiferi:'Mammiferi',rettili:'Rettili e anfibi',altro:'Altri animali'};
const GR_COL = {uccelli:PAL.water,insetti:PAL.orange,mammiferi:PAL.brown,rettili:PAL.leaf2,altro:PAL.violet};
