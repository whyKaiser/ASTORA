import { AstoraError } from './errors.mjs';

export const platforms = ['PS1', 'PS2', 'PSP', 'PS3', 'PS4', 'PS5'];
export const kinds = ['app', 'game', 'update', 'dlc'];

function fail() { throw new AstoraError('CATALOG_INVALID'); }
function string(value, max, required = true) {
  if (!required && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) fail();
  return value.trim();
}

function translations(input, fields) {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail();
  const output = {};
  for (const [language, values] of Object.entries(input)) {
    if (!['ar', 'en'].includes(language) || !values || typeof values !== 'object' || Array.isArray(values)) fail();
    output[language] = {};
    for (const [field, value] of Object.entries(values)) {
      if (!Object.hasOwn(fields, field)) fail();
      output[language][field] = string(value, fields[field]);
    }
  }
  return output;
}

export function validateUrl(value) {
  if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u0020\\]/.test(value)) throw new AstoraError('INVALID_URL');
  let url;
  try { url = new URL(value); } catch { throw new AstoraError('INVALID_URL'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) throw new AstoraError('INVALID_URL');
  return url;
}

export function normalizeItem(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail();
  const id = string(input.id, 80);
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) fail();
  const title = string(input.title, 160);
  const platform = input.platform;
  const kind = input.kind;
  if (!platforms.includes(platform) || !kinds.includes(kind)) fail();
  const titleId = string(input.titleId, 9, false).toUpperCase();
  if (titleId && !/^[A-Z]{4}\d{5}$/.test(titleId)) fail();
  const sources = input.sources;
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 12) fail();
  const size = input.size ?? null;
  if (size !== null && (!Number.isSafeInteger(size) || size < 8192)) fail();
  const sha256 = string(input.sha256, 64, false).toLowerCase();
  if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) fail();
  const homepage = string(input.homepage, 2048, false);
  if (homepage) validateUrl(homepage);
  return {
    id, title, platform, kind, titleId, size, sha256,
    version: string(input.version, 40, false),
    description: string(input.description, 600, false), homepage,
    translations: translations(input.translations, { title: 160, description: 600 }),
    sources: sources.map(source => {
      if (!source || typeof source !== 'object') fail();
      const url = string(source.url, 8192);
      validateUrl(url);
      // Keep original escaping and query byte order, including signed links.
      return { name: string(source.name, 80), url };
    })
  };
}

export function normalizeCatalog(input) {
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.items) || input.items.length > 5000) fail();
  const id = string(input.id, 80);
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) fail();
  const items = input.items.map(normalizeItem);
  if (new Set(items.map(item => item.id)).size !== items.length) fail();
  return { schemaVersion: 1, id, name: string(input.name, 100), translations: translations(input.translations, { name: 100 }), items };
}
