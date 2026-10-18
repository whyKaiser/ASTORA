// Browser-only UI review. This process never connects to a console or installs packages.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.jpg':'image/jpeg', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.ttf':'font/ttf' };
createServer(async (req, res) => {
  const json = (status, body) => { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); };
  if (req.method !== 'GET') return json(503, {error:'BROWSER_PREVIEW_ONLY'});
  if (req.url === '/api/config') return json(200, {token:'preview-only', mode:'browser-preview'});
  if (req.url === '/api/jobs') return json(200, []);
  if (req.url === '/api/catalog') {
    const base = JSON.parse(await readFile(resolve(root,'../catalogs/homebrew.json'),'utf8'));
    const extra = JSON.parse(await readFile(resolve(root,'../catalogs/free-games-candidates.json'),'utf8'));
    base.items.push(...extra.items.filter(item => item.kind === 'game'));
    return json(200, base);
  }
  if (req.url.startsWith('/api/')) return json(404, {error:'BROWSER_PREVIEW_ONLY'});
  const asset = req.url.startsWith('/assets/');
  const base = resolve(root, asset ? '../web/assets' : 'ui');
  const url = req.url === '/' ? '/index.html' : req.url;
  if (/[?%#\\]/.test(url)) return json(400, {error:'INVALID_PATH'});
  const path = resolve(base, '.' + (asset ? url.slice(7) : url));
  if (!path.startsWith(base + sep)) return json(400, {error:'INVALID_PATH'});
  try { const body = await readFile(path); res.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream','Cache-Control':'no-store'}); res.end(body); }
  catch { json(404, {error:'NOT_FOUND'}); }
}).listen(4319, '127.0.0.1', () => console.log('ASTORA native UI preview: http://127.0.0.1:4319/ (no console connection)'));
