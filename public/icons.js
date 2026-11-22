// Jeu d'icônes minimaliste (trait 1.6, grille 24). Usage : icon('heart')

const gear = (() => {
  const pts = [];
  const teeth = 8;
  for (let i = 0; i < teeth * 2; i++) {
    const a = (Math.PI * i) / teeth;
    const r = i % 2 ? 7.2 : 9.4;
    const w = 0.22;
    pts.push([12 + r * Math.cos(a - w), 12 + r * Math.sin(a - w)]);
    pts.push([12 + r * Math.cos(a + w), 12 + r * Math.sin(a + w)]);
  }
  return `<path d="M${pts.map((p) => p.map((n) => n.toFixed(2)).join(' ')).join('L')}Z"/><circle cx="12" cy="12" r="3"/>`;
})();

const P = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  filter: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  heart: '<path d="M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 6.8a4.2 4.2 0 0 1 7.5 2.7c0 5.4-7.5 10-7.5 10z"/>',
  bell: '<path d="M6.5 16.5v-5a5.5 5.5 0 0 1 11 0v5l1.5 1.5H5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  settings: gear,
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  map: '<path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  maison: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  appartement: '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M9 8h1M14 8h1M9 12h1M14 12h1M10.5 20.5v-4h3v4"/>',
  immeuble: '<rect x="3.5" y="7" width="8" height="13.5" rx="1"/><rect x="11.5" y="3.5" width="9" height="17" rx="1"/><path d="M6.5 11h2M6.5 15h2M14.5 7.5h3M14.5 11h3M14.5 15h3"/>',
  terrain: '<path d="M3 19.5h18"/><path d="M7 19.5V15M7 15l-3-.5L7 7l3 7.5z"/><path d="M14 19.5l3.5-7 3.5 7"/>',
  local: '<path d="M4 9.5L5.5 4.5h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 11.5v9h13v-9M10 20.5v-5h4v5"/>',
  parking: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 16.5V8h3a2.5 2.5 0 0 1 0 5h-3"/>',
  external: '<path d="M13.5 4.5h6v6M19.5 4.5l-8 8"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>',
  sparkle: '<path d="M12 3.5l1.9 5.2 5.1 1.9-5.1 1.9L12 17.7l-1.9-5.2-5.1-1.9 5.1-1.9z"/><path d="M18.5 16v4M16.5 18h4"/>',
  down: '<path d="M3.5 7l6.5 6.5 3.5-3.5 7 7"/><path d="M20.5 12.5V17h-4.5"/>',
  layers: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5"/><path d="M3.5 16.5L12 21l8.5-4.5" opacity=".55"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  ruler: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 8v3M11 8v4M15 8v3M19 8v2"/>',
  door: '<path d="M6 20.5V4.5h12v16M3.5 20.5h17"/><circle cx="14.5" cy="12.5" r=".6" fill="currentColor"/>',
  bolt: '<path d="M13 3L5.5 13.5H12L11 21l7.5-10.5H12z"/>',
  euro: '<path d="M17.5 6.5a6.5 6.5 0 1 0 0 11"/><path d="M4.5 10.5h9M4.5 13.5h9"/>',
  repost: '<path d="M4.5 10.5V9a3 3 0 0 1 3-3h11"/><path d="M15.5 3l3 3-3 3"/><path d="M19.5 13.5V15a3 3 0 0 1-3 3h-11"/><path d="M8.5 21l-3-3 3-3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  upload: '<path d="M12 15.5V4.5M7.5 9L12 4.5 16.5 9"/><path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  download: '<path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5"/><path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  bookmark: '<path d="M6.5 4.5h11v16l-5.5-4-5.5 4z"/>',
  chevron: '<path d="M9 5.5l6.5 6.5L9 18.5"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  yield: '<path d="M4 19.5h16"/><path d="M6.5 16v-3M11 16V9.5M15.5 16v-5M20 16V5.5"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r=".9" fill="currentColor"/><circle cx="4.8" cy="12" r=".9" fill="currentColor"/><circle cx="4.8" cy="17.5" r=".9" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
};

export function icon(name, cls = '') {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.info}</svg>`;
}
