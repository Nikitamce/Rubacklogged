'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadPolyfill(initial = {}) {
  const data = new Map(Object.entries(initial));
  const messages = [];
  const localStorage = {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
  };
  const window = { addEventListener() {} };
  const chrome = {
    runtime: {
      sendMessage(message, callback) {
        messages.push(message);
        if (message.type === 'blp_secret_get') callback({ value: 'protected' });
      },
      lastError: null,
    },
  };
  vm.runInNewContext(fs.readFileSync('lib/gm-polyfill.js', 'utf8'), {
    window, localStorage, chrome, console, document: {}, AbortController, fetch: async () => {}, setTimeout, clearTimeout,
  });
  return { window, data, messages };
}

test('polyfill migrates the API key out of site localStorage', () => {
  const env = loadPolyfill({ blp_settings: JSON.stringify({ openCriticApiKey: 'legacy', showSteam: true }) });
  const settings = env.window.GM_getValue('settings', {});
  assert.equal(settings.openCriticApiKey, 'protected');
  assert.equal(JSON.parse(env.data.get('blp_settings')).openCriticApiKey, undefined);
  assert.ok(env.messages.some((message) => message.type === 'blp_secret_set' && message.value === 'legacy'));
});

test('polyfill stores only public settings in localStorage', () => {
  const env = loadPolyfill();
  env.window.GM_setValue('settings', { openCriticApiKey: 'new-secret', showSteam: false });
  const stored = JSON.parse(env.data.get('blp_settings'));
  assert.deepEqual(stored, { showSteam: false });
  assert.equal(env.messages.at(-1).value, 'new-secret');
});

test('polyfill forwards request timeout and anonymity', () => {
  const env = loadPolyfill();
  env.window.GM_xmlhttpRequest({
    url: 'https://api.opencritic.com/api/game/search', timeout: 15000, anonymous: true,
  });
  const request = env.messages.at(-1);
  assert.equal(request.details.timeout, 15000);
  assert.equal(request.details.anonymous, true);
});
