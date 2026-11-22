/* =====================================================================
   STATO DELL'INTERFACCIA
   ===================================================================== */
const ST = {mode: 'none', month: new Date().getMonth() + 1, showyOnly: false, monthOnly: false, fGenus: '', fSpecies: '',
  metric: 'treesCap', choro: null, exSmall: true, on: {alberi: true, monum: true, parchi: true, orti: true, giardini: true, fauna: true, nil: true, glicini: true, nomi: true}};
let treeLayer, faunaLayer;
let spMeta = [], spNorm = [], spHi = [], spLev = new Uint8Array(0);

function metaOf(si) {
  let m = spMeta[si];
  if (!m) {
    const name = T.species[si], genus = T.genera[T.spGenus[si]], low = name.toLowerCase().replace(/^(\S+) x /, '$1 ');
    let fl = null; for (const k in FIORI_SP) if (low.startsWith(k)) { fl = FIORI_SP[k]; break; }
    m = spMeta[si] = {genus, fl: fl || FIORI[genus] || null, al: ALLERG[genus] || null, col: genusColor(genus)};
  }
  return m;
}
function recomputeStates() {
  const ns = T.species.length, stt = new Uint8Array(ns), mode = ST.mode, mo = ST.month;
  const gi = ST.fGenus ? T.gIdx.get(ST.fGenus) : -1, fs = ST.fSpecies ? T.spIdx.get(ST.fSpecies) : -1;
  spNorm = new Array(ns); spHi = new Array(ns); spLev = new Uint8Array(ns);
  for (let si = 0; si < ns; si++) {
    const m = metaOf(si); let s = 2;
    if (gi >= 0 && T.spGenus[si] !== gi) s = 0; else if (fs >= 0 && si !== fs) s = 0;
    else if (mode === 'fiori') s = (m.fl && m.fl.m.indexOf(mo) >= 0 && (!ST.showyOnly || m.fl.v)) ? 3 : 1;
    else if (mode === 'allergie') s = (m.al && (!ST.monthOnly || m.al.m.indexOf(mo) >= 0)) ? 3 : 1;
    stt[si] = s; spLev[si] = (s === 3 && mode === 'allergie') ? m.al.l : 0;
  }
  for (let i = 0; i < T.n; i++) T.st[i] = stt[T.sp[i]];
}
function sprFor(si, hi) {
  const arr = hi ? spHi : spNorm; let s = arr[si];
  if (!s) {
    const m = metaOf(si);
    if (!hi) s = treeSprite(m.genus, 'n');
    else if (ST.mode === 'fiori') s = treeSprite(m.genus, 'bloom', m.fl.c, !!m.fl.v);
    else s = treeSprite(m.genus, 'halo', ALL_COL[m.al.l]);
    arr[si] = s;
  }
  return s;
}
function hiColor(si) { const m = metaOf(si); return ST.mode === 'fiori' ? m.fl.c : ALL_COL[m.al.l]; }

/* ---------------------------------------------------------------------
   Disegno degli alberi: blocchi aggregati da lontano, pixel a media
   distanza, sprite da vicino. Tutto su un solo canvas.
   --------------------------------------------------------------------- */
