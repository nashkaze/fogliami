/* =====================================================================
   UTILITÀ
   ===================================================================== */
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => (v == null || v === '') ? NaN : (typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')));
const fmt = (n, d) => (n == null || !isFinite(n)) ? 'n.d.' : n.toLocaleString('it-IT', {maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: 0, useGrouping: 'always'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tick = () => new Promise(r => setTimeout(r, 0));
const cap = s => { s = String(s || '').trim().toLowerCase(); return s ? s[0].toUpperCase() + s.slice(1) : ''; };
const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s\-'(])([a-zà-ù])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bQt\b/g, 'QT').replace(/\bQ\.re\b/gi, 'Q.re').replace(/\b(Di|Del|Della|Dei|Sul|Al|E)\b/g, m => m.toLowerCase());

async function fetchX(url, opt) {
  opt = opt || {};
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), opt.timeout || 30000);
  try {
    const r = await fetch(url, {signal: ctl.signal, headers: opt.headers || undefined, method: opt.method || 'GET', body: opt.body});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('tempo scaduto');
    if (e instanceof TypeError) throw new Error('rete o CORS (' + e.message + ')');
    throw e;
  } finally { clearTimeout(t); }
}
/* i file del sito non hanno ripieghi veloci: una caduta di rete passeggera merita un secondo tentativo */
const retry = fn => fn().catch(() => sleep(1500).then(fn));
const fetchJSON = async (url, opt) => {
  const r = await fetchX(url, opt), txt = await r.text();
  try { return JSON.parse(txt); } catch (e) { throw new Error('risposta non JSON'); }
};

/* Mercatore normalizzato, relativo a un'origine vicina a Milano (precisione in Float32) */
const mercX = lon => (lon + 180) / 360;
const mercY = lat => { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
const X0 = mercX(CFG.center[1]), Y0 = mercY(CFG.center[0]);
const unX = rx => (rx + X0) * 360 - 180;
const unY = ry => { const n = Math.PI - 2 * Math.PI * (ry + Y0); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

/* ZIP minimale (deflate) con DecompressionStream: serve per lo ZIP degli alberi e per i KMZ */
async function unzipPick(buf, re) {
  const dv = new DataView(buf), td = new TextDecoder();
  let i = buf.byteLength - 22;
  for (; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) break;
  if (i < 0) throw new Error('file ZIP non valido');
  const n = dv.getUint16(i + 10, true); let off = dv.getUint32(i + 16, true);
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), nl = dv.getUint16(off + 28, true),
      el = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
    const name = td.decode(new Uint8Array(buf, off + 46, nl));
    if (re.test(name)) {
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), data = new Uint8Array(buf, start, csize);
      let st = new Blob([data]).stream();
      if (method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('questo browser non sa aprire gli ZIP: estrai il file a mano');
        st = st.pipeThrough(new DecompressionStream('deflate-raw'));
      } else if (method !== 0) throw new Error('compressione ZIP non supportata');
      return {name, stream: st};
    }
    off += 46 + nl + el + cl;
  }
  throw new Error('nello ZIP non c\'è il file atteso');
}

/* Lettura a righe da uno stream: il GeoJSON del Comune pesa 130 MB, non va caricato intero in memoria */
async function* linesOf(stream) {
  const rd = stream.pipeThrough(new TextDecoderStream()).getReader(); let buf = '';
  for (;;) {
    const {done, value} = await rd.read(); if (done) break;
    buf += value; let start = 0, i;
    while ((i = buf.indexOf('\n', start)) >= 0) { yield buf.slice(start, i); start = i + 1; }
    buf = buf.slice(start);
  }
  if (buf) yield buf;
}
function splitCSV(line, sep) {
  if (line.indexOf('"') < 0) return line.split(sep);
  const out = []; let f = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { out.push(f); f = ''; } else f += ch;
  }
  out.push(f); return out;
}

/* =====================================================================
   STATO DELLE FONTI (mostrato nella scheda Info, aggiornato in diretta)
   ===================================================================== */
const SRC = {};
function src(key, label, state, note) {
  SRC[key] = Object.assign(SRC[key] || {}, {label: label || (SRC[key] && SRC[key].label), state, note: note || ''});
  renderSources();
}
function renderSources() {
  const el = $('#srcs'); if (!el) return;
  const lab = {ok: 'OK', err: 'ERRORE', wait: 'ATTESA', part: 'PARZIALE', off: 'SPENTA'};
  el.innerHTML = Object.keys(SRC).map(k => { const s = SRC[k]; return '<tr><td class="st ' + s.state + '">' + (lab[s.state] || s.state) + '</td><td><b>' + esc(s.label) + '</b><br>' + s.note + '</td></tr>'; }).join('');
}

