const DEFAULT_SETTINGS = {
  showGameQuill: true,
  gqTheme: 'panax-dark',
  steamCountry: 'KZ',
};

let currentSettings = { ...DEFAULT_SETTINGS };

function readPlusSteamCountry() {
  try {
    const raw = localStorage.getItem('blp_settings');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    const cc = parsed && typeof parsed.steamCountry === 'string' ? parsed.steamCountry.toUpperCase() : '';
    return /^[A-Z]{2}$/.test(cc) ? cc : '';
  } catch {
    return '';
  }
}

export function getSettings() {
  const plusCc = readPlusSteamCountry();
  if (plusCc) return { ...currentSettings, steamCountry: plusCc };
  return currentSettings;
}

export function loadSettings() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
          currentSettings = { ...DEFAULT_SETTINGS, ...(stored || {}) };
          resolve(getSettings());
        });
        return;
      }
    } catch {
      // Ignore storage errors and fall back to defaults.
    }
    resolve(getSettings());
  });
}

export function bindSettingsUpdates(onChange) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        let updated = false;
        if (changes.showGameQuill) {
          currentSettings.showGameQuill = changes.showGameQuill.newValue !== false;
          updated = true;
        }
        if (changes.gqTheme) {
          currentSettings.gqTheme = changes.gqTheme.newValue || DEFAULT_SETTINGS.gqTheme;
          updated = true;
        }
        if (changes.steamCountry) {
          currentSettings.steamCountry = changes.steamCountry.newValue || DEFAULT_SETTINGS.steamCountry;
          updated = true;
        }
        if (updated && typeof onChange === 'function') onChange(getSettings(), changes);
      });
    }
  } catch {
    // Ignore listener errors.
  }
}
