const ALLOWED_HOSTS = new Set([
  'backloggd.com', 'www.backloggd.com',
  'store.steampowered.com', 'api.steampowered.com', 'steamcommunity.com',
  'steamdb.info', 'howlongtobeat.com', 'www.howlongtobeat.com',
  'protondb.com', 'www.protondb.com', 'api.opencritic.com', 'opencritic.com',
  'www.opencritic.com', 'gamestatus.info', 'www.gamestatus.info',
  'pcgamingwiki.com', 'www.pcgamingwiki.com', 'isthereanydeal.com',
  'www.isthereanydeal.com', 'api.isthereanydeal.com', 'steamcharts.com', 'www.steamcharts.com',
  'api.augmentedsteam.com', 'gameslike.co', 'www.gameslike.co', 'gogdb.org',
  'www.gogdb.org', 'cdn.jsdelivr.net', 'latest.currency-api.pages.dev',
  'translate.googleapis.com', 'api.mymemory.translated.net', 'metacritic.com', 'www.metacritic.com',
  'html.duckduckgo.com', 'opencritic-api.p.rapidapi.com',
]);

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20000;

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (items) => resolve(items && items[key]));
  });
}

async function handleRequest(details) {
  const url = new URL(details.url);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error('Request destination is not allowed');
  }

  const method = String(details.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'HEAD'].includes(method)) throw new Error('Request method is not allowed');

  const headers = { ...(details.headers || {}) };
  if (url.hostname === 'opencritic-api.p.rapidapi.com' && !headers['X-RapidAPI-Key']) {
    const apiKey = await storageGet('openCriticApiKey');
    if (apiKey) headers['X-RapidAPI-Key'] = apiKey;
  }

  const controller = new AbortController();
  const timeout = Math.max(1000, Math.min(Number(details.timeout) || DEFAULT_TIMEOUT_MS, 60000));
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url.href, {
      method,
      headers,
      body: method !== 'GET' && method !== 'HEAD' ? details.data : undefined,
      credentials: details.anonymous === true ? 'omit' : 'include',
      redirect: details.noRedirect === true ? 'error' : 'follow',
      signal: controller.signal,
    });
    const length = Number(response.headers.get('content-length'));
    if (length > MAX_RESPONSE_BYTES) throw new Error('Response is too large');
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error('Response is too large');
    const responseHeaders = {};
    response.headers.forEach((value, key) => { responseHeaders[key] = value; });
    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      responseText: text,
      responseHeaders,
    };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return false;

  if (message.type === 'blp_secret_get') {
    storageGet('openCriticApiKey').then((value) => sendResponse({ value: value || '' }));
    return true;
  }
  if (message.type === 'blp_secret_set') {
    const value = String(message.value || '').replace(/\s+/g, '').slice(0, 200);
    chrome.storage.local.set({ openCriticApiKey: value }, () => {
      sendResponse({ success: !chrome.runtime.lastError });
    });
    return true;
  }
  if (message.type !== 'blp_xhr' || !message.details) return false;

  handleRequest(message.details)
    .then(sendResponse)
    .catch((error) => sendResponse({
      success: false,
      error: error && error.name === 'AbortError' ? 'Timeout' : (error?.message || 'Network error'),
      timedOut: error && error.name === 'AbortError',
    }));
  return true;
});
