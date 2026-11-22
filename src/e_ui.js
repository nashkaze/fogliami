/* =====================================================================
   METRICHE PER NIL, COROPLETICA, CLASSIFICA
   ===================================================================== */
const R_GREEN = ['#f6f1d8', '#c4e86b', '#7cc35a', '#3a8f4b', '#1f5c3a'];
const R_WARM = ['#fff3c9', '#f6c644', '#e8853a', '#c9413f', '#7a1f2b'];
const R_BLUE = ['#eef6f2', '#8fd0e8', '#3f7fbf', '#2f4f9a', '#1b1c2e'];
const km2 = o => o.area / 1e6;
const faunaN = o => o.faunaTot != null ? o.faunaTot : o.fauna;
const METRICS = {
  treesCap: {l: 'Alberi ogni 100 residenti', u: 'alberi / 100 ab.', f: o => (T.n && o.pop) ? o.trees / o.pop * 100 : null, cap: 1, d: 1, ramp: R_GREEN},
  parkCap:  {l: 'Parchi e giardini: m² per residente', u: 'm² / ab.', f: o => o.pop ? o.parkM2 / o.pop : null, cap: 1, d: 1, ramp: R_GREEN},
  treesKm:  {l: 'Alberi per km²', u: 'alberi / km²', f: o => T.n ? o.trees / km2(o) : null, d: 0, ramp: R_GREEN},
  parkPct:  {l: 'Quota di superficie a parco', u: '% del NIL', f: o => o.parkM2 / o.area * 100, d: 1, ramp: R_GREEN},
  allergKm: {l: 'Alberi con polline allergenico per km²', u: 'alberi / km²', f: o => T.n ? o.allerg / km2(o) : null, d: 0, ramp: R_WARM},
  faunaKm:  {l: 'Segnalazioni di fauna per km²', u: 'segnalazioni / km²', f: o => faunaN(o) / km2(o), d: 0, ramp: R_BLUE},
  heat:     {l: 'Esposizione al calore urbano (lug 2024)', u: 'indice 0-1', f: o => o.heat, d: 2, ramp: R_WARM},
  green:    {l: 'Indice di verde da satellite (lug 2024)', u: 'indice', f: o => o.green, d: 1, ramp: R_GREEN},
  popKm:    {l: 'Residenti per km²', u: 'ab. / km²', f: o => o.pop != null ? o.pop / km2(o) : null, d: 0, ramp: R_BLUE}
};
function metricRows(key) {
  const M = METRICS[key];
  return NIL.list.map(o => { const v = M.f(o); return {o, v: (v == null || !isFinite(v)) ? null : v, ex: !!(M.cap && ST.exSmall && (o.pop == null || o.pop < CFG.smallPop))}; });
}
function quantile(sorted, q) { if (!sorted.length) return NaN; const p = (sorted.length - 1) * q, a = Math.floor(p), b = Math.ceil(p); return sorted[a] + (sorted[b] - sorted[a]) * (p - a); }
let CH = {key: null, breaks: [], cls: {}};
function computeChoro() {
  const key = ST.choro; CH = {key, breaks: [], cls: {}}; if (!key) return;
  const rows = metricRows(key), vals = rows.filter(r => r.v != null && !r.ex).map(r => r.v).sort((a, b) => a - b);
  CH.breaks = [0.2, 0.4, 0.6, 0.8].map(q => quantile(vals, q)); CH.min = vals[0]; CH.max = vals[vals.length - 1];
  rows.forEach(r => { CH.cls[r.o.id] = (r.v == null || r.ex) ? -1 : CH.breaks.filter(b => r.v > b).length; });
}
function nilStyle(o) {
  if (!CH.key) return {color: PAL.ink, weight: 1.2, dashArray: '4 4', fillColor: '#000', fillOpacity: 0, opacity: 0.55};
  const c = CH.cls[o.id];
  if (c == null || c < 0) return {color: PAL.ink, weight: 1, dashArray: '2 5', fillColor: PAL.fog, fillOpacity: 0.28, opacity: 0.6};
  return {color: PAL.ink, weight: 1.2, dashArray: null, fillColor: METRICS[CH.key].ramp[c], fillOpacity: 0.74, opacity: 0.9};
}
function restyleNil() { const was = CH.key; computeChoro(); if (LY.nil) LY.nil.setStyle(f => nilStyle(NIL.byId[+f.properties.ID_NIL])); renderLegend(); if (was !== CH.key && treeLayer) treeLayer.redraw(); }
function gini(vals) { const v = vals.slice().sort((a, b) => a - b), n = v.length, s = v.reduce((a, b) => a + b, 0); if (!n || !s) return NaN; let c = 0; v.forEach((x, i) => { c += (2 * (i + 1) - n - 1) * x; }); return c / (n * s); }
function renderRank() {
  const key = ST.metric, M = METRICS[key], rows = metricRows(key), ok = rows.filter(r => r.v != null && !r.ex).sort((a, b) => b.v - a.v), exN = rows.filter(r => r.ex).length;
  const el = $('#rank'), kp = $('#rankkpi');
  if (!ok.length) { el.innerHTML = ''; kp.innerHTML = '<p class="note">Dati non ancora disponibili per questa misura.</p>'; return; }
  const vals = ok.map(r => r.v), s = vals.slice().sort((a, b) => a - b), mx = s[s.length - 1] || 1, p10 = quantile(s, 0.1), p90 = quantile(s, 0.9);
  kp.innerHTML = '<div class="kpi"><div><b>' + fmt(quantile(s, 0.5), M.d) + '</b><span>quartiere mediano, ' + M.u + '</span></div><div><b>' + (p10 > 0 ? fmt(p90 / p10, 1) + '×' : 'n.d.') + '</b><span>divario tra 90° e 10° percentile</span></div>' +
    '<div><b>' + fmt(gini(vals), 2) + '</b><span>indice di Gini tra quartieri (0 = tutti uguali)</span></div><div><b>' + ok.length + '</b><span>NIL in classifica' + (exN ? ', ' + exN + ' esclusi' : '') + '</span></div></div>' +
    (key === 'treesCap' || key === 'treesKm' || key === 'allergKm' ? '<p class="note">' + treeCaveat() + '</p>' : '') +
    (key === 'parkCap' || key === 'parkPct' ? '<p class="note">Conta solo i poligoni del dataset "parchi e giardini" (circa 7,7 km²), non tutto il verde pubblico. Ogni parco è attribuito al NIL in cui cade il suo centro.</p>' : '') +
    (key === 'faunaKm' ? '<p class="warn">Le segnalazioni seguono le persone: misurano dove si osserva, prima ancora di dove vivono gli animali.</p>' : '');
  el.innerHTML = ok.map(r => '<li data-id="' + r.o.id + '"><div class="nm">' + esc(r.o.name) + '<div class="bar" style="width:' + Math.max(2, r.v / mx * 100) + '%;background:' + M.ramp[Math.max(0, CH.key === key ? CH.cls[r.o.id] : 3)] + '"></div></div><span class="v">' + fmt(r.v, M.d) + '</span></li>').join('');
}
function treeCaveat() {
  if (!T.n) return 'Alberi non ancora caricati.';
  if (T.source === 'osm') return 'Alberi da OpenStreetMap: mappatura volontaria e disomogenea tra quartieri. Il confronto misura anche quanto ogni zona è stata mappata.';
  return 'Solo alberi gestiti dal Comune (' + fmt(T.n) + '): mancano le piante private e le aree boscate.';
}
function spearman(a, b) {
  const rk = v => { const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = new Array(v.length); idx.forEach((p, i) => { r[p[1]] = i; }); return r; };
  const ra = rk(a), rb = rk(b), n = a.length; if (n < 3) return NaN; let d = 0; for (let i = 0; i < n; i++) d += (ra[i] - rb[i]) ** 2; return 1 - 6 * d / (n * (n * n - 1));
}
let SCAT = null;
function drawScatter(xKey, yKey, logY) {
  const cv = $('#scatter'); if (!cv) return;
  const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const MX = METRICS[xKey], MY = METRICS[yKey], pts = NIL.list.map(o => ({o, x: MX.f(o), y: MY.f(o)})).filter(p => p.x != null && p.y != null && isFinite(p.x) && isFinite(p.y) && (!ST.exSmall || (p.o.pop || 0) >= CFG.smallPop));
  const info = $('#scatinfo');
  if (pts.length < 5) { g.fillStyle = PAL.slate; g.font = '12px sans-serif'; g.fillText('Dati non ancora disponibili', 12, 24); if (info) info.textContent = ''; return; }
  const ty = v => logY ? Math.log10(1 + v) : v, xs = pts.map(p => p.x), ys = pts.map(p => ty(p.y)), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const L_ = 34, B = 26, Rr = 10, Tt = 10, sx = v => L_ + (v - x0) / (x1 - x0 || 1) * (W - L_ - Rr), sy = v => H - B - (ty(v) - y0) / (y1 - y0 || 1) * (H - B - Tt);
  g.strokeStyle = PAL.sand; g.lineWidth = 1; for (let i = 0; i <= 4; i++) { const y = Tt + i * (H - B - Tt) / 4; g.beginPath(); g.moveTo(L_, y + .5); g.lineTo(W - Rr, y + .5); g.stroke(); }
  g.strokeStyle = PAL.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(L_, Tt); g.lineTo(L_, H - B); g.lineTo(W - Rr, H - B); g.stroke();
  g.fillStyle = PAL.slate; g.font = '10px sans-serif'; g.textAlign = 'center'; g.fillText(MX.u + ' →', (W + L_) / 2, H - 8); g.fillText(fmt(x0, MX.d), L_, H - 14); g.textAlign = 'right'; g.fillText(fmt(x1, MX.d), W - Rr, H - 14);
  g.save(); g.translate(11, (H - B) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText(MY.u + (logY ? ' (scala log)' : '') + ' →', 0, 0); g.restore();
  pts.forEach(p => { p.px = Math.round(sx(p.x)); p.py = Math.round(sy(p.y)); g.fillStyle = PAL.ink; g.fillRect(p.px - 3, p.py - 3, 7, 7); g.fillStyle = MY.ramp[3]; g.fillRect(p.px - 2, p.py - 2, 5, 5); });
  SCAT = {pts, MX, MY};
  const rho = spearman(pts.map(p => p.x), pts.map(p => p.y));
  if (info) info.innerHTML = 'Correlazione di Spearman tra i ' + pts.length + ' quartieri: <b>' + fmt(rho, 2) + '</b> (' + (Math.abs(rho) < 0.2 ? 'praticamente nulla' : Math.abs(rho) < 0.45 ? 'debole' : Math.abs(rho) < 0.7 ? 'moderata' : 'forte') + (rho < -0.2 ? ', inversa' : '') + '). Tocca un punto per il nome.';
}
function scatterTap(ev) {
  if (!SCAT) return; const cv = $('#scatter'), r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; let best = null, bd = 400;
  for (const p of SCAT.pts) { const d = (p.px - x) ** 2 + (p.py - y) ** 2; if (d < bd) { bd = d; best = p; } }
  if (best) $('#scatinfo').innerHTML = '<b>' + esc(best.o.name) + '</b>: ' + fmt(best.x, SCAT.MX.d) + ' ' + SCAT.MX.u + ', ' + fmt(best.y, SCAT.MY.d) + ' ' + SCAT.MY.u;
}

/* =====================================================================
   MODALITÀ (INCROCI)
   ===================================================================== */
const MODES = [
  ['none', 'Mappa semplice', 'nil'], ['disug', 'Disuguaglianza del verde', 'parco'], ['fiori', 'Calendario delle fioriture', 'giardino'],
  ['allergie', 'Mappa delle allergie', 'glicine'], ['fauna', 'Fauna e verde', 'uccelli'], ['calore', 'Isole di calore', 'calore']
];
function monthUI(id) {
  return '<div class="bigm" id="' + id + 'lab"></div><input type="range" min="1" max="12" step="1" value="' + ST.month + '" id="' + id + '" aria-label="Mese"><div class="months" id="' + id + 'm">' + MESI3.map(m => '<i>' + m + '</i>').join('') + '</div>';
}
function bindMonth(id) {
  const el = $('#' + id), upd = () => { $('#' + id + 'lab').textContent = MESI[ST.month - 1].toUpperCase(); [...$('#' + id + 'm').children].forEach((c, i) => c.classList.toggle('on', i === ST.month - 1)); };
  el.oninput = () => { ST.month = +el.value; upd(); applyTreeState(); renderModeList(); }; upd();
}
function setMode(m) {
  ST.mode = m;
  [...$('#modes').children].forEach(b => b.classList.toggle('on', b.dataset.m === m));
  const ui = $('#modeui'); let h = '';
  if (m === 'none') { ST.choro = null; h = '<p class="note">Scegli un incrocio per colorare la mappa. Gli incroci combinano fonti diverse: alberi, residenti, parchi, segnalazioni di fauna e indici satellitari.</p>'; }
  if (m === 'disug') {
    if (['treesCap', 'parkCap', 'treesKm', 'parkPct'].indexOf(ST.metric) < 0) ST.metric = T.n ? 'treesCap' : 'parkCap';
    ST.choro = ST.metric;
    h = '<h2>QUANTO VERDE A TESTA</h2><select class="full" id="dmetric">' + ['treesCap', 'parkCap', 'treesKm', 'parkPct'].map(k => '<option value="' + k + '"' + (k === ST.metric ? ' selected' : '') + '>' + METRICS[k].l + '</option>').join('') + '</select>' +
      '<p class="note">Residenti al 31/12 dell\'ultimo anno disponibile, alberi e parchi contati dentro i confini di ogni NIL. La classifica completa è nella scheda accanto.</p><div id="dkpi"></div><button class="btn sm" id="gorank">Apri la classifica</button>';
  }
  if (m === 'fiori') { ST.choro = null; h = '<h2>COSA FIORISCE, E DOVE</h2>' + monthUI('fm') + '<label class="chk"><input type="checkbox" id="showy"' + (ST.showyOnly ? ' checked' : '') + '> Solo fioriture vistose</label><ul class="lg" id="modelist"></ul><p class="note">Calendario compilato a mano per genere (con qualche eccezione di specie), valido come ordine di grandezza per la Pianura Padana: lo scarto reale è di 2-3 settimane.</p>'; }
  if (m === 'allergie') { h = '<h2>POLLINI ALLERGENICI</h2><label class="chk"><input type="checkbox" id="monly"' + (ST.monthOnly ? ' checked' : '') + '> Solo le specie in pollinazione nel mese scelto</label><div id="amwrap"' + (ST.monthOnly ? '' : ' style="display:none"') + '>' + monthUI('am') + '</div>' +
    '<label class="chk"><input type="checkbox" id="achoro"' + (ST.choro === 'allergKm' ? ' checked' : '') + '> Colora i quartieri per densità di alberi allergenici</label><ul class="lg" id="modelist"></ul>' +
    '<div class="box"><b>Concentrazioni di polline in aria: segnaposto</b><p class="note">Non ho trovato dati scaricabili sui pollini né da ARPA Lombardia né sul portale regionale. In Lombardia i bollettini sono pubblicati dalle ATS (per Milano, ATS Città Metropolitana) e dall\'Associazione Italiana di Aerobiologia, senza API aperta. Qui andrà la serie settimanale quando esisterà una fonte leggibile.</p></div>' +
    '<p class="note">Il potenziale allergenico è una classificazione indicativa per genere, non un dato sanitario.</p>'; if (ST.choro !== 'allergKm') ST.choro = null; }
  if (m === 'fauna') { ST.choro = 'faunaKm'; ST.metric = 'faunaKm'; h = '<h2>FAUNA SEGNALATA E ALBERI</h2><p class="warn">Attenzione: le segnalazioni seguono la frequentazione delle persone. Un parco molto visitato ha più osservazioni di un\'area ricca ma poco battuta.</p><canvas id="scatter"></canvas><p class="note" id="scatinfo"></p><p class="note" id="faunanote"></p>'; }
  if (m === 'calore') { ST.choro = 'heat'; ST.metric = 'heat'; h = '<h2>CALORE E ALBERI</h2><p class="note">Indice di esposizione al calore urbano per NIL (0-1), calcolato dal progetto europeo SPOTTED su dati satellitari di luglio 2024 e pubblicato dal Comune. Risoluzione di quartiere: non descrive la singola via.</p><canvas id="scatter"></canvas><p class="note" id="scatinfo"></p>' +
    '<div class="box"><b>Temperatura superficiale Landsat: sezione predisposta</b><p class="note">Il raster Landsat a 30 m non si può leggere in diretta da una pagina senza un servizio intermedio che lo ritagli e lo serva. Il passo successivo è un livello a tasselli da un servizio di elaborazione.</p></div>'; }
  ui.innerHTML = h;
  if (m === 'disug') { $('#dmetric').onchange = e => { ST.metric = ST.choro = e.target.value; $('#metric').value = ST.metric; restyleNil(); renderRank(); renderDisugKpi(); }; $('#gorank').onclick = () => showTab('classifica'); renderDisugKpi(); }
  if (m === 'fiori') { bindMonth('fm'); $('#showy').onchange = e => { ST.showyOnly = e.target.checked; applyTreeState(); renderModeList(); }; }
  if (m === 'allergie') { bindMonth('am'); $('#monly').onchange = e => { ST.monthOnly = e.target.checked; $('#amwrap').style.display = ST.monthOnly ? '' : 'none'; applyTreeState(); renderModeList(); };
    $('#achoro').onchange = e => { ST.choro = e.target.checked ? 'allergKm' : null; if (ST.choro) ST.metric = 'allergKm'; $('#metric').value = ST.metric; restyleNil(); renderRank(); }; }
  if (m === 'fauna' || m === 'calore') { $('#scatter').onclick = scatterTap; }
  if (ST.choro && !ST.on.nil) { setLayer('nil', true); const c = $('#sw-nil'); if (c) c.checked = true; }
  $('#metric').value = ST.metric;
  applyTreeState(); restyleNil(); renderRank(); renderModeList(); refreshScatter(); updateHud();
}
function refreshScatter() {
  if (ST.mode === 'fauna') { drawScatter('treesKm', 'faunaKm', true); const n = $('#faunanote'); if (n) n.textContent = FA.gbifNil ? 'Segnalazioni: tutte le occorrenze animali di GBIF dentro ogni quartiere (comprende iNaturalist ed eBird).' : 'Segnalazioni: campione dei punti caricati sulla mappa (' + fmt(FA.list.length) + '), in attesa dei conteggi completi di GBIF.'; }
  if (ST.mode === 'calore') drawScatter(T.n ? 'treesKm' : 'parkPct', 'heat', false);
}
function renderDisugKpi() {
  const el = $('#dkpi'); if (!el) return; const M = METRICS[ST.metric], ok = metricRows(ST.metric).filter(r => r.v != null && !r.ex).sort((a, b) => b.v - a.v);
  if (!ok.length) { el.innerHTML = '<p class="note">Dati in arrivo…</p>'; return; }
  const a = ok[0], z = ok[ok.length - 1];
  el.innerHTML = '<div class="kpi"><div><b>' + fmt(a.v, M.d) + '</b><span>il più dotato: ' + esc(a.o.name) + '</span></div><div><b>' + fmt(z.v, M.d) + '</b><span>il meno dotato: ' + esc(z.o.name) + '</span></div></div>' + (ST.metric.startsWith('tree') ? '<p class="note">' + treeCaveat() + '</p>' : '');
}
function renderModeList() {
  const el = $('#modelist'); if (!el) return;
  if (!T.n) { el.innerHTML = '<li>Alberi non ancora caricati.</li>'; return; }
  const agg = new Map();
  for (let si = 0; si < T.species.length; si++) {
    const m = metaOf(si); let hit = false, col, extra = '';
    if (ST.mode === 'fiori') { hit = m.fl && m.fl.m.indexOf(ST.month) >= 0 && (!ST.showyOnly || m.fl.v); if (hit) col = m.fl.c; }
    else { hit = m.al && (!ST.monthOnly || m.al.m.indexOf(ST.month) >= 0); if (hit) { col = ALL_COL[m.al.l]; extra = ALL_LBL[m.al.l]; } }
    if (!hit) continue; const a = agg.get(m.genus) || {n: 0, col, extra, l: m.al ? m.al.l : 0}; a.n += T.spCount[si]; agg.set(m.genus, a);
  }
  const rows = [...agg.entries()].sort((a, b) => ST.mode === 'allergie' ? (b[1].l - a[1].l || b[1].n - a[1].n) : b[1].n - a[1].n), tot = rows.reduce((s, r) => s + r[1].n, 0);
  el.innerHTML = '<li><b>' + fmt(tot) + ' alberi</b><em>' + fmt(tot / T.n * 100, 1) + '% del totale</em></li>' + (rows.length ? rows.slice(0, 14).map(([g, a]) => '<li class="clk" data-g="' + esc(g) + '"><i style="background:' + a.col + '"></i>' + esc(NOMI[g] || g) + (a.extra ? ' <small>(' + a.extra + ')</small>' : '') + '<em>' + fmt(a.n) + '</em></li>').join('') : '<li>Nessun genere tra quelli in tabella.</li>');
}
function renderLegend() {
  const el = $('#legend'); let h = '';
  if (CH.key) { const M = METRICS[CH.key], b = CH.breaks, d = M.d;
    h = '<b>' + M.l.toUpperCase() + '</b>' + M.ramp.map((c, i) => '<div class="row"><i style="background:' + c + '"></i>' + (i === 0 ? 'fino a ' + fmt(b[0], d) : i === 4 ? 'oltre ' + fmt(b[3], d) : fmt(b[i - 1], d) + ' – ' + fmt(b[i], d)) + '</div>').join('') +
      (M.cap && ST.exSmall ? '<div class="row"><i style="background:' + PAL.fog + ';opacity:.5"></i>meno di 1.000 residenti</div>' : ''); }
  else if (ST.mode === 'fiori') h = '<b>IN FIORE A ' + MESI[ST.month - 1].toUpperCase() + '</b><div class="row"><i style="background:' + RAMP_F[2] + '"></i>alberi in fiore</div><div class="row"><i style="background:' + PAL.fog + ';opacity:.5"></i>altri alberi</div>';
  else if (ST.mode === 'allergie') h = '<b>POLLINE ALLERGENICO</b>' + [3, 2, 1].map(l => '<div class="row"><i style="background:' + ALL_COL[l] + '"></i>potenziale ' + ALL_LBL[l] + '</div>').join('') + '<div class="row" style="color:var(--slate)">Da lontano: rosso se oltre il 12% degli alberi del riquadro è ad alto potenziale.</div>';
  el.innerHTML = h;
}

/* =====================================================================
   AGGIORNAMENTI A CASCATA
   ===================================================================== */
let _tcT = 0, _stT = 0;
function applyTreeState() { recomputeStates(); if (treeLayer) treeLayer.redraw(); renderLegend(); }
function treesChanged(final) {
  const now = performance.now();
  if (final || now - _tcT > 700) { _tcT = now; spMeta.length = 0; recomputeStates(); if (treeLayer) treeLayer.redraw(); }
  if (final) { buildTreeFilters(); renderTreeNote(); renderModeList(); updateHud(); }
  statsChanged(final);
}
function statsChanged(final) {
  const now = performance.now(); if (!final && now - _stT < 1500) return; _stT = now;
  restyleNil(); renderRank(); renderDisugKpi(); refreshScatter();
}
function faunaChanged() { if (faunaLayer) faunaLayer.redraw(); renderFaunaNote(); statsChanged(); }
function hudTrees(msg, frac) {
  let el = $('#hudtrees');
  if (!msg) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'hudtrees'; el.className = 'hudbox'; el.innerHTML = '<span></span><div class="hudbar"><i></i></div>'; $('#hud').prepend(el); }
  el.firstChild.textContent = msg; el.querySelector('i').style.width = (frac == null ? 100 : Math.round(Math.max(0.03, Math.min(1, frac)) * 100)) + '%';
}
function updateHud() {
  let el = $('#hudzoom'); const need = map && ST.on.alberi && T.n && map.getZoom() < 15;
  if (el) el.textContent = CH.key ? 'INGRANDISCI PER VEDERE GLI ALBERI' : 'INGRANDISCI PER I SINGOLI ALBERI';
  if (!need) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'hudzoom'; el.className = 'hudbox'; el.textContent = 'INGRANDISCI PER I SINGOLI ALBERI'; $('#hud').appendChild(el); }
}