const RAMP_G = ['#c4e86b', '#7cc35a', '#3a8f4b', '#1f5c3a', '#123b3a'];
const RAMP_F = ['#fbd0e4', '#f09ac0', '#e85aa0', '#b03a86', '#6a2466'];
const RAMP_A = ['#f6c644', '#f0a23e', '#e8853a', '#c9413f', '#7a1f2b'];
function drawTrees(g, v) {
  const n = T.n; if (!n || !ST.on.alberi) return;
  const sc = v.sc, bx = v.bx, by = v.by, W = v.w, H = v.h, X = T.x, Y = T.y, S = T.st, modeHi = ST.mode === 'fiori' || ST.mode === 'allergie';
  if (v.z < 15) {
    if (CH.key) return; // sotto la coropletica i blocchi coprirebbero i colori dei quartieri
    const cp = v.z <= 11 ? 6 : v.z <= 13 ? 8 : 10, ax = ((bx % cp) + cp) % cp - cp, ay = ((by % cp) + cp) % cp - cp;
    const cols = Math.ceil((W - ax) / cp) + 1, rows = Math.ceil((H - ay) / cp) + 1, cnt = new Uint32Array(cols * rows), hl = new Uint32Array(cols * rows), h3 = new Uint32Array(cols * rows), h2 = new Uint32Array(cols * rows), al = ST.mode === 'allergie';
    for (let i = 0; i < n; i++) {
      const s = S[i]; if (!s) continue;
      const px = X[i] * sc + bx; if (px < 0 || px >= W) continue; const py = Y[i] * sc + by; if (py < 0 || py >= H) continue;
      const c = ((px - ax) / cp | 0) + ((py - ay) / cp | 0) * cols; cnt[c]++; if (s === 3) { hl[c]++; if (al) { const lv = spLev[T.sp[i]]; if (lv === 3) h3[c]++; else if (lv === 2) h2[c]++; } }
    }
    let mx = 1, mh = 1; for (let c = 0; c < cnt.length; c++) { if (cnt[c] > mx) mx = cnt[c]; if (hl[c] > mh) mh = hl[c]; }
    const lm = Math.log(1 + mx), lh = Math.log(1 + mh), ramp = ST.mode === 'fiori' ? RAMP_F : RAMP_A;
    for (let r = 0; r < rows; r++) for (let cI = 0; cI < cols; cI++) {
      const c = cI + r * cols, k = cnt[c]; if (!k) continue;
      const x = ax + cI * cp, y = ay + r * cp;
      if (modeHi) {
        if (hl[c]) { g.fillStyle = al ? (h3[c] / k > 0.12 ? ALL_COL[3] : (h3[c] + h2[c]) / k > 0.3 ? ALL_COL[2] : ALL_COL[1]) : ramp[Math.min(4, Math.log(1 + hl[c]) / lh * 5 | 0)]; g.fillRect(x, y, cp - 1, cp - 1); }
        else { g.fillStyle = 'rgba(74,82,115,.22)'; g.fillRect(x + 1, y + 1, cp - 3, cp - 3); }
      } else { g.fillStyle = RAMP_G[Math.min(4, Math.log(1 + k) / lm * 5 | 0)]; g.fillRect(x, y, cp - 1, cp - 1); }
    }
    return;
  }
  // celle della griglia visibili
  const pad = 40, cx0 = Math.floor((-pad - bx) / sc / CELL), cx1 = Math.floor((W + pad - bx) / sc / CELL), cy0 = Math.floor((-pad - by) / sc / CELL), cy1 = Math.floor((H + pad - by) / sc / CELL);
  const z = v.z, size = z >= 21 ? 64 : z >= 20 ? 48 : z >= 19 ? 32 : z === 18 ? 24 : 16, vis = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const cell = T.grid.get((cx + 2048) * 4096 + (cy + 2048)); if (!cell) continue;
    for (let k = 0; k < cell.length; k++) if (S[cell[k]]) vis.push(cell[k]);
  }
  if (z < 17) {
    const d = z === 15 ? 3 : 5, hd = d >> 1;
    for (let k = 0; k < vis.length; k++) {
      const i = vis[k], s = S[i], px = Math.round(X[i] * sc + bx), py = Math.round(Y[i] * sc + by), si = T.sp[i];
      if (s === 1) { g.fillStyle = 'rgba(74,82,115,.35)'; g.fillRect(px - 1, py - 1, 2, 2); continue; }
      if (d === 5) { g.fillStyle = PAL.ink; g.fillRect(px - hd, py - hd, d + 1, d + 1); }
      g.fillStyle = s === 3 ? hiColor(si) : metaOf(si).col; g.fillRect(px - hd, py - hd, d, d);
    }
    return;
  }
  if (vis.length < 9000) vis.sort((a, b) => Y[a] - Y[b]);
  const hs = size / 2;
  for (let k = 0; k < vis.length; k++) {
    const i = vis[k], s = S[i], px = Math.round(X[i] * sc + bx), py = Math.round(Y[i] * sc + by), si = T.sp[i];
    if (s === 1) { g.globalAlpha = 0.25; g.drawImage(sprFor(si, false), px - hs, py - size + 3, size, size); g.globalAlpha = 1; continue; }
    const im = sprFor(si, s === 3), f = im.width / 16;
    g.drawImage(im, px - hs * f, py - (size - 3) * f - (f > 1 ? size / 16 : 0), size * f, size * f);
  }
}
function hitTree(p, v) {
  if (!ST.on.alberi || v.z < 15 || !T.n) return -1;
  const sc = v.sc, r = v.z >= 17 ? (v.z >= 21 ? 40 : v.z >= 20 ? 30 : v.z >= 19 ? 20 : 14) : 9, yo = v.z >= 17 ? (v.z >= 21 ? 24 : v.z >= 20 ? 18 : v.z >= 19 ? 12 : 7) : 0;
  const cx = Math.floor((p.x - v.bx) / sc / CELL), cy = Math.floor((p.y - v.by) / sc / CELL); let best = -1, bd = r * r;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cell = T.grid.get((cx + dx + 2048) * 4096 + (cy + dy + 2048)); if (!cell) continue;
    for (const i of cell) { if (!T.st[i]) continue; const ex = T.x[i] * sc + v.bx - p.x, ey = T.y[i] * sc + v.by - yo - p.y, d = ex * ex + ey * ey; if (d < bd) { bd = d; best = i; } }
  }
  return best;
}
/* Wikipedia: scheda per specie (o per genere) preparata da tools/wiki_species.py */
let WIKI = null, WIKIF = null;
function wikiFaunaOf(sci) { if (!WIKIF || !sci) return null; const p = String(sci).split(/\s+/); return WIKIF[p.slice(0, 2).join(' ')] || WIKIF[p[0]] || null; }
function wikiOf(si) { if (!WIKI) return null; const full = T.species[si]; return WIKI[full] || WIKI[full.split(' ')[0]] || null; }
function wikiPhoto(w) {
  if (!w || !w.i) return '';
  return '<figure class="wk"><a href="' + esc(w.f) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(w.i) + '" alt="' + esc(w.t) + '"></a>' +
    '<figcaption>Foto: ' + esc(w.a) + ' · ' + esc(w.l) + ' · Wikimedia Commons' + (w.liv === 'genere' ? ' · esemplare del genere' : '') + '</figcaption></figure>';
}
function wikiText(w) {
  if (!w) return '';
  return '<p class="wx">' + (w.x ? esc(w.x) + ' ' : '') + '<a href="' + esc(w.u) + '" target="_blank" rel="noopener">' + (w.lang === 'en' ? 'Leggi su Wikipedia (in inglese)' : 'Leggi su Wikipedia') + '</a>' +
    (w.liv === 'genere' ? ' <small>(voce sul genere ' + esc(w.t) + ')</small>' : '') + '</p>';
}
function mesiTxt(m) { return m.map(x => MESI[x - 1].toLowerCase()).join(', '); }
function treePopup(i) {
  const si = T.sp[i], m = metaOf(si), g = m.genus, nome = NOMI[g], o = NIL.byId[T.nil[i]], vr = T.vars[T.vr[i]], pl = T.places[T.pl[i]];
  const rows = [];
  if (T.h[i]) rows.push(['Altezza', fmt(T.h[i], 1) + ' m']);
  if (T.dt[i]) rows.push(['Diametro tronco', fmt(T.dt[i], 0) + ' cm']);
  if (T.dc[i]) rows.push(['Diametro chioma', fmt(T.dc[i], 1) + ' m']);
  if (T.yr[i]) rows.push(['In elenco dal', T.yr[i]]);
  if (pl) rows.push(['Località', esc(pl)]);
  if (o) rows.push(['Quartiere', esc(o.name)]);
  if (m.fl) rows.push(['Fioritura', mesiTxt(m.fl.m) + (m.fl.v ? '' : ' (poco vistosa)')]);
  if (m.al) rows.push(['Polline', 'potenziale ' + ALL_LBL[m.al.l] + ', ' + mesiTxt(m.al.m)]);
  const w = wikiOf(si);
  return '<div class="pop"><h3>' + esc((nome || g).toUpperCase()) + '</h3><div class="sci">' + esc(T.species[si]) + (vr ? ' ‘' + esc(vr) + '’' : '') + '</div>' +
    (m.fl && m.fl.m.indexOf(ST.month) >= 0 ? '<span class="tag fl">IN FIORE A ' + MESI[ST.month - 1].toUpperCase() + '</span>' : '') +
    (m.al ? '<span class="tag a' + m.al.l + '">POLLINE ' + ALL_LBL[m.al.l].toUpperCase() + '</span>' : '') +
    wikiPhoto(w) + '<table>' + rows.map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</table>' + wikiText(w) +
    '<small>Fonte: ' + (T.source === 'osm' ? 'OpenStreetMap' : 'Comune di Milano') + '. Fioritura e polline: stime per genere.' + (w ? ' Testo e foto da Wikipedia.' : '') + '</small></div>';
}

