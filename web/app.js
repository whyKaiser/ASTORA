const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const kinds = { app: 'تطبيق', game: 'لعبة', update: 'تحديث', dlc: 'إضافة' };
const states = { checking: 'جارٍ فحص المصدر', downloading: 'جارٍ التنزيل', paused: 'متوقف مؤقتًا', verifying: 'جارٍ التحقق من البصمة', downloaded: 'اكتمل التنزيل على الكمبيوتر', failed: 'تعذر إكمال التنزيل' };
let token, catalogs = [], disabled = new Set(), search = '', platform = 'ALL', selected = null, selectedSource = null, jobs = [], polling = false;
const inspections = new Map();

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function size(bytes) {
  if (bytes === null || bytes === undefined) return 'حجم غير محدد';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
function itemCount(count) {
  if (!count) return 'لا توجد عناصر';
  if (count === 1) return 'عنصر واحد';
  if (count === 2) return 'عنصران';
  return `${count} ${count % 100 >= 3 && count % 100 <= 10 ? 'عناصر' : 'عنصرًا'}`;
}
function feedback(selector, text, error = false) {
  $(selector).textContent = text;
  $(selector).classList.toggle('error', error);
}
let toastTimer;
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').hidden = true, 5000);
}
async function api(path, data) {
  let response;
  try {
    response = await fetch(path, data === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Astora-Token': token }, body: JSON.stringify(data) });
  } catch { throw new Error('تعذر الاتصال بخادم ASTORA المحلي. تأكد أنه يعمل.'); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'تعذر إكمال الطلب.');
  return result;
}
function persist() {
  try { localStorage.setItem('astora.catalogs.v1', JSON.stringify(catalogs.filter(c => c.id !== 'astora-homebrew'))); localStorage.setItem('astora.disabled.v1', JSON.stringify([...disabled])); }
  catch { toast('تعذر حفظ القوائم في المتصفح. قد تكون مساحة التخزين ممتلئة.'); }
}
function allItems() {
  return catalogs.filter(c => !disabled.has(c.id)).flatMap(catalog => catalog.items.map(item => ({ ...item, catalogId: catalog.id, catalogName: catalog.name, key: `${catalog.id}/${item.id}` })));
}
function renderLibrary() {
  const all = allItems();
  const query = search.toLocaleLowerCase();
  const visible = all.filter(item => (platform === 'ALL' || item.platform === platform) && `${item.title} ${item.titleId} ${item.description}`.toLocaleLowerCase().includes(query));
  $('#library-count').textContent = all.length;
  $('#result-count').textContent = visible.length;
  $('#empty').hidden = visible.length > 0;
  $('#cards').replaceChildren(...visible.map((item, index) => {
    const card = node('button', 'card'); card.type = 'button';
    card.setAttribute('aria-label', `تفاصيل ${item.title}`);
    const art = node('div', 'card-art');
    art.append(node('span', 'monogram', item.title.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase()), node('span', 'card-tag', item.platform), node('span', 'card-sequence', `ASTORA / ${String(index + 1).padStart(3, '0')}`));
    const content = node('div', 'card-body');
    const title = node('h3', 'card-title', item.title); title.dir = 'auto';
    const meta = node('div', 'card-meta');
    meta.append(node('span', '', `${kinds[item.kind]} · ${size(item.size)}`));
    const checked = inspections.get(item.key)?.some(result => result.ok);
    meta.append(node('b', '', checked ? '✓ ترويسة مفحوصة' : 'فحص المصدر ↗'));
    content.append(title, node('p', 'card-desc', item.description || item.catalogName), meta);
    card.append(art, content);
    card.addEventListener('click', () => openDetails(item));
    return card;
  }));
}
function renderSources() {
  $('#sources-list').replaceChildren(...catalogs.map(catalog => {
    const row = node('article', 'source-row');
    const copy = node('div'); copy.append(node('h3', '', catalog.name), node('p', '', `${itemCount(catalog.items.length)} · ${disabled.has(catalog.id) ? 'متوقف' : 'ظاهر في المكتبة'}`));
    const actions = node('div', 'source-actions');
    const toggle = node('button', 'secondary', disabled.has(catalog.id) ? 'تفعيل' : 'إيقاف مؤقت');
    toggle.addEventListener('click', () => { disabled.has(catalog.id) ? disabled.delete(catalog.id) : disabled.add(catalog.id); persist(); renderSources(); renderLibrary(); });
    actions.append(toggle);
    if (catalog.id !== 'astora-homebrew') {
      const remove = node('button', 'secondary', 'إزالة القائمة');
      remove.addEventListener('click', () => { catalogs = catalogs.filter(c => c.id !== catalog.id); disabled.delete(catalog.id); persist(); renderSources(); renderLibrary(); toast('أُزيلت القائمة من المتصفح. ملفات التنزيل محفوظة.'); });
      actions.append(remove);
    }
    row.append(copy, actions); return row;
  }));
}
function showView(view) {
  $$('.view').forEach(section => section.hidden = section.id !== `view-${view}`);
  $$('.nav-button').forEach(button => { const active = button.dataset.view === view; button.classList.toggle('active', active); active ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current'); });
  $('#page-label').textContent = { library: 'المكتبة', sources: 'المصادر', downloads: 'التنزيلات', about: 'عن المشروع' }[view];
  if (view === 'sources') renderSources();
  if (view === 'downloads') pollJobs();
}
function renderInspection(item, results = []) {
  selectedSource = results.find(result => result.ok)?.index ?? null;
  $('#download-button').disabled = selectedSource === null;
  const blocks = item.sources.map((source, index) => {
    const result = results.find(result => result.index === index);
    const block = node('div', `inspection${result && !result.ok ? ' failed' : ''}`);
    const label = node('label', 'inspection-title');
    const radio = node('input'); radio.type = 'radio'; radio.name = 'download-source'; radio.value = index; radio.disabled = !result?.ok; radio.checked = selectedSource === index;
    radio.addEventListener('change', () => { selectedSource = index; });
    label.append(radio, node('span', '', source.name));
    block.append(label);
    if (!result) block.append(node('p', '', 'لم يُفحص بعد'));
    else if (result.ok) {
      block.append(node('p', '', `✓ ترويسة حزمة PS4 · ${result.titleId} · ${size(result.size)}`), node('p', '', `${result.encrypted ? 'اتصال HTTPS' : 'اتصال HTTP غير مشفّر'} · ${result.resumable ? 'المصدر يدعم شروط الاستكمال' : 'الاستكمال غير مؤكد'}`), node('code', '', result.host));
    } else {
      block.append(node('p', '', result.message), node('code', '', result.code + (result.status ? ` · HTTP ${result.status}` : '')));
    }
    return block;
  });
  $('#inspection-results').replaceChildren(...blocks);
}
function openDetails(item) {
  selected = item;
  $('#detail-title').textContent = item.title;
  $('#detail-description').textContent = item.description;
  $('#detail-meta').replaceChildren(...[item.platform, kinds[item.kind], item.version, item.titleId, size(item.size)].filter(Boolean).map(text => node('span', '', text)));
  $('#detail-homepage').hidden = !item.homepage;
  if (item.homepage) $('#detail-homepage').href = item.homepage;
  feedback('#detail-feedback', '');
  renderInspection(item, inspections.get(item.key));
  $('#inspect-button').disabled = false;
  $('#inspect-button').textContent = 'فحص المصادر';
  $('#details-dialog').showModal();
}
$('#inspect-button').addEventListener('click', async () => {
  const item = selected;
  $('#inspect-button').disabled = true;
  $('#inspect-button').textContent = 'جارٍ فحص الملف…';
  $('#download-button').disabled = true;
  feedback('#detail-feedback', 'نقرأ أول 8 KB من كل ملف. لم يبدأ التنزيل الكامل.');
  try {
    const { results } = await api('/api/inspect', { item });
    inspections.set(item.key, results);
    if (selected?.key === item.key) { renderInspection(item, results); feedback('#detail-feedback', results.some(result => result.ok) ? 'اكتمل فحص الترويسة. يمكنك بدء التنزيل على الكمبيوتر.' : 'لم نجد مصدرًا صالحًا بين الروابط المضافة.', !results.some(result => result.ok)); }
    renderLibrary();
  } catch (error) { if (selected?.key === item.key) feedback('#detail-feedback', error.message, true); }
  finally { if (selected?.key === item.key) { $('#inspect-button').disabled = false; $('#inspect-button').textContent = 'إعادة الفحص'; } }
});
$('#download-button').addEventListener('click', async () => {
  if (selectedSource === null) return;
  $('#download-button').disabled = true;
  try {
    await api('/api/downloads', { item: selected, sourceIndex: selectedSource });
    $('#details-dialog').close(); showView('downloads'); toast('بدأت مهمة التنزيل. حالتها تظهر في القائمة.');
  } catch (error) { feedback('#detail-feedback', error.message, true); }
  finally { $('#download-button').disabled = false; }
});
async function importCatalog(catalog) {
  if (catalog.id === 'astora-homebrew') throw new Error('اختر معرّفًا مختلفًا للقائمة المضافة.');
  catalogs = [...catalogs.filter(c => c.id !== catalog.id), catalog];
  disabled.delete(catalog.id); persist(); renderLibrary(); renderSources();
  $('#import-dialog').close(); toast(`أُضيفت «${catalog.name}» — ${itemCount(catalog.items.length)}.`);
}
$('#url-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#url-form button'); button.disabled = true;
  feedback('#import-feedback', 'جارٍ قراءة قائمة المصدر…');
  try { await importCatalog(await api('/api/catalog/import', { url: $('#catalog-url').value.trim() })); }
  catch (error) { feedback('#import-feedback', error.message, true); }
  finally { button.disabled = false; }
});
$('#catalog-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('حجم القائمة يتجاوز 2 MB.');
    let content; try { content = JSON.parse(await file.text()); } catch { throw new Error('الملف ليس JSON صالحًا.'); }
    await importCatalog(await api('/api/catalog/validate', content));
  } catch (error) { feedback('#import-feedback', error.message, true); }
  finally { event.target.value = ''; }
});
function renderJobs() {
  const focusedAction = document.activeElement?.dataset?.jobAction;
  $('#download-count').textContent = jobs.filter(job => ['checking', 'downloading', 'verifying'].includes(job.state)).length;
  if (!jobs.length) { const empty = node('div', 'empty'); empty.append(node('span', '', '↓'), node('h3', '', 'تنزيلاتك ستظهر هنا'), node('p', '', 'افتح تطبيقًا من المكتبة، افحص مصدره، ثم ابدأ التنزيل.')); $('#downloads-list').replaceChildren(empty); return; }
  $('#downloads-list').replaceChildren(...jobs.map(job => {
    const article = node('article', 'job');
    const header = node('div', 'job-header'); const title = node('h3', '', job.title); title.dir = 'auto';
    header.append(title, node('span', 'state', states[job.state] || job.state));
    const progress = node('progress'); progress.max = job.total || 1; progress.value = job.bytes || 0; progress.setAttribute('aria-label', `تقدم تنزيل ${job.title}`);
    const meta = node('div', 'job-meta'); meta.append(node('bdi', '', `${size(job.bytes)} / ${size(job.total)}`));
    if (['checking', 'downloading', 'paused', 'failed'].includes(job.state)) {
      const action = ['paused', 'failed'].includes(job.state) ? 'resume' : 'pause';
      const button = node('button', 'secondary', action === 'resume' ? 'محاولة الاستكمال' : 'إيقاف مؤقت');
      button.dataset.jobAction = `${job.id}/${action}`;
      button.addEventListener('click', async () => { button.disabled = true; try { await api(`/api/downloads/${job.id}/${action}`, {}); await pollJobs(); } catch (error) { toast(error.message); } finally { button.disabled = false; } });
      meta.append(button);
    }
    article.append(header, progress, meta);
    if (job.error) article.append(node('p', 'job-error', job.error.message), node('p', 'job-file', job.error.code));
    if (job.state === 'downloaded') {
      article.append(node('p', 'subtle', job.hashMatched ? '✓ الملف كامل وبصمته مطابقة لبصمة المصدر المنشورة.' : 'الملف كامل. حُسبت بصمته محليًا؛ لا تتوفر بصمة مرجعية للمطابقة.'), node('p', 'job-file', `data/downloads/${job.file}`), node('p', 'job-file', `SHA-256: ${job.sha256}`));
    }
    return article;
  }));
  if (focusedAction) $$('#downloads-list button').find(button => button.dataset.jobAction === focusedAction)?.focus({ preventScroll: true });
}
async function pollJobs() {
  if (polling) return; polling = true;
  try { jobs = await api('/api/downloads'); renderJobs(); }
  catch { /* Keep last known state on an interrupted local connection. */ }
  finally { polling = false; }
}

