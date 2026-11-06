'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadLocale() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'locales', 'ru.js'), 'utf8');
  const windowObject = {};
  vm.runInNewContext(code, { window: windowObject, Intl, console });
  return windowObject.BackloggdI18nLocales.ru;
}

const locale = loadLocale();
const entries = Object.entries(locale.strings);

test('dictionary is not empty', () => {
  assert.ok(entries.length > 150, `expected a substantial dictionary, got ${entries.length}`);
});

test('every key is a complete, clean source string', () => {
  for (const [key, value] of entries) {
    assert.equal(typeof value, 'string', `value for ${key}`);
    assert.ok(value.trim().length > 0, `empty translation for ${key}`);
    assert.equal(key, key.replace(/\s+/g, ' ').trim(), `non-normalized key: ${JSON.stringify(key)}`);
    assert.doesNotMatch(key, /[\u0400-\u04FF]/, `Cyrillic inside source key: ${JSON.stringify(key)}`);
    assert.doesNotMatch(value, /\bundefined\b/, `placeholder in value for ${key}`);
  }
});

test('no duplicate source keys', () => {
  const seen = new Set();
  for (const [key] of entries) {
    assert.ok(!seen.has(key), `duplicate key ${JSON.stringify(key)}`);
    seen.add(key);
  }
});

test('no duplicate keys in the source object literal', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'locales', 'ru.js'), 'utf8');
  const start = source.indexOf('const strings = {');
  const end = source.indexOf('\n  };', start);
  assert.ok(start >= 0 && end > start, 'strings object not found');
  const block = source.slice(start, end);
  const keys = [...block.matchAll(/^\s{4}(["'])(.+?)\1\s*:/gm)].map((match) => match[2]);
  assert.ok(keys.length > 100, `unexpected key count ${keys.length}`);
  const unique = new Set(keys);
  assert.equal(unique.size, keys.length, 'duplicate literal key');
});

test('no leftover v1 fragment or round-trip keys', () => {
  const forbidden = [
    'on', // handled only by the review-card context
    'On', // handled only by the review-card context / settings context
    'Favorite Игры',
    'Personal Оценки',
    'Recently Оценено',
    'Last Сыграно',
    'User Оценка',
    'Fade Сыграно',
  ];
  for (const key of forbidden) {
    assert.ok(!Object.hasOwn(locale.strings, key), `unexpected key ${JSON.stringify(key)}`);
  }
});

test('patterns are anchored to the whole string', () => {
  for (const pattern of locale.patterns) {
    assert.ok(pattern.re.source.startsWith('^'), `pattern must start with ^: ${pattern.re}`);
    assert.ok(pattern.re.source.endsWith('$'), `pattern must end with $: ${pattern.re}`);
  }
});

test('context selectors are non-empty and mapped', () => {
  for (const context of locale.contexts) {
    assert.ok(context.selector && context.map && Object.keys(context.map).length > 0, context.selector);
  }
});
