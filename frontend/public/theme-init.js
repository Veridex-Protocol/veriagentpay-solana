/**
 * Applies the stored theme before first paint.
 *
 * Served as a static file rather than inlined via `dangerouslySetInnerHTML` in
 * the root layout. The old form was not exploitable (the string was a literal)
 * but it sat on the root <script> of every page, which made it the highest
 * -impact place in the app for someone to later interpolate a variable.
 *
 * Loaded synchronously in <head>, so it still runs before paint and the
 * flash-of-wrong-theme it exists to prevent stays prevented.
 *
 * See docs/security-remaining-issues.md (FE-H-04).
 */
(function () {
  try {
    var t = localStorage.getItem('veriagent-theme');
    if (t !== 'dark' && t !== 'light') {
      t =
        location.pathname === '/'
          ? 'light'
          : window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark';
    }
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(t);
  } catch (e) {
    document.documentElement.classList.add(location.pathname === '/' ? 'light' : 'dark');
  }
})();
