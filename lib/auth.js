'use strict';
/**
 * Login del panel /admin.
 * Usuario y contraseña salen de las variables de entorno ADMIN_USER / ADMIN_PASS
 * (por defecto: clamas / 1972). La contraseña se compara con scrypt + timingSafeEqual.
 * La sesión es una cookie firmada (HMAC-SHA256), httpOnly, de 30 días.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const COOKIE = 'cl_session';
const MAX_AGE = 30 * 24 * 3600; // segundos

const ADMIN_USER = (process.env.ADMIN_USER || 'clamas').trim().toLowerCase();
const ADMIN_PASS = process.env.ADMIN_PASS || '1972';

// Secreto de sesión: variable de entorno o archivo persistente en /data
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, 'session.key');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch (_) {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}
const SECRET = loadSecret();

const salt = crypto.randomBytes(16);
const passHash = crypto.scryptSync(ADMIN_PASS, salt, 32);

function safeEqual(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Verifica usuario + contraseña (tiempo constante). */
function check(user, password) {
  const u = Buffer.from(String(user || '').trim().toLowerCase());
  const expectedU = Buffer.from(ADMIN_USER);
  const userOk = u.length === expectedU.length && crypto.timingSafeEqual(u, expectedU);
  const hash = crypto.scryptSync(String(password || ''), salt, 32);
  const passOk = safeEqual(hash, passHash);
  return userOk && passOk;
}

const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function createToken() {
  const payload = Buffer.from(JSON.stringify({ u: ADMIN_USER, exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isAuthed(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (!safeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.u === ADMIN_USER && data.exp > Date.now();
  } catch (_) {
    return false;
  }
}

function cookieHeader(token, secure) {
  const base = `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? MAX_AGE : 0}`;
  return secure ? base + '; Secure' : base;
}

// Límite de intentos fallidos por IP: 8 cada 15 minutos
const attempts = new Map();
const WINDOW = 15 * 60 * 1000;
const MAX_FAILS = 8;

const rate = {
  blocked(ip) {
    const a = attempts.get(ip);
    if (!a) return false;
    if (Date.now() > a.reset) { attempts.delete(ip); return false; }
    return a.count >= MAX_FAILS;
  },
  fail(ip) {
    const a = attempts.get(ip);
    if (!a || Date.now() > a.reset) attempts.set(ip, { count: 1, reset: Date.now() + WINDOW });
    else a.count += 1;
  },
  clear(ip) { attempts.delete(ip); },
};
setInterval(() => {
  const now = Date.now();
  for (const [ip, a] of attempts) if (now > a.reset) attempts.delete(ip);
}, WINDOW).unref();

module.exports = {
  check,
  createToken,
  isAuthed,
  cookieHeader,
  rate,
  usingDefaultPassword: !process.env.ADMIN_PASS,
};
