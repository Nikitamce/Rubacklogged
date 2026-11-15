'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadBackground({ fetchImpl, storedKey = '' } = {}) {
  let listener;
  const localData = { openCriticApiKey: storedKey };
  const chrome = {
    runtime: { id: 'extension-id', onMessage: { addListener: (fn) => { listener = fn; } } },
    storage: {
      local: {
        get: (key, callback) => callback({ [key]: localData[key] }),
        set: (values, callback) => { Object.assign(localData, values); callback(); },
      },
    },
  };
  const context = {
    chrome,
    URL,
    fetch: fetchImpl || (async () => ({
      status: 200,
      statusText: 'OK',
      headers: { get: () => null, forEach: () => {} },
      text: async () => '{}',
    })),
    setTimeout,
    clearTimeout,
    AbortController,
  };
  vm.runInNewContext(fs.readFileSync('background.js', 'utf8'), context);
  return {
    localData,
    send(message) {
      return new Promise((resolve) => listener(message, { id: 'extension-id' }, resolve));
    },
  };
}

test('background rejects unapproved destinations', async () => {
  let called = false;
  const worker = loadBackground({ fetchImpl: async () => { called = true; } });
  const result = await worker.send({
    type: 'blp_xhr', details: { url: 'https://example.com/private' },
  });
  assert.equal(result.success, false);
  assert.match(result.error, /not allowed/);
  assert.equal(called, false);
});

test('background sends session cookies and injects the protected API key', async () => {
  let options;
  let headers;
  const worker = loadBackground({
    storedKey: 'secret-key',
    fetchImpl: async (_url, init) => {
      options = init;
      headers = init.headers;
      return {
        status: 200, statusText: 'OK',
        headers: { get: () => null, forEach: () => {} }, text: async () => '{}',
      };
    },
  });
  const result = await worker.send({
    type: 'blp_xhr',
    details: { url: 'https://opencritic-api.p.rapidapi.com/game/search', headers: {} },
  });
  assert.equal(result.success, true);
  assert.equal(options.credentials, 'include');
  assert.equal(headers['X-RapidAPI-Key'], 'secret-key');
});

test('background omits cookies for anonymous translation requests', async () => {
  let options;
  const worker = loadBackground({
    fetchImpl: async (_url, init) => {
      options = init;
      return {
        status: 200, statusText: 'OK',
        headers: { get: () => null, forEach: () => {} }, text: async () => '{}',
      };
    },
  });
  const result = await worker.send({
    type: 'blp_xhr',
    details: {
      url: 'https://translate.googleapis.com/translate_a/single?client=gtx',
      anonymous: true,
    },
  });
  assert.equal(result.success, true);
  assert.equal(options.credentials, 'omit');
});

test('background keeps API keys out of web storage messages', async () => {
  const worker = loadBackground();
  const result = await worker.send({ type: 'blp_secret_set', value: ' key with spaces ' });
  assert.equal(result.success, true);
  assert.equal(worker.localData.openCriticApiKey, 'keywithspaces');
});
