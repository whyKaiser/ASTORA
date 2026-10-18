import { translate, localized, englishErrors } from './i18n.js';
import { indexCatalogs, libraryPage, PAGE_SIZE, CATALOG_LIMIT } from './library-model.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const stored = key => { try { return localStorage.getItem(key); } catch { return null; } };
let language = stored('astora.language') === 'en' ? 'en' : 'ar';
const reducedPreference = matchMedia('(prefers-reduced-motion: reduce)');
let motion = stored('astora.motion') || 'system';
let token, catalogs = [], disabled = new Set(), items = [], search = '', platform = 'ALL', page = 0;
let selected = null, selectedSource = null, jobs = [], polling = false, currentView = 'library', lastJobs = '';
let toastTimer, searchTimer, pollTimer, inspectBusy = new Set();
const inspections = new Map();
const t = (key, values) => translate(language, key, values);
const titleOf = item => localized(item, 'title', language);
const descriptionOf = item => localized(item, 'description', language);
const catalogName = catalog => localized(catalog, 'name', language);
const reduced = () => motion === 'reduced' || (motion === 'system' && reducedPreference.matches);

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function size(bytes) {
  if (bytes === null || bytes === undefined) return t('sizeUnknown');
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GiB` : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}
function feedback(selector, text, error = false) {
  $(selector).textContent = text;
  $(selector).classList.toggle('error', error);
}
function toast(text) {
  $('#toast').textContent = text; $('#toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 5000);
}
function errorText(error) {
  if (language === 'en') return englishErrors[error?.code] || t('requestFailed');
  return error?.message || t('requestFailed');
}
async function api(path, data) {
  let response;
  try { response = await fetch(path, data === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Astora-Token': token }, body: JSON.stringify(data) }); }
  catch { throw new Error(t('localConnection')); }
  let result;
  try { result = await response.json(); } catch { throw new Error(t('requestFailed')); }
  if (!response.ok) throw new Error(errorText(result.error));
  return result;
}
function savePreference(key, value) { try { localStorage.setItem(key, value); } catch { toast(t('saveFailed')); } }
function persist() {
  try {
    localStorage.setItem('astora.catalogs.v1', JSON.stringify(catalogs.filter(c => c.id !== 'astora-homebrew')));
    localStorage.setItem('astora.disabled.v1', JSON.stringify([...disabled]));
  } catch { toast(t('saveFailed')); }
}
function rebuildIndex() { items = indexCatalogs(catalogs, disabled); page = 0; }
function updateMotion() {
  document.documentElement.dataset.motion = reduced() ? 'reduced' : 'gentle';
  $('#motion-toggle').textContent = t(reduced() ? 'motionOff' : 'motionOn');
  $('#motion-toggle').setAttribute('aria-pressed', String(reduced()));
}
function applyLocale() {
  document.documentElement.lang = language; document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.title = t('title');
  $$('[data-i18n]').forEach(element => element.textContent = t(element.dataset.i18n));
  $$('[data-i18n-label]').forEach(element => element.setAttribute('aria-label', t(element.dataset.i18nLabel)));
  $$('[data-i18n-placeholder]').forEach(element => element.placeholder = t(element.dataset.i18nPlaceholder));
  $('#language-toggle').textContent = language === 'ar' ? 'English' : 'العربية';
  $('#language-toggle').lang = language === 'ar' ? 'en' : 'ar';
  $('#language-toggle').setAttribute('aria-label', t('language'));
  $('#page-label').textContent = t(currentView);
  $('.filter[data-platform="ALL"]').textContent = t('all');
  updateMotion(); renderLibrary(); renderSources(); renderJobs();
  $('#toast').hidden = true;
}
function renderLibrary() {
  const result = libraryPage(items, { query: search, platform, page }); page = result.page;
  $('#library-count').textContent = items.length; $('#result-count').textContent = result.count;
  $('#empty').hidden = result.count > 0;
  $('#pagination').hidden = result.pages < 2;
  $('#page-status').textContent = t('page', { current: page + 1, total: result.pages });
  $('#previous-page').disabled = page === 0; $('#next-page').disabled = page === result.pages - 1;
  $('#cards').replaceChildren(...result.items.map((item, index) => {
    const card = node('button', 'card'); card.type = 'button'; card.dataset.key = item.key;
    card.setAttribute('aria-label', t('details', { title: titleOf(item) }));
    const art = node('div', 'card-art');
    art.dataset.variant = String((page * PAGE_SIZE + index) % 3);
    const seal = node('div', 'card-seal');
    seal.append(node('span', 'monogram', item.title.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase()));
    art.append(seal, node('span', 'card-tag', item.platform), node('span', 'card-sequence', `ASTORA / ${String(page * PAGE_SIZE + index + 1).padStart(3, '0')}`));
    const content = node('div', 'card-body'), title = node('h3', 'card-title', titleOf(item)); title.dir = 'auto';
    const meta = node('div', 'card-meta');
    meta.append(node('span', '', `${t(item.kind)} · ${size(item.size)}`));
    const checked = inspections.get(item.key)?.some(result => result.ok);
    meta.append(node('b', checked ? 'checked' : '', (checked ? '✓ ' : '') + t(checked ? 'checked' : 'checkSource')));
    const description = node('p', 'card-desc', descriptionOf(item) || catalogName(item.catalog)); description.dir = 'auto';
    content.append(title, description, meta); card.append(art, content);
    card.addEventListener('click', () => openDetails(item)); return card;
  }));
}
function renderSources() {
  $('#sources-list').replaceChildren(...catalogs.map(catalog => {
    const row = node('article', 'source-row'), copy = node('div'), heading = node('h3', '', catalogName(catalog)); heading.dir = 'auto';
    copy.append(heading, node('p', '', `${t('count', { count: catalog.items.length })} · ${t(disabled.has(catalog.id) ? 'disabled' : 'visible')}`));
    const actions = node('div', 'source-actions'), toggle = node('button', 'secondary', t(disabled.has(catalog.id) ? 'enable' : 'pause'));
    toggle.addEventListener('click', () => { disabled.has(catalog.id) ? disabled.delete(catalog.id) : disabled.add(catalog.id); persist(); rebuildIndex(); renderSources(); renderLibrary(); });
    actions.append(toggle);
    if (catalog.id !== 'astora-homebrew') {
      const remove = node('button', 'secondary', t('remove'));
      remove.addEventListener('click', () => { catalogs = catalogs.filter(c => c.id !== catalog.id); disabled.delete(catalog.id); persist(); rebuildIndex(); renderSources(); renderLibrary(); toast(t('removed')); });
      actions.append(remove);
    }
    row.append(copy, actions); return row;
  }));
}
function showView(view) {
  currentView = view;
  $$('.view').forEach(section => section.hidden = section.id !== `view-${view}`);
  $$('.nav-button').forEach(button => { const active = button.dataset.view === view; button.classList.toggle('active', active); active ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current'); });
  $('#page-label').textContent = t(view);
  if (view === 'sources') renderSources();
  if (view === 'downloads') { renderJobs(); pollJobs(); }
}
function renderInspection(item, results = []) {
  selectedSource = results.find(result => result.ok)?.index ?? null;
  $('#download-button').disabled = selectedSource === null || inspectBusy.has(item.key);
  $('#inspection-results').replaceChildren(...item.sources.map((source, index) => {
    const result = results.find(result => result.index === index), block = node('div', `inspection${result && !result.ok ? ' failed' : ''}`);
    const label = node('label', 'inspection-title'), radio = node('input');
    radio.type = 'radio'; radio.name = 'download-source'; radio.value = index; radio.disabled = !result?.ok; radio.checked = selectedSource === index;
    radio.addEventListener('change', () => selectedSource = index);
    label.append(radio, node('span', '', source.name)); block.append(label);
    if (!result) block.append(node('p', '', t('unchecked')));
    else if (result.ok) {
      block.append(node('p', '', `✓ ${t('validHeader')} · ${result.titleId} · ${size(result.size)}`), node('p', '', `${t(result.encrypted ? 'https' : 'http')} · ${t(result.resumable ? 'resumable' : 'noResume')}`), node('code', '', result.host));
    } else block.append(node('p', '', errorText(result)), node('code', '', result.code + (result.status ? ` · HTTP ${result.status}` : '')));
    return block;
  }));
}
function openDetails(item) {
  selected = item; $('#detail-title').textContent = titleOf(item); $('#detail-description').textContent = descriptionOf(item);
  $('#detail-meta').replaceChildren(...[item.platform, t(item.kind), item.version, item.titleId, size(item.size)].filter(Boolean).map(text => node('span', '', text)));
  $('#detail-homepage').hidden = !item.homepage; if (item.homepage) $('#detail-homepage').href = item.homepage;
  feedback('#detail-feedback', ''); renderInspection(item, inspections.get(item.key));
  $('#inspect-button').disabled = inspectBusy.has(item.key); $('#inspect-button').textContent = t(inspectBusy.has(item.key) ? 'checkingFile' : 'inspect');
  $('#details-dialog').showModal();
}
$('#inspect-button').addEventListener('click', async () => {
  const item = selected; inspectBusy.add(item.key);
  $('#inspect-button').disabled = true; $('#inspect-button').textContent = t('checkingFile'); $('#download-button').disabled = true;
  feedback('#detail-feedback', t('headerOnly'));
  try {
    const { results } = await api('/api/inspect', { item }); inspections.set(item.key, results);
    if (selected?.key === item.key) { renderInspection(item, results); feedback('#detail-feedback', t(results.some(result => result.ok) ? 'checkDone' : 'noValidSource'), !results.some(result => result.ok)); }
    renderLibrary();
  } catch (error) { if (selected?.key === item.key) feedback('#detail-feedback', error.message, true); }
  finally {
    inspectBusy.delete(item.key);
    if (selected?.key === item.key) { $('#inspect-button').disabled = false; $('#inspect-button').textContent = t('recheck'); $('#download-button').disabled = selectedSource === null; }
  }
});
$('#download-button').addEventListener('click', async () => {
  if (selectedSource === null) return;
  $('#download-button').disabled = true;
  try { await api('/api/downloads', { item: selected, sourceIndex: selectedSource }); $('#details-dialog').close(); showView('downloads'); toast(t('jobStarted')); }
  catch (error) { feedback('#detail-feedback', error.message, true); }
  finally { $('#download-button').disabled = false; }
});
function importCatalog(catalog) {
  if (catalog.id === 'astora-homebrew') throw new Error(t('reservedId'));
  if (!catalogs.some(c => c.id === catalog.id) && catalogs.filter(c => c.id !== 'astora-homebrew').length >= CATALOG_LIMIT) throw new Error(t('catalogLimit'));
  catalogs = [...catalogs.filter(c => c.id !== catalog.id), catalog]; inspections.clear();
  disabled.delete(catalog.id); persist(); rebuildIndex(); renderLibrary(); renderSources();
  $('#import-dialog').close(); toast(t('added', { name: catalogName(catalog), count: catalog.items.length }));
}
$('#url-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#url-form button'); button.disabled = true;
  feedback('#import-feedback', t('readingCatalog'));
  try { importCatalog(await api('/api/catalog/import', { url: $('#catalog-url').value.trim() })); }
  catch (error) { feedback('#import-feedback', error.message, true); }
  finally { button.disabled = false; }
});
$('#catalog-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error(t('catalogSize'));
    let content; try { content = JSON.parse(await file.text()); } catch { throw new Error(t('invalidJson')); }
    importCatalog(await api('/api/catalog/validate', content));
  } catch (error) { feedback('#import-feedback', error.message, true); }
  finally { event.target.value = ''; }
});
function renderJobs() {
  const focusedAction = document.activeElement?.dataset?.jobAction;
  $('#download-count').textContent = jobs.filter(job => ['checking', 'downloading', 'verifying'].includes(job.state)).length;
  if (!jobs.length) { const empty = node('div', 'empty'); empty.append(node('span', '', '↓'), node('h3', '', t('downloadsEmpty')), node('p', '', t('downloadsHelp'))); $('#downloads-list').replaceChildren(empty); return; }
  $('#downloads-list').replaceChildren(...jobs.map(job => {
    const article = node('article', 'job'), header = node('div', 'job-header'), title = node('h3', '', job.title); title.dir = 'auto';
    header.append(title, node('span', 'state', t(job.state)));
    const progress = node('progress'); progress.max = job.total || 1; progress.value = job.bytes || 0; progress.setAttribute('aria-label', t('progress', { title: job.title }));
    const meta = node('div', 'job-meta'); meta.append(node('bdi', '', `${size(job.bytes)} / ${size(job.total)}`));
    if (['checking', 'downloading', 'paused', 'failed'].includes(job.state)) {
      const action = ['paused', 'failed'].includes(job.state) ? 'resume' : 'pause', button = node('button', 'secondary', t(action));
      button.dataset.jobAction = `${job.id}/${action}`;
      button.addEventListener('click', async () => { button.disabled = true; try { await api(`/api/downloads/${job.id}/${action}`, {}); await pollJobs(); } catch (error) { toast(error.message); } finally { button.disabled = false; } }); meta.append(button);
    }
    article.append(header, progress, meta);
    if (job.error) article.append(node('p', 'job-error', errorText(job.error)), node('p', 'job-file', job.error.code));
    if (job.state === 'downloaded') article.append(node('p', 'subtle', t(job.hashMatched ? 'matched' : 'unverifiedHash')), node('p', 'job-file', `data/downloads/${job.file}`), node('p', 'job-file', `SHA-256: ${job.sha256}`));
    return article;
  }));
  if (focusedAction) $$('#downloads-list button').find(button => button.dataset.jobAction === focusedAction)?.focus({ preventScroll: true });
}
async function pollJobs() {
  if (polling || document.hidden) return; polling = true;
  try {
    const next = await api('/api/downloads'), signature = JSON.stringify(next);
    jobs = next;
    if (signature !== lastJobs) {
      lastJobs = signature;
      $('#download-count').textContent = jobs.filter(job => ['checking', 'downloading', 'verifying'].includes(job.state)).length;
      if (currentView === 'downloads') renderJobs();
    }
  } catch { /* Retain last known transfer state during connection loss. */ }
  finally { polling = false; }
}
function schedulePoll() {
  clearTimeout(pollTimer);
  if (!document.hidden) pollTimer = setTimeout(async () => { await pollJobs(); schedulePoll(); }, currentView === 'downloads' ? 2000 : 10000);
}
document.addEventListener('visibilitychange', () => { document.body.classList.toggle('background', document.hidden); schedulePoll(); if (!document.hidden) pollJobs(); });
$('#language-toggle').addEventListener('click', () => { language = language === 'ar' ? 'en' : 'ar'; savePreference('astora.language', language); applyLocale(); });
$('#motion-toggle').addEventListener('click', () => { motion = reduced() ? 'gentle' : 'reduced'; savePreference('astora.motion', motion); updateMotion(); });
reducedPreference.addEventListener('change', updateMotion);
$$('.nav-button').forEach(button => button.addEventListener('click', () => { showView(button.dataset.view); schedulePoll(); }));
$$('[data-import]').forEach(button => button.addEventListener('click', () => { feedback('#import-feedback', ''); $('#import-dialog').showModal(); }));
$$('dialog .close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('#details-dialog').addEventListener('close', () => {
  if (currentView === 'library' && selected) $$('#cards .card').find(card => card.dataset.key === selected.key)?.focus({ preventScroll: true });
});
$('#search').addEventListener('input', event => { search = event.target.value.trim(); page = 0; clearTimeout(searchTimer); searchTimer = setTimeout(renderLibrary, 100); });
for (const value of ['ALL', 'PS4', 'PS2', 'PS1', 'PSP', 'PS3', 'PS5']) {
  const button = node('button', `filter${value === 'ALL' ? ' active' : ''}`, value === 'ALL' ? t('all') : value);
  button.dataset.platform = value; button.setAttribute('aria-pressed', String(value === 'ALL'));
  button.addEventListener('click', () => { platform = value; page = 0; $$('.filter').forEach(filter => { filter.classList.toggle('active', filter === button); filter.setAttribute('aria-pressed', String(filter === button)); }); renderLibrary(); });
  $('#filters').append(button);
}
$('#reset-filters').addEventListener('click', () => { clearTimeout(searchTimer); search = ''; $('#search').value = ''; $('.filter').click(); });
function focusCollection() { $('#collection').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }); $('#cards button')?.focus({ preventScroll: true }); }
$('#explore').addEventListener('click', focusCollection);
$('#previous-page').addEventListener('click', () => { page--; renderLibrary(); focusCollection(); });
$('#next-page').addEventListener('click', () => { page++; renderLibrary(); focusCollection(); });
$('#cards').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const cards = $$('#cards button'), index = cards.indexOf(document.activeElement); if (index < 0) return;
  const columns = getComputedStyle($('#cards')).gridTemplateColumns.split(' ').length, horizontal = language === 'ar' ? -1 : 1;
  const next = index + ({ ArrowLeft: -horizontal, ArrowRight: horizontal, ArrowDown: columns, ArrowUp: -columns }[event.key]);
  if (cards[next]) { event.preventDefault(); cards[next].focus(); }
});
async function init() {
  applyLocale();
  try {
    const configuration = await api('/api/config'); token = configuration.token;
    const builtIn = await api('/api/catalog'); catalogs = [builtIn];
    try {
      const saved = JSON.parse(stored('astora.catalogs.v1') || '[]');
      if (Array.isArray(saved)) for (const catalog of saved.slice(0, CATALOG_LIMIT)) {
        try { const validated = await api('/api/catalog/validate', catalog); if (!catalogs.some(c => c.id === validated.id)) catalogs.push(validated); } catch { /* Discard invalid saved entries. */ }
      }
      const inactive = JSON.parse(stored('astora.disabled.v1') || '[]');
      if (Array.isArray(inactive)) disabled = new Set(inactive.filter(id => typeof id === 'string'));
    } catch { toast(t('restoreFailed')); }
    rebuildIndex(); renderLibrary(); renderSources(); await pollJobs(); schedulePoll();
  } catch (error) { toast(error.message); $('#cards').replaceChildren(node('div', 'info-box', error.message)); }
}
init();