/* =====================================================================
   FAUNA
   ===================================================================== */
const FA = {list: [], seen: new Set(), groups: {uccelli: true, insetti: true, mammiferi: true, rettili: true, altro: true}, srcOn: {inat: true, gbif: true, ebird: true},
  inatPage: 0, inatTotal: null, counts: {inat: 0, gbif: 0, ebird: 0}, gbifNil: false, busy: false};
function addFauna(o) {
  const key = o.src + ':' + o.id; if (FA.seen.has(key) || !isFinite(o.lat) || !isFinite(o.lon)) return;
  const nid = NIL.list.length ? nilOf(o.lon, o.lat) : 0; if (NIL.list.length && !nid) return; // fuori dal Comune
  FA.seen.add(key); o.nil = nid; o.x = mercX(o.lon) - X0; o.y = mercY(o.lat) - Y0;
  if (nid) NIL.byId[nid].fauna++;
  FA.list.push(o); FA.counts[o.src]++;
}
function faunaVisible(o) { return FA.groups[o.grp] && FA.srcOn[o.src]; }
function drawFauna(g, v) {
  if (!ST.on.fauna) return; const L_ = FA.list, sc = v.sc;
  const size = v.z >= 17 ? 24 : 16, hs = size / 2;
  for (let k = 0; k < L_.length; k++) {
    const o = L_[k]; if (!faunaVisible(o)) continue;
    const px = Math.round(o.x * sc + v.bx), py = Math.round(o.y * sc + v.by); if (px < -20 || py < -20 || px > v.w + 20 || py > v.h + 20) continue;
    if (v.z < 14 || (ST.mode !== 'none' && ST.mode !== 'fauna')) { g.fillStyle = PAL.ink; g.fillRect(px - 2, py - 2, 5, 5); g.fillStyle = GR_COL[o.grp]; g.fillRect(px - 1, py - 1, 3, 3); }
    else g.drawImage(SPR[o.grp], px - hs, py - hs, size, size);
  }
}
function hitFauna(p, v) {
  if (!ST.on.fauna) return null; let best = null, bd = (v.z < 14 ? 8 : 13) ** 2;
  for (const o of FA.list) { if (!faunaVisible(o)) continue; const dx = o.x * v.sc + v.bx - p.x, dy = o.y * v.sc + v.by - p.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = o; } }
  return best;
}
function faunaPopup(o) {
  const srcL = {inat: 'iNaturalist', gbif: 'GBIF', ebird: 'eBird (via GBIF)'}[o.src], nil = NIL.byId[o.nil], w = wikiFaunaOf(o.sci);
  // la foto dell'osservatore, se c'è, resta la principale; altrimenti quella della voce di Wikipedia
  return '<div class="pop"><h3>' + esc((o.name || o.sci || 'Animale').toUpperCase()) + '</h3>' + (o.sci ? '<div class="sci">' + esc(o.sci) + '</div>' : '') +
    (o.img ? '<figure class="wk"><img loading="lazy" src="' + esc(o.img) + '" alt=""></figure>' : wikiPhoto(w)) +
    '<table><tr><td>Gruppo</td><td>' + GR_LBL[o.grp] + '</td></tr>' + (o.date ? '<tr><td>Data</td><td>' + esc(o.date) + '</td></tr>' : '') +
    (nil ? '<tr><td>Quartiere</td><td>' + esc(nil.name) + '</td></tr>' : '') + (o.who ? '<tr><td>Osservatore</td><td>' + esc(o.who) + '</td></tr>' : '') +
    (o.ds ? '<tr><td>Dataset</td><td>' + esc(o.ds) + '</td></tr>' : '') + '</table>' + wikiText(w) +
    '<small>' + srcL + (o.lic ? ' · licenza ' + esc(o.lic) : '') + (o.url ? ' · <a href="' + esc(o.url) + '" target="_blank" rel="noopener">scheda originale</a>' : '') +
    (w ? '. ' + (o.img ? 'Testo' : 'Testo e foto') + ' da Wikipedia.' : '') + '</small></div>';
}
const bboxNow = () => NIL.bbox || CFG.bbox;
async function loadInat(pages) {
  if (FA.busy) return; FA.busy = true;
  const b = bboxNow(); let got = 0;
  try {
    for (let k = 0; k < pages; k++) {
      const page = FA.inatPage + 1;
      const url = CFG.inat + '?nelat=' + b.n.toFixed(4) + '&nelng=' + b.e.toFixed(4) + '&swlat=' + b.s.toFixed(4) + '&swlng=' + b.w.toFixed(4) +
        '&iconic_taxa=Aves,Insecta,Mammalia,Reptilia,Amphibia,Arachnida,Mollusca,Actinopterygii&quality_grade=research&geoprivacy=open&per_page=200&page=' + page + '&order_by=observed_on&order=desc&locale=it';
      const js = await fetchJSON(url, {timeout: 45000});
      FA.inatPage = page; FA.inatTotal = js.total_results;
      for (const r of js.results || []) {
        if (r.obscured || !r.geojson || !r.taxon) continue;
        const ph = r.photos && r.photos[0], u = r.user || {};
        addFauna({src: 'inat', id: r.id, lon: +r.geojson.coordinates[0], lat: +r.geojson.coordinates[1], grp: GRUPPI[r.taxon.iconic_taxon_name] || 'altro',
          name: cap(r.taxon.preferred_common_name || ''), sci: r.taxon.name, date: r.observed_on, img: ph ? String(ph.url).replace('square', 'small') : '',
          url: r.uri, who: u.name || u.login || '', lic: (r.license_code || 'tutti i diritti riservati').toUpperCase()});
        got++;
      }
      faunaChanged();
      src('inat', 'iNaturalist', 'ok', fmt(FA.counts.inat) + ' osservazioni recenti caricate su ' + fmt(FA.inatTotal) + ' disponibili (grado ricerca, coordinate pubbliche).');
      if (!js.results || js.results.length < 200 || page * 200 >= 10000) break;
      if (k < pages - 1) await sleep(1100); // rispetto del limite consigliato: circa una richiesta al secondo
    }
  } catch (e) { src('inat', 'iNaturalist', FA.counts.inat ? 'part' : 'err', (FA.counts.inat ? fmt(FA.counts.inat) + ' osservazioni caricate, poi: ' : '') + esc(e.message)); }
  FA.busy = false; return got;
}
/* GBIF: prima chiedo quali dataset coprono Milano, poi leggo i maggiori escluso iNaturalist (già caricato) */
function gbifGeo() { const b = bboxNow(); return 'decimalLatitude=' + b.s.toFixed(4) + ',' + b.n.toFixed(4) + '&decimalLongitude=' + b.w.toFixed(4) + ',' + b.e.toFixed(4) + '&kingdomKey=1&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT'; }
/* Punti di eBird e dei maggiori dataset GBIF: copia compatta in data/gbif_fauna.json (tools/gbif_fauna.py).
   GBIF non comprime le risposte (300 record = 1,5 MB) e questi dataset si aggiornano solo periodicamente. */
