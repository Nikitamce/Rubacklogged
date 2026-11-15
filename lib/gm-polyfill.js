(function() {
  'use strict';

  let openCriticApiKey = '';
  const hasRuntime = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;

  if (hasRuntime) {
    try {
      const stored = localStorage.getItem('blp_settings');
      if (stored) {
        const settings = JSON.parse(stored);
        if (settings && settings.openCriticApiKey) {
          openCriticApiKey = String(settings.openCriticApiKey);
          delete settings.openCriticApiKey;
          localStorage.setItem('blp_settings', JSON.stringify(settings));
          chrome.runtime.sendMessage({ type: 'blp_secret_set', value: openCriticApiKey });
        }
      }
      chrome.runtime.sendMessage({ type: 'blp_secret_get' }, (response) => {
        if (!chrome.runtime.lastError && response && typeof response.value === 'string') {
          openCriticApiKey = response.value;
        }
      });
    } catch (_) {}
  }

  if (typeof window.GM_addStyle === 'undefined') {
    window.GM_addStyle = function(css) {
      const style = document.createElement('style');
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
      return style;
    };
  }

  if (typeof window.GM_getValue === 'undefined') {
    window.GM_getValue = function(key, defaultValue) {
      try {
        const item = localStorage.getItem('blp_' + key);
        const value = item !== null ? JSON.parse(item) : defaultValue;
        if (key === 'settings' && value && typeof value === 'object') {
          return { ...value, openCriticApiKey };
        }
        return value;
      } catch (_) {
        return defaultValue;
      }
    };
  }

  if (typeof window.GM_setValue === 'undefined') {
    window.GM_setValue = function(key, value) {
      try {
        let stored = value;
        if (key === 'settings' && value && typeof value === 'object') {
          openCriticApiKey = String(value.openCriticApiKey || '');
          stored = { ...value };
          delete stored.openCriticApiKey;
          if (hasRuntime) chrome.runtime.sendMessage({ type: 'blp_secret_set', value: openCriticApiKey });
        }
        localStorage.setItem('blp_' + key, JSON.stringify(stored));
      } catch (error) {
        console.error('GM_setValue error:', error);
      }
    };
  }

  if (typeof window.GM_registerMenuCommand === 'undefined') {
    window.GM_registerMenuCommand = function() {};
  }

  if (typeof window.GM_addValueChangeListener === 'undefined') {
    window.GM_addValueChangeListener = function(key, callback) {
      window.addEventListener('storage', (event) => {
        if (event.key === 'blp_' + key) {
          try {
            callback(key, JSON.parse(event.oldValue), JSON.parse(event.newValue), false);
          } catch (_) {}
        }
      });
    };
  }

  function fallbackFetch(details) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), details.timeout || 20000);
    fetch(details.url, {
      method: details.method || 'GET',
      headers: details.headers || {},
      body: details.data,
      credentials: details.anonymous === true ? 'omit' : 'include',
      redirect: details.noRedirect === true ? 'error' : 'follow',
      signal: controller.signal,
    }).then(async (response) => {
      const text = await response.text();
      details.onload?.({
        status: response.status,
        statusText: response.statusText,
        responseText: text,
        responseHeaders: response.headers,
        response: text,
      });
    }).catch((error) => {
      if (error.name === 'AbortError') details.ontimeout?.(error);
      else details.onerror?.(error);
    }).finally(() => clearTimeout(timer));
  }

  if (typeof window.GM_xmlhttpRequest === 'undefined') {
    window.GM_xmlhttpRequest = function(details) {
      if (hasRuntime) {
        chrome.runtime.sendMessage({
          type: 'blp_xhr',
          details: {
            url: details.url,
            method: details.method || 'GET',
            headers: details.headers || {},
            data: details.data,
            timeout: details.timeout || 20000,
            anonymous: details.anonymous,
            noRedirect: details.noRedirect,
          },
        }, (response) => {
          if (chrome.runtime.lastError || !response) {
            fallbackFetch(details);
            return;
          }
          if (!response.success) {
            if (response.timedOut) details.ontimeout?.(new Error(response.error));
            else details.onerror?.(new Error(response.error || 'Network error'));
            return;
          }
          details.onload?.({
            status: response.status,
            statusText: response.statusText,
            responseText: response.responseText,
            responseHeaders: response.responseHeaders,
            response: response.responseText,
          });
        });
        return;
      }
      fallbackFetch(details);
    };
  }
})();
