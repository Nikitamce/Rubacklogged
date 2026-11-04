/*
 * Backloggd i18n — locale-agnostic translation engine (v2).
 *
 * Design rules:
 *  - Only whole strings are translated. There is no word-by-word substitution,
 *    so game titles, list names and user text are never partially rewritten.
 *  - Dictionary lookups are case-sensitive and prototype-safe.
 *  - Composite strings (counts, dates, "Played in 2024", ...) are handled by
 *    explicit, anchored patterns supplied by the locale.
 *  - Context overrides (e.g. "Games" inside a stat block) are applied only to
 *    elements matching a locale-provided selector.
 */
(function (global) {
  'use strict';

  const MAX_TEXT_LENGTH = 800;

  function normalize(text) {
    return String(text)
      .replace(/\u00a0/g, ' ')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  function createTranslator(locale) {
    if (!locale || typeof locale.strings !== 'object') {
      throw new Error('BackloggdI18n: locale.strings is required');
    }

    const strings = new Map();
    for (const key of Object.keys(locale.strings)) {
      const normalized = normalize(key);
      if (normalized) strings.set(normalized, locale.strings[key]);
    }

    const patterns = (locale.patterns || []).slice();
    const contexts = (locale.contexts || []).map((context) => ({
      selector: context.selector,
      map: context.map,
      keys: new Set(Object.keys(context.map || {})),
    }));

    const contextKeys = new Set();
    for (const context of contexts) {
      for (const key of context.keys) contextKeys.add(key);
    }

    const maxLength = locale.maxLength || MAX_TEXT_LENGTH;

    function translate(text, options) {
      if (typeof text !== 'string') return null;

      const leading = text.match(/^\s*/)[0];
      const trailing = text.match(/\s*$/)[0];
      const core = normalize(text);
      if (!core || core.length > maxLength) return null;

      const element = options && options.element;

      // Context-specific wording wins over the generic dictionary.
      if (element && contextKeys.has(core) && typeof element.closest === 'function') {
        for (const context of contexts) {
          if (!context.keys.has(core)) continue;
          if (element.closest(context.selector)) {
            return leading + context.map[core] + trailing;
          }
        }
      }

      if (strings.has(core)) {
        return leading + strings.get(core) + trailing;
      }

      for (const rule of patterns) {
        if (rule.re.test(core)) {
          const out = core.replace(rule.re, rule.replace);
          return leading + out + trailing;
        }
      }

      return null;
    }

    return {
      translate,
      strings,
      normalize,
      locale,
    };
  }

  global.BackloggdI18n = {
    createTranslator,
    normalize,
    MAX_TEXT_LENGTH,
  };
})(window);
