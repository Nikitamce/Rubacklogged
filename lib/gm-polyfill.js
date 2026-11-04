/**
 * GM_* polyfill for Chrome Extension environment.
 * Maps GM_getValue, GM_setValue, GM_addStyle, GM_xmlhttpRequest
 * into standard Web / Chrome Extension APIs so that Userscripts can run
 * directly as a Chrome Extension content script.
 */
(function() {
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
        return item !== null ? JSON.parse(item) : defaultValue;
      } catch (e) {
        return defaultValue;
      }
    };
  }

  if (typeof window.GM_setValue === 'undefined') {
    window.GM_setValue = function(key, value) {
      try {
        localStorage.setItem('blp_' + key, JSON.stringify(value));
      } catch (e) {
        console.error('GM_setValue error:', e);
      }
    };
  }

  if (typeof window.GM_registerMenuCommand === 'undefined') {
    window.GM_registerMenuCommand = function(caption, callback) {
      // Chrome extension handles menu commands via popup or extension icon
    };
  }

  if (typeof window.GM_addValueChangeListener === 'undefined') {
    window.GM_addValueChangeListener = function(key, callback) {
      window.addEventListener('storage', (e) => {
        if (e.key === 'blp_' + key) {
          try {
            callback(key, JSON.parse(e.oldValue), JSON.parse(e.newValue), false);
          } catch (err) {}
        }
      });
    };
  }

  if (typeof window.GM_xmlhttpRequest === 'undefined') {
    window.GM_xmlhttpRequest = function(details) {
      const url = details.url;
      const method = details.method || 'GET';
      const headers = details.headers || {};
      
      fetch(url, {
        method,
        headers,
        body: details.data
      })
      .then(async response => {
        const text = await response.text();
        if (details.onload) {
          details.onload({
            status: response.status,
            statusText: response.statusText,
            responseText: text,
            responseHeaders: response.headers
          });
        }
      })
      .catch(error => {
        if (details.onerror) {
          details.onerror(error);
        }
      });
    };
  }
})();