$$('.nav-button').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$$('[data-import]').forEach(button => button.addEventListener('click', () => { feedback('#import-feedback', ''); $('#import-dialog').showModal(); }));
$$('dialog .close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('#search').addEventListener('input', event => { search = event.target.value.trim(); renderLibrary(); });
const filterOptions = [['ALL', 'الكل'], ['PS4', 'PS4'], ['PS2', 'PS2'], ['PS1', 'PS1'], ['PSP', 'PSP'], ['PS3', 'PS3'], ['PS5', 'PS5']];
for (const [value, label] of filterOptions) {
  const button = node('button', `filter${value === 'ALL' ? ' active' : ''}`, label);
  button.setAttribute('aria-pressed', String(value === 'ALL'));
  button.addEventListener('click', () => { platform = value; $$('.filter').forEach(filter => { filter.classList.toggle('active', filter === button); filter.setAttribute('aria-pressed', String(filter === button)); }); renderLibrary(); });
  $('#filters').append(button);
}
$('#reset-filters').addEventListener('click', () => { search = ''; $('#search').value = ''; $('.filter').click(); });
$('#explore').addEventListener('click', () => { $('#collection').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); $('#cards button')?.focus({ preventScroll: true }); });
$('#cards').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const cards = $$('#cards button'); const index = cards.indexOf(document.activeElement); if (index < 0) return;
  const columns = getComputedStyle($('#cards')).gridTemplateColumns.split(' ').length;
  const next = index + ({ ArrowLeft: 1, ArrowRight: -1, ArrowDown: columns, ArrowUp: -columns }[event.key]);
  if (cards[next]) { event.preventDefault(); cards[next].focus(); }
});

async function init() {
  try {
    const configuration = await api('/api/config'); token = configuration.token;
    const builtIn = await api('/api/catalog'); catalogs = [builtIn];
    try {
      const saved = JSON.parse(localStorage.getItem('astora.catalogs.v1') || '[]');
      if (Array.isArray(saved)) for (const catalog of saved.slice(0, 30)) {
        try { const validated = await api('/api/catalog/validate', catalog); if (validated.id !== builtIn.id) catalogs.push(validated); } catch { /* Discard invalid stored entries. */ }
      }
      const inactive = JSON.parse(localStorage.getItem('astora.disabled.v1') || '[]');
      if (Array.isArray(inactive)) disabled = new Set(inactive.filter(id => typeof id === 'string'));
    } catch { toast('تعذر استرجاع القوائم المحفوظة. القائمة المرفقة متاحة.'); }
    renderLibrary(); renderSources(); await pollJobs();
    setInterval(() => { if (!document.hidden) pollJobs(); }, 2000);
  } catch (error) { toast(error.message); $('#cards').replaceChildren(node('div', 'info-box', error.message)); }
}
init();
