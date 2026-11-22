// Source de démonstration : génère un marché réaliste autour de Nantes,
// avec biens diffusés sur plusieurs portails fictifs, baisses de prix,
// republications, ventes. Les annonces « apparaissent » au fil des jours
// à partir de la date d'installation, pour tester alertes et nouveautés.

const COMMUNES = [
  { city: 'Nantes', postcode: '44000', lat: 47.2184, lng: -1.5536, ppm2: 3900, w: 30 },
  { city: 'Rezé', postcode: '44400', lat: 47.1833, lng: -1.5500, ppm2: 3450, w: 8 },
  { city: 'Saint-Herblain', postcode: '44800', lat: 47.2122, lng: -1.6497, ppm2: 3100, w: 7 },
  { city: 'Orvault', postcode: '44700', lat: 47.2711, lng: -1.6225, ppm2: 3550, w: 5 },
  { city: 'Vertou', postcode: '44120', lat: 47.1689, lng: -1.4697, ppm2: 3600, w: 5 },
  { city: 'Carquefou', postcode: '44470', lat: 47.2975, lng: -1.4914, ppm2: 3450, w: 4 },
  { city: 'Saint-Sébastien-sur-Loire', postcode: '44230', lat: 47.2081, lng: -1.5014, ppm2: 3500, w: 5 },
  { city: 'Bouguenais', postcode: '44340', lat: 47.1778, lng: -1.6236, ppm2: 3000, w: 4 },
  { city: 'La Chapelle-sur-Erdre', postcode: '44240', lat: 47.2994, lng: -1.5511, ppm2: 3600, w: 4 },
  { city: 'Sainte-Luce-sur-Loire', postcode: '44980', lat: 47.2506, lng: -1.4856, ppm2: 3350, w: 3 },
  { city: 'Couëron', postcode: '44220', lat: 47.2156, lng: -1.7228, ppm2: 2900, w: 3 },
  { city: 'Basse-Goulaine', postcode: '44115', lat: 47.2111, lng: -1.4658, ppm2: 3500, w: 2 },
];

export const DEMO_SOURCES = [
  { id: 'demo-a', label: 'Portail A (démo)', host: 'portail-a.example' },
  { id: 'demo-b', label: 'Portail B (démo)', host: 'portail-b.example' },
  { id: 'demo-c', label: 'Portail C (démo)', host: 'portail-c.example' },
  { id: 'demo-agence', label: 'Agence locale (démo)', host: 'agence.example' },
];

const FEATURES = [
  'balcon', 'cave', 'ascenseur', 'parking', 'garage', 'double vitrage', 'cuisine équipée', 'lumineux',
  'proche tram', 'proche écoles', 'calme', 'parquet', 'cheminée', 'traversant', 'exposé sud',
];
const RARE = [
  'vue Loire', 'dernier étage avec terrasse', 'loft atypique', 'ancien atelier', 'maison de maître',
  'hauteur sous plafond 3,4 m', 'sans vis-à-vis', 'jardin en plein centre', 'piscine', 'architecte',
  'divisible en deux lots', 'immeuble de rapport', 'rooftop', 'moulures et cachet',
];
const STREETS = ['quartier Graslin', 'secteur Procé', 'proche Talensac', 'quartier Chantenay', 'secteur Zola', 'proche Commerce', 'quartier Doulon', 'secteur Erdre', 'proche gare', 'quartier Hauts-Pavés', 'secteur Mairie', 'bord de Sèvre', 'proche bourg', 'quartier Trentemoult', 'secteur Pont-Rousseau', 'proche parc', 'quartier Dervallières', 'lotissement calme', 'secteur Beaujoire', 'centre historique'];
const DPE = ['A', 'B', 'C', 'C', 'D', 'D', 'D', 'E', 'E', 'F', 'G'];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 864e5;