async function loadGbif() {
  try {
    const j = await fetchJSON(CFG.gbifFauna, {timeout: 30000}), it = j.nomi_it || {}, ds = j.dataset || [], when = String(j.updated || '').split('-').reverse().join('/');
    for (const r of j.rec || []) {
      const [lon, lat, fonte, cls, nome, sci, data, key, who, lic, di] = r;
      addFauna({src: fonte === 'ebird' ? 'ebird' : 'gbif', id: key, lon, lat, grp: GRUPPI[cls] || 'altro', name: cap(it[sci] || nome || ''), sci, date: data, img: '',
        url: 'https://www.gbif.org/occurrence/' + key, who, ds: fonte === 'ebird' ? '' : (ds[di] || ''), lic});
    }
    faunaChanged();
    src('gbif', 'GBIF', 'ok', fmt(FA.counts.gbif) + ' occorrenze dagli atlanti degli uccelli e dai maggiori dataset su GBIF (' + fmt(j.totale_riquadro) + ' record animali nel riquadro di Milano). Raccolte il ' + esc(when) + '.');
    src('ebird', 'eBird (via GBIF)', FA.counts.ebird ? 'ok' : 'err', fmt(FA.counts.ebird) + ' osservazioni di uccelli degli ultimi anni dal dataset eBird pubblicato su GBIF, raccolte il ' + esc(when) + '.');
  } catch (e) { src('gbif', 'GBIF', 'err', esc(e.message)); src('ebird', 'eBird (via GBIF)', 'err', esc(e.message)); }
}
/* GBIF: conteggio delle occorrenze animali dentro ogni NIL. Calcolato in anticipo da tools/gbif_nil_counts.py
   e salvato in data/gbif_nil.json: chiederlo a GBIF a ogni visita voleva dire 88 richieste e un blocco (HTTP 429). */
