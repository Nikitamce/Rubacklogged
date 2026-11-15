import { settings, t } from '../state.js';

const BUTTON_ID = 'blp-export-collection';

export function collectVisibleGames(root = document) {
  const games = new Map();
  for (const link of root.querySelectorAll('a[href*="/games/"]')) {
    let url;
    try { url = new URL(link.href, location.origin); } catch (_) { continue; }
    const match = url.pathname.match(/^\/games\/([^/]+)\/?$/);
    if (!match) continue;
    const cover = link.closest('.game-cover') || link;
    const image = cover.querySelector('img');
    const title = String(image?.alt || link.getAttribute('aria-label') || link.textContent || match[1])
      .replace(/\s+/g, ' ')
      .trim();
    games.set(match[1], { title, slug: match[1], url: url.href });
  }
  return [...games.values()];
}

function download(games) {
  const blob = new Blob([JSON.stringify({
    kind: 'backloggd-plus-visible-collection',
    version: 1,
    exportedAt: new Date().toISOString(),
    page: location.href,
    games,
  }, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'backloggd-visible-collection.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ensureCollectionExport() {
  const existing = document.getElementById(BUTTON_ID);
  if (!settings.showExport || !document.body || getPageGame()) {
    existing?.remove();
    return;
  }
  const games = collectVisibleGames();
  if (games.length < 2) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.textContent = `${t.exportButton} (${games.length})`;
    return;
  }
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.className = 'btn btn-main blp-export-collection';
  button.textContent = `${t.exportButton} (${games.length})`;
  button.title = t.exportFormatJson;
  button.addEventListener('click', () => download(collectVisibleGames()));
  document.body.appendChild(button);
}

function getPageGame() {
  return /^\/games\/[^/]+\/?$/.test(location.pathname);
}
