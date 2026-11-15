import { settings, t } from '../state.js';

const entries = [];
let bound = false;

export function recordNetworkDiagnostic(url, status, error = '') {
  let host = '';
  try { host = new URL(url).hostname; } catch (_) { return; }
  entries.push({ at: new Date(), host, status, error: String(error || '') });
  if (entries.length > 50) entries.shift();
  if (settings.debugMode) paintDiagnostics();
}

function paintDiagnostics() {
  const list = document.querySelector('[data-blp-network-diagnostics]');
  if (!list) return;
  list.replaceChildren();
  for (const entry of entries.slice().reverse()) {
    const row = document.createElement('li');
    row.textContent = `${entry.at.toLocaleTimeString()} · ${entry.host} · ${entry.status}${entry.error ? ` · ${entry.error}` : ''}`;
    list.appendChild(row);
  }
}

export function ensureDiagnostics() {
  const existing = document.getElementById('blp-network-diagnostics');
  if (!settings.debugMode || !document.body) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const button = document.createElement('button');
  button.id = 'blp-network-diagnostics';
  button.type = 'button';
  button.className = 'blp-diagnostics-button';
  button.textContent = t.debugPanelTitle;
  button.setAttribute('aria-haspopup', 'dialog');
  button.addEventListener('click', () => {
    const backdrop = document.createElement('div');
    backdrop.className = 'blp-settings-backdrop is-open';
    const dialog = document.createElement('section');
    dialog.className = 'blp-settings blp-diagnostics';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', t.debugPanelTitle);
    const title = document.createElement('h2');
    title.textContent = t.debugPanelTitle;
    const list = document.createElement('ol');
    list.dataset.blpNetworkDiagnostics = '';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-main';
    close.textContent = '×';
    close.setAttribute('aria-label', t.close);
    close.addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) backdrop.remove(); });
    dialog.append(title, list, close);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    paintDiagnostics();
  });
  document.body.appendChild(button);
  if (!bound) {
    bound = true;
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') document.querySelector('.blp-diagnostics')?.parentElement?.remove();
    });
  }
}
