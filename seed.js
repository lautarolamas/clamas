'use strict';
/**
 * Datos iniciales: categorías por defecto + algunas obras de EJEMPLO con ilustraciones
 * (no son fotos reales). Se cargan una sola vez, la primera vez que arranca el servidor.
 * Desde el panel hay un botón para borrar todos los ejemplos de una vez.
 *
 * Para arrancar sin ejemplos:  SEED_DEMO=0 node server.js
 */
const fs = require('fs');
const path = require('path');
const db = require('./lib/db');
const { slugify } = require('./lib/validate');

const DEFAULT_CATEGORIES = [
  'Refacciones',
  'Pérgolas',
  'Pintura',
  'Techos',
  'Frentes',
  'Revestimientos',
  'Pisos y decks',
  'Baños y cocinas',
  'Quinchos y galerías',
];

/* ───────────── ilustraciones de ejemplo (SVG generado) ───────────── */

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function scene({ kind, after, variant = 0 }) {
  const r = rng(kind.length * 977 + variant * 131 + (after ? 7 : 3));
  const sky = after ? ['#1f2f4d', '#c97b63', '#f7c98b'] : ['#9aa3aa', '#c3c9cd', '#dde0e2'];
  const wallBefore = ['#b8ac98', '#bfb4a2', '#a99d8a'][variant % 3];
  const wallAfter = {
    paint: ['#ece6da', '#dfe3e0'],
    roof: ['#d9cfbe', '#cfd3d6'],
    pergola: ['#d8d0c2', '#e2d9c8'],
    deck: ['#e3dccf', '#d6d0c4'],
    stone: ['#ebe4d6', '#e0d8c8'],
  }[kind][variant % 2];
  const wall = after ? wallAfter : wallBefore;
  const trim = after ? (kind === 'paint' ? '#2a2a2c' : '#f3efe6') : '#9c917f';
  const roofAfter = kind === 'roof' ? ['#b5523a', '#3d4248'][variant % 2] : ['#5a4a44', '#454a50'][variant % 2];
  const roofBefore = kind === 'roof' ? '#8a5a44' : '#6b5a52';
  const roof = after ? roofAfter : roofBefore;

  const dx = [0, -40][variant % 2];
  const sc = [1, 1.06][variant % 2];

  let o = '';
  o += `<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".62" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
    <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${after ? '#2f4d33' : '#756d61'}"/><stop offset="1" stop-color="${after ? '#1a2f1f' : '#4d483f'}"/></linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#ffd98f" stop-opacity=".95"/><stop offset="1" stop-color="#ffd98f" stop-opacity="0"/></radialGradient>
    <clipPath id="roofclip"><polygon points="130,345 600,165 1070,345"/></clipPath>
  </defs>`;
  o += `<rect width="1200" height="900" fill="url(#sky)"/>`;
  o += `<rect y="560" width="1200" height="340" fill="url(#gr)"/>`;

  if (after) {
    // sol bajo
    o += `<circle cx="${190 + variant * 700}" cy="520" r="160" fill="url(#glow)" opacity=".55"/>`;
  } else {
    for (let i = 0; i < 26; i++) {
      o += `<ellipse cx="${r() * 1200}" cy="${600 + r() * 280}" rx="${30 + r() * 70}" ry="${6 + r() * 12}" fill="#3e3a33" opacity=".18"/>`;
    }
  }

  o += `<g transform="translate(${dx} ${variant % 2 ? -10 : 0}) scale(${sc})">`;

  // pared
  o += `<rect x="180" y="330" width="840" height="320" fill="${wall}"/>`;
  o += `<rect x="180" y="630" width="840" height="20" fill="${trim}" opacity=".9"/>`;

  if (!after) {
    for (let i = 0; i < 18; i++) {
      o += `<ellipse cx="${200 + r() * 800}" cy="${350 + r() * 280}" rx="${20 + r() * 60}" ry="${10 + r() * 40}" fill="#4a3f33" opacity="${0.1 + r() * 0.12}"/>`;
    }
    if (kind === 'paint' || kind === 'stone') {
      for (let i = 0; i < 14; i++) { // pintura descascarada
        const x = 200 + r() * 760, y = 350 + r() * 260;
        o += `<polygon points="${x},${y} ${x + 40 + r() * 50},${y + 8} ${x + 30 + r() * 40},${y + 36 + r() * 20} ${x - 6},${y + 26}" fill="#d8cfbd" opacity=".75"/>`;
      }
    }
    o += `<polyline points="330,340 345,400 322,450 352,520" fill="none" stroke="#3b332a" stroke-width="3" opacity=".6"/>`;
    o += `<polyline points="840,350 826,410 850,470" fill="none" stroke="#3b332a" stroke-width="3" opacity=".5"/>`;
  }

  // revestimiento de piedra
  if (kind === 'stone' && after) {
    const tones = ['#b9ae9c', '#a79c8a', '#c9bfae', '#98907f', '#b3a791'];
    let y = 470;
    let row = 0;
    while (y < 628) {
      let x = 180 - (row % 2) * 40;
      while (x < 1020) {
        const w = 70 + r() * 70;
        const h = 36 + r() * 8;
        const x0 = Math.max(180, x), x1 = Math.min(1020, x + w);
        if (x1 > x0) o += `<rect x="${x0 + 1.5}" y="${y + 1.5}" width="${x1 - x0 - 3}" height="${h - 3}" rx="5" fill="${tones[Math.floor(r() * tones.length)]}"/>`;
        x += w;
      }
      y += 40;
      row++;
    }
    o += `<rect x="180" y="466" width="840" height="8" fill="#2a2a2c"/>`;
  }

  // techo
  o += `<polygon points="130,345 600,165 1070,345" fill="${roof}"/>`;
  o += `<g clip-path="url(#roofclip)">`;
  if (kind === 'roof' && !after) {
    for (let x = 100; x < 1100; x += 18) o += `<line x1="${x}" y1="150" x2="${x}" y2="360" stroke="#4d2f22" stroke-width="2.5" opacity=".55"/>`;
    for (let i = 0; i < 16; i++) o += `<ellipse cx="${200 + r() * 800}" cy="${200 + r() * 140}" rx="${20 + r() * 50}" ry="${8 + r() * 18}" fill="#5f7a3a" opacity=".45"/>`;
    for (let i = 0; i < 9; i++) o += `<ellipse cx="${200 + r() * 800}" cy="${200 + r() * 140}" rx="${14 + r() * 36}" ry="${6 + r() * 12}" fill="#3f2418" opacity=".5"/>`;
    o += `<polygon points="520,260 590,250 600,300 530,310" fill="#1f1a17" opacity=".85"/>`;
  } else {
    let row = 0;
    for (let y = 170; y < 350; y += 15) {
      for (let x = 100 + (row % 2) * 14; x < 1100; x += 28) {
        o += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 15}" stroke="#000" stroke-width="2" opacity="${after ? 0.22 : 0.18}"/>`;
      }
      o += `<line x1="100" y1="${y + 15}" x2="1100" y2="${y + 15}" stroke="#000" stroke-width="2.5" opacity="${after ? 0.25 : 0.2}"/>`;
      row++;
    }
    if (after) o += `<polygon points="130,345 600,165 1070,345 1070,200 600,40 130,200" fill="#fff" opacity=".04"/>`;
  }
  o += `</g>`;
  o += `<polygon points="120,350 600,160 1080,350 1080,360 600,172 120,360" fill="${trim}" opacity="${after ? 1 : 0.8}"/>`;
  // chimenea
  o += `<rect x="780" y="190" width="56" height="110" fill="${after ? '#9a8f80' : '#7d7466'}"/><rect x="772" y="182" width="72" height="14" fill="${after ? '#2a2a2c' : '#5c5448'}"/>`;

  // ventanas y puerta
  const glass = after ? '#ffd98f' : '#7f909b';
  const frame = after ? '#26262a' : '#6d655a';
  const windows = [[250, 430], [770, 430]];
  for (const [x, y] of windows) {
    if (after) o += `<ellipse cx="${x + 80}" cy="${y + 70}" rx="190" ry="150" fill="url(#glow)" opacity=".5"/>`;
    o += `<rect x="${x - 10}" y="${y - 10}" width="180" height="160" fill="${frame}"/>`;
    o += `<rect x="${x}" y="${y}" width="160" height="140" fill="${glass}"/>`;
    o += `<rect x="${x + 77}" y="${y}" width="6" height="140" fill="${frame}"/><rect x="${x}" y="${y + 67}" width="160" height="6" fill="${frame}"/>`;
  }
  const door = after ? (kind === 'paint' ? '#7a4a2a' : '#5b3a24') : '#6e5a45';
  o += `<rect x="530" y="440" width="140" height="210" fill="${frame}"/><rect x="540" y="450" width="120" height="200" fill="${door}"/>`;
  if (after) {
    for (let i = 0; i < 8; i++) o += `<rect x="540" y="${458 + i * 25}" width="120" height="2.5" fill="#000" opacity=".25"/>`;
    o += `<circle cx="600" cy="405" r="70" fill="url(#glow)" opacity=".5"/><rect x="590" y="395" width="20" height="26" rx="4" fill="#ffe9a8"/>`;
  }
  o += `</g>`;

  // primer plano según el tipo de obra
  if (kind === 'pergola' || kind === 'deck') {
    if (after) {
      // piso de madera
      o += `<polygon points="90,800 1110,800 880,640 320,640" fill="#8a6039"/>`;
      for (let i = 1; i < 11; i++) {
        const t = i / 11;
        o += `<line x1="${320 - 230 * t}" y1="${640 + 160 * t}" x2="${880 + 230 * t}" y2="${640 + 160 * t}" stroke="#4a2f18" stroke-width="2.5" opacity=".55"/>`;
      }
      // postes
      const post = '#6f4a28';
      o += `<rect x="150" y="460" width="26" height="340" fill="${post}"/><rect x="1024" y="460" width="26" height="340" fill="${post}"/>`;
      o += `<rect x="330" y="436" width="18" height="214" fill="${post}"/><rect x="852" y="436" width="18" height="214" fill="${post}"/>`;
      if (kind === 'deck') {
        // techo liviano de galería
        o += `<polygon points="120,462 1080,462 880,432 320,432" fill="#4a3a30"/>`;
        o += `<polygon points="120,462 1080,462 1080,480 120,480" fill="#2e251f"/>`;
      } else {
        // vigas y tirantes
        o += `<rect x="130" y="450" width="940" height="22" fill="#7d542f"/><rect x="316" y="426" width="568" height="16" fill="#6a4727"/>`;
        for (let i = 0; i < 14; i++) {
          const xf = 150 + i * 70;
          const xb = 326 + (xf - 150) * (540 / 910);
          o += `<line x1="${xf}" y1="450" x2="${xb}" y2="426" stroke="#8b5a2b" stroke-width="13"/><line x1="${xf}" y1="446" x2="${xb}" y2="422" stroke="#b07a42" stroke-width="3"/>`;
        }
      }
      // guirnalda de luces
      for (let i = 0; i < 22; i++) {
        const x = 150 + i * 42;
        const y = 486 + Math.sin(i / 21 * Math.PI) * 22;
        o += `<circle cx="${x}" cy="${y}" r="20" fill="url(#glow)" opacity=".55"/><circle cx="${x}" cy="${y}" r="5.5" fill="#fff2c4"/>`;
      }
      // mesa y sillas
      o += `<rect x="500" y="700" width="200" height="14" rx="4" fill="#2a2a2c"/><rect x="520" y="714" width="10" height="56" fill="#2a2a2c"/><rect x="670" y="714" width="10" height="56" fill="#2a2a2c"/>`;
      o += `<rect x="440" y="716" width="46" height="36" rx="6" fill="#3a3a3e"/><rect x="714" y="716" width="46" height="36" rx="6" fill="#3a3a3e"/>`;
    } else {
      o += `<polygon points="120,800 1080,800 860,650 340,650" fill="#8d8a84"/>`;
      o += `<line x1="600" y1="650" x2="600" y2="800" stroke="#5f5c56" stroke-width="3"/><line x1="230" y1="725" x2="970" y2="725" stroke="#5f5c56" stroke-width="3"/>`;
      for (let i = 0; i < 30; i++) {
        const x = 80 + r() * 1040, y = 640 + r() * 220;
        o += `<path d="M${x} ${y} q${-6 + r() * 12} -22 ${-4 + r() * 8} -34 M${x} ${y} q8 -18 14 -28" stroke="#5c6a3a" stroke-width="3" fill="none" opacity=".8"/>`;
      }
      o += `<rect x="880" y="720" width="70" height="40" fill="#b9b3a7" opacity=".7"/>`;
    }
  } else if (after) {
    // camino de piedra y canteros
    o += `<polygon points="520,660 680,660 760,800 440,800" fill="#bdb5a6"/>`;
    for (let i = 0; i < 4; i++) o += `<line x1="${520 - i * 22}" y1="${690 + i * 28}" x2="${680 + i * 22}" y2="${690 + i * 28}" stroke="#8f887a" stroke-width="3"/>`;
    for (let i = 0; i < 16; i++) {
      const x = 180 + i * 56 + r() * 20;
      if (x > 470 && x < 740) continue;
      o += `<ellipse cx="${x}" cy="${648 + r() * 14}" rx="${22 + r() * 14}" ry="${18 + r() * 12}" fill="#2f5a33"/>`;
    }
  } else {
    o += `<polygon points="520,660 680,660 760,800 440,800" fill="#8a8479"/>`;
    for (let i = 0; i < 24; i++) {
      const x = 80 + r() * 1040, y = 650 + r() * 220;
      o += `<path d="M${x} ${y} q${-6 + r() * 12} -20 ${-4 + r() * 8} -30" stroke="#6a6c42" stroke-width="3" fill="none" opacity=".8"/>`;
    }
  }

  if (!after) o += `<rect width="1200" height="900" fill="#7b7468" opacity=".1"/>`;

  // marca de agua
  o += `<g><rect x="400" y="836" width="400" height="40" rx="20" fill="#000" opacity=".5"/><text x="600" y="863" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" letter-spacing="5" fill="#fff" opacity=".9">FOTO DE EJEMPLO</text></g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900">${o}</svg>`;
}

