import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { encodeDoc, vsEncode, vsExtract, decodeCarrier } from '../src/shared/gq-payload.js';
import {
  buildImportUrlCandidates,
  detectReviewInputKind,
} from '../src/gamequill/review-importer.js';
import { FOOTER_TEXT, buildFallback } from '../src/shared/gq-fallback.js';
import {
  carrierKeyFromText,
  findReviewTextareas,
  looksLikePayloadText,
} from '../src/gamequill-content/detect.js';

test('manifest registers gamequill content script and web accessible resources', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const backloggdScript = manifest.content_scripts.find((cs) =>
    cs.matches.some((m) => m.includes('backloggd.com'))
  );
  assert.ok(backloggdScript, 'Backloggd content script entry exists');
  assert.ok(
    backloggdScript.js.includes('lib/gamequill-content.js'),
    'lib/gamequill-content.js is loaded on backloggd.com'
  );
  assert.ok(
    Array.isArray(manifest.web_accessible_resources) &&
      manifest.web_accessible_resources.some((r) =>
        r.resources.includes('gamequill/*') && r.resources.includes('fonts/*')
      ),
    'gamequill/* and fonts/* are web_accessible_resources'
  );
});

test('built GameQuill bundles exist', () => {
  assert.ok(fs.statSync('lib/gamequill-content.js').size > 1000);
  assert.ok(fs.statSync('gamequill/bridge.js').size > 1000);
});

test('GameQuill VS carrier roundtrip preserves review document in plain textarea text', async () => {
  const doc = {
    v: 1,
    title: 'Neon Requiem Review',
    game: 'Neon Requiem',
    score: 9,
    recommend: 'yes',
    aspects: [{ name: 'Сюжет', score: 9, unrated: 'unsure' }],
    pros: [{ text: 'Атмосфера' }],
    cons: [{ text: 'Оптимизация' }],
    blocks: [{ type: 'text', html: 'Отличная игра' }],
    integ: {},
    updatedAt: 1700000000000,
  };

  const fakeWin = {
    DOMParser: class {
      parseFromString(html) {
        const text = String(html || '').replace(/<[^>]+>/g, '');
        return {
          body: {
            childNodes: text ? [{ nodeType: 3, nodeValue: text }] : [],
            textContent: text,
          },
        };
      }
    },
  };

  const fb = buildFallback(doc, { win: fakeWin });
  doc.fp = fb.fp;
  const enc = await encodeDoc(doc);
  const vs = vsEncode(enc.bytes);
  const plainWithCarrier = `${fb.plain}${vs}`;

  assert.equal(looksLikePayloadText(plainWithCarrier), true);
  const key = carrierKeyFromText(plainWithCarrier);
  assert.ok(key.startsWith('vs:'));

  const extracted = vsExtract(plainWithCarrier);
  assert.ok(extracted);
  const decoded = await decodeCarrier({ kind: 'vs', bytes: extracted });
  assert.equal(decoded.title, doc.title);
  assert.equal(decoded.game, doc.game);
  assert.equal(decoded.score, doc.score);
  assert.equal(decoded.recommend, doc.recommend);
  assert.equal(decoded.pros[0].text, 'Атмосфера');
  assert.ok(plainWithCarrier.includes(FOOTER_TEXT));
});

test('findReviewTextareas detects Backloggd review textarea', () => {
  const ta = { id: 'review', name: 'review' };
  const fakeRoot = {
    querySelectorAll(selector) {
      assert.match(selector, /textarea\[name="review"\]/);
      return [ta];
    },
  };
  assert.deepEqual(findReviewTextareas(fakeRoot), [ta]);
});

test('review importer builds StopGame/Steam URL candidates and detects input kinds', () => {
  const sg = buildImportUrlCandidates('https://stopgame.ru/game/control/review/12345');
  assert.ok(sg.some((u) => u.includes('stopgame.ru/game/control/review/12345')));
  const st = buildImportUrlCandidates('https://steamcommunity.com/id/test/recommended/3159330');
  assert.ok(st.some((u) => u.includes('steamcommunity.com/id/test/recommended/3159330')));

  assert.equal(detectReviewInputKind('[h1]Control[/h1]\n[b]Great game[/b]'), 'bbcode');
});