async function loadGbifNilCounts() {
  src('gbifnil', 'GBIF, conteggi per quartiere', 'wait', 'Leggo i conteggi per quartiere…');
  try {
    if (!NIL.list.length) throw new Error('confini dei quartieri non disponibili');
    const js = await fetchJSON(CFG.gbifNilCounts, {timeout: 20000}), c = js.counts || {};
    let ok = 0, total = 0;
    NIL.list.forEach(o => { const v = c[o.id]; if (typeof v === 'number') { o.faunaTot = v; total += v; ok++; } });
    if (ok < NIL.list.length * 0.75) throw new Error('file incompleto (' + ok + ' quartieri su ' + NIL.list.length + ')');
    FA.gbifNil = true;
    src('gbifnil', 'GBIF, conteggi per quartiere', ok < NIL.list.length ? 'part' : 'ok', fmt(total) + ' occorrenze animali contate in ' + ok + ' NIL, iNaturalist ed eBird compresi. Conteggio del ' + esc(String(js.updated || '').split('-').reverse().join('/')) + '.');
  } catch (e) {
    NIL.list.forEach(o => { delete o.faunaTot; }); FA.gbifNil = false;
    src('gbifnil', 'GBIF, conteggi per quartiere', 'err', esc(e.message) + ': la statistica usa il campione di punti caricati.');
  }
  statsChanged();
}

/* =====================================================================
   CLIC SULLA MAPPA: prima gli sprite, poi i poligoni
   ===================================================================== */
function hitAndPopup(p, latlng, fallback) {
  const v = viewNow(), o = hitFauna(p, v);
  if (o) { L.popup({maxWidth: 280}).setLatLng([o.lat, o.lon]).setContent(faunaPopup(o)).openOn(map); return true; }
  const i = hitTree(p, v);
  if (i >= 0) { L.popup({maxWidth: 300, offset: [0, v.z >= 21 ? -34 : v.z >= 20 ? -24 : v.z >= 17 ? -10 : 0]}).setLatLng([unY(T.y[i]), unX(T.x[i])]).setContent(treePopup(i)).openOn(map); return true; }
  if (fallback) fallback();
  return false;
}
/* Un tocco fuori da una scheda aperta serve a chiuderla: Leaflet la chiude prima che arrivi il clic, quindi se
   una scheda si è appena chiusa il clic su un quartiere o un parco non ne apre un'altra. Alberi e fauna sì. */
let _popClosedAt = 0, _panelClosedAt = 0;
function polyClick(html) { return e => {
  L.DomEvent.stop(e); if (performance.now() - _panelClosedAt < 400) return; const closing = performance.now() - _popClosedAt < 400;
  hitAndPopup(e.containerPoint, e.latlng, closing ? null : () => L.popup({maxWidth: 300}).setLatLng(e.latlng).setContent(typeof html === 'function' ? html(e) : html).openOn(map));
}; }

