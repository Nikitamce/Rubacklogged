(() => {
  'use strict';

  const elements = {
    toggle: document.getElementById('toggle-enabled'),
    dot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    hint: document.getElementById('hint'),
    btnRu: document.getElementById('btn-lang-ru'),
    btnEn: document.getElementById('btn-lang-en'),
    stats: document.getElementById('stats'),
    translated: document.getElementById('translated-count'),
    rescan: document.getElementById('rescan'),
    version: document.querySelector('.version'),
  };

  let state = { language: 'ru', enabled: true };
  let tabId = null;
  let tabUrl = '';
  let status = null;

  function sanitize(value) {
    return {
      language: value && value.language === 'en' ? 'en' : 'ru',
      enabled: !(value && value.enabled === false),
    };
  }

  function pluralFragments(count) {
    const category = new Intl.PluralRules('ru-RU').select(count);
    if (category === 'one') return 'фрагмент';
    if (category === 'few') return 'фрагмента';
    return 'фрагментов';
  }

  function storageGet() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get({ language: 'ru', enabled: true }, (items) => {
          resolve(items || { language: 'ru', enabled: true });
        });
      } catch (error) {
        resolve({ language: 'ru', enabled: true });
      }
    });
  }

  function storageSet() {
    try {
      chrome.storage.sync.set({ language: state.language, enabled: state.enabled });
    } catch (error) {
      // Ignore storage failures: the content script also accepts a direct message.
    }
  }

  function queryActiveTab() {
    return new Promise((resolve) => {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          resolve(tabs && tabs[0] ? tabs[0] : null);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  function send(message) {
    return new Promise((resolve) => {
      if (tabId === null) {
        resolve(null);
        return;
      }
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(response || null);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  function isBackloggdPage() {
    if (!tabUrl) return true; // URL is hidden for non-host pages; try anyway.
    return /^https?:\/\/(www\.)?backloggd\.com\//i.test(tabUrl);
  }

  function render() {
    const active = state.enabled && state.language === 'ru';
    const onSite = isBackloggdPage();

    elements.toggle.checked = state.enabled;
    elements.btnRu.classList.toggle('active', state.language === 'ru');
    elements.btnEn.classList.toggle('active', state.language === 'en');
    elements.dot.classList.toggle('active', !!status && status.active);

    let text;
    let hint = false;

    if (!onSite) {
      text = 'Откройте backloggd.com';
    } else if (!state.enabled) {
      text = 'Перевод отключён';
    } else if (state.language === 'en') {
      text = 'Оригинальный английский';
    } else if (!status) {
      text = 'Обновите страницу Backloggd';
      hint = true;
    } else if (!status.active) {
      text = 'Перевод не запустился — обновите страницу';
      hint = true;
    } else {
      const count = status.translated || 0;
      text = count > 0
        ? `Перевод активен · ${count} ${pluralFragments(count)}`
        : 'Перевод активен';
    }

    elements.statusText.textContent = text;
    elements.hint.hidden = !hint;

    const showStats = onSite && active && status && status.translated > 0;
    elements.stats.hidden = !showStats;
    if (showStats) {
      elements.translated.textContent = String(status.translated);
    }

    elements.toggle.disabled = !onSite;
    elements.btnRu.disabled = !onSite;
    elements.btnEn.disabled = !onSite;
    elements.rescan.disabled = !onSite;
  }

  async function applyAndSync() {
    storageSet();
    render();

    const response = await send({
      type: 'setSettings',
      settings: { language: state.language, enabled: state.enabled },
    });
    status = response;
    render();
  }

  async function refreshStatus() {
    status = await send({ type: 'getStatus' });
    render();
  }

  async function init() {
    state = sanitize(await storageGet());

    const tab = await queryActiveTab();
    if (tab) {
      tabId = typeof tab.id === 'number' ? tab.id : null;
      tabUrl = tab.url || '';
    }

    if (elements.version) {
      try {
        elements.version.textContent = 'v' + chrome.runtime.getManifest().version;
      } catch (error) {
        // Keep the static version.
      }
    }

    render();
    if (isBackloggdPage() && tabId !== null) await refreshStatus();
    render();
  }

  elements.toggle.addEventListener('change', () => {
    state.enabled = elements.toggle.checked;
    applyAndSync();
  });

  elements.btnRu.addEventListener('click', () => {
    state.language = 'ru';
    state.enabled = true;
    applyAndSync();
  });

  elements.btnEn.addEventListener('click', () => {
    state.language = 'en';
    applyAndSync();
  });

  elements.rescan.addEventListener('click', async () => {
    const response = await send({ type: 'rescan' });
    status = response || null;
    render();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
