import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../src/network.mjs';
import { inspectSource, inspectMirrors } from '../src/inspect.mjs';
import { fixtureServer, itemFor } from './helpers.mjs';

test('real HTTP inspection: redirects, signatures, range support and diagnostic failures', async t => {
  const fixture = await fixtureServer(); t.after(fixture.close);
  const request = createTransport({ allowLoopbackForTests: true });
  const inspect = (path, extra) => { const item = itemFor(fixture.url + path, extra); return inspectSource(item.sources[0], item, request); };
  await t.test('reads a valid header through redirect without changing signed query', async () => {
    const result = await inspect('/redirect');
    assert.equal(result.resumable, true); assert.equal(result.size, fixture.bytes.length);
    assert.ok(fixture.state.paths.includes('/good?token=a%2Bb%252F&sig=x%3D'));
  });
  await t.test('full-body response allowed for prefix inspection but not advertised resumable', async () => { const result = await inspect('/ignore-range'); assert.equal(result.rangeSupported, false); assert.equal(result.resumable, false); });
  for (const [path, code] of [['/403', 'AUTH_REQUIRED'], ['/404', 'NOT_FOUND'], ['/429', 'RATE_LIMIT'], ['/500', 'HTTP_ERROR'], ['/loop', 'REDIRECT_LIMIT'], ['/html', 'HTML_PAGE'], ['/rar', 'ARCHIVE'], ['/zero', 'EMPTY_FILE'], ['/short', 'INVALID_PACKAGE'], ['/bad-range', 'RANGE_INVALID']]) {
    await t.test(path, async () => assert.rejects(inspect(path), { code }));
  }
  await t.test('platform is explicit; PS5 is not accepted as a PS4 package', () => assert.rejects(inspect('/good', { platform: 'PS5' }), { code: 'UNSUPPORTED_PLATFORM' }));
  await t.test('one failed mirror does not hide a working mirror', async () => {
    const results = await inspectMirrors(itemFor(fixture.url + '/403', { sources: [{ name: 'restricted', url: fixture.url + '/403?token=SECRET' }, { name: 'working', url: fixture.url + '/good' }] }), request);
    assert.equal(results[0].ok, false); assert.equal(results[1].ok, true);
    assert.ok(!JSON.stringify(results).includes('SECRET')); assert.ok(!JSON.stringify(results).includes('etag'));
  });
});
