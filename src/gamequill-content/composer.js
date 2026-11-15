import { injectFonts, loadDoc } from './viewer.js';
import renderCss from './render.css';
import cardsCss from '../shared/gq-cards.css';
import { renderReview } from './render.js';
import { DEFAULT_THEME, normalizeTheme } from '../shared/gq-theme.js';
import { getSettings } from './settings.js';
import { GQError, fromB64url, decodeCarrier } from '../shared/gq-payload.js';
import { normalizeReview, countGalleryFrames } from '../shared/gq-schema.js';
import { sanitizeHtml } from '../shared/gq-html.js';
import {
  carrierKeyFromText,
  findReviewTextareas,
  looksLikePayloadText,
} from './detect.js';

const SS_DRAFT = 'gq:composer-draft';

let host = null;
let ui = null;
let frameReady = false;
let lastDoc = null;
let preview = null;
let activeTextarea = null;
const boundTextareas = new WeakMap();

const EXT_ORIGIN = () => {
  try {
    return 'chrome-extension://' + chrome.runtime.id;
  } catch {
    return '';
  }
};

const CSS_OVERLAY = `
:host{all:initial}
.ov{position:fixed;inset:0;z-index:2147483000;background:rgba(5,6,12,.76);display:none}
.ov.on{display:block}
.ov iframe{position:absolute;inset:12px;width:calc(100% - 24px);height:calc(100% - 24px);border:0;border-radius:14px;
background:#080a11;box-shadow:0 30px 90px rgba(0,0,0,.6)}
.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483001;max-width:520px;
font:500 13px/1.45 system-ui,sans-serif;color:#fff;background:#1c2231;border:1px solid #2d3648;
padding:10px 16px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
.toast.err{border-color:#ff5f6d}
`;

function toast(msg, err) {
  if (!ui) return;
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  ui.root.appendChild(t);
  setTimeout(() => t.remove(), 5200);
}

function ensureUi() {
  if (host && host.isConnected) return;
  host = document.createElement('gq-composer');
  host.setAttribute('data-i18n-ignore', '');
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS_OVERLAY;
  const ov = document.createElement('div');
  ov.className = 'ov';
  root.append(style, ov);
  ov.addEventListener('click', (e) => {
    if (e.target === ov) closeEditor();
  });
  document.documentElement.appendChild(host);
  ui = { root, overlay: ov, frame: null };
  frameReady = false;
}

function openEditor(textarea) {
  if (textarea) activeTextarea = textarea;
  ensureUi();
  if (!ui.frame) {
    const f = document.createElement('iframe');
    f.src = chrome.runtime.getURL('gamequill/index.html');
    f.setAttribute('allow', 'clipboard-write');
    f.title = 'GameQuill';
    ui.overlay.appendChild(f);
    ui.frame = f;
  } else if (frameReady) {
    sendInit();
  }
  ui.overlay.classList.add('on');
  document.documentElement.style.overflow = 'hidden';
}

function closeEditor() {
  if (!ui) return;
  ui.overlay.classList.remove('on');
  document.documentElement.style.overflow = '';
}

function post(msg) {
  if (ui && ui.frame && ui.frame.contentWindow) {
    ui.frame.contentWindow.postMessage(msg, EXT_ORIGIN());
  }
}

function getActiveTextarea() {
  if (activeTextarea && activeTextarea.isConnected) return activeTextarea;
  const list = findReviewTextareas(document);
  activeTextarea = list[0] || null;
  return activeTextarea;
}

function reviewContextKey(ta) {
  const form = ta && ta.closest ? ta.closest('form') : null;
  const action = form && form.getAttribute('action');
  if (action) return action.replace(/[^\w/-]+/g, '').slice(0, 80);
  return (location.pathname || '/').replace(/[^\w/-]+/g, '').slice(0, 80);
}

