'use strict';
const fs = require('fs');
const path = require('path');

/** Texto limpio: sin caracteres de control, recortado. */
function cleanText(value, max, multiline = false) {
  if (typeof value !== 'string') return '';
  let s = value.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  s = multiline ? s.replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
  return s.slice(0, max);
}

function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'categoria';
}

/**
 * Acepta solo links de Google Maps (maps.app.goo.gl, goo.gl/maps, google.*\/maps, maps.google.*).
 * Devuelve '' si está vacío, null si es inválido, o la URL normalizada (https).
 */
function cleanMapsUrl(input) {
  if (typeof input !== 'string' || !input.trim()) return '';
  let url;
  try {
    url = new URL(input.trim());
  } catch (_) {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  const isShort = host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps'));
  const isGoogle = /(^|\.)google\.[a-z.]{2,}$/.test(host) &&
    (host.startsWith('maps.') || url.pathname.startsWith('/maps'));
  if (!isShort && !isGoogle) return null;
  url.protocol = 'https:';
  const out = url.toString();
  return out.length <= 600 ? out : null;
}

const FILE_RE = /^[A-Za-z0-9_-]{6,80}\.(jpg|jpeg|png|webp|svg)$/;

function isValidFileName(name) {
  return typeof name === 'string' && FILE_RE.test(name);
}

/** Lista de nombres de archivo válidos que existen en uploads. */
function cleanFiles(list, uploadDir, max = 30) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const name = typeof raw === 'string' ? raw.split('/').pop() : '';
    if (!isValidFileName(name) || out.includes(name)) continue;
    if (!fs.existsSync(path.join(uploadDir, name))) continue;
    out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

/** Detecta el tipo real de imagen por los primeros bytes. */
function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

module.exports = { cleanText, slugify, cleanMapsUrl, cleanFiles, isValidFileName, sniffImage };