/* =====================================================================
   PANNELLO DEI LIVELLI
   ===================================================================== */
function icoCanvas(src) { const c = mkCanvas(16, 16); c.className = 'pix'; c.getContext('2d').drawImage(src, 0, 0, src.width, src.height, 0, 0, 16, 16); return c; }
function layerRow(key, title, desc, sprite, sub) {
  const row = document.createElement('div'); row.className = 'lay';
  row.appendChild(icoCanvas(sprite));
  const d = document.createElement('div'); d.innerHTML = '<b>' + title + '</b><span>' + desc + '</span>'; row.appendChild(d);
  const sw = document.createElement('input'); sw.type = 'checkbox'; sw.className = 'sw'; sw.id = 'sw-' + key; sw.checked = ST.on[key]; sw.setAttribute('aria-label', title); sw.onchange = () => setLayer(key, sw.checked); row.appendChild(sw);
  $('#layers').appendChild(row);
  if (sub) { const s = document.createElement('div'); s.className = 'sub'; s.innerHTML = sub; $('#layers').appendChild(s); }
}
function buildPanel() {
  layerRow('alberi', 'ALBERI', 'Genere, specie, altezza. Uno sprite per i generi più diffusi.', treeSprite('Platanus', 'n'),
    '<div class="warn" id="treenote">Carico gli alberi…</div><label>Genere<select id="fgen"><option value="">Tutti i generi</option></select></label><label>Specie<select id="fspe"><option value="">Tutte le specie</option></select></label>' +
    '<label>File locale degli alberi (CSV, GeoJSON o ZIP del Comune)<input type="file" id="treefile" accept=".csv,.zip,.geojson,.json" style="margin-top:4px"></label>');
  layerRow('monum', 'ALBERI MONUMENTALI', 'Elenco ufficiale del Comune.', SPR.monum);
  layerRow('parchi', 'AREE VERDI', 'Parchi e giardini con le loro superfici.', SPR.parco,
    '<label class="chk"><input type="checkbox" id="c-orti" checked> Orti urbani comunali</label><label class="chk"><input type="checkbox" id="c-giardini" checked> Giardini condivisi</label>' +
    '<button class="btn sm" id="btipo">Tipologie e gestione</button><div id="tipo"></div>');
  layerRow('fauna', 'FAUNA URBANA', 'Segnalazioni geolocalizzate di cittadini e ricercatori.', SPR.uccelli,
    '<div class="warn">Le segnalazioni seguono la frequentazione delle persone, non la reale distribuzione degli animali.</div>' +
    Object.keys(GR_LBL).map(k => '<label class="chk"><input type="checkbox" data-grp="' + k + '" checked><canvas class="pix" width="16" height="16" style="width:20px;height:20px" data-ico="' + k + '"></canvas>' + GR_LBL[k] + '</label>').join('') +
    '<p class="note" id="faunanum"></p><button class="btn sm" id="moreinat">Carica altre 1.000 da iNaturalist</button>');
  layerRow('nil', 'CONFINI DEI QUARTIERI', '88 Nuclei di Identità Locale (NIL), base delle statistiche.', SPR.nil);
  layerRow('nomi', 'NOMI DI VIE E QUARTIERI', 'Etichette della mappa di base.', SPR.nomi);
  // musica di sottofondo: spenta di default; se scelta, riparte al primo tocco (i browser vietano l'avvio automatico)
  ST.on.musica = musicPref();
  layerRow('musica', 'MUSICA', 'Sottofondo a 8 bit, composto per FogliaMI.', SPR.nota);
  if (musicPref()) armMusic();
  document.addEventListener('visibilitychange', () => { if (!Chip.ctx) return; if (document.hidden) Chip.ctx.suspend(); else if (Chip.on) Chip.ctx.resume(); });
  document.querySelectorAll('[data-ico]').forEach(c => c.getContext('2d').drawImage(SPR[c.dataset.ico], 0, 0));
  document.querySelectorAll('[data-grp]').forEach(c => { c.onchange = () => { FA.groups[c.dataset.grp] = c.checked; if (faunaLayer) faunaLayer.redraw(); }; });
  $('#c-orti').onchange = e => setLayer('orti', e.target.checked); $('#c-giardini').onchange = e => setLayer('giardini', e.target.checked);
  $('#fgen').onchange = e => { ST.fGenus = e.target.value; ST.fSpecies = ''; fillSpecies(); applyTreeState(); };
  $('#fspe').onchange = e => { ST.fSpecies = e.target.value; applyTreeState(); };
  $('#treefile').onchange = e => { const f = e.target.files[0]; if (!f) return; if (!T.done) { e.target.value = ''; hudMsg('ATTENDI LA FINE DEL CARICAMENTO DEGLI ALBERI, POI RIPROVA'); return; } loadTreesFile(f); };
  $('#moreinat').onclick = async () => { const b = $('#moreinat'); b.disabled = true; b.textContent = 'Carico…'; await loadInat(5); b.disabled = false; b.textContent = 'Carica altre 1.000 da iNaturalist'; };
  // Tipologie e gestione: il pulsante apre e chiude la tabella; il contenuto si scarica una volta sola
  $('#btipo').onclick = () => {
    const b = $('#btipo'), el = $('#tipo'), open = b.classList.toggle('on');
    if (!open) { el.style.display = 'none'; return; }
    el.style.display = ''; if (!el.dataset.loaded) loadTipologie();
  };
  // modalità
  MODES.forEach(([m, label, ic]) => { const b = document.createElement('button'); b.className = 'btn' + (m === 'none' ? ' on' : ''); b.dataset.m = m; b.textContent = label; b.onclick = () => setMode(m); $('#modes').appendChild(b); });
  $('#modeui').addEventListener('click', e => { const li = e.target.closest('li[data-g]'); if (li) { ST.fGenus = ST.fGenus === li.dataset.g ? '' : li.dataset.g; ST.fSpecies = ''; $('#fgen').value = ST.fGenus; fillSpecies(); applyTreeState(); } });
  // classifica
  $('#metric').innerHTML = Object.keys(METRICS).map(k => '<option value="' + k + '">' + METRICS[k].l + '</option>').join(''); $('#metric').value = ST.metric;
  $('#metric').onchange = e => { ST.metric = e.target.value; ST.choro = ST.metric; if (ST.mode === 'none') { ST.mode = 'disug'; [...$('#modes').children].forEach(b => b.classList.toggle('on', b.dataset.m === 'disug')); } if (!ST.on.nil) { setLayer('nil', true); $('#sw-nil').checked = true; } restyleNil(); renderRank(); };
  $('#exsmall').onchange = e => { ST.exSmall = e.target.checked; restyleNil(); renderRank(); refreshScatter(); renderDisugKpi(); };
  $('#rank').onclick = e => { const li = e.target.closest('li'); if (!li) return; const o = NIL.byId[+li.dataset.id]; if (!o || !o.layer) return; if (isMobile()) togglePanel(false); map.fitBounds(o.layer.getBounds(), {maxZoom: 15}); L.popup({maxWidth: 300}).setLatLng(o.layer.getBounds().getCenter()).setContent(nilPopup(o)).openOn(map); };
  // schede, pannello, etichette
  [...$('#tabs').children].forEach(b => { b.onclick = () => showTab(b.dataset.t); });
  $('#bpanel').onclick = () => togglePanel();
  $('#bgeo').onclick = locateMe;
  // sul pulsante della posizione lo stesso personaggio che compare sulla mappa
  $('#bgeo .ico').innerHTML = '<img class="pix" width="28" height="28" alt="" src="' + sprURL(SPR.me, 2) + '">';
  if (isMobile()) togglePanel(false);
}
/* Musica scelta in una visita precedente: riparte al primo gesto che il browser accetta per sbloccare l'audio.
   Safari su iPhone non accetta il tocco iniziale (pointerdown) ma solo il dito che si stacca o il clic,
   e a volte serve un secondo gesto: gli ascoltatori restano finché l'audio non risulta davvero attivo. */
