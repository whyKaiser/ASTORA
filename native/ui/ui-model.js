/* Pure ES5 helpers shared by the TV interface and host regression checks. */
var AstoraModel = (function () {
  'use strict';
  function searchText(value) {
    return String(value || '').toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');
  }
  function filter(items, query, platform, language) {
    var result = [], needle = searchText(query), i, item, translation;
    for (i = 0; i < items.length; i++) {
      item = items[i];
      translation = item.translations && item.translations[language] || {};
      if ((platform === 'ALL' || item.platform === platform) && (!needle || searchText(item.title + ' ' + item.description + ' ' + (translation.title || '') + ' ' + (translation.description || '')).indexOf(needle) >= 0)) result.push(item);
    }
    return result;
  }
  function page(items, index, capacity) {
    capacity = capacity === 2 ? 2 : 4;
    var pages = Math.max(1, Math.ceil(items.length / capacity));
    index = Math.max(0, Math.min(pages - 1, Math.floor(Number(index) || 0)));
    return {items:items.slice(index * capacity, (index + 1) * capacity), index:index, pages:pages};
  }
  function nearest(from, candidates, key) {
    var best = -1, score = Infinity, i, r, dx, dy, cost, horizontalTolerance, verticalTolerance;
    for (i = 0; i < candidates.length; i++) {
      r = candidates[i];
      dx = r.left + r.width / 2 - (from.left + from.width / 2);
      dy = r.top + r.height / 2 - (from.top + from.height / 2);
      /* Ignore a focused card's small lift when deciding whether another card
         belongs above/below it. Geometry works for either language direction. */
      horizontalTolerance = Math.max(4, Math.min(from.width, r.width) / 4);
      verticalTolerance = Math.max(4, Math.min(from.height, r.height) / 3);
      if ((key === 37 && dx >= -horizontalTolerance) || (key === 39 && dx <= horizontalTolerance) || (key === 38 && dy >= -verticalTolerance) || (key === 40 && dy <= verticalTolerance)) continue;
      cost = key === 37 || key === 39 ? Math.abs(dx) + Math.abs(dy) * 4 : Math.abs(dy) + Math.abs(dx) * 4;
      if (cost < score) { score = cost; best = i; }
    }
    return best;
  }
  function art(item) {
    var map = {SKID02048:'2048',APOL00004:'apollo',RMTC00001:'remote',PGIN00001:'installer'};
    return '/art-' + (item && map[item.titleId] || 'generic') + '.svg';
  }
  return {searchText:searchText, filter:filter, page:page, nearest:nearest, art:art};
})();