function detectGameTitle(ta) {
  const modal = ta && ta.closest ? ta.closest('.modal, form') : null;
  const selectors = [
    '.game-title-section h1',
    'h1.game-title',
    '.game-header h1',
    '.game-details h1',
  ];
  if (modal) {
    const mTitle = modal.querySelector('.game-title, .modal-game-title, .modal-title');
    const raw = mTitle ? (mTitle.textContent || '').trim() : '';
    if (raw && !/^(log|review|edit|запись|обзор|рецензия|редактировать)/i.test(raw)) {
      return raw.slice(0, 200);
    }
  }
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const txt = el ? (el.textContent || '').trim() : '';
    if (txt) return txt.slice(0, 200);
  }
  return '';
}

async function decodeCarrierString(s) {
  if (!s) throw new GQError('not-gq');
  if (s.startsWith('vs:')) return decodeCarrier({ kind: 'vs', bytes: fromB64url(s.slice(3)) });
  return decodeCarrier(s);
}

async function docFromCarrier(s) {
  if (!s) return null;
  try {
    const raw = await decodeCarrierString(s);
    return normalizeReview(raw, { sanitizeHtml: (h) => sanitizeHtml(h) });
  } catch {
    return null;
  }
}

function draftStorageKey(key) {
  return SS_DRAFT + ':' + (key || 'default');
}

function rememberDraft(carrier, key) {
  if (!carrier) return;
  try {
    sessionStorage.setItem(draftStorageKey(key), carrier);
  } catch {
    // Ignore storage quota issues.
  }
}

function readDraft(key) {
  try {
    return sessionStorage.getItem(draftStorageKey(key)) || '';
  } catch {
    return '';
  }
}

async function findExistingDoc(ta, key) {
  const tries = [];
  const val = ta ? String(ta.value || '') : '';
  const fromField = carrierKeyFromText(val);
  if (fromField) tries.push(fromField);
  const draft = readDraft(key);
  if (draft && !val.trim()) tries.push(draft);

  const seen = new Set();
  for (const c of tries) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    const doc = await docFromCarrier(c);
    if (doc) return doc;
  }
  if (lastDoc && preview && preview.textarea === ta) return lastDoc;
  return null;
}

const escHtml = (s) =>
  String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function cleanPlainText(raw) {
  return String(raw || '')
    .replace(/[\uFE00-\uFE0F]|\uDB40[\uDD00-\uDDEF]/g, '')
    .trim();
}

async function sendInit() {
  const ta = getActiveTextarea();
  const key = reviewContextKey(ta);
  const val = ta ? cleanPlainText(ta.value) : '';
  const mode = val ? 'edit' : 'new';
  const gameTitle = detectGameTitle(ta);
  const s = getSettings();

  post({
    type: 'gq:init',
    steamCountry: s.steamCountry || 'KZ',
    postId: key,
    mode,
    gameTitle,
  });

  const doc = await findExistingDoc(ta, key);
  if (doc) {
    post({ type: 'gq:load', doc });
    return;
  }
  if (val) {
    const html = val.split('\n').map((l) => escHtml(l)).join('<br>');
    post({
      type: 'gq:load',
      soft: true,
      doc: { title: '', game: gameTitle || '', blocks: [{ type: 'text', html }] },
    });
  }
}

function currentTheme() {
  return normalizeTheme((getSettings() || {}).gqTheme || DEFAULT_THEME);
}

function setTextareaHidden(ta, on) {
  if (!ta) return;
  const bar = boundTextareas.get(ta);
  if (on) {
    ta.setAttribute('data-gq-composer-hidden', '');
    if (bar) bar.setAttribute('data-gq-composer-hidden', '');
  } else {
    ta.removeAttribute('data-gq-composer-hidden');
    if (bar) bar.removeAttribute('data-gq-composer-hidden');
  }
}

function hidePreview() {
  if (preview) {
    if (preview.host) preview.host.remove();
    if (preview.textarea) setTextareaHidden(preview.textarea, false);
  }
  preview = null;
}

