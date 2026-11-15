import { getSettings } from './settings.js';
import { fingerprintText } from '../shared/gq-hash.js';
import { fromB64url, decodeCarrier } from '../shared/gq-payload.js';
import { countGalleryFrames, normalizeReview } from '../shared/gq-schema.js';
import { DEFAULT_THEME, normalizeTheme } from '../shared/gq-theme.js';
import { sanitizeHtml } from '../shared/gq-html.js';
import { renderReview } from './render.js';
import renderCss from './render.css';
import cardsCss from '../shared/gq-cards.css';
import { nativeText } from './native-text.js';
import { isReviewPage, carrierKeyFromText, findViewRoots } from './detect.js';

const state = new WeakMap();
const cache = new Map();
let enabled = true;

export function injectFonts() {
  if (document.getElementById('gq-fonts')) return;
  const u = (f) => chrome.runtime.getURL('fonts/' + f);
  const face = (fam, file, style, range) =>
    `@font-face{font-family:'${fam}';font-style:${style};font-weight:100 900;font-display:swap;src:url('${u(file)}') format('woff2');unicode-range:${range}}`;
  const LAT =
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  const CYR = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116';
  const s = document.createElement('style');
  s.id = 'gq-fonts';
  s.textContent = [
    face('GQ Inter', 'inter-latin-wght-normal.woff2', 'normal', LAT),
    face('GQ Inter', 'inter-cyrillic-wght-normal.woff2', 'normal', CYR),
    face('GQ Inter', 'inter-latin-wght-italic.woff2', 'italic', LAT),
    face('GQ Inter', 'inter-cyrillic-wght-italic.woff2', 'italic', CYR),
    face('GQ Unbounded', 'unbounded-latin-wght-normal.woff2', 'normal', LAT),
    face('GQ Unbounded', 'unbounded-cyrillic-wght-normal.woff2', 'normal', CYR),
  ].join('\n');
  (document.head || document.documentElement).appendChild(s);
}

function carrierKey(el) {
  const a = el.getAttribute && el.getAttribute('data-gq-carrier');
  if (a) return a;
  return carrierKeyFromText(el.textContent || '');
}

export function loadDoc(key) {
  if (!cache.has(key)) {
    const p = (async () => {
      try {
        const raw = key.startsWith('vs:')
          ? await decodeCarrier({ kind: 'vs', bytes: fromB64url(key.slice(3)) })
          : await decodeCarrier(key);
        return normalizeReview(raw, { sanitizeHtml: (h) => sanitizeHtml(h) });
      } catch (e) {
        console.debug('[GameQuill] bad carrier', e && e.code);
        return null;
      }
    })();
    cache.set(key, p);
    if (cache.size > 200) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}

function stopInteractive(e) {
  const t = e.target;
  if (t && t.closest && t.closest('a,button,summary,details')) e.stopPropagation();
}

function buildView(el, doc, mismatch) {
  const host = document.createElement('div');
  const theme = normalizeTheme((getSettings() || {}).gqTheme || DEFAULT_THEME);
  host.setAttribute('data-gq-view', '');
  host.setAttribute('data-gq-frames', String(countGalleryFrames(doc)));
  host.setAttribute('data-gq-theme', theme);
  host.setAttribute('data-i18n-ignore', '');
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = renderCss + '\n' + cardsCss;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  wrap.setAttribute('data-gq-theme', theme);
  const bar = document.createElement('div');
  bar.className = 'bar';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'pill';
  const note = document.createElement('span');
  note.className = 'note';
  bar.append(toggle, note);
  const body = document.createElement('div');
  body.className = 'body';
  body.append(renderReview(document, doc));
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'pill ghost more';
  more.textContent = 'Развернуть обзор ▾';
  wrap.append(bar, body, more);
  root.append(style, wrap);
  ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach((t) =>
    wrap.addEventListener(t, stopInteractive)
  );

  let showing = true;
  const compactable = !isReviewPage();
  const apply = () => {
    if (showing) {
      el.setAttribute('data-gq-hidden', '');
      wrap.classList.remove('mini');
      toggle.textContent = '✨ GameQuill · показать оригинал';
      note.textContent = '';
    } else {
      el.removeAttribute('data-gq-hidden');
      wrap.classList.add('mini');
      wrap.classList.remove('compact');
      toggle.textContent = '✨ Показать оформление GameQuill';
      note.textContent = mismatch ? 'текст отзыва изменён после оформления' : '';
    }
    if (showing && compactable && !wrap.dataset.expanded) wrap.classList.add('compact');
  };
  toggle.addEventListener('click', () => {
    showing = !showing;
    apply();
  });
  more.addEventListener('click', () => {
    wrap.dataset.expanded = '1';
    wrap.classList.remove('compact');
  });
  apply();

  host._gqUpdateTheme = (newTheme) => {
    const nt = normalizeTheme(newTheme);
    host.setAttribute('data-gq-theme', nt);
    wrap.setAttribute('data-gq-theme', nt);
  };
  return host;
}

function teardown(el) {
  const st = state.get(el);
  if (st && st.host) st.host.remove();
  el.removeAttribute('data-gq-hidden');
  state.delete(el);
}

async function processEl(el) {
  const key = enabled ? carrierKey(el) : '';
  const st = state.get(el);
  if (!key) {
    if (st) teardown(el);
    return;
  }
  if (st && st.key === key) {
    if (st.host && !st.host.isConnected && el.isConnected && el.parentNode) el.after(st.host);
    return;
  }
  if (st) teardown(el);
  state.set(el, { key, host: null });
  const doc = await loadDoc(key);
  const cur = state.get(el);
  if (!cur || cur.key !== key || !el.isConnected) return;
  if (!doc) return;
  const fp = fingerprintText(nativeText(el));
  const mismatch = !!(doc.fp && (doc.fp.h !== fp.h || doc.fp.len !== fp.len));
  const host = buildView(el, doc, mismatch);
  el.after(host);
  cur.host = host;
}

let queued = false;
function scan() {
  if (queued) return;
  queued = true;
  setTimeout(() => {
    queued = false;
    findViewRoots(document).forEach((el) => {
      processEl(el).catch(() => {});
    });
  }, 150);
}

export function setViewerEnabled(on) {
  enabled = !!on;
  scan();
}

export function refreshViewerThemes(theme) {
  document.querySelectorAll('[data-gq-view]').forEach((host) => {
    if (typeof host._gqUpdateTheme === 'function') host._gqUpdateTheme(theme);
  });
}

export function startViewer(opts = {}) {
  if (globalThis.__GQ_VIEWER__) return;
  globalThis.__GQ_VIEWER__ = true;
  enabled = opts.enabled !== false;
  injectFonts();
  const mo = new MutationObserver(scan);
  const go = () => {
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-gq-carrier'],
    });
    scan();
    setInterval(scan, 2500);
  };
  if (document.body) go();
  else document.addEventListener('DOMContentLoaded', go, { once: true });
}
