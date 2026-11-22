import { icon } from './icons.js';

// ---------- utilitaires ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => (n == null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n));
const nfmt = (n, d = 0) => (n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(n));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const DAY = 864e5;
const ago = (d) => {
  const ms = Date.now() - new Date(d).getTime();
  const h = ms / 36e5;
  if (h < 1) return 'à l’instant';
  if (h < 24) return `il y a ${Math.floor(h)} h`;
  const j = Math.floor(h / 24);
  if (j < 60) return `il y a ${j} j`;
  return `il y a ${Math.floor(j / 30)} mois`;
};
const LS = {
  get(k, d) { try { const v = localStorage.getItem(`agregimmo:${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`agregimmo:${k}`, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};
// Deux modes : serveur Node (si présent) ou moteur embarqué dans le navigateur.
let backend = null;
async function getBackend() {
  if (backend) return backend;
  try {
    const r = await fetch('api/state', { cache: 'no-store' });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) return (backend = { mode: 'server' });
  } catch { /* pas de serveur */ }
  const { createLocalEngine } = await import('./local.js');
  return (backend = { mode: 'local', engine: createLocalEngine() });
}
async function api(path, { method = 'GET', body } = {}) {
  const b = await getBackend();
  if (b.mode === 'local') {
    const u = new URL(path, 'http://x');
    const r = await b.engine.handle(method, `/api${u.pathname}`, body ? structuredClone(body) : {}, u.searchParams);
    if (!r.found) throw new Error('Route inconnue');
    return structuredClone(r.data);
  }
  const res = await fetch(`api${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
  return json;
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3200);
}
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const TYPES = [
  ['appartement', 'Appartement'], ['maison', 'Maison'], ['immeuble', 'Immeuble'], ['terrain', 'Terrain'], ['local', 'Local'], ['parking', 'Parking'],
];
const TYPE_LABEL = Object.fromEntries(TYPES);
const SIGNALS = [
  ['under', 'Sous le marché', 'euro'], ['rare', 'Rare', 'sparkle'], ['drop', 'Baisse de prix', 'down'], ['yield', 'Rendement ≥ 7 %', 'yield'],
  ['multi', 'Multi-portails', 'layers'], ['repost', 'Remis en ligne', 'repost'], ['old', 'En vente > 90 j', 'clock'], ['dpe', 'DPE F / G', 'bolt'],
];
const AGES = [['all', 'Tout'], ['1', '24 h'], ['3', '3 j'], ['7', '7 j'], ['30', '30 j'], ['old', '> 90 j']];
const STATUSES = [['suivi', 'Suivi'], ['visite', 'À visiter'], ['visite-ok', 'Visité'], ['offre', 'Offre faite'], ['ecarte', 'Écarté']];
const DEFAULT_FILTERS = {
  types: [], priceMin: '', priceMax: '', surfMin: '', surfMax: '', roomsMin: 0, ppm2Max: '', age: 'all',
  scoreMin: 0, signals: [], inZone: true, cities: [], includeGone: false,
};

// ---------- état ----------
const state = {
  clusters: [], settings: null, searches: [], meta: {},
  filters: { ...DEFAULT_FILTERS, ...LS.get('filters', {}) },
  q: '', sort: LS.get('sort', 'score'), view: LS.get('view', 'grid'), tab: 'all',
  limit: 48, prevVisit: LS.get('lastVisit', Date.now()), showFilters: LS.get('showFilters', true),
};
LS.set('lastVisit', Date.now());

// ---------- filtrage / tri ----------
function matches(c, f, { tab = 'all', q = '' } = {}) {
  const s = state.settings;
  if (!f.includeGone && !c.active && tab !== 'favs') return false;
  if (tab === 'favs' && !c.favorite) return false;
  if (tab === 'opps' && c.score < 60) return false;
  if (tab === 'new' && c.daysOnline > (s?.newDays ?? 3)) return false;
  if (f.types.length && !f.types.includes(c.type)) return false;
  if (f.priceMin && (c.price ?? 0) < +f.priceMin) return false;
  if (f.priceMax && (c.price ?? Infinity) > +f.priceMax) return false;
  if (f.surfMin && (c.surface ?? 0) < +f.surfMin) return false;
  if (f.surfMax && (c.surface ?? Infinity) > +f.surfMax) return false;
  if (f.roomsMin && (c.rooms ?? 0) < f.roomsMin) return false;
  if (f.ppm2Max && (c.ppm2 ?? Infinity) > +f.ppm2Max) return false;
  if (f.scoreMin && c.score < f.scoreMin) return false;
  if (f.age === 'old' ? c.daysOnline < 90 : f.age !== 'all' && c.daysOnline > +f.age) return false;
  if (f.cities.length && !f.cities.includes(c.city)) return false;
  if (f.inZone && s?.zone && c.distanceKm != null && c.distanceKm > (s.zone.radiusKm || 15)) return false;
  if (f.signals.length) {
    const keys = new Set(c.tags.map((t) => t.k));
    if (c.discount >= 0.1) keys.add('under');
    if (!f.signals.every((k) => keys.has(k))) return false;
  }
  if (q) {
    const hay = norm(`${c.title} ${c.description} ${c.city} ${c.postcode} ${TYPE_LABEL[c.type] || ''}`);
    if (!norm(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}

const SORTS = {
  score: (a, b) => b.score - a.score,
  recent: (a, b) => new Date(b.firstSeen) - new Date(a.firstSeen),
  oldest: (a, b) => new Date(a.firstSeen) - new Date(b.firstSeen),
  'price-asc': (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
  'price-desc': (a, b) => (b.price ?? 0) - (a.price ?? 0),
  ppm2: (a, b) => (a.ppm2 ?? Infinity) - (b.ppm2 ?? Infinity),
  discount: (a, b) => (b.discount ?? -9) - (a.discount ?? -9),
  drop: (a, b) => (b.drop ?? 0) - (a.drop ?? 0),
  yield: (a, b) => (b.yield ?? 0) - (a.yield ?? 0),
  surface: (a, b) => (b.surface ?? 0) - (a.surface ?? 0),
  distance: (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
};

function visible() {
  return state.clusters.filter((c) => matches(c, state.filters, { tab: state.tab, q: state.q })).sort(SORTS[state.sort] || SORTS.score);
}

function activeFilterCount(f = state.filters) {
  let n = 0;
  for (const [k, v] of Object.entries(f)) {
    const d = DEFAULT_FILTERS[k];
    if (Array.isArray(v) ? v.length : v !== d) n++;
  }
  return n;
}

// ---------- rendu ----------
function scoreRing(score, size = 42) {
  const r = size / 2 - 3;
  const C = 2 * Math.PI * r;
  const color = score >= 70 ? 'var(--accent)' : score >= 50 ? 'var(--gold)' : 'var(--faint)';
  return `<div class="score" style="width:${size}px;height:${size}px" title="Score d'opportunité">
    <svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="3"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(C * score) / 100} ${C}"/></svg>
    <span class="num">${score}</span></div>`;
}

const initials = (label) => esc(String(label).replace(/\(.*\)/, '').trim().split(/[\s.-]+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase());
function sourcesDots(c) {
  return `<div class="srcs">${c.members.filter((m, i, a) => a.findIndex((x) => x.source === m.source) === i).slice(0, 4)
    .map((m) => `<span class="srcdot" title="${esc(m.sourceLabel)}">${initials(m.sourceLabel)}</span>`).join('')}</div>`;
}

function thumb(c) {
  return c.photos?.[0]
    ? `<img src="${esc(c.photos[0])}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : `<div class="pattern"></div>${icon(c.type || 'maison')}`;
}

function facts(c) {
  return [
    c.surface ? `<span>${icon('ruler')}${nfmt(c.surface)} m²</span>` : '',
    c.rooms ? `<span>${icon('door')}${c.rooms} p.</span>` : '',
    c.landSurface && c.type !== 'appartement' ? `<span>${icon('terrain')}${nfmt(c.landSurface)} m²</span>` : '',
    `<span>${icon('pin')}${esc(c.city || '—')}</span>`,
  ].join('');
}

function tagsHtml(c, max = 3) {
  const order = ['under', 'rare', 'drop', 'yield', 'new', 'multi', 'repost', 'old', 'dpe', 'gap', 'over'];
  return [...c.tags].sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k)).slice(0, max)
    .map((t) => `<span class="tag ${t.k}">${esc(t.label)}</span>`).join('');
}

const isFresh = (c) => new Date(c.firstSeen).getTime() > state.prevVisit;

function card(c) {
  return `<article class="card ${c.active ? '' : 'gone'}" data-id="${esc(c.id)}">
    <div class="thumb">${thumb(c)}${scoreRing(c.score)}
      ${isFresh(c) ? '<span class="newdot" title="Nouveau depuis votre dernière visite"></span>' : ''}
      <button class="fav ${c.favorite ? 'on' : ''}" data-fav="${esc(c.id)}" title="${c.favorite ? 'Retirer des favoris' : 'Suivre ce bien'}">${icon('heart')}</button>
    </div>
    <div class="body">
      <div class="price"><b class="num">${eur(c.price)}${c.initialPrice > c.price ? `<s>${eur(c.initialPrice)}</s>` : ''}</b>
        <small class="num">${c.ppm2 ? `${nfmt(c.ppm2)} €/m²` : ''}</small></div>
      <div class="title">${esc(TYPE_LABEL[c.type] || 'Bien')} · ${esc(c.title)}</div>
      <div class="facts">${facts(c)}</div>
      <div class="tags">${tagsHtml(c)}</div>
      <div class="foot">${sourcesDots(c)}<span>${c.active ? `En ligne ${ago(c.firstSeen).replace('il y a ', 'depuis ')}` : 'Retirée'}</span></div>
    </div>
  </article>`;
}

function row(c) {
  return `<div class="row" data-id="${esc(c.id)}">
    ${scoreRing(c.score, 38)}
    <div class="t"><b>${esc(TYPE_LABEL[c.type] || 'Bien')} ${c.surface ? `${nfmt(c.surface)} m²` : ''} ${c.rooms ? `· ${c.rooms} p.` : ''} — ${esc(c.city || '')}</b>
      <small>${esc(c.title)}</small></div>
    <div><b class="num">${eur(c.price)}</b><br><small class="muted num">${c.ppm2 ? `${nfmt(c.ppm2)} €/m²` : ''}</small></div>
    <div class="hide-sm muted">${c.active ? ago(c.firstSeen) : 'Retirée'}</div>
    <div class="tags hide-sm">${tagsHtml(c, 3)}</div>
    <div class="hide-sm">${sourcesDots(c)}</div>
    <button class="fav ${c.favorite ? 'on' : ''}" data-fav="${esc(c.id)}" title="Suivre">${icon('heart')}</button>
  </div>`;
}

function renderSummary(list) {
  const base = state.clusters.filter((c) => matches(c, { ...state.filters, signals: [] }, { tab: 'all', q: state.q }));
  const opps = base.filter((c) => c.score >= 60).length;
  const fresh = base.filter((c) => c.daysOnline <= (state.settings?.newDays ?? 3)).length;
  const multi = base.filter((c) => c.sources.length > 1).length;
  const favs = state.clusters.filter((c) => c.favorite).length;
  $('#summary').innerHTML = `
    <button class="stat" data-tab="all"><b class="num">${nfmt(list.length)}</b><small>biens affichés · ${nfmt(state.meta.listings)} annonces</small></button>
    <button class="stat" data-tab="opps"><b class="num">${opps}</b><small>opportunités (score ≥ 60)</small></button>
    <button class="stat" data-tab="new"><b class="num">${fresh}</b><small>nouveaux (≤ ${state.settings?.newDays ?? 3} j)</small></button>
    <button class="stat" data-signal="multi"><b class="num">${multi}</b><small>recoupés multi-portails · ${favs} suivis</small></button>`;
}

function render() {
  const list = visible();
  renderSummary(list);
  const n = activeFilterCount();
  const cnt = $('#btn-filters .count');
  cnt.hidden = !n;
  cnt.textContent = n;
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab));
  $$('#views button').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
  $('#sort').value = state.sort;
  const res = $('#results');
  const map = $('#map');
  if (state.view === 'map') {
    res.hidden = true;
    map.hidden = false;
    renderMap(list);
    return;
  }
  map.hidden = true;
  res.hidden = false;
  if (!list.length) {
    res.innerHTML = `<div class="empty">${icon(state.tab === 'favs' ? 'heart' : 'search')}<div>${state.tab === 'favs'
      ? 'Aucun bien suivi. Cliquez sur le cœur d’une annonce pour la suivre.'
      : 'Aucun bien ne correspond. Élargissez les filtres ou la zone.'}</div>
      ${n ? '<button class="btn more" data-reset-filters>Réinitialiser les filtres</button>' : ''}</div>`;
    return;
  }
  const shown = list.slice(0, state.limit);
  res.innerHTML = (state.view === 'list' ? `<div class="rows">${shown.map(row).join('')}</div>` : `<div class="grid">${shown.map(card).join('')}</div>`)
    + (list.length > state.limit ? `<button class="btn more" data-more>Afficher plus (${list.length - state.limit})</button>` : '');
}

// ---------- filtres ----------
function renderFilters() {
  const f = state.filters;
  const s = state.settings;
  const cities = [...new Set(state.clusters.filter((c) => c.active).map((c) => c.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  $('#filters').innerHTML = `
    <div class="fhead"><strong>Filtres</strong><button class="link-btn" data-reset-filters>Réinitialiser</button></div>
    <div class="fgroup"><h4>Zone <output>${esc(s?.zone?.city || '')}</output></h4>
      <label class="toggle"><span>${icon('target')}Dans un rayon de <b>&nbsp;${s?.zone?.radiusKm ?? 15} km</b></span><input type="checkbox" class="switch" data-f="inZone" ${f.inZone ? 'checked' : ''}></label>
      <input type="range" min="1" max="60" value="${s?.zone?.radiusKm ?? 15}" data-radius>
      ${cities.length ? `<div class="chips" style="margin-top:8px">${cities.map((c) => `<button class="chip ${f.cities.includes(c) ? 'on' : ''}" data-arr="cities" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
    </div>
    <div class="fgroup"><h4>Type de bien</h4><div class="chips">
      ${TYPES.map(([k, l]) => `<button class="chip ${f.types.includes(k) ? 'on' : ''}" data-arr="types" data-v="${k}">${icon(k)}${l}</button>`).join('')}
    </div></div>
    <div class="fgroup"><h4>Mis en ligne</h4><div class="chips">
      ${AGES.map(([k, l]) => `<button class="chip ${f.age === k ? 'on' : ''}" data-one="age" data-v="${k}">${l}</button>`).join('')}
    </div></div>
    <div class="fgroup"><h4>Signaux</h4><div class="chips">
      ${SIGNALS.map(([k, l, ic]) => `<button class="chip ${f.signals.includes(k) ? 'on' : ''}" data-arr="signals" data-v="${k}">${icon(ic)}${l}</button>`).join('')}
    </div></div>
    <div class="fgroup"><h4>Score minimum <output>${f.scoreMin || 0}</output></h4>
      <input type="range" min="0" max="90" step="5" value="${f.scoreMin || 0}" data-f="scoreMin" data-num></div>
    <div class="fgroup"><h4>Prix</h4><div class="range2">
      <input class="field num" inputmode="numeric" placeholder="Min €" value="${esc(f.priceMin)}" data-f="priceMin">
      <input class="field num" inputmode="numeric" placeholder="Max €" value="${esc(f.priceMax)}" data-f="priceMax"></div>
      <input class="field num" style="margin-top:6px" inputmode="numeric" placeholder="Prix max au m²" value="${esc(f.ppm2Max)}" data-f="ppm2Max"></div>
    <div class="fgroup"><h4>Surface</h4><div class="range2">
      <input class="field num" inputmode="numeric" placeholder="Min m²" value="${esc(f.surfMin)}" data-f="surfMin">
      <input class="field num" inputmode="numeric" placeholder="Max m²" value="${esc(f.surfMax)}" data-f="surfMax"></div></div>
    <div class="fgroup"><h4>Pièces</h4><div class="chips">
      ${[0, 1, 2, 3, 4, 5].map((n) => `<button class="chip ${f.roomsMin === n ? 'on' : ''}" data-one="roomsMin" data-v="${n}" data-num>${n ? `${n}${n === 5 ? '+' : '+'}` : 'Toutes'}</button>`).join('')}
    </div></div>
    <div class="fgroup">
      <label class="toggle"><span>Inclure les annonces retirées</span><input type="checkbox" class="switch" data-f="includeGone" ${f.includeGone ? 'checked' : ''}></label>
      <button class="btn" style="width:100%;margin-top:10px;justify-content:center" data-save-search>${icon('bell')}Créer une alerte avec ces critères</button>
    </div>`;
}

function setFilters(patch, { rerenderFilters = true } = {}) {
  Object.assign(state.filters, patch);
  LS.set('filters', state.filters);
  state.limit = 48;
  if (rerenderFilters) renderFilters();
  render();
}

function bindFilters() {
  const el = $('#filters');
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.arr) {
      const k = b.dataset.arr;
      const v = b.dataset.v;
      const arr = state.filters[k].includes(v) ? state.filters[k].filter((x) => x !== v) : [...state.filters[k], v];
      setFilters({ [k]: arr });
    } else if (b.dataset.one) {
      setFilters({ [b.dataset.one]: 'num' in b.dataset ? +b.dataset.v : b.dataset.v });
    } else if ('saveSearch' in b.dataset) openSaveSearch();
  });
  el.addEventListener('input', debounce((e) => {
    const t = e.target;
    if ('radius' in t.dataset) {
      state.settings.zone.radiusKm = +t.value;
      api('/settings', { method: 'PUT', body: { zone: { radiusKm: +t.value } } }).then(applyState);
      return;
    }
    const k = t.dataset.f;
    if (!k) return;
    const v = t.type === 'checkbox' ? t.checked : 'num' in t.dataset ? +t.value : t.value.replace(/[^\d]/g, '');
    setFilters({ [k]: v }, { rerenderFilters: t.type === 'checkbox' || t.type === 'range' });
  }, 200));
}

// ---------- carte ----------
let map, markers, zoneCircle, tiles;
function renderMap(list) {
  if (!window.L) {
    $('#map').innerHTML = '<div class="empty">La carte nécessite une connexion internet (Leaflet).</div>';
    return;
  }
  const z = state.settings.zone;
  if (!map) {
    map = L.map('map', { zoomControl: true }).setView([z.lat, z.lng], 11);
    markers = L.layerGroup().addTo(map);
    map.on('popupopen', (e) => {
      e.popup.getElement()?.querySelector('[data-open]')?.addEventListener('click', (ev) => openDetail(ev.currentTarget.dataset.open));
    });
  }
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const url = `https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`;
  if (!tiles || tiles._url !== url) {
    tiles?.remove();
    tiles = L.tileLayer(url, { attribution: '© OpenStreetMap, © CARTO', maxZoom: 19 }).addTo(map);
  }
  zoneCircle?.remove();
  zoneCircle = L.circle([z.lat, z.lng], { radius: (z.radiusKm || 15) * 1000, color: getComputedStyle(document.documentElement).getPropertyValue('--accent'), weight: 1, fillOpacity: 0.04 }).addTo(map);
  markers.clearLayers();
  for (const c of list) {
    if (c.lat == null) continue;
    const color = c.score >= 70 ? '#1f6f5c' : c.score >= 50 ? '#9a7417' : '#8b8a84';
    const m = L.marker([c.lat, c.lng], {
      zIndexOffset: c.score * 10,
      icon: L.divIcon({ className: '', html: `<div class="pin" style="background:${color}">${c.score}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
    });
    m.bindPopup(`<b>${eur(c.price)}</b> · ${esc(TYPE_LABEL[c.type] || '')} ${c.surface ? `${nfmt(c.surface)} m²` : ''}<br>
      <span style="color:#777">${esc(c.city)} · ${c.ppm2 ? `${nfmt(c.ppm2)} €/m²` : ''}</span><br>
      <button class="link-btn" data-open="${esc(c.id)}" style="margin-top:6px">Voir le détail →</button>`);
    markers.addLayer(m);
  }
  setTimeout(() => map.invalidateSize(), 50);
}

// ---------- modale ----------
const modal = $('#modal');
function openModal(html, { wide = true } = {}) {
  $('#modal-body').innerHTML = `<div class="mwrap">${html}</div>`;
  modal.style.maxWidth = wide ? '' : '560px';
  if (!modal.open) modal.showModal();
  hydrateIcons($('#modal-body'));
}
function closeModal() { modal.close(); }
modal.addEventListener('click', (e) => {
  if (e.target === modal || e.target.closest('[data-close]')) closeModal();
});
const mhead = (title, extra = '') => `<div class="mhead"><h2>${title}</h2><div style="display:flex;gap:4px;align-items:center">${extra}<button class="ib" data-close title="Fermer">${icon('x')}</button></div></div>`;

// ---------- détail ----------
function sparkline(history) {
  const pts = history.filter((h) => h.price);
  if (pts.length < 2) return '<p class="muted" style="margin:0">Prix inchangé depuis la première diffusion.</p>';
  const t0 = new Date(pts[0].date).getTime();
  const t1 = Math.max(Date.now(), new Date(pts.at(-1).date).getTime());
  const min = Math.min(...pts.map((p) => p.price));
  const max = Math.max(...pts.map((p) => p.price));
  const W = 300, H = 60;
  const x = (t) => ((new Date(t).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 8) + 4;
  const y = (p) => (max === min ? H / 2 : H - 6 - ((p - min) / (max - min)) * (H - 14));
  const sorted = [...pts].sort((a, b) => new Date(a.date) - new Date(b.date));
  let d = `M${x(sorted[0].date)},${y(sorted[0].price)}`;
  for (let i = 1; i < sorted.length; i++) d += `H${x(sorted[i].date)}V${y(sorted[i].price)}`;
  d += `H${W - 4}`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>
    <div class="muted num" style="display:flex;justify-content:space-between;font-size:12px"><span>${eur(sorted[0].price)}</span><span>${eur(sorted.at(-1).price)}</span></div>`;
}

function openDetail(id) {
  const c = state.clusters.find((x) => x.id === id);
  if (!c) return;
  const fav = c.favorite;
  const parts = [...c.parts].sort((a, b) => b.points - a.points);
  openModal(`${mhead(esc(TYPE_LABEL[c.type] || 'Bien') + ' · ' + esc(c.city || ''),
    `<button class="ib fav-inline ${fav ? 'on' : ''}" data-fav="${esc(c.id)}" title="${fav ? 'Ne plus suivre' : 'Suivre'}">${icon('heart')}</button>`)}
  <div class="mbody detail">
    <div>
      <div class="gallery">${c.photos?.[0] ? `<img src="${esc(c.photos[0])}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : icon(c.type || 'maison')}</div>
      <div class="big-price num">${eur(c.price)} ${c.initialPrice > c.price ? `<s class="muted" style="font-size:15px;font-weight:500">${eur(c.initialPrice)}</s>` : ''}</div>
      <div class="muted">${esc(c.title)}</div>
      <div class="tags" style="margin-top:10px">${tagsHtml(c, 12)}</div>
      <div class="kv">
        <div><small>Surface</small><b class="num">${c.surface ? `${nfmt(c.surface)} m²` : '—'}</b></div>
        <div><small>Prix / m²</small><b class="num">${c.ppm2 ? `${nfmt(c.ppm2)} €` : '—'}</b></div>
        <div><small>Marché local</small><b class="num">${c.refPpm2 ? `${nfmt(c.refPpm2)} €/m²` : '—'}</b></div>
        <div><small>Pièces · chambres</small><b>${c.rooms ?? '—'} · ${c.bedrooms ?? '—'}</b></div>
        <div><small>Terrain</small><b class="num">${c.landSurface ? `${nfmt(c.landSurface)} m²` : '—'}</b></div>
        <div><small>DPE</small><b>${c.dpe || '—'}</b></div>
        <div><small>Rendement brut</small><b class="num">${c.yield ? `${(c.yield * 100).toFixed(1)} %` : '—'}</b></div>
        <div><small>En ligne depuis</small><b>${c.daysOnline} j</b></div>
        <div><small>Distance</small><b class="num">${c.distanceKm != null ? `${nfmt(c.distanceKm, 1)} km` : '—'}</b></div>
      </div>
      <div class="desc">${esc(c.description)}</div>
    </div>
    <div>
      <div class="panel">
        <div class="scorebig">${scoreRing(c.score, 60)}<div><b>Score d’opportunité</b><br><small class="muted">Base 20 + signaux détectés</small></div></div>
        <div class="parts">${parts.length ? parts.map((p) => `<div class="part"><span>${esc(p.label)}</span><span class="pts num ${p.points < 0 ? 'neg' : 'pos'}">${p.points > 0 ? '+' : ''}${p.points}</span><small>${esc(p.detail)}</small></div>`).join('') : '<small class="muted">Aucun signal particulier.</small>'}</div>
      </div>
      <div class="panel"><h3>Diffusion <span>${c.members.length} annonce${c.members.length > 1 ? 's' : ''}</span></h3>
        <div class="srclist">${c.members.map((m) => `<a href="${esc(m.url || '#')}" target="_blank" rel="noopener noreferrer">
          <span><b>${esc(m.sourceLabel)}</b><br><small class="muted">${m.active ? 'publiée' : 'retirée'} ${ago(m.publishedAt)}</small></span>
          <span class="num">${eur(m.price)}</span>${icon('external')}</a>`).join('')}</div>
      </div>
      <div class="panel"><h3>Historique de prix</h3>${sparkline(c.priceHistory)}</div>
      <div class="panel"><h3>Suivi</h3>
        ${fav ? `<div class="status">${STATUSES.map(([k, l]) => `<button class="chip ${fav.status === k ? 'on' : ''}" data-status="${k}">${l}</button>`).join('')}</div>
          <textarea class="field" id="fav-note" placeholder="Notes : contact agence, points à vérifier, offre envisagée…">${esc(fav.note || '')}</textarea>`
        : `<button class="btn primary" data-fav="${esc(c.id)}">${icon('heart')}Suivre ce bien</button><p class="hint">Les biens suivis signalent les baisses de prix et conservent vos notes.</p>`}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${c.lat != null ? `<a class="btn" target="_blank" rel="noopener noreferrer" href="https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=15/${c.lat}/${c.lng}">${icon('pin')}Situer</a>` : ''}
        ${c.manual ? `<button class="btn danger" data-del="${esc(c.members.find((m) => m.manual)?.id)}">${icon('trash')}Supprimer</button>` : ''}
      </div>
    </div>
  </div>`);
  const note = $('#fav-note');
  if (note) note.addEventListener('input', debounce(() => saveFav(c, { note: note.value }, false), 500));
  $$('[data-status]', $('#modal-body')).forEach((b) => b.addEventListener('click', () => saveFav(c, { status: b.dataset.status }).then(() => openDetail(c.id))));
  $$('[data-del]', $('#modal-body')).forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Supprimer cette annonce ajoutée manuellement ?')) return;
    applyState(await api(`/listings/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }));
    closeModal();
  }));
}

async function saveFav(c, data, refresh = true) {
  const key = c.favorite?.key || c.id;
  await api(`/favorites/${encodeURIComponent(key)}`, { method: 'PUT', body: data });
  c.favorite = { ...(c.favorite || { status: 'suivi', note: '' }), ...data, key };
  if (refresh) render();
}

async function toggleFav(id) {
  const c = state.clusters.find((x) => x.id === id);
  if (!c) return;
  if (c.favorite) {
    await api(`/favorites/${encodeURIComponent(c.favorite.key)}`, { method: 'DELETE' });
    c.favorite = null;
    toast('Retiré des favoris');
  } else {
    await saveFav(c, { status: 'suivi', price: c.price }, false);
    toast('Ajouté aux favoris');
  }
  render();
  if (modal.open && $('.detail', modal)) openDetail(id);
}

// ---------- alertes ----------
function searchNewCount(s) {
  const seen = new Date(s.seenAt).getTime();
  return state.clusters.filter((c) => matches(c, { ...DEFAULT_FILTERS, ...s.filters }, { tab: s.tab, q: s.q }) && new Date(c.firstSeen).getTime() > seen).length;
}
function favDrops() {
  return state.clusters.filter((c) => c.favorite?.price && c.price && c.price < c.favorite.price);
}
function updateBadge() {
  const n = state.searches.reduce((s, x) => s + searchNewCount(x), 0) + favDrops().length;
  const b = $('#btn-alerts .badge');
  b.hidden = !n;
  b.textContent = n > 99 ? '99+' : n;
  return n;
}

function describeFilters(f, q) {
  const parts = [];
  if (f.types?.length) parts.push(f.types.map((t) => TYPE_LABEL[t]).join(', '));
  if (f.priceMax) parts.push(`≤ ${eur(+f.priceMax)}`);
  if (f.priceMin) parts.push(`≥ ${eur(+f.priceMin)}`);
  if (f.surfMin) parts.push(`≥ ${f.surfMin} m²`);
  if (f.roomsMin) parts.push(`${f.roomsMin}+ p.`);
  if (f.signals?.length) parts.push(f.signals.map((k) => SIGNALS.find((s) => s[0] === k)?.[1]).join(', '));
  if (f.scoreMin) parts.push(`score ≥ ${f.scoreMin}`);
  if (f.cities?.length) parts.push(f.cities.join(', '));
  if (q) parts.push(`« ${q} »`);
  return parts.join(' · ') || 'Tous les biens de la zone';
}

function openAlerts() {
  const drops = favDrops();
  const notifOn = state.settings.notifications && 'Notification' in window && Notification.permission === 'granted';
  openModal(`${mhead('Alertes')}
  <div class="mbody">
    ${drops.length ? `<div class="panel"><h3>Baisses de prix sur vos favoris</h3>${drops.map((c) => `<div class="alert-item">
      <div><b>${esc(TYPE_LABEL[c.type] || '')} · ${esc(c.city)}</b><br><small class="num">${eur(c.favorite.price)} → <b>${eur(c.price)}</b></small></div>
      <button class="btn" data-open="${esc(c.id)}">Voir</button></div>`).join('')}</div>` : ''}
    <div class="panel"><h3>Recherches enregistrées</h3>
      ${state.searches.length ? state.searches.map((s) => {
        const n = searchNewCount(s);
        return `<div class="alert-item"><div><b>${esc(s.name)}</b>${n ? `<span class="pill">${n} nouveau${n > 1 ? 'x' : ''}</span>` : ''}<br><small>${esc(describeFilters(s.filters, s.q))}</small></div>
          <div style="display:flex;gap:4px"><button class="btn" data-run="${s.id}">Voir</button><button class="ib" data-delsearch="${s.id}" title="Supprimer">${icon('trash')}</button></div></div>`;
      }).join('') : '<p class="muted" style="margin:0">Aucune alerte. Réglez vos filtres puis « Créer une alerte ».</p>'}
    </div>
    <label class="toggle"><span>${icon('bell')}Notifications du navigateur</span><input type="checkbox" class="switch" id="notif" ${notifOn ? 'checked' : ''}></label>
    <p class="hint">Vérification automatique toutes les ${state.settings.refreshMinutes} min tant que l’application est ouverte.</p>
  </div>
  <div class="mfoot"><button class="btn primary" data-new-search>${icon('plus')}Enregistrer la recherche actuelle</button></div>`, { wide: false });
  $('.mwrap').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.open) openDetail(b.dataset.open);
    if (b.dataset.run) {
      const s = state.searches.find((x) => x.id === b.dataset.run);
      state.filters = { ...DEFAULT_FILTERS, ...s.filters };
      state.q = s.q || '';
      $('#q').value = state.q;
      state.tab = s.tab || 'all';
      state.sort = 'recent';
      await api(`/searches/${s.id}`, { method: 'PUT', body: { seenAt: new Date().toISOString() } });
      s.seenAt = new Date().toISOString();
      closeModal();
      renderFilters();
      render();
      updateBadge();
    }
    if (b.dataset.delsearch) {
      await api(`/searches/${b.dataset.delsearch}`, { method: 'DELETE' });
      state.searches = state.searches.filter((x) => x.id !== b.dataset.delsearch);
      updateBadge();
      openAlerts();
    }
    if ('newSearch' in b.dataset) openSaveSearch();
  });
  $('#notif').addEventListener('change', async (e) => {
    let on = e.target.checked;
    if (on && 'Notification' in window && Notification.permission !== 'granted') on = (await Notification.requestPermission()) === 'granted';
    e.target.checked = on;
    applyState(await api('/settings', { method: 'PUT', body: { notifications: on } }));
  });
}

function openSaveSearch() {
  openModal(`${mhead('Nouvelle alerte')}
  <div class="mbody">
    <label><span class="muted" style="font-size:12px">Nom</span><input class="field" id="sname" value="${esc(describeFilters(state.filters, state.q).slice(0, 60))}"></label>
    <p class="hint">Critères : ${esc(describeFilters(state.filters, state.q))}${state.tab !== 'all' ? ` · onglet ${esc($(`#tabs [data-tab="${state.tab}"]`).textContent)}` : ''}</p>
  </div>
  <div class="mfoot"><button class="btn" data-close>Annuler</button><button class="btn primary" id="ssave">${icon('check')}Créer l’alerte</button></div>`, { wide: false });
  $('#sname').select();
  $('#ssave').addEventListener('click', async () => {
    const s = await api('/searches', { method: 'POST', body: { name: $('#sname').value || 'Alerte', filters: state.filters, q: state.q, tab: state.tab } });
    state.searches.push(s);
    toast('Alerte créée');
    openAlerts();
  });
}

// ---------- ajout d'annonce ----------
function openAdd(prefill = null) {
  openModal(`${mhead('Ajouter une annonce')}
  <div class="mbody">
    <p class="hint" style="margin-top:0">Collez le lien et/ou le texte d’une annonce vue sur n’importe quel site : les champs sont extraits automatiquement et l’annonce est recoupée avec celles déjà connues.</p>
    <div class="form">
      <label class="full"><span>Lien de l’annonce</span><input class="field" id="a-url" placeholder="https://…" value="${esc(prefill?.url || '')}"></label>
      <label class="full"><span>Texte de l’annonce (optionnel)</span><textarea class="field" id="a-text" placeholder="Copiez-collez ici le titre et la description…">${esc(prefill?.text || '')}</textarea></label>
    </div>
    <div id="a-form"></div>
  </div>
  <div class="mfoot"><button class="btn" data-close>Annuler</button><button class="btn" id="a-parse">${icon('sparkle')}Analyser</button><button class="btn primary" id="a-save" hidden>${icon('check')}Ajouter</button></div>`, { wide: false });
  const doParse = async () => {
    $('#a-parse').disabled = true;
    try {
      const p = await api('/parse', { method: 'POST', body: { url: $('#a-url').value.trim(), text: $('#a-text').value.trim(), title: prefill?.title, image: prefill?.image } });
      renderAddForm(p);
    } catch (e) { toast(e.message); }
    $('#a-parse').disabled = false;
  };
  $('#a-parse').addEventListener('click', doParse);
  if (prefill) doParse();
}

function renderAddForm(p) {
  const f = (k, label, extra = '') => `<label><span>${label}</span><input class="field" data-k="${k}" value="${esc(p[k] ?? '')}" ${extra}></label>`;
  $('#a-form').innerHTML = `<div class="form" style="margin-top:16px">
    ${p.url && !p.fetched && !p.description ? '<p class="hint full">La page n’a pas pu être lue automatiquement (site protégé). Collez le texte ou complétez les champs.</p>' : ''}
    <label class="full"><span>Titre</span><input class="field" data-k="title" value="${esc(p.title || '')}"></label>
    <label><span>Type</span><select class="field" data-k="type">${TYPES.map(([k, l]) => `<option value="${k}" ${p.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${f('price', 'Prix (€)', 'inputmode="numeric"')}
    ${f('surface', 'Surface (m²)', 'inputmode="decimal"')}
    ${f('landSurface', 'Terrain (m²)', 'inputmode="numeric"')}
    ${f('rooms', 'Pièces', 'inputmode="numeric"')}
    ${f('bedrooms', 'Chambres', 'inputmode="numeric"')}
    ${f('city', 'Ville')}
    ${f('postcode', 'Code postal', 'inputmode="numeric"')}
    ${f('dpe', 'DPE (A–G)', 'maxlength="1"')}
    <label><span>Date de mise en ligne</span><input class="field" type="date" data-k="publishedAt" value="${new Date().toISOString().slice(0, 10)}"></label>
  </div>`;
  $('#a-save').hidden = false;
  $('#a-save').onclick = async () => {
    const body = { url: $('#a-url').value.trim(), description: p.description || $('#a-text').value, photos: p.photos || [] };
    $$('[data-k]', $('#a-form')).forEach((i) => { body[i.dataset.k] = i.value.trim(); });
    if (body.dpe) body.dpe = body.dpe.toUpperCase();
    try {
      const r = await api('/listings', { method: 'POST', body });
      applyState(r);
      const c = state.clusters.find((x) => x.members.some((m) => m.id === r.listing.id));
      toast(c && c.members.length > 1 ? `Annonce recoupée avec ${c.members.length - 1} autre(s) diffusion(s)` : 'Annonce ajoutée');
      if (c) openDetail(c.id); else closeModal();
    } catch (e) { toast(e.message); }
  };
}

// ---------- paramètres ----------
let settingsTab = 'zone';
function openSettings(tab = settingsTab) {
  settingsTab = tab;
  const s = structuredClone(state.settings);
  const tabs = [['zone', 'Zone'], ['sources', 'Sources'], ['score', 'Score'], ['data', 'Données']];
  const bookmarklet = `javascript:(()=>{const d={u:location.href,t:document.title,x:(document.body.innerText||'').slice(0,5000),i:(document.querySelector('meta[property="og:image"]')||{}).content||''};window.open('${location.href.split('#')[0]}#capture='+encodeURIComponent(JSON.stringify(d)),'agregimmo','width=620,height=760')})()`;
  const pane = {
    zone: `<div class="form">
      <label class="full"><span>Centre de la zone de recherche</span><input class="field" id="s-place" value="${esc(s.zone.label || s.zone.city)}" autocomplete="off"><div class="places" id="s-places" hidden></div></label>
      <label class="full"><span>Rayon : <b id="s-rad-v">${s.zone.radiusKm} km</b></span><input type="range" min="1" max="80" id="s-rad" value="${s.zone.radiusKm}"></label>
      <label><span>« Nouveau » = mis en ligne depuis moins de (jours)</span><input class="field" id="s-new" inputmode="numeric" value="${s.newDays}"></label>
      <label><span>Actualisation automatique (minutes)</span><input class="field" id="s-refresh" inputmode="numeric" value="${s.refreshMinutes}"></label>
    </div>`,
    sources: `
      <label class="toggle"><span>${icon('layers')}Données de démonstration (marché nantais simulé)</span><input type="checkbox" class="switch" id="s-demo" ${s.sources.demo.enabled ? 'checked' : ''}></label>
      <p class="hint">À désactiver une fois vos vraies sources branchées.</p>
      <h4 style="margin:20px 0 8px">Flux RSS / Atom</h4>
      <p class="hint" style="margin-top:0">Ajoutez les flux d’alertes de vos portails, agences ou notaires. Prix, surface, pièces et ville sont extraits du texte.</p>
      ${backend?.mode === 'local' ? '<p class="hint">Mode téléphone : un flux n’est lisible que si son site l’autorise (CORS). Sinon, utilisez le serveur (npm start) ou ajoutez les annonces par lien / texte.</p>' : ''}
      <div id="s-feeds" style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${(s.sources.rss.feeds || []).map(feedRow).join('')}</div>
      <button class="btn" style="margin-top:8px" id="s-addfeed">${icon('plus')}Ajouter un flux</button>
      <h4 style="margin:24px 0 8px">Capture depuis n’importe quel site</h4>
      <p class="hint" style="margin-top:0">Glissez ce bouton dans votre barre de favoris. Sur une annonce, cliquez-le : elle est envoyée à agregimmo, analysée et recoupée.</p>
      <p><a class="bookmarklet" href="${esc(bookmarklet)}" onclick="event.preventDefault()">${icon('bookmark')}+ agregimmo</a></p>
      <h4 style="margin:24px 0 8px">Journal</h4>
      <div class="logs">${(state.meta.logs || []).map((l) => `<div>${new Date(l.at).toLocaleTimeString('fr-FR')} — ${esc(l.msg)}</div>`).join('') || 'Rien pour le moment.'}</div>`,
    score: `
      <p class="hint" style="margin-top:0">Ajustez l’importance de chaque signal (0 = ignoré, 2 = double).</p>
      <div class="form">${[['discount', 'Prix vs marché'], ['rarity', 'Rareté'], ['drop', 'Baisse de prix'], ['yield', 'Rendement locatif'], ['market', 'Durée / DPE / republication']]
        .map(([k, l]) => `<label><span>${l} : <b data-wv="${k}">${s.weights[k]}</b></span><input type="range" min="0" max="2" step="0.25" data-w="${k}" value="${s.weights[k]}"></label>`).join('')}</div>
      <h4 style="margin:22px 0 8px">Références de marché</h4>
      <div class="form">
        <label><span>Loyer de référence (€/m²/mois)</span><input class="field" id="s-rent" inputmode="decimal" value="${esc(s.references.rentPerM2.default ?? '')}"></label>
        <label><span>Prix/m² de référence par ville</span><input class="field" id="s-ppm2" placeholder="Nantes=4100; Rezé=3500" value="${esc(Object.entries(s.references.pricePerM2 || {}).map(([k, v]) => `${k}=${v}`).join('; '))}"></label>
      </div>
      <p class="hint">Sans référence saisie, la médiane des biens de la zone est utilisée. Pour des valeurs fiables, consultez les ventes réelles (DVF) sur app.dvf.etalab.gouv.fr.</p>
      <h4 style="margin:22px 0 8px">Mots-clés de rareté</h4>
      <div class="kwlist" id="s-kw">${s.rarityKeywords.map(kwRow).join('')}</div>
      <button class="btn" style="margin-top:8px" id="s-addkw">${icon('plus')}Ajouter un mot-clé</button>`,
    data: `
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" id="s-export">${icon('download')}Exporter favoris et réglages</button>
        <label class="btn">${icon('upload')}Importer CSV / JSON<input type="file" id="s-import" accept=".csv,.json,text/csv,application/json" hidden></label>
      </div>
      <p class="hint">CSV avec en-têtes : titre, prix, surface, pieces, chambres, ville, code postal, lien, description, dpe, date. Séparateur « ; » ou « , ».</p>
      <h4 style="margin:24px 0 8px">Zone de danger</h4>
      <button class="btn danger" id="s-reset">${icon('trash')}Effacer les annonces et favoris</button>
      <p class="hint">${nfmt(state.meta.listings)} annonces stockées localement · dernière actualisation ${state.meta.lastRefresh ? ago(state.meta.lastRefresh) : 'jamais'}.</p>`,
  };
  openModal(`${mhead('Paramètres')}
    <div class="tabs2">${tabs.map(([k, l]) => `<button data-stab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="mbody" id="s-body">${pane[tab]}</div>
    <div class="mfoot"><button class="btn" data-close>Fermer</button><button class="btn primary" id="s-save">${icon('check')}Enregistrer</button></div>`, { wide: false });

  const body = $('#modal-body');
  $$('[data-stab]', body).forEach((b) => b.addEventListener('click', () => openSettings(b.dataset.stab)));
  const zone = { ...s.zone };
  if (tab === 'zone') {
    $('#s-rad').addEventListener('input', (e) => { zone.radiusKm = +e.target.value; $('#s-rad-v').textContent = `${e.target.value} km`; });
    $('#s-place').addEventListener('input', debounce(async (e) => {
      const places = await api(`/places?q=${encodeURIComponent(e.target.value)}`).catch(() => []);
      const box = $('#s-places');
      box.hidden = !places.length;
      box.innerHTML = places.map((p, i) => `<button type="button" data-pi="${i}">${esc(p.label)}</button>`).join('');
      $$('button', box).forEach((b) => b.addEventListener('click', () => {
        const p = places[+b.dataset.pi];
        Object.assign(zone, { label: p.label, city: p.city, lat: p.lat, lng: p.lng });
        $('#s-place').value = p.label;
        box.hidden = true;
      }));
    }, 300));
  }
  if (tab === 'sources') {
    $('#s-addfeed').addEventListener('click', () => $('#s-feeds').insertAdjacentHTML('beforeend', feedRow({ label: '', url: '' })));
    $('#s-feeds').addEventListener('click', (e) => e.target.closest('[data-rm]')?.parentElement.remove());
  }
  if (tab === 'score') {
    $$('[data-w]', body).forEach((r) => r.addEventListener('input', () => { $(`[data-wv="${r.dataset.w}"]`).textContent = r.value; }));
    $('#s-addkw').addEventListener('click', () => { $('#s-kw').insertAdjacentHTML('beforeend', kwRow({ term: '', weight: 4 })); hydrateIcons($('#s-kw')); });
    $('#s-kw').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { b.previousElementSibling.remove(); b.previousElementSibling.remove(); b.remove(); } });
  }
  if (tab === 'data') {
    $('#s-export').addEventListener('click', async () => {
      const data = await api('/export');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = `agregimmo-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    });
    $('#s-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const content = await file.text();
      try {
        const r = await api('/import', { method: 'POST', body: { format: file.name.endsWith('.csv') ? 'csv' : 'json', content } });
        applyState(r);
        toast(`${r.added} annonce(s) importée(s)`);
      } catch (err) { toast(`Import impossible : ${err.message}`); }
    });
    $('#s-reset').addEventListener('click', async () => {
      if (!confirm('Effacer toutes les annonces, favoris et alertes ? Les réglages sont conservés.')) return;
      applyState(await api('/reset', { method: 'POST' }));
      toast('Données effacées');
      closeModal();
    });
  }

  $('#s-save').addEventListener('click', async () => {
    const patch = {};
    if (tab === 'zone') {
      patch.zone = zone;
      patch.newDays = Math.max(1, +$('#s-new').value || 3);
      patch.refreshMinutes = Math.max(5, +$('#s-refresh').value || 30);
    }
    if (tab === 'sources') {
      patch.sources = {
        demo: { enabled: $('#s-demo').checked },
        rss: { enabled: true, feeds: $$('.feed', body).map((r) => ({ label: $('[data-fl]', r).value.trim(), url: $('[data-fu]', r).value.trim() })).filter((f) => f.url) },
      };
    }
    if (tab === 'score') {
      patch.weights = Object.fromEntries($$('[data-w]', body).map((r) => [r.dataset.w, +r.value]));
      patch.references = {
        rentPerM2: { default: +String($('#s-rent').value).replace(',', '.') || null },
        pricePerM2: Object.fromEntries($('#s-ppm2').value.split(/[;\n]/).map((x) => x.split('=').map((y) => y.trim())).filter(([k, v]) => k && +v).map(([k, v]) => [k, +v])),
      };
      const terms = $$('[data-kt]', body);
      patch.rarityKeywords = terms.map((t) => ({ term: t.value.trim(), weight: +t.nextElementSibling.value || 0 })).filter((k) => k.term);
    }
    applyState(await api('/settings', { method: 'PUT', body: patch }));
    if (tab === 'sources') await doRefresh();
    if (map && tab === 'zone') map.setView([zone.lat, zone.lng], 11);
    toast('Paramètres enregistrés');
    openSettings(tab);
  });
}
const feedRow = (f) => `<div class="feed" style="display:grid;grid-template-columns:140px 1fr 34px;gap:6px"><input class="field" data-fl placeholder="Nom" value="${esc(f.label)}"><input class="field" data-fu placeholder="https://…/rss" value="${esc(f.url)}"><button class="ib" data-rm title="Retirer">${icon('x')}</button></div>`;
const kwRow = (k) => `<input class="field" data-kt value="${esc(k.term)}" placeholder="ex. vue mer"><input class="field num" inputmode="numeric" value="${esc(k.weight)}"><button class="ib" data-rm title="Retirer">${icon('x')}</button>`;

// ---------- données ----------
let lastNotified = LS.get('notified', {});
function notify() {
  if (!state.settings.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
  for (const s of state.searches) {
    const n = searchNewCount(s);
    if (n > (lastNotified[s.id] || 0)) new Notification('agregimmo', { body: `${n} nouveau(x) bien(s) pour « ${s.name} »` });
    lastNotified[s.id] = n;
  }
  for (const c of favDrops()) {
    const k = `drop:${c.id}:${c.price}`;
    if (!lastNotified[k]) new Notification('agregimmo', { body: `Baisse de prix : ${TYPE_LABEL[c.type] || ''} ${c.city} → ${eur(c.price)}` });
    lastNotified[k] = 1;
  }
  LS.set('notified', lastNotified);
}

function applyState(s) {
  if (!s?.clusters) return;
  state.clusters = s.clusters;
  state.settings = s.settings;
  state.searches = s.searches || state.searches;
  state.meta = s.meta || state.meta;
  renderFilters();
  render();
  updateBadge();
  notify();
}

async function doRefresh(silent = false) {
  const b = $('#btn-refresh');
  b.classList.add('spin');
  try {
    const r = await api('/refresh', { method: 'POST' });
    applyState(r);
    if (!silent || r.counts.new || r.counts.price) toast(r.counts.new || r.counts.price ? `${r.counts.new} nouvelle(s) annonce(s), ${r.counts.price} changement(s) de prix` : 'Tout est à jour');
  } catch (e) { toast(e.message); }
  b.classList.remove('spin');
}

// ---------- thème ----------
function applyTheme(t) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('#btn-theme').innerHTML = icon(dark ? 'sun' : 'moon');
  LS.set('theme', t);
  if (map && state.view === 'map') render();
}

function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach((el) => {
    const existing = el.querySelector(':scope > svg.i');
    if (!existing) el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
    if (el.tagName === 'SPAN') el.replaceWith(...el.childNodes);
  });
}

// ---------- événements ----------
function bind() {
  hydrateIcons();
  $('.mark').innerHTML = icon('maison');
  $('#q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.limit = 48; render(); }, 180));
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; LS.set('sort', state.sort); render(); });
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { state.tab = b.dataset.tab; state.limit = 48; render(); } });
  $('#views').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) { state.view = b.dataset.view; LS.set('view', state.view); render(); } });
  $('#summary').addEventListener('click', (e) => {
    const b = e.target.closest('.stat');
    if (!b) return;
    if (b.dataset.tab) state.tab = b.dataset.tab;
    if (b.dataset.signal) { state.tab = 'all'; setFilters({ signals: [b.dataset.signal] }); return; }
    render();
  });
  const results = $('#results');
  results.addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) { e.stopPropagation(); toggleFav(fav.dataset.fav); return; }
    if (e.target.closest('[data-more]')) { state.limit += 48; render(); return; }
    if (e.target.closest('[data-reset-filters]')) { state.filters = { ...DEFAULT_FILTERS }; setFilters({}); return; }
    const item = e.target.closest('[data-id]');
    if (item) openDetail(item.dataset.id);
  });
  $('#modal-body').addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) toggleFav(fav.dataset.fav);
  });
  $('#filters').addEventListener('click', (e) => {
    if (e.target.closest('[data-reset-filters]')) { state.filters = { ...DEFAULT_FILTERS }; setFilters({}); }
  });
  bindFilters();

  const layout = $('.layout');
  const narrow = () => matchMedia('(max-width: 960px)').matches;
  const setFiltersVisible = (on) => {
    if (narrow()) {
      $('#filters').classList.toggle('open', on);
      $('#scrim').hidden = !on;
    } else {
      state.showFilters = on;
      LS.set('showFilters', on);
      layout.classList.toggle('nofilters', !on);
      if (map) setTimeout(() => map.invalidateSize(), 50);
    }
  };
  layout.classList.toggle('nofilters', !state.showFilters);
  $('#btn-filters').addEventListener('click', () => setFiltersVisible(narrow() ? !$('#filters').classList.contains('open') : !state.showFilters));
  $('#scrim').addEventListener('click', () => setFiltersVisible(false));

  $('#btn-refresh').addEventListener('click', doRefresh);
  $('#btn-add').addEventListener('click', () => openAdd());
  $('#btn-alerts').addEventListener('click', openAlerts);
  $('#btn-settings').addEventListener('click', () => openSettings());
  $('#btn-theme').addEventListener('click', () => {
    const cur = LS.get('theme', 'auto');
    const dark = cur === 'dark' || (cur === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    applyTheme(dark ? 'light' : 'dark');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#q').focus(); }
  });
}

