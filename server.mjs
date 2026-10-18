import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { normalizeCatalog, normalizeItem, validateUrl } from './src/catalog.mjs';
import { createTransport, readPrefix } from './src/network.mjs';
import { inspectMirrors } from './src/inspect.mjs';
import { DownloadManager } from './src/downloads.mjs';
import { AstoraError, publicError } from './src/errors.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const webRoot = join(root, 'web');
const token = randomBytes(24).toString('hex');
const port = Number(process.env.PORT || 4318);
const request = createTransport();
const manager = await new DownloadManager(join(root, 'data', 'downloads'), request).init();
let inspecting = 0;

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

async function body(request) {
  let count = 0;
  const chunks = [];
  for await (const chunk of request) {
    count += chunk.length;
    if (count > 2 * 1024 * 1024) throw new AstoraError('TOO_LARGE');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AstoraError('CATALOG_INVALID'); }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(req.headers.host)) return json(res, 403, { error: 'HOST_REJECTED' });
  const origin = `http://${req.headers.host}`;
  if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, { error: 'ORIGIN_REJECTED' });
  const path = new URL(req.url, origin).pathname;
  try {
    if (req.method === 'GET' && path === '/api/config') return json(res, 200, { token, mode: 'desktop-preview', version: '0.1.0-alpha.1', nativeInstallation: false });
    if (req.method === 'GET' && path === '/api/catalog') return json(res, 200, normalizeCatalog(JSON.parse(await readFile(join(root, 'catalogs', 'homebrew.json'), 'utf8'))));
    if (req.method === 'GET' && path === '/api/downloads') return json(res, 200, manager.list());
    if (req.method === 'POST' && path.startsWith('/api/')) {
      const supplied = Buffer.from(req.headers['x-astora-token'] || '');
      if (supplied.length !== token.length || !timingSafeEqual(supplied, Buffer.from(token)) || !req.headers['content-type']?.startsWith('application/json')) return json(res, 403, { error: 'TOKEN_REQUIRED' });
      const payload = await body(req);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new AstoraError('CATALOG_INVALID');
      if (path === '/api/catalog/validate') return json(res, 200, normalizeCatalog(payload));
      if (path === '/api/catalog/import') {
        if (inspecting >= 2) throw new AstoraError('BUSY');
        inspecting++;
        try {
          validateUrl(payload.url);
          const response = await request(payload.url);
          const bytes = await readPrefix(response.stream, 2 * 1024 * 1024 + 1);
          if (bytes.length > 2 * 1024 * 1024) throw new AstoraError('TOO_LARGE');
          let catalog;
          try { catalog = JSON.parse(bytes.toString('utf8')); } catch { throw new AstoraError('CATALOG_INVALID'); }
          return json(res, 200, normalizeCatalog(catalog));
        } finally { inspecting--; }
      }
      if (path === '/api/inspect') {
        if (inspecting >= 2) throw new AstoraError('BUSY');
        const item = normalizeItem(payload.item);
        inspecting++;
        try { return json(res, 200, { results: await inspectMirrors(item, request) }); }
        finally { inspecting--; }
      }
      if (path === '/api/downloads') return json(res, 202, { id: await manager.start(normalizeItem(payload.item), payload.sourceIndex) });
      const action = /^\/api\/downloads\/([a-f0-9-]{36})\/(pause|resume)$/.exec(path);
      if (action) {
        await manager[action[2]](action[1]);
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'NOT_FOUND' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    const fullPath = resolve(webRoot, `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`);
    if (!fullPath.startsWith(webRoot + sep)) return json(res, 404, { error: 'NOT_FOUND' });
    const data = await readFile(fullPath);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
    res.writeHead(200, { 'Content-Type': types[extname(fullPath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    if (error.code === 'ENOENT') return json(res, 404, { error: 'NOT_FOUND' });
    json(res, 400, { error: publicError(error) });
  }
});

server.listen(port, '127.0.0.1', () => console.log(`ASTORA desktop preview: http://127.0.0.1:${port}\nDownloads: data/downloads/\nThis is not a standalone PS4 build.`));
async function shutdown() {
  if (manager.active) {
    if (manager.active.job.state === 'verifying') await manager.active.done;
    else await manager.pause(manager.active.job.id);
  }
  server.close();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
