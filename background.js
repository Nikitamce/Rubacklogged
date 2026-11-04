/**
 * Background Service Worker for Backloggd Extension.
 * Handles cross-origin network requests that content scripts cannot make
 * due to web page CORS restrictions (e.g. ProtonDB, HowLongToBeat, OpenCritic, Steam, GameStatus).
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'blp_xhr') return false;

  const { details } = message;
  const { url, method = 'GET', headers = {}, data } = details;

  fetch(url, {
    method,
    headers,
    body: (method !== 'GET' && method !== 'HEAD') ? data : undefined,
  })
    .then(async (response) => {
      const text = await response.text();
      // Extract headers as a record or raw string
      const responseHeaders = {};
      try {
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
      } catch (_) {}

      sendResponse({
        success: true,
        status: response.status,
        statusText: response.statusText,
        responseText: text,
        responseHeaders,
      });
    })
    .catch((error) => {
      sendResponse({
        success: false,
        error: error ? error.message : 'Network error',
      });
    });

  // Keep message channel open for async response
  return true;
});