function checkCapture() {
  const m = location.hash.match(/^#capture=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const d = JSON.parse(decodeURIComponent(m[1]));
    openAdd({ url: d.u, title: d.t, text: d.x, image: d.i });
  } catch { toast('Capture illisible'); }
}

async function init() {
  applyTheme(LS.get('theme', 'auto'));
  bind();
  try {
    applyState(await api('/state'));
    if (!state.meta.lastRefresh) await doRefresh(true);
  } catch (e) {
    $('#results').innerHTML = `<div class="empty">Chargement impossible : ${esc(e.message)}</div>`;
  }
  checkCapture();
  window.addEventListener('hashchange', checkCapture);
  if (backend.mode === 'server') {
    // Le serveur actualise les sources en tâche de fond : on récupère l'état quand il a changé.
    setInterval(async () => {
      try {
        const s = await api('/state');
        if (s.meta.lastRefresh !== state.meta.lastRefresh || s.clusters.length !== state.clusters.length) applyState(s);
      } catch { /* hors ligne */ }
    }, 60e3);
  } else {
    // Mode autonome : on actualise quand l'application est ouverte ou revient au premier plan.
    const stale = () => Date.now() - new Date(state.meta.lastRefresh || 0).getTime() > (state.settings.refreshMinutes || 30) * 60e3;
    const tick = () => { if (document.visibilityState === 'visible' && stale()) doRefresh(true); };
    document.addEventListener('visibilitychange', tick);
    setInterval(tick, 60e3);
    tick();
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