function showComposerPreview(ta, doc, { carrier, locked } = {}) {
  if (!ta || !ta.isConnected || !doc) return null;
  lastDoc = doc;
  const ctxKey = reviewContextKey(ta);
  if (carrier) rememberDraft(carrier, ctxKey);
  injectFonts();
  const keepLocked = !!(locked || (preview && preview.textarea === ta && preview.locked));
  hidePreview();

  const wrap = document.createElement('div');
  wrap.setAttribute('data-gq-preview', '');
  wrap.setAttribute('data-gq-frames', String(countGalleryFrames(doc)));
  wrap.setAttribute('data-gq-theme', currentTheme());
  wrap.setAttribute('data-i18n-ignore', '');

  const bar = document.createElement('div');
  bar.className = 'gq-preview-bar';
  const label = document.createElement('span');
  label.append('✨ GameQuill · ');
  const ro = document.createElement('span');
  ro.className = 'gq-ro';
  ro.textContent = 'только просмотр';
  label.append(ro);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.setAttribute('data-gq-edit', '');
  editBtn.textContent = 'Изменить в GameQuill';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ghost';
  toggle.setAttribute('data-gq-toggle', '');
  toggle.textContent = 'Показать текст сайта';
  bar.append(label, editBtn, toggle);

  const body = document.createElement('div');
  body.setAttribute('data-gq-preview-body', '');
  const root = body.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = renderCss + '\n' + cardsCss;
  const inner = document.createElement('div');
  inner.className = 'wrap';
  inner.setAttribute('data-gq-theme', currentTheme());
  inner.append(renderReview(document, doc));
  root.append(style, inner);

  wrap.append(bar, body);
  ta.after(wrap);

  let showing = true;
  const apply = () => {
    setTextareaHidden(ta, showing);
    wrap.classList.toggle('is-plain', !showing);
    body.style.display = showing ? '' : 'none';
    toggle.textContent = showing ? 'Показать текст сайта' : '✨ Показать оформление GameQuill';
  };
  editBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openEditor(ta);
  });
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showing = !showing;
    apply();
  });
  apply();

  wrap._gqUpdateTheme = (newTheme) => {
    const nt = normalizeTheme(newTheme);
    wrap.setAttribute('data-gq-theme', nt);
    inner.setAttribute('data-gq-theme', nt);
  };

  preview = {
    host: wrap,
    textarea: ta,
    showing: () => showing,
    locked: keepLocked,
    fresh: Date.now(),
    key: carrier || '',
  };
  return wrap;
}

function writeIntoTextarea(ta, text) {
  if (!ta) return false;
  ta.focus();
  ta.value = text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

async function onTransfer(m) {
  if (!Array.isArray(m.ops) || typeof m.plain !== 'string') return;
  const ta = getActiveTextarea();
  if (!ta) {
    post({
      type: 'gq:transfer-result',
      ok: false,
      message: 'Поле отзыва (#review) не найдено на странице. Откройте форму отзыва и попробуйте снова.',
    });
    return;
  }

  writeIntoTextarea(ta, m.plain);
  const carrier = m.carrier || carrierKeyFromText(m.plain || '') || '';
  const transferred =
    m.doc && typeof m.doc === 'object'
      ? normalizeReview(m.doc, { sanitizeHtml: (h) => sanitizeHtml(h) })
      : null;
  const doc = transferred || (carrier && (await docFromCarrier(carrier))) || lastDoc;

  if (doc) {
    const el = showComposerPreview(ta, doc, { carrier: carrierKeyFromText(m.plain) || carrier, locked: true });
    if (el && preview) preview.fresh = Date.now();
  }

  post({
    type: 'gq:transfer-result',
    ok: true,
    message: 'Готово: оформление перенесено в отзыв. Нажмите «Save» / «Сохранить» в форме Backloggd.',
  });
  closeEditor();
  toast('GameQuill: обзор перенесён в форму. Нажмите «Save» / «Сохранить» на сайте.');
}

function onUploadImage(m) {
  post({
    type: 'gq:upload-result',
    reqId: m && m.reqId,
    ok: false,
    code: 'unsupported',
    error: 'Backloggd не поддерживает загрузку файлов с ПК в отзывы',
  });
}

function onMessage(e) {
  if (!ui || !ui.frame || e.source !== ui.frame.contentWindow) return;
  if (e.origin !== EXT_ORIGIN()) return;
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  if (m.type === 'gq:ready') {
    frameReady = true;
    sendInit();
  } else if (m.type === 'gq:close') {
    closeEditor();
  } else if (m.type === 'gq:transfer') {
    onTransfer(m);
  } else if (m.type === 'gq:upload-image') {
    onUploadImage(m);
  }
}

function ensureTextareaBar(ta) {
  if (!ta || !ta.isConnected || !ta.parentNode) return;
  let bar = boundTextareas.get(ta);
  if (bar && bar.isConnected) return;

  bar = document.createElement('div');
  bar.className = 'gq-composer-bar';
  bar.setAttribute('data-gq-bar', '');
  bar.setAttribute('data-i18n-ignore', '');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gq-open-btn';
  btn.textContent = '✨ Оформить в GameQuill';
  btn.title = 'Открыть расширенный редактор обзоров GameQuill';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openEditor(ta);
  });

  const hint = document.createElement('span');
  hint.className = 'gq-open-hint';
  hint.textContent = 'карточки игр, спойлеры, плюсы/минусы, оценки';

  bar.append(btn, hint);
  ta.before(bar);
  ta.addEventListener('input', tick);
  boundTextareas.set(ta, bar);
}