function armMusic() {
  const evs = ['touchend', 'click', 'keydown'];
  const done = () => evs.forEach(n => document.removeEventListener(n, go, true));
  const go = () => {
    if (!musicPref()) return done();
    Chip.start(); if (!Chip.ctx) return done();
    if (Chip.ctx.state === 'running') done(); else Chip.ctx.resume().then(() => { if (Chip.ctx.state === 'running') done(); }).catch(() => {});
  };
  evs.forEach(n => document.addEventListener(n, go, true));
}
/* Geolocalizzazione: la posizione resta nel browser, non viene inviata a nessuna fonte */
let meMarker = null, meCircle = null, _msgT = 0;
function hudMsg(t) { let el = $('#hudmsg'); if (!el) { el = document.createElement('div'); el.id = 'hudmsg'; el.className = 'hudbox'; $('#hud').prepend(el); } el.textContent = t; clearTimeout(_msgT); _msgT = setTimeout(() => el.remove(), t.length > 60 ? 12000 : 6000); }
/* Posizione: inseguimento continuo con watchPosition. La prima posizione è spesso una stima da Wi-Fi e celle;
   quelle successive arrivano dal GPS e il cerchio di incertezza si stringe. La mappa segue finché non la si trascina. */
let meWatch = null, meFollow = false, meFirst = true, meBest = Infinity, meNil = -1, meWarnT = 0, meStopT = 0, meAuto = false;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function meUnfollow() { meFollow = false; }
function stopLocate(msg) {
  if (meWatch !== null) navigator.geolocation.clearWatch(meWatch); meWatch = null;
  if (meMarker) { map.removeLayer(meMarker); map.removeLayer(meCircle); meMarker = meCircle = null; }
  clearTimeout(meWarnT); clearTimeout(meStopT); map.off('dragstart', meUnfollow); $('#bgeo').classList.remove('on');
  if (msg) hudMsg(msg);
}
/* auto = true all'apertura della pagina: zoom 15 (il proprio quartiere e quelli vicini), nessun messaggio se il
   permesso è negato, e se si è fuori da Milano la mappa resta sulla città */
