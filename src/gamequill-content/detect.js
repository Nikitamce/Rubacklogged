import { toB64url, vsExtract } from '../shared/gq-payload.js';

const FOOTER_RE = /✦\s*(?:Оформлено в|Formatted with) GameQuill/;
const QUICK_VS = /[\uFE00-\uFE0F]|\uDB40[\uDD00-\uDDEF]/;

export function isReviewPage(loc = globalThis.location) {
  const p = String((loc && loc.pathname) || '').replace(/\/+$/, '') || '/';
  if (/^\/u\/[^/]+\/review\/\d+/i.test(p)) return true;
  if (/^\/reviews?\/\d+/i.test(p)) return true;
  return false;
}

export function findReviewTextareas(root = document) {
  if (!root || !root.querySelectorAll) return [];
  const out = [];
  const seen = new Set();
  root.querySelectorAll('textarea[name="review"], textarea#review').forEach((el) => {
    if (!seen.has(el)) {
      seen.add(el);
      out.push(el);
    }
  });
  return out;
}

export function looksLikePayloadText(text) {
  if (typeof text !== 'string' || text.length < 8) return false;
  return FOOTER_RE.test(text) || QUICK_VS.test(text);
}

export function carrierKeyFromText(text) {
  if (!text) return '';
  const bytes = vsExtract(text);
  return bytes ? 'vs:' + toB64url(bytes) : '';
}

const SKIP = [
  '[data-gq-view]',
  '[data-gq-preview]',
  '[data-gq-bar]',
  '[data-i18n-ignore]',
  'gq-composer',
  'textarea',
  'input',
  'header',
  'nav',
  '[role="menu"]',
  '.modal-header',
  '.modal-footer',
  '[class*="notification"]',
].join(',');

function isBlockedPage(loc = globalThis.location) {
  const p = String((loc && loc.pathname) || '').replace(/\/+$/, '') || '/';
  return /^\/(?:settings|users\/sign_in|users\/sign_up)(?:\/|$)/i.test(p);
}

function contentRootFromMarker(node, root = document) {
  let el = node && node.nodeType === 3 ? node.parentElement : node;
  if (!el || !el.closest) return null;
  if (el.closest(SKIP)) return null;

  const reviewRoot =
    el.closest('.review-body') ||
    el.closest('.review__body') ||
    el.closest('.review-content') ||
    el.closest('.review-text') ||
    el.closest('[id^="collapseReview"]') ||
    el.closest('.card-text');
  if (reviewRoot && !reviewRoot.closest(SKIP)) return reviewRoot;

  while (el.parentElement && el.parentElement !== root.body && el.parentElement !== root.documentElement) {
    const p = el.parentElement;
    if (
      p.tagName === 'MAIN' ||
      p.classList?.contains('main') ||
      p.classList?.contains('review-card') ||
      p.classList?.contains('card')
    ) {
      break;
    }
    if (p.closest && p.closest(SKIP)) break;
    const et = (el.textContent || '').length;
    const pt = (p.textContent || '').length;
    if (pt > et * 1.8 + 120) break;
    if (p.getAttribute('data-gq-view') != null) break;
    el = p;
  }
  return el;
}

export function findViewRoots(root = document, loc = globalThis.location) {
  const out = [];
  if (isBlockedPage(loc)) return out;
  const seen = new Set();
  const add = (el) => {
    if (!el || seen.has(el) || (el.closest && el.closest(SKIP))) return;
    seen.add(el);
    out.push(el);
  };

  if (root.querySelectorAll) {
    root.querySelectorAll('[data-gq-carrier]').forEach(add);
  }

  const scope = root.body || root.documentElement || root;
  if (!scope || !root.createTreeWalker) return out;
  const walker = root.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const t = n.nodeValue || '';
      if (!looksLikePayloadText(t)) return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n;
  while ((n = walker.nextNode())) {
    add(contentRootFromMarker(n, root));
  }
  return out;
}