/* =====================================================================
   LIVELLI VETTORIALI DEL COMUNE
   ===================================================================== */
const LY = {};
async function ckanUrl(p) {
  try {
    const r = await fetchJSON(CFG.ckan + '/api/3/action/package_show?id=' + p.id, {timeout: 15000});
    const res = r.result.resources.find(x => String(x.format).toLowerCase() === p.fmt.toLowerCase());
    if (res) return {url: res.url, title: r.result.title, mod: (res.last_modified || r.result.metadata_modified || '').slice(0, 10)};
  } catch (e) {}
  return {url: CFG.ckan + p.url, title: p.id, mod: ''};
}
/* Livelli del Comune. Tutti hanno una copia nel sito (data/), rinnovata una volta al mese da tools/copie_comune.py.
   localFirst: la copia è la prima scelta e il portale il ripiego; altrimenti il contrario. La copia viene prima perché
   il portale a volte accetta la connessione e poi tace per minuti (22/11/2026), bloccando l'avvio della pagina. */
async function loadCkanGeo(key, label) {
  src(key, label, 'wait', 'Scarico…');
  const p = CFG.pkg[key];
  const portal = async () => {
    const u = await ckanUrl(p), gj = await fetchJSON(u.url, {timeout: 60000}); if (!gj.features) throw new Error('formato inatteso');
    return [gj, esc(u.title) + (u.mod ? ' · aggiornato al ' + u.mod.split('-').reverse().join('/') : '')];
  };
  const local = async () => {
    const gj = await retry(() => fetchJSON(p.local, {timeout: 30000})); if (!gj.features) throw new Error('formato inatteso');
    const v = gj._aggiornato || p.localDate || ''; return [gj, 'copia nel sito del dataset del Comune (' + esc(p.id) + (v ? ', versione del ' + esc(v.split('-').reverse().join('/')) : '') + ')'];
  };
  const order = !p.local ? [portal] : p.localFirst ? [local, portal] : [portal, local], errs = [];
  for (const fn of order) {
    try {
      const [gj, note] = await fn();
      src(key, label, 'ok', fmt(gj.features.length) + ' elementi · ' + note + (errs.length ? '. Prima fonte non leggibile: ' + errs.join('; ') : ''));
      return gj;
    } catch (e) { errs.push(esc(e.message)); }
  }
  src(key, label, 'err', errs.join('; ')); return null;
}
function nilPopup(o) {
  const km = o.area / 1e6, small = o.pop != null && o.pop < CFG.smallPop, fa = o.faunaTot != null ? o.faunaTot : o.fauna;
  const row = (a, b) => '<tr><td>' + a + '</td><td>' + b + '</td></tr>';
  let top = '';
  if (T.n && o.trees) { const c = new Map(); for (let i = 0; i < T.n; i++) if (T.nil[i] === o.id) c.set(T.g[i], (c.get(T.g[i]) || 0) + 1);
    top = [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([gi, k]) => esc(NOMI[T.genera[gi]] || T.genera[gi]) + ' ' + Math.round(k / o.trees * 100) + '%').join(', '); }
  return '<div class="pop"><h3>' + esc(o.name.toUpperCase()) + '</h3><table>' +
    row('Residenti', o.pop != null ? fmt(o.pop) + (o.popYear ? ' (' + o.popYear + ')' : '') : 'n.d.') + row('Superficie', fmt(km, 2) + ' km²') +
    row('Alberi censiti', T.n ? fmt(o.trees) : 'n.d.') + (T.n && o.pop && !small ? row('Alberi ogni 100 residenti', fmt(o.trees / o.pop * 100, 1)) : '') +
    (T.n ? row('Alberi per km²', fmt(o.trees / km)) : '') + (top ? row('Generi principali', top) : '') +
    row('Parchi e giardini', fmt(o.parkM2) + ' m²' + (o.pop && !small ? ' (' + fmt(o.parkM2 / o.pop, 1) + ' per residente)' : '')) +
    row('Fauna segnalata', fmt(fa) + (o.faunaTot != null ? ' (GBIF)' : ' (campione)')) +
    (o.heat != null ? row('Esposizione al calore', fmt(o.heat, 2)) : '') + (o.green != null ? row('Indice di verde', fmt(o.green, 1)) : '') + '</table>' +
    (small ? '<small>Meno di ' + fmt(CFG.smallPop) + ' residenti: i valori per abitante non sono significativi.</small>' : '') + '</div>';
}
function buildNilLayer() {
  LY.nil = L.geoJSON({type: 'FeatureCollection', features: NIL.list.map(o => o.f)}, {pane: 'vec', style: f => nilStyle(NIL.byId[+f.properties.ID_NIL]),
    onEachFeature: (f, l) => { const o = NIL.byId[+f.properties.ID_NIL]; o.layer = l; l.on('click', polyClick(() => nilPopup(o)));
      if (!L.Browser.mobile) l.bindTooltip(o.name, {sticky: true, className: 'nil-tip', direction: 'top', opacity: 1}); }});
}
function buildParks(gj) {
  for (const f of gj.features) { const c = geomCentroid(f.geometry); if (!c) continue; const id = nilOf(c[0], c[1]); if (id) { NIL.byId[id].parkM2 += +f.properties.AREA_MQ || 0; NIL.byId[id].parks++; } }
  LY.parchi = L.geoJSON(gj, {pane: 'vec', style: {color: PAL.leaf1, weight: 1, fillColor: PAL.leaf3, fillOpacity: 0.5},
    onEachFeature: (f, l) => l.on('click', polyClick(() => { const p = f.properties; return '<div class="pop"><h3>' + esc(String(p.PARCO || 'Area verde').toUpperCase()) + '</h3><table><tr><td>Superficie</td><td>' + fmt(+p.AREA_MQ) + ' m²</td></tr><tr><td>Perimetro</td><td>' + fmt(+p.PERIM_M) + ' m</td></tr><tr><td>Municipio</td><td>' + esc(p.ZONA) + '</td></tr></table><small>Fonte: Comune di Milano, parchi e giardini.</small></div>'; }))});
}
function buildPlots(key, gj, color, sprite, titolo) {
  const grp = L.layerGroup();
  L.geoJSON(gj, {pane: 'vec', style: {color: PAL.ink, weight: 1, fillColor: color, fillOpacity: 0.75}}).addTo(grp);
  for (const f of gj.features) {
    const c = geomCentroid(f.geometry); if (!c) continue; const p = f.properties, loc = p['località'] || p.localita || p[Object.keys(p).find(k => /^localit/i.test(k))] || '';
    L.marker([c[1], c[0]], {icon: sprIcon(sprite, 26)}).bindPopup('<div class="pop"><h3>' + titolo.toUpperCase() + '</h3><div>' + esc(titleCase(loc)) + '</div><table><tr><td>Superficie</td><td>' + fmt(+p.area_mq) + ' m²</td></tr><tr><td>Municipio</td><td>' + esc(p.municipio) + '</td></tr>' + (p.data_ini ? '<tr><td>Dal</td><td>' + esc(String(p.data_ini).slice(0, 4)) + '</td></tr>' : '') + '</table><small>Fonte: Comune di Milano.</small></div>').addTo(grp);
  }
  LY[key] = grp;
}
/* Alberi monumentali: dati dal dataset del Comune (ds2489), arricchiti dalle schede in data/monumentali_schede.json
   (nome, storia, età, fauna, stato di salute, link aggiornato, foto). Le schede si chiavano sull'ID del dataset;
   un albero senza scheda mostra solo i dati del dataset. Senza foto propria si usa quella della specie da wiki.json. */