function locateMe(auto) {
  auto = auto === true;
  if (!navigator.geolocation) { if (!auto) hudMsg('QUESTO BROWSER NON OFFRE LA POSIZIONE'); return; }
  if (meWatch !== null) { stopLocate('POSIZIONE SPENTA'); return; }
  $('#bgeo').classList.add('on'); if (isMobile() && !auto) togglePanel(false);
  meAuto = auto; meFollow = true; meFirst = true; meBest = Infinity; meNil = -1; map.on('dragstart', meUnfollow);
  if (!auto) hudMsg('CERCO LA POSIZIONE…');
  meWatch = navigator.geolocation.watchPosition(onMyPos, onMyPosErr, {enableHighAccuracy: true, maximumAge: 0, timeout: 30000});
  // dopo qualche secondo una precisione oltre il chilometro vuol dire posizione approssimata per scelta del sistema
  meWarnT = setTimeout(() => { if (meWatch !== null && meBest > 1000 && isFinite(meBest)) hudMsg('POSIZIONE MOLTO APPROSSIMATA (±' + fmt(meBest / 1000, 1) + ' KM). ' +
    (isIOS() ? 'SU IPHONE: IMPOSTAZIONI › PRIVACY E SICUREZZA › LOCALIZZAZIONE › SITI WEB DI SAFARI › ATTIVA «POSIZIONE ESATTA»' : 'CONTROLLA CHE LA POSIZIONE PRECISA SIA CONSENTITA AL BROWSER')); }, 9000);
  meStopT = setTimeout(() => stopLocate('POSIZIONE SPENTA DOPO 20 MINUTI, PER RISPARMIARE BATTERIA'), 20 * 60000);
}
function onMyPos(p) {
  const ll = [p.coords.latitude, p.coords.longitude], acc = p.coords.accuracy || 0, prev = meBest; meBest = Math.min(meBest, acc);
  if (!meMarker) {
    meCircle = L.circle(ll, {radius: acc, pane: 'vec', color: PAL.water, weight: 2, dashArray: '4 4', fillColor: PAL.sky, fillOpacity: 0.18, interactive: false}).addTo(map);
    meMarker = L.marker(ll, {icon: L.divIcon({className: 'me-ico', iconSize: [32, 32], iconAnchor: [16, 16], html: '<div class="me-b"><img class="pix" width="32" height="32" alt="Tu sei qui" src="' + sprURL(SPR.me, 2) + '"></div>'}), zIndexOffset: 1000, interactive: false}).addTo(map);
  } else { meMarker.setLatLng(ll); meCircle.setLatLng(ll).setRadius(acc); }
  // quando ci si muove il personaggio si gira verso la direzione di marcia
  const hd = p.coords.heading, img = meMarker.getElement() && meMarker.getElement().querySelector('img');
  if (img && hd != null && isFinite(hd) && (p.coords.speed == null || p.coords.speed > 0.4)) img.style.transform = 'rotate(' + Math.round(hd) + 'deg)';
  const nid = NIL.list.length ? nilOf(ll[1], ll[0]) : 0;
  if (meFirst && meAuto && NIL.list.length && !nid) { stopLocate('SEI FUORI DAL COMUNE DI MILANO: LA MAPPA RESTA SULLA CITTÀ'); return; }
  if (meFirst) { meFirst = false; map.setView(ll, meAuto ? 15 : Math.max(map.getZoom(), acc > 300 ? 15 : 17)); }
  else if (meFollow) {
    // quando il GPS si aggancia (da oltre 300 m a meno di 50) avvicino la vista una volta
    if (!meAuto && prev > 300 && acc <= 50 && map.getZoom() < 17) map.setView(ll, 17); else map.panTo(ll, {animate: true, duration: 0.5});
  }
  if (nid !== meNil || (prev > 100 && acc <= 30)) { meNil = nid; hudMsg(nid ? 'SEI A ' + NIL.byId[nid].name.toUpperCase() + ' (±' + Math.round(acc) + ' M)' : 'SEI FUORI DAL COMUNE DI MILANO'); }
}
function onMyPosErr(e) {
  if (e.code === 1 && meAuto) { stopLocate(); return; } // all'apertura un rifiuto non merita un messaggio
  if (e.code === 1) { stopLocate(isIOS() ? 'POSIZIONE NEGATA. SU IPHONE: IMPOSTAZIONI › PRIVACY E SICUREZZA › LOCALIZZAZIONE › SITI WEB DI SAFARI, POI RICARICA' : 'POSIZIONE NEGATA: CONSENTILA PER QUESTO SITO DALLE IMPOSTAZIONI DEL BROWSER, POI RICARICA'); return; }
  if (!meMarker && !meAuto) hudMsg(e.code === 3 ? 'LA POSIZIONE TARDA AD ARRIVARE: SE SEI AL CHIUSO, PROVA VICINO A UNA FINESTRA' : 'POSIZIONE NON DISPONIBILE, RIPROVO…');
}
function showTab(t) { [...$('#tabs').children].forEach(b => b.classList.toggle('on', b.dataset.t === t)); document.querySelectorAll('.tab').forEach(s => s.classList.toggle('on', s.id === 't-' + t)); if (t === 'incroci') refreshScatter(); togglePanel(true); }
function togglePanel(open) { const p = $('#panel'), o = open == null ? p.classList.contains('closed') : open; p.classList.toggle('closed', !o); $('#bpanel').classList.toggle('on', o); }
function buildTreeFilters() {
  const sel = $('#fgen'); if (!sel) return;
  const gs = T.genera.map((g, i) => [g, T.gCount[i]]).sort((a, b) => b[1] - a[1]);
  sel.innerHTML = '<option value="">Tutti i generi (' + fmt(T.n) + ')</option>' + gs.map(([g, n]) => '<option value="' + esc(g) + '">' + esc(g) + (NOMI[g] ? ' · ' + esc(NOMI[g]) : '') + ' (' + fmt(n) + ')</option>').join('');
  if (!T.gIdx.has(ST.fGenus)) ST.fGenus = ''; sel.value = ST.fGenus; fillSpecies();
}
function fillSpecies() {
  const sel = $('#fspe'), gi = ST.fGenus ? T.gIdx.get(ST.fGenus) : -1;
  let sp = T.species.map((s, i) => [s, T.spCount[i], T.spGenus[i]]); if (gi >= 0) sp = sp.filter(s => s[2] === gi);
  sp.sort((a, b) => b[1] - a[1]); sp = sp.slice(0, 400);
  sel.innerHTML = '<option value="">Tutte le specie' + (gi >= 0 ? ' di ' + esc(ST.fGenus) : '') + '</option>' + sp.map(s => '<option value="' + esc(s[0]) + '">' + esc(s[0]) + ' (' + fmt(s[1]) + ')</option>').join('');
  sel.value = ST.fSpecies;
}
function renderTreeNote() {
  const el = $('#treenote'); if (!el) return;
  if (!T.n) el.innerHTML = '<b>Alberi non disponibili.</b> Il dataset del Comune oggi non è pubblicato e le fonti alternative non hanno risposto. Puoi caricare qui sotto il file ufficiale, se lo hai.';
  else if (T.source === 'osm') el.innerHTML = '<b>' + fmt(T.n) + ' alberi da OpenStreetMap</b>, in attesa che il Comune ripubblichi il suo censimento. Mappatura volontaria e incompleta; la specie è nota per ' + fmt(T.withSpecies / T.n * 100, 0) + '% dei punti.';
  else el.innerHTML = '<b>' + fmt(T.n) + ' alberi</b> da ' + T.sourceNote + '. Comprende solo le piante gestite dal Comune: mancano quelle private e le aree boscate.';
}
function renderFaunaNote() { const el = $('#faunanum'); if (el) el.textContent = fmt(FA.list.length) + ' segnalazioni sulla mappa: ' + fmt(FA.counts.inat) + ' iNaturalist, ' + fmt(FA.counts.gbif) + ' GBIF' + (FA.counts.ebird ? ', ' + fmt(FA.counts.ebird) + ' eBird' : '') + '.'; }
async function loadTipologie() {
  const el = $('#tipo'); el.innerHTML = '<p class="note">Carico…</p>';
  try {
    const js = await fetchJSON(CFG.ckan + '/api/3/action/datastore_search?resource_id=' + CFG.rs.tipo + '&limit=5000&fields=Classificazione,AFFIDATARIO,Superficie%20totale%20in%20mq', {timeout: 40000});
    const agg = (f) => { const m = new Map(); for (const r of js.result.records) { const k = r[f] || 'Non indicato', v = num(String(r['Superficie totale in mq'] || '').replace(/\./g, '')) || 0; const a = m.get(k) || [0, 0]; a[0] += v; a[1]++; m.set(k, a); } return [...m.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 8); };
    const tb = (t, rows) => '<table class="tbl"><tr><th>' + t + '</th><th>ettari</th></tr>' + rows.map(r => '<tr><td>' + esc(r[0]) + ' <small>(' + r[1][1] + ')</small></td><td>' + fmt(r[1][0] / 1e4, 1) + '</td></tr>').join('') + '</table>';
    el.dataset.loaded = '1';
    el.innerHTML = '<p class="note">Censimento delle aree verdi comunali del 2014 (' + fmt(js.result.records.length) + ' aree), non georeferenziato: per questo è una tabella e non un livello.</p>' + tb('Classificazione', agg('Classificazione')) + tb('Affidatario', agg('AFFIDATARIO'));
    src('tipo', 'Aree verdi per tipologia (2014)', 'ok', fmt(js.result.records.length) + ' aree · Comune di Milano, ds339.');
  } catch (e) { el.innerHTML = '<p class="note">Non disponibile: ' + esc(e.message) + '</p>'; src('tipo', 'Aree verdi per tipologia (2014)', 'err', esc(e.message)); }
}

