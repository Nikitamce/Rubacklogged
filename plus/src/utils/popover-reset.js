/**
 * Body-level popovers outlive Backloggd's navigations when Turbo snapshots the
 * page or the browser restores it from bfcache. Reset them on navigation and
 * exclude them from Turbo snapshots.
 */

/** Remove every DOM copy of a popover by selector, including snapshot copies. */
export function dropPopoverCopies(selector) {
  document.querySelectorAll(selector).forEach((el) => el.remove());
}

/** Run `reset` before Turbo caches the page and after navigation / bfcache restore. */
export function bindPopoverReset(reset) {
  const run = () => reset();
  ['turbo:before-cache', 'turbo:render', 'turbo:load'].forEach((evt) => {
    document.addEventListener(evt, run, true);
  });
  ['popstate', 'pageshow', 'pagehide'].forEach((evt) => {
    window.addEventListener(evt, run, true);
  });
}
