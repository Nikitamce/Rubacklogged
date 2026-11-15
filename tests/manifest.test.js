'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const loader = fs.readFileSync('lib/systemjs-loader.js', 'utf8');

test('every Plus content script loads the SystemJS compatibility loader first', () => {
  for (const script of manifest.content_scripts) {
    if (!script.js.includes('lib/plus-bundle.js')) continue;
    const loaderIndex = script.js.indexOf('lib/systemjs-loader.js');
    const bundleIndex = script.js.indexOf('lib/plus-bundle.js');
    assert.ok(loaderIndex >= 0, `missing SystemJS loader in ${script.matches.join(', ')}`);
    assert.ok(loaderIndex < bundleIndex, 'SystemJS loader must run before Plus');
  }
});

test('SystemJS loader contains the named-register extension', () => {
  assert.match(loader, /System\.register/);
  assert.match(loader, /getRegister/);
});