function renderStatic() {
  $('#credits').innerHTML = '<ul style="padding-left:18px;margin:6px 0;font-size:13px">' +
    '<li><b>Comune di Milano, Open Data</b> (dati.comune.milano.it): confini dei NIL, residenti per NIL, parchi e giardini, orti urbani, giardini condivisi, alberi monumentali, aree verdi per tipologia, indici di calore e di verde per NIL (elaborazione progetto SPOTTED), censimento degli alberi (dataset ds2484 aggiornato al 31/03/2024, ritirato dal portale: il sito ne pubblica una copia ridotta alle colonne usate). Licenza <a href="https://creativecommons.org/licenses/by/4.0/deed.it" target="_blank" rel="noopener">CC BY 4.0</a>.</li>' +
    '<li><b>iNaturalist</b> (inaturalist.org): osservazioni e fotografie dei singoli utenti, ciascuna con la propria licenza indicata nella scheda. Uso tramite API pubblica.</li>' +
    '<li><b>GBIF</b> (gbif.org): occorrenze dai dataset aderenti, con licenze CC0, CC BY o CC BY-NC indicate per record. GBIF.org, Occurrence Search.</li>' +
    '<li><b>eBird</b> (Cornell Lab of Ornithology): osservazioni di uccelli dal dataset eBird Observation Dataset pubblicato su GBIF, con la licenza indicata per record.</li>' +
    '<li><b>Wikipedia e Wikimedia Commons</b>: nei popup di alberi e animali, la prima frase della voce (testo CC BY-SA 4.0, con link alla voce) e una foto, con autore e licenza indicati sotto l\'immagine. Per sette alberi monumentali, foto dell\'esemplare da Commons (tre con attribuzione probabile); per gli altri, foto della specie.</li>' +
    '<li><b>Schede degli alberi monumentali</b>: storia, età, fauna e stato di salute riassunti da FogliaMI a partire dalle pagine del Comune di Milano (aggiornate al 16/06/2026), con link alla scheda originale.</li>' +
    '<li><b>OpenStreetMap</b>: dati © OpenStreetMap contributors, licenza <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">ODbL</a>, per la mappa di base e, come ripiego, per gli alberi (Overpass API).</li>' +
    '<li><b>CARTO</b>: tasselli della mappa di base (Positron), © CARTO.</li>' +
    '<li><b>Leaflet</b> 1.9.4 (BSD-2) per la mappa; font Press Start 2P (SIL OFL) per i titoli.</li>' +
    '<li>Sprite e grafica pixel art: originali, generati dal codice della pagina.</li></ul>';
  $('#method').innerHTML = '<ul style="padding-left:18px;margin:6px 0;font-size:13px">' +
    '<li>I dati arrivano dalle fonti all\'apertura della pagina. Fanno eccezione il censimento degli alberi, di cui il sito pubblica una copia perché il Comune l\'ha ritirato dal portale, e le tabelle di fioritura, potenziale allergenico e nomi comuni, scritte a mano e da considerare approssimazioni.</li>' +
    '<li>Gli alberi sono solo quelli gestiti dal Comune. Il verde privato e le aree boscate non compaiono, e pesano molto in alcuni quartieri.</li>' +
    '<li>I valori per abitante escludono di norma i NIL con meno di 1.000 residenti, dove un parco e poche case producono numeri fuori scala.</li>' +
    '<li>Le superfici a parco vengono dal solo dataset "parchi e giardini"; ogni area è assegnata al NIL del suo centro.</li>' +
    '<li>La fauna è un insieme di segnalazioni volontarie: descrive lo sforzo di osservazione almeno quanto la presenza degli animali.</li>' +
    '<li>Il calore è un indice per quartiere di luglio 2024, non una temperatura misurata via per via.</li></ul>';
}

