'use strict';
/**
 * CL · Cambio de imagen de tu casa
 * Servidor sin dependencias (solo Node 18+): sitio público + API + panel /admin.
 *
 *   node server.js
 *
 * Variables de entorno opcionales:
 *   PORT            puerto (3000)
 *   ADMIN_USER      usuario del panel (clamas)
 *   ADMIN_PASS      contraseña del panel (1972)
 *   DATA_DIR        carpeta donde se guardan db.json y las fotos (./data)
 *   WHATSAPP        número con código de país, sin + (5491127231155)
 *   INSTAGRAM_URL   link al Instagram
 *   TRUST_PROXY     "1" si está detrás de un proxy/hosting (Render, Railway, nginx...)
 *   SEED_DEMO       "0" para NO cargar obras de ejemplo en la primera ejecución
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const db = require('./lib/db');
const auth = require('./lib/auth');
const V = require('./lib/validate');
const { seedIfEmpty } = require('./seed');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const TRUST_PROXY = !!process.env.TRUST_PROXY;
const MAX_UPLOAD = 15 * 1024 * 1024;

const SITE = {
  whatsapp: (process.env.WHATSAPP || '5491127231155').replace(/\D/g, ''),
  whatsappDisplay: process.env.WHATSAPP_DISPLAY || '11 2723-1155',
  instagram: process.env.INSTAGRAM_URL || 'https://www.instagram.com/_elgarage.cl_/',
  instagramHandle: process.env.INSTAGRAM_HANDLE || '@_elgarage.cl_',
};

/* ───────────────────────── utilidades HTTP ───────────────────────── */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function json(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
}

const fail = (res, status, message) => json(res, status, { error: message });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Archivo demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, 200 * 1024);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (_) {
    throw Object.assign(new Error('JSON inválido'), { status: 400 });
  }
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const xf = req.headers['x-forwarded-for'];
    if (xf) return String(xf).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

const isSecure = (req) =>
  !!req.socket.encrypted || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');

/* ───────────────────────── archivos estáticos ───────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const gzipCache = new Map();

function serveFile(req, res, file, opts = {}) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(req, res);
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const extra = opts.headers || {};
    const cache = opts.immutable ? 'public, max-age=31536000, immutable' : 'no-cache';
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ...SECURITY_HEADERS, ETag: etag, 'Cache-Control': cache });
      return res.end();
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const headers = { ...SECURITY_HEADERS, 'Content-Type': type, ETag: etag, 'Cache-Control': cache, ...extra };
    const compressible = /^(text\/|application\/(javascript|json))/.test(type) || ext === '.svg';
    const wantsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');

    if (compressible && wantsGzip) {
      const key = file + etag;
      const done = (gz) => {
        res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': gz.length });
        res.end(req.method === 'HEAD' ? undefined : gz);
      };
      if (gzipCache.has(key)) return done(gzipCache.get(key));
      return fs.readFile(file, (e, data) => {
        if (e) return notFound(req, res);
        const gz = zlib.gzipSync(data);
        if (gzipCache.size > 200) gzipCache.clear();
        gzipCache.set(key, gz);
        done(gz);
      });
    }

    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function notFound(req, res) {
  const page = path.join(PUBLIC_DIR, '404.html');
  if (req.headers.accept && req.headers.accept.includes('text/html') && fs.existsSync(page)) {
    return send(res, 404, fs.readFileSync(page), { 'Content-Type': 'text/html; charset=utf-8' });
  }
  send(res, 404, 'No encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
}

function serveStatic(req, res, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (_) {
    return notFound(req, res);
  }
  if (decoded.includes('\0')) return notFound(req, res);

  // Las fotos subidas viven en DATA_DIR/uploads
  if (decoded.startsWith('/uploads/')) {
    const name = decoded.slice('/uploads/'.length);
    if (!V.isValidFileName(name)) return notFound(req, res);
    return serveFile(req, res, path.join(db.UPLOAD_DIR, name), {
      immutable: true,
      headers: { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" },
    });
  }

  if (decoded === '/admin') {
    return send(res, 301, '', { Location: '/admin/' });
  }

  let file = path.join(PUBLIC_DIR, path.normalize(decoded));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return notFound(req, res);
  if (path.basename(file).startsWith('.')) return notFound(req, res);
  if (decoded.endsWith('/')) file = path.join(file, 'index.html');

  const extra = decoded.startsWith('/admin/') ? { 'X-Robots-Tag': 'noindex, nofollow' } : {};
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, 'index.html');
    // las imágenes del sitio (logo, etc.) cambian poco: caché corta
    const isImg = /\.(png|jpe?g|webp|ico)$/i.test(file);
    serveFile(req, res, file, { headers: isImg ? { 'Cache-Control': 'public, max-age=86400' } : extra });
  });
}

/* ───────────────────────── router de la API ───────────────────────── */

