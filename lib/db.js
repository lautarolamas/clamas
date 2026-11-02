'use strict';
/**
 * Base de datos mínima en un archivo JSON (sin dependencias).
 * Suficiente para el catálogo de obras de un negocio: escritura atómica + copia de respaldo.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let state = { version: 1, seeded: false, categories: [], works: [] };

function load() {
  try {
    state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Archivo corrupto: no lo pisamos, avisamos.
      console.error('No se pudo leer', DB_FILE, '-', err.message);
      process.exit(1);
    }
    save();
  }
  state.categories = state.categories || [];
  state.works = state.works || [];
}

function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  if (fs.existsSync(DB_FILE)) {
    try { fs.copyFileSync(DB_FILE, DB_FILE + '.bak'); } catch (_) { /* best effort */ }
  }
  fs.renameSync(tmp, DB_FILE);
}

const newId = () => crypto.randomBytes(5).toString('hex');

function referencedFiles() {
  const used = new Set();
  for (const w of state.works) {
    for (const f of w.before || []) used.add(f);
    for (const f of w.after || []) used.add(f);
  }
  return used;
}

/** Borra del disco las fotos que ya no usa ninguna obra (de la lista dada). */
function deleteUnusedFiles(candidates) {
  const used = referencedFiles();
  for (const f of candidates) {
    if (used.has(f)) continue;
    fs.unlink(path.join(UPLOAD_DIR, f), () => {});
  }
}

/** Limpia fotos subidas que nunca se guardaron en una obra (más de 24 hs). */
function cleanupOrphans() {
  const used = referencedFiles();
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) return;
    const now = Date.now();
    for (const f of files) {
      if (used.has(f)) continue;
      const full = path.join(UPLOAD_DIR, f);
      fs.stat(full, (e, st) => {
        if (!e && st.isFile() && now - st.mtimeMs > 24 * 3600 * 1000) fs.unlink(full, () => {});
      });
    }
  });
}

load();

module.exports = {
  DATA_DIR,
  UPLOAD_DIR,
  get state() { return state; },
  save,
  newId,
  deleteUnusedFiles,
  cleanupOrphans,
};