export function generateDemo({ epoch, now = Date.now(), count = 240 } = {}) {
  const r = rng(20261122);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const between = (a, b) => a + r() * (b - a);
  const totalW = COMMUNES.reduce((s, c) => s + c.w, 0);
  const pickCommune = () => {
    let x = r() * totalW;
    for (const c of COMMUNES) if ((x -= c.w) <= 0) return c;
    return COMMUNES[0];
  };

  const out = [];
  for (let i = 0; i < count; i++) {
    const c = pickCommune();
    const tr = r();
    const type = tr < 0.55 ? 'appartement' : tr < 0.88 ? 'maison' : tr < 0.92 ? 'terrain' : tr < 0.96 ? 'immeuble' : 'local';
    let surface = null, landSurface = null, rooms = null;
    if (type === 'appartement') surface = Math.round(18 + r() ** 1.6 * 120);
    if (type === 'maison') { surface = Math.round(65 + r() ** 1.4 * 170); landSurface = Math.round(150 + r() ** 2 * 1800); }
    if (type === 'immeuble') surface = Math.round(160 + r() * 280);
    if (type === 'local') surface = Math.round(35 + r() * 180);
    if (type === 'terrain') landSurface = Math.round(300 + r() * 1500);
    if (surface && type !== 'local') rooms = Math.max(1, Math.min(9, Math.round(surface / 22 + between(-0.6, 0.6))));
    const bedrooms = rooms ? Math.max(0, rooms - 1) : null;

    const typeFactor = { appartement: 1, maison: 1.02, immeuble: 0.8, local: 0.6, terrain: 1 }[type];
    let ppm2 = c.ppm2 * typeFactor * between(0.88, 1.12);
    const undervalued = r() < 0.09;
    if (undervalued) ppm2 *= between(0.7, 0.83);
    const isRare = r() < 0.13;
    const rare = isRare ? pick(RARE) : null;
    if (isRare) ppm2 *= between(0.98, 1.1);
    const dpe = type === 'terrain' ? null : pick(DPE);
    if (dpe === 'F' || dpe === 'G') ppm2 *= 0.9;

    let price = type === 'terrain'
      ? Math.round((landSurface * between(160, 320)) / 1000) * 1000
      : Math.round((surface * ppm2) / 1000) * 1000;

    const feats = [...new Set(Array.from({ length: 2 + Math.floor(r() * 4) }, () => pick(FEATURES)))];
    const toRenovate = r() < 0.12;
    const urgent = r() < 0.05;
    const street = `${pick(STREETS)} ${pick(['', 'résidence', 'au calme', 'sur cour', 'côté jardin'])}`.trim();
    const lat = c.lat + between(-0.014, 0.014);
    const lng = c.lng + between(-0.02, 0.02);

    const offset = Math.round(between(-170, 30)); // jour de 1re diffusion relatif à l'epoch
    const duration = Math.round(between(15, 220));
    const dropAt = r() < 0.2 ? offset + Math.round(between(10, 70)) : null;
    const dropPct = between(0.03, 0.12);
    const nSources = r() < 0.48 ? 1 : r() < 0.7 ? 2 : 3;
    const sources = [...DEMO_SOURCES].sort(() => r() - 0.5).slice(0, nSources);
    const repostSource = r() < 0.07 ? 0 : -1;

    const typeLabel = { appartement: 'Appartement', maison: 'Maison', terrain: 'Terrain', immeuble: 'Immeuble', local: 'Local commercial' }[type];
    const core = [
      rare ? `Rare : ${rare}.` : '',
      type === 'terrain'
        ? `Terrain constructible de ${landSurface} m² viabilisé à ${c.city}, ${street}.`
        : `${typeLabel} de ${surface} m²${rooms ? `, ${rooms} pièces dont ${bedrooms} chambres` : ''}, situé à ${c.city}, ${street}.`,
      landSurface && type === 'maison' ? `Terrain de ${landSurface} m².` : '',
      feats.length ? `Prestations : ${feats.join(', ')}.` : '',
      toRenovate ? 'Bien à rénover, beau potentiel.' : 'Bon état général.',
      urgent ? 'Vente urgente, prix négociable.' : '',
      dpe ? `DPE : ${dpe}.` : '',
    ].filter(Boolean).join(' ');

    sources.forEach((s, si) => {
      const delay = si === 0 ? 0 : Math.round(between(0, 12));
      const variance = si === 0 ? 1 : between(0.975, 1.035);
      const publishes = [{ suffix: '', day: offset + delay }];
      if (si === repostSource && duration > 60) publishes.push({ suffix: '-r', day: offset + delay + 50 });

      publishes.forEach((pub, pi) => {
        const pubTime = epoch + pub.day * DAY;
        if (pubTime > now) return;
        const endTime = epoch + (offset + duration) * DAY;
        const soldOut = endTime < now;
        const superseded = pi < publishes.length - 1 && epoch + publishes[pi + 1].day * DAY <= now;
        const basePrice = Math.round((price * variance) / 500) * 500;
        const history = [{ date: new Date(pubTime).toISOString(), price: basePrice }];
        let current = basePrice;
        if (dropAt != null && epoch + dropAt * DAY <= now && dropAt > pub.day) {
          current = Math.round((basePrice * (1 - dropPct)) / 500) * 500;
          history.push({ date: new Date(epoch + dropAt * DAY).toISOString(), price: current });
        }
        const titles = [
          `${typeLabel}${rooms ? ` T${rooms}` : ''} ${surface ? `${surface} m²` : `${landSurface} m²`} – ${c.city}`,
          `Vente ${typeLabel.toLowerCase()} ${rooms ? `${rooms} pièces ` : ''}${c.city}`,
          `${rare ? rare[0].toUpperCase() + rare.slice(1) + ' · ' : ''}${typeLabel} ${c.city}`,
        ];
        const sid = `${s.id}:${i}${pub.suffix}`;
        out.push({
          id: sid,
          source: s.id,
          sourceLabel: s.label,
          sourceId: `${i}${pub.suffix}`,
          url: `https://${s.host}/annonce/${i}${pub.suffix}`,
          title: titles[(i + si) % titles.length],
          description: si === 0 ? core : `${core} ${si === 1 ? 'Contactez-nous pour une visite.' : 'Honoraires inclus.'}`,
          type,
          price: current,
          surface: surface && si === 2 ? Math.round(surface + between(-1, 1)) : surface,
          landSurface,
          rooms: si === 2 && r() < 0.3 ? null : rooms,
          bedrooms,
          dpe,
          city: c.city,
          postcode: c.postcode,
          lat: si === 1 ? null : lat,
          lng: si === 1 ? null : lng,
          photos: [],
          publishedAt: new Date(pubTime).toISOString(),
          firstSeen: new Date(pubTime).toISOString(),
          priceHistory: history,
          active: !soldOut && !superseded,
        });
      });
    });
  }
  return out;
}

export const demoSource = {
  id: 'demo',
  label: 'Données de démonstration',
  async fetch({ settings }) {
    return generateDemo({ epoch: settings.demoEpoch || Date.now() });
  },
};
