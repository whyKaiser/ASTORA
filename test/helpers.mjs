import http from 'node:http';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

export function packageBytes(size = 65536, { titleId = 'ASTR00001', kind = 'base' } = {}) {
  const buffer = Buffer.alloc(size, 0x31);
  buffer.fill(0, 0, Math.min(8192, size));
  buffer.writeUInt32BE(0x7f434e54, 0);
  buffer.write(`IV0000-${titleId}_00-ASTORATEST0000000`, 0x40, 'ascii');
  buffer.writeUInt32BE(kind === 'dlc' ? 0x1b : 0x1a, 0x74);
  buffer.writeUInt32BE(kind === 'update' ? 0x00100000 : 0, 0x78);
  buffer.writeBigUInt64BE(BigInt(size), 0x430);
  return buffer;
}
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function itemFor(url, options = {}) {
  return { id: 'test', title: 'Test package', platform: 'PS4', kind: 'app', titleId: 'ASTR00001', sources: [{ name: 'Fixture', url }], ...options };
}
export async function fixtureServer() {
  const bytes = packageBytes(262144);
  const state = { etag: '"fixture-v1"', paths: [], ranges: [] };
  const server = http.createServer(async (req, res) => {
    state.paths.push(req.url); state.ranges.push(req.headers.range);
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/redirect') { res.writeHead(302, { Location: '/good?token=a%2Bb%252F&sig=x%3D' }); return res.end(); }
    if (path === '/loop') { res.writeHead(302, { Location: '/loop' }); return res.end(); }
    if (path === '/403') { res.writeHead(403); return res.end('forbidden'); }
    if (path === '/404') { res.writeHead(404); return res.end('gone'); }
    if (path === '/429') { res.writeHead(429); return res.end('slow down'); }
    if (path === '/500') { res.writeHead(500); return res.end('oops'); }
    if (path === '/html') return res.end('<!doctype html><html>Sign in</html>');
    if (path === '/rar') return res.end(Buffer.from('526172211a070100', 'hex'));
    if (path === '/zero') return res.end(Buffer.alloc(8192));
    if (path === '/short') return res.end(bytes.subarray(0, 256));
    if (path === '/bad-range') { res.writeHead(206, { 'Content-Range': `bytes 20-8211/${bytes.length}` }); return res.end(bytes.subarray(0, 8192)); }
    let start = 0, end = bytes.length - 1;
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const range = match && path !== '/ignore-range';
    if (range) { start = Number(match[1]); end = match[2] ? Number(match[2]) : end; }
    const headers = { 'Content-Length': end - start + 1, 'Content-Type': 'application/octet-stream' };
    if (path !== '/no-etag') headers.ETag = state.etag;
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${bytes.length}`;
    res.writeHead(range ? 206 : 200, headers);
    if (path === '/slow' || path === '/no-etag') {
      for (let offset = start; offset <= end; offset += 4096) {
        if (res.destroyed) break;
        res.write(bytes.subarray(offset, Math.min(offset + 4096, end + 1)));
        await setTimeout(8);
      }
      res.end();
    } else res.end(bytes.subarray(start, end + 1));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, bytes, state, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
export async function until(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Condition timed out'); await setTimeout(10); }
}
