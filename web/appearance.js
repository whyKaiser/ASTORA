// Apply the saved theme before the stylesheet paints. Storage may be disabled.
(() => {
  let theme = 'dark';
  try { if (localStorage.getItem('astora.theme') === 'sand') theme = 'sand'; } catch { /* Default remains usable. */ }
  document.documentElement.dataset.theme = theme;
})();
