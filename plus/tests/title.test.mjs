import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeTitle,
  pickSteamSearchItem,
  scoreSteamTitleMatch,
} from '../src/utils/title.js';

test('title matching normalizes roman numerals and punctuation', () => {
  assert.equal(normalizeTitle("Baldur's Gate III"), normalizeTitle('Baldur s Gate 3'));
  assert.ok(scoreSteamTitleMatch("Baldur's Gate III", 'Baldur s Gate 3') >= 80);
});

test('Steam search rejects a spin-off when searching for the base game', () => {
  const picked = pickSteamSearchItem([
    { id: 1672970, name: 'Minecraft Dungeons' },
  ], 'Minecraft');
  assert.equal(picked, null);
});

test('Steam search accepts an exact match', () => {
  const picked = pickSteamSearchItem([{ id: 1245620, type: 'app', name: 'ELDEN RING' }], 'Elden Ring');
  assert.equal(picked.id, 1245620);
});