const routes = [];
function route(method, pattern, handler, { admin = false } = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler, admin });
}

const serializeWork = (w) => ({
  id: w.id,
  title: w.title,
  description: w.description || '',
  locationText: w.locationText || '',
  mapsUrl: w.mapsUrl || '',
  categories: w.categories || [],
  before: (w.before || []).map((f) => '/uploads/' + f),
  after: (w.after || []).map((f) => '/uploads/' + f),
  demo: !!w.demo,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
});

const byNewest = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
const categoryView = (c) => ({ id: c.id, name: c.name, slug: c.slug });

/* ── público ── */

route('GET', '/api/site', (req, res) => json(res, 200, SITE));

route('GET', '/api/works', (req, res) => {
  const { works, categories } = db.state;
  const counts = {};
  for (const w of works) for (const c of w.categories || []) counts[c] = (counts[c] || 0) + 1;
  json(res, 200, {
    categories: categories.filter((c) => counts[c.id]).map((c) => ({ ...categoryView(c), count: counts[c.id] })),
    works: [...works].sort(byNewest).map(serializeWork),
  });
});

/* ── login ── */

route('GET', '/api/admin/me', (req, res) => json(res, 200, { authenticated: auth.isAuthed(req) }));

route('POST', '/api/admin/login', async (req, res) => {
  const ip = clientIp(req);
  if (auth.rate.blocked(ip)) return fail(res, 429, 'Demasiados intentos. Esperá unos minutos y probá de nuevo.');
  const body = await readJson(req);
  if (!auth.check(body.user, body.password)) {
    auth.rate.fail(ip);
    await new Promise((r) => setTimeout(r, 500));
    return fail(res, 401, 'Usuario o contraseña incorrectos.');
  }
  auth.rate.clear(ip);
  send(res, 200, JSON.stringify({ ok: true }), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Set-Cookie': auth.cookieHeader(auth.createToken(), isSecure(req)),
  });
});

route('POST', '/api/admin/logout', (req, res) => {
  send(res, 200, JSON.stringify({ ok: true }), {
    'Content-Type': 'application/json; charset=utf-8',
    'Set-Cookie': auth.cookieHeader('', isSecure(req)),
  });
});

/* ── obras (admin) ── */

route('GET', '/api/admin/works', (req, res) => {
  json(res, 200, {
    categories: db.state.categories.map(categoryView),
    works: [...db.state.works].sort(byNewest).map(serializeWork),
  });
}, { admin: true });

/** Valida y normaliza el cuerpo de una obra. Devuelve {error} o {value}. */
function parseWork(body) {
  const title = V.cleanText(body.title, 120);
  if (!title) return { error: 'Poné un título para la obra.' };

  const description = V.cleanText(body.description, 1200, true);
  const locationText = V.cleanText(body.locationText, 160);

  const mapsUrl = V.cleanMapsUrl(body.mapsUrl);
  if (mapsUrl === null) {
    return { error: 'Ese link no parece ser de Google Maps. Abrí el lugar en Google Maps, tocá "Compartir" y pegá el link.' };
  }

  const validCats = new Set(db.state.categories.map((c) => c.id));
  const categories = [...new Set(Array.isArray(body.categories) ? body.categories : [])]
    .filter((id) => typeof id === 'string' && validCats.has(id));

  const before = V.cleanFiles(body.before, db.UPLOAD_DIR);
  const after = V.cleanFiles(body.after, db.UPLOAD_DIR);
  if (!before.length && !after.length) return { error: 'Subí al menos una foto (del antes o del después).' };

  return { value: { title, description, locationText, mapsUrl, categories, before, after } };
}

route('POST', '/api/admin/works', async (req, res) => {
  const { error, value } = parseWork(await readJson(req));
  if (error) return fail(res, 400, error);
  const now = new Date().toISOString();
  const work = { id: db.newId(), ...value, demo: false, createdAt: now, updatedAt: now };
  db.state.works.push(work);
  db.save();
  json(res, 201, { work: serializeWork(work) });
}, { admin: true });

route('PUT', '/api/admin/works/:id', async (req, res, p) => {
  const work = db.state.works.find((w) => w.id === p.id);
  if (!work) return fail(res, 404, 'No encontré esa obra.');
  const { error, value } = parseWork(await readJson(req));
  if (error) return fail(res, 400, error);
  const oldFiles = [...(work.before || []), ...(work.after || [])];
  Object.assign(work, value, { updatedAt: new Date().toISOString() });
  db.save();
  db.deleteUnusedFiles(oldFiles);
  json(res, 200, { work: serializeWork(work) });
}, { admin: true });