let MONS = null;
function monumPhoto(s) {
  const f = s && s.foto;
  if (f) return '<figure class="wk"><a href="' + esc(f.f) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(f.i) + '" alt="' + esc(s.nome) + '"></a>' +
    '<figcaption>Foto: ' + esc(f.a) + ' · ' + esc(f.l) + ' · Wikimedia Commons' + (f.prob ? ' · attribuzione probabile' : '') + '</figcaption></figure>';
  const w = s && WIKI ? WIKI[s.wiki] || WIKI[s.wiki.split(' ')[0]] : null;
  if (!w || !w.i) return '';
  return '<figure class="wk"><a href="' + esc(w.f) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(w.i) + '" alt="' + esc(w.t) + '"></a>' +
    '<figcaption>Foto della specie, non di questo albero: ' + esc(w.a) + ' · ' + esc(w.l) + ' · Wikimedia Commons</figcaption></figure>';
}
function monumPopup(p) {
  const s = MONS && MONS.schede ? MONS.schede[p.ID] : null, specie = p['SPECIE - NOME VOLGARE'] || 'Albero monumentale', link = s ? s.link : p.Link || '', rows = [];
  if (s && s.eta) rows.push(['Età', esc(s.eta)]);
  // la circonferenza dei platani a due tronchi arriva come «410 -300»
  const circ = String(p['CIRCONFERENZA FUSTO (cm)'] || '').trim(), tronchi = circ.split(/\s*-\s*/).filter(Boolean);
  rows.push(['Altezza', esc(p['ALTEZZA (m)'] || 'n.d.') + ' m'], ['Circonferenza', circ ? (tronchi.length > 1 ? esc(tronchi.join(' e ')) + ' cm (' + tronchi.length + ' tronchi)' : esc(circ) + ' cm') : 'n.d.']);
  if (s && s.fauna) rows.push(['Chi ci vive', esc(s.fauna)]);
  if (s && s.salute) rows.push(['Come sta', esc(s.salute)]);
  rows.push(['Dove', esc((s && s.dove) || p['LOCALITÀ'] || '')]); // «dove» nella scheda corregge i refusi del dataset
  const links = [];
  if (/^https:\/\/www\.comune\.milano\.it\//.test(link)) links.push('<a href="' + esc(link) + '" target="_blank" rel="noopener">Scheda del Comune</a>');
  if (s && s.intervista && /^https:\/\/www\.comune\.milano\.it\//.test(MONS.podcast || '')) links.push('<a href="' + esc(MONS.podcast) + '" target="_blank" rel="noopener">Intervista: «' + esc(s.intervista) + '»</a>');
  return '<div class="pop"><h3>' + esc((s ? s.nome : specie).toUpperCase()) + '</h3><div class="sci">' + (s ? esc(specie) + ' · ' : '') + esc(p['SPECIE - NOME SCIENTIFICO'] || '') + '</div><span class="tag">MONUMENTALE</span>' +
    monumPhoto(s) + (s && s.storia ? '<p class="wx">' + esc(s.storia) + '</p>' : '') +
    '<table>' + rows.map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</table>' +
    (links.length ? '<p class="wx">' + links.join(' · ') + '</p>' : '') +
    '<small>Fonte: dataset del Comune di Milano' + (s ? '; ' + esc(MONS.fonte || '') : '') + '.</small></div>';
}
function buildMonum(gj) {
  const grp = L.layerGroup();
  for (const f of gj.features) {
    if (!f.geometry) continue; const p = f.properties, c = f.geometry.coordinates;
    // il popup si compone all'apertura: schede e foto delle specie arrivano dopo il disegno dei marker
    L.marker([c[1], c[0]], {icon: sprIcon(SPR.monum, 40), zIndexOffset: 500}).bindPopup(() => monumPopup(p), {maxWidth: 300}).addTo(grp);
  }
  LY.monum = grp;
}
function setLayer(key, on) {
  ST.on[key] = on;
  const l = LY[key];
  if (l) { if (on) l.addTo(map); else map.removeLayer(l); }
  if (key === 'nil' && on && LY.nil) LY.nil.bringToBack();
  if (key === 'musica') { setMusicPref(on); if (on) Chip.start(); else Chip.stop(0.4); }
  if (key === 'nomi' && labelTiles) { if (on) labelTiles.addTo(map); else map.removeLayer(labelTiles); }
  if (key === 'alberi' && treeLayer) treeLayer.redraw();
  if (key === 'fauna' && faunaLayer) faunaLayer.redraw();
  updateHud();
}

/* =====================================================================
   GLICINI: caricamento di un KML / KMZ locale (Google My Maps)
   Non collegata al menu: il livello dei glicini aspetta il permesso dell'autore della mappa
   (glicinimilano.it). Funzione e sprite restano pronti per quando arriverà.
   ===================================================================== */
async function loadKml(file) {
  const msg = $('#kmlmsg') || {set textContent(v) {}};
  try {
    let text;
    if (/\.kmz$/i.test(file.name)) { const f = await unzipPick(await file.arrayBuffer(), /\.kml$/i); text = await new Response(f.stream).text(); } else text = await file.text();
    const doc = new DOMParser().parseFromString(text, 'application/xml'); if (doc.querySelector('parsererror')) throw new Error('KML non valido');
    const pms = [...doc.getElementsByTagName('Placemark')]; if (LY.glicini) map.removeLayer(LY.glicini);
    const grp = L.layerGroup(); let n = 0;
    for (const pm of pms) {
      const co = pm.getElementsByTagName('coordinates')[0]; if (!co) continue;
      const c = co.textContent.trim().split(/\s+/)[0].split(',').map(Number); if (!isFinite(c[0]) || !isFinite(c[1])) continue;
      const tx = t => { const e = pm.getElementsByTagName(t)[0]; return e ? e.textContent : ''; }, desc = tx('description');
      const imgs = new Set(); (desc.match(/https?:\/\/[^\s"'<>]+/g) || []).forEach(u => { if (/googleusercontent|\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) imgs.add(u); });
      [...pm.getElementsByTagName('Data')].forEach(d => { if (/media/i.test(d.getAttribute('name') || '')) (d.textContent.match(/https?:\/\/\S+/g) || []).forEach(u => imgs.add(u)); });
      const plain = desc.replace(/<img[^>]*>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
      L.marker([c[1], c[0]], {icon: sprIcon(SPR.glicine, 32, 'as-tree')}).bindPopup('<div class="pop"><h3>' + esc((tx('name') || 'Glicine').toUpperCase()) + '</h3>' + (plain ? '<div>' + esc(plain).replace(/\n/g, '<br>') + '</div>' : '') +
        [...imgs].slice(0, 4).map(u => '<img loading="lazy" referrerpolicy="no-referrer" src="' + esc(u) + '" alt="">').join('') + '<small>Dal file ' + esc(file.name) + '</small></div>', {maxWidth: 280}).addTo(grp);
      n++;
    }
    if (!n) throw new Error('nessun punto nel file');
    LY.glicini = grp; if (ST.on.glicini) grp.addTo(map);
    msg.textContent = n + ' glicini caricati da ' + file.name + '.';
  } catch (e) { msg.textContent = 'Non riesco a leggere il file: ' + e.message; }
}
