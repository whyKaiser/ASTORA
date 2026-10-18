import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import http from 'node:http';

test('local API enforces origin and request token, serves UI, and rejects bad sources', async t => {
  const port = 44118;
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(child, 'exit');
  t.after(async () => { child.kill(); await closed; });
  const root = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(root + '/api/config'); break; } catch { if (attempt === 99) throw new Error('Test server did not start'); await setTimeout(20); }
  }
  const config = await (await fetch(root + '/api/config')).json();
  assert.equal(config.nativeInstallation, false);
  const page = await fetch(root); assert.equal(page.status, 200); assert.ok((await page.text()).includes('lang="ar" dir="rtl"'));
  assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  const badHost = await new Promise((resolve, reject) => {
    http.get(root, { headers: { Host: 'attacker.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(badHost, 403);
  const wrongOrigin = await fetch(root + '/api/config', { headers: { Origin: 'https://attacker.example' } }); assert.equal(wrongOrigin.status, 403);
  const missingToken = await fetch(root + '/api/catalog/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(missingToken.status, 403);
  const headers = { 'Content-Type': 'application/json', 'X-Astora-Token': config.token };
  const invalid = await fetch(root + '/api/catalog/validate', { method: 'POST', headers, body: '{}' }); assert.equal((await invalid.json()).error.code, 'CATALOG_INVALID');
  const nullInput = await fetch(root + '/api/catalog/import', { method: 'POST', headers, body: 'null' }); assert.equal((await nullInput.json()).error.code, 'CATALOG_INVALID');
  const blocked = await fetch(root + '/api/catalog/import', { method: 'POST', headers, body: JSON.stringify({ url: 'http://127.0.0.1/private' }) }); assert.equal((await blocked.json()).error.code, 'PRIVATE_ADDRESS');
  const catalog = await (await fetch(root + '/api/catalog')).json(); assert.equal(catalog.items.length, 3);
  const validate = await fetch(root + '/api/catalog/validate', { method: 'POST', headers, body: JSON.stringify(catalog) }); assert.equal(validate.status, 200);
});
