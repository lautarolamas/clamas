'use strict';
/**
 * API del sitio como función de Vercel (todas las rutas /api/*).
 * Datos y fotos: Supabase (ver lib/store.js). Sin dependencias.
 */
const crypto = require('crypto');
const auth = require('../lib/auth');
const V = require('../lib/validate');
const store = require('../lib/store');

const MAX_UPLOAD = 4 * 1024 * 1024; // Vercel limita el cuerpo de una función a 4,5 MB

const SITE = {
  whatsapp: (process.env.WHATSAPP || '5491127231155').replace(/\D/g, ''),
  whatsappDisplay: process.env.WHATSAPP_DISPLAY || '11 2723-1155',
  instagram: process.env.INSTAGRAM_URL || 'https://www.instagram.com/_elgarage.cl_/',
  instagramHandle: process.env.INSTAGRAM_HANDLE || '@_elgarage.cl_',
};

/* ───────────────────────── utilidades ───────────────────────── */

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...BASE_HEADERS, ...headers });
  res.end(body);
}

function json(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
}

const fail = (res, status, message) => json(res, status, { error: message });

/** Cuerpo de la petición como Buffer (Vercel puede traerlo ya leído en req.body). */
async function readBody(req, limit) {
  let buf;
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) buf = req.body;
    else if (typeof req.body === 'string') buf = Buffer.from(req.body);
    else buf = Buffer.from(JSON.stringify(req.body));
  } else {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw Object.assign(new Error('La foto es demasiado grande.'), { status: 413 });
      chunks.push(c);
    }
    buf = Buffer.concat(chunks);
  }
  if (buf.length > limit) throw Object.assign(new Error('La foto es demasiado grande.'), { status: 413 });
  return buf;
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const buf = await readBody(req, 200 * 1024);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (_) {
    throw Object.assign(new Error('JSON inválido'), { status: 400 });
  }
}

function clientIp(req) {
  const xf = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

const isSecure = (req) => req.headers['x-forwarded-proto'] === 'https';

/* ───────────────────────── vistas ───────────────────────── */

const serializeWork = (w) => ({
  id: w.id,
  title: w.title,
  description: w.description || '',
  locationText: w.locationText || '',
  mapsUrl: w.mapsUrl || '',
  categories: w.categories || [],
  before: (w.before || []).map(store.photoUrl),
  after: (w.after || []).map(store.photoUrl),
  demo: !!w.demo,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
});

const categoryView = (c) => ({ id: c.id, name: c.name, slug: c.slug });

async function parseWork(body) {
  const title = V.cleanText(body.title, 120);
  if (!title) return { error: 'Poné un título para la obra.' };

  const description = V.cleanText(body.description, 1200, true);
  const locationText = V.cleanText(body.locationText, 160);

  const mapsUrl = V.cleanMapsUrl(body.mapsUrl);
  if (mapsUrl === null) {
    return { error: 'Ese link no parece ser de Google Maps. Abrí el lugar en Google Maps, tocá "Compartir" y pegá el link.' };
  }

  const validCats = new Set((await store.listCategories()).map((c) => c.id));
  const categories = [...new Set(Array.isArray(body.categories) ? body.categories : [])]
    .filter((id) => typeof id === 'string' && validCats.has(id));

  const before = V.cleanFiles(body.before);
  const after = V.cleanFiles(body.after);
  if (!before.length && !after.length) return { error: 'Subí al menos una foto (del antes o del después).' };

  return { value: { title, description, locationText, mapsUrl, categories, before, after } };
}

const categoryName = (body) => V.cleanText(body.name, 40);
const filesOf = (w) => [...(w.before || []), ...(w.after || [])];

/* ───────────────────────── rutas ───────────────────────── */

const routes = [];
function route(method, pattern, handler, { admin = false } = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler, admin });
}

/* ── público ── */

route('GET', '/api/site', (req, res) =>
  json(res, 200, SITE, { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }));

route('GET', '/api/works', async (req, res) => {
  const [works, categories] = await Promise.all([store.listWorks(), store.listCategories()]);
  const counts = {};
  for (const w of works) for (const c of w.categories || []) counts[c] = (counts[c] || 0) + 1;
  json(res, 200, {
    categories: categories.filter((c) => counts[c.id]).map((c) => ({ ...categoryView(c), count: counts[c.id] })),
    works: works.map(serializeWork),
  });
});

/* ── diagnóstico (sin datos sensibles): /api/health ── */

route('GET', '/api/health', async (req, res) => {
  const out = {
    supabaseUrl: !!process.env.SUPABASE_URL,
    serviceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    adminPassSet: !!process.env.ADMIN_PASS,
  };
  try { await store.rate.blocked('health-check'); out.loginTable = 'ok'; } catch (e) { out.loginTable = String(e.message).slice(0, 200); }
  json(res, 200, out);
});

/* ── login ── */

route('GET', '/api/admin/me', (req, res) => json(res, 200, { authenticated: auth.isAuthed(req) }));

route('POST', '/api/admin/login', async (req, res) => {
  const ip = clientIp(req);
  if (await auth.rate.blocked(ip)) return fail(res, 429, 'Demasiados intentos. Esperá unos minutos y probá de nuevo.');
  const body = await readJson(req);
  if (!auth.check(body.user, body.password)) {
    await auth.rate.fail(ip);
    await new Promise((r) => setTimeout(r, 500));
    return fail(res, 401, 'Usuario o contraseña incorrectos.');
  }
  await auth.rate.clear(ip);
  json(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader(auth.createToken(), isSecure(req)) });
});

