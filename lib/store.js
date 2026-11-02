'use strict';
/**
 * Acceso a Supabase (Postgres + Storage) por REST, sin dependencias.
 * Usa la clave "service role", que SOLO vive en las variables de entorno del servidor.
 */
const crypto = require('crypto');

const BUCKET = 'works';

function cfg() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw Object.assign(new Error('Falta configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.'), { status: 500, config: true });
  }
  return { url, key };
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const { url, key } = cfg();
  const headers = { apikey: key, Authorization: 'Bearer ' + key };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]} → ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const newId = () => crypto.randomBytes(5).toString('hex');

/* ── mapeo fila ⇄ objeto de la app ── */

const fromRow = (r) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  locationText: r.location_text,
  mapsUrl: r.maps_url,
  categories: r.categories || [],
  before: r.before || [],
  after: r.after || [],
  demo: !!r.demo,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRow = (w) => ({
  title: w.title,
  description: w.description,
  location_text: w.locationText,
  maps_url: w.mapsUrl,
  categories: w.categories,
  before: w.before,
  after: w.after,
});

/* ── categorías ── */

const listCategories = () => rest('categories?select=id,name,slug&order=position.asc');

async function createCategory(name, slug) {
  const rows = await rest('categories', { method: 'POST', body: { id: newId(), name, slug }, prefer: 'return=representation' });
  return rows[0];
}

async function renameCategory(id, name, slug) {
  const rows = await rest(`categories?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { name, slug }, prefer: 'return=representation' });
  return rows[0];
}

async function deleteCategory(id) {
  const q = encodeURIComponent(id);
  const withCat = await rest(`works?select=id,categories&categories=cs.${encodeURIComponent('{' + id + '}')}`);
  for (const w of withCat) {
    await rest(`works?id=eq.${encodeURIComponent(w.id)}`, { method: 'PATCH', body: { categories: w.categories.filter((c) => c !== id) } });
  }
  await rest(`categories?id=eq.${q}`, { method: 'DELETE' });
}

/* ── obras ── */

async function listWorks() {
  return (await rest('works?select=*&order=created_at.desc')).map(fromRow);
}

async function getWork(id) {
  const rows = await rest(`works?select=*&id=eq.${encodeURIComponent(id)}`);
  return rows[0] ? fromRow(rows[0]) : null;
}

async function createWork(value) {
  const rows = await rest('works', { method: 'POST', body: { id: newId(), ...toRow(value), demo: false }, prefer: 'return=representation' });
  return fromRow(rows[0]);
}

async function updateWork(id, value) {
  const rows = await rest(`works?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { ...toRow(value), updated_at: new Date().toISOString() },
    prefer: 'return=representation',
  });
  return rows[0] ? fromRow(rows[0]) : null;
}

const deleteWork = (id) => rest(`works?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });

async function deleteDemoWorks() {
  const rows = await rest('works?demo=eq.true', { method: 'DELETE', prefer: 'return=representation' });
  return rows.map(fromRow);
}

/* ── fotos (Storage) ── */

const isSample = (name) => name.startsWith('sample-');

/** URL pública de una foto: las de ejemplo viajan con el sitio; las reales viven en Storage. */
function photoUrl(name) {
  if (isSample(name)) return '/samples/' + name;
  return `${cfg().url}/storage/v1/object/public/${BUCKET}/${name}`;
}

async function uploadPhoto(name, buf, contentType) {
  const { url, key } = cfg();
  const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': contentType, 'x-upsert': 'false' },
    body: buf,
  });
  if (!r.ok) throw new Error(`Storage upload → ${r.status} ${(await r.text()).slice(0, 300)}`);
}

/** Borra de Storage las fotos de la lista que ya no usa ninguna obra. */
async function deleteUnusedPhotos(candidates) {
  const list = [...new Set(candidates)].filter((f) => f && !isSample(f));
  if (!list.length) return;
  const rows = await rest('works?select=before,after');
  const used = new Set();
  for (const w of rows) for (const f of [...(w.before || []), ...(w.after || [])]) used.add(f);
  const doomed = list.filter((f) => !used.has(f));
  if (!doomed.length) return;
  const { url, key } = cfg();
  await fetch(`${url}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: doomed }),
  }).catch(() => {});
}

/* ── límite de intentos de login (persistente entre invocaciones) ── */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;

async function attemptRow(ip) {
  const rows = await rest(`login_attempts?select=*&ip=eq.${encodeURIComponent(ip)}`);
  const r = rows[0];
  if (!r || Date.now() - new Date(r.first_at).getTime() > WINDOW_MS) return null;
  return r;
}

const rate = {
  async blocked(ip) {
    const r = await attemptRow(ip);
    return !!r && r.fails >= MAX_FAILS;
  },
  async fail(ip) {
    const r = await attemptRow(ip);
    if (!r) {
      await rest('login_attempts?on_conflict=ip', {
        method: 'POST',
        body: { ip, fails: 1, first_at: new Date().toISOString() },
        prefer: 'resolution=merge-duplicates',
      });
    } else {
      await rest(`login_attempts?ip=eq.${encodeURIComponent(ip)}`, { method: 'PATCH', body: { fails: r.fails + 1 } });
    }
  },
  async clear(ip) {
    await rest(`login_attempts?ip=eq.${encodeURIComponent(ip)}`, { method: 'DELETE' });
  },
};

module.exports = {
  cfg, newId, listCategories, createCategory, renameCategory, deleteCategory,
  listWorks, getWork, createWork, updateWork, deleteWork, deleteDemoWorks,
  photoUrl, uploadPhoto, deleteUnusedPhotos, rate,
};
