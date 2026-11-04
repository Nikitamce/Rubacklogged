'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { createEnvironment, element, text } = require('./dom-stub');

function runScript(file, sandbox) {
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: file });
}

test('defaults to English/off when browser language is not Russian', async () => {
  const env = createEnvironment();
  // Override navigator to English
  env.sandbox.navigator = {
    language: 'en-US',
    languages: ['en-US', 'en'],
  };

  runScript('lib/engine.js', { window: env.windowObject, Intl, console });
  runScript('locales/ru.js', { window: env.windowObject, Intl, console });

  const nav = element(
    'nav',
    { id: 'primary-nav' },
    element('a', { className: 'nav-link' }, text('Games'))
  );
  const body = element('body', {}, nav);
  env.document.documentElement.appendChild(body);
  env.document._body = body;

  runScript('content.js', env.sandbox);

  // In English locale, translation engine should NOT be active by default
  const navLink = env.document.body.querySelector('.nav-link');
  assert.equal(navLink.textContent, 'Games');
});

test('defaults to Russian/on when browser language is Russian', async () => {
  const env = createEnvironment();
  // Default in dom-stub is ru-RU
  runScript('lib/engine.js', { window: env.windowObject, Intl, console });
  runScript('locales/ru.js', { window: env.windowObject, Intl, console });

  const nav = element(
    'nav',
    { id: 'primary-nav' },
    element('a', { className: 'nav-link' }, text('Games'))
  );
  const body = element('body', {}, nav);
  env.document.documentElement.appendChild(body);
  env.document._body = body;

  runScript('content.js', env.sandbox);

  // In Russian locale, translation engine should be active by default
  const navLink = env.document.body.querySelector('.nav-link');
  assert.equal(navLink.textContent, 'Игры');
});
