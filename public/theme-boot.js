/**
 * Theme bootstrap. Loaded synchronously before the app bundle so the saved
 * theme is applied before first paint (no flash of the wrong theme).
 *
 * Kept as a separate file rather than an inline script so the strict
 * `script-src 'self'` CSP used by the Docker/nginx deployments still holds.
 */
(function () {
  try {
    var saved = localStorage.getItem('drafter-theme');
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.add(dark ? 'dark' : 'light');
  } catch (err) {
    document.documentElement.classList.add('dark');
  }
})();