route('POST', '/api/admin/logout', (req, res) =>
  json(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader('', isSecure(req)) }));

/* ── obras (admin) ── */

route('GET', '/api/admin/works', async (req, res) => {
  const [works, categories] = await Promise.all([store.listWorks(), store.listCategories()]);
  json(res, 200, { categories: categories.map(categoryView), works: works.map(serializeWork) });
}, { admin: true });

route('POST', '/api/admin/works', async (req, res) => {
  const { error, value } = await parseWork(await readJson(req));
  if (error) return fail(res, 400, error);
  json(res, 201, { work: serializeWork(await store.createWork(value)) });
}, { admin: true });

route('PUT', '/api/admin/works/:id', async (req, res, p) => {
  const work = await store.getWork(p.id);
  if (!work) return fail(res, 404, 'No encontré esa obra.');
  const { error, value } = await parseWork(await readJson(req));
  if (error) return fail(res, 400, error);
  const updated = await store.updateWork(p.id, value);
  await store.deleteUnusedPhotos(filesOf(work));
  json(res, 200, { work: serializeWork(updated) });
}, { admin: true });

route('DELETE', '/api/admin/works/:id', async (req, res, p) => {
  const work = await store.getWork(p.id);
  if (!work) return fail(res, 404, 'No encontré esa obra.');
  await store.deleteWork(p.id);
  await store.deleteUnusedPhotos(filesOf(work));
  json(res, 200, { ok: true });
}, { admin: true });

route('DELETE', '/api/admin/demo-works', async (req, res) => {
  const removed = await store.deleteDemoWorks();
  await store.deleteUnusedPhotos(removed.flatMap(filesOf));
  json(res, 200, { ok: true, removed: removed.length });
}, { admin: true });

/* ── categorías (admin) ── */

route('POST', '/api/admin/categories', async (req, res) => {
  const name = categoryName(await readJson(req));
  if (!name) return fail(res, 400, 'Escribí el nombre de la categoría.');
  const slug = V.slugify(name);
  const existing = (await store.listCategories()).find((c) => c.slug === slug);
  if (existing) return json(res, 200, { category: categoryView(existing), existed: true });
  json(res, 201, { category: categoryView(await store.createCategory(name, slug)) });
}, { admin: true });

route('PUT', '/api/admin/categories/:id', async (req, res, p) => {
  const all = await store.listCategories();
  if (!all.some((c) => c.id === p.id)) return fail(res, 404, 'No encontré esa categoría.');
  const name = categoryName(await readJson(req));
  if (!name) return fail(res, 400, 'Escribí el nombre de la categoría.');
  const slug = V.slugify(name);
  if (all.some((c) => c.id !== p.id && c.slug === slug)) return fail(res, 409, 'Ya existe una categoría con ese nombre.');
  json(res, 200, { category: categoryView(await store.renameCategory(p.id, name, slug)) });
}, { admin: true });

route('DELETE', '/api/admin/categories/:id', async (req, res, p) => {
  if (!(await store.listCategories()).some((c) => c.id === p.id)) return fail(res, 404, 'No encontré esa categoría.');
  await store.deleteCategory(p.id);
  json(res, 200, { ok: true });
}, { admin: true });

/* ── subida de fotos (cuerpo binario, una foto por request) ── */

route('POST', '/api/admin/upload', async (req, res) => {
  const buf = await readBody(req, MAX_UPLOAD);
  const kind = V.sniffImage(buf);
  if (!kind) return fail(res, 415, 'Esa foto no es JPG, PNG ni WEBP. Probá con otra.');
  const name = crypto.randomBytes(12).toString('hex') + '.' + kind;
  await store.uploadPhoto(name, buf, { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[kind]);
  json(res, 201, { file: name, url: store.photoUrl(name) });
}, { admin: true });

/* ───────────────────────── entrada ───────────────────────── */

async function handle(req, res) {
  const u = new URL(req.url, 'http://localhost');
  // En Vercel, vercel.json reenvía /api/* a esta función con la ruta original en ?__p=
  const pathname = u.searchParams.has('__p') ? '/api/' + u.searchParams.get('__p').replace(/^\/+/, '') : u.pathname;
  const r = routes.find((x) => x.method === req.method && x.re.test(pathname));
  if (!r) {
    const known = routes.some((x) => x.re.test(pathname));
    return fail(res, known ? 405 : 404, known ? 'Método no permitido' : 'No encontrado');
  }
  if (r.admin && !auth.isAuthed(req)) return fail(res, 401, 'Tu sesión venció. Volvé a ingresar.');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // Defensa CSRF extra: el Origin (si viene) debe coincidir con el host
    const origin = req.headers.origin;
    if (origin) {
      let ok = false;
      try { ok = new URL(origin).host === req.headers.host; } catch (_) { /* inválido */ }
      if (!ok) return fail(res, 403, 'Origen no permitido.');
    }
  }
  const m = pathname.match(r.re);
  const params = {};
  r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
  return r.handler(req, res, params);
}

module.exports = (req, res) => {
  handle(req, res).catch((err) => {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) {
      fail(res, status, err.config ? err.message : status === 500 ? 'Algo salió mal. Probá de nuevo.' : err.message);
    } else res.end();
  });
};

// Dejamos que Vercel no pre-lea el cuerpo (las fotos llegan como binario crudo)
module.exports.config = { api: { bodyParser: false } };
