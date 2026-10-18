import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeCatalog, normalizeItem } from '../src/catalog.mjs';
import { messages } from '../src/errors.mjs';
import { locales, englishErrors, translate, localized } from '../web/i18n.js';
import { indexCatalogs, libraryPage, PAGE_SIZE, searchText } from '../web/library-model.js';
import { itemFor } from './helpers.mjs';

test('all visible static text keys and backend error codes have both language paths', async () => {
  const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  for (const [, key] of html.matchAll(/data-i18n(?:-label|-placeholder)?="([^"]+)"/g)) {
    assert.ok(locales.ar[key], key); assert.ok(locales.en[key], key);
  }
  assert.deepEqual(Object.keys(englishErrors).sort(), Object.keys(messages).sort());
  for (const key of Object.keys(locales.ar)) {
    const placeholders = value => (value.match(/\{\w+\}/g) || []).sort();
    assert.deepEqual(placeholders(locales.ar[key]), placeholders(locales.en[key]), key);
  }
  assert.equal(translate('en', 'page', { current: 2, total: 9 }), 'Page 2 of 9');
});

test('validated translations preserve Arabic/English text with original fallback', () => {
  const item = normalizeItem(itemFor('https://example.org/app.pkg', { title: 'Original', translations: { ar: { title: 'أستورا' }, en: { description: 'An app' } } }));
  assert.equal(localized(item, 'title', 'ar'), 'أستورا');
  assert.equal(localized(item, 'title', 'en'), 'Original');
  assert.equal(localized(item, 'description', 'en'), 'An app');
  for (const translations of [null, [], { fr: { title: 'x' } }, { en: { url: 'https://evil.example' } }, { ar: { title: '\u0000' } }, { en: { description: 'x'.repeat(601) } }]) {
    assert.throws(() => normalizeItem(itemFor('https://example.org/app.pkg', { translations })), { code: 'CATALOG_INVALID' });
  }
});

test('5000-entry catalog keeps each result page bounded with no gaps or duplicates', () => {
  const catalog = normalizeCatalog({ schemaVersion: 1, id: 'stress', name: 'Stress fixture', items: Array.from({ length: 5000 }, (_, index) => itemFor('https://example.org/app.pkg', { id: `app-${index}`, title: `App ${index}` })) });
  const indexed = indexCatalogs([catalog], new Set()), seen = [];
  for (let page = 0; page < Math.ceil(5000 / PAGE_SIZE); page++) {
    const result = libraryPage(indexed, { page });
    assert.ok(result.items.length <= PAGE_SIZE); assert.equal(result.count, 5000);
    seen.push(...result.items.map(item => item.key));
  }
  assert.equal(new Set(seen).size, 5000);
  assert.equal(libraryPage(indexed, { page: 99999 }).items.length, 8);
  assert.equal(libraryPage(indexed, { platform: 'PS5' }).items.length, 0);
  assert.equal(libraryPage(indexed, { page: -1 }).page, 0);
});

test('search covers both translations, Arabic diacritics and disabled sources', () => {
  const item = normalizeItem(itemFor('https://example.org/app.pkg', { title: 'Tool', titleId: 'ASTR00001', translations: { ar: { title: 'أُسْطُورَة' }, en: { description: 'Save manager' } } }));
  const catalogs = [{ id: 'source', name: 'Catalog', items: [item] }];
  const indexed = indexCatalogs(catalogs, new Set());
  assert.equal(searchText('أُسْطُورَة'), 'اسطورة');
  for (const query of ['اسطورة', 'SAVE', 'astr00001']) assert.equal(libraryPage(indexed, { query }).count, 1);
  assert.equal(indexCatalogs(catalogs, new Set(['source'])).length, 0);
});
