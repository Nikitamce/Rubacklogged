/*
 * Backloggd i18n — content script (v2).
 *
 * Responsibilities:
 *  - exact-match translation of complete text nodes and attributes;
 *  - protection of game titles, covers, reviews, comments, lists and bios;
 *  - incremental mutation processing (no full-page scan on every mutation);
 *  - Turbo Drive lifecycle support;
 *  - RU/EN switcher in the navbar;
 *  - settings sync with the popup.
 */
(() => {
  'use strict';

  const SWITCHER_ID = 'backloggd-i18n-switcher';
  function detectBrowserLanguage() {
    try {
      const navLang = (typeof navigator !== 'undefined' && (navigator.language || (navigator.languages && navigator.languages[0]))) || '';
      return navLang.toLowerCase().startsWith('ru') ? 'ru' : 'en';
    } catch (e) {
      return 'en';
    }
  }

  function getDefaultSettings() {
    const lang = detectBrowserLanguage();
    return {
      language: lang,
      enabled: lang === 'ru',
    };
  }

  const DEFAULT_SETTINGS = getDefaultSettings();
  const ATTRS = ['placeholder', 'title', 'aria-label', 'data-original-title', 'data-bs-original-title'];

  // Tags that never contain translatable UI copy or must stay untouched.
  // Note: TEXTAREA placeholder is translatable, but its inner text is user input.
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TITLE',
    'svg', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME',
  ]);

  /*
   * Everything inside these containers belongs to the user or to game data:
   * covers, titles, reviews, comments, descriptions, bios, journal entries.
   * Adding a selector here is always safer than translating and hoping.
   */
  const PROTECTED_SELECTOR = [
    '[contenteditable]',
    '[translate="no"]',
    '[data-i18n-ignore]',
    '.notranslate',
    'svg',
    '.navbar-brand',
    '.brand-logo',
    '#brand',
    '.game-text-centered',
    // Only the title itself: the same section also contains "by Developer".
    '.game-title-section h1',
    '.game-description',
    '.review-body',
    '.review__body',
    '.review__game',
    '[id^="collapseReview"]',
    '.review-title',
    '.review-game-name',
    '.review-content',
    '.review-text',
    '.card-text',
    '.username-link',
    '.user-name',
    '.bio',
    '.profile-bio',
    '.user-bio',
    '#bio',
    '.comment-body',
    '.comment-text',
    '.comment-content',
    '.comments-body',
    '.list-description',
    '.list-entry-description',
    '.list-entry-title',
    '.list-name',
    '.list-title',
    '.list-desc',
    '.journal-entry',
    '.journal-body',
    '.journal-content',
    '.journal-text',
    '#' + SWITCHER_ID,
    '[data-blp-enrich]',
    '[data-blp-steamdb]',
    '[data-blp-similar]',
    '[data-blp-card]',
    '[data-blp-card-state]',
    '[data-blp-translate]',
    '.blp-card-badges',
    '.blp-settings-backdrop',
    '.blp-fix-match-backdrop',
    '.blp-export-backdrop',
    '.blp-export-wrap',
    '.blp-export-log-wrap',
    '.blp-debug-panel',
    '.blp-steamdb-cover',
    '.blp-steam-gallery',
    '.blp-similar',
    '.blp-viewer',
    '.blp-title-icon-wrap',
    '.blp-game-id',
    '.blp-toast-host',
    '.blp-toast',
    '.blp-ump',
    '.blp-gmp',
    '.blp-profile-tier-chip',
    '#blp-nav-settings',
    '#blp-profile-menu-settings',
    '#blp-user-mini-profile',
    '#blp-game-mini-profile',
  ].join(',');

  // Expand/collapse controls are UI even when they sit inside a protected
  // bio or review body.
  const TOGGLE_SELECTOR = [
    'a[data-toggle="collapse"]',
    '[data-toggle="collapse"]',
    '[data-target*="collapse"]',
    'a[href*="collapse"]',
    '[aria-controls*="collapse"]',
    '.collapse-btn',
    '.readmore-open',
    '.readmore-closed',
    '.read-more',
    '.review-more',
    '.expand-review-col a',
    '.expand-btn',
    '.expand-button',
    '.expand-description',
  ].join(',');

  const engine = window.BackloggdI18n;
  const locales = window.BackloggdI18nLocales || {};

  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let translator = null;
  let translatedCount = 0;
  let countingPass = false;

  const originals = new WeakMap();       // text node -> { source, written }
  const attrOriginals = new WeakMap();   // element -> { placeholder: {...}, ... }

  let originalTitle = null;
  let lastWrittenTitle = null;
  const originalLang = document.documentElement
    ? document.documentElement.getAttribute('lang')
    : null;

  let observer = null;
  let flushTimer = null;
  let suspendObserver = false;
  const pending = new Set();

  /* ------------------------------------------------------------------ */
  /* Settings & state                                                    */
  /* ------------------------------------------------------------------ */

  function sanitize(value) {
    const language = value && value.language === 'en' ? 'en' : 'ru';
    return {
      language,
      enabled: !(value && value.enabled === false),
    };
  }

  function isActive() {
    return settings.enabled && settings.language !== 'en' && !!locales[settings.language];
  }

  function loadSettings(done) {
    let finished = false;
    let timeoutId = null;
    const finish = (value, late) => {
      if (finished) {
        // A slow storage read must not leave the page in the wrong language.
        if (late && value) {
          const next = sanitize(value);
          if (next.language !== settings.language || next.enabled !== settings.enabled) {
            settings = next;
            if (document.body) applyAll();
          }
        }
        return;
      }
      finished = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (value) settings = sanitize(value);
      done();
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        // The timeout protects against a dead extension context.
        timeoutId = setTimeout(() => finish(null), 800);
        chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            finish(null);
            return;
          }
          finish(items, true);
        });
        return;
      }
    } catch (error) {
      // Fall through to defaults.
    }
    finish(null);
  }

  function syncPlusSettings(targetLocale) {
    try {
      if (typeof localStorage === 'undefined') return;
      const key = 'blp_settings';
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : {};
      if (data.siteLocale !== targetLocale) {
        data.siteLocale = targetLocale;
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  function saveSettings() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set({
          language: settings.language,
          enabled: settings.enabled,
        });
      }
    } catch (error) {
      // Storage can be unavailable (private mode, invalidated context).
    }
    syncPlusSettings(settings.enabled && settings.language === 'ru' ? 'ru' : 'off');
  }

  function applySettings(next, options) {
    const normalized = sanitize(Object.assign({}, settings, next));
    if (normalized.language === settings.language && normalized.enabled === settings.enabled) {
      updateSwitcher();
      return;
    }

    settings = normalized;
    if (!options || options.persist !== false) saveSettings();
    applyAll();
  }

  function status() {
    return {
      language: settings.language,
      enabled: settings.enabled,
      active: !!(translator && isActive()),
      translated: translatedCount,
    };
  }

  /* ------------------------------------------------------------------ */
  /* DOM protection                                                      */
  /* ------------------------------------------------------------------ */

  function isToggleControl(element) {
    try {
      if (element.closest(TOGGLE_SELECTOR)) return true;
      const ownText = (element.textContent || '').replace(/\s+/g, ' ').trim();
      // These labels are UI even when an ancestor is protected — but only
      // on an interactive/expand control, never on a game title.
      if (
        /^(EXPAND|COLLAPSE|Expand|Collapse)$/.test(ownText) &&
        element.closest(
          'button, a, [role="button"], summary, [data-toggle], [aria-controls*="collapse"], [class*="expand"], [class*="readmore"], [class*="read-more"]'
        )
      ) {
        return true;
      }
      const control = element.closest('button, a, [role="button"], summary');
      if (control) {
        const text = (control.textContent || '').replace(/\s+/g, ' ').trim();
        if (/^(EXPAND|COLLAPSE|Expand|Collapse|Read more|Show more|See more|Read less|Show less)$/i.test(text)) {
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  function isJournalEntryLink(element) {
    try {
      const link = element.closest('a, [role="link"]');
      if (!link) return false;
      const text = (link.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return text === 'journal' || text === 'journal entry' || text === 'journal entry!';
    } catch (error) {
      return false;
    }
  }

  function isSkippedElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;
    if (SKIP_TAGS.has(element.tagName)) return true;
    if (element.isContentEditable) return true;
    try {
      if (isToggleControl(element)) return false;
      if (isJournalEntryLink(element)) return false;
      if (element.closest(PROTECTED_SELECTOR)) return true;
    } catch (error) {
      // closest() can throw for a detached element in old browsers.
    }
    return false;
  }

  function isOwnNode(node) {
    if (!node) return false;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) return false;
    return element.id === SWITCHER_ID || !!element.closest('#' + SWITCHER_ID);
  }

  /* ------------------------------------------------------------------ */
  /* Text nodes                                                          */
  /* ------------------------------------------------------------------ */

  function translateTextNode(node) {
    if (!translator) return;

    const parent = node.parentElement;
    if (!parent || parent.tagName === 'TEXTAREA' || isSkippedElement(parent)) return;

    const current = node.nodeValue;
    if (!current || !current.trim()) return;

    const record = originals.get(node);
    // If the site changed the text after our write, treat the new value as
    // the source instead of restoring a stale English string.
    const source = record && current === record.written ? record.source : current;

    let translated = translator.translate(source, { element: parent });

    // Decimal ratings: 3.8 -> 3,8. Restricted to the rating block so that
    // version strings such as "1.18" are never touched.
    if (translated === null && parent.closest('.game-rating')) {
      const core = source.trim();
      if (/^\d+\.\d+$/.test(core)) {
        translated = source.replace(core, core.replace('.', ','));
      }
    }

    if (translated === null) {
      if (record && current !== record.written) {
        originals.set(node, { source: current, written: current });
      }
      return;
    }

    if (translated !== current) {
      originals.set(node, { source, written: translated });
      node.nodeValue = translated;
      translatedCount += 1;
    } else {
      originals.set(node, { source, written: current });
      if (countingPass) translatedCount += 1;
    }
  }

  function translateAttributes(element) {
    if (!translator || isSkippedElement(element)) return;

    let records = attrOriginals.get(element);

    for (const attribute of ATTRS) {
      const value = element.getAttribute(attribute);
      if (!value || !value.trim()) continue;

      const record = records && records[attribute];
      const source = record && value === record.written ? record.source : value;
      const translated = translator.translate(source, { element });
      if (translated === null) {
        if (record && value !== record.written) {
          if (!records) records = {};
          records[attribute] = { source: value, written: value };
        }
        continue;
      }

      if (translated !== value) {
        element.setAttribute(attribute, translated);
        translatedCount += 1;
      } else if (countingPass) {
        translatedCount += 1;
      }
      if (!records) records = {};
      records[attribute] = { source, written: translated };
    }

    if (records) attrOriginals.set(element, records);
  }

  /* ------------------------------------------------------------------ */
  /* Subtree walking                                                     */
  /* ------------------------------------------------------------------ */

  function translateSubtree(root) {
    if (!translator || !root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    if (isSkippedElement(root)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || isSkippedElement(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node = walker.nextNode();
    while (node) {
      translateTextNode(node);
      node = walker.nextNode();
    }

    translateAttributesIn(root);
  }

  function translateAttributesIn(root) {
    translateAttributes(root);
    let elements;
    try {
      elements = root.querySelectorAll('[placeholder], [title], [aria-label], [data-original-title], [data-bs-original-title]');
    } catch (error) {
      return;
    }
    for (const element of elements) {
      if (!isSkippedElement(element)) translateAttributes(element);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Document title & language                                           */
  /* ------------------------------------------------------------------ */

  function translateDocumentTitle() {
    if (!translator) return;

    // Turbo updates the title without a body mutation; detect a new source.
    if (originalTitle === null || (lastWrittenTitle !== null && document.title !== lastWrittenTitle)) {
      originalTitle = document.title;
    }

    const parts = originalTitle.split(' | ');
    const translated = parts.map((part) => translator.translate(part) || part).join(' | ');
    if (translated !== document.title) {
      lastWrittenTitle = translated;
      document.title = translated;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Full pass / restore                                                 */
  /* ------------------------------------------------------------------ */

  function applyAll() {
    if (!document.body) return;

    suspendObserver = false;
    ensureSwitcher();
    if (!isActive()) {
      translator = null;
      restoreAll();
      updateSwitcher();
      return;
    }

    translator = engine.createTranslator(locales[settings.language]);
    translatedCount = 0;
    countingPass = true;
    try {
      translateSubtree(document.body);
      translateDocumentTitle();
    } catch (error) {
      // A malformed page must not disable the extension permanently.
    } finally {
      countingPass = false;
    }
    document.documentElement.setAttribute('lang', settings.language);
    // CSS-only labels (EXPAND/COLLAPSE, Show More) are switched by this class.
    document.documentElement.classList.add('backloggd-i18n-active');
    updateSwitcher();
  }

  function restoreAll() {
    if (!document.body) return;

    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    pending.clear();

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const record = originals.get(node);
      if (record && node.nodeValue === record.written) {
        node.nodeValue = record.source;
      }
      originals.delete(node);
      node = walker.nextNode();
    }

    let elements = [];
    try {
      elements = document.querySelectorAll('[placeholder], [title], [aria-label], [data-original-title], [data-bs-original-title]');
    } catch (error) {
      elements = [];
    }
    for (const element of elements) {
      const records = attrOriginals.get(element);
      if (!records) continue;
      for (const attribute of ATTRS) {
        const record = records[attribute];
        if (record && element.getAttribute(attribute) === record.written) {
          element.setAttribute(attribute, record.source);
        }
      }
      attrOriginals.delete(element);
    }

    if (originalTitle !== null && (lastWrittenTitle === null || document.title === lastWrittenTitle)) {
      document.title = originalTitle;
    }
    originalTitle = null;
    lastWrittenTitle = null;

    document.documentElement.classList.remove('backloggd-i18n-active');
    if (originalLang === null) {
      document.documentElement.removeAttribute('lang');
    } else {
      document.documentElement.setAttribute('lang', originalLang);
    }

    translatedCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Mutation observer                                                   */
  /* ------------------------------------------------------------------ */

  function scheduleFlush() {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(flushPending, 16);
  }

  function flushPending() {
    flushTimer = null;
    const nodes = Array.from(pending);
    pending.clear();

    for (const node of nodes) {
      if (!node.isConnected) continue;
      if (node.nodeType === Node.TEXT_NODE) {
        translateTextNode(node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        translateSubtree(node);
      }
    }
  }

  function handleMutations(records) {
    if (!translator || suspendObserver) return;

    let changed = false;
    let hasUrgent = false;

    for (const record of records) {
      if (record.type === 'characterData') {
        const recordInfo = originals.get(record.target);
        // Ignore our own writes.
        if (recordInfo && record.target.nodeValue === recordInfo.written) continue;
        pending.add(record.target);
        changed = true;
      } else if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (isOwnNode(node)) continue;
          pending.add(node);
          changed = true;
          // If interactive menus, popups, or dropdowns appeared, flush immediately
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node;
            const cls = (el.className || '') + ' ' + (el.id || '');
            if (/dropdown|menu|select|modal|popover|dialog/i.test(cls)) {
              hasUrgent = true;
            }
          }
        }
      }
    }

    if (hasUrgent) {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushPending();
    } else if (changed) {
      scheduleFlush();
    }
  }

  function startObserver() {
    if (observer) return;
    if (!document.documentElement) {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
      return;
    }
    observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Navbar switcher                                                     */
  /* ------------------------------------------------------------------ */

  function findNavTarget() {
    return (
      document.querySelector('#primary-nav #navbarSupportedContent .row .col') ||
      document.querySelector('#primary-nav #navbarSupportedContent') ||
      document.querySelector('#primary-nav .container') ||
      document.querySelector('#primary-nav')
    );
  }

  function ensureSwitcher() {
    if (!document.body) return;

    let container = document.getElementById(SWITCHER_ID);
    if (container && container.isConnected) {
      // The first pass may run before the navbar is parsed; move the
      // fallback into the real slot once it appears.
      if (container.classList.contains('bi18n-fallback')) {
        const lateNav = findNavTarget();
        if (lateNav) {
          container.classList.remove('bi18n-fallback');
          lateNav.appendChild(container);
        }
      }
      updateSwitcher();
      return;
    }
    if (container && !container.isConnected) {
      container.remove();
    }

    container = document.createElement('div');
    container.id = SWITCHER_ID;
    container.className = 'bi18n';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bi18n-btn';

    const globe = document.createElement('span');
    globe.className = 'bi18n-globe';
    globe.setAttribute('aria-hidden', 'true');
    globe.textContent = '🌐';

    const badge = document.createElement('span');
    badge.className = 'bi18n-lang';

    button.appendChild(globe);
    button.appendChild(badge);
    button.addEventListener('click', onSwitcherClick);
    container.appendChild(button);

    const nav = findNavTarget();

    if (nav) {
      container.classList.remove('bi18n-fallback');
      nav.appendChild(container);
    } else {
      container.classList.add('bi18n-fallback');
      document.body.appendChild(container);
    }

    updateSwitcher();
  }

  function updateSwitcher() {
    const container = document.getElementById(SWITCHER_ID);
    if (!container) return;

    const badge = container.querySelector('.bi18n-lang');
    const button = container.querySelector('.bi18n-btn');
    const active = settings.enabled && settings.language !== 'en';

    if (badge) {
      const label = settings.enabled ? settings.language.toUpperCase() : 'OFF';
      if (badge.textContent !== label) badge.textContent = label;
    }
    if (button) {
      button.classList.toggle('bi18n-off', !active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.title = active
        ? 'Перевод включён. Нажмите, чтобы показать оригинал'
        : 'Включить русский перевод';
      button.setAttribute(
        'aria-label',
        active ? 'Язык интерфейса: русский. Переключить на английский' : 'Включить русский перевод'
      );
    }
  }

  function onSwitcherClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!settings.enabled) {
      applySettings({ enabled: true, language: 'ru' });
      return;
    }
    applySettings({ language: settings.language === 'ru' ? 'en' : 'ru' });
  }

  /* ------------------------------------------------------------------ */
  /* Messages & lifecycle                                                */
  /* ------------------------------------------------------------------ */

  function registerMessageHandler() {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || typeof message !== 'object') return;

        if (message.type === 'getStatus') {
          sendResponse(status());
          return;
        }
        if (message.type === 'setSettings') {
          applySettings(message.settings || {}, { persist: false });
          sendResponse(status());
          return;
        }
        if (message.type === 'rescan') {
          applyAll();
          sendResponse(status());
        }
      });
    } catch (error) {
      // Invalidated extension context — nothing to do.
    }
  }

  function registerStorageHandler() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'sync') return;
          const next = Object.assign({}, settings);
          if (changes.language) next.language = changes.language.newValue;
          if (changes.enabled) next.enabled = changes.enabled.newValue;
          applySettings(next, { persist: false });
          syncPlusSettings(next.enabled && next.language === 'ru' ? 'ru' : 'off');
        });
      }
    } catch (error) {
      // Ignore invalidated contexts.
    }

    // Two-way synchronization with Backloggd Plus settings panel
    if (typeof window !== 'undefined') {
      window.addEventListener('blp:site-locale-changed', (event) => {
        const locale = event.detail && event.detail.siteLocale;
        if (locale === 'ru') {
          applySettings({ language: 'ru', enabled: true });
        } else {
          applySettings({ language: 'en', enabled: false });
        }
      });

      window.addEventListener('storage', (event) => {
        if (event.key === 'blp_settings' && event.newValue) {
          try {
            const data = JSON.parse(event.newValue);
            if (data && typeof data.siteLocale === 'string') {
              if (data.siteLocale === 'ru') {
                applySettings({ language: 'ru', enabled: true });
              } else {
                applySettings({ language: 'en', enabled: false });
              }
            }
          } catch (e) {}
        }
      });
    }
  }

  function registerLifecycleHandlers() {
    for (const eventName of ['turbo:load', 'turbo:render']) {
      window.addEventListener(eventName, () => {
        if (!document.body) return;
        ensureSwitcher();
        applyAll();
      });
    }

    window.addEventListener('turbo:frame-load', (event) => {
      if (translator && event.target) translateSubtree(event.target);
    });

    // Never let Turbo cache a snapshot with Russian text inside the English DOM.
    window.addEventListener('turbo:before-cache', () => {
      if (!translator) return;
      suspendObserver = true;
      restoreAll();
      // If the navigation is aborted, bring the translation back after the
      // cache snapshot has been taken.
      setTimeout(() => {
        if (!suspendObserver) return;
        suspendObserver = false;
        if (document.body && isActive()) applyAll();
      }, 500);
    });

    window.addEventListener('pageshow', () => {
      if (document.body && isActive()) applyAll();
    });

    // Proactively translate dropdowns on hover / pointerdown before animation opens
    document.addEventListener('pointerenter', (event) => {
      if (!translator || !event.target || event.target.nodeType !== Node.ELEMENT_NODE) return;
      const target = event.target.closest('[data-toggle="dropdown"], .dropdown-toggle, .dropdown, select, button');
      if (target) {
        const menu = target.closest('.dropdown, .btn-group') || target;
        translateSubtree(menu);
      }
    }, true);

    document.addEventListener('pointerdown', (event) => {
      if (!translator || !event.target || event.target.nodeType !== Node.ELEMENT_NODE) return;
      const target = event.target.closest('[data-toggle="dropdown"], .dropdown-toggle, .dropdown, select, button');
      if (target) {
        const menu = target.closest('.dropdown, .btn-group') || target;
        translateSubtree(menu);
      }
    }, true);
  }

  function start() {
    loadSettings(() => {
      startObserver();
      registerMessageHandler();
      registerStorageHandler();
      registerLifecycleHandlers();

      if (document.body) {
        ensureSwitcher();
        applyAll();
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          ensureSwitcher();
          applyAll();
        }, { once: true });
      }

      // Re-evaluate the navbar slot even when the first pass ran early.
      document.addEventListener('DOMContentLoaded', ensureSwitcher, { once: true });
    });
  }

  start();
})();