async function syncPreview() {
  const list = findReviewTextareas(document);
  if (!list.length) {
    hidePreview();
    return;
  }

  for (const ta of list) {
    ensureTextareaBar(ta);
  }

  const ta = getActiveTextarea();
  if (!ta) {
    hidePreview();
    return;
  }

  const txt = String(ta.value || '');
  const key = carrierKeyFromText(txt);
  if (key) {
    if (preview && preview.host.isConnected && preview.textarea === ta && lastDoc && preview.key === key) return;
    const doc = await docFromCarrier(key);
    if (doc) {
      const el = showComposerPreview(ta, doc, { carrier: key });
      if (el && preview) preview.key = key;
      return;
    }
  }
  if (lastDoc && looksLikePayloadText(txt)) {
    if (preview && preview.host.isConnected && preview.textarea === ta) return;
    showComposerPreview(ta, lastDoc);
    return;
  }
  if (!looksLikePayloadText(txt)) {
    if (preview && preview.textarea === ta && (preview.locked || Date.now() - (preview.fresh || 0) < 6e4) && txt.trim()) {
      if (!preview.host || !preview.host.isConnected) showComposerPreview(ta, lastDoc, { locked: true });
      return;
    }
    hidePreview();
    lastDoc = null;
  }
}

let queued = false;
function tick() {
  if (queued) return;
  queued = true;
  setTimeout(() => {
    queued = false;
    syncPreview().catch(() => {});
  }, 150);
}

export function refreshComposerTheme(theme) {
  if (preview && preview.host && typeof preview.host._gqUpdateTheme === 'function') {
    preview.host._gqUpdateTheme(theme);
  }
}

export function startComposer() {
  if (globalThis.__GQ_COMPOSER__) return;
  globalThis.__GQ_COMPOSER__ = true;
  window.addEventListener('message', onMessage);

  // Prevent Bootstrap modal focus trap from stealing focus when GameQuill iframe is open.
  document.addEventListener(
    'focusin',
    (e) => {
      if (ui && ui.overlay.classList.contains('on')) {
        if (e.target === host || (host && host.contains(e.target))) {
          e.stopImmediatePropagation();
        }
      }
    },
    true
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui && ui.overlay.classList.contains('on')) {
      e.preventDefault();
      e.stopPropagation();
      closeEditor();
    }
  });

  const mo = new MutationObserver(tick);
  const go = () => {
    mo.observe(document.documentElement, { childList: true, subtree: true });
    tick();
    setInterval(tick, 1200);
  };
  if (document.body) go();
  else document.addEventListener('DOMContentLoaded', go, { once: true });
}