route('DELETE', '/api/admin/works/:id', (req, res, p) => {
  const i = db.state.works.findIndex((w) => w.id === p.id);
  if (i === -1) return fail(res, 404, 'No encontré esa obra.');
  const [removed] = db.state.works.splice(i, 1);
  db.save();
  db.deleteUnusedFiles([...(removed.before || []), ...(removed.after || [])]);
  json(res, 200, { ok: true });
}, { admin: true });

route('DELETE', '/api/admin/demo-works', (req, res) => {
  const removed = db.state.works.filter((w) => w.demo);
  db.state.works = db.state.works.filter((w) => !w.demo);
  db.save();
  db.deleteUnusedFiles(removed.flatMap((w) => [...(w.before || []), ...(w.after || [])]));
  json(res, 200, { ok: true, removed: removed.length });
}, { admin: true });

/* ── categorías (admin) ── */

function categoryName(body) {
  return V.cleanText(body.name, 40);
}

route('POST', '/api/admin/categories', async (req, res) => {
  const name = categoryName(await readJson(req));
  if (!name) return fail(res, 400, 'Escribí el nombre de la categoría.');
  const slug = V.slugify(name);
  const existing = db.state.categories.find((c) => c.slug === slug);
  if (existing) return json(res, 200, { category: categoryView(existing), existed: true });
  const category = { id: db.newId(), name, slug };
  db.state.categories.push(category);
  db.save();
  json(res, 201, { category: categoryView(category) });
}, { admin: true });

route('PUT', '/api/admin/categories/:id', async (req, res, p) => {
  const category = db.state.categories.find((c) => c.id === p.id);
  if (!category) return fail(res, 404, 'No encontré esa categoría.');
  const name = categoryName(await readJson(req));
  if (!name) return fail(res, 400, 'Escribí el nombre de la categoría.');
  const slug = V.slugify(name);
  if (db.state.categories.some((c) => c.id !== category.id && c.slug === slug)) {
    return fail(res, 409, 'Ya existe una categoría con ese nombre.');
  }
  category.name = name;
  category.slug = slug;
  db.save();
  json(res, 200, { category: categoryView(category) });
}, { admin: true });

route('DELETE', '/api/admin/categories/:id', (req, res, p) => {
  const i = db.state.categories.findIndex((c) => c.id === p.id);
  if (i === -1) return fail(res, 404, 'No encontré esa categoría.');
  db.state.categories.splice(i, 1);
  for (const w of db.state.works) w.categories = (w.categories || []).filter((id) => id !== p.id);
  db.save();
  json(res, 200, { ok: true });
}, { admin: true });

/* ── subida de fotos (cuerpo binario, una foto por request) ── */

route('POST', '/api/admin/upload', async (req, res) => {
  const buf = await readBody(req, MAX_UPLOAD);
  const kind = V.sniffImage(buf);
  if (!kind) return fail(res, 415, 'Esa foto no es JPG, PNG ni WEBP. Probá con otra.');
  const name = crypto.randomBytes(12).toString('hex') + '.' + kind;
  await fs.promises.writeFile(path.join(db.UPLOAD_DIR, name), buf);
  json(res, 201, { file: name, url: '/uploads/' + name });
}, { admin: true });

/* ───────────────────────── servidor ───────────────────────── */

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    const r = routes.find((x) => x.method === req.method && x.re.test(pathname));
    if (!r) {
      const known = routes.some((x) => x.re.test(pathname));
      return fail(res, known ? 405 : 404, known ? 'Método no permitido' : 'No encontrado');
    }
    if (r.admin) {
      if (!auth.isAuthed(req)) return fail(res, 401, 'Tu sesión venció. Volvé a ingresar.');
    }
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

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Método no permitido', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  serveStatic(req, res, pathname);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) fail(res, status, status === 500 ? 'Algo salió mal. Probá de nuevo.' : err.message);
    else res.end();
  });
});

server.requestTimeout = 120000;

seedIfEmpty();
db.cleanupOrphans();
setInterval(db.cleanupOrphans, 6 * 3600 * 1000).unref();

server.listen(PORT, () => {
  console.log(`\n  CL · Cambio de imagen de tu casa`);
  console.log(`  Sitio:  http://localhost:${PORT}/`);
  console.log(`  Panel:  http://localhost:${PORT}/admin/`);
  if (auth.usingDefaultPassword) {
    console.log('  Aviso:  usando la contraseña por defecto. Para cambiarla: ADMIN_PASS=tu-clave node server.js');
  }
  console.log('');
});
