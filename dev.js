'use strict';
/**
 * Servidor local para probar (imita a Vercel): sirve public/ y monta la función de api/.
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node dev.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const api = require('./api/[...path].js');

const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain' };

http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.startsWith('/api/')) return api(req, res);
  if (p === '/admin') { res.writeHead(301, { Location: '/admin/' }); return res.end(); }
  let file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (p.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