/* ───────────── obras de ejemplo ───────────── */

const WORKS = [
  {
    key: 'pergola',
    title: 'Pérgola de madera con deck y luces',
    description:
      'Ejemplo de cómo se ve una obra publicada. Acá va una descripción breve de lo que se hizo: pérgola de madera tratada, deck en el piso, iluminación cálida y pintura al tono de la casa.',
    locationText: 'Zona Norte, Buenos Aires',
    categories: ['Pérgolas', 'Pisos y decks', 'Quinchos y galerías'],
    before: 2,
    after: 2,
    daysAgo: 4,
  },
  {
    key: 'paint',
    title: 'Frente renovado y pintura exterior',
    description:
      'Ejemplo: se eliminó la pintura descascarada, se repararon fisuras, se pintó todo el frente y se renovó la puerta de entrada.',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Buenos+Aires',
    categories: ['Pintura', 'Frentes', 'Refacciones'],
    before: 2,
    after: 2,
    daysAgo: 12,
  },
  {
    key: 'roof',
    title: 'Techo nuevo con tejas',
    description:
      'Ejemplo: retiro del techo viejo con filtraciones, reparación de la estructura y colocación de tejas nuevas con buena aislación.',
    locationText: 'Zona Oeste, Gran Buenos Aires',
    categories: ['Techos', 'Refacciones'],
    before: 1,
    after: 1,
    daysAgo: 25,
  },
  {
    key: 'deck',
    title: 'Galería con techo y deck de madera',
    description:
      'Ejemplo: una galería para aprovechar el jardín todo el año, con techo liviano, piso de deck e iluminación para las noches.',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Buenos+Aires',
    locationText: 'Zona Sur, Buenos Aires',
    categories: ['Quinchos y galerías', 'Pisos y decks'],
    before: 1,
    after: 1,
    daysAgo: 40,
  },
  {
    key: 'stone',
    title: 'Revestimiento de piedra en el frente',
    description:
      'Ejemplo: revestimiento de piedra en el zócalo del frente, nueva iluminación y pintura general para darle otra imagen a la casa.',
    locationText: 'Capital Federal',
    categories: ['Revestimientos', 'Frentes'],
    before: 1,
    after: 1,
    daysAgo: 55,
  },
];