/* =====================================================================
   AVVIO
   ===================================================================== */
async function main() {
  Loader.init(); buildSprites();
  if (typeof L === 'undefined') { Loader.msg('Non riesco a caricare la libreria della mappa (Leaflet). Serve una connessione a internet.', true); return; }
  initMap(); renderStatic(); buildPanel();
  treeLayer = new SpriteLayer(drawTrees).addTo(map); faunaLayer = new SpriteLayer(drawFauna).addTo(map);
  src('nil', 'Confini dei NIL', 'wait', ''); src('pop', 'Residenti per NIL', 'wait', ''); src('parchi', 'Parchi e giardini', 'wait', ''); src('orti', 'Orti urbani', 'wait', ''); src('giardini', 'Giardini condivisi', 'wait', '');
  src('monum', 'Alberi monumentali', 'wait', ''); src('indici', 'Indici di calore e di verde', 'wait', ''); src('alberi', 'Alberi', 'wait', ''); src('inat', 'iNaturalist', 'wait', ''); src('gbif', 'GBIF', 'wait', '');
  src('ebird', 'eBird (via GBIF)', 'wait', '');
  src('pollini', 'Pollini (ARPA / ATS)', 'off', 'Nessuna fonte aperta e leggibile trovata: sezione predisposta.');
  src('landsat', 'Temperatura Landsat', 'off', 'Non integrabile in diretta senza un servizio intermedio: sezione predisposta.');
  const tk = {nil: Loader.task('Confini dei quartieri', 2), pop: Loader.task('Residenti', 1), parchi: Loader.task('Parchi e giardini', 2), orti: Loader.task('Orti urbani', 1), giardini: Loader.task('Giardini condivisi', 1),
    monum: Loader.task('Alberi monumentali', 1), indici: Loader.task('Calore e verde', 1), alberi: Loader.task('Alberi', 4), fauna: Loader.task('Fauna', 3)};
  const hard = setTimeout(() => Loader.finish(), 45000);

  // 1. NIL: servono a tutto il resto
  const nilGj = await loadCkanGeo('nil', 'Confini dei NIL');
  if (nilGj) { setNil(nilGj); buildNilLayer(); if (ST.on.nil) LY.nil.addTo(map); map.fitBounds(LY.nil.getBounds(), isMobile() ? {padding: [6, 6]} : {paddingTopLeft: [360, 10], paddingBottomRight: [10, 10]}); }
  tk.nil.end('Quartieri tracciati');

  // 2. tutto il resto in parallelo
  const pPop = (async () => {
    try {
      if (!NIL.list.length) throw new Error('confini dei quartieri non disponibili');
      const id = CFG.rs.pop, sql = 'SELECT "IdNil", SUM("Residenti") AS pop, MAX("Anno") AS anno FROM "' + id + '" WHERE "Anno" = (SELECT MAX("Anno") FROM "' + id + '") GROUP BY "IdNil"';
      const js = await fetchJSON(CFG.ckan + '/api/3/action/datastore_search_sql?sql=' + encodeURIComponent(sql), {timeout: 40000});
      let tot = 0, yr = ''; for (const r of js.result.records) { const o = NIL.byId[+r.IdNil]; if (o) { o.pop = +r.pop; o.popYear = r.anno; tot += +r.pop; yr = r.anno; } }
      if (!tot) throw new Error('nessun residente attribuito ai quartieri');
      src('pop', 'Residenti per NIL', 'ok', fmt(tot) + ' residenti al 31/12/' + esc(yr) + ' · Comune di Milano, ds27 (interrogazione SQL sul DataStore).');
    } catch (e) { src('pop', 'Residenti per NIL', 'err', esc(e.message)); }
    tk.pop.end('Residenti contati'); statsChanged(true);
  })();
  const pIdx = (async () => {
    try {
      const get = async (rid, f) => { const js = await fetchJSON(CFG.ckan + '/api/3/action/datastore_search?resource_id=' + rid + '&limit=200', {timeout: 30000}); for (const r of js.result.records) { const o = NIL.byId[+r.ID_NIL]; if (o) o[f] = +r.value; } };
      if (!NIL.list.length) throw new Error('confini dei quartieri non disponibili');
      await Promise.all([get(CFG.rs.heat, 'heat'), get(CFG.rs.green, 'green')]);
      src('indici', 'Indici di calore e di verde', 'ok', 'Per NIL, luglio 2024 · Comune di Milano su elaborazione SPOTTED (ds2811, ds2813).');
    } catch (e) { src('indici', 'Indici di calore e di verde', 'err', esc(e.message)); }
    tk.indici.end('Indici satellitari letti'); statsChanged(true);
  })();
  const pParchi = loadCkanGeo('parchi', 'Parchi e giardini').then(gj => { if (gj) { buildParks(gj); if (ST.on.parchi) LY.parchi.addTo(map); if (LY.nil) LY.nil.bringToBack(); } tk.parchi.end('Parchi disegnati'); statsChanged(true); });
  const pOrti = loadCkanGeo('orti', 'Orti urbani').then(gj => { if (gj) { buildPlots('orti', gj, PAL.orange, SPR.orto, 'Orto urbano comunale'); if (ST.on.orti) LY.orti.addTo(map); } tk.orti.end('Orti seminati'); });
  const pGiard = loadCkanGeo('giardini', 'Giardini condivisi').then(gj => { if (gj) { buildPlots('giardini', gj, PAL.pink, SPR.giardino, 'Giardino condiviso'); if (ST.on.giardini) LY.giardini.addTo(map); } tk.giardini.end('Giardini condivisi'); });
  const pMon = loadCkanGeo('monum', 'Alberi monumentali').then(gj => { if (gj) { buildMonum(gj); if (ST.on.monum) LY.monum.addTo(map); } tk.monum.end('Alberi monumentali'); });
  fetchJSON(CFG.monumSchede, {timeout: 30000}).then(j => { MONS = j; }).catch(() => {}); // senza schede i popup mostrano solo i dati del dataset
  loadTrees(); firstTrees.then(() => tk.alberi.end(T.n ? 'Alberi piantati' : 'Alberi non disponibili'));
  // la fauna (iNaturalist, poi GBIF ed eBird) si carica durante la schermata iniziale, con un tetto di attesa
  const pFauna = loadInat(1).then(() => Promise.all([loadGbif(), loadGbifNilCounts()])).then(() => tk.fauna.end('Uccelli e insetti avvistati'));

  // la mappa si apre quando i livelli di base sono pronti; alberi e fauna possono proseguire dietro
  const treesSoon = Promise.race([firstTrees, sleep(14000)]), faunaSoon = Promise.race([pFauna, sleep(12000)]);
  // residenti e indici arrivano solo dal portale del Comune, che a volte resta muto: oltre gli 8 s si apre comunque
  const portaleSoon = Promise.race([Promise.all([pPop, pIdx]), sleep(8000)]);
  await Promise.all([portaleSoon, pParchi, pOrti, pGiard, pMon, treesSoon, faunaSoon]);
  clearTimeout(hard); Loader.finish();
  setMode('none');
  setTimeout(() => locateMe(true), 1900); // dopo la chiusura della schermata di caricamento (START si preme da solo)
  fetchJSON(CFG.wikiFauna, {timeout: 30000}).then(j => { WIKIF = j.species || null; }).catch(() => {});
  fetchJSON(CFG.wiki, {timeout: 30000}).then(j => { WIKI = j.species || null; const n = WIKI ? Object.keys(WIKI).length : 0;
    src('wiki', 'Wikipedia, schede delle specie', n ? 'ok' : 'err', fmt(n) + ' schede con testo, link e foto (dove disponibile), raccolte il ' + esc(String(j.updated || '').split('-').reverse().join('/')) + '.'); })
    .catch(e => src('wiki', 'Wikipedia, schede delle specie', 'err', esc(e.message) + ': i popup degli alberi restano senza foto.'));
  // altre 400 osservazioni iNaturalist dopo l'apertura: una pagina sola basta per partire
  pFauna.then(() => sleep(1100)).then(() => loadInat(2));
}
/* La pagina non deve mai scorrere né ingrandirsi: su iPhone la mappa sporge sotto la barra di Safari
   (vedi style.css) e qualunque spostamento farebbe ricomparire una fascia scura. Solo mappa e pannello
   rispondono ai gesti. */
addEventListener('scroll', () => { if (scrollY || scrollX) scrollTo(0, 0); }, {passive: true});
if (window.visualViewport) visualViewport.addEventListener('scroll', () => { if (scrollY) scrollTo(0, 0); });
document.addEventListener('gesturestart', e => { if (!(e.target.closest && e.target.closest('#map'))) e.preventDefault(); });
window.addEventListener('DOMContentLoaded', main);
