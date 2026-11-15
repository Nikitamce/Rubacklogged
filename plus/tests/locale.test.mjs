import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const window = {};
vm.runInNewContext(readFileSync(new URL('../../locales/ru.js', import.meta.url), 'utf8'), {
  window, Intl, console,
});
const canonical = window.BackloggdI18nLocales.ru.strings;
const bundled = JSON.parse(readFileSync(new URL('../src/i18n/site/ru.json', import.meta.url), 'utf8'));

test('Plus Russian dictionary exactly matches the canonical locale', () => {
  assert.deepEqual(bundled, JSON.parse(JSON.stringify(canonical)));
});