/* =====================================================================
   SCHERMATA DI CARICAMENTO
   ===================================================================== */
const Loader = {
  total: 0, done: 0, shown: 0, closed: false, t0: performance.now(), queue: [],
  init() {
    this.msg('Preparo il terreno…', true);
    const bar = $('#lbar'); for (let i = 0; i < 16; i++) bar.appendChild(document.createElement('i'));
    this.g = $('#plant').getContext('2d');
    $('#lskip').onclick = () => { Chip.jingle(); this.close(true); };
    setTimeout(() => { $('#lskip').disabled = false; }, 9000); // chi non vuole aspettare può entrare comunque
    const loop = t => {
      if (this.closed && this.shown >= 1 && performance.now() - this.tClose > 900) return;
      const target = this.total ? this.done / this.total : 0;
      // la barra (e il ciliegio) non va più veloce di un ciclo completo in 4,5 secondi, così le stagioni si vedono
      const dt = this.lastT ? t - this.lastT : 16, SPAN = 4500; this.lastT = t;
      this.shown += Math.min((target - this.shown) * 0.09, dt / SPAN); if (target - this.shown < 0.004 && target - this.shown < dt / SPAN) this.shown = target;
      // i messaggi compaiono quando la barra arriva al punto in cui sono stati scritti, non prima
      while (this.queue.length && this.queue[0].at <= this.shown + 0.001) { const el = $('#lmsg'); if (el) el.textContent = this.queue.shift().m; }
      drawPlant(this.g, this.shown, t);
      const pct = Math.round(this.shown * 100); if (pct !== this.lastPct) { this.lastPct = pct; $('#lpct').innerHTML = String(pct).replace(/8/g, '<span class="p8"></span>') + '%'; } // l'8 del font sembra una &
      const cells = $('#lbar').children; for (let i = 0; i < cells.length; i++) cells[i].className = (i < Math.round(this.shown * cells.length)) ? 'on' : '';
      if (this.ready && this.shown >= 0.999 && !this.closed && !this.pressing) this.autoStart();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
  task(label, w) { this.total += w; const self = this; let fin = false; return {end(msg) { if (fin) return; fin = true; self.done += w; self.msg(msg || label); }}; },
  msg(m, now) { if (this.ready && !now) return; if (now) { const el = $('#lmsg'); if (el) el.textContent = m; return; } this.queue.push({at: this.total ? this.done / this.total : 0, m}); this.queue.sort((a, b) => a.at - b.at); },
  finish() { this.ready = true; this.done = this.total; this.queue.push({at: 1, m: 'Pronto!'}); },
  // a caricamento completo START lampeggia, poi si preme da solo
  autoStart() {
    this.pressing = true; const b = $('#lskip'); b.disabled = false; b.classList.add('ready');
    setTimeout(() => { if (this.closed) return; b.classList.remove('ready'); b.classList.add('press'); Chip.jingle(); setTimeout(() => this.close(true), 260); }, 900);
  },
  close(force) {
    if (this.closed) return; this.closed = true; this.tClose = performance.now(); if (force) this.shown = 1;
    setTimeout(() => { $('#loader').classList.add('bye'); if (window.map) map.invalidateSize(); }, force ? 0 : 750);
  }
};

/* =====================================================================
   MAPPA
   ===================================================================== */
let map, baseTiles, labelTiles;
const isMobile = () => window.matchMedia('(max-width:760px)').matches;
function initMap() {
  map = window.map = L.map('map', {center: CFG.center, zoom: isMobile() ? 12 : 13, minZoom: 10, maxZoom: 21, zoomControl: false, preferCanvas: true, tap: false});
  L.control.zoom({position: 'topright'}).addTo(map);
  map.createPane('vec').style.zIndex = 350;
  map.createPane('labels').style.zIndex = 420; map.getPane('labels').style.pointerEvents = 'none';
  map.createPane('sprites').style.zIndex = 450; map.getPane('sprites').style.pointerEvents = 'none';
  // Da fine agosto 2026 CARTO richiede una chiave gratuita (carto.com/basemaps/apikey): senza, i tasselli
  // arrivano con la scritta "API KEY REQUIRED". Senza chiave la pagina non li carica affatto.
  setBasemap(cartoKey());
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  // su telefono i crediti vanno in basso a sinistra, piccoli, lontani dagli avvisi in basso a destra
  if (isMobile()) { map.attributionControl.setPosition('bottomleft'); map.attributionControl.setPrefix(false); }
  // su telefono un tocco sulla mappa con il pannello aperto lo chiude e basta
  map.on('preclick', () => { if (isMobile() && !$('#panel').classList.contains('closed')) { togglePanel(false); _panelClosedAt = performance.now(); } });
  map.on('click', e => { if (performance.now() - _panelClosedAt < 400) return; hitAndPopup(e.containerPoint, e.latlng); });
  map.on('popupclose', () => { _popClosedAt = performance.now(); });
  // le icone a sprite (glicini, orti, giardini, monumentali) si rimpiccioliscono allontanandosi
  const mk = () => { const z = map.getZoom(); map.getContainer().style.setProperty('--mk', z <= 11 ? 0.35 : z === 12 ? 0.45 : z === 13 ? 0.6 : z === 14 ? 0.75 : z === 15 ? 0.9 : z === 16 ? 1.05 : z === 17 ? 1.2 : 1.4);
    // i glicini seguono la scala degli alberi: 16, 24 e 32 px agli zoom 17, 18 e 19 (icona base 32 px)
    map.getContainer().style.setProperty('--mkt', z >= 21 ? 2 : z >= 20 ? 1.5 : z >= 19 ? 1 : z === 18 ? 0.75 : z === 17 ? 0.5 : z === 16 ? 0.34 : z === 15 ? 0.28 : 0.22); };
  map.on('zoomend', mk); mk();
  map.on('zoomend', updateHud);
}

function cartoKey() { return (CFG.cartoKey || '').trim(); }
function setBasemap(key, style) {
  const att = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
  if (baseTiles) map.removeLayer(baseTiles); if (labelTiles) map.removeLayer(labelTiles); baseTiles = labelTiles = null;
  if (!key) { src('carto', 'Mappa di base CARTO', 'off', 'Serve una chiave gratuita: richiedila su carto.com/basemaps/apikey e scrivila in CFG.cartoKey (a_tables.js). Senza chiave la mappa mostra solo i dati.'); return; }
  const u = v => 'https://basemaps.cartocdn.com/rastertiles/' + v + '/{z}/{x}/{y}{r}.png?key=' + encodeURIComponent(key);
  // Positron senza etichette, ricolorata via filtro CSS (.base-tiles); etichette su un livello separato
  baseTiles = L.tileLayer(u(style || 'light_nolabels'), {maxZoom: 21, maxNativeZoom: 18, className: 'base-tiles', attribution: att}).addTo(map);
  // etichette fino al 19: CARTO non serve livelli oltre il 18, più ingrandite diventano sgranate
  labelTiles = L.tileLayer(u('light_only_labels'), {maxZoom: 19, maxNativeZoom: 18, pane: 'labels', className: 'label-tiles'});
  if (ST.on.nomi) labelTiles.addTo(map);
  let ok = 0, bad = 0;
  baseTiles.on('tileload', () => { if (++ok === 1) src('carto', 'Mappa di base CARTO', 'ok', 'Tasselli Positron (' + (style || 'light_nolabels') + ') con chiave.'); });
  // se la variante senza etichette non esiste con il nuovo schema a chiave, ripiego su light_all (documentata)
  baseTiles.on('tileerror', () => { if (++bad === 3 && !ok) { if (!style) setBasemap(key, 'light_all'); else src('carto', 'Mappa di base CARTO', 'err', 'I tasselli non arrivano: controlla la chiave.'); } });
}

/* Livello generico a sprite su un unico canvas: regge centinaia di migliaia di punti */
const SpriteLayer = L.Layer.extend({
  initialize(drawFn) { this._drawFn = drawFn; },
  onAdd(m) {
    this.cv = L.DomUtil.create('canvas', 'sprite-canvas leaflet-zoom-hide', m.getPane('sprites'));
    this.ctx = this.cv.getContext('2d');
    m.on('moveend zoomend resize viewreset', this._reset, this); m.on('move', this._req, this);
    this._reset();
  },
  onRemove(m) { L.DomUtil.remove(this.cv); m.off('moveend zoomend resize viewreset', this._reset, this); m.off('move', this._req, this); this.cv = null; },
  _req() { if (this._raf || !this.cv) return; this._raf = requestAnimationFrame(() => { this._raf = 0; if (this.cv) this._reset(); }); },
  redraw() { this._req(); },
  _reset() {
    const m = this._map, s = m.getSize(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.cv.width !== s.x * dpr || this.cv.height !== s.y * dpr) { this.cv.width = s.x * dpr; this.cv.height = s.y * dpr; this.cv.style.width = s.x + 'px'; this.cv.style.height = s.y + 'px'; }
    L.DomUtil.setPosition(this.cv, m.containerPointToLayerPoint([0, 0]));
    const g = this.ctx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, s.x, s.y); g.imageSmoothingEnabled = false;
    const z = m.getZoom(), sc = 256 * Math.pow(2, z), pb = m.getPixelBounds();
    this._drawFn(g, {z, sc, w: s.x, h: s.y, bx: X0 * sc - pb.min.x, by: Y0 * sc - pb.min.y});
  }
});
function viewNow() { const s = map.getSize(), z = map.getZoom(), sc = 256 * Math.pow(2, z), pb = map.getPixelBounds(); return {z, sc, w: s.x, h: s.y, bx: X0 * sc - pb.min.x, by: Y0 * sc - pb.min.y}; }

/* =====================================================================
   NIL: confini, appartenenza dei punti, statistiche
   ===================================================================== */
const NIL = {list: [], byId: {}, layer: null};
function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; }
function pip(x, y, rings) {
  let inside = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polysOf(geom) { return geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []; }
function geomCentroid(geom) {
  let best = null, bestA = -1;
  for (const p of polysOf(geom)) { const a = Math.abs(ringArea(p[0])); if (a > bestA) { bestA = a; best = p[0]; } }
  if (!best) return geom.type === 'Point' ? geom.coordinates : null;
  let x = 0, y = 0; for (const c of best) { x += c[0]; y += c[1]; } return [x / best.length, y / best.length];
}
function setNil(gj) {
  NIL.list = gj.features.map(f => {
    const polys = polysOf(f.geometry); let w = 180, e = -180, s = 90, n = -90;
    for (const p of polys) for (const c of p[0]) { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; }
    const id = +f.properties.ID_NIL;
    return {id, name: titleCase(f.properties.NIL), polys, w, e, s, n, area: +f.properties.Shape_Area || 0, f,
      pop: null, trees: 0, allerg: 0, parkM2: 0, parks: 0, fauna: 0, heat: null, green: null};
  });
  NIL.byId = {}; NIL.list.forEach(o => { NIL.byId[o.id] = o; });
  NIL.bbox = NIL.list.reduce((b, o) => ({w: Math.min(b.w, o.w), e: Math.max(b.e, o.e), s: Math.min(b.s, o.s), n: Math.max(b.n, o.n)}), {w: 180, e: -180, s: 90, n: -90});
}
let _lastNil = null;
function nilOf(lon, lat) {
  const test = o => lon >= o.w && lon <= o.e && lat >= o.s && lat <= o.n && o.polys.some(p => pip(lon, lat, p));
  if (_lastNil && test(_lastNil)) return _lastNil.id; // i punti arrivano spesso raggruppati per zona
  for (const o of NIL.list) if (o !== _lastNil && test(o)) { _lastNil = o; return o.id; }
  return 0;
}

/* =====================================================================
   ALBERI: archivio compatto a vettori tipizzati + indice a griglia
   ===================================================================== */
const T = {n: 0, cap: 0, x: null, y: null, g: null, sp: null, h: null, dt: null, dc: null, nil: null, pl: null, vr: null, st: null, yr: null,
  genera: [], gIdx: new Map(), gCount: [], species: [], spIdx: new Map(), spCount: [], spGenus: [],
  places: [''], plIdx: new Map([['', 0]]), vars: [''], vrIdx: new Map([['', 0]]),
  grid: new Map(), source: null, sourceNote: '', withSpecies: 0, done: false, expected: 0};
const CELL = 1 / 131072; // ~215 m alla latitudine di Milano
function treesGrow(min) {
  const cap = Math.max(min, T.cap ? T.cap * 2 : 65536);
  const g = (A, old) => { const a = new A(cap); if (old) a.set(old.subarray(0, T.n)); return a; };
  T.x = g(Float32Array, T.x); T.y = g(Float32Array, T.y); T.g = g(Uint16Array, T.g); T.sp = g(Uint16Array, T.sp);
  T.h = g(Float32Array, T.h); T.dt = g(Float32Array, T.dt); T.dc = g(Float32Array, T.dc); T.nil = g(Uint8Array, T.nil);
  T.pl = g(Uint16Array, T.pl); T.vr = g(Uint16Array, T.vr); T.st = g(Uint8Array, T.st); T.yr = g(Uint16Array, T.yr); T.cap = cap;
}
function intern(list, idx, s, max) { let i = idx.get(s); if (i === undefined) { if (list.length >= (max || 65535)) return 0; i = list.length; list.push(s); idx.set(s, i); } return i; }
function cleanGenus(s) { s = String(s || '').trim().replace(/^x\s+/i, '').split(/[\s(]/)[0].replace(/[^A-Za-zÀ-ÿ\-]/g, ''); return s.length > 1 ? cap(s) : ''; }
function addTree(lon, lat, genus, species, variety, h, dt, dc, place, date) {
  if (!isFinite(lon) || !isFinite(lat) || lat < 45.2 || lat > 45.7 || lon < 8.8 || lon > 9.5) return;
  if (T.n >= T.cap) treesGrow(T.n + 1);
  let G = cleanGenus(genus), S = String(species || '').trim();
  if (!G && S) { G = cleanGenus(S); S = S.split(/\s+/).slice(1).join(' '); }
  if (G && S.toLowerCase().startsWith(G.toLowerCase() + ' ')) S = S.slice(G.length + 1);
  S = S.replace(/\s+/g, ' ').toLowerCase(); if (/^(sp\.?|spp\.?|n\.?d\.?|-)$/.test(S)) S = '';
  if (!G) G = 'Non indicato'; else T.withSpecies++;
  const i = T.n++, gi = intern(T.genera, T.gIdx, G);
  if (gi >= T.gCount.length) T.gCount.push(0); T.gCount[gi]++;
  const full = S ? G + ' ' + S : G, si = intern(T.species, T.spIdx, full);
  if (si >= T.spCount.length) { T.spCount.push(0); T.spGenus.push(gi); } T.spCount[si]++;
  T.x[i] = mercX(lon) - X0; T.y[i] = mercY(lat) - Y0; T.g[i] = gi; T.sp[i] = si;
  T.h[i] = isFinite(h) && h > 0 && h < 80 ? h : 0; T.dt[i] = isFinite(dt) && dt > 0 ? dt : 0; T.dc[i] = isFinite(dc) && dc > 0 ? dc : 0;
  T.pl[i] = intern(T.places, T.plIdx, String(place || '').trim()); T.vr[i] = intern(T.vars, T.vrIdx, String(variety || '').trim());
  const ym = /(\d{4})/.exec(String(date || '')); T.yr[i] = ym && +ym[1] > 1700 && +ym[1] < 2100 ? +ym[1] : 0;
  const nid = NIL.list.length ? nilOf(lon, lat) : 0; T.nil[i] = nid; T.st[i] = 2;
  if (nid) { const o = NIL.byId[nid]; o.trees++; const a = ALLERG[G]; if (a && a.l >= 2) o.allerg++; }
  const key = (Math.floor(T.x[i] / CELL) + 2048) * 4096 + (Math.floor(T.y[i] / CELL) + 2048);
  let cell = T.grid.get(key); if (!cell) T.grid.set(key, cell = []); cell.push(i);
}

/* Riconosce i campi utili da nomi (e alias) eterogenei: CSV del Comune, ArcGIS, GeoJSON, file locali */
function detectFields(names, alias) {
  alias = alias || {};
  const find = (...res) => { for (const re of res) { const n = names.find(n => re.test(n) || re.test(alias[n] || '')); if (n) return n; } return null; };
  return {
    genus: find(/^gener/i, /^genus$/i, /genere/i), species: find(/^specie$/i, /^species$/i, /^specie/i, /specie/i),
    sci: find(/scient|botan|nome_sci|taxon/i, /di_name/i), variety: find(/variet|cultivar/i),
    h: find(/^h_m$/i, /altez/i, /^height$/i), dt: find(/diam.*tron/i, /^dbh/i, /diam.*fust/i), dc: find(/diam.*chiom/i, /chioma/i, /crown/i),
    lon: find(/^long_x_4326$/i, /^lon(g|gitud\w*)?$/i, /^x$/i, /long/i), lat: find(/^lat_y_4326$/i, /^lat(itud\w*)?$/i, /^y$/i, /lat_/i),
    place: find(/^localit/i, /localit/i, /indirizzo|^via$/i), date: find(/^data_ini/i, /data.*(impianto|messa)/i, /^start_date$/i)
  };
}
function addFromRecord(F, get, lon, lat) {
  const sci = F.sci ? get(F.sci) : '';
  addTree(lon, lat, F.genus ? get(F.genus) : sci, F.species ? get(F.species) : (F.genus ? '' : sci), F.variety ? get(F.variety) : '',
    F.h ? num(get(F.h)) : NaN, F.dt ? num(get(F.dt)) : NaN, F.dc ? num(get(F.dc)) : NaN, F.place ? get(F.place) : '', F.date ? get(F.date) : '');
}
function ingestGeoJSONObj(gj) {
  const fs = gj.features || []; if (!fs.length) throw new Error('GeoJSON senza elementi');
  const F = detectFields(Object.keys(fs[0].properties || {}));
  for (const f of fs) { const c = f.geometry && f.geometry.type === 'Point' ? f.geometry.coordinates : null; if (c) addFromRecord(F, n => f.properties[n], +c[0], +c[1]); }
}
/* Legge CSV oppure GeoJSON (un elemento per riga, come nei file del Comune) senza tenerli interi in memoria */
async function ingestStream(stream, label) {
  let mode = null, F = null, idx = {}, sep = ',', n = 0; const rest = [];
  for await (let line of linesOf(stream)) {
    if (mode === null) {
      line = line.replace(/^\uFEFF/, ''); if (!line.trim()) continue;
      const c0 = line.trim()[0]; mode = (c0 === '{' || c0 === '[') ? 'gj' : 'csv';
      if (mode === 'csv') {
        sep = line.split(';').length > line.split(',').length ? ';' : (line.split('\t').length > line.split(',').length ? '\t' : ',');
        const hdr = splitCSV(line.replace(/\r$/, ''), sep).map(h => h.trim()); F = detectFields(hdr); hdr.forEach((h, i) => { idx[h] = i; });
        if (!F.lon || !F.lat) throw new Error('nel CSV mancano le colonne di longitudine e latitudine');
        continue;
      }
    }
    if (mode === 'csv') {
      const row = splitCSV(line.replace(/\r$/, ''), sep); if (row.length < 3) continue;
      addFromRecord(F, k => row[idx[k]], num(row[idx[F.lon]]), num(row[idx[F.lat]]));
    } else {
      const k = line.indexOf('"Feature"');
      if (k < 0 || k > 40) { rest.push(line); continue; }
      let s = line.trim(); if (s[s.length - 1] === ',') s = s.slice(0, -1);
      let f; try { f = JSON.parse(s); } catch (e) { continue; }
      if (!F) F = detectFields(Object.keys(f.properties || {}));
      const c = f.geometry && f.geometry.type === 'Point' ? f.geometry.coordinates : null;
      if (c) addFromRecord(F, kk => f.properties[kk], +c[0], +c[1]);
    }
    if (++n % 8000 === 0) { hudTrees((label || 'Alberi') + ': ' + fmt(T.n), T.expected ? T.n / T.expected : null); treesChanged(); await tick(); }
  }
  if (mode === 'gj' && !T.n && rest.length) ingestGeoJSONObj(JSON.parse(rest.join('\n'))); // GeoJSON compatto su una riga
}
async function ingestBlob(blob, name, label) {
  if (/\.zip$/i.test(name)) { const f = await unzipPick(await blob.arrayBuffer(), /\.(csv|geojson|json)$/i); return ingestStream(f.stream, label); }
  return ingestStream(blob.stream(), label);
}
/* Copia locale del file caricato a mano (IndexedDB), per ritrovarlo alla visita successiva */
function idb(mode, fn) {
  return new Promise((res, rej) => {
    let rq; try { rq = indexedDB.open('milano-verde', 1); } catch (e) { return rej(e); }
    rq.onupgradeneeded = () => rq.result.createObjectStore('files');
    rq.onerror = () => rej(rq.error);
    rq.onsuccess = () => { try { const tx = rq.result.transaction('files', mode), r = fn(tx.objectStore('files')); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); } catch (e) { rej(e); } };
  });
}

/* --- Fonte 1: copia del censimento del Comune pubblicata nel repository, accanto alla pagina --- */
async function treesFromRepo() {
  const c = CFG.treesRepo; T.expected = c.n;
  hudTrees('Carico il censimento degli alberi…', 0.05);
  const blob = await retry(() => fetchX(c.url, {timeout: 120000}).then(r => r.blob()));
  await ingestBlob(blob, c.url, 'Alberi');
  if (!T.n) throw new Error('file vuoto o non leggibile');
  return 'censimento del Comune di Milano aggiornato al ' + c.date + ' (copia del dataset ds2484, CC BY 4.0)';
}
/* --- Fonte 3: portale Open Data del Comune (se e quando il dataset torna pubblico) --- */
async function treesFromCkan() {
  let pkg = null, lastErr;
  for (const id of CFG.treesPkg) { try { const r = await fetchJSON(CFG.ckan + '/api/3/action/package_show?id=' + id, {timeout: 15000}); if (r.success) { pkg = r.result; break; } } catch (e) { lastErr = e; } }
  if (!pkg) throw new Error('dataset non pubblicato sul portale (' + (lastErr ? lastErr.message : 'non trovato') + ')');
  const rs = pkg.resources || [], pick = rs.find(r => /csv/i.test(r.url) && !/\.zip$/i.test(r.url)) || rs.find(r => /\.zip$/i.test(r.url)) || rs.find(r => /geojson/i.test(r.format + r.url));
  if (!pick) throw new Error('nessuna risorsa leggibile nel dataset');
  hudTrees('Scarico gli alberi dal portale del Comune…', 0.05);
  const r = await fetchX(pick.url, {timeout: 240000});
  await ingestBlob(await r.blob(), pick.url, 'Alberi dal portale');
  return 'Open Data Comune di Milano, ' + esc(pkg.title) + ' (CC BY 4.0)';
}
/* --- Fonte 4: livello "Alberi" del geoportale ArcGIS. NON TESTATO: il server non era raggiungibile --- */
async function treesFromArcgis() {
  const base = CFG.arcgisTrees, meta = await fetchJSON(base + '?f=json', {timeout: 12000});
  if (meta.error || !meta.fields) throw new Error('servizio non disponibile');
  const names = meta.fields.map(f => f.name), alias = {}; meta.fields.forEach(f => { alias[f.name] = f.alias || ''; });
  const F = detectFields(names, alias), oid = meta.objectIdField || (meta.fields.find(f => f.type === 'esriFieldTypeOID') || {}).name || 'OBJECTID';
  const cnt = (await fetchJSON(base + '/query?where=1%3D1&returnCountOnly=true&f=json', {timeout: 20000})).count;
  if (!cnt) throw new Error('nessun elemento restituito');
  T.expected = cnt;
  const page = Math.min(meta.maxRecordCount || 1000, 2000), out = [oid, F.genus, F.species, F.sci, F.variety, F.h, F.dt, F.dc, F.place, F.date].filter(Boolean).join(',');
  const offs = []; for (let o = 0; o < cnt; o += page) offs.push(o);
  let fetched = 0;
  const worker = async () => {
    while (offs.length) {
      const o = offs.shift(); let js, tries = 0;
      for (;;) { try { js = await fetchJSON(base + '/query?where=1%3D1&outFields=' + encodeURIComponent(out) + '&returnGeometry=true&outSR=4326&geometryPrecision=6&orderByFields=' + oid + '&resultOffset=' + o + '&resultRecordCount=' + page + '&f=json', {timeout: 60000}); if (js.error) throw new Error(js.error.message || 'errore del servizio'); break; } catch (e) { if (++tries > 2) throw e; await sleep(1200); } }
      for (const f of js.features || []) if (f.geometry) addFromRecord(F, n => f.attributes[n], f.geometry.x, f.geometry.y);
      fetched += page; hudTrees('Alberi dal geoportale: ' + fmt(T.n), Math.min(1, fetched / cnt)); treesChanged();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return 'Geoportale del Comune di Milano, livello "Alberi" del Patrimonio del Verde';
}
/* --- Fonte 5: OpenStreetMap via Overpass. Copertura volontaria e parziale. NON TESTATO da qui --- */
async function treesFromOSM() {
  const b = NIL.bbox || CFG.bbox, q = '[out:json][timeout:120];node["natural"="tree"](' + [b.s, b.w, b.n, b.e].map(v => v.toFixed(4)).join(',') + ');out body qt;';
  let js, err;
  for (const ep of CFG.overpass) {
    try { hudTrees('Chiedo gli alberi a OpenStreetMap…', 0.1); js = await fetchJSON(ep + '?data=' + encodeURIComponent(q), {timeout: 150000}); if (js && js.elements) break; } catch (e) { err = e; js = null; }
  }
  if (!js || !js.elements) throw new Error(err ? err.message : 'nessuna risposta');
  const els = js.elements;
  for (let i = 0; i < els.length; i++) {
    const e = els[i], t = e.tags || {};
    const sci = t.species || t['species:la'] || t.taxon || t['taxon:species'] || '', genus = t.genus || t['genus:la'] || '';
    const lon = e.lon, lat = e.lat;
    if (NIL.list.length && !nilOf(lon, lat)) continue; // fuori dal Comune
    addTree(lon, lat, genus || sci, genus ? sci : sci, t['taxon:cultivar'] || t.cultivar || '', num(t.height), num(t.diameter) || (num(t.circumference) ? num(t.circumference) * 100 / Math.PI : NaN), num(t.diameter_crown), t['addr:street'] || '');
    if (i % 20000 === 19999) { hudTrees('Alberi da OpenStreetMap: ' + fmt(T.n), i / els.length); treesChanged(); await tick(); }
  }
  if (!T.n) throw new Error('nessun albero nel Comune');
  return 'OpenStreetMap (ODbL), via Overpass API';
}
function treesReset() {
  T.n = 0; T.genera = []; T.gIdx = new Map(); T.gCount = []; T.species = []; T.spIdx = new Map(); T.spCount = []; T.spGenus = [];
  T.places = ['']; T.plIdx = new Map([['', 0]]); T.vars = ['']; T.vrIdx = new Map([['', 0]]); T.grid = new Map(); spMeta.length = 0; T.withSpecies = 0; T.done = false; T.expected = 0;
  NIL.list.forEach(o => { o.trees = 0; o.allerg = 0; });
}
let _firstTrees;
const firstTrees = new Promise(r => { _firstTrees = r; });
async function loadTrees() {
  const chain = [['repo', 'Copia del censimento sul sito', treesFromRepo], ['file', 'File salvato in questo browser', treesFromCache], ['ckan', 'Portale Open Data del Comune', treesFromCkan], ['arcgis', 'Geoportale del Comune (ArcGIS)', treesFromArcgis], ['osm', 'OpenStreetMap (Overpass)', treesFromOSM]];
  const fails = [];
  for (const [key, label, fn] of chain) {
    treesReset(); src('alberi', 'Alberi', 'wait', 'Provo: ' + label + '…' + (fails.length ? '<br>' + fails.join('<br>') : ''));
    try {
      const note = await fn();
      T.source = key; T.sourceNote = note; T.done = true; treesChanged(true);
      src('alberi', 'Alberi', key === 'osm' ? 'part' : 'ok', fmt(T.n) + ' alberi da: ' + note + '.' + (fails.length ? '<br>' + fails.join('<br>') : ''));
      hudTrees(null); _firstTrees(); return;
    } catch (e) { fails.push('✗ ' + label + ': ' + esc(e.message)); }
  }
  treesReset(); T.done = true; treesChanged(true); hudTrees(null);
  src('alberi', 'Alberi', 'err', 'Nessuna fonte ha risposto. Puoi caricare un file locale (CSV, ZIP o GeoJSON) dal pannello Livelli.<br>' + fails.join('<br>'));
  _firstTrees();
}
/* --- Fonte 2: file caricato a mano in una visita precedente --- */
async function treesFromCache() {
  const rec = await idb('readonly', st => st.get('alberi'));
  if (!rec || !rec.blob) throw new Error('nessun file salvato in questo browser');
  await ingestBlob(rec.blob, rec.name, 'Alberi dal file salvato');
  if (!T.n) throw new Error('file salvato non valido');
  return 'file <b>' + esc(rec.name) + '</b> caricato a mano e conservato in questo browser';
}
async function loadTreesFile(file) {
  try {
    hudTrees('Leggo ' + file.name + '…', 0.02); treesReset();
    await ingestBlob(file, file.name, 'Alberi dal file');
    if (!T.n) throw new Error('nessun punto valido nel file');
    T.source = 'file'; T.sourceNote = 'file locale ' + esc(file.name); T.done = true; treesChanged(true);
    let kept = ''; try { await idb('readwrite', st => st.put({name: file.name, blob: file}, 'alberi')); kept = ' Conservato in questo browser come riserva: alle prossime visite si userà solo se il censimento del sito non risponde.'; } catch (e) {}
    src('alberi', 'Alberi', 'ok', fmt(T.n) + ' alberi dal file locale <b>' + esc(file.name) + '</b>.' + kept);
  } catch (e) { src('alberi', 'Alberi', 'err', 'File non leggibile: ' + esc(e.message)); T.done = true; treesChanged(true); }
  hudTrees(null);
}
