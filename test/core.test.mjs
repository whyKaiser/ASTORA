import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeItem, normalizeCatalog, validateUrl } from '../src/catalog.mjs';
import { inspectPackage } from '../src/package.mjs';
import { isPublicAddress, createTransport, strongEtag } from '../src/network.mjs';
import { publicError } from '../src/errors.mjs';
import { packageBytes, itemFor } from './helpers.mjs';

test('catalog validates official examples and preserves signed URL escaping', async () => {
  const catalog = normalizeCatalog(JSON.parse(await readFile(new URL('../catalogs/homebrew.json', import.meta.url), 'utf8')));
  assert.equal(catalog.items.length, 3);
  const signed = 'https://example.com/hello%20world.pkg?a=x%2By&sig=a%253Db';
  assert.equal(normalizeItem(itemFor(signed)).sources[0].url, signed);
});
test('reject malformed, ambiguous and duplicate catalog entries', () => {
  for (const changes of [{ sources: [] }, { id: '../escape' }, { titleId: 'INVALID' }, { sha256: 'bad' }, { size: -1 }, { platform: 'PS6' }, { kind: 'mystery' }]) {
    assert.throws(() => normalizeItem(itemFor('https://example.com/app.pkg', changes)));
  }
  const item = itemFor('https://example.com/app.pkg');
  assert.throws(() => normalizeCatalog({ schemaVersion: 1, id: 'mine', name: 'mine', items: [item, item] }));
});
test('reject embedded credentials, JavaScript, controls, fragments and backslashes', () => {
  for (const url of ['javascript:alert(1)', 'https://a:b@example.com/app.pkg', 'http://example.com/\nthing', 'https://example.com/app#x', 'http://example.com\\@127.0.0.1/']) assert.throws(() => validateUrl(url));
});
test('package reports title, size and type without claiming complete validation', () => {
  const result = inspectPackage(packageBytes(), { titleId: 'ASTR00001', kind: 'app' });
  assert.equal(result.titleId, 'ASTR00001'); assert.equal(result.size, 65536); assert.equal(result.kind, 'base'); assert.equal(result.validation, 'header-only');
  assert.equal(inspectPackage(packageBytes(65536, { kind: 'update' })).kind, 'update');
  assert.equal(inspectPackage(packageBytes(65536, { kind: 'dlc' })).kind, 'dlc');
});
test('package rejects HTML, RAR/ZIP/7z, zero-filled files, truncated header', () => {
  const cases = [[Buffer.from('<!doctype html>'), 'HTML_PAGE'], [Buffer.from('526172211a070100', 'hex'), 'ARCHIVE'], [Buffer.from('504b0304', 'hex'), 'ARCHIVE'], [Buffer.from('377abcaf271c', 'hex'), 'ARCHIVE'], [Buffer.alloc(8192), 'EMPTY_FILE'], [packageBytes().subarray(0, 256), 'INVALID_PACKAGE']];
  for (const [bytes, code] of cases) assert.throws(() => inspectPackage(bytes), { code });
});
test('reject wrong title, wrong type, wrong size and unsafe size integers', () => {
  assert.throws(() => inspectPackage(packageBytes(), { titleId: 'ASTR99999' }), { code: 'TITLE_MISMATCH' });
  assert.throws(() => inspectPackage(packageBytes(65536, { kind: 'update' }), { kind: 'game' }), { code: 'KIND_MISMATCH' });
  assert.throws(() => inspectPackage(packageBytes(), { size: 999999 }), { code: 'SIZE_MISMATCH' });
  const bytes = packageBytes(); bytes.writeBigUInt64BE(2n ** 60n, 0x430);
  assert.throws(() => inspectPackage(bytes), { code: 'INVALID_PACKAGE' });
});
test('public address policy blocks local, mapped and reserved networks', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '224.0.0.1', '0.0.0.0', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1', '2001:db8::1', '2001::1', '2002:7f00:1::', '3fff::1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('1.1.1.1'), true); assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  await assert.rejects(createTransport()('http://127.0.0.1/a'), { code: 'PRIVATE_ADDRESS' });
});
test('resume accepts only quoted strong ETags', () => {
  assert.equal(strongEtag('"abc"'), '"abc"');
  for (const value of [undefined, 'abc', 'W/"abc"', '"abc def"', '"abc\n"']) assert.equal(strongEtag(value), null);
});
test('diagnostics never echo source tokens, credentials or raw errors', () => {
  const error = new Error('https://secret.example/file?token=SECRET'); error.code = 'ENOTFOUND';
  assert.equal(JSON.stringify(publicError(error)).includes('SECRET'), false);
  assert.equal(publicError(error).code, 'NETWORK_ERROR');
});