function seedIfEmpty() {
  const s = db.state;
  if (s.seeded) return;
  if (s.categories.length || s.works.length) {
    s.seeded = true;
    db.save();
    return;
  }

  const catByName = {};
  for (const name of DEFAULT_CATEGORIES) {
    const c = { id: db.newId(), name, slug: slugify(name) };
    s.categories.push(c);
    catByName[name] = c.id;
  }

  if (process.env.SEED_DEMO !== '0') {
    for (const w of WORKS) {
      const files = { before: [], after: [] };
      for (const side of ['before', 'after']) {
        for (let i = 0; i < w[side]; i++) {
          const name = `sample-${w.key}-${side === 'before' ? 'antes' : 'despues'}-${i + 1}.svg`;
          fs.writeFileSync(path.join(db.UPLOAD_DIR, name), scene({ kind: w.key, after: side === 'after', variant: i }));
          files[side].push(name);
        }
      }
      const created = new Date(Date.now() - w.daysAgo * 86400000).toISOString();
      s.works.push({
        id: db.newId(),
        title: w.title,
        description: w.description,
        locationText: w.locationText || '',
        mapsUrl: w.mapsUrl || '',
        categories: w.categories.map((n) => catByName[n]).filter(Boolean),
        before: files.before,
        after: files.after,
        demo: true,
        createdAt: created,
        updatedAt: created,
      });
    }
  }

  s.seeded = true;
  db.save();
}

module.exports = { seedIfEmpty, scene };
