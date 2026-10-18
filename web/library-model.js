import { localized } from './i18n.js';
export const PAGE_SIZE = 24;
export const CATALOG_LIMIT = 30;
export function searchText(value) {
  return String(value).normalize('NFKC').toLocaleLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').trim();
}
// Rebuild only when catalogs or their enabled state change, not on each keystroke.
export function indexCatalogs(catalogs, disabled) {
  return catalogs.filter(catalog => !disabled.has(catalog.id)).flatMap(catalog => catalog.items.map(item => ({
    ...item, catalog, key: `${catalog.id}/${item.id}`,
    searchIndex: searchText([item.title, item.titleId, item.description, ...['ar', 'en'].flatMap(language => [localized(item, 'title', language), localized(item, 'description', language)])].join(' '))
  })));
}
export function libraryPage(items, { query = '', platform = 'ALL', page = 0 } = {}) {
  const needle = searchText(query);
  const matches = items.filter(item => (platform === 'ALL' || item.platform === platform) && item.searchIndex.includes(needle));
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const current = Math.max(0, Math.min(Number.isFinite(page) ? Math.floor(page) : 0, pages - 1));
  return { items: matches.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE), count: matches.length, pages, page: current };
}
