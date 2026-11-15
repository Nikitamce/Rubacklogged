(() => {
  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\gamequill-content\settings.js
  var DEFAULT_SETTINGS = {
    showGameQuill: true,
    gqTheme: "panax-dark",
    steamCountry: "KZ"
  };
  var currentSettings = { ...DEFAULT_SETTINGS };
  function readPlusSteamCountry() {
    try {
      const raw = localStorage.getItem("blp_settings");
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      const cc = parsed && typeof parsed.steamCountry === "string" ? parsed.steamCountry.toUpperCase() : "";
      return /^[A-Z]{2}$/.test(cc) ? cc : "";
    } catch {
      return "";
    }
  }
  function getSettings() {
    const plusCc = readPlusSteamCountry();
    if (plusCc) return { ...currentSettings, steamCountry: plusCc };
    return currentSettings;
  }
  function loadSettings() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
            currentSettings = { ...DEFAULT_SETTINGS, ...stored || {} };
            resolve(getSettings());
          });
          return;
        }
      } catch {
      }
      resolve(getSettings());
    });
  }
  function bindSettingsUpdates(onChange) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== "local") return;
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
          if (updated && typeof onChange === "function") onChange(getSettings(), changes);
        });
      }
    } catch {
    }
  }

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\shared\gq-hash.js
  var CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
    }
    let crc = 4294967295;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
    return (crc ^ 4294967295) >>> 0;
  }
  function fnv1a(str2) {
    let h2 = 2166136261;
    for (let i = 0; i < str2.length; i++) {
      h2 ^= str2.charCodeAt(i);
      h2 = Math.imul(h2, 16777619) >>> 0;
    }
    return h2.toString(16).padStart(8, "0");
  }
  var URLISH = /^[(\[]?(?:[a-z][a-z0-9+.-]*:\/\/\S*|[\w-]+(?:\.[\w-]+)+(?:[/?#]\S*)?)[)\].,;:!?]*$/i;
  function fingerprintText(text) {
    const tokens = String(text || "").replace(/[\uFE00-\uFE0F]|\uDB40[\uDD00-\uDDEF]/g, "").toLowerCase().split(/\s+/).filter((t) => t && !URLISH.test(t));
    const letters = (tokens.join(" ").match(new RegExp("\\p{L}+", "gu")) || []).join("");
    return { len: letters.length, h: fnv1a(letters) };
  }

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\shared\gq-payload.js
  var PREFIX = "GQ1.";
  var MAX_COMPRESSED = 48 * 1024;
  var MAX_RAW = 400 * 1024;
  var GQError = class extends Error {
    constructor(code, message) {
      super(message || code);
      this.code = code;
    }
  };
  var te = new TextEncoder();
  var td = new TextDecoder("utf-8", { fatal: true });
  async function streamBytes(readable, limit) {
    const reader = readable.getReader();
    const chunks = [];
    let total = 0;
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        try {
          await reader.cancel();
        } catch {
        }
        throw new GQError("too-large", "payload expands beyond limit");
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.byteLength;
    }
    return out;
  }
  async function inflate(bytes, limit = MAX_RAW) {
    const ds = new DecompressionStream("deflate-raw");
    const w = ds.writable.getWriter();
    w.write(bytes).catch(() => {
    });
    w.close().catch(() => {
    });
    try {
      return await streamBytes(ds.readable, limit);
    } catch (e) {
      if (e instanceof GQError) throw e;
      throw new GQError("corrupt", "inflate failed");
    }
  }
  function toB64url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromB64url(s) {
    if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new GQError("corrupt", "bad base64");
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    let bin;
    try {
      bin = atob(b64);
    } catch {
      throw new GQError("corrupt", "bad base64");
    }
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  var hex8 = (n) => (n >>> 0).toString(16).padStart(8, "0");
  async function parseJsonBytes(comp) {
    const raw = await inflate(comp);
    let json;
    try {
      json = JSON.parse(td.decode(raw));
    } catch {
      throw new GQError("corrupt", "bad json");
    }
    return json;
  }
  async function decodeText(text) {
    if (typeof text !== "string" || !text.startsWith(PREFIX)) throw new GQError("not-gq", "no prefix");
    if (text.length > MAX_COMPRESSED * 1.4 + 32) throw new GQError("too-large", "carrier too long");
    const m = /^GQ1\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(text);
    if (!m) throw new GQError("corrupt", "bad shape");
    const comp = fromB64url(m[1]);
    if (hex8(crc32(comp)) !== m[2]) throw new GQError("checksum", "crc mismatch");
    return parseJsonBytes(comp);
  }
  async function decodeBytes(bytes) {
    if (!bytes || bytes.length < 8 || bytes[0] !== 71 || bytes[1] !== 81) throw new GQError("not-gq", "no magic");
    if (bytes[2] !== 1) throw new GQError("version", "unsupported version");
    if (bytes.length - 7 > MAX_COMPRESSED) throw new GQError("too-large", "carrier too long");
    const crc = (bytes[3] << 24 | bytes[4] << 16 | bytes[5] << 8 | bytes[6]) >>> 0;
    const comp = bytes.subarray(7);
    if (crc32(comp) !== crc) throw new GQError("checksum", "crc mismatch");
    return parseJsonBytes(comp);
  }
  var VS_RUN = /(?:[\uFE00-\uFE0F]|\uDB40[\uDD00-\uDDEF]){16,}/g;
  function vsExtract(text) {
    if (typeof text !== "string" || text.length < 16) return null;
    const runs = text.match(VS_RUN);
    if (!runs) return null;
    for (const run of runs.sort((a, b) => b.length - a.length)) {
      const out = [];
      for (const ch of run) {
        const cp = ch.codePointAt(0);
        if (cp >= 65024 && cp <= 65039) out.push(cp - 65024);
        else if (cp >= 917760 && cp <= 917999) out.push(cp - 917760 + 16);
      }
      if (out[0] === 71 && out[1] === 81) return Uint8Array.from(out);
    }
    return null;
  }
  async function decodeCarrier(c) {
    if (!c) throw new GQError("not-gq", "no carrier");
    if (typeof c === "string") return decodeText(c);
    if (c.kind === "attr") return decodeText(c.text);
    if (c.kind === "vs") return decodeBytes(c.bytes);
    throw new GQError("not-gq", "unknown carrier");
  }

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\shared\gq-image.js
  var MAX_DATA_IMAGE = 40 * 1024;
  var MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
  var LOCAL_TARGET_BYTES = 28 * 1024;
  var PANAX_IMAGE_CDN = "https://d21t60rno19oyf.cloudfront.net";
  var UUID_RE = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  var PANAX_INPUT_RE = new RegExp("^/image/input/(" + UUID_RE + ")$");
  var PANAX_DERIV_RE = new RegExp("^/image/(large|medium|small)/(" + UUID_RE + ")\\.webp$", "i");
  var SIGNED_PARAM_RE = /^(AWSAccessKeyId|Signature|Expires|x-amz-security-token|X-Amz-Algorithm|X-Amz-Credential|X-Amz-Date|X-Amz-Expires|X-Amz-SignedHeaders|X-Amz-Signature|X-Amz-Security-Token|content-type|x-amz-meta-.+)$/i;
  var extraAllowedOrigins = [];
  var encodeUnsafe = (href) => href.replace(/['"()\\\s<>`]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
  var PRIVATE_HOST = /^(localhost|127\.0\.0\.1|::1|0\.0\.0\.0)$/i;
  var PRIVATE_IP = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/;
  function isPrivateHost(host2) {
    const h2 = String(host2 || "").toLowerCase();
    if (PRIVATE_HOST.test(h2) || h2.endsWith(".local") || h2.endsWith(".localhost")) return true;
    if (PRIVATE_IP.test(h2)) return true;
    return false;
  }
  function hasSignedQuery(urlOrSearch) {
    try {
      const u = typeof urlOrSearch === "string" && urlOrSearch.includes("://") ? new URL(urlOrSearch) : null;
      const params = u ? u.searchParams : new URLSearchParams(String(urlOrSearch || "").replace(/^\?/, ""));
      for (const k of params.keys()) if (SIGNED_PARAM_RE.test(k)) return true;
      return false;
    } catch {
      return /AWSAccessKeyId|X-Amz-Signature|x-amz-security-token|X-Amz-Security-Token/i.test(String(urlOrSearch || ""));
    }
  }
  function toPublicPanaxImageUrl(v, opts = {}) {
    try {
      const u = new URL(String(v || "").trim());
      const input = PANAX_INPUT_RE.exec(u.pathname);
      const deriv = PANAX_DERIV_RE.exec(u.pathname);
      if (!input && !deriv) return "";
      const path = input ? "/image/input/" + input[1].toLowerCase() : "/image/" + deriv[1].toLowerCase() + "/" + deriv[2].toLowerCase() + ".webp";
      if (isAllowedExtraOrigin(u)) return u.origin + path;
      if (opts.pageOrigin && originsEqual(u, opts.pageOrigin)) return u.origin + path;
      if (isPrivateHost(u.hostname)) return "";
      return PANAX_IMAGE_CDN + path;
    } catch {
      return "";
    }
  }
  function isAllowedExtraOrigin(u) {
    for (const o of extraAllowedOrigins) {
      try {
        const a = new URL(o);
        if (a.protocol === u.protocol && a.hostname === u.hostname && (a.port || defaultPort(a.protocol)) === (u.port || defaultPort(u.protocol))) return true;
      } catch {
      }
    }
    return false;
  }
  function defaultPort(proto) {
    return proto === "https:" ? "443" : proto === "http:" ? "80" : "";
  }
  function safeUserImageUrl(v, opts = {}) {
    const maxData = opts.maxData ?? MAX_DATA_IMAGE;
    if (v == null) return "";
    const raw = String(v).trim();
    if (!raw) return "";
    if (/^data:/i.test(raw)) {
      const compact = raw.replace(/\s+/g, "");
      const m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(compact);
      if (!m) return "";
      if (compact.length > maxData) return "";
      return compact;
    }
    const panax = toPublicPanaxImageUrl(raw);
    if (panax) return encodeUnsafe(panax);
    try {
      const u = new URL(raw);
      if (u.username || u.password) return "";
      if (u.protocol !== "https:" && u.protocol !== "http:") return "";
      if (hasSignedQuery(u)) {
        u.search = "";
        u.hash = "";
      }
      const extra = isAllowedExtraOrigin(u);
      if (isPrivateHost(u.hostname)) {
        if (!extra) return "";
      } else if (u.protocol === "http:") {
        u.protocol = "https:";
      } else if (u.protocol !== "https:") {
        return "";
      }
      if (u.href.length > 2048) return "";
      return encodeUnsafe(u.href);
    } catch {
      return "";
    }
  }
  function originsEqual(u, origin) {
    try {
      const o = new URL(origin);
      return o.protocol === u.protocol && o.hostname === u.hostname && (o.port || defaultPort(o.protocol)) === (u.port || defaultPort(u.protocol));
    } catch {
      return false;
    }
  }
  var MAX_GALLERY_ITEMS = 10;
  var CAPTION_MAX = 200;

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\shared\gq-cards.js
  var esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var safeUrl = (u) => {
    const s = String(u || "").trim();
    if (!s) return "#";
    if (s === "#" || s.startsWith("/")) return s;
    return /^https?:\/\//i.test(s) ? s : "#";
  };
  var EXTRA_VARIANTS = [
    {
      "id": "glm-paper",
      "cat": "numeric",
      "group": "GLM5 \xB7 \u041C\u0438\u043D\u0438\u043C\u0430\u043B",
      "name": "\u0411\u0443\u043C\u0430\u0436\u043D\u044B\u0439 \u043C\u0438\u043D\u0438\u043C\u0430\u043B (\u0447\u0438\u0441\u043B\u043E)"
    },
    {
      "id": "glm-dark",
      "cat": "numeric",
      "group": "GLM5 \xB7 \u041C\u0438\u043D\u0438\u043C\u0430\u043B",
      "name": "\u0422\u0451\u043C\u043D\u044B\u0439 \u043C\u0438\u043D\u0438\u043C\u0430\u043B (\u0447\u0438\u0441\u043B\u043E)"
    },
    {
      "id": "glm-swiss",
      "cat": "numeric",
      "group": "GLM5 \xB7 \u041F\u043E\u0441\u0442\u0435\u0440\u044B",
      "name": "\u0428\u0432\u0435\u0439\u0446\u0430\u0440\u0441\u043A\u0438\u0439 \u043F\u043E\u0441\u0442\u0435\u0440 (\u0447\u0438\u0441\u043B\u043E)"
    },
    {
      "id": "glm-editorial",
      "cat": "numeric",
      "group": "GLM5 \xB7 \u041F\u043E\u0441\u0442\u0435\u0440\u044B",
      "name": "\u0416\u0443\u0440\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u043E\u0441\u0442\u0435\u0440 (\u0447\u0438\u0441\u043B\u043E)"
    },
    {
      "id": "glm-vertical",
      "cat": "numeric",
      "group": "GLM5 \xB7 \u041F\u043E\u0441\u0442\u0435\u0440\u044B",
      "name": "\u0412\u0435\u0440\u0442\u0438\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u043E\u0441\u0442\u0435\u0440 (\u0447\u0438\u0441\u043B\u043E)"
    },
    {
      "id": "glm-crt",
      "cat": "numeric",
      "group": "GLM5 \xB7 \u0420\u0435\u0442\u0440\u043E",
      "name": "CRT-\u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B (\u0447\u0438\u0441\u043B\u043E)"
    },
    {
      "id": "glm-snes",
      "cat": "numeric",
      "group": "GLM5 \xB7 \u0420\u0435\u0442\u0440\u043E",
      "name": "SNES-\u043A\u0430\u0440\u0442\u0440\u0438\u0434\u0436 (\u0447\u0438\u0441\u043B\u043E)"
    },
    {
      "id": "glm-pixel",
      "cat": "numeric",
      "group": "GLM5 \xB7 \u0420\u0435\u0442\u0440\u043E",
      "name": "\u041F\u0438\u043A\u0441\u0435\u043B\u044C\u043D\u0430\u044F \u043D\u043E\u0447\u044C (\u0447\u0438\u0441\u043B\u043E)"
    },
    {
      "id": "glm-panax-paper",
      "cat": "panax",
      "group": "GLM5 \xB7 PANAX",
      "name": "\u0411\u0443\u043C\u0430\u0436\u043D\u044B\u0439 \u043C\u0438\u043D\u0438\u043C\u0430\u043B (PANAX)"
    },
    {
      "id": "glm-panax-dark",
      "cat": "panax",
      "group": "GLM5 \xB7 PANAX",
      "name": "\u0422\u0451\u043C\u043D\u044B\u0439 \u043C\u0438\u043D\u0438\u043C\u0430\u043B (PANAX)"
    },
    {
      "id": "glm-panax-swiss",
      "cat": "panax",
      "group": "GLM5 \xB7 PANAX",
      "name": "\u0428\u0432\u0435\u0439\u0446\u0430\u0440\u0441\u043A\u0438\u0439 \u043F\u043E\u0441\u0442\u0435\u0440 (PANAX)"
    },
    {
      "id": "glm-panax-editorial",
      "cat": "panax",
      "group": "GLM5 \xB7 PANAX",
      "name": "\u0416\u0443\u0440\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u043E\u0441\u0442\u0435\u0440 (PANAX)"
    },
    {
      "id": "glm-panax-vertical",
      "cat": "panax",
      "group": "GLM5 \xB7 PANAX",
      "name": "\u0412\u0435\u0440\u0442\u0438\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u043E\u0441\u0442\u0435\u0440 (PANAX)"
    },
    {
      "id": "glm-panax-crt",
      "cat": "panax",
      "group": "GLM5 \xB7 PANAX",
      "name": "CRT-\u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B (PANAX)"
    },
    {
      "id": "glm-panax-snes",
      "cat": "panax",
      "group": "GLM5 \xB7 PANAX",
      "name": "SNES-\u043A\u0430\u0440\u0442\u0440\u0438\u0434\u0436 (PANAX)"
    },
    {
      "id": "gpt-halo",
      "cat": "panax",
      "group": "GPT \xB7 PANAX",
      "name": "Halo (\u043A\u043E\u043B\u044C\u0446\u043E \u0440\u0435\u0430\u043A\u0446\u0438\u0439)"
    },
    {
      "id": "gpt-bars",
      "cat": "panax",
      "group": "GPT \xB7 PANAX",
      "name": "Bars (\u0441\u043F\u0435\u043A\u0442\u0440\u0430\u043B\u044C\u043D\u044B\u0435 \u043F\u043E\u043B\u043E\u0441\u044B)"
    },
    {
      "id": "gpt-poster",
      "cat": "panax",
      "group": "GPT \xB7 PANAX",
      "name": "Poster (\u043E\u0431\u043B\u043E\u0436\u043A\u0430 + \u0448\u043A\u0430\u043B\u0430)"
    },
    {
      "id": "gpt-ticket",
      "cat": "panax",
      "group": "GPT \xB7 PANAX",
      "name": "Ticket (\u0431\u0438\u043B\u0435\u0442 \u0441 \u043A\u043E\u0440\u0435\u0448\u043A\u043E\u043C)"
    },
    {
      "id": "gpt-editorial",
      "cat": "panax",
      "group": "GPT \xB7 PANAX",
      "name": "Editorial Pro (\u0440\u0435\u0434\u0430\u043A\u0446\u0438\u043E\u043D\u043D\u044B\u0439)"
    },
    {
      "id": "gpt-capsule",
      "cat": "panax",
      "group": "GPT \xB7 PANAX",
      "name": "Capsule (\u043A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u0430\u044F \u043A\u0430\u043F\u0441\u0443\u043B\u0430)"
    },
    {
      "id": "panax4-bars",
      "cat": "panax",
      "group": "PANAX \xB7 4 \u0432\u0430\u0440\u0438\u0430\u043D\u0442\u0430",
      "name": "\u0414\u043E\u043C\u0438\u043D\u0430\u043D\u0442\u0430 + \u043C\u0438\u043D\u0438-\u0441\u0442\u043E\u043B\u0431\u0438\u043A\u0438"
    },
    {
      "id": "panax4-medal",
      "cat": "panax",
      "group": "PANAX \xB7 4 \u0432\u0430\u0440\u0438\u0430\u043D\u0442\u0430",
      "name": "\u041C\u0435\u0434\u0430\u043B\u044C + \u0442\u043E\u043F-3 \u0441\u0442\u0440\u043E\u043A\u043E\u0439"
    },
    {
      "id": "panax4-gradient",
      "cat": "panax",
      "group": "PANAX \xB7 4 \u0432\u0430\u0440\u0438\u0430\u043D\u0442\u0430",
      "name": "\u0415\u0434\u0438\u043D\u0430\u044F \u0433\u0440\u0430\u0434\u0438\u0435\u043D\u0442\u043D\u0430\u044F \u043F\u043E\u043B\u043E\u0441\u0430"
    },
    {
      "id": "panax4-scale",
      "cat": "panax",
      "group": "PANAX \xB7 4 \u0432\u0430\u0440\u0438\u0430\u043D\u0442\u0430",
      "name": "\u0428\u043A\u0430\u043B\u0430 \u0441 \u043C\u0430\u0440\u043A\u0435\u0440\u043E\u043C"
    },
    {
      "id": "kimi-editorial",
      "cat": "numeric",
      "group": "Kimi \xB7 10 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u043E\u0432",
      "name": "\u0416\u0443\u0440\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u0432\u0440\u0435\u0437\u043A\u0430"
    },
    {
      "id": "kimi-swiss",
      "cat": "numeric",
      "group": "Kimi \xB7 10 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u043E\u0432",
      "name": "\u0428\u0432\u0435\u0439\u0446\u0430\u0440\u0441\u043A\u0430\u044F \u0441\u0435\u0442\u043A\u0430"
    },
    {
      "id": "kimi-terminal",
      "cat": "numeric",
      "group": "Kimi \xB7 10 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u043E\u0432",
      "name": "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B"
    },
    {
      "id": "kimi-ticket",
      "cat": "numeric",
      "group": "Kimi \xB7 10 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u043E\u0432",
      "name": "\u0411\u0438\u043B\u0435\u0442 \u0432 \u0438\u0433\u0440\u0443"
    },
    {
      "id": "kimi-cinema",
      "cat": "numeric",
      "group": "Kimi \xB7 10 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u043E\u0432",
      "name": "\u041A\u0438\u043D\u043E\u043A\u0430\u0434\u0440"
    },
    {
      "id": "kimi-inline",
      "cat": "numeric",
      "group": "Kimi \xB7 10 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u043E\u0432",
      "name": "\u041E\u0434\u043D\u043E\u0439 \u0441\u0442\u0440\u043E\u043A\u043E\u0439"
    },
    {
      "id": "kimi-brutal",
      "cat": "numeric",
      "group": "Kimi \xB7 10 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u043E\u0432",
      "name": "\u041D\u0435\u043E-\u0431\u0440\u0443\u0442\u0430\u043B\u0438\u0437\u043C"
    },
    {
      "id": "kimi-poster",
      "cat": "numeric",
      "group": "Kimi \xB7 10 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u043E\u0432",
      "name": "\u0421\u0438\u043D\u0438\u0439 \u043F\u043E\u0441\u0442\u0435\u0440"
    },
    {
      "id": "kimi-dock",
      "cat": "numeric",
      "group": "Kimi \xB7 10 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u043E\u0432",
      "name": "\u0420\u0435\u0439\u0442\u0438\u043D\u0433\u043E\u0432\u044B\u0439 \u0434\u043E\u043A"
    },
    {
      "id": "kimi-cartridge",
      "cat": "numeric",
      "group": "Kimi \xB7 10 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u043E\u0432",
      "name": "\u041A\u0430\u0440\u0442\u0440\u0438\u0434\u0436"
    },
    {
      "id": "son-spectrum",
      "cat": "panax",
      "group": "Sonnet \xB7 PANAX (10)",
      "name": "\u0421\u043F\u0435\u043A\u0442\u0440 (PANAX)"
    },
    {
      "id": "son-waffle",
      "cat": "panax",
      "group": "Sonnet \xB7 PANAX (10)",
      "name": "\u0412\u0430\u0444\u043B\u044F 10\xD710 (PANAX)"
    },
    {
      "id": "son-wave",
      "cat": "panax",
      "group": "Sonnet \xB7 PANAX (10)",
      "name": "\u0412\u043E\u043B\u043D\u0430 \u043E\u0446\u0435\u043D\u043E\u043A (PANAX)"
    },
    {
      "id": "son-bignum",
      "cat": "panax",
      "group": "Sonnet \xB7 PANAX (10)",
      "name": "\u0413\u0438\u0433\u0430\u043D\u0442\u0441\u043A\u0430\u044F \u0446\u0438\u0444\u0440\u0430 (PANAX)"
    },
    {
      "id": "son-mood",
      "cat": "panax",
      "group": "Sonnet \xB7 PANAX (10)",
      "name": "\u0428\u043A\u0430\u043B\u0430 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u0438\u044F (PANAX)"
    },
    {
      "id": "son-popart",
      "cat": "panax",
      "group": "Sonnet \xB7 PANAX (10)",
      "name": "\u041F\u043E\u043F-\u0430\u0440\u0442 (PANAX)"
    },
    {
      "id": "son-orbit",
      "cat": "panax",
      "group": "Sonnet \xB7 PANAX (10)",
      "name": "\u041E\u0440\u0431\u0438\u0442\u0430 (PANAX)"
    },
    {
      "id": "son-segments",
      "cat": "panax",
      "group": "Sonnet \xB7 PANAX (10)",
      "name": "\u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441-\u0441\u0435\u0433\u043C\u0435\u043D\u0442\u044B (PANAX)"
    },
    {
      "id": "son-podium",
      "cat": "panax",
      "group": "Sonnet \xB7 PANAX (10)",
      "name": "\u041F\u043E\u0434\u0438\u0443\u043C (PANAX)"
    },
    {
      "id": "son-tiles",
      "cat": "panax",
      "group": "Sonnet \xB7 PANAX (10)",
      "name": "\u041F\u043B\u0438\u0442\u043A\u0438 \u0440\u0435\u0430\u043A\u0446\u0438\u0439 (PANAX)"
    },
    {
      "id": "son-a",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "A \xB7 \u0421\u0442\u0435\u043A\u043B\u044F\u043D\u043D\u044B\u0439 \u043F\u043E\u0441\u0442\u0435\u0440"
    },
    {
      "id": "son-b",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "B \xB7 \u0420\u0435\u0434\u0430\u043A\u0442\u043E\u0440\u0441\u043A\u0430\u044F \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430"
    },
    {
      "id": "son-c",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "C \xB7 \u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B"
    },
    {
      "id": "son-d",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "D \xB7 \u041A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430"
    },
    {
      "id": "son-e",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "E \xB7 \u0421\u0442\u0440\u043E\u043A\u0430 \u0432 \u0442\u0435\u043A\u0441\u0442\u0435"
    },
    {
      "id": "son-f",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "F \xB7 \u041D\u0435\u043E-\u0431\u0440\u0443\u0442\u0430\u043B\u0438\u0437\u043C"
    },
    {
      "id": "son-g",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "G \xB7 \u041A\u0438\u043D\u043E\u0431\u0430\u043D\u043D\u0435\u0440"
    },
    {
      "id": "son-h",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "H \xB7 VHS-\u043A\u0430\u0441\u0441\u0435\u0442\u0430"
    },
    {
      "id": "son-i",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "I \xB7 \u041C\u0438\u043D\u0438\u043C\u0430\u043B + \u0431\u043E\u043B\u044C\u0448\u0430\u044F \u0446\u0438\u0444\u0440\u0430"
    },
    {
      "id": "son-j",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "J \xB7 \u041A\u0430\u043F\u0441\u0443\u043B\u0430 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430"
    },
    {
      "id": "son-k",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "K \xB7 \u0416\u0443\u0440\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u0440\u0430\u0437\u0432\u043E\u0440\u043E\u0442"
    },
    {
      "id": "son-l",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "L \xB7 \u041F\u043E\u043B\u0430\u0440\u043E\u0438\u0434"
    },
    {
      "id": "son-m",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "M \xB7 8-bit \u043F\u0438\u043A\u0441\u0435\u043B\u044C"
    },
    {
      "id": "son-n",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "N \xB7 \u0421\u0432\u0435\u0442\u043B\u044B\u0439 \u0433\u043B\u0430\u0441\u0441\u043C\u043E\u0440\u0444\u0438\u0437\u043C"
    },
    {
      "id": "son-o",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "O \xB7 \u041B\u0435\u043D\u0442\u0430 \u0432 \u0443\u0433\u043B\u0443"
    },
    {
      "id": "son-p",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "P \xB7 \u041A\u0440\u0443\u0433\u043E\u0432\u043E\u0439 \u0440\u0435\u0439\u0442\u0438\u043D\u0433"
    },
    {
      "id": "son-q",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "Q \xB7 \u041F\u043E\u043B\u043E\u0441\u0430 \u043E\u0446\u0435\u043D\u043A\u0438"
    },
    {
      "id": "son-r",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "R \xB7 \u0421\u0442\u0438\u043A\u0435\u0440"
    },
    {
      "id": "son-s",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "S \xB7 \u041A\u0440\u0435\u0434\u0438\u0442\u043A\u0430"
    },
    {
      "id": "son-t",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "T \xB7 \u0411\u0438\u043B\u0435\u0442"
    },
    {
      "id": "son-u",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "U \xB7 \u0413\u0435\u0439\u043C\u043F\u0430\u0434"
    },
    {
      "id": "son-v",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "V \xB7 \u0421\u043F\u0438\u0434\u043E\u043C\u0435\u0442\u0440"
    },
    {
      "id": "son-w",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "W \xB7 \u041A\u0438\u043D\u043E\u043F\u043B\u0451\u043D\u043A\u0430"
    },
    {
      "id": "son-x",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "X \xB7 \u0413\u043B\u0438\u0442\u0447"
    },
    {
      "id": "son-y",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "Y \xB7 \u041D\u0435\u043E\u043D"
    },
    {
      "id": "son-z",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "Z \xB7 \u0422\u0430\u0431\u043B\u0438\u0446\u0430"
    },
    {
      "id": "son-aa",
      "cat": "numeric",
      "group": "Sonnet \xB7 A\u2013AA (27)",
      "name": "AA \xB7 \u041C\u0435\u0434\u0430\u043B\u044C"
    },
    {
      "id": "twp-1",
      "cat": "panax",
      "group": "Panax Tailwind (10)",
      "name": "\u041F\u043E\u043B\u043E\u0441\u0430 \u044D\u043C\u043E\u0446\u0438\u0439 + \u043C\u0435\u0434\u0430\u043B\u044C"
    },
    {
      "id": "twp-2",
      "cat": "panax",
      "group": "Panax Tailwind (10)",
      "name": "\u042D\u043A\u0432\u0430\u043B\u0430\u0439\u0437\u0435\u0440 Panax"
    },
    {
      "id": "twp-3",
      "cat": "panax",
      "group": "Panax Tailwind (10)",
      "name": "\u041A\u043E\u043B\u044C\u0446\u0435\u0432\u0430\u044F \u0434\u0438\u0430\u0433\u0440\u0430\u043C\u043C\u0430"
    },
    {
      "id": "twp-4",
      "cat": "panax",
      "group": "Panax Tailwind (10)",
      "name": "\u0411\u0443\u043C\u0430\u0436\u043D\u044B\u0439 \u0431\u0438\u043B\u0435\u0442-\u043A\u043B\u0430\u0432\u0438\u0448\u0438"
    },
    {
      "id": "twp-5",
      "cat": "panax",
      "group": "Panax Tailwind (10)",
      "name": "\u041F\u043E\u0434\u0438\u0443\u043C \u0422\u043E\u043F-3 \u0440\u0435\u0430\u043A\u0446\u0438\u0439"
    },
    {
      "id": "twp-6",
      "cat": "panax",
      "group": "Panax Tailwind (10)",
      "name": "\u0428\u0438\u0440\u043E\u043A\u0438\u0439 \u043A\u0430\u0434\u0440 + \u043B\u0435\u043D\u0442\u0430"
    },
    {
      "id": "twp-7",
      "cat": "panax",
      "group": "Panax Tailwind (10)",
      "name": "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B ASCII-\u0433\u0438\u0441\u0442\u043E\u0433\u0440\u0430\u043C\u043C\u0430"
    },
    {
      "id": "twp-8",
      "cat": "panax",
      "group": "Panax Tailwind (10)",
      "name": "\u0428\u0432\u0435\u0439\u0446\u0430\u0440\u0441\u043A\u0430\u044F \u0442\u0430\u0431\u043B\u0438\u0446\u0430"
    },
    {
      "id": "twp-9",
      "cat": "panax",
      "group": "Panax Tailwind (10)",
      "name": "\u0412\u043E\u043B\u043D\u0430 \u043C\u043D\u0435\u043D\u0438\u0439"
    },
    {
      "id": "twp-10",
      "cat": "panax",
      "group": "Panax Tailwind (10)",
      "name": "\u041A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430 PANAX"
    },
    {
      "id": "tw32-1",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "1. \u041A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u043E\u043D\u043D\u044B\u0439 \u0431\u0438\u043B\u0435\u0442-\u0434\u043E\u0441\u044C\u0435"
    },
    {
      "id": "tw32-2",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "2. \u0428\u0438\u0440\u043E\u043A\u043E\u0444\u043E\u0440\u043C\u0430\u0442\u043D\u044B\u0439 \u043A\u0430\u0434\u0440 \u0441 \u043F\u0430\u0440\u044F\u0449\u0435\u0439 \u043A\u0430\u043F\u0441\u0443\u043B\u043E\u0439"
    },
    {
      "id": "tw32-3",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "3. \u0428\u0432\u0435\u0439\u0446\u0430\u0440\u0441\u043A\u0438\u0439 \u043C\u043E\u0434\u0435\u0440\u043D\u0438\u0437\u043C"
    },
    {
      "id": "tw32-4",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "4. \u041F\u043E\u0440\u0442\u0430\u0442\u0438\u0432\u043D\u044B\u0439 \u043A\u0430\u0440\u0442\u0440\u0438\u0434\u0436 Game Boy"
    },
    {
      "id": "tw32-5",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "5. \u0414\u0438\u0441\u043A-\u0438\u0437\u0434\u0430\u043D\u0438\u0435 \u0441 \u044F\u043F\u043E\u043D\u0441\u043A\u043E\u0439 \u043B\u0435\u043D\u0442\u043E\u0439 Obi-Strip"
    },
    {
      "id": "tw32-6",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "6. \u0425\u0430\u043A\u0435\u0440\u0441\u043A\u0438\u0439 \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B \u0441 ASCII-\u0448\u043A\u0430\u043B\u043E\u0439 \u0438 \u0441\u043A\u0430\u043D\u043B\u0430\u0439\u043D\u0430\u043C"
    },
    {
      "id": "tw32-7",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "7. \u041B\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u043D\u0430\u044F \u0433\u0430\u0437\u0435\u0442\u043D\u0430\u044F \u0432\u044B\u0440\u0435\u0437\u043A\u0430"
    },
    {
      "id": "tw32-8",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "8. \u041C\u0435\u0442\u0430\u043B\u043B\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0448\u0438\u043B\u044C\u0434\u0430 \u0441 \u0437\u0430\u043A\u043B\u0451\u043F\u043A\u0430\u043C\u0438 \u0438 LED-\u0434\u0438\u0441\u043F\u043B\u0435"
    },
    {
      "id": "tw32-9",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "9. \u0421\u043D\u0438\u043C\u043E\u043A \u043D\u0430 \u0434\u043E\u0441\u043A\u0435 + \u0441\u0442\u0438\u043A\u0435\u0440 \u0441 \u0437\u0430\u043C\u0435\u0442\u043A\u0430\u043C\u0438"
    },
    {
      "id": "tw32-10",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "10. \u0410\u0441\u0438\u043C\u043C\u0435\u0442\u0440\u0438\u0447\u043D\u044B\u0439 \u0441\u043F\u043B\u0438\u0442 50/50 \u0441\u043E \u0441\u0440\u0430\u0432\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0439 \u0448\u043A\u0430"
    },
    {
      "id": "tw32-11",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "11. \u0410\u0440\u043A\u0430\u0434\u043D\u044B\u0439 \u0430\u0432\u0442\u043E\u043C\u0430\u0442 / Neo-Geo"
    },
    {
      "id": "tw32-12",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "12. \u0423\u043B\u044C\u0442\u0440\u0430-\u043A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430"
    },
    {
      "id": "tw32-13",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "13. \u041E\u0431\u043B\u043E\u0436\u043A\u0430 \u0432\u0438\u0434\u0435\u043E\u043A\u0430\u0441\u0441\u0435\u0442\u044B VHS 90-\u0445"
    },
    {
      "id": "tw32-14",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "14. \u0418\u043D\u0436\u0435\u043D\u0435\u0440\u043D\u0430\u044F \u0441\u0438\u043D\u044C\u043A\u0430-\u0447\u0435\u0440\u0442\u0451\u0436"
    },
    {
      "id": "tw32-15",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "15. \u041B\u0438\u0441\u0442 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430 RPG"
    },
    {
      "id": "tw32-16",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "16. \u0412\u0438\u0434\u0436\u0435\u0442 \u0430\u0443\u0434\u0438\u043E\u043F\u043B\u0435\u0435\u0440\u0430"
    },
    {
      "id": "tw32-17",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "17. \u041C\u0443\u0437\u0435\u0439\u043D\u0430\u044F \u0442\u0430\u0431\u043B\u0438\u0447\u043A\u0430 \u044D\u043A\u0441\u043F\u043E\u043D\u0430\u0442\u0430"
    },
    {
      "id": "tw32-18",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "18. \u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u043A\u043E\u043C\u0438\u043A\u0441\u0430"
    },
    {
      "id": "tw32-19",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "19. \u041E\u043A\u043D\u043E \u043A\u043B\u0430\u0441\u0441\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u041E\u0421"
    },
    {
      "id": "tw32-20",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "20. \u041F\u0435\u0440\u0435\u043A\u0438\u0434\u043D\u043E\u0435 \u0442\u0430\u0431\u043B\u043E"
    },
    {
      "id": "tw32-21",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "21. \u0412\u043E\u0437\u0434\u0443\u0448\u043D\u0430\u044F \u043F\u0430\u0441\u0442\u0435\u043B\u044C"
    },
    {
      "id": "tw32-22",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "22. \u0417\u0430\u043A\u043B\u0430\u0434\u043A\u0430-\u043B\u0435\u043D\u0442\u0430"
    },
    {
      "id": "tw32-23",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "23. \u041F\u043E\u0441\u0430\u0434\u043E\u0447\u043D\u044B\u0439 \u0442\u0430\u043B\u043E\u043D"
    },
    {
      "id": "tw32-24",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "24. \u041A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u043A\u0430\u0440\u0442\u0430 TCG"
    },
    {
      "id": "tw32-25",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "25. \u0421\u0442\u0435\u043A\u043B\u044F\u043D\u043D\u0430\u044F \u043F\u0430\u043D\u0435\u043B\u044C Spotlight"
    },
    {
      "id": "tw32-26",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "26. \u0412\u0438\u043D\u0438\u043B\u043E\u0432\u0430\u044F \u043F\u043B\u0430\u0441\u0442\u0438\u043D\u043A\u0430"
    },
    {
      "id": "tw32-27",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "27. \u041A\u043D\u0438\u0436\u043D\u044B\u0439 \u044D\u043A\u0441\u043B\u0438\u0431\u0440\u0438\u0441"
    },
    {
      "id": "tw32-28",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "28. \u0422\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0441\u043A\u0430\u043D\u0435\u0440 Sci-Fi"
    },
    {
      "id": "tw32-29",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "29. \u0427\u0451\u0440\u043D\u043E-\u0431\u0435\u043B\u044B\u0439 \u043A\u0441\u0435\u0440\u043E\u043A\u0441-\u0437\u0438\u043D"
    },
    {
      "id": "tw32-30",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "30. \u041A\u0430\u0441\u0441\u043E\u0432\u044B\u0439 \u0447\u0435\u043A"
    },
    {
      "id": "tw32-31",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "31. \u041E\u0431\u044A\u0451\u043C\u043D\u0430\u044F \u0441\u0442\u043E\u043F\u043A\u0430"
    },
    {
      "id": "tw32-32",
      "cat": "numeric",
      "group": "Backloggd/PANAX Tailwind (32)",
      "name": "32. \u0426\u0438\u0442\u0430\u0442\u0430 \u043A\u0440\u0438\u0442\u0438\u043A\u0430"
    },
    {
      "id": "qwen-pulse",
      "cat": "panax",
      "group": "Qwen \xB7 PANAX (10)",
      "name": "Pulse (\u043F\u043E\u043B\u043D\u0430\u044F \u0448\u043A\u0430\u043B\u0430)"
    },
    {
      "id": "qwen-prism",
      "cat": "panax",
      "group": "Qwen \xB7 PANAX (10)",
      "name": "Prism (3D \u0441\u0442\u0435\u043A\u043B\u043E)"
    },
    {
      "id": "qwen-pass",
      "cat": "panax",
      "group": "Qwen \xB7 PANAX (10)",
      "name": "Game Pass (\u0431\u0438\u043B\u0435\u0442)"
    },
    {
      "id": "qwen-paper",
      "cat": "panax",
      "group": "Qwen \xB7 PANAX (10)",
      "name": "Paper (\u0436\u0443\u0440\u043D\u0430\u043B)"
    },
    {
      "id": "qwen-arcade",
      "cat": "panax",
      "group": "Qwen \xB7 PANAX (10)",
      "name": "Arcade (CRT)"
    },
    {
      "id": "qwen-keyart",
      "cat": "panax",
      "group": "Qwen \xB7 PANAX (10)",
      "name": "Key Art (\u043F\u043E\u0441\u0442\u0435\u0440)"
    },
    {
      "id": "qwen-inline",
      "cat": "panax",
      "group": "Qwen \xB7 PANAX (10)",
      "name": "Inline (\u0441\u0442\u0440\u043E\u043A\u0430)"
    },
    {
      "id": "qwen-holo",
      "cat": "panax",
      "group": "Qwen \xB7 PANAX (10)",
      "name": "Holo Rare (\u043A\u0430\u0440\u0442\u0430)"
    },
    {
      "id": "qwen-brutal",
      "cat": "panax",
      "group": "Qwen \xB7 PANAX (10)",
      "name": "Brutal (\u0431\u0440\u0443\u0442\u0430\u043B\u0438\u0437\u043C)"
    },
    {
      "id": "qwen-terminal",
      "cat": "panax",
      "group": "Qwen \xB7 PANAX (10)",
      "name": "Terminal (HUD)"
    },
    {
      "id": "qwen2-neon-hud",
      "cat": "numeric",
      "group": "Qwen \xB7 Numeric (12)",
      "name": "Neon HUD (\u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B)"
    },
    {
      "id": "qwen2-aurora-glass",
      "cat": "numeric",
      "group": "Qwen \xB7 Numeric (12)",
      "name": "Aurora Glass (3D \u0441\u0442\u0435\u043A\u043B\u043E)"
    },
    {
      "id": "qwen2-editorial",
      "cat": "numeric",
      "group": "Qwen \xB7 Numeric (12)",
      "name": "Editorial (\u0436\u0443\u0440\u043D\u0430\u043B)"
    },
    {
      "id": "qwen2-cartridge",
      "cat": "numeric",
      "group": "Qwen \xB7 Numeric (12)",
      "name": "Cartridge (\u043A\u0430\u0440\u0442\u0440\u0438\u0434\u0436)"
    },
    {
      "id": "qwen2-whisper",
      "cat": "numeric",
      "group": "Qwen \xB7 Numeric (12)",
      "name": "Whisper (\u043C\u0438\u043D\u0438\u043C\u0430\u043B)"
    },
    {
      "id": "qwen2-arcade-crt",
      "cat": "numeric",
      "group": "Qwen \xB7 Numeric (12)",
      "name": "Arcade CRT (\u0430\u0440\u043A\u0430\u0434\u0430)"
    },
    {
      "id": "qwen2-key-art",
      "cat": "numeric",
      "group": "Qwen \xB7 Numeric (12)",
      "name": "Key Art (\u043F\u043E\u0441\u0442\u0435\u0440)"
    },
    {
      "id": "qwen2-slash",
      "cat": "numeric",
      "group": "Qwen \xB7 Numeric (12)",
      "name": "Slash (\u0434\u0438\u0430\u0433\u043E\u043D\u0430\u043B\u044C)"
    },
    {
      "id": "qwen2-inline",
      "cat": "numeric",
      "group": "Qwen \xB7 Numeric (12)",
      "name": "Inline (\u0432 \u0442\u0435\u043A\u0441\u0442\u0435)"
    },
    {
      "id": "qwen2-telemetry",
      "cat": "numeric",
      "group": "Qwen \xB7 Numeric (12)",
      "name": "Telemetry (\u0441\u043F\u0430\u0440\u043A\u043B\u0430\u0439\u043D)"
    },
    {
      "id": "qwen2-holo-rare",
      "cat": "numeric",
      "group": "Qwen \xB7 Numeric (12)",
      "name": "Holo Rare (\u0433\u043E\u043B\u043E-\u043A\u0430\u0440\u0442\u0430)"
    },
    {
      "id": "qwen2-loud",
      "cat": "numeric",
      "group": "Qwen \xB7 Numeric (12)",
      "name": "Loud (\u043A\u0440\u0443\u043F\u043D\u0430\u044F \u0444\u043E\u0440\u043C\u0430)"
    }
  ];
  var EXTRA_VARIANT_IDS = EXTRA_VARIANTS.map((v) => v.id);
  function asciiBar(pct, len = 10) {
    const n = Math.max(0, Math.min(len, Math.round(pct / 100 * len)));
    return "\u2588".repeat(n) + "\u2591".repeat(len - n);
  }
  function extractCardMetrics(d, rxList) {
    const r = d.ratings || {};
    const links = d.links || {};
    const rx = rxList || [];
    const rxTotal = rx.reduce((s, x) => s + x.val, 0);
    const sorted = [...rx].sort((a, b) => b.val - a.val);
    const top1 = sorted[0] || { k: "legendary", name: "\u041B\u0435\u0433\u0435\u043D\u0434\u0430", color: "#f3cb16", icon: "\u{1F3C6}", badge: "", val: 0 };
    const top2 = sorted[1] || { k: "awesome", name: "\u041A\u0440\u0443\u0442\u043E", color: "#f2a000", icon: "\u{1F918}", badge: "", val: 0 };
    const top3 = sorted[2] || { k: "good", name: "\u0425\u043E\u0440\u043E\u0448\u043E", color: "#bd55e9", icon: "\u{1F604}", badge: "", val: 0 };
    const posPct = rx.slice(0, 3).reduce((s, x) => s + x.val, 0);
    const maxRx = Math.max(1, ...rx.map((x) => x.val));
    const parseNum = (v) => {
      if (v == null) return null;
      const m = String(v).match(/(\d+(?:[.,]\d+)?)/);
      return m ? parseFloat(m[1].replace(",", ".")) : null;
    };
    let score10Num = null;
    let scoreSource = "PANAX";
    const blNum = parseNum(r.backloggd);
    const pxNum = parseNum(r.panax);
    const igNum = parseNum(r.igdb);
    const stNum = parseNum(r.steam);
    if (blNum != null) {
      score10Num = blNum <= 5 ? blNum * 2 : blNum;
      scoreSource = "Backloggd";
    } else if (pxNum != null) {
      score10Num = pxNum <= 5 ? pxNum * 2 : pxNum;
      scoreSource = "PANAX";
    } else if (rxTotal > 0) {
      const w = (rx[0].val * 10 + rx[1].val * 8.8 + rx[2].val * 7.4 + rx[3].val * 5.8 + rx[4].val * 3.5 + rx[5].val * 1.5) / rxTotal;
      score10Num = w;
      scoreSource = "PANAX";
    } else if (igNum != null) {
      score10Num = igNum > 10 ? igNum / 10 : igNum;
      scoreSource = "IGDB";
    } else if (stNum != null) {
      score10Num = stNum / 10;
      scoreSource = "Steam";
    } else {
      score10Num = 8.4;
      scoreSource = "PANAX";
    }
    score10Num = Math.max(0, Math.min(10, score10Num));
    const score10 = score10Num.toFixed(1);
    const score5 = (score10Num / 2).toFixed(1);
    const scorePctNum = Math.round(score10Num * 10);
    const igdbScore = Math.round(igNum != null ? igNum <= 10 ? igNum * 10 : igNum : scorePctNum);
    const steamPct = Math.round(stNum != null ? stNum : Math.min(99, Math.max(10, scorePctNum)));
    const year = String(d.year || "2025");
    const dev = String(d.dev || "");
    const pub = String(d.pub || "");
    const meta = [year, [dev, pub].filter(Boolean).join(" \xB7 ")].filter(Boolean).join(" \xB7 ") || "PANAX";
    const genres = Array.isArray(d.genres) && d.genres.length ? d.genres.slice(0, 4) : ["\u0418\u0433\u0440\u0430"];
    const plat = Array.isArray(d.plat) && d.plat.length ? d.plat.slice(0, 3) : ["PC"];
    const panaxUrl = safeUrl(links.panax || links.backloggd || links.igdb || "#");
    return {
      title: String(d.title || "\u0418\u0433\u0440\u0430"),
      year,
      dev: dev || pub || "Studio",
      pub: pub || dev || "Publisher",
      devPub: [dev, pub].filter(Boolean).join(" \xB7 ") || "Studio",
      meta,
      genres,
      plat,
      cover: safeUrl(d.cover) !== "#" ? d.cover : d.cover || "",
      panaxUrl,
      steamUrl: safeUrl(links.steam || panaxUrl),
      igdbUrl: safeUrl(links.igdb || panaxUrl),
      backloggdUrl: safeUrl(links.backloggd || panaxUrl),
      score10Num,
      score10,
      score5,
      scorePctNum,
      scorePct: scorePctNum + "%",
      scoreSource,
      igdbScore,
      steamPct,
      rx,
      rxTotal,
      maxRx,
      top1,
      top2,
      top3,
      posPct: posPct.toFixed(1),
      posInt: Math.round(posPct)
    };
  }
  var TEMPLATES = { "glm-paper": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 01 \xB7 \u041C\u0418\u041D\u0418\u041C\u0410\u041B (\u0421\u0412\u0415\u0422\u041B\u042B\u0419) \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n\n<div class="gw01">\n  <img class="gw01-cover" src="__COVER__" alt="__TITLE__">\n  <div class="gw01-body">\n    <div class="gw01-top">\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B \xB7 <em>Backloggd</em></div>\n    <h3 class="gw01-title">__TITLE__</h3>\n    <div class="gw01-meta">__META__</div>\n    <div class="gw01-genres">__GENRE_SPANS__</div>\n    <div class="gw01-stats">\n      <div><b>__SCORE5__<i>/5</i></b><span>Backloggd</span></div>\n      <div><b>__IGDB__<i>/100</i></b><span>IGDB</span></div>\n      <div><b>__STEAM_NUM__<i>%</i></b><span>Steam</span></div>\n    </div>\n    <div class="gw01-btns">\n      <a href="__BL_URL__" target="_blank" rel="noopener">Backloggd<i>&#8599;&#xFE0E;</i></a>\n      <a href="__STEAM_URL__" target="_blank" rel="noopener">Steam<i>&#8599;&#xFE0E;</i></a>\n      <a href="__IGDB_URL__" target="_blank" rel="noopener">IGDB<i>&#8599;&#xFE0E;</i></a>\n    </div>\n  </div>\n</div>' }, "glm-dark": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 02 \xB7 \u041C\u0418\u041D\u0418\u041C\u0410\u041B (\u0422\u0401\u041C\u041D\u042B\u0419) \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n\n<div class="gw02">\n  <img class="gw02-cover" src="__COVER__" alt="__TITLE__">\n  <div class="gw02-body">\n    <div class="gw02-top"><i></i>\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B \xB7 <em>Backloggd</em></div>\n    <h3 class="gw02-title">__TITLE__</h3>\n    <div class="gw02-meta">__META__</div>\n    <div class="gw02-genres">__GENRE_SPANS__</div>\n    <div class="gw02-stats">\n      <div><b>__SCORE5__<i>/5</i></b><span>Backloggd</span></div>\n      <div><b>__IGDB__<i>/100</i></b><span>IGDB</span></div>\n      <div><b>__STEAM_NUM__<i>%</i></b><span>Steam</span></div>\n    </div>\n    <div class="gw02-btns">\n      <a class="p" href="__BL_URL__" target="_blank" rel="noopener">Backloggd &#8599;&#xFE0E;</a>\n      <a class="s" href="__STEAM_URL__" target="_blank" rel="noopener">Steam</a>\n      <a class="s" href="__IGDB_URL__" target="_blank" rel="noopener">IGDB</a>\n    </div>\n  </div>\n</div>' }, "glm-swiss": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 03 \xB7 \u0428\u0412\u0415\u0419\u0426\u0410\u0420\u0421\u041A\u0418\u0419 \u041F\u041B\u0410\u041A\u0410\u0422 \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n\n<div class="gw03">\n  <div class="gw03-bar"><span>\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B \u2014 Backloggd</span><span class="no">\u2116 __YEAR__-ER<i></i></span></div>\n  <div class="gw03-main">\n    <div class="gw03-covwrap">\n      <img src="__COVER__" alt="__TITLE__">\n      <div class="gw03-covcap">\u041E\u0431\u043B\u043E\u0436\u043A\u0430 \xB7 \u0438\u0437\u0434\u0430\u043D\u0438\u0435 __YEAR__</div>\n    </div>\n    <div class="gw03-info">\n      <div class="gw03-kicker">\u0418\u0433\u0440\u0430 \u0433\u043E\u0434\u0430 \xB7 TGA __YEAR__</div>\n      <h3 class="gw03-title">Elden<br>Ring</h3>\n      <div class="gw03-meta">__YEAR__ \xB7 __DEV__ / Bandai Namco Entertainment</div>\n      <div class="gw03-genres">__GENRE_SPANS__</div>\n      <div class="gw03-plat">\u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u044B: PC \xB7 PS4/PS5 \xB7 Xbox One/Series</div>\n    </div>\n  </div>\n  <div class="gw03-scores">\n    <div><b>__SCORE5__<i>/5</i></b><span>Backloggd</span></div>\n    <div><b>__IGDB__<i>/100</i></b><span>IGDB</span></div>\n    <div><b>__STEAM_NUM__<i>%</i></b><span>Steam</span></div>\n  </div>\n  <div class="gw03-foot">\n    <a class="f1" href="__BL_URL__" target="_blank" rel="noopener">Backloggd &#8599;</a>\n    <a class="f2" href="__STEAM_URL__" target="_blank" rel="noopener">Steam &#8599;</a>\n    <a class="f3" href="__IGDB_URL__" target="_blank" rel="noopener">IGDB &#8599;</a>\n  </div>\n</div>' }, "glm-editorial": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 05 \xB7 \u0416\u0423\u0420\u041D\u0410\u041B\u042C\u041D\u042B\u0419 \u0420\u0410\u0417\u0412\u041E\u0420\u041E\u0422 \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n\n<div class="gw05">\n  <img class="gw05-bg" src="__COVER__" alt="__TITLE__">\n  <div class="gw05-shade"></div>\n  <div class="gw05-top">\n    <div class="gw05-lbl">\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B \xB7 \u041E\u0431\u0437\u043E\u0440</div>\n    <div class="gw05-score"><b>__IGDB__</b><span>IGDB</span></div>\n  </div>\n  <div class="gw05-bottom">\n    <h3 class="gw05-title">__TITLE__</h3>\n    <div class="gw05-meta">__META__</div>\n    <div class="gw05-genres">__GENRE_SPANS__</div>\n    <p class="gw05-quote">\xAB\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u044C, \u041F\u043E\u0433\u0430\u0441\u0448\u0438\u0439, \u0438 \u0431\u0443\u0434\u044C \u0432\u0435\u0434\u043E\u043C \u0431\u043B\u0430\u0433\u043E\u0434\u0430\u0442\u044C\u044E \u043A \u043A\u043E\u043B\u044C\u0446\u0443 \u042D\u043B\u0434\u0435\u043D\u0430\u2026\xBB</p>\n    <div class="gw05-btns">\n      <a href="__BL_URL__" target="_blank" rel="noopener">Backloggd<i>&#8599;&#xFE0E;</i></a>\n      <a href="__STEAM_URL__" target="_blank" rel="noopener">Steam<i>&#8599;&#xFE0E;</i></a>\n      <a href="__IGDB_URL__" target="_blank" rel="noopener">IGDB<i>&#8599;&#xFE0E;</i></a>\n      <a href="__PANAX_URL__" target="_blank" rel="noopener">PANAX<i>&#8599;&#xFE0E;</i></a>\n    </div>\n  </div>\n</div>' }, "glm-vertical": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 06 \xB7 \u0412\u0415\u0420\u0422\u0418\u041A\u0410\u041B\u042C\u041D\u042B\u0419 \u041F\u041E\u0421\u0422\u0415\u0420 \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n\n<div class="gw06">\n  <img class="gw06-cover" src="__COVER__" alt="__TITLE__">\n  <div class="gw06-shade"></div>\n  <div class="gw06-chip">Backloggd \xB7 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430</div>\n  <div class="gw06-badge"><b>__SCORE5__</b><span>\u0438\u0437 5</span></div>\n  <div class="gw06-body">\n    <h3 class="gw06-title">__TITLE__</h3>\n    <div class="gw06-meta">__YEAR__ \xB7 __DEV__</div>\n    <div class="gw06-genres">__GENRE_SPANS__</div>\n    <div class="gw06-btns">\n      <a class="p" href="__BL_URL__" target="_blank" rel="noopener">Backloggd</a>\n      <a class="s" href="__STEAM_URL__" target="_blank" rel="noopener">Steam</a>\n      <a class="s" href="__IGDB_URL__" target="_blank" rel="noopener">IGDB</a>\n    </div>\n  </div>\n</div>' }, "glm-crt": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 08 \xB7 CRT-\u0422\u0415\u0420\u041C\u0418\u041D\u0410\u041B \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n\n<div class="gw08">\n  <div class="gw08-top"><span>/// \u041A\u0410\u0420\u0422\u041E\u0427\u041A\u0410 \u0418\u0413\u0420\u042B</span><span>BACKLOGGD.DAT</span></div>\n  <div class="gw08-prompt"><b>&gt;</b> game.lookup --id elden-ring</div>\n  <hr class="gw08-div">\n  <div class="gw08-title">__TITLE_UPPER__<span class="gw08-cursor"></span></div>\n  <div class="gw08-rows">\n    <div class="gw08-row"><span>\u0413\u041E\u0414</span><i></i><b>__YEAR__</b></div>\n    <div class="gw08-row"><span>\u0421\u0422\u0423\u0414\u0418\u042F</span><i></i><b>__DEV__</b></div>\n    <div class="gw08-row"><span>\u0418\u0417\u0414\u0410\u0422\u0415\u041B\u042C</span><i></i><b>Bandai Namco Entertainment</b></div>\n    <div class="gw08-row"><span>\u0416\u0410\u041D\u0420\u042B</span><i></i><b>\u044D\u043A\u0448\u0435\u043D-rpg / \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0439 \u043C\u0438\u0440 / souls-like</b></div>\n    <div class="gw08-row"><span>\u041F\u041B\u0410\u0422\u0424\u041E\u0420\u041C\u042B</span><i></i><b>PC \xB7 PS4/PS5 \xB7 Xbox One/Series</b></div>\n  </div>\n  <div class="gw08-bars">\n    <div class="gw08-bar-row"><span>BACKLOGGD</span><div class="bar"><b style="width:90%"></b></div><em>__SCORE5__/5</em></div>\n    <div class="gw08-bar-row"><span>IGDB</span><div class="bar"><b style="width:97%"></b></div><em>97/100</em></div>\n    <div class="gw08-bar-row"><span>STEAM</span><div class="bar"><b style="width:__STEAM_PCT__"></b></div><em>__STEAM_PCT__</em></div>\n  </div>\n  <div class="gw08-btns">\n    <a href="__BL_URL__" target="_blank" rel="noopener">[ BACKLOGGD ]</a>\n    <a href="__STEAM_URL__" target="_blank" rel="noopener">[ STEAM ]</a>\n    <a href="__IGDB_URL__" target="_blank" rel="noopener">[ IGDB ]</a>\n  </div>\n</div>' }, "glm-snes": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 09 \xB7 \u041A\u0410\u0420\u0422\u0420\u0418\u0414\u0416 SNES \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n\n<div class="gw09">\n  <div class="gw09-ridges"></div>\n  <div class="gw09-label">\n    <div class="gw09-band"><span>16-BIT \xB7 \u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B</span><em>SN-__YEAR__</em></div>\n    <div class="gw09-stripe"></div>\n    <div class="gw09-body">\n      <div class="gw09-cov"><img src="__COVER__" alt="__TITLE__"></div>\n      <div class="gw09-info">\n        <h3 class="gw09-name">__TITLE__</h3>\n        <div class="gw09-meta">__META__</div>\n        <div class="gw09-genres">__GENRE_SPANS__</div>\n        <div class="gw09-tags"><span class="t1">BL __SCORE5__/5</span><span class="t2">IGDB __IGDB__</span><span class="t3">STM __STEAM_PCT__</span></div>\n      </div>\n    </div>\n  </div>\n  <div class="gw09-btns">\n    <a class="f1" href="__BL_URL__" target="_blank" rel="noopener">Backloggd</a>\n    <a href="__STEAM_URL__" target="_blank" rel="noopener">Steam</a>\n    <a href="__IGDB_URL__" target="_blank" rel="noopener">IGDB</a>\n  </div>\n  <div class="gw09-serial">SLG \xB7 __YEAR__ \xB7 Made for review blogs</div>\n</div>' }, "glm-pixel": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 10 \xB7 \u041F\u0418\u041A\u0421\u0415\u041B\u042C\u041D\u0410\u042F \u0412\u0418\u0422\u0420\u0418\u041D\u0410 \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n\n<div class="gw10">\n  <div class="gw10-top">\n    <span class="gw10-lbl"><i></i>\u041A\u0410\u0420\u0422\u041E\u0427\u041A\u0410 \u0418\u0413\u0420\u042B</span>\n    <span class="gw10-hi">HI-SCORE 97</span>\n  </div>\n  <div class="gw10-body">\n    <div class="gw10-cov"><img src="__COVER__" alt="__TITLE__"></div>\n    <div class="gw10-info">\n      <h3 class="gw10-name">__TITLE_UPPER__</h3>\n      <div class="gw10-meta">__YEAR__ \xB7 __DEV__</div>\n      <div class="gw10-gen">\u042D\u041A\u0428\u0415\u041D-RPG / \u041E\u0422\u041A\u0420\u042B\u0422\u042B\u0419 \u041C\u0418\u0420 / SOULS-LIKE</div>\n      <div class="gw10-stats">\n        <div><span>BACKLOGGD</span><b>__SCORE5__/5</b></div>\n        <div><span>IGDB</span><b>97/100</b></div>\n        <div><span>STEAM</span><b>__STEAM_PCT__</b></div>\n      </div>\n    </div>\n  </div>\n  <div class="gw10-btns">\n    <a class="p" href="__BL_URL__" target="_blank" rel="noopener">BACKLOGGD</a>\n    <a class="s" href="__STEAM_URL__" target="_blank" rel="noopener">STEAM</a>\n    <a class="s" href="__IGDB_URL__" target="_blank" rel="noopener">IGDB</a>\n  </div>\n  <div class="gw10-hint">\u041D\u0410\u0416\u041C\u0418 START \u2014 \u0427\u0418\u0422\u0410\u0419 \u041E\u0411\u0417\u041E\u0420</div>\n</div>' }, "glm-panax-paper": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 01 \xB7 \u041C\u0418\u041D\u0418\u041C\u0410\u041B (\u0421\u0412\u0415\u0422\u041B\u042B\u0419) \xB7 PANAX \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n<div class="pa01">\n<img alt="__TITLE__" class="pa01-cover" src="__COVER__"/>\n<div class="pa01-body">\n<div class="pa01-top">\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B \xB7 <em>PANAX</em></div>\n<h3 class="pa01-title">__TITLE__</h3>\n<div class="pa01-meta">__META__</div>\n<div class="pa01-genres">__GENRE_SPANS__</div>\n<div class="pa01-hist">\n<div class="pa01-col"><div class="pa01-track"><i class="f-gold" style="height:__RX_REL_0%"></i></div><span class="pa01-badge">__RX_ICON_0__</span><span class="pa01-lbl t-gold">\u041B\u0435\u0433\u0435\u043D\u0434\u0430</span><span class="pa01-val">__RX_PCT_0__</span></div>\n<div class="pa01-col"><div class="pa01-track"><i class="f-orange" style="height:__RX_REL_1%"></i></div><span class="pa01-badge">__RX_ICON_1__</span><span class="pa01-lbl t-orange">\u041A\u0440\u0443\u0442\u043E</span><span class="pa01-val">__RX_PCT_1__</span></div>\n<div class="pa01-col"><div class="pa01-track"><i class="f-purple" style="height:__RX_REL_2%"></i></div><span class="pa01-badge">__RX_ICON_2__</span><span class="pa01-lbl t-purple">\u0425\u043E\u0440\u043E\u0448\u043E</span><span class="pa01-val">__RX_PCT_2__</span></div>\n<div class="pa01-col"><div class="pa01-track"><i class="f-blue" style="height:__RX_REL_3%"></i></div><span class="pa01-badge">__RX_ICON_3__</span><span class="pa01-lbl t-blue">\u041D\u043E\u0440\u043C</span><span class="pa01-val">__RX_PCT_3__</span></div>\n<div class="pa01-col"><div class="pa01-track"><i class="f-grey" style="height:__RX_REL_4%"></i></div><span class="pa01-badge">__RX_ICON_4__</span><span class="pa01-lbl t-grey">\u041F\u043B\u043E\u0445\u043E</span><span class="pa01-val">__RX_PCT_4__</span></div>\n<div class="pa01-col"><div class="pa01-track"><i class="f-green" style="height:__RX_REL_5%"></i></div><span class="pa01-badge">__RX_ICON_5__</span><span class="pa01-lbl t-green">\u0423\u0436\u0430\u0441</span><span class="pa01-val">__RX_PCT_5__</span></div>\n</div>\n<div class="pa01-verdict"><div>\u0421\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u043E PANAX: <b>__TOP1_NAME__</b> \u2014 __POS_PCT__% <span class="e">__TOP1_ICON__</span></div><span>IGDB __IGDB__ \xB7 Steam __STEAM_PCT__</span></div>\n<div class="pa01-btns">\n<a class="p" href="__PANAX_URL__" rel="noopener" target="_blank">PANAX \u2197\uFE0E</a>\n<a href="__STEAM_URL__" rel="noopener" target="_blank">Steam</a>\n<a href="__IGDB_URL__" rel="noopener" target="_blank">IGDB</a>\n</div>\n</div>\n</div>' }, "glm-panax-dark": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 02 \xB7 \u041C\u0418\u041D\u0418\u041C\u0410\u041B (\u0422\u0401\u041C\u041D\u042B\u0419) \xB7 PANAX \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n<div class="pa02">\n<img alt="__TITLE__" class="pa02-cover" src="__COVER__"/>\n<div class="pa02-body">\n<div class="pa02-top"><i></i>\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B \xB7 <em>PANAX</em></div>\n<h3 class="pa02-title">__TITLE__</h3>\n<div class="pa02-meta">__META__</div>\n<div class="pa02-genres">__GENRE_SPANS__</div>\n<div class="pa02-hist">\n<div class="pa02-col"><div class="pa02-track"><i class="f-gold" style="height:__RX_REL_0%"></i></div><span class="pa02-badge">__RX_ICON_0__</span><span class="pa02-lbl t-gold">\u041B\u0435\u0433\u0435\u043D\u0434\u0430</span><span class="pa02-val">__RX_PCT_0__</span></div>\n<div class="pa02-col"><div class="pa02-track"><i class="f-orange" style="height:__RX_REL_1%"></i></div><span class="pa02-badge">__RX_ICON_1__</span><span class="pa02-lbl t-orange">\u041A\u0440\u0443\u0442\u043E</span><span class="pa02-val">__RX_PCT_1__</span></div>\n<div class="pa02-col"><div class="pa02-track"><i class="f-purple" style="height:__RX_REL_2%"></i></div><span class="pa02-badge">__RX_ICON_2__</span><span class="pa02-lbl t-purple">\u0425\u043E\u0440\u043E\u0448\u043E</span><span class="pa02-val">__RX_PCT_2__</span></div>\n<div class="pa02-col"><div class="pa02-track"><i class="f-blue" style="height:__RX_REL_3%"></i></div><span class="pa02-badge">__RX_ICON_3__</span><span class="pa02-lbl t-blue">\u041D\u043E\u0440\u043C</span><span class="pa02-val">__RX_PCT_3__</span></div>\n<div class="pa02-col"><div class="pa02-track"><i class="f-grey" style="height:__RX_REL_4%"></i></div><span class="pa02-badge">__RX_ICON_4__</span><span class="pa02-lbl t-grey">\u041F\u043B\u043E\u0445\u043E</span><span class="pa02-val">__RX_PCT_4__</span></div>\n<div class="pa02-col"><div class="pa02-track"><i class="f-green" style="height:__RX_REL_5%"></i></div><span class="pa02-badge">__RX_ICON_5__</span><span class="pa02-lbl t-green">\u0423\u0436\u0430\u0441</span><span class="pa02-val">__RX_PCT_5__</span></div>\n</div>\n<div class="pa02-verdict"><div>\u0421\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u043E PANAX: <b>__TOP1_NAME__</b> \u2014 __POS_PCT__% <span class="e">__TOP1_ICON__</span></div><span>IGDB __IGDB__ \xB7 Steam __STEAM_PCT__</span></div>\n<div class="pa02-btns">\n<a class="p" href="__PANAX_URL__" rel="noopener" target="_blank">PANAX \u2197\uFE0E</a>\n<a class="s" href="__STEAM_URL__" rel="noopener" target="_blank">Steam</a>\n<a class="s" href="__IGDB_URL__" rel="noopener" target="_blank">IGDB</a>\n</div>\n</div>\n</div>' }, "glm-panax-swiss": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 03 \xB7 \u0428\u0412\u0415\u0419\u0426\u0410\u0420\u0421\u041A\u0418\u0419 \u041F\u041B\u0410\u041A\u0410\u0422 \xB7 PANAX \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n<div class="pa03">\n<div class="pa03-bar"><span>\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B \u2014 PANAX</span><span class="no">\u2116 __YEAR__-ER<i></i></span></div>\n<div class="pa03-main">\n<div class="pa03-covwrap">\n<img alt="__TITLE__" src="__COVER__"/>\n<div class="pa03-covcap">\u041E\u0431\u043B\u043E\u0436\u043A\u0430 \xB7 \u0438\u0437\u0434\u0430\u043D\u0438\u0435 __YEAR__</div>\n</div>\n<div class="pa03-info">\n<div class="pa03-kicker">\u0418\u0433\u0440\u0430 \u0433\u043E\u0434\u0430 \xB7 TGA __YEAR__</div>\n<h3 class="pa03-title">Elden<br/>Ring</h3>\n<div class="pa03-meta">__YEAR__ \xB7 __DEV__ / Bandai Namco Entertainment</div>\n<div class="pa03-genres">__GENRE_SPANS__</div>\n<div class="pa03-plat">\u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u044B: PC \xB7 PS4/PS5 \xB7 Xbox One/Series</div>\n</div>\n</div>\n<div class="pa03-pollhead"><span>\u041E\u043F\u0440\u043E\u0441 \u0441\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u0430 PANAX</span><b>\u0412\u0435\u0440\u0434\u0438\u043A\u0442: \u041A\u0440\u0443\u0442\u043E \xB7 __POS_PCT__%</b></div>\n<div class="pa03-hist">\n<div class="pa03-col"><span class="pa03-val">__RX_PCT_0__</span><div class="pa03-track"><i class="f-gold" style="height:__RX_REL_0%"></i></div><span class="pa03-lbl t-gold">\u041B\u0435\u0433\u0435\u043D\u0434\u0430</span></div>\n<div class="pa03-col"><span class="pa03-val">__RX_PCT_1__</span><div class="pa03-track"><i class="f-orange" style="height:__RX_REL_1%"></i></div><span class="pa03-lbl t-orange">\u041A\u0440\u0443\u0442\u043E</span></div>\n<div class="pa03-col"><span class="pa03-val">__RX_PCT_2__</span><div class="pa03-track"><i class="f-purple" style="height:__RX_REL_2%"></i></div><span class="pa03-lbl t-purple">\u0425\u043E\u0440\u043E\u0448\u043E</span></div>\n<div class="pa03-col"><span class="pa03-val">__RX_PCT_3__</span><div class="pa03-track"><i class="f-blue" style="height:__RX_REL_3%"></i></div><span class="pa03-lbl t-blue">\u041D\u043E\u0440\u043C</span></div>\n<div class="pa03-col"><span class="pa03-val">__RX_PCT_4__</span><div class="pa03-track"><i class="f-grey" style="height:__RX_REL_4%"></i></div><span class="pa03-lbl t-grey">\u041F\u043B\u043E\u0445\u043E</span></div>\n<div class="pa03-col"><span class="pa03-val">__RX_PCT_5__</span><div class="pa03-track"><i class="f-green" style="height:__RX_REL_5%"></i></div><span class="pa03-lbl t-green">\u0423\u0436\u0430\u0441</span></div>\n</div>\n<div class="pa03-foot">\n<a class="f1" href="__PANAX_URL__" rel="noopener" target="_blank">PANAX \u2197</a>\n<a class="f2" href="__STEAM_URL__" rel="noopener" target="_blank">Steam \u2197</a>\n<a class="f3" href="__IGDB_URL__" rel="noopener" target="_blank">IGDB \u2197</a>\n</div>\n</div>' }, "glm-panax-editorial": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 05 \xB7 \u0416\u0423\u0420\u041D\u0410\u041B\u042C\u041D\u042B\u0419 \u0420\u0410\u0417\u0412\u041E\u0420\u041E\u0422 \xB7 PANAX \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n<div class="pa05">\n<img alt="__TITLE__" class="pa05-bg" src="__COVER__"/>\n<div class="pa05-shade"></div>\n<div class="pa05-top">\n<div class="pa05-lbl">\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B \xB7 PANAX</div>\n<div class="pa05-score"><b>__POS_PCT__%</b><span>__TOP1_ICON__ PANAX</span></div>\n</div>\n<div class="pa05-bottom">\n<h3 class="pa05-title">__TITLE__</h3>\n<div class="pa05-meta">__META__</div>\n<div class="pa05-genres">__GENRE_SPANS__</div>\n<div class="pa05-verdict">\u0412\u0435\u0440\u0434\u0438\u043A\u0442 \u0441\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u0430: \xAB\u041A\u0440\u0443\u0442\u043E\xBB <span class="e">\u{1F929}</span> \u2014 __POS_PCT__% \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445</div>\n<div class="pa05-hist">\n<div class="pa05-col"><div class="pa05-track"><i class="f-gold" style="height:__RX_REL_0%"></i></div><span class="pa05-badge">__RX_ICON_0__</span><span class="pa05-lbl t-gold">\u041B\u0435\u0433\u0435\u043D\u0434\u0430</span><span class="pa05-val">__RX_PCT_0__</span></div>\n<div class="pa05-col"><div class="pa05-track"><i class="f-orange" style="height:__RX_REL_1%"></i></div><span class="pa05-badge">__RX_ICON_1__</span><span class="pa05-lbl t-orange">\u041A\u0440\u0443\u0442\u043E</span><span class="pa05-val">__RX_PCT_1__</span></div>\n<div class="pa05-col"><div class="pa05-track"><i class="f-purple" style="height:__RX_REL_2%"></i></div><span class="pa05-badge">__RX_ICON_2__</span><span class="pa05-lbl t-purple">\u0425\u043E\u0440\u043E\u0448\u043E</span><span class="pa05-val">__RX_PCT_2__</span></div>\n<div class="pa05-col"><div class="pa05-track"><i class="f-blue" style="height:__RX_REL_3%"></i></div><span class="pa05-badge">__RX_ICON_3__</span><span class="pa05-lbl t-blue">\u041D\u043E\u0440\u043C</span><span class="pa05-val">__RX_PCT_3__</span></div>\n<div class="pa05-col"><div class="pa05-track"><i class="f-grey" style="height:__RX_REL_4%"></i></div><span class="pa05-badge">__RX_ICON_4__</span><span class="pa05-lbl t-grey">\u041F\u043B\u043E\u0445\u043E</span><span class="pa05-val">__RX_PCT_4__</span></div>\n<div class="pa05-col"><div class="pa05-track"><i class="f-green" style="height:__RX_REL_5%"></i></div><span class="pa05-badge">__RX_ICON_5__</span><span class="pa05-lbl t-green">\u0423\u0436\u0430\u0441</span><span class="pa05-val">__RX_PCT_5__</span></div>\n</div>\n<div class="pa05-btns">\n<a href="__PANAX_URL__" rel="noopener" target="_blank">PANAX<i>\u2197\uFE0E</i></a>\n<a href="__STEAM_URL__" rel="noopener" target="_blank">Steam<i>\u2197\uFE0E</i></a>\n<a href="__IGDB_URL__" rel="noopener" target="_blank">IGDB<i>\u2197\uFE0E</i></a>\n</div>\n</div>\n</div>' }, "glm-panax-vertical": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 06 \xB7 \u0412\u0415\u0420\u0422\u0418\u041A\u0410\u041B\u042C\u041D\u042B\u0419 \u041F\u041E\u0421\u0422\u0415\u0420 \xB7 PANAX \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n\n<div class="pa06">\n  <img class="pa06-cover" src="__COVER__" alt="__TITLE__">\n  <div class="pa06-shade"></div>\n  <div class="pa06-chip">PANAX \xB7 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430</div>\n  <div class="pa06-badge"><b>__POS_PCT__%</b><span>__TOP1_ICON__ PANAX</span></div>\n  <div class="pa06-body">\n    <h3 class="pa06-title">__TITLE__</h3>\n    <div class="pa06-meta">__YEAR__ \xB7 __DEV__</div>\n    <div class="pa06-stack"><i class="f-gold" style="flex-grow:19.6"></i><i class="f-orange" style="flex-grow:41.2"></i><i class="f-purple" style="flex-grow:37.3"></i><i class="f-grey" style="flex-grow:2"></i></div>\n    <div class="pa06-leg">\n      <div><span class="e">\u{1F947}</span>\u041B\u0435\u0433\u0435\u043D\u0434\u0430<b>19.6%</b></div>\n      <div><span class="e">\u{1F929}</span>\u041A\u0440\u0443\u0442\u043E<b>41.2%</b></div>\n      <div><span class="e">__TOP1_ICON__</span>\u0425\u043E\u0440\u043E\u0448\u043E<b>37.3%</b></div>\n      <div><span class="e">__TOP1_ICON__</span>\u041D\u043E\u0440\u043C<b>0.0%</b></div>\n      <div><span class="e">\u{1F641}</span>\u041F\u043B\u043E\u0445\u043E<b>2.0%</b></div>\n      <div><span class="e">\u{1F92E}</span>\u0423\u0436\u0430\u0441<b>0.0%</b></div>\n    </div>\n    <div class="pa06-genres">__GENRE_SPANS__</div>\n    <div class="pa06-btns">\n      <a class="p" href="__PANAX_URL__" target="_blank" rel="noopener">PANAX</a>\n      <a class="s" href="__STEAM_URL__" target="_blank" rel="noopener">Steam</a>\n      <a class="s" href="__IGDB_URL__" target="_blank" rel="noopener">IGDB</a>\n    </div>\n  </div>\n</div>' }, "glm-panax-crt": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 08 \xB7 CRT-\u0422\u0415\u0420\u041C\u0418\u041D\u0410\u041B \xB7 PANAX \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n\n<div class="pa08">\n  <div class="pa08-top"><span>/// \u041A\u0410\u0420\u0422\u041E\u0427\u041A\u0410 \u0418\u0413\u0420\u042B</span><span>PANAX.DAT</span></div>\n  <div class="pa08-prompt"><b>&gt;</b> panax.stats --id elden-ring</div>\n  <hr class="pa08-div">\n  <div class="pa08-title">__TITLE_UPPER__<span class="pa08-cursor"></span></div>\n  <div class="pa08-rows">\n    <div class="pa08-row"><span>\u0413\u041E\u0414</span><i></i><b>__YEAR__</b></div>\n    <div class="pa08-row"><span>\u0421\u0422\u0423\u0414\u0418\u042F</span><i></i><b>__DEV__</b></div>\n    <div class="pa08-row"><span>\u0418\u0417\u0414\u0410\u0422\u0415\u041B\u042C</span><i></i><b>Bandai Namco Entertainment</b></div>\n    <div class="pa08-row"><span>\u0416\u0410\u041D\u0420\u042B</span><i></i><b>\u044D\u043A\u0448\u0435\u043D-rpg / \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0439 \u043C\u0438\u0440 / souls-like</b></div>\n    <div class="pa08-row"><span>\u041F\u041B\u0410\u0422\u0424\u041E\u0420\u041C\u042B</span><i></i><b>PC \xB7 PS4/PS5 \xB7 Xbox One/Series</b></div>\n  </div>\n  <div class="pa08-bars">\n    <div class="pa08-bar-row"><span>\u041B\u0415\u0413\u0415\u041D\u0414\u0410</span><div class="bar"><i class="f-gold" style="width:48%"></i></div><em>19.6%</em></div>\n    <div class="pa08-bar-row"><span>\u041A\u0420\u0423\u0422\u041E</span><div class="bar"><i class="f-orange" style="width:100%"></i></div><em>41.2%</em></div>\n    <div class="pa08-bar-row"><span>\u0425\u041E\u0420\u041E\u0428\u041E</span><div class="bar"><i class="f-purple" style="width:91%"></i></div><em>37.3%</em></div>\n    <div class="pa08-bar-row"><span>\u041D\u041E\u0420\u041C</span><div class="bar"></div><em>0.0%</em></div>\n    <div class="pa08-bar-row"><span>\u041F\u041B\u041E\u0425\u041E</span><div class="bar"><i class="f-grey" style="width:5%"></i></div><em>2.0%</em></div>\n    <div class="pa08-bar-row"><span>\u0423\u0416\u0410\u0421</span><div class="bar"></div><em>0.0%</em></div>\n  </div>\n  <div class="pa08-verdict">\u0412\u0415\u0420\u0414\u0418\u041A\u0422 \u0421\u041E\u041E\u0411\u0429\u0415\u0421\u0422\u0412\u0410: \u041A\u0420\u0423\u0422\u041E \xB7 __POS_PCT__% \u041F\u041E\u041B\u041E\u0416\u0418\u0422\u0415\u041B\u042C\u041D\u042B\u0425 <span class="e">__TOP1_ICON__</span></div>\n  <div class="pa08-btns">\n    <a href="__PANAX_URL__" target="_blank" rel="noopener">[ PANAX ]</a>\n    <a href="__STEAM_URL__" target="_blank" rel="noopener">[ STEAM ]</a>\n    <a href="__IGDB_URL__" target="_blank" rel="noopener">[ IGDB ]</a>\n  </div>\n</div>' }, "glm-panax-snes": { "tw": false, "extra": "", "html": '<!-- \u2550\u2550\u2550 \u0412\u0418\u0414\u0416\u0415\u0422 09 \xB7 \u041A\u0410\u0420\u0422\u0420\u0418\u0414\u0416 SNES \xB7 PANAX \u2550\u2550\u2550\n     \u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0431\u043B\u043E\u043A \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u0432 HTML \u043E\u0431\u0437\u043E\u0440\u0430.\n     \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 src="__COVER__" \u043D\u0430 \u043F\u0440\u044F\u043C\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0432\u0430\u0448\u0443 \u043E\u0431\u043B\u043E\u0436\u043A\u0443. -->\n\n<div class="pa09">\n  <div class="pa09-ridges"></div>\n  <div class="pa09-label">\n    <div class="pa09-band"><span>16-BIT \xB7 \u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B</span><em>SN-__YEAR__</em></div>\n    <div class="pa09-stripe"></div>\n    <div class="pa09-body">\n      <div class="pa09-cov"><img src="__COVER__" alt="__TITLE__"></div>\n      <div class="pa09-info">\n        <h3 class="pa09-name">__TITLE__</h3>\n        <div class="pa09-meta">__META__</div>\n        <div class="pa09-genres">__GENRE_SPANS__</div>\n        <div class="pa09-stack"><i class="f-gold" style="flex-grow:19.6"></i><i class="f-orange" style="flex-grow:41.2"></i><i class="f-purple" style="flex-grow:37.3"></i><i class="f-grey" style="flex-grow:2"></i></div>\n        <div class="pa09-leg">\n          <div><span class="e">\u{1F947}</span>\u041B\u0435\u0433\u0435\u043D\u0434\u0430<b>19.6%</b></div>\n          <div><span class="e">\u{1F929}</span>\u041A\u0440\u0443\u0442\u043E<b>41.2%</b></div>\n          <div><span class="e">__TOP1_ICON__</span>\u0425\u043E\u0440\u043E\u0448\u043E<b>37.3%</b></div>\n          <div><span class="e">__TOP1_ICON__</span>\u041D\u043E\u0440\u043C<b>0.0%</b></div>\n          <div><span class="e">\u{1F641}</span>\u041F\u043B\u043E\u0445\u043E<b>2.0%</b></div>\n          <div><span class="e">\u{1F92E}</span>\u0423\u0436\u0430\u0441<b>0.0%</b></div>\n        </div>\n        <div class="pa09-verdict">\u041E\u043F\u0440\u043E\u0441 PANAX \xB7 \u0412\u0435\u0440\u0434\u0438\u043A\u0442: \u041A\u0440\u0443\u0442\u043E \xB7 __POS_PCT__%</div>\n      </div>\n    </div>\n  </div>\n  <div class="pa09-btns">\n    <a class="f1" href="__PANAX_URL__" target="_blank" rel="noopener">PANAX</a>\n    <a href="__STEAM_URL__" target="_blank" rel="noopener">Steam</a>\n    <a href="__IGDB_URL__" target="_blank" rel="noopener">IGDB</a>\n  </div>\n  <div class="pa09-serial">SLG \xB7 __YEAR__ \xB7 Made for review blogs</div>\n</div>' }, "gpt-halo": { "tw": false, "extra": "", "html": '<article class="pcard halo"><div class="halo-head"><div class="kicker">COMMUNITY REACTION</div><h2 class="game-title">__TITLE__</h2><div class="game-meta">__META_ITALIC__</div><div class="genres">__GENRE_SPANS__</div></div><div class="halo-main"><div class="halo-ring"><div class="halo-center"><img alt="\u041A\u0440\u0443\u0442\u043E" class="badge" loading="eager" src="__RX_BADGE_TOP1__"/><b>__RX_PCT_1__</b><span>\u041A\u0420\u0423\u0422\u041E</span></div></div><div class="halo-side"><div class="halo-caption">\u0427\u0430\u0449\u0435 \u0432\u0441\u0435\u0433\u043E \u0438\u0433\u0440\u043E\u043A\u0438 \u0432\u044B\u0431\u0438\u0440\u0430\u044E\u0442 \u0438\u043C\u0435\u043D\u043D\u043E \u044D\u0442\u0443 \u0440\u0435\u0430\u043A\u0446\u0438\u044E.</div><div class="halo-legend"><div><i style="--c:#f4d000"></i><span>\u041B\u0435\u0433\u0435\u043D\u0434\u0430</span><b>__RX_PCT_0__</b></div><div><i style="--c:#f5a000"></i><span>\u041A\u0440\u0443\u0442\u043E</span><b>__RX_PCT_1__</b></div><div><i style="--c:#bd55e9"></i><span>\u0425\u043E\u0440\u043E\u0448\u043E</span><b>__RX_PCT_2__</b></div><div><i style="--c:#299cf4"></i><span>\u041D\u043E\u0440\u043C</span><b>__RX_PCT_3__</b></div><div><i style="--c:#91aab4"></i><span>\u041F\u043B\u043E\u0445\u043E</span><b>__RX_PCT_4__</b></div><div><i style="--c:#e34b69"></i><span>\u0423\u0436\u0430\u0441</span><b>__RX_PCT_3__</b></div></div></div></div><div class="halo-foot"><img alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__" class="halo-thumb" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MDAgODAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIwIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzgxZDg4YSIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjMTk0ZDQ4Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMDcwZDEyIi8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9InN1biI+PHN0b3Agc3RvcC1jb2xvcj0iI2ZmZjZiYyIvPjxzdG9wIG9mZnNldD0iLjMiIHN0b3AtY29sb3I9IiNmN2Q3N2IiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmN2Q3N2IiIHN0b3Atb3BhY2l0eT0iMCIvPjwvcmFkaWFsR3JhZGllbnQ+PGxpbmVhckdyYWRpZW50IGlkPSJuIiB4Mj0iMSIgeTI9IjAiPjxzdG9wIHN0b3AtY29sb3I9IiNmNWVmYjUiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmZmZmZmYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjAwIiBoZWlnaHQ9IjgwMCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjQzMCIgY3k9IjE5MCIgcj0iMTU1IiBmaWxsPSJ1cmwoI3N1bikiLz48cGF0aCBkPSJNMCA1MDUgMjMwIDMwMCAzMzAgNDMwIDQzMCAzNDAgNjAwIDUxMFY4MDBIMFoiIGZpbGw9IiMxOTNiMzIiLz48cGF0aCBkPSJtMCA2MTAgMTc1LTE0NSAxNDAgMTMwIDEyNS0xODAgMTYwIDE1MHYyMzVIMFoiIGZpbGw9IiMwZDI5MjUiLz48cGF0aCBkPSJtMCA2OTAgMTgwLTg1IDE0NSA5MCAxMzUtODAgMTQwIDkwdjk1SDBaIiBmaWxsPSIjMDcxNTEyIi8+PGcgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iLjUiPjxjaXJjbGUgY3g9Ijc4IiBjeT0iMTMwIiByPSIzIi8+PGNpcmNsZSBjeD0iMTQ1IiBjeT0iMTgwIiByPSIyIi8+PGNpcmNsZSBjeD0iMjUwIiBjeT0iOTAiIHI9IjMiLz48Y2lyY2xlIGN4PSIzMzAiIGN5PSIyNDUiIHI9IjIiLz48Y2lyY2xlIGN4PSI1MDUiIGN5PSI4MCIgcj0iMiIvPjwvZz48L3N2Zz4="/><div><b>__TITLE__</b><small>__META__</small></div><a class="panax-link" href="YOUR_PANAX_GAME_URL" rel="noopener noreferrer" target="_blank">\u041E\u0446\u0435\u043D\u043A\u0438 \u043D\u0430 Panax<span aria-hidden="true">\u2197</span></a></div></article>' }, "gpt-bars": { "tw": false, "extra": "", "html": '<article class="pcard bars"><div class="bars-main"><img alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__" class="bars-cover" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MDAgODAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIwIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzgxZDg4YSIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjMTk0ZDQ4Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMDcwZDEyIi8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9InN1biI+PHN0b3Agc3RvcC1jb2xvcj0iI2ZmZjZiYyIvPjxzdG9wIG9mZnNldD0iLjMiIHN0b3AtY29sb3I9IiNmN2Q3N2IiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmN2Q3N2IiIHN0b3Atb3BhY2l0eT0iMCIvPjwvcmFkaWFsR3JhZGllbnQ+PGxpbmVhckdyYWRpZW50IGlkPSJuIiB4Mj0iMSIgeTI9IjAiPjxzdG9wIHN0b3AtY29sb3I9IiNmNWVmYjUiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmZmZmZmYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjAwIiBoZWlnaHQ9IjgwMCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjQzMCIgY3k9IjE5MCIgcj0iMTU1IiBmaWxsPSJ1cmwoI3N1bikiLz48cGF0aCBkPSJNMCA1MDUgMjMwIDMwMCAzMzAgNDMwIDQzMCAzNDAgNjAwIDUxMFY4MDBIMFoiIGZpbGw9IiMxOTNiMzIiLz48cGF0aCBkPSJtMCA2MTAgMTc1LTE0NSAxNDAgMTMwIDEyNS0xODAgMTYwIDE1MHYyMzVIMFoiIGZpbGw9IiMwZDI5MjUiLz48cGF0aCBkPSJtMCA2OTAgMTgwLTg1IDE0NSA5MCAxMzUtODAgMTQwIDkwdjk1SDBaIiBmaWxsPSIjMDcxNTEyIi8+PGcgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iLjUiPjxjaXJjbGUgY3g9Ijc4IiBjeT0iMTMwIiByPSIzIi8+PGNpcmNsZSBjeD0iMTQ1IiBjeT0iMTgwIiByPSIyIi8+PGNpcmNsZSBjeD0iMjUwIiBjeT0iOTAiIHI9IjMiLz48Y2lyY2xlIGN4PSIzMzAiIGN5PSIyNDUiIHI9IjIiLz48Y2lyY2xlIGN4PSI1MDUiIGN5PSI4MCIgcj0iMiIvPjwvZz48L3N2Zz4="/><div class="bars-copy"><div class="kicker">PANAX PLAYER DATA</div><h2 class="game-title">__TITLE__</h2><div class="game-meta">__META_ITALIC__</div><div class="genres">__GENRE_SPANS__</div><div class="bars-verdict"><img alt="\u041A\u0440\u0443\u0442\u043E" class="badge" loading="eager" src="__RX_BADGE_1__"/><div><small>\u041B\u0418\u0414\u0418\u0420\u0423\u042E\u0429\u0410\u042F \u0420\u0415\u0410\u041A\u0426\u0418\u042F</small><b>\u041A\u0440\u0443\u0442\u043E <em>__RX_PCT_1__</em></b></div></div></div></div><div class="bars-chart"><div class="bars-chart-top"><span>\u041A\u0410\u0420\u0422\u0410 \u0420\u0415\u0410\u041A\u0426\u0418\u0419</span><span>\u0414\u041E\u041B\u042F \u0413\u041E\u041B\u041E\u0421\u041E\u0412</span></div><div class="bars-row"><div class="bar-col" style="--c:#f4d000;--h:__RX_PCT_0__"><i></i><span>\u041B\u0435\u0433\u0435\u043D\u0434\u0430</span></div><div class="bar-col" style="--c:#f5a000;--h:__RX_PCT_1__"><i></i><span>\u041A\u0440\u0443\u0442\u043E</span></div><div class="bar-col" style="--c:#bd55e9;--h:__RX_PCT_2__"><i></i><span>\u0425\u043E\u0440\u043E\u0448\u043E</span></div><div class="bar-col" style="--c:#299cf4;--h:1.3%"><i></i><span>\u041D\u043E\u0440\u043C</span></div><div class="bar-col" style="--c:#91aab4;--h:__RX_PCT_4__"><i></i><span>\u041F\u043B\u043E\u0445\u043E</span></div><div class="bar-col" style="--c:#e34b69;--h:1.3%"><i></i><span>\u0423\u0436\u0430\u0441</span></div></div></div><div class="bars-foot">\u0421\u043E\u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0435 \u0432\u0441\u0435\u0445 \u0440\u0435\u0430\u043A\u0446\u0438\u0439 \u0441\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u0430 <a class="panax-link" href="YOUR_PANAX_GAME_URL" rel="noopener noreferrer" target="_blank">\u041E\u0446\u0435\u043D\u043A\u0438 \u043D\u0430 Panax<span aria-hidden="true">\u2197</span></a></div></article>' }, "gpt-poster": { "tw": false, "extra": "", "html": '<article class="pcard poster"><div class="poster-art"><img alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__" class="poster-cover" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MDAgODAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIwIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzgxZDg4YSIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjMTk0ZDQ4Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMDcwZDEyIi8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9InN1biI+PHN0b3Agc3RvcC1jb2xvcj0iI2ZmZjZiYyIvPjxzdG9wIG9mZnNldD0iLjMiIHN0b3AtY29sb3I9IiNmN2Q3N2IiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmN2Q3N2IiIHN0b3Atb3BhY2l0eT0iMCIvPjwvcmFkaWFsR3JhZGllbnQ+PGxpbmVhckdyYWRpZW50IGlkPSJuIiB4Mj0iMSIgeTI9IjAiPjxzdG9wIHN0b3AtY29sb3I9IiNmNWVmYjUiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmZmZmZmYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjAwIiBoZWlnaHQ9IjgwMCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjQzMCIgY3k9IjE5MCIgcj0iMTU1IiBmaWxsPSJ1cmwoI3N1bikiLz48cGF0aCBkPSJNMCA1MDUgMjMwIDMwMCAzMzAgNDMwIDQzMCAzNDAgNjAwIDUxMFY4MDBIMFoiIGZpbGw9IiMxOTNiMzIiLz48cGF0aCBkPSJtMCA2MTAgMTc1LTE0NSAxNDAgMTMwIDEyNS0xODAgMTYwIDE1MHYyMzVIMFoiIGZpbGw9IiMwZDI5MjUiLz48cGF0aCBkPSJtMCA2OTAgMTgwLTg1IDE0NSA5MCAxMzUtODAgMTQwIDkwdjk1SDBaIiBmaWxsPSIjMDcxNTEyIi8+PGcgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iLjUiPjxjaXJjbGUgY3g9Ijc4IiBjeT0iMTMwIiByPSIzIi8+PGNpcmNsZSBjeD0iMTQ1IiBjeT0iMTgwIiByPSIyIi8+PGNpcmNsZSBjeD0iMjUwIiBjeT0iOTAiIHI9IjMiLz48Y2lyY2xlIGN4PSIzMzAiIGN5PSIyNDUiIHI9IjIiLz48Y2lyY2xlIGN4PSI1MDUiIGN5PSI4MCIgcj0iMiIvPjwvZz48L3N2Zz4="/><div class="poster-shade"></div><div class="poster-words"><div class="poster-overline">VOIDLINE STUDIO PRESENTS</div><h2>NEON<br/>REQUIEM</h2><div class="poster-sub">2025 \xB7 ACTION RPG \xB7 OPEN WORLD</div></div><div class="poster-stamp"><img alt="\u041A\u0440\u0443\u0442\u043E" class="badge" loading="eager" src="__RX_BADGE_TOP1__"/><span>\u0427\u0410\u0429\u0415 \u0412\u0421\u0415\u0413\u041E</span><b>\u041A\u0420\u0423\u0422\u041E</b><strong>__RX_PCT_1__</strong></div></div><div class="poster-bottom"><div><small>\u041A\u0410\u041A \u041E\u0422\u0420\u0415\u0410\u0413\u0418\u0420\u041E\u0412\u0410\u041B\u0418 \u0418\u0413\u0420\u041E\u041A\u0418</small><div aria-label="\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0448\u0435\u0441\u0442\u0438 \u0440\u0435\u0430\u043A\u0446\u0438\u0439" class="stacked" role="img"><i style="--c:#f4d000;--w:__RX_PCT_0__" title="\u041B\u0435\u0433\u0435\u043D\u0434\u0430: __RX_PCT_0__"></i><i style="--c:#f5a000;--w:__RX_PCT_1__" title="\u041A\u0440\u0443\u0442\u043E: __RX_PCT_1__"></i><i style="--c:#bd55e9;--w:__RX_PCT_2__" title="\u0425\u043E\u0440\u043E\u0448\u043E: __RX_PCT_2__"></i><i style="--c:#299cf4;--w:__RX_PCT_3__" title="\u041D\u043E\u0440\u043C: __RX_PCT_3__"></i><i style="--c:#91aab4;--w:__RX_PCT_4__" title="\u041F\u043B\u043E\u0445\u043E: __RX_PCT_4__"></i><i style="--c:#e34b69;--w:__RX_PCT_3__" title="\u0423\u0436\u0430\u0441: __RX_PCT_3__"></i></div></div><a class="panax-link" href="YOUR_PANAX_GAME_URL" rel="noopener noreferrer" target="_blank">\u041E\u0446\u0435\u043D\u043A\u0438 \u043D\u0430 Panax<span aria-hidden="true">\u2197</span></a></div></article>' }, "gpt-ticket": { "tw": false, "extra": "", "html": '<article class="pcard ticket"><div class="ticket-left"><img alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__" class="ticket-cover" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MDAgODAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIwIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzgxZDg4YSIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjMTk0ZDQ4Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMDcwZDEyIi8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9InN1biI+PHN0b3Agc3RvcC1jb2xvcj0iI2ZmZjZiYyIvPjxzdG9wIG9mZnNldD0iLjMiIHN0b3AtY29sb3I9IiNmN2Q3N2IiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmN2Q3N2IiIHN0b3Atb3BhY2l0eT0iMCIvPjwvcmFkaWFsR3JhZGllbnQ+PGxpbmVhckdyYWRpZW50IGlkPSJuIiB4Mj0iMSIgeTI9IjAiPjxzdG9wIHN0b3AtY29sb3I9IiNmNWVmYjUiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmZmZmZmYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjAwIiBoZWlnaHQ9IjgwMCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjQzMCIgY3k9IjE5MCIgcj0iMTU1IiBmaWxsPSJ1cmwoI3N1bikiLz48cGF0aCBkPSJNMCA1MDUgMjMwIDMwMCAzMzAgNDMwIDQzMCAzNDAgNjAwIDUxMFY4MDBIMFoiIGZpbGw9IiMxOTNiMzIiLz48cGF0aCBkPSJtMCA2MTAgMTc1LTE0NSAxNDAgMTMwIDEyNS0xODAgMTYwIDE1MHYyMzVIMFoiIGZpbGw9IiMwZDI5MjUiLz48cGF0aCBkPSJtMCA2OTAgMTgwLTg1IDE0NSA5MCAxMzUtODAgMTQwIDkwdjk1SDBaIiBmaWxsPSIjMDcxNTEyIi8+PGcgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iLjUiPjxjaXJjbGUgY3g9Ijc4IiBjeT0iMTMwIiByPSIzIi8+PGNpcmNsZSBjeD0iMTQ1IiBjeT0iMTgwIiByPSIyIi8+PGNpcmNsZSBjeD0iMjUwIiBjeT0iOTAiIHI9IjMiLz48Y2lyY2xlIGN4PSIzMzAiIGN5PSIyNDUiIHI9IjIiLz48Y2lyY2xlIGN4PSI1MDUiIGN5PSI4MCIgcj0iMiIvPjwvZz48L3N2Zz4="/><div class="ticket-side">PANAX COMMUNITY \xB7 2025</div></div><div class="ticket-right"><div class="ticket-meta">GAME ENTRY / \u2116 025</div><h2>Neon<br/>Requiem</h2><div class="ticket-studio">Voidline Studio \xB7 Nova Interactive</div><div class="ticket-genres">ACTION RPG\xA0 / \xA0CYBERPUNK\xA0 / \xA0OPEN WORLD</div><div class="ticket-seal"><img alt="\u041A\u0440\u0443\u0442\u043E" class="badge" loading="eager" src="__RX_BADGE_1__"/><div><small>\u0413\u041B\u0410\u0412\u041D\u0410\u042F \u0420\u0415\u0410\u041A\u0426\u0418\u042F</small><b>\u041A\u0440\u0443\u0442\u043E</b><strong>__RX_PCT_1__</strong></div></div><div class="ticket-foot"><div aria-label="\u0426\u0432\u0435\u0442\u0430 \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0445 \u0440\u0435\u0430\u043A\u0446\u0438\u0439" class="mini-dots"><i style="--c:#f4d000" title="\u041B\u0435\u0433\u0435\u043D\u0434\u0430: __RX_PCT_0__"></i><i style="--c:#f5a000" title="\u041A\u0440\u0443\u0442\u043E: __RX_PCT_1__"></i><i style="--c:#bd55e9" title="\u0425\u043E\u0440\u043E\u0448\u043E: __RX_PCT_2__"></i><i style="--c:#299cf4" title="\u041D\u043E\u0440\u043C: __RX_PCT_3__"></i><i style="--c:#91aab4" title="\u041F\u043B\u043E\u0445\u043E: __RX_PCT_4__"></i><i style="--c:#e34b69" title="\u0423\u0436\u0430\u0441: __RX_PCT_3__"></i></div><span>\u0420\u0415\u0410\u041A\u0426\u0418\u0418 \u0418\u0413\u0420\u041E\u041A\u041E\u0412</span><a class="ticket-link" href="YOUR_PANAX_GAME_URL" rel="noopener noreferrer" target="_blank">PANAX \u2197<span aria-hidden="true">\u2197</span></a></div></div></article>' }, "gpt-editorial": { "tw": false, "extra": "", "html": '<article class="pcard editorial"><div class="editorial-top"><div><div class="editorial-index">REVIEW INDEX <span>\u2116 09</span></div><h2>Neon<br/><i>Requiem</i></h2><p>2025 / Voidline Studio / Nova Interactive</p><div class="editorial-tags">ACTION RPG \xA0\u2014\xA0 CYBERPUNK \xA0\u2014\xA0 OPEN WORLD</div></div><img alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__" class="editorial-cover" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MDAgODAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIwIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzgxZDg4YSIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjMTk0ZDQ4Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMDcwZDEyIi8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9InN1biI+PHN0b3Agc3RvcC1jb2xvcj0iI2ZmZjZiYyIvPjxzdG9wIG9mZnNldD0iLjMiIHN0b3AtY29sb3I9IiNmN2Q3N2IiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmN2Q3N2IiIHN0b3Atb3BhY2l0eT0iMCIvPjwvcmFkaWFsR3JhZGllbnQ+PGxpbmVhckdyYWRpZW50IGlkPSJuIiB4Mj0iMSIgeTI9IjAiPjxzdG9wIHN0b3AtY29sb3I9IiNmNWVmYjUiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmZmZmZmYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjAwIiBoZWlnaHQ9IjgwMCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjQzMCIgY3k9IjE5MCIgcj0iMTU1IiBmaWxsPSJ1cmwoI3N1bikiLz48cGF0aCBkPSJNMCA1MDUgMjMwIDMwMCAzMzAgNDMwIDQzMCAzNDAgNjAwIDUxMFY4MDBIMFoiIGZpbGw9IiMxOTNiMzIiLz48cGF0aCBkPSJtMCA2MTAgMTc1LTE0NSAxNDAgMTMwIDEyNS0xODAgMTYwIDE1MHYyMzVIMFoiIGZpbGw9IiMwZDI5MjUiLz48cGF0aCBkPSJtMCA2OTAgMTgwLTg1IDE0NSA5MCAxMzUtODAgMTQwIDkwdjk1SDBaIiBmaWxsPSIjMDcxNTEyIi8+PGcgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iLjUiPjxjaXJjbGUgY3g9Ijc4IiBjeT0iMTMwIiByPSIzIi8+PGNpcmNsZSBjeD0iMTQ1IiBjeT0iMTgwIiByPSIyIi8+PGNpcmNsZSBjeD0iMjUwIiBjeT0iOTAiIHI9IjMiLz48Y2lyY2xlIGN4PSIzMzAiIGN5PSIyNDUiIHI9IjIiLz48Y2lyY2xlIGN4PSI1MDUiIGN5PSI4MCIgcj0iMiIvPjwvZz48L3N2Zz4="/></div><div class="editorial-rule"></div><div class="editorial-verdict"><div class="editorial-label">\u0413\u041E\u041B\u041E\u0421 \u0421\u041E\u041E\u0411\u0429\u0415\u0421\u0422\u0412\u0410</div><div class="editorial-main-reaction"><img alt="\u041A\u0440\u0443\u0442\u043E" class="badge" loading="eager" src="__RX_BADGE_1__"/><div><span>\u041F\u0420\u0415\u041E\u0411\u041B\u0410\u0414\u0410\u042E\u0429\u0410\u042F \u0420\u0415\u0410\u041A\u0426\u0418\u042F</span><b>\u041A\u0440\u0443\u0442\u043E</b></div><strong>41.2<small>%</small></strong></div><div class="editorial-spectrum"><i style="--c:#f4d000;--w:__RX_PCT_0__"></i><i style="--c:#f5a000;--w:__RX_PCT_1__"></i><i style="--c:#bd55e9;--w:__RX_PCT_2__"></i><i style="--c:#299cf4;--w:__RX_PCT_3__"></i><i style="--c:#91aab4;--w:__RX_PCT_4__"></i><i style="--c:#e34b69;--w:__RX_PCT_3__"></i></div><div class="editorial-foot"><span>\u0428\u0415\u0421\u0422\u042C \u0421\u041F\u041E\u0421\u041E\u0411\u041E\u0412 \u041E\u0422\u0420\u0415\u0410\u0413\u0418\u0420\u041E\u0412\u0410\u0422\u042C</span><a class="panax-link" href="YOUR_PANAX_GAME_URL" rel="noopener noreferrer" target="_blank">\u041E\u0446\u0435\u043D\u043A\u0438 \u043D\u0430 Panax<span aria-hidden="true">\u2197</span></a></div></div></article>' }, "gpt-capsule": { "tw": false, "extra": "", "html": '<article class="pcard capsule"><div class="capsule-left"><img alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__" class="capsule-cover" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MDAgODAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIwIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzgxZDg4YSIvPjxzdG9wIG9mZnNldD0iLjUyIiBzdG9wLWNvbG9yPSIjMTk0ZDQ4Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMDcwZDEyIi8+PC9saW5lYXJHcmFkaWVudD48cmFkaWFsR3JhZGllbnQgaWQ9InN1biI+PHN0b3Agc3RvcC1jb2xvcj0iI2ZmZjZiYyIvPjxzdG9wIG9mZnNldD0iLjMiIHN0b3AtY29sb3I9IiNmN2Q3N2IiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmN2Q3N2IiIHN0b3Atb3BhY2l0eT0iMCIvPjwvcmFkaWFsR3JhZGllbnQ+PGxpbmVhckdyYWRpZW50IGlkPSJuIiB4Mj0iMSIgeTI9IjAiPjxzdG9wIHN0b3AtY29sb3I9IiNmNWVmYjUiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmZmZmZmYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNjAwIiBoZWlnaHQ9IjgwMCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjQzMCIgY3k9IjE5MCIgcj0iMTU1IiBmaWxsPSJ1cmwoI3N1bikiLz48cGF0aCBkPSJNMCA1MDUgMjMwIDMwMCAzMzAgNDMwIDQzMCAzNDAgNjAwIDUxMFY4MDBIMFoiIGZpbGw9IiMxOTNiMzIiLz48cGF0aCBkPSJtMCA2MTAgMTc1LTE0NSAxNDAgMTMwIDEyNS0xODAgMTYwIDE1MHYyMzVIMFoiIGZpbGw9IiMwZDI5MjUiLz48cGF0aCBkPSJtMCA2OTAgMTgwLTg1IDE0NSA5MCAxMzUtODAgMTQwIDkwdjk1SDBaIiBmaWxsPSIjMDcxNTEyIi8+PGcgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iLjUiPjxjaXJjbGUgY3g9Ijc4IiBjeT0iMTMwIiByPSIzIi8+PGNpcmNsZSBjeD0iMTQ1IiBjeT0iMTgwIiByPSIyIi8+PGNpcmNsZSBjeD0iMjUwIiBjeT0iOTAiIHI9IjMiLz48Y2lyY2xlIGN4PSIzMzAiIGN5PSIyNDUiIHI9IjIiLz48Y2lyY2xlIGN4PSI1MDUiIGN5PSI4MCIgcj0iMiIvPjwvZz48L3N2Zz4="/><div class="capsule-caption"><span>GAME PROFILE</span><b>__TITLE__</b><small>__META__</small><div class="capsule-genres">Action RPG / Cyberpunk / Open world</div></div></div><div class="capsule-right"><div class="capsule-orb"><img alt="\u041A\u0440\u0443\u0442\u043E" class="badge" loading="eager" src="__RX_BADGE_1__"/><span>__RX_PCT_1__</span></div><div class="capsule-mood">\u0427\u0410\u0429\u0415 \u0412\u0421\u0415\u0413\u041E \u0412\u042B\u0411\u0418\u0420\u0410\u042E\u0422</div><h3>\u041A\u0440\u0443\u0442\u043E</h3><p>\u0413\u043B\u0430\u0432\u043D\u0430\u044F \u0440\u0435\u0430\u043A\u0446\u0438\u044F \u0438\u0433\u0440\u043E\u043A\u043E\u0432 \u043D\u0430 Panax.</p><div class="capsule-dots"><div aria-label="\u0426\u0432\u0435\u0442\u0430 \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0445 \u0440\u0435\u0430\u043A\u0446\u0438\u0439" class="mini-dots"><i style="--c:#f4d000" title="\u041B\u0435\u0433\u0435\u043D\u0434\u0430: __RX_PCT_0__"></i><i style="--c:#f5a000" title="\u041A\u0440\u0443\u0442\u043E: __RX_PCT_1__"></i><i style="--c:#bd55e9" title="\u0425\u043E\u0440\u043E\u0448\u043E: __RX_PCT_2__"></i><i style="--c:#299cf4" title="\u041D\u043E\u0440\u043C: __RX_PCT_3__"></i><i style="--c:#91aab4" title="\u041F\u043B\u043E\u0445\u043E: __RX_PCT_4__"></i><i style="--c:#e34b69" title="\u0423\u0436\u0430\u0441: __RX_PCT_3__"></i></div></div><a class="panax-link" href="YOUR_PANAX_GAME_URL" rel="noopener noreferrer" target="_blank">\u041E\u0446\u0435\u043D\u043A\u0438 \u043D\u0430 Panax<span aria-hidden="true">\u2197</span></a></div></article>' }, "panax4-bars": { "tw": false, "extra": "", "html": '<article class="card v1">\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div class="body">\n<div class="kick">\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B \xB7 panaaxgames</div>\n<div class="title">__TITLE__</div>\n<div class="meta">__META__</div>\n<div class="tags">__GENRE_SPANS__</div>\n<div class="row" style="flex-direction:column;align-items:flex-start;gap:0">\n<span class="pill" style="--c:__TOP1_COLOR__">__TOP1_NAME__ <b>__TOP1_INT__%</b></span>\n__PANAX4_MINI_BARS__\n</div>\n<div class="row"><a class="btn" href="__PANAX_URL__">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 panaaxgames \u2192</a></div>\n</div>\n</article>' }, "panax4-medal": { "tw": false, "extra": "", "html": '<article class="card v2">\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div class="body">\n<div class="kick">\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B \xB7 panaaxgames</div>\n<div class="title">__TITLE__</div>\n<div class="meta">__META__</div>\n<div class="tags">__GENRE_SPANS__</div>\n<div class="row">\n__PANAX4_MEDAL_ROW__\n</div>\n<div class="foot"><a class="btn" href="__PANAX_URL__">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u2192</a></div>\n</div>\n</article>' }, "panax4-gradient": { "tw": false, "extra": "", "html": '<article class="card v3">\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div class="body">\n<div class="kick">\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B \xB7 panaaxgames</div>\n<div class="title">__TITLE__</div>\n<div class="meta">__META__</div>\n<div class="tags">__GENRE_SPANS__</div>\n<div class="lbl"><span>\u041E\u0446\u0435\u043D\u043A\u0438 \u0438\u0433\u0440\u043E\u043A\u043E\u0432</span><span>\u0414\u043E\u043C\u0438\u043D\u0438\u0440\u0443\u0435\u0442 <b>\u041A\u0440\u0443\u0442\u043E</b></span></div>\n__PANAX4_STRIP__\n<div class="foot"><a class="btn" href="__PANAX_URL__">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 panaaxgames \u2192</a></div>\n</div>\n</article>' }, "panax4-scale": { "tw": false, "extra": "", "html": '<article class="card v4">\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div class="body">\n<div class="kick">\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B \xB7 panaaxgames</div>\n<div class="title">__TITLE__</div>\n<div class="meta">__META__</div>\n<div class="tags">__GENRE_SPANS__</div>\n<div class="track" style="--c:#f59e0b"><span class="knob" data-l="\u041A\u0440\u0443\u0442\u043E" style="--x:60%;--c:#f59e0b"></span></div>\n<div class="ends"><span>\u0423\u0436\u0430\u0441</span><span>\u041D\u043E\u0440\u043C</span><span>\u041B\u0435\u0433\u0435\u043D\u0434\u0430</span></div>\n<div class="pct">\u0411\u043E\u043B\u044C\u0448\u0435 \u0432\u0441\u0435\u0433\u043E \u0433\u043E\u043B\u043E\u0441\u043E\u0432: <b>\u041A\u0440\u0443\u0442\u043E 41%</b></div>\n<div class="foot"><a class="btn" href="__PANAX_URL__">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u2192</a></div>\n</div>\n</article>' }, "kimi-editorial": { "tw": false, "extra": "kimi-scope", "html": '<article class="game-widget w-editorial" aria-label="\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B __TITLE__">\n      <img class="cover" src="__COVER__" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__">\n      <div class="editorial-main"><p class="w-kicker">\u0418\u0437 \u0431\u0430\u0437\u044B \xB7 <span class="source-name">__SCORE_SRC__</span></p><h3>__TITLE__</h3><p class="editorial-deck">__GENRES_DOT__ \xB7 __YEAR__</p><div class="meta"><span>__YEAR__</span><span>__DEV__</span><span>__GENRE_0__</span></div><a class="widget-link source-link" href="__PANAX_URL__" target="_blank" rel="noopener noreferrer"><span class="source-name">__SCORE_SRC__</span><span aria-hidden="true">\u2197</span></a></div>\n      <div class="editorial-score"><span>\u041E\u0446\u0435\u043D\u043A\u0430</span><strong class="score-value">__SCORE10__</strong><small>/ 10</small></div>\n    </article>' }, "kimi-swiss": { "tw": false, "extra": "kimi-scope", "html": '<article class="game-widget w-swiss" aria-label="\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B __TITLE__">\n      <div class="swiss-head"><span>GAME / __YEAR__</span><span>DATABASE ENTRY</span></div>\n      <div class="swiss-grid"><img class="cover" src="__COVER__" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__"><div class="swiss-title"><p>__GENRE_0__ \xB7 __GENRE_1__</p><h3>__TITLE__</h3><div class="meta">__DEV__<br>__PUB__</div></div><div class="swiss-score"><span>USER SCORE</span><strong class="score-value">__SCORE10__</strong><div class="score-track"><i style="width:__SCORE_PCT_NUM__%"></i></div></div></div>\n      <div class="swiss-foot"><span>__YEAR__ / __GENRE_2__</span><a class="widget-link source-link" href="__PANAX_URL__" target="_blank" rel="noopener noreferrer"><span class="source-name">__SCORE_SRC__</span><span aria-hidden="true">\u2197</span></a></div>\n    </article>' }, "kimi-terminal": { "tw": false, "extra": "kimi-scope", "html": '<article class="game-widget w-terminal" aria-label="\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B __TITLE__">\n      <div class="terminal-top"><span>// GAME_PROFILE.EXE</span><span class="terminal-status">\u25CF VERIFIED</span></div>\n      <div class="terminal-body"><img class="cover" src="__COVER__" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__"><div><p class="terminal-path">~/database/__YEAR__</p><h3>__TITLE_UPPER__</h3><dl><div><dt>DEVELOPER</dt><dd>__DEV__</dd></div><div><dt>PUBLISHER</dt><dd>__PUB__</dd></div><div><dt>TAGS</dt><dd>__GENRES_DOT__</dd></div></dl></div></div>\n      <div class="terminal-rating"><span>RATING [<i class="terminal-bars">__ASCII_BAR__</i>] <b class="score-value">__SCORE10__</b></span><a class="widget-link source-link" href="__PANAX_URL__" target="_blank" rel="noopener noreferrer"><span class="source-name">__SCORE_SRC__</span><span aria-hidden="true">\u2197</span></a></div>\n    </article>' }, "kimi-ticket": { "tw": false, "extra": "kimi-scope", "html": '<article class="game-widget w-ticket" aria-label="\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B __TITLE__">\n      <div class="ticket-stub"><span>ADMIT ONE</span><b>NR<br>25</b><small>GAME PASS</small></div>\n      <img class="cover" src="__COVER__" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__">\n      <div class="ticket-info"><p>__DEV__</p><h3>__TITLE__</h3><div class="meta"><span>__YEAR__</span><span>__GENRE_0__</span><span>__GENRE_2__</span></div><a class="widget-link source-link" href="__PANAX_URL__" target="_blank" rel="noopener noreferrer"><span class="source-name">__SCORE_SRC__</span><span aria-hidden="true">\u2197</span></a></div>\n      <div class="ticket-score"><span>RATING</span><strong class="score-value">__SCORE10__</strong><small class="source-name">__SCORE_SRC__</small></div>\n    </article>' }, "kimi-cinema": { "tw": false, "extra": "kimi-scope", "html": '<article class="game-widget w-cinema" aria-label="\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B __TITLE__">\n      <img class="cinema-art" src="__COVER__" alt="">\n      <div class="cinema-shade"></div>\n      <div class="cinema-top"><span>__DEV__</span><div><b class="score-value">__SCORE10__</b><small>/10</small></div></div>\n      <div class="cinema-bottom"><p>__YEAR__ \xB7 __GENRE_0__ \xB7 __GENRE_1__</p><h3>__TITLE__</h3><div><span class="source-caption">\u041E\u0446\u0435\u043D\u043A\u0430 <span class="source-name">__SCORE_SRC__</span></span><a class="widget-link source-link" href="__PANAX_URL__" target="_blank" rel="noopener noreferrer"><span class="source-name">__SCORE_SRC__</span><span aria-hidden="true">\u2197</span></a></div></div>\n    </article>' }, "kimi-inline": { "tw": false, "extra": "kimi-scope", "html": '<article class="game-widget w-inline" aria-label="\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B __TITLE__">\n      <img class="cover" src="__COVER__" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__">\n      <div class="inline-title"><p><span class="source-name">__SCORE_SRC__</span> \xB7 __YEAR__</p><h3>__TITLE__</h3><span>__GENRE_0__ \xB7 __DEV__</span></div>\n      <div class="inline-score"><strong class="score-value">__SCORE10__</strong><span>/ 10</span></div><a class="widget-link source-link" href="__PANAX_URL__" target="_blank" rel="noopener noreferrer"><span class="source-name">__SCORE_SRC__</span><span aria-hidden="true">\u2197</span></a>\n    </article>' }, "kimi-brutal": { "tw": false, "extra": "kimi-scope", "html": '<article class="game-widget w-brutal" aria-label="\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B __TITLE__">\n      <div class="brutal-label">GAME OF THE WEEK!</div>\n      <div class="brutal-body"><img class="cover" src="__COVER__" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__"><div class="brutal-copy"><p>__YEAR__ // __DEV__</p><h3>__TITLE_UPPER__</h3><div class="brutal-tags"><span>__GENRE_0__</span><span>__GENRE_1__</span></div></div><div class="brutal-score"><strong class="score-value">__SCORE10__</strong><span>OUT OF 10</span></div></div>\n      <div class="brutal-foot"><span class="source-caption">SCORE VIA <b class="source-name">__SCORE_SRC__</b></span><a class="widget-link source-link" href="__PANAX_URL__" target="_blank" rel="noopener noreferrer"><span class="source-name">__SCORE_SRC__</span><span aria-hidden="true">\u2197</span></a></div>\n    </article>' }, "kimi-poster": { "tw": false, "extra": "kimi-scope", "html": '<article class="game-widget w-poster" aria-label="\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B __TITLE__">\n      <span class="poster-ghost" aria-hidden="true">NR</span><p class="poster-index">GAME CARD \u2014 \u2116 __YEAR__</p>\n      <img class="cover" src="__COVER__" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__">\n      <div class="poster-copy"><p>__DEV__ / __YEAR__</p><h3>__TITLE__</h3><span>__GENRE_0__ \xB7 __GENRE_1__<br>__GENRE_2__</span></div>\n      <div class="poster-score"><strong class="score-value">__SCORE10__</strong><span>USER RATING<br><span class="source-name">__SCORE_SRC__</span></span></div>\n      <div class="poster-link"><a class="widget-link source-link" href="__PANAX_URL__" target="_blank" rel="noopener noreferrer"><span class="source-name">__SCORE_SRC__</span><span aria-hidden="true">\u2197</span></a></div>\n    </article>' }, "kimi-dock": { "tw": false, "extra": "kimi-scope", "html": '<article class="game-widget w-dock" aria-label="\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B __TITLE__">\n      <img class="cover" src="__COVER__" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__">\n      <div class="dock-info"><p>GAME PROFILE / __YEAR__</p><h3>__TITLE__</h3><span>__DEV__ \xB7 __GENRE_0__</span><div class="dock-platforms">PC&nbsp;&nbsp; PS5&nbsp;&nbsp; XSX</div></div>\n      <div class="dock-score"><svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34"></circle><circle class="dock-progress" style="stroke-dasharray:__DOCK_DASH__" cx="40" cy="40" r="34"></circle></svg><div><strong class="score-value">__SCORE10__</strong><span class="source-name">__SCORE_SRC__</span></div></div>\n      <a class="widget-link source-link" href="__PANAX_URL__" target="_blank" rel="noopener noreferrer"><span class="source-name">__SCORE_SRC__</span><span aria-hidden="true">\u2197</span></a>\n    </article>' }, "kimi-cartridge": { "tw": false, "extra": "kimi-scope", "html": '<article class="game-widget w-cartridge" aria-label="\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B __TITLE__">\n      <div class="cartridge-grip"><i></i><i></i><i></i><i></i><i></i></div>\n      <div class="cartridge-label"><img class="cover" src="__COVER__" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 __TITLE__"><div><p>__DEV__ / __YEAR__</p><h3>__TITLE_UPPER__</h3><span>__GENRE_0__ \xB7 1 PLAYER</span></div><div class="cartridge-score"><strong class="score-value">__SCORE10__</strong><small>/10</small></div></div>\n      <div class="cartridge-foot"><span>RATING SOURCE: <b class="source-name">__SCORE_SRC__</b></span><a class="widget-link source-link" href="__PANAX_URL__" target="_blank" rel="noopener noreferrer"><span class="source-name">__SCORE_SRC__</span><span aria-hidden="true">\u2197</span></a></div>\n    </article>' }, "son-spectrum": { "tw": false, "extra": "son-p-scope", "html": '<article class="h1 g">\n<div class="src">panaaxgames \xB7 __TITLE__</div>\n__SON_H1_BODY__\n<a class="btn" href="__PANAX_URL__" style="margin-top:14px">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 panaaxgames \u2192</a>\n</article>' }, "son-waffle": { "tw": false, "extra": "son-p-scope", "html": '<article class="h2 g">\n<div class="wf">__SON_WAFFLE__</div>\n<div class="info">\n<div class="src">panaaxgames</div>\n<div class="ttl" style="margin:4px 0">__TITLE__</div>\n<div class="lvl" style="--c:__TOP1_COLOR__">__TOP1_NAME__ \xB7 __TOP1_INT__%</div>\n<div class="mt" style="color:#555;margin-top:6px">\u041A\u0430\u0436\u0434\u044B\u0439 \u043A\u0432\u0430\u0434\u0440\u0430\u0442 \u2014 1% \u0438\u0433\u0440\u043E\u043A\u043E\u0432</div>\n<a class="btn" href="__PANAX_URL__" style="margin-top:12px">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u2192</a>\n</div>\n</article>' }, "son-wave": { "tw": false, "extra": "son-p-scope", "html": '<article class="h3 g">\n<div class="src">panaaxgames \xB7 \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u043E\u0446\u0435\u043D\u043E\u043A</div>\n<div class="ttl" style="margin-top:4px">__TITLE__</div>\n__SON_H3_SVG__\n<div style="display:flex;justify-content:space-between;font-size:10px;color:#8f86b0;text-transform:uppercase;margin-top:4px"><span>\u0423\u0436\u0430\u0441</span><span>\u041D\u043E\u0440\u043C</span><span>\u0425\u043E\u0440\u043E\u0448\u043E</span><span>\u041B\u0435\u0433\u0435\u043D\u0434\u0430</span></div>\n</article>' }, "son-bignum": { "tw": false, "extra": "son-p-scope", "html": '<article class="h4 g" style="--c:var(--c2)">\n<div class="src" style="color:#2b1200">panaaxgames \xB7 __TITLE__</div>\n<div class="n" style="margin-top:14px">41%</div>\n<div class="sub">\u041A\u0440\u0443\u0442\u043E</div>\n<div class="mini"><i style="height:20px"></i><i style="height:34px"></i><i style="height:30px"></i><i style="height:4px"></i></div>\n</article>' }, "son-mood": { "tw": false, "extra": "son-p-scope", "html": '<article class="h5 g">\n<div class="src" style="color:#c2410c">panaaxgames \xB7 __TITLE__</div>\n<div class="scale" style="margin-top:14px"><span class="mk" style="--x:70%">41</span></div>\n<div class="ends"><span>\u0423\u0436\u0430\u0441</span><span>\u041D\u043E\u0440\u043C</span><span>\u041B\u0435\u0433\u0435\u043D\u0434\u0430</span></div>\n<div class="mt" style="color:#555;margin-top:12px">\u041C\u0430\u0440\u043A\u0435\u0440 \u2014 \u0433\u0434\u0435 \u0441\u043E\u0441\u0440\u0435\u0434\u043E\u0442\u043E\u0447\u0435\u043D\u043E \u0431\u043E\u043B\u044C\u0448\u0438\u043D\u0441\u0442\u0432\u043E \u0433\u043E\u043B\u043E\u0441\u043E\u0432.</div>\n<a class="btn" href="__PANAX_URL__" style="margin-top:12px">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u2192</a>\n</article>' }, "son-popart": { "tw": false, "extra": "son-p-scope", "html": '<article class="h6 g">\n<div class="bub"><div class="big" style="--c:var(--c2)">\u041A\u0440\u0443\u0442\u043E!</div></div>\n<div class="meta"><span>41.2% \u0438\u0433\u0440\u043E\u043A\u043E\u0432</span><span class="src" style="color:#111">panaaxgames</span></div>\n<div class="ttl" style="margin-top:6px">__TITLE__</div>\n</article>' }, "son-orbit": { "tw": false, "extra": "son-p-scope", "html": '<article class="h7 g">\n__SON_ORBIT_SVG__\n<div class="lg">\n<div><span>\u041B\u0435\u0433\u0435\u043D\u0434\u0430</span><b style="--c:var(--c1)">19.6%</b></div>\n<div><span>__TOP1_NAME__</span><b style="--c:var(--c2)">41.2%</b></div>\n<div><span>\u0425\u043E\u0440\u043E\u0448\u043E</span><b style="--c:var(--c3)">37.3%</b></div>\n<div><span>\u041F\u043B\u043E\u0445\u043E</span><b style="--c:var(--c5)">2.0%</b></div>\n<a class="btn" href="__PANAX_URL__" style="margin-top:10px;display:inline-block">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u2192</a>\n</div>\n</article>' }, "son-segments": { "tw": false, "extra": "son-p-scope", "html": '<article class="h8 g">\n<div class="src">panaaxgames \xB7 __TITLE__</div>\n<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:6px"><span class="lvl" style="color:var(--c2)">\u041A\u0440\u0443\u0442\u043E</span><span class="big" style="font-size:26px">41.2%</span></div>\n<div class="row">\n__SON_SEGMENTS__\n<div class="cap"><span>\u041B\u0435\u0433\u0435\u043D\u0434\u0430</span><span>\u041A\u0440\u0443\u0442\u043E</span><span>\u0425\u043E\u0440\u043E\u0448\u043E</span><span>\u041F\u043B\u043E\u0445\u043E</span></div>\n</div>\n</article>' }, "son-podium": { "tw": false, "extra": "son-p-scope", "html": '<article class="h9 g">\n<div class="src" style="margin-bottom:10px">panaaxgames \xB7 \u043B\u0443\u0447\u0448\u0438\u0435 \u0443\u0440\u043E\u0432\u043D\u0438</div>\n<div class="pod">\n<div style="--c:var(--c3);height:95px"><span>\u0425\u043E\u0440\u043E\u0448\u043E</span><b>37%</b></div>\n<div style="--c:var(--c2);height:140px"><span>\u041A\u0440\u0443\u0442\u043E</span><b>41%</b></div>\n<div style="--c:var(--c1);height:70px"><span>\u041B\u0435\u0433\u0435\u043D\u0434\u0430</span><b>20%</b></div>\n</div>\n<div class="foot"><span>__TITLE__</span><a class="btn" href="__PANAX_URL__" style="padding:7px 12px">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u2192</a></div>\n</article>' }, "son-tiles": { "tw": false, "extra": "son-p-scope", "html": '<article class="h10 g">\n<div class="src" style="color:#c2410c">panaaxgames \xB7 __TITLE__</div>\n<div class="ttl" style="margin-top:4px">\u041A\u0430\u043A \u0438\u0433\u0440\u0430\u044E\u0442 \u0438 \u043E\u0446\u0435\u043D\u0438\u0432\u0430\u044E\u0442</div>\n<div class="tiles">\n<div class="t" style="--c:var(--c1)"><b>19.6%</b><span>\u041B\u0435\u0433\u0435\u043D\u0434\u0430</span></div>\n<div class="t" style="--c:var(--c2)"><b>41.2%</b><span>\u041A\u0440\u0443\u0442\u043E</span></div>\n<div class="t" style="--c:var(--c3)"><b>37.3%</b><span>\u0425\u043E\u0440\u043E\u0448\u043E</span></div>\n<div class="t" style="--c:var(--c4)"><b>0%</b><span>\u041D\u043E\u0440\u043C</span></div>\n<div class="t" style="--c:var(--c5)"><b>2%</b><span>\u041F\u043B\u043E\u0445\u043E</span></div>\n<div class="t" style="--c:var(--c6)"><b>0%</b><span>\u0423\u0436\u0430\u0441</span></div>\n</div>\n<a class="btn" href="__PANAX_URL__" style="margin-top:14px">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 panaaxgames \u2192</a>\n</article>' }, "son-a": { "tw": false, "extra": "son-num-1", "html": '<article class="wa" data-src="backloggd">\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div class="body">\n<div class="src">__SCORE_SRC__</div>\n<h3>__TITLE__</h3>\n<div class="meta">__YEAR__ \xB7 __DEV__</div>\n<div class="tags">__GENRE_SPANS__</div>\n<div class="row">\n<div class="ring" style="--p:__SCORE_PCT_NUM__"><b>__SCORE10__</b></div>\n<div class="lbl"><strong>\u041E\u0446\u0435\u043D\u043A\u0430 \u0438\u0433\u0440\u043E\u043A\u043E\u0432</strong>12,4 \u0442\u044B\u0441. \u043E\u0446\u0435\u043D\u043E\u043A</div>\n<a class="cta" href="__PANAX_URL__">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 __SCORE_SRC__ \u2192</a>\n</div>\n</div>\n</article>' }, "son-b": { "tw": false, "extra": "son-num-1", "html": '<article class="wb" data-src="backloggd">\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div>\n<div class="kicker">\u0418\u0433\u0440\u0430 \u0438\u0437 \u043E\u0431\u0437\u043E\u0440\u0430 \xB7 __SCORE_SRC__</div>\n<h3>__TITLE__</h3>\n<div class="meta">__YEAR__ \xB7 __DEV_PUB__</div>\n<div class="genres">Action RPG, \u043A\u0438\u0431\u0435\u0440\u043F\u0430\u043D\u043A, \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0439 \u043C\u0438\u0440</div>\n</div>\n<div class="score">\n<div class="n">__SCORE10__<small>/10</small></div>\n<div class="s">__SCORE_SRC__</div>\n<a href="__PANAX_URL__">\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u0438\u0433\u0440\u044B</a>\n</div>\n</article>' }, "son-c": { "tw": false, "extra": "son-num-2", "html": '<article class="wc" data-src="backloggd">\n<div class="h">&gt; fetch --source=<span class="sn">__SCORE_SRC__</span></div>\n<h3>__TITLE__</h3>\n<div class="l">\u0420\u0410\u0417\u0420\u0410\u0411\u041E\u0422\u0427\u0418\u041A: <b>__DEV__</b><br/>\u0413\u041E\u0414: <b>__YEAR__</b> \xB7 \u0416\u0410\u041D\u0420: <b>Action RPG, \u043A\u0438\u0431\u0435\u0440\u043F\u0430\u043D\u043A</b><br/>\u041E\u0426\u0415\u041D\u041A\u0410: <span class="bar">\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2591</span> <b>__SCORE10__/10</b></div>\n<a href="__PANAX_URL__">\u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 <span class="sn">__SCORE_SRC__</span></a>\n</article>' }, "son-d": { "tw": false, "extra": "son-num-2", "html": '<article class="wd" data-src="backloggd">\n<div class="in">\n<div class="t"><h3>__TITLE__</h3><span class="hp">__SCORE10__ \u2605</span></div>\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div class="ty">Action RPG \xB7 __YEAR__</div>\n<div class="st"><div><b>12,4k</b>\u043E\u0446\u0435\u043D\u043E\u043A</div><div><b>38 \u0447</b>\u043F\u0440\u043E\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u0435</div><div><b>PC</b>\u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430</div></div>\n<a href="__PANAX_URL__">\u041D\u0430 <span class="sn">__SCORE_SRC__</span> \u2192</a>\n</div>\n</article>' }, "son-e": { "tw": false, "extra": "son-num-2", "html": '<a class="we" data-src="backloggd" href="__PANAX_URL__"><span class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></span><span><strong>__TITLE__</strong><small>__YEAR__ \xB7 <span class="sn">__SCORE_SRC__</span></small></span><span class="sc">__SCORE10__</span></a>' }, "son-f": { "tw": false, "extra": "son-num-2", "html": '<article class="wf" data-src="backloggd">\n<div class="sticker">__SCORE10__</div>\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div>\n<h3>__TITLE__</h3>\n<div class="m">__YEAR__ \xB7 __DEV__</div>\n<div class="c"><span>Action RPG</span><span>\u041A\u0438\u0431\u0435\u0440\u043F\u0430\u043D\u043A</span><span>Open world</span></div>\n<a href="__PANAX_URL__">\u0421\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043D\u0430 <span class="sn">__SCORE_SRC__</span> \u2197</a>\n</div>\n</article>' }, "son-g": { "tw": false, "extra": "son-num-2", "html": '<article class="wg" data-src="backloggd">\n<div class="hero">\n<span class="tag sn">__SCORE_SRC__</span>\n<div><h3>__TITLE__</h3><div class="by">__DEV_PUB__ \xB7 __YEAR__</div></div>\n</div>\n<div class="strip">\n<div>\u041E\u0446\u0435\u043D\u043A\u0430<b>__SCORE10__ / 10</b></div><div>\u0416\u0430\u043D\u0440<b>Action RPG</b></div><div>\u0412\u0440\u0435\u043C\u044F<b>38 \u0447</b></div>\n<a href="__PANAX_URL__">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u2192</a>\n</div>\n</article>' }, "son-h": { "tw": false, "extra": "son-num-3", "html": '<article class="wh" data-src="backloggd">\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div>\n<div class="play">\u25B6 PLAY \xB7 __YEAR__</div>\n<h3>__TITLE_UPPER__</h3>\n<div class="m">__DEV__ \xB7 Action RPG</div>\n<div class="sc">REC \u2605 __SCORE10__ \xB7 <span class="sn">__SCORE_SRC__</span></div>\n</div>\n</article>' }, "son-i": { "tw": false, "extra": "son-num-3", "html": '<article class="wi" data-src="backloggd">\n<div>\n<h3>__TITLE__</h3>\n<div class="m">__YEAR__ \xB7 __DEV__ \xB7 Action RPG</div>\n</div>\n<div>\n<div class="n">__SCORE10__</div>\n<div class="s">\u043E\u0446\u0435\u043D\u043A\u0430 \xB7 <span class="sn">__SCORE_SRC__</span></div>\n</div>\n</article>' }, "son-j": { "tw": false, "extra": "son-num-3", "html": '<article class="wj" data-src="backloggd">\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div class="info">\n<h3>__TITLE__</h3>\n<div class="tg">Action RPG \xB7 \u041A\u0438\u0431\u0435\u0440\u043F\u0430\u043D\u043A \xB7 \u041E\u0442\u043A\u0440\u044B\u0442\u044B\u0439 \u043C\u0438\u0440</div>\n<div class="sc"><b>__SCORE10__</b> \u043E\u0446\u0435\u043D\u043A\u0430 \u0438\u0433\u0440\u043E\u043A\u043E\u0432</div>\n</div>\n<div class="src">\u043D\u0430 <span class="sn">__SCORE_SRC__</span> \u2192</div>\n</article>' }, "son-k": { "tw": false, "extra": "son-num-3", "html": '<article class="wk" data-src="backloggd">\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div>\n<div class="k">\u0418\u0433\u0440\u0430 \xB7 <span class="sn">__SCORE_SRC__</span></div>\n<h3>__TITLE__</h3>\n<div class="m">__DEV__ \xB7 __YEAR__ \xB7 \u043E\u0446\u0435\u043D\u043A\u0430 __SCORE10__</div>\n<p>\u041A\u043E\u0440\u043E\u0442\u043A\u0430\u044F \u0432\u0432\u043E\u0434\u043D\u0430\u044F \u0444\u0440\u0430\u0437\u0430 \u043E \u0438\u0433\u0440\u0435, \u043A\u043E\u0442\u043E\u0440\u0430\u044F \u0437\u0430\u0434\u0430\u0451\u0442 \u0442\u043E\u043D \u043E\u0431\u0437\u043E\u0440\u0443 \u0438 \u0434\u0430\u043B\u044C\u0448\u0435 \u043E\u0442\u0441\u044B\u043B\u0430\u0435\u0442 \u043A \u0442\u0435\u043A\u0441\u0442\u0443.</p>\n</div>\n</article>' }, "son-l": { "tw": false, "extra": "son-num-3", "html": '<article class="wl" data-src="backloggd">\n<span class="tape"></span>\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div class="c">__TITLE__</div>\n<div class="d">__SCORE10__ \xB7 <span class="sn">__SCORE_SRC__</span></div>\n</article>' }, "son-m": { "tw": false, "extra": "son-num-3", "html": '<article class="wm" data-src="backloggd">\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div>\n<h3>__TITLE__</h3>\n<div class="m">LVL __YEAR__ \xB7 ACTION RPG</div>\n<div class="hp"><i></i><i></i><i></i><i></i><i class="e"></i></div>\n<a href="__PANAX_URL__">\u25B6 \u0418\u0413\u0420\u0410\u0422\u042C \u041D\u0410 <span class="sn">__SCORE_SRC__</span></a>\n</div>\n</article>' }, "son-n": { "tw": false, "extra": "son-num-3", "html": '<article class="wn" data-src="backloggd">\n<div class="card">\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div>\n<h3>__TITLE__</h3>\n<div class="m">__YEAR__ \xB7 __DEV__</div>\n<div class="row"><span class="pill">__SCORE10__</span><span class="pill a"><span class="sn">__SCORE_SRC__</span></span></div>\n</div>\n</div>\n</article>' }, "son-o": { "tw": false, "extra": "son-num-3", "html": '<article class="wo" data-src="backloggd">\n<span class="rib">\u0442\u043E\u043F __YEAR__</span>\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div>\n<h3>__TITLE__</h3>\n<div class="m">__DEV__ \xB7 __YEAR__ \xB7 \u043E\u0446\u0435\u043D\u043A\u0430 __SCORE10__ \u043D\u0430 <span class="sn">__SCORE_SRC__</span></div>\n<div class="ch"><span>Action RPG</span><span>\u041A\u0438\u0431\u0435\u0440\u043F\u0430\u043D\u043A</span><span>\u041E\u0442\u043A\u0440\u044B\u0442\u044B\u0439 \u043C\u0438\u0440</span></div>\n</div>\n</article>' }, "son-p": { "tw": false, "extra": "son-num-3", "html": '<article class="wp" data-src="backloggd">\n<div class="donut"><b>__SCORE10__</b></div>\n<div>\n<h3>__TITLE__</h3>\n<div class="m">__YEAR__ \xB7 __DEV__ \xB7 <span class="sn">__SCORE_SRC__</span></div>\n<div class="pf"><span>PC</span><span>PS5</span><span>Xbox</span></div>\n<a href="__PANAX_URL__">\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u0438\u0433\u0440\u044B</a>\n</div>\n</article>' }, "son-q": { "tw": false, "extra": "son-num-3", "html": '<article class="wq" data-src="backloggd">\n<div class="bar"></div>\n<div class="in">\n<h3>__TITLE__</h3>\n<div class="big">__SCORE10__<small>\u0418\u0417 10</small></div>\n<div class="m">Action RPG \xB7 __YEAR__ \xB7 __DEV__</div>\n<a href="__PANAX_URL__">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 <span class="sn">__SCORE_SRC__</span> \u2192</a>\n</div>\n</article>' }, "son-r": { "tw": false, "extra": "son-num-4", "html": '<article class="wr" data-src="backloggd">\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<h3>__TITLE__</h3>\n<div class="m">__DEV__ \xB7 __YEAR__ \xB7 <span class="sn">__SCORE_SRC__</span></div>\n<div class="big">__SCORE10__</div>\n</article>' }, "son-s": { "tw": false, "extra": "son-num-4", "html": '<article class="ws" data-src="backloggd">\n<div class="chip"></div>\n<div class="t"><h3>__TITLE_UPPER__</h3><div class="m">__DEV__ \xB7 Action RPG</div></div>\n<div class="f"><span><span class="sn">__SCORE_SRC__</span><br/>\u043E\u0446\u0435\u043D\u043A\u0430</span><b>__SCORE10__</b></div>\n</article>' }, "son-t": { "tw": false, "extra": "son-num-4", "html": '<article class="wt" data-src="backloggd">\n<div class="stub"><b>__SCORE10__</b><small>\u043E\u0446\u0435\u043D\u043A\u0430</small></div>\n<div class="in">\n<h3>__TITLE__</h3>\n<div class="m">__YEAR__ \xB7 __DEV__ \xB7 Action RPG</div>\n<div class="src">\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A: <span class="sn">__SCORE_SRC__</span></div>\n</div>\n</article>' }, "son-u": { "tw": false, "extra": "son-num-4", "html": '<article class="wu" data-src="backloggd">\n<div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div>\n<div>\n<h3>__TITLE__</h3>\n<div class="m">__YEAR__ \xB7 __DEV__ \xB7 Action RPG</div>\n<div class="btns"><span class="btn">A</span><span class="lb">\u041E\u0446\u0435\u043D\u043A\u0430 <b>__SCORE10__</b> \u043D\u0430 <span class="sn">__SCORE_SRC__</span></span></div>\n</div>\n</article>' }, "son-v": { "tw": false, "extra": "son-num-4", "html": '<article class="wv" data-src="backloggd">\n<div>\n<div class="gauge" style="--p:__SCORE_PCT_NUM__"><div class="gv">__SCORE10__</div></div>\n</div>\n<div>\n<h3>__TITLE__</h3>\n<div class="m">__YEAR__ \xB7 __DEV__ \xB7 Action RPG</div>\n<a href="__PANAX_URL__">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 <span class="sn">__SCORE_SRC__</span> \u2192</a>\n</div>\n</article>' }, "son-w": { "tw": false, "extra": "son-num-4", "html": '<article class="ww" data-src="backloggd">\n<div class="holes t"></div>\n<div class="frames"><div class="fr"><span>01</span></div><div class="fr"><span>02</span></div><div class="fr"><span>03</span></div></div>\n<div class="holes b"></div>\n<div class="info">\n<div><h3>__TITLE__</h3><div class="m">__YEAR__ \xB7 <span class="sn">__SCORE_SRC__</span></div></div>\n<div class="sc">__SCORE10__</div>\n</div>\n</article>' }, "son-x": { "tw": false, "extra": "son-num-4", "html": '<article class="wx" data-src="backloggd">\n<h3 data-t="__TITLE_UPPER__">__TITLE__</h3>\n<div class="m">__DEV__ \xB7 __YEAR__ \xB7 <span class="sn">__SCORE_SRC__</span></div>\n<span class="sc">__SCORE10__ / 10</span><a href="__PANAX_URL__">\u043E\u0442\u043A\u0440\u044B\u0442\u044C \u2192</a>\n</article>' }, "son-y": { "tw": false, "extra": "son-num-4", "html": '<article class="wy" data-src="backloggd">\n<h3>__TITLE__</h3>\n<div class="m">__DEV__ \xB7 __YEAR__ \xB7 Action RPG</div>\n<div class="sc">__SCORE10__ / 10 \xB7 <span class="sn">BACKLOGGD</span></div>\n</article>' }, "son-z": { "tw": false, "extra": "son-num-4", "html": '<article class="wz" data-src="backloggd">\n<div class="hd"><div class="cover"><img alt="__TITLE__" src="__COVER__" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"/></div><div><h3>__TITLE__</h3><span>\u0418\u0433\u0440\u0430 \u0438\u0437 \u043E\u0431\u0437\u043E\u0440\u0430</span></div></div>\n<dl>\n<dt>\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u0447\u0438\u043A</dt><dd>__DEV__</dd>\n<dt>\u0413\u043E\u0434</dt><dd>__YEAR__</dd>\n<dt>\u041E\u0446\u0435\u043D\u043A\u0430</dt><dd>__SCORE10__ / 10</dd>\n<dt>\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A</dt><dd><span class="sn">__SCORE_SRC__</span></dd>\n</dl>\n<a class="ft" href="__PANAX_URL__">\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u0438\u0433\u0440\u044B</a>\n</article>' }, "son-aa": { "tw": false, "extra": "son-num-4", "html": '<article class="waa" data-src="backloggd">\n<div class="medal"><b>__SCORE10__</b></div>\n<div class="rb"><i></i><i></i></div>\n<h3>__TITLE__</h3>\n<div class="m">\u0412\u044B\u0431\u043E\u0440 \u0440\u0435\u0434\u0430\u043A\u0446\u0438\u0438 \xB7 <span class="sn">__SCORE_SRC__</span></div>\n</article>' }, "twp-1": { "tw": true, "extra": "", "html": '<div class="rounded-2xl bg-[#101115] border border-zinc-800 p-5 space-y-5 shadow-xl">\n<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">\n<div class="flex items-center gap-4">\n<div class="w-16 h-22 aspect-[3/4] rounded-lg overflow-hidden border border-white/10 shrink-0"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div>\n<div class="font-mono-tech text-[10px] uppercase tracking-widest text-emerald-400 font-bold">PANAXGAMES \xB7 \u041E\u0426\u0415\u041D\u041A\u0418 \u0418\u0413\u0420\u041E\u041A\u041E\u0412</div>\n<h3 class="font-display text-2xl font-bold text-white leading-tight">__TITLE__</h3>\n<div class="text-xs text-zinc-400">__META__</div>\n</div>\n</div>\n<!-- Dominant Verdict Medal + Panax Link -->\n<div class="flex items-center gap-3 self-start sm:self-center">\n<div class="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10">\n<div class="w-9 h-9 shrink-0">__TOP1_BADGE_IMG_36__</div>\n<div>\n<div class="font-mono-tech text-xs font-extrabold uppercase text-orange-400" style="color:__TOP1_COLOR__">__TOP1_LABEL__</div>\n<div class="font-mono-tech text-sm font-bold text-white">__TOP1_PCT__% \u0438\u0433\u0440\u043E\u043A\u043E\u0432</div>\n</div>\n</div>\n<a class="px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-display font-bold text-xs transition shrink-0 flex items-center gap-1.5" href="__PANAX_URL__">\n<span>\u041D\u0430 Panaxgames</span>\n<span>\u2197</span>\n</a>\n</div>\n</div>\n<!-- Stacked Horizontal Bar -->\n<div class="space-y-2.5">\n<div class="h-3.5 w-full rounded-full overflow-hidden flex bg-zinc-800 gap-0.5 p-0.5">__TWP_W1_BAR__</div>\n<div class="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">__TWP_W1_LEGEND__</div>\n</div>\n</div>' }, "twp-2": { "tw": true, "extra": "", "html": '<div class="rounded-2xl bg-[#141519] border border-white/10 p-5 flex flex-col md:flex-row gap-6 items-stretch justify-between">\n<div class="flex flex-col justify-between gap-4 md:w-64 shrink-0">\n<div class="flex items-center gap-3.5">\n<div class="w-20 aspect-[3/4] rounded-xl overflow-hidden border border-white/15 shrink-0"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div>\n<span class="font-mono-tech text-[10px] uppercase tracking-wider text-zinc-400">\u041A\u0410\u0420\u0422\u041E\u0427\u041A\u0410 PANAX</span>\n<h3 class="font-display text-xl font-bold text-white leading-tight mt-0.5">__TITLE__</h3>\n<div class="text-xs text-zinc-400 mt-1">__META__</div>\n</div>\n</div>\n<a class="w-full py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-display font-bold text-xs text-center transition flex items-center justify-center gap-2" href="__PANAX_URL__">\n<span>\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0438\u0433\u0440\u0443 \u043D\u0430 Panaxgames</span>\n<span>\u2192</span>\n</a>\n</div>\n<!-- 6 Vertical Pillars -->\n<div class="flex-1 grid grid-cols-6 gap-2 sm:gap-3 items-end pt-2 border-t md:border-t-0 md:border-l border-white/10 md:pl-6">__TWP_W2_PILLARS__</div>\n</div>' }, "twp-3": { "tw": true, "extra": "", "html": '<div class="rounded-2xl bg-[#0e1015] border border-zinc-800 p-5 sm:p-6 flex flex-col md:flex-row items-center justify-between gap-6">\n<div class="flex items-center gap-4 w-full md:w-auto">\n<div class="w-20 aspect-[3/4] rounded-xl overflow-hidden border border-white/10 shrink-0"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="space-y-2">\n<div class="font-mono-tech text-[10px] uppercase tracking-widest text-purple-400 font-bold">PANAXGAMES VERDICT</div>\n<h3 class="font-display text-2xl font-bold text-white leading-none">__TITLE__</h3>\n<div class="text-xs text-zinc-400">__META__</div>\n<a class="inline-flex items-center gap-1.5 text-xs font-mono-tech font-bold text-emerald-400 hover:underline pt-1" href="__PANAX_URL__">\n<span>\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u043D\u0430 Panaxgames</span><span>\u2197</span>\n</a>\n</div>\n</div>\n<!-- Donut + 6-item list -->\n<div class="flex flex-col sm:flex-row items-center gap-5 w-full md:w-auto justify-end">\n<div class="relative w-32 h-32 shrink-0 flex items-center justify-center">\n<svg class="w-32 h-32 -rotate-90" style="" viewbox="0 0 120 120"><circle cx="60" cy="60" fill="none" r="46" stroke="#facc15" stroke-dasharray="56.59 232.43" stroke-dashoffset="0.00" stroke-width="14"></circle><circle cx="60" cy="60" fill="none" r="46" stroke="#f97316" stroke-dasharray="118.96 170.07" stroke-dashoffset="-56.59" stroke-width="14"></circle><circle cx="60" cy="60" fill="none" r="46" stroke="#c084fc" stroke-dasharray="107.70 181.33" stroke-dashoffset="-175.55" stroke-width="14"></circle><circle cx="60" cy="60" fill="none" r="46" stroke="#38bdf8" stroke-dasharray="0.00 289.03" stroke-dashoffset="-283.25" stroke-width="14"></circle><circle cx="60" cy="60" fill="none" r="46" stroke="#94a3b8" stroke-dasharray="5.77 283.25" stroke-dashoffset="-283.25" stroke-width="14"></circle><circle cx="60" cy="60" fill="none" r="46" stroke="#ef4444" stroke-dasharray="0.00 289.03" stroke-dashoffset="-289.03" stroke-width="14"></circle></svg>\n<div class="absolute text-center">\n<div class="font-mono-tech text-lg font-extrabold text-white leading-none">__TOP1_PCT__%</div>\n<div class="font-mono-tech text-[9px] font-bold uppercase text-orange-400 mt-0.5" style="color: rgb(249, 115, 22);">__TOP1_LABEL__</div>\n</div>\n</div>\n<div class="grid grid-cols-2 gap-x-5 gap-y-1.5 text-xs font-mono-tech w-full sm:w-auto">__TWP_W3_LIST__</div>\n</div>\n</div>' }, "twp-4": { "tw": true, "extra": "", "html": '<div class="te-grid-bg text-[#141413] rounded-2xl border-2 border-[#141413] shadow-[6px_6px_0_#000] overflow-hidden">\n<div class="bg-[#141413] text-[#f4f0e6] px-5 py-2 flex justify-between items-center font-mono-tech text-[11px]">\n<span class="font-bold tracking-widest">PANAXGAMES // \u0420\u0415\u0419\u0422\u0418\u041D\u0413 \u0421\u041E\u041E\u0411\u0429\u0415\u0421\u0422\u0412\u0410</span>\n<a class="text-[#c8f904] font-bold hover:underline" href="__PANAX_URL__">\u041F\u0415\u0420\u0415\u0419\u0422\u0418 \u041D\u0410 PANAX \u2197</a>\n</div>\n<div class="p-5 flex flex-col md:flex-row gap-5 items-center justify-between">\n<div class="flex items-center gap-4 w-full md:w-auto">\n<div class="w-20 aspect-[3/4] border-2 border-[#141413] shadow-[3px_3px_0_#141413] shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div>\n<div class="font-mono-tech text-[10px] font-bold uppercase text-stone-600">__META__</div>\n<h3 class="font-display text-2xl sm:text-3xl font-extrabold leading-none mt-0.5">__TITLE__</h3>\n<div class="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#141413] text-white font-mono-tech text-xs font-bold">\n<span>\u041B\u0418\u0414\u0415\u0420:</span>\n<span class="text-amber-300">__TWP_W4_LEADER__</span>\n</div>\n</div>\n</div>\n<!-- 6 Mechanical Keys -->\n<div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5 w-full md:w-auto">__TWP_W4_KEYS__</div>\n</div>\n</div>' }, "twp-5": { "tw": true, "extra": "", "html": '<div class="rounded-2xl bg-[#111318] border border-zinc-800 p-5 space-y-4">\n<div class="flex flex-wrap items-center justify-between gap-3">\n<div class="flex items-center gap-3.5">\n<div class="w-14 h-18 aspect-[3/4] rounded-lg overflow-hidden border border-white/10 shrink-0"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div>\n<h3 class="font-display text-xl font-bold text-white">__TITLE__</h3>\n<div class="text-xs text-zinc-400">__META__</div>\n</div>\n</div>\n<a class="px-3.5 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-mono-tech text-xs font-bold transition" href="__PANAX_URL__">\n              Panaxgames \u2197\n            </a>\n</div>\n<!-- Top 3 Cards -->\n<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">__TWP_W5_PODIUM__</div>\n<!-- Remaining 3 compact line -->\n<div class="text-[11px] font-mono-tech text-zinc-500 flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-white/5">__TWP_W5_REST__</div>\n</div>' }, "twp-6": { "tw": true, "extra": "", "html": '<div class="relative rounded-2xl overflow-hidden border border-white/15 bg-black">\n<div class="absolute inset-0 opacity-65"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/30"></div>\n<div class="relative z-10 p-5 sm:p-6 space-y-5">\n<div class="flex flex-wrap items-end justify-between gap-4">\n<div>\n<span class="font-mono-tech text-[10px] uppercase tracking-widest text-amber-300 font-bold">PANAXGAMES FEATURE</span>\n<h3 class="font-display text-3xl font-bold text-white leading-none mt-1">__TITLE__</h3>\n<div class="text-xs text-zinc-300 mt-1">__META__</div>\n</div>\n<a class="px-4 py-2 rounded-full bg-white text-black font-display font-bold text-xs hover:bg-amber-300 transition" href="__PANAX_URL__">\n                \u0421\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043D\u0430 Panaxgames \u2197\n              </a>\n</div>\n<!-- 6 Frosted Mini Cells -->\n<div class="grid grid-cols-3 sm:grid-cols-6 gap-2">__TWP_W6_CELLS__</div>\n</div>\n</div>' }, "twp-7": { "tw": true, "extra": "", "html": '<div class="crt-box rounded-xl p-5 font-mono-tech text-emerald-400 space-y-4">\n<div class="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/30 pb-2 text-xs">\n<span>$ panax --ratings "<strong class="text-white">__TITLE__</strong>"</span>\n<a class="bg-emerald-400 text-black font-bold px-2 py-0.5 hover:bg-white" href="__PANAX_URL__">[OPEN: PANAXGAMES]</a>\n</div>\n<div class="space-y-1.5 text-xs">__TWP_W7_ROWS__</div>\n</div>' }, "twp-8": { "tw": true, "extra": "", "html": '<div class="bg-white text-black border-4 border-black grid grid-cols-1 md:grid-cols-12">\n<div class="md:col-span-6 p-5 border-b-2 md:border-b-0 md:border-r-2 border-black flex flex-col justify-between gap-4">\n<div class="flex gap-4 items-start">\n<div class="w-16 aspect-[3/4] border-2 border-black shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div>\n<div class="font-mono-tech text-[10px] font-bold uppercase text-neutral-500">__META__</div>\n<h3 class="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tighter leading-none mt-1">__TITLE__</h3>\n</div>\n</div>\n<div class="flex items-end justify-between border-t-2 border-black pt-3">\n<div>\n<div class="font-mono-tech text-[10px] font-bold uppercase text-neutral-500">\u0414\u041E\u041C\u0418\u041D\u0418\u0420\u0423\u0415\u0422</div>\n<div class="font-display text-3xl font-extrabold uppercase text-orange-600 leading-none">__TWP_W4_LEADER__</div>\n</div>\n<a class="font-mono-tech text-xs font-extrabold uppercase underline underline-offset-4 hover:text-orange-600" href="__PANAX_URL__">PANAXGAMES \u2192</a>\n</div>\n</div>\n<div class="md:col-span-6 p-5 bg-neutral-100 grid grid-cols-2 gap-x-4 gap-y-2.5 font-mono-tech text-xs items-center">__TWP_W8_TABLE__</div>\n</div>' }, "twp-9": { "tw": true, "extra": "", "html": '<div class="rounded-2xl bg-[#12131a] border border-white/10 p-5 space-y-4">\n<div class="flex flex-wrap items-center justify-between gap-3">\n<div class="flex items-center gap-3">\n<div class="w-12 h-14 rounded-lg overflow-hidden border border-white/15 shrink-0"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div>\n<h3 class="font-display text-xl font-bold text-white leading-tight">__TITLE__</h3>\n<div class="text-xs text-zinc-400">__META__</div>\n</div>\n</div>\n<a class="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono-tech text-xs font-bold border border-white/15 transition" href="__PANAX_URL__">\n              Panaxgames \u2197\n            </a>\n</div>\n<!-- SVG Area Wave -->\n<div class="bg-black/40 border border-white/5 rounded-xl p-3">\n<svg class="w-full h-28 overflow-visible" viewbox="0 0 600 110">\n<defs>\n<lineargradient id="waveGrad" x1="0" x2="1" y1="0" y2="0">\n<stop offset="0%" stop-color="#facc15" stop-opacity="0.35"></stop>\n<stop offset="25%" stop-color="#f97316" stop-opacity="0.35"></stop>\n<stop offset="50%" stop-color="#c084fc" stop-opacity="0.35"></stop>\n<stop offset="100%" stop-color="#ef4444" stop-opacity="0.25"></stop>\n</lineargradient>\n</defs>\n<path d="M 50 59.3 L 150 20.0 L 250 27.1 L 350 95.0 L 450 91.4 L 550 95.0 L 550 100 L 50 100 Z" fill="url(#waveGrad)"></path>\n<path d="M 50 59.3 L 150 20.0 L 250 27.1 L 350 95.0 L 450 91.4 L 550 95.0" fill="none" stroke="#ffffff" stroke-linejoin="round" stroke-width="2.5"></path>\n<circle cx="50" cy="59.3" fill="#facc15" r="5" stroke="#000" stroke-width="1.5"></circle><circle cx="150" cy="20.0" fill="#f97316" r="5" stroke="#000" stroke-width="1.5"></circle><circle cx="250" cy="27.1" fill="#c084fc" r="5" stroke="#000" stroke-width="1.5"></circle><circle cx="350" cy="95.0" fill="#38bdf8" r="5" stroke="#000" stroke-width="1.5"></circle><circle cx="450" cy="91.4" fill="#94a3b8" r="5" stroke="#000" stroke-width="1.5"></circle><circle cx="550" cy="95.0" fill="#ef4444" r="5" stroke="#000" stroke-width="1.5"></circle>\n</svg>\n<div class="grid grid-cols-6 gap-1 text-center font-mono-tech text-[10px] mt-1">__TWP_W9_LABELS__</div>\n</div>\n</div>' }, "twp-10": { "tw": true, "extra": "", "html": '<div class="rounded-xl bg-[#111216] border border-zinc-700/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">\n<div class="flex items-center gap-3 min-w-0">\n<div class="w-10 h-12 rounded overflow-hidden shrink-0 border border-white/10"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="min-w-0">\n<div class="flex items-center gap-2">\n<h3 class="font-display text-sm sm:text-base font-bold text-white truncate">__TITLE__</h3>\n<span class="text-xs text-zinc-400 hidden sm:inline truncate">__META__</span>\n</div>\n<div class="h-1.5 w-44 sm:w-56 rounded-full overflow-hidden flex bg-zinc-800 mt-1.5">__TWP_W10_BAR__</div>\n</div>\n</div>\n<div class="flex items-center gap-3 shrink-0">\n<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-500/15 border border-orange-500/30 font-mono-tech text-xs font-bold text-orange-300" style="color:__TOP1_COLOR__; border-color:__TOP1_COLOR__; background-color:__TOP1_COLOR__;">__TOP1_LABEL__ \xB7 __TOP1_PCT__%</div>\n<a class="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-mono-tech text-xs font-extrabold transition" href="__PANAX_URL__">\n              Panaxgames \u2197\n            </a>\n</div>\n</div>' }, "tw32-1": { "tw": true, "extra": "", "html": '<div class="te-ticket te-grid-bg">\n<div class="hidden"></div>\n<div class="hidden"></div>\n<div class="px-4 sm:px-6 py-2 bg-[#141413] text-[#f4f0e6] flex flex-wrap items-center justify-between gap-2 font-mono-tech text-[11px]">\n<div class="flex items-center gap-2">\n<span class="inline-block w-2.5 h-2.5 rounded-full bg-[#ff4f00]" style="background-color: rgb(255, 79, 0);"></span>\n<span class="font-bold tracking-widest uppercase">__SCORE_SRC__</span>\n</div>\n<div class="flex items-center gap-4 text-stone-400">\n<span>REF: <strong class="text-[#f4f0e6]">NR-2025-X</strong></span>\n<span class="hidden sm:inline text-[#c8f904]">\u25CF \u041F\u0420\u041E\u0419\u0414\u0415\u041D\u041E 100% (42 \u0427)</span>\n</div>\n</div>\n<div class="grid grid-cols-1 md:grid-cols-12">\n<div class="md:col-span-8 p-5 sm:p-6 flex flex-col justify-between gap-5">\n<div class="flex flex-col sm:flex-row gap-5 items-start">\n<div class="relative shrink-0 group">\n<div class="w-28 sm:w-32 aspect-[3/4] rounded-lg border-2 border-[#141413] bg-[#141413] overflow-hidden shadow-[4px_4px_0px_#141413] -rotate-1 group-hover:rotate-0 transition-transform">\n<div class="w-full h-full"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n</div>\n<span class="absolute -bottom-2 -right-2 px-2 py-0.5 bg-[#ff4f00] text-white font-mono-tech font-bold text-xs border-2 border-[#141413] shadow-[2px_2px_0px_#141413]" style="background-color: rgb(255, 79, 0);">__YEAR__</span>\n</div>\n<div class="flex-1 min-w-0 space-y-3 w-full">\n<div>\n<div class="font-mono-tech text-[10px] uppercase tracking-widest text-stone-500 font-bold">\u041E\u0411\u042A\u0415\u041A\u0422 \u041E\u0411\u0417\u041E\u0420\u0410 / \u0420\u0415\u041B\u0418\u0417</div>\n<h3 class="font-display text-2xl sm:text-3xl font-bold text-[#141413] tracking-tight leading-none mt-0.5">__TITLE__</h3>\n</div>\n<div class="border-t-2 border-b-2 border-[#141413] py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">\n<div class="flex items-baseline gap-2">\n<span class="font-mono-tech text-[10px] uppercase text-stone-500 shrink-0">\u0421\u0422\u0423\u0414\u0418\u042F:</span>\n<span class="font-semibold text-[#141413] truncate">__META__</span>\n</div>\n<div class="flex items-baseline gap-2">\n<span class="font-mono-tech text-[10px] uppercase text-stone-500 shrink-0">STEAM:</span>\n<span class="font-mono-tech font-bold text-emerald-700">__STEAM_PCT__ \u041F\u041E\u041B\u041E\u0416\u0418\u0422.</span>\n</div>\n<div class="sm:col-span-2 flex items-baseline gap-2 pt-1 border-t border-[#141413]/15">\n<span class="font-mono-tech text-[10px] uppercase text-stone-500 shrink-0">\u0416\u0410\u041D\u0420:</span>\n<div class="font-mono-tech text-[11px] font-bold text-[#141413] flex flex-wrap gap-1">__GENRE_SPANS__</div>\n</div>\n</div>\n<p class="font-editorial italic text-lg sm:text-xl text-stone-800 leading-snug">\xAB\u042D\u0442\u0430\u043B\u043E\u043D\u043D\u044B\u0439 \u043A\u0438\u0431\u0435\u0440\u043F\u0430\u043D\u043A \u0441 \u0432\u0435\u0440\u0442\u0438\u043A\u0430\u043B\u044C\u043D\u044B\u043C \u043B\u0435\u0432\u0435\u043B-\u0434\u0438\u0437\u0430\u0439\u043D\u043E\u043C \u0438 \u0433\u0443\u0441\u0442\u043E\u0439 \u0430\u0442\u043C\u043E\u0441\u0444\u0435\u0440\u043E\u0439 \u043C\u0435\u0433\u0430\u043F\u043E\u043B\u0438\u0441\u0430\xBB</p>\n</div>\n</div>\n<div class="pt-2 -mb-5 sm:-mb-6 flex flex-wrap items-end justify-between gap-2">\n<div class="flex flex-wrap items-end">__TW32_LINKS__</div>\n</div>\n</div>\n<div class="md:col-span-4 te-perforation bg-[#ebe5d8] p-5 flex flex-col justify-between gap-4">\n<div class="flex items-center justify-between">\n<span class="font-mono-tech text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 bg-[#141413] text-[#f4f0e6]">__SCORE_SRC__</span>\n<span class="font-mono-tech text-[10px] font-bold text-[#ff4f00]" style="color: rgb(255, 79, 0);">\u2605 VERIFIED</span>\n</div>\n<div class="my-auto py-1 flex items-center justify-between gap-3">\n<div>\n<div class="flex items-baseline">\n<span class="font-display text-5xl font-bold text-[#141413] tracking-tighter leading-none">__SCORE10__</span>\n<span class="font-mono-tech text-xs font-bold text-stone-500 ml-1">/10</span>\n</div>\n<div class="font-mono-tech text-[10px] text-stone-600 mt-1">\u0418\u041D\u0414\u0415\u041A\u0421 \u0421\u041E\u041E\u0411\u0429\u0415\u0421\u0422\u0412\u0410</div>\n</div>\n<div class="w-16 h-16 rounded-full border-2 border-dashed border-[#141413] flex flex-col items-center justify-center -rotate-12 bg-[#f4f0e6] shadow-inner shrink-0">\n<span class="font-mono-tech text-[8px] uppercase tracking-widest text-stone-500">IGDB</span>\n<span class="font-mono-tech text-xl font-extrabold text-[#141413] leading-none">__IGDB__</span>\n<span class="font-mono-tech text-[8px] font-bold text-[#ff4f00]">PTS</span>\n</div>\n</div>\n<div class="space-y-1.5">\n<div class="w-full h-3 border-2 border-[#141413] bg-[#f4f0e6] p-0.5 flex">\n<div class="h-full bg-[#ff4f00] transition-all duration-300" style="width:__SCORE_PCT_NUM__%; background-color: rgb(255, 79, 0);"></div>\n</div>\n<div class="hidden" style=""></div>\n</div>\n</div>\n</div>\n</div>' }, "tw32-2": { "tw": true, "extra": "", "html": '<div class="cine-canvas">\n<div class="hidden"></div>\n<div class="hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="cine-backdrop"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="cine-vignette"></div>\n<div class="relative z-10 p-6 sm:p-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6 min-h-[250px]">\n<div class="space-y-3 max-w-xl">\n<div class="flex flex-wrap items-center gap-3">\n<span class="font-mono-tech text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-white/10 text-amber-300 backdrop-blur-md border border-white/15">__SCORE_SRC__</span>\n<span class="font-mono-tech text-xs text-stone-300">\u0420\u0415\u041B\u0418\u0417 // 2025</span>\n</div>\n<div>\n<h3 class="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight leading-none drop-shadow-md">__TITLE__</h3>\n<p class="text-xs sm:text-sm text-stone-300 mt-1.5 font-medium">__META__</p>\n</div>\n<div class="pt-1 flex flex-wrap items-center gap-2 font-mono-tech text-[11px] uppercase tracking-wider text-amber-200/90">__GENRE_SPANS__</div>\n</div>\n<div class="cine-hud-capsule p-4 flex flex-wrap sm:flex-nowrap items-center gap-5 shrink-0">\n<div class="flex items-center gap-3">\n<div class="relative w-14 h-14 flex items-center justify-center">\n<svg class="w-14 h-14 -rotate-90" viewbox="0 0 56 56">\n<circle cx="28" cy="28" fill="none" r="23" stroke="rgba(255,255,255,0.12)" stroke-width="4"></circle>\n<circle class="gauge-ring" cx="28" cy="28" fill="none" r="23" stroke="#ff4f00" stroke-dasharray="144.5" stroke-dashoffset="23" stroke-linecap="round" stroke-width="4" style="stroke-dashoffset: 23.1;"></circle>\n</svg>\n<span class="absolute font-mono-tech text-sm font-bold text-white">__SCORE10__</span>\n</div>\n<div>\n<div class="font-mono-tech text-xs font-bold text-white uppercase">Backloggd</div>\n<div class="text-[11px] text-stone-400">\u0420\u0435\u0439\u0442\u0438\u043D\u0433 \u0438\u0433\u0440\u043E\u043A\u043E\u0432</div>\n<div class="hidden">BG</div>\n</div>\n</div>\n<div class="hidden sm:block w-px h-10 bg-white/15"></div>\n<div class="flex items-center gap-3">\n<div class="relative w-14 h-14 flex items-center justify-center">\n<svg class="w-14 h-14 -rotate-90" viewbox="0 0 56 56">\n<circle cx="28" cy="28" fill="none" r="23" stroke="rgba(255,255,255,0.12)" stroke-width="4"></circle>\n<circle class="gauge-ring" cx="28" cy="28" fill="none" r="23" stroke="#eab308" stroke-dasharray="144.5" stroke-dashoffset="26" stroke-linecap="round" stroke-width="4" style="stroke-dashoffset: 26;"></circle>\n</svg>\n<span class="absolute font-mono-tech text-sm font-bold text-white">__IGDB__</span>\n</div>\n<div>\n<div class="font-mono-tech text-xs font-bold text-white uppercase">IGDB / Steam</div>\n<div class="text-[11px] text-emerald-400 font-mono-tech"><span>__STEAM_PCT__</span> \xB7 <span class="text-stone-400">Steam</span></div>\n</div>\n</div>\n<div class="hidden sm:block w-px h-10 bg-white/15"></div>\n<div class="flex items-center gap-2">__TW32_LINKS__</div>\n</div>\n</div>\n</div>' }, "tw32-3": { "tw": true, "extra": "", "html": '<div class="bg-white text-black border-4 border-black overflow-hidden">\n<div class="grid grid-cols-1 md:grid-cols-12">\n<!-- Left Vertical Accent Column -->\n<div class="md:col-span-1 bg-[#ff4f00] text-white p-3 flex md:flex-col justify-between items-center font-mono-tech text-xs font-bold" style="background-color: rgb(255, 79, 0);">\n<span class="md:-rotate-90 md:my-auto tracking-widest uppercase whitespace-nowrap">PX</span>\n<span class="text-[11px]">__YEAR__</span>\n</div>\n<!-- Main Typographic Grid -->\n<div class="md:col-span-7 p-6 border-b-2 md:border-b-0 md:border-r-2 border-black flex flex-col justify-between gap-6">\n<div>\n<div class="font-mono-tech text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-2">__GENRE_SPANS__</div>\n<h3 class="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tighter leading-[0.95] text-black">__TITLE__</h3>\n<p class="text-xs font-semibold text-neutral-600 mt-2">__META__</p>\n</div>\n<!-- Hyper-clean underlined text links -->\n<div class="flex flex-wrap gap-x-5 gap-y-2 pt-3 border-t border-neutral-200 font-mono-tech text-xs font-bold uppercase">__TW32_LINKS__</div>\n</div>\n<!-- Right Modular Numbers + Mini Poster -->\n<div class="md:col-span-4 p-6 bg-neutral-100 flex flex-col justify-between gap-4">\n<div class="flex items-start justify-between gap-4">\n<div>\n<div class="font-mono-tech text-[10px] font-bold uppercase text-neutral-500">__SCORE_SRC__</div>\n<div class="font-display text-6xl font-extrabold tracking-tighter leading-none text-black mt-1">__SCORE10__</div>\n</div>\n<div class="w-16 h-22 aspect-[3/4] border-2 border-black shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n</div>\n<div class="grid grid-cols-2 border-t-2 border-black pt-3 gap-2 font-mono-tech">\n<div>\n<div class="text-[10px] text-neutral-500 uppercase">IGDB</div>\n<div class="text-lg font-extrabold text-black">__IGDB__</div>\n</div>\n<div>\n<div class="text-[10px] text-neutral-500 uppercase">Steam</div>\n<div class="text-lg font-extrabold text-black">__STEAM_PCT__</div>\n</div>\n</div>\n</div>\n</div>\n</div>' }, "tw32-4": { "tw": true, "extra": "", "html": '<div class="dmg-shell p-4 sm:p-5">\n<div class="dmg-bezel p-3 sm:p-4">\n<!-- Top Bezel Line -->\n<div class="flex items-center justify-between text-[9px] font-mono-tech uppercase tracking-widest text-stone-300 mb-2">\n<div class="flex items-center gap-2">\n<span class="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]"></span>\n<span>DOT MATRIX WITH STEREO SOUND</span>\n</div>\n<span class="font-bold text-amber-300">__SCORE_SRC__</span>\n</div>\n<!-- Green LCD Screen -->\n<div class="dmg-lcd p-4 rounded flex flex-col sm:flex-row gap-4 items-stretch justify-between">\n<div class="flex gap-4 items-center">\n<div class="w-20 sm:w-24 aspect-[3/4] border-2 border-[#0f380f] shrink-0 overflow-hidden grayscale contrast-150"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="space-y-1.5">\n<div class="font-mono-tech text-[10px] font-bold uppercase opacity-80">__META__</div>\n<h3 class="font-mono-tech text-xl sm:text-2xl font-extrabold uppercase tracking-tight leading-none">__TITLE__</h3>\n<div class="font-mono-tech text-[10px] font-bold uppercase">__GENRE_SPANS__</div>\n<div class="pt-1.5 flex flex-wrap gap-2 font-mono-tech text-[11px] font-bold uppercase">__TW32_LINKS__</div>\n</div>\n</div>\n<!-- Pixel Score Block -->\n<div class="sm:border-l-2 border-[#0f380f] sm:pl-4 flex sm:flex-col justify-between items-end shrink-0 font-mono-tech">\n<div class="text-right">\n<div class="text-[10px] font-bold uppercase">__SCORE_SRC__</div>\n<div class="text-3xl sm:text-4xl font-extrabold leading-none">__SCORE10__</div>\n</div>\n<div class="text-right text-[11px] font-bold">\n<div>IGDB: <span>__IGDB__</span></div>\n<div>STM: <span>__STEAM_PCT__</span></div>\n</div>\n</div>\n</div>\n</div>\n<!-- Bottom Physical Shell Decor -->\n<div class="mt-3 flex items-center justify-between px-2 font-mono-tech text-[10px] font-bold text-[#3f3e38]">\n<span>NINTEN-REVIEW // DMG-01</span>\n<div class="flex items-center gap-3">\n<span class="px-2 py-0.5 rounded-full bg-[#8f2950] text-white text-[9px]">A</span>\n<span class="px-2 py-0.5 rounded-full bg-[#8f2950] text-white text-[9px]">B</span>\n</div>\n</div>\n</div>' }, "tw32-5": { "tw": true, "extra": "", "html": '<div class="rounded-xl bg-[#14171f] border border-white/15 shadow-2xl overflow-hidden flex flex-col sm:flex-row">\n<!-- Left Plastic Spine + Obi Strip -->\n<div class="sm:w-14 bg-[#ff4f00] text-white p-2.5 sm:py-4 flex sm:flex-col items-center justify-between shrink-0 font-mono-tech" style="background-color: rgb(255, 79, 0);">\n<span class="text-[10px] font-extrabold tracking-widest uppercase sm:-rotate-90 sm:my-auto whitespace-nowrap">BACKLOGGD // 2025</span>\n<span class="text-[10px] font-bold bg-black/25 px-1.5 py-0.5 rounded">8.4</span>\n</div>\n<!-- Cover Art Square -->\n<div class="p-4 sm:p-5 flex items-center justify-center bg-black/40 border-b sm:border-b-0 sm:border-r border-white/10 shrink-0">\n<div class="relative w-32 h-32 sm:w-36 sm:h-36 rounded-md overflow-hidden border border-white/20 shadow-xl">\n<div class="w-full h-full"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="absolute inset-0 bg-gradient-to-tr from-white/5 via-white/20 to-transparent pointer-events-none"></div>\n</div>\n</div>\n<!-- Booklet Info -->\n<div class="flex-1 p-5 flex flex-col justify-between gap-4">\n<div class="flex flex-wrap items-start justify-between gap-3">\n<div>\n<div class="font-mono-tech text-[10px] uppercase tracking-widest text-sky-400 font-bold">__SCORE_SRC__</div>\n<h3 class="font-display text-2xl font-bold text-white mt-0.5">__TITLE__</h3>\n<div class="text-xs text-slate-400 mt-0.5">__META__</div>\n</div>\n<!-- Critic Sticker -->\n<div class="px-3 py-1.5 rounded-lg bg-white text-black text-center shrink-0 shadow">\n<div class="font-mono-tech text-[9px] font-extrabold uppercase tracking-wider text-neutral-500">PX</div>\n<div class="font-display text-2xl font-extrabold leading-none">__SCORE10__</div>\n</div>\n</div>\n<!-- Tracklist-style Specs -->\n<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs border-y border-white/10 py-2.5 font-mono-tech">\n<div><span class="text-slate-500">01. IGDB:</span> <strong class="text-white">__IGDB__</strong></div>\n<div><span class="text-slate-500">02. STEAM:</span> <strong class="text-emerald-400">__STEAM_PCT__</strong></div>\n<div class="col-span-2 sm:col-span-1 truncate"><span class="text-slate-500">03.</span> <span class="text-slate-200">__GENRE_SPANS__</span></div>\n</div>\n<!-- Links -->\n<div class="flex flex-wrap items-center gap-4 text-xs font-medium text-sky-300">__TW32_LINKS__</div>\n</div>\n</div>' }, "tw32-6": { "tw": true, "extra": "", "html": '<div class="crt-box rounded-xl p-5 font-mono-tech text-emerald-400">\n<div class="flex flex-wrap items-center justify-between gap-2 text-[11px] border-b border-emerald-500/30 pb-2 mb-4">\n<span>root@review:~# inspect --source=backloggd</span>\n<span class="text-emerald-500/70">[SYS.OK // 60FPS]</span>\n</div>\n<div class="flex flex-col sm:flex-row gap-5 items-start">\n<div class="w-24 aspect-[3/4] border border-emerald-500/60 p-0.5 bg-emerald-950/30 shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="flex-1 min-w-0 space-y-2.5 w-full">\n<div>\n<div class="text-xl sm:text-2xl font-bold text-emerald-300 tracking-tight">__TITLE__</div>\n<div class="text-xs text-emerald-500/80">__META__</div>\n</div>\n<div class="text-xs text-emerald-200/90">__GENRE_SPANS__</div>\n<!-- ASCII Progress Bars -->\n<div class="bg-emerald-950/40 border border-emerald-500/25 p-3 rounded text-xs space-y-1.5">\n<div class="flex items-center justify-between gap-2">\n<span>__SCORE_SRC__</span>\n<span class="text-emerald-300 font-bold">__ASCII_BAR__</span>\n</div>\n<div class="flex items-center justify-between gap-2">\n<span>IGDB_INDX:</span>\n<span class="text-amber-300 font-bold">__ASCII_IGDB__</span>\n</div>\n<div class="flex items-center justify-between gap-2">\n<span>STEAM_POS:</span>\n<span class="text-emerald-300 font-bold">__ASCII_STEAM__</span>\n</div>\n</div>\n<div class="pt-1 flex flex-wrap gap-3 text-xs">__TW32_LINKS__</div>\n</div>\n</div>\n</div>' }, "tw32-7": { "tw": true, "extra": "", "html": '<div class="bg-[#f3ece0] text-[#1c1917] p-5 sm:p-7 border border-[#d6cbb9] shadow-xl">\n<!-- Newspaper Masthead -->\n<div class="border-b-2 border-[#1c1917] pb-2 mb-4 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-widest font-semibold">\n<span>\u0425\u0420\u041E\u041D\u0418\u041A\u0410 \u0412\u0418\u0414\u0415\u041E\u0418\u0413\u0420 \xB7 BACKLOGGD EDITION</span>\n<span>__YEAR__</span>\n</div>\n<div class="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">\n<div class="md:col-span-3">\n<div class="w-28 md:w-full aspect-[3/4] border border-[#1c1917] p-1 bg-white mx-auto"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n</div>\n<div class="md:col-span-6 space-y-2.5 border-b md:border-b-0 md:border-r border-[#1c1917]/20 pb-4 md:pb-0 md:pr-5">\n<div class="text-[11px] uppercase tracking-wider text-stone-600 font-semibold">__GENRE_SPANS__</div>\n<h3 class="font-editorial text-3xl sm:text-4xl font-normal text-[#1c1917] leading-none">__TITLE__</h3>\n<p class="text-xs italic text-stone-600">__META__</p>\n<p class="text-xs sm:text-sm text-stone-800 leading-relaxed pt-1 border-t border-[#1c1917]/15">\xAB\u042D\u0442\u0430\u043B\u043E\u043D\u043D\u044B\u0439 \u043A\u0438\u0431\u0435\u0440\u043F\u0430\u043D\u043A \u0441 \u0432\u0435\u0440\u0442\u0438\u043A\u0430\u043B\u044C\u043D\u044B\u043C \u043B\u0435\u0432\u0435\u043B-\u0434\u0438\u0437\u0430\u0439\u043D\u043E\u043C \u0438 \u0433\u0443\u0441\u0442\u043E\u0439 \u0430\u0442\u043C\u043E\u0441\u0444\u0435\u0440\u043E\u0439 \u043C\u0435\u0433\u0430\u043F\u043E\u043B\u0438\u0441\u0430\xBB</p>\n<div class="pt-1 flex flex-wrap gap-3 text-xs font-semibold underline underline-offset-4 decoration-stone-400">__TW32_LINKS__</div>\n</div>\n<div class="md:col-span-3 text-center space-y-2">\n<div class="text-[10px] uppercase tracking-widest text-stone-500 font-bold">__SCORE_SRC__</div>\n<div class="font-editorial text-5xl text-[#1c1917] leading-none">__SCORE10__</div>\n<div class="text-xs font-mono-tech text-stone-700 border-t border-[#1c1917]/20 pt-2">\n                IGDB: <strong>__IGDB__</strong> \xB7 Steam: <strong>__STEAM_PCT__</strong>\n</div>\n</div>\n</div>\n</div>' }, "tw32-8": { "tw": true, "extra": "", "html": '<div class="metal-plate rounded-xl p-5 relative">\n<!-- 4 Corner Rivets -->\n<span class="absolute top-2.5 left-2.5 w-2 h-2 rounded-full bg-zinc-500 shadow-inner"></span>\n<span class="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-zinc-500 shadow-inner"></span>\n<span class="absolute bottom-2.5 left-2.5 w-2 h-2 rounded-full bg-zinc-500 shadow-inner"></span>\n<span class="absolute bottom-2.5 right-2.5 w-2 h-2 rounded-full bg-zinc-500 shadow-inner"></span>\n<div class="px-2 flex flex-col md:flex-row items-center gap-5">\n<div class="w-24 aspect-[3/4] rounded border-2 border-zinc-600 shadow-lg shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="flex-1 min-w-0 space-y-2 text-center md:text-left">\n<div class="flex flex-wrap items-center justify-center md:justify-start gap-2 font-mono-tech text-[10px] uppercase tracking-widest text-zinc-400">\n<span class="text-amber-400 font-bold">__SCORE_SRC__</span>\n<span>\u2022</span>\n<span>__YEAR__</span>\n</div>\n<h3 class="font-display text-2xl font-bold text-zinc-100 tracking-tight">__TITLE__</h3>\n<div class="text-xs text-zinc-400">__META__</div>\n<div class="font-mono-tech text-[11px] text-zinc-300">__GENRE_SPANS__</div>\n<div class="pt-2 flex flex-wrap justify-center md:justify-start gap-2">__TW32_LINKS__</div>\n</div>\n<!-- Recessed LED Display -->\n<div class="w-full md:w-48 bg-[#0b0c0e] border-2 border-zinc-700 rounded-lg p-3.5 shadow-[inset_0_3px_10px_rgba(0,0,0,0.9)] font-mono-tech shrink-0">\n<div class="flex justify-between items-baseline">\n<span class="text-[10px] text-zinc-500 uppercase">PX</span>\n<span class="text-3xl font-extrabold text-amber-400 tracking-tight">__SCORE10__</span>\n</div>\n<div class="border-t border-zinc-800 mt-2 pt-2 flex justify-between text-xs">\n<span class="text-zinc-500">IGDB <strong class="text-zinc-200">__IGDB__</strong></span>\n<span class="text-zinc-500">STM <strong class="text-emerald-400">__STEAM_PCT__</strong></span>\n</div>\n</div>\n</div>\n</div>' }, "tw32-9": { "tw": true, "extra": "", "html": '<div class="bg-[#2a2520] rounded-2xl p-5 sm:p-6 border border-white/10 flex flex-col md:flex-row items-center gap-6">\n<!-- Polaroid Frame -->\n<div class="bg-[#faf8f5] p-3 pb-4 rounded-sm shadow-xl -rotate-2 shrink-0 w-44 text-stone-900">\n<div class="w-full aspect-square bg-stone-900 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="font-editorial italic text-lg text-center mt-2 leading-tight text-stone-800">__TITLE__ (2025)</div>\n</div>\n<!-- Note Card -->\n<div class="flex-1 bg-[#fef08a] text-stone-900 p-5 rounded-sm shadow-lg rotate-1 relative w-full">\n<div class="flex flex-wrap items-center justify-between gap-2 border-b border-stone-900/20 pb-2 mb-3">\n<span class="font-mono-tech text-[11px] font-extrabold uppercase tracking-wider text-stone-700">__SCORE_SRC__</span>\n<span class="font-mono-tech text-lg font-extrabold bg-stone-900 text-[#fef08a] px-2 py-0.5 rounded">__SCORE10__</span>\n</div>\n<h3 class="font-display text-2xl font-bold text-stone-900">__TITLE__</h3>\n<p class="text-xs font-semibold text-stone-700 mt-0.5">__META__</p>\n<div class="font-mono-tech text-[11px] font-bold text-stone-800 mt-2">__GENRE_SPANS__</div>\n<div class="mt-3 pt-2 border-t border-stone-900/15 flex flex-wrap items-center justify-between gap-2">\n<div class="font-mono-tech text-xs font-bold text-stone-800">\n                IGDB: <span>__IGDB__</span> | Steam: <span>__STEAM_PCT__</span>\n</div>\n<div class="flex flex-wrap gap-3 text-xs font-bold underline">__TW32_LINKS__</div>\n</div>\n</div>\n</div>' }, "tw32-10": { "tw": true, "extra": "", "html": '<div class="rounded-2xl overflow-hidden border border-white/10 grid grid-cols-1 md:grid-cols-2 shadow-2xl">\n<!-- Left Visual Half -->\n<div class="relative min-h-[210px] p-6 flex flex-col justify-between bg-stone-950 overflow-hidden">\n<div class="absolute inset-0 opacity-55"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/30"></div>\n<div class="relative z-10 flex items-center justify-between">\n<span class="font-mono-tech text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/15 text-white backdrop-blur">__SCORE_SRC__</span>\n<span class="font-mono-tech text-xs text-white/80 font-bold">__YEAR__</span>\n</div>\n<div class="relative z-10">\n<div class="text-[11px] font-mono-tech uppercase text-amber-300 mb-1">__GENRE_SPANS__</div>\n<h3 class="font-display text-3xl font-bold text-white leading-tight">__TITLE__</h3>\n<p class="text-xs text-stone-300 mt-1">__META__</p>\n</div>\n</div>\n<!-- Right Clean Score Comparison Half -->\n<div class="bg-[#f8fafc] text-slate-900 p-6 flex flex-col justify-between gap-4">\n<div class="space-y-3">\n<div class="text-[11px] font-mono-tech font-bold uppercase tracking-wider text-slate-400">\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0440\u0435\u0439\u0442\u0438\u043D\u0433\u043E\u0432</div>\n<!-- Bar 1 -->\n<div>\n<div class="flex justify-between text-xs font-bold mb-1">\n<span>__SCORE_SRC__</span>\n<span class="font-mono-tech">__SCORE10__</span>\n</div>\n<div class="h-2 bg-slate-200 rounded-full overflow-hidden">\n<div class="h-full bg-[#ff4f00] rounded-full" style="width:__SCORE_PCT_NUM__%; background-color: rgb(255, 79, 0);"></div>\n</div>\n</div>\n<!-- Bar 2 -->\n<div>\n<div class="flex justify-between text-xs font-bold mb-1">\n<span>IGDB Score</span>\n<span class="font-mono-tech">__IGDB__</span>\n</div>\n<div class="h-2 bg-slate-200 rounded-full overflow-hidden">\n<div class="h-full bg-slate-800 rounded-full" style="width:__IGDB__%"></div>\n</div>\n</div>\n<!-- Bar 3 -->\n<div>\n<div class="flex justify-between text-xs font-bold mb-1">\n<span>Steam Reviews</span>\n<span class="font-mono-tech text-emerald-600">__STEAM_PCT__</span>\n</div>\n<div class="h-2 bg-slate-200 rounded-full overflow-hidden">\n<div class="h-full bg-emerald-500 rounded-full" style="width:__STEAM_NUM__%"></div>\n</div>\n</div>\n</div>\n<div class="pt-3 border-t border-slate-200 flex flex-wrap gap-4 text-xs font-bold text-slate-700">__TW32_LINKS__</div>\n</div>\n</div>' }, "tw32-11": { "tw": true, "extra": "", "html": '<div class="bg-[#111113] border-2 border-yellow-400 rounded-xl overflow-hidden shadow-[0_0_25px_rgba(250,204,21,0.12)]">\n<div class="arcade-hazard h-2.5 w-full"></div>\n<div class="p-5 flex flex-col sm:flex-row items-center justify-between gap-5">\n<div class="flex items-center gap-4">\n<div class="w-20 h-24 aspect-[3/4] border-2 border-yellow-400 shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div>\n<div class="inline-block bg-yellow-400 text-black font-mono-tech text-[10px] font-extrabold px-2 py-0.5 uppercase -skew-x-12 mb-1">__SCORE_SRC__</div>\n<h3 class="font-display text-2xl sm:text-3xl font-extrabold italic uppercase text-white tracking-tight leading-none">__TITLE__</h3>\n<div class="font-mono-tech text-xs text-zinc-400 mt-1">__META__</div>\n<div class="mt-2.5 flex flex-wrap gap-2">__TW32_LINKS__</div>\n</div>\n</div>\n<!-- Arcade High Score Box -->\n<div class="bg-black border-2 border-zinc-700 px-5 py-3 rounded-lg text-center shrink-0 font-mono-tech">\n<div class="text-[10px] text-yellow-400 font-bold tracking-widest uppercase">HIGH SCORE</div>\n<div class="text-4xl font-extrabold text-white leading-none my-1">__SCORE10__</div>\n<div class="text-[10px] text-zinc-400">IGDB <span class="text-cyan-400 font-bold">__IGDB__</span> \u2022 STM <span class="text-emerald-400 font-bold">__STEAM_PCT__</span></div>\n</div>\n</div>\n</div>' }, "tw32-12": { "tw": true, "extra": "", "html": '<div class="rounded-xl bg-[#141413] border border-stone-700/80 border-l-4 border-l-[#ff4f00] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3" style="border-left-color: rgb(255, 79, 0);">\n<div class="flex items-center gap-3 min-w-0">\n<div class="w-10 h-12 rounded overflow-hidden shrink-0 border border-white/10"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="min-w-0">\n<div class="flex items-center gap-2">\n<h3 class="font-display text-sm sm:text-base font-bold text-white truncate">__TITLE__</h3>\n<span class="font-mono-tech text-[11px] text-stone-400">__YEAR__</span>\n</div>\n<div class="text-xs text-stone-400 truncate">__META__ \xB7 __GENRES_DOT__</div>\n</div>\n</div>\n<div class="flex items-center gap-4 shrink-0">\n<div class="flex items-center gap-2 font-mono-tech text-xs">\n<span class="px-2 py-0.5 rounded bg-[#ff4f00]/15 text-[#ff4f00] font-bold" style="color: rgb(255, 79, 0); background-color: rgba(255, 79, 0, 0.15);">__SCORE10__</span>\n<span class="text-stone-500">|</span>\n<span class="text-stone-300">IGDB <strong>__IGDB__</strong></span>\n<span class="text-stone-500 hidden sm:inline">|</span>\n<span class="text-emerald-400 hidden sm:inline">__STEAM_PCT__</span>\n</div>\n<div class="flex items-center gap-2 text-xs font-mono-tech text-stone-300">__TW32_LINKS__</div>\n</div>\n</div>' }, "tw32-13": { "tw": true, "extra": "", "html": '<div class="bg-[#121212] border border-stone-700 rounded-lg overflow-hidden shadow-2xl">\n<!-- Classic VHS Rainbow Stripe -->\n<div class="h-2.5 w-full flex">\n<div class="flex-1 bg-[#dc2626]"></div>\n<div class="flex-1 bg-[#ea580c]"></div>\n<div class="flex-1 bg-[#eab308]"></div>\n<div class="flex-1 bg-[#2563eb]"></div>\n</div>\n<div class="p-5 flex flex-col sm:flex-row gap-5 items-center justify-between">\n<div class="flex items-center gap-4 w-full sm:w-auto">\n<div class="w-20 aspect-[3/4] border border-white/20 shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="space-y-1">\n<div class="flex items-center gap-2 font-mono-tech text-[10px] font-bold">\n<span class="px-1.5 py-0.5 bg-white text-black rounded-sm">HI-FI STEREO</span>\n<span class="text-orange-400">__SCORE_SRC__</span>\n</div>\n<h3 class="font-display text-2xl font-extrabold text-white tracking-tight">__TITLE__</h3>\n<div class="text-xs text-stone-400">__META__</div>\n<div class="font-mono-tech text-[10px] text-stone-300 uppercase">__GENRE_SPANS__</div>\n</div>\n</div>\n<div class="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 border-stone-800 pt-3 sm:pt-0">\n<div class="bg-black border border-stone-700 px-3.5 py-2 rounded text-center font-mono-tech">\n<div class="text-[9px] text-stone-500 uppercase">PX</div>\n<div class="text-2xl font-extrabold text-orange-400">__SCORE10__</div>\n</div>\n<div class="font-mono-tech text-xs space-y-1 text-right">\n<div class="text-stone-300">IGDB: <strong class="text-white">__IGDB__</strong></div>\n<div class="text-stone-300">STEAM: <strong class="text-emerald-400">__STEAM_PCT__</strong></div>\n<div class="flex gap-2 pt-1 text-[11px] text-orange-300">__TW32_LINKS__</div>\n</div>\n</div>\n</div>\n</div>' }, "tw32-14": { "tw": true, "extra": "", "html": '<div class="blueprint-bg border-2 border-white/80 p-4 sm:p-5 text-white font-mono-tech relative">\n<div class="border border-white/50 p-4 flex flex-col md:flex-row gap-5 justify-between items-stretch">\n<div class="flex gap-4 items-center">\n<div class="w-20 aspect-[3/4] border border-white/80 p-0.5 shrink-0 overflow-hidden opacity-90"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="space-y-1.5">\n<div class="text-[10px] text-sky-200 tracking-widest uppercase">__SCORE_SRC__</div>\n<h3 class="text-xl sm:text-2xl font-bold uppercase tracking-tight">__TITLE__</h3>\n<div class="text-xs text-sky-100/80">__META__</div>\n<div class="text-[11px] text-sky-200">__GENRE_SPANS__</div>\n<div class="pt-1 flex flex-wrap gap-3 text-[11px] underline underline-offset-4 text-white">__TW32_LINKS__</div>\n</div>\n</div>\n<!-- CAD Title Block Stamp -->\n<div class="border-2 border-white/80 bg-[#082640]/80 grid grid-cols-3 text-center shrink-0 md:w-64">\n<div class="col-span-3 border-b border-white/60 py-1 text-[10px] tracking-widest uppercase text-sky-200">\u0427\u0415\u0420\u0422\u0401\u0416 // BACKLOGGD</div>\n<div class="border-r border-white/60 p-2">\n<div class="text-[9px] text-sky-300">SCORE</div>\n<div class="text-xl font-bold">__SCORE10__</div>\n</div>\n<div class="border-r border-white/60 p-2">\n<div class="text-[9px] text-sky-300">IGDB</div>\n<div class="text-xl font-bold">__IGDB__</div>\n</div>\n<div class="p-2">\n<div class="text-[9px] text-sky-300">STEAM</div>\n<div class="text-xl font-bold">__STEAM_PCT__</div>\n</div>\n</div>\n</div>\n</div>' }, "tw32-15": { "tw": true, "extra": "", "html": '<div class="bg-[#1d1814] border-2 border-[#b48b57] rounded-lg p-5 text-[#f3e6d3] shadow-xl">\n<div class="flex flex-col md:flex-row items-center justify-between gap-5">\n<div class="flex items-center gap-4">\n<div class="w-20 aspect-[3/4] border-2 border-[#b48b57] rounded-sm shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div>\n<div class="font-mono-tech text-[10px] uppercase tracking-widest text-[#d9a76a]">__SCORE_SRC__</div>\n<h3 class="font-editorial text-3xl text-[#fff5e6] leading-none mt-0.5">__TITLE__</h3>\n<div class="text-xs text-[#cbb89d] mt-1">__META__</div>\n<div class="text-[11px] font-mono-tech text-[#d9a76a] mt-1">__GENRE_SPANS__</div>\n<div class="mt-2.5 flex flex-wrap gap-3 text-xs font-semibold text-amber-200 underline underline-offset-4">__TW32_LINKS__</div>\n</div>\n</div>\n<!-- 3 Diamond Stat Shields -->\n<div class="flex items-center gap-4 shrink-0">\n<div class="text-center">\n<div class="w-14 h-14 border-2 border-[#d9a76a] bg-[#2a2119] rounded-lg flex flex-col items-center justify-center">\n<span class="font-display text-xl font-bold text-amber-300">__SCORE10__</span>\n</div>\n<div class="font-mono-tech text-[9px] uppercase text-[#cbb89d] mt-1">PX</div>\n</div>\n<div class="text-center">\n<div class="w-14 h-14 border-2 border-[#b48b57]/60 bg-[#2a2119] rounded-lg flex flex-col items-center justify-center">\n<span class="font-display text-xl font-bold text-[#fff5e6]">__IGDB__</span>\n</div>\n<div class="font-mono-tech text-[9px] uppercase text-[#cbb89d] mt-1">IGDB</div>\n</div>\n<div class="text-center">\n<div class="w-14 h-14 border-2 border-[#b48b57]/60 bg-[#2a2119] rounded-lg flex flex-col items-center justify-center">\n<span class="font-display text-xl font-bold text-emerald-300">__STEAM_PCT__</span>\n</div>\n<div class="font-mono-tech text-[9px] uppercase text-[#cbb89d] mt-1">STEAM</div>\n</div>\n</div>\n</div>\n</div>' }, "tw32-16": { "tw": true, "extra": "", "html": '<div class="bg-[#18181b] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-5 shadow-xl">\n<div class="w-24 h-24 rounded-xl overflow-hidden shrink-0 shadow-lg border border-white/10"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="flex-1 min-w-0 w-full space-y-3">\n<div class="flex items-start justify-between gap-3">\n<div class="min-w-0">\n<div class="text-[10px] font-mono-tech uppercase tracking-widest text-green-400 font-bold">__SCORE_SRC__</div>\n<h3 class="font-display text-xl sm:text-2xl font-bold text-white truncate">__TITLE__</h3>\n<p class="text-xs text-zinc-400 truncate">__META__</p>\n</div>\n<div class="text-right shrink-0 font-mono-tech">\n<div class="text-2xl font-extrabold text-green-400 leading-none">__SCORE10__</div>\n<div class="text-[10px] text-zinc-500 mt-0.5">IGDB <span>__IGDB__</span> \xB7 STM <span>__STEAM_PCT__</span></div>\n</div>\n</div>\n<!-- Player Progress Bar as Score Meter -->\n<div class="space-y-1">\n<div class="h-1.5 w-full bg-zinc-700 rounded-full overflow-hidden">\n<div class="h-full bg-green-400 rounded-full" style="width: 84%"></div>\n</div>\n<div class="flex items-center justify-between text-[11px] font-mono-tech text-zinc-400">\n<span class="truncate">__GENRE_SPANS__</span>\n<div class="flex items-center gap-3 text-white font-semibold shrink-0">__TW32_LINKS__</div>\n</div>\n</div>\n</div>\n</div>' }, "tw32-17": { "tw": true, "extra": "", "html": '<div class="bg-[#fafafa] text-[#171717] p-6 sm:p-8 shadow-2xl border border-stone-300">\n<div class="flex flex-col sm:flex-row gap-6 items-start justify-between">\n<div class="flex gap-5 items-start">\n<div class="w-20 aspect-[3/4] shadow-md shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="space-y-1.5">\n<div class="text-xs text-neutral-500 font-medium">__META__</div>\n<h3 class="font-editorial text-3xl text-neutral-900 leading-none">__TITLE__</h3>\n<div class="text-xs text-neutral-600 pt-1">__GENRE_SPANS__</div>\n<div class="pt-3 flex flex-wrap gap-4 text-[11px] font-mono-tech uppercase tracking-wider text-neutral-500">__TW32_LINKS__</div>\n</div>\n</div>\n<div class="sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 w-full sm:w-auto flex sm:block justify-between items-baseline shrink-0">\n<div>\n<div class="font-mono-tech text-[10px] uppercase tracking-widest text-neutral-400">__SCORE_SRC__</div>\n<div class="font-display text-4xl font-light text-neutral-900">__SCORE10__</div>\n</div>\n<div class="font-mono-tech text-[11px] text-neutral-500 sm:mt-2">\n                IGDB <span class="text-neutral-900 font-semibold">__IGDB__</span> \xB7 Steam <span class="text-neutral-900 font-semibold">__STEAM_PCT__</span>\n</div>\n</div>\n</div>\n</div>' }, "tw32-18": { "tw": true, "extra": "", "html": '<div class="comic-dots border-4 border-black p-5 text-black shadow-[8px_8px_0px_#000000] relative">\n<div class="flex flex-col sm:flex-row items-center justify-between gap-5">\n<div class="flex items-center gap-4">\n<div class="w-24 aspect-[3/4] border-3 border-black shadow-[4px_4px_0_#000] bg-white shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="space-y-1.5">\n<span class="inline-block bg-black text-yellow-300 font-mono-tech text-[10px] font-extrabold px-2 py-0.5 uppercase">__SCORE_SRC__</span>\n<h3 class="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight leading-none">__TITLE__</h3>\n<div class="text-xs font-bold text-neutral-800">__META__</div>\n<div class="text-[11px] font-mono-tech font-bold uppercase text-neutral-700">__GENRE_SPANS__</div>\n<div class="pt-1 flex flex-wrap gap-2">__TW32_LINKS__</div>\n</div>\n</div>\n<!-- Comic Burst Badge -->\n<div class="bg-[#ff4f00] text-white border-4 border-black px-5 py-3 -rotate-3 shadow-[4px_4px_0_#000] text-center shrink-0">\n<div class="font-mono-tech text-[10px] font-extrabold uppercase">SCORE!</div>\n<div class="font-display text-4xl font-extrabold leading-none">__SCORE10__</div>\n<div class="font-mono-tech text-[10px] font-bold mt-1">IGDB <span>__IGDB__</span> | STM <span>__STEAM_PCT__</span></div>\n</div>\n</div>\n</div>' }, "tw32-19": { "tw": true, "extra": "", "html": '<div class="win95-box p-1">\n<!-- Titlebar -->\n<div class="bg-[#000080] text-white px-2.5 py-1 flex items-center justify-between text-xs font-bold">\n<span>GameInfo.exe \u2014 Backloggd</span>\n<div class="flex gap-1">\n<span class="w-4 h-4 bg-[#c0c0c0] text-black border border-white text-[10px] flex items-center justify-center leading-none">_</span>\n<span class="w-4 h-4 bg-[#c0c0c0] text-black border border-white text-[10px] flex items-center justify-center leading-none">\xD7</span>\n</div>\n</div>\n<!-- Content -->\n<div class="p-3 sm:p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">\n<div class="flex items-center gap-4">\n<div class="w-20 aspect-[3/4] win95-inset p-0.5 shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="space-y-1">\n<h3 class="text-xl font-bold text-black">__TITLE__</h3>\n<div class="text-xs text-neutral-700">__META__</div>\n<div class="text-[11px] font-mono-tech text-neutral-600">__GENRE_SPANS__</div>\n<div class="pt-2 flex flex-wrap gap-1.5">__TW32_LINKS__</div>\n</div>\n</div>\n<div class="win95-inset px-4 py-2.5 text-center shrink-0 w-full sm:w-auto font-mono-tech">\n<div class="text-[10px] text-neutral-600 uppercase">__SCORE_SRC__</div>\n<div class="text-3xl font-bold text-[#000080]">__SCORE10__</div>\n<div class="text-[11px] text-neutral-700">IGDB: <strong>__IGDB__</strong> | STM: <strong>__STEAM_PCT__</strong></div>\n</div>\n</div>\n</div>' }, "tw32-20": { "tw": true, "extra": "", "html": '<div class="bg-[#09090b] border border-zinc-800 rounded-xl p-5 text-zinc-100 font-mono-tech shadow-2xl">\n<div class="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-zinc-800 text-[11px] text-zinc-400">\n<span class="text-amber-400 font-bold">__SCORE_SRC__</span>\n<span>STATUS: <strong class="text-emerald-400">ON TIME</strong></span>\n</div>\n<div class="flex flex-col md:flex-row items-center justify-between gap-5">\n<div class="flex items-center gap-4">\n<div class="w-20 aspect-[3/4] rounded overflow-hidden border border-zinc-700 shrink-0"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="space-y-2">\n<div class="flex flex-wrap items-center gap-2">\n<span class="flap-tile px-2 py-1 text-sm font-bold text-amber-400">__YEAR__</span>\n<h3 class="flap-tile px-3 py-1 text-lg sm:text-xl font-bold uppercase text-white tracking-wider">__TITLE__</h3>\n</div>\n<div class="text-xs text-zinc-400">__META__</div>\n<div class="flex flex-wrap gap-3 text-xs text-amber-300">__TW32_LINKS__</div>\n</div>\n</div>\n<div class="flex items-center gap-2 shrink-0">\n<div class="flap-tile px-3 py-2 text-center">\n<div class="text-[9px] text-zinc-500">PX</div>\n<div class="text-2xl font-extrabold text-amber-400">__SCORE10__</div>\n</div>\n<div class="flap-tile px-3 py-2 text-center">\n<div class="text-[9px] text-zinc-500">IGDB</div>\n<div class="text-2xl font-extrabold text-white">__IGDB__</div>\n</div>\n<div class="flap-tile px-3 py-2 text-center">\n<div class="text-[9px] text-zinc-500">STM</div>\n<div class="text-2xl font-extrabold text-emerald-400">__STEAM_PCT__</div>\n</div>\n</div>\n</div>\n</div>' }, "tw32-21": { "tw": true, "extra": "", "html": '<div class="rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-[#e0f2fe] via-[#f0fdf4] to-[#fef3c7] text-slate-800 shadow-xl">\n<div class="flex flex-col sm:flex-row items-center justify-between gap-5">\n<div class="flex items-center gap-4">\n<div class="w-20 aspect-[3/4] rounded-2xl shadow-md shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="space-y-1">\n<span class="inline-block text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-white/70 px-2.5 py-0.5 rounded-full">__SCORE_SRC__</span>\n<h3 class="font-display text-2xl font-bold text-slate-900">__TITLE__</h3>\n<div class="text-xs text-slate-600">__META__</div>\n<div class="text-xs text-slate-500">__GENRE_SPANS__</div>\n<div class="pt-1.5 flex flex-wrap gap-3 text-xs font-semibold text-teal-800">__TW32_LINKS__</div>\n</div>\n</div>\n<div class="flex items-center gap-3 shrink-0">\n<div class="bg-white/80 backdrop-blur px-4 py-3 rounded-2xl text-center shadow-sm">\n<div class="text-[10px] font-bold uppercase text-slate-400">PX</div>\n<div class="font-display text-3xl font-extrabold text-slate-900">__SCORE10__</div>\n</div>\n<div class="bg-white/60 backdrop-blur px-3.5 py-3 rounded-2xl text-xs font-mono-tech space-y-1">\n<div>IGDB: <strong>__IGDB__</strong></div>\n<div>Steam: <strong class="text-emerald-700">__STEAM_PCT__</strong></div>\n</div>\n</div>\n</div>\n</div>' }, "tw32-22": { "tw": true, "extra": "", "html": '<div class="ribbon-clip bg-[#1a181c] border-l-8 border-[#ff4f00] py-4 pl-5 pr-10 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl" style="border-left-color: rgb(255, 79, 0);">\n<div class="flex items-center gap-4">\n<div class="w-16 h-16 rounded-full border-2 border-[#ff4f00] shrink-0 overflow-hidden" style="border-color: rgb(255, 79, 0);"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div>\n<div class="flex items-center gap-2 text-[10px] font-mono-tech uppercase text-rose-300">\n<span>__SCORE_SRC__</span>\n<span>\u2022</span>\n<span>__YEAR__</span>\n</div>\n<h3 class="font-display text-xl sm:text-2xl font-bold text-white">__TITLE__</h3>\n<div class="text-xs text-stone-400">__META__ \xB7 __GENRES_DOT__</div>\n</div>\n</div>\n<div class="flex items-center gap-5 shrink-0">\n<div class="text-right font-mono-tech">\n<div class="text-2xl font-extrabold text-white">__SCORE10__</div>\n<div class="text-[11px] text-stone-400">IGDB <strong class="text-white">__IGDB__</strong> \xB7 STM <strong class="text-emerald-400">__STEAM_PCT__</strong></div>\n</div>\n<div class="flex flex-col text-[11px] font-mono-tech text-stone-300 gap-0.5">__TW32_LINKS__</div>\n</div>\n</div>' }, "tw32-23": { "tw": true, "extra": "", "html": '<div class="bg-white text-slate-900 rounded-2xl overflow-hidden shadow-xl grid grid-cols-1 md:grid-cols-12">\n<div class="md:col-span-8 flex flex-col justify-between">\n<div class="bg-sky-700 text-white px-5 py-2.5 flex items-center justify-between font-mono-tech text-xs font-bold">\n<span>__SCORE_SRC__</span>\n<span>CLASS: CRITIC</span>\n</div>\n<div class="p-5 flex items-center gap-4">\n<div class="w-20 aspect-[3/4] rounded-md overflow-hidden border border-slate-200 shrink-0"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="space-y-1.5 min-w-0">\n<div class="font-mono-tech text-[11px] text-slate-400 font-bold">REV \u2708 <span>__YEAR__</span></div>\n<h3 class="font-display text-2xl font-bold text-slate-900 truncate">__TITLE__</h3>\n<div class="text-xs text-slate-600">__META__</div>\n<div class="pt-1 flex flex-wrap gap-3 text-xs font-mono-tech font-bold text-sky-700">__TW32_LINKS__</div>\n</div>\n</div>\n</div>\n<div class="md:col-span-4 bg-slate-50 border-t-2 md:border-t-0 md:border-l-2 border-dashed border-slate-300 p-5 flex flex-col justify-between font-mono-tech">\n<div class="flex justify-between text-[10px] text-slate-400 font-bold">\n<span>PX</span>\n<span>GATE 01</span>\n</div>\n<div class="my-2">\n<div class="text-[10px] text-slate-500">SEAT / SCORE</div>\n<div class="text-4xl font-extrabold text-sky-700 leading-none">__SCORE10__</div>\n</div>\n<div class="text-xs text-slate-600 flex justify-between border-t border-slate-200 pt-2">\n<span>IGDB: <strong class="text-slate-900">__IGDB__</strong></span>\n<span>STM: <strong class="text-emerald-600">__STEAM_PCT__</strong></span>\n</div>\n</div>\n</div>' }, "tw32-24": { "tw": true, "extra": "", "html": '<div class="tcg-foil p-1.5 rounded-2xl shadow-2xl">\n<div class="bg-[#181512] rounded-xl p-4 sm:p-5 text-amber-50 flex flex-col sm:flex-row gap-5 items-center">\n<div class="w-28 aspect-[3/4] rounded-lg border-2 border-amber-400/70 shrink-0 overflow-hidden shadow-lg"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="flex-1 w-full space-y-3">\n<div class="flex items-center justify-between gap-2 bg-amber-950/50 border border-amber-500/40 px-3 py-1.5 rounded-lg">\n<h3 class="font-display text-xl font-bold text-amber-100">__TITLE__</h3>\n<span class="w-8 h-8 rounded-full bg-amber-400 text-black font-mono-tech font-extrabold text-sm flex items-center justify-center shrink-0">__SCORE10__</span>\n</div>\n<div class="bg-[#231e18] border border-amber-500/20 rounded-lg p-3 text-xs space-y-1.5">\n<div class="font-mono-tech text-[11px] text-amber-300 font-bold">__GENRE_SPANS__</div>\n<p class="italic text-amber-100/80">\xAB\u042D\u0442\u0430\u043B\u043E\u043D\u043D\u044B\u0439 \u043A\u0438\u0431\u0435\u0440\u043F\u0430\u043D\u043A \u0441 \u0432\u0435\u0440\u0442\u0438\u043A\u0430\u043B\u044C\u043D\u044B\u043C \u043B\u0435\u0432\u0435\u043B-\u0434\u0438\u0437\u0430\u0439\u043D\u043E\u043C \u0438 \u0433\u0443\u0441\u0442\u043E\u0439 \u0430\u0442\u043C\u043E\u0441\u0444\u0435\u0440\u043E\u0439 \u043C\u0435\u0433\u0430\u043F\u043E\u043B\u0438\u0441\u0430\xBB</p>\n<div class="pt-1 flex flex-wrap justify-between items-center gap-2 border-t border-amber-500/20 font-mono-tech text-[11px]">\n<span>IGDB <strong>__IGDB__</strong> / STM <strong class="text-emerald-400">__STEAM_PCT__</strong></span>\n<div class="flex gap-3 text-amber-300 underline">__TW32_LINKS__</div>\n</div>\n</div>\n</div>\n</div>\n</div>' }, "tw32-25": { "tw": true, "extra": "", "html": '<div class="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">\n<div class="flex items-center gap-3.5 min-w-0">\n<div class="w-12 h-14 rounded-lg overflow-hidden shrink-0 border border-white/20"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="min-w-0">\n<div class="flex items-center gap-2">\n<h3 class="font-display text-lg font-bold text-white truncate">__TITLE__</h3>\n<span class="text-[10px] font-mono-tech px-1.5 py-0.5 rounded bg-white/15 text-slate-200">__SCORE_SRC__</span>\n</div>\n<div class="text-xs text-slate-300 truncate">__META__</div>\n</div>\n</div>\n<div class="flex items-center gap-4 shrink-0">\n<div class="flex items-center gap-2 font-mono-tech text-sm">\n<span class="font-extrabold text-white bg-white/15 px-2.5 py-1 rounded-lg">__SCORE10__</span>\n<span class="text-xs text-slate-300">IGDB <strong>__IGDB__</strong></span>\n<span class="text-xs text-emerald-300">__STEAM_PCT__</span>\n</div>\n<div class="flex gap-2 text-xs text-slate-200">__TW32_LINKS__</div>\n</div>\n</div>' }, "tw32-26": { "tw": true, "extra": "", "html": '<div class="bg-[#161518] border border-white/10 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-6">\n<!-- Sleeve + Disc -->\n<div class="relative flex items-center shrink-0 pr-12">\n<div class="relative z-10 w-28 h-28 rounded shadow-2xl border border-white/20 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="absolute right-0 w-24 h-24 rounded-full bg-gradient-to-tr from-zinc-950 via-zinc-800 to-zinc-950 border-2 border-zinc-700 flex items-center justify-center shadow-xl">\n<div class="w-10 h-10 rounded-full bg-[#ff4f00] flex items-center justify-center text-white font-mono-tech text-xs font-extrabold border-2 border-black" style="background-color: rgb(255, 79, 0);">8.4</div>\n</div>\n</div>\n<div class="flex-1 min-w-0 space-y-2 text-center md:text-left">\n<div class="font-mono-tech text-[10px] uppercase tracking-widest text-purple-300">__SCORE_SRC__</div>\n<h3 class="font-display text-2xl font-bold text-white">__TITLE__</h3>\n<div class="text-xs text-zinc-400">__META__</div>\n<div class="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-1 text-xs font-mono-tech">\n<span class="text-zinc-300">IGDB: <strong class="text-white">__IGDB__</strong></span>\n<span class="text-zinc-300">STEAM: <strong class="text-emerald-400">__STEAM_PCT__</strong></span>\n<div class="flex gap-3 text-purple-300 underline">__TW32_LINKS__</div>\n</div>\n</div>\n</div>' }, "tw32-27": { "tw": true, "extra": "", "html": '<div class="bg-[#121e17] border border-[#c5a35d] p-2 rounded-sm shadow-2xl">\n<div class="border border-[#c5a35d]/50 p-5 flex flex-col sm:flex-row items-center justify-between gap-5 text-[#f4ead5]">\n<div class="flex items-center gap-5">\n<div class="w-20 aspect-[3/4] border border-[#c5a35d] p-0.5 shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="space-y-1">\n<div class="font-mono-tech text-[10px] tracking-[0.2em] uppercase text-[#c5a35d]">__SCORE_SRC__</div>\n<h3 class="font-editorial text-3xl text-[#fff8eb] leading-none">__TITLE__</h3>\n<div class="text-xs italic text-[#cbbba0]">__META__</div>\n<div class="pt-2 flex flex-wrap gap-3 text-xs text-[#e5c98b] underline underline-offset-4">__TW32_LINKS__</div>\n</div>\n</div>\n<div class="text-center border-t sm:border-t-0 sm:border-l border-[#c5a35d]/30 pt-3 sm:pt-0 sm:pl-6 shrink-0">\n<div class="font-mono-tech text-[9px] uppercase tracking-widest text-[#c5a35d]">\u041E\u0446\u0435\u043D\u043A\u0430</div>\n<div class="font-editorial text-5xl text-[#e5c98b] leading-none my-1">__SCORE10__</div>\n<div class="font-mono-tech text-[10px] text-[#cbbba0]">IGDB <span>__IGDB__</span> \xB7 STM <span>__STEAM_PCT__</span></div>\n</div>\n</div>\n</div>' }, "tw32-28": { "tw": true, "extra": "", "html": '<div class="scifi-chamfer bg-[#06131c] border border-cyan-500/60 p-5 text-cyan-50 font-mono-tech">\n<div class="flex flex-col sm:flex-row items-center justify-between gap-5">\n<div class="flex items-center gap-4">\n<div class="w-20 aspect-[3/4] border border-cyan-400/70 shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="space-y-1">\n<div class="text-[10px] text-cyan-400 tracking-widest">__SCORE_SRC__</div>\n<h3 class="font-display text-2xl font-bold uppercase text-white tracking-wide">__TITLE__</h3>\n<div class="text-xs text-cyan-200/70">__META__</div>\n<div class="pt-1.5 flex flex-wrap gap-2 text-[11px]">__TW32_LINKS__</div>\n</div>\n</div>\n<div class="flex items-center gap-4 bg-cyan-950/50 border border-cyan-500/30 px-4 py-3 shrink-0">\n<div class="text-center">\n<div class="text-[9px] text-cyan-400">INDEX</div>\n<div class="text-3xl font-extrabold text-cyan-300 leading-none">__SCORE10__</div>\n</div>\n<div class="w-px h-8 bg-cyan-500/30"></div>\n<div class="text-xs space-y-0.5">\n<div>IGDB: <strong class="text-white">__IGDB__</strong></div>\n<div>STM: <strong class="text-emerald-400">__STEAM_PCT__</strong></div>\n</div>\n</div>\n</div>\n</div>' }, "tw32-29": { "tw": true, "extra": "", "html": '<div class="bg-white text-black border-4 border-black p-5 flex flex-col sm:flex-row items-center justify-between gap-5">\n<div class="flex items-center gap-4">\n<div class="w-20 aspect-[3/4] border-2 border-black grayscale contrast-200 shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="space-y-1.5">\n<span class="inline-block bg-black text-white font-mono-tech text-[10px] font-bold px-2 py-0.5 uppercase -rotate-1">__SCORE_SRC__</span>\n<h3 class="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tighter leading-none">__TITLE__</h3>\n<div class="font-mono-tech text-xs font-bold">__META__</div>\n<div class="pt-1 flex flex-wrap gap-3 font-mono-tech text-xs font-extrabold uppercase underline">__TW32_LINKS__</div>\n</div>\n</div>\n<div class="bg-black text-white p-4 rotate-2 text-center shrink-0 font-mono-tech">\n<div class="text-[10px] uppercase tracking-widest text-neutral-400">RATING</div>\n<div class="text-4xl font-extrabold leading-none my-0.5">__SCORE10__</div>\n<div class="text-[10px]">IGDB <span>__IGDB__</span> / STM <span>__STEAM_PCT__</span></div>\n</div>\n</div>' }, "tw32-30": { "tw": true, "extra": "", "html": '<div class="bg-[#fafaf9] text-stone-800 font-mono-tech p-5 pb-7 shadow-xl relative receipt-edge">\n<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-dashed border-stone-400 pb-3 mb-3">\n<div class="flex items-center gap-3">\n<div class="w-12 h-14 grayscale contrast-125 border border-stone-400 shrink-0 overflow-hidden"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div>\n<div class="text-[10px] text-stone-500">__SCORE_SRC__</div>\n<h3 class="text-lg font-bold uppercase text-stone-900">__TITLE__</h3>\n<div class="text-[11px] text-stone-600">__META__</div>\n</div>\n</div>\n<div class="text-right">\n<div class="text-[10px] text-stone-500">TOTAL SCORE</div>\n<div class="text-3xl font-extrabold text-stone-900 leading-none">__SCORE10__</div>\n</div>\n</div>\n<div class="flex flex-wrap items-center justify-between gap-2 text-xs">\n<div>IGDB_INDEX: <strong>__IGDB__</strong> | STEAM_REV: <strong>__STEAM_PCT__</strong></div>\n<div class="flex flex-wrap gap-3 font-bold underline">__TW32_LINKS__</div>\n</div>\n</div>' }, "tw32-31": { "tw": true, "extra": "", "html": '<div class="relative pr-2 pb-2">\n<div class="absolute inset-0 translate-x-2 translate-y-2 rounded-2xl bg-[#ff4f00]" style="background-color: rgb(255, 79, 0);"></div>\n<div class="relative bg-[#141418] border border-white/15 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-5">\n<div class="flex items-center gap-4">\n<div class="w-20 aspect-[3/4] rounded-xl overflow-hidden border border-white/15 shrink-0"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div class="space-y-1">\n<span class="font-mono-tech text-[10px] uppercase text-indigo-300 font-bold">__SCORE_SRC__</span>\n<h3 class="font-display text-2xl font-bold text-white">__TITLE__</h3>\n<div class="text-xs text-stone-400">__META__</div>\n<div class="pt-1.5 flex flex-wrap gap-3 text-xs font-medium text-indigo-300">__TW32_LINKS__</div>\n</div>\n</div>\n<div class="flex items-center gap-3 shrink-0 font-mono-tech">\n<div class="px-4 py-2 rounded-xl bg-white text-black text-center">\n<div class="text-[9px] font-bold uppercase text-stone-500">SCORE</div>\n<div class="text-2xl font-extrabold">__SCORE10__</div>\n</div>\n<div class="text-xs text-stone-300 space-y-1">\n<div>IGDB: <strong class="text-white">__IGDB__</strong></div>\n<div>STM: <strong class="text-emerald-400">__STEAM_PCT__</strong></div>\n</div>\n</div>\n</div>\n</div>' }, "tw32-32": { "tw": true, "extra": "", "html": '<div class="bg-[#181a1b] border border-white/10 rounded-2xl p-6 space-y-5">\n<p class="font-editorial italic text-2xl sm:text-3xl text-stone-100 leading-snug">\xAB\u042D\u0442\u0430\u043B\u043E\u043D\u043D\u044B\u0439 \u043A\u0438\u0431\u0435\u0440\u043F\u0430\u043D\u043A \u0441 \u0432\u0435\u0440\u0442\u0438\u043A\u0430\u043B\u044C\u043D\u044B\u043C \u043B\u0435\u0432\u0435\u043B-\u0434\u0438\u0437\u0430\u0439\u043D\u043E\u043C \u0438 \u0433\u0443\u0441\u0442\u043E\u0439 \u0430\u0442\u043C\u043E\u0441\u0444\u0435\u0440\u043E\u0439 \u043C\u0435\u0433\u0430\u043F\u043E\u043B\u0438\u0441\u0430\xBB</p>\n<div class="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">\n<div class="flex items-center gap-3">\n<div class="w-11 h-14 rounded overflow-hidden border border-white/15 shrink-0"><img alt="__TITLE__" class="w-full h-full object-cover" src="__COVER__"/></div>\n<div>\n<h3 class="font-display text-base font-bold text-white">__TITLE__</h3>\n<div class="text-xs text-stone-400">__META__</div>\n</div>\n</div>\n<div class="flex items-center gap-4 font-mono-tech text-xs">\n<span class="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-extrabold text-sm">__SCORE10__</span>\n<span class="text-stone-400">IGDB <strong class="text-white">__IGDB__</strong></span>\n<div class="flex gap-2.5 text-stone-300 underline">__TW32_LINKS__</div>\n</div>\n</div>\n</div>' } };
  function buildConic(rx, total) {
    if (!total) return "conic-gradient(#3f3f46 0% 100%)";
    let acc = 0;
    const stops = [];
    for (const x of rx) {
      const pct = x.val / total * 100;
      if (pct <= 0) continue;
      stops.push(`${x.color} ${acc.toFixed(1)}% ${(acc + pct).toFixed(1)}%`);
      acc += pct;
    }
    return stops.length ? `conic-gradient(${stops.join(", ")})` : "conic-gradient(#3f3f46 0% 100%)";
  }
  function fillTemplate(raw, M) {
    const { rx, rxTotal, maxRx, top1, top2, top3 } = M;
    const genreSpans = M.genres.map((g) => `<span>${esc(g)}</span>`).join("");
    const norm = rx.map((x) => rxTotal > 0 ? x.val / rxTotal * 100 : 0);
    let s = raw.replaceAll("__COVER_URL__", esc(M.cover)).replaceAll("__COVER__", esc(M.cover)).replaceAll("__TITLE_UPPER__", esc(M.title.toUpperCase())).replaceAll("__TITLE__", esc(M.title)).replaceAll("__META_ITALIC__", esc(M.meta).replace(/ · /g, " <i>\xB7</i> ")).replaceAll("__META__", esc(M.meta)).replaceAll("__DEV_PUB__", esc(M.devPub)).replaceAll("__PUB__", esc(M.pub || M.dev)).replaceAll("__DEV__", esc(M.dev)).replaceAll("__YEAR__", esc(M.year)).replaceAll("__GENRE_SPANS__", genreSpans).replaceAll("__GENRES_DOT__", esc(M.genres.join(" \xB7 "))).replaceAll("__GENRES_SLASH__", esc(M.genres.join(" / "))).replaceAll("__GENRE_0__", esc(M.genres[0] || "")).replaceAll("__GENRE_1__", esc(M.genres[1] || "")).replaceAll("__GENRE_2__", esc(M.genres[2] || "")).replaceAll("__SCORE_SRC__", esc(M.scoreSource)).replaceAll("__SCORE10__", esc(M.score10)).replaceAll("__SCORE5__", esc(M.score5)).replaceAll("__SCORE_PCT_NUM__", String(M.scorePctNum)).replaceAll("__SCORE_PCT__", esc(M.scorePct)).replaceAll("__IGDB__", String(M.igdbScore)).replaceAll("__STEAM_NUM__", String(M.steamPct)).replaceAll("__STEAM_PCT__", M.steamPct + "%").replaceAll("__ASCII_BAR__", asciiBar(M.scorePctNum)).replaceAll("__ASCII_IGDB__", asciiBar(M.igdbScore)).replaceAll("__ASCII_STEAM__", asciiBar(M.steamPct)).replaceAll("__DOCK_DASH__", `${(M.scorePctNum * 2.136).toFixed(1)} 213.6`).replaceAll("__PANAX_URL__", esc(M.panaxUrl)).replaceAll("__BL_URL__", esc(M.backloggdUrl)).replaceAll("__STEAM_URL__", esc(M.steamUrl)).replaceAll("__IGDB_URL__", esc(M.igdbUrl)).replaceAll("__CONIC_GRAD__", buildConic(rx, rxTotal)).replaceAll("__TOP1_NAME__", esc(top1.name)).replaceAll("__TOP1_LABEL__", esc(top1.name.toUpperCase())).replaceAll("__TOP1_COLOR__", esc(top1.color)).replaceAll("__TOP1_ICON__", esc(top1.icon)).replaceAll("__TOP1_PCT__", top1.val.toFixed(1)).replaceAll("__TOP1_INT__", String(Math.round(top1.val))).replaceAll("__TOP2_NAME__", esc(top2.name)).replaceAll("__TOP2_INT__", String(Math.round(top2.val))).replaceAll("__POS_PCT__", M.posPct).replaceAll("__POS_INT__", String(M.posInt)).replaceAll("__RX_BADGE_TOP1__", esc(top1.badge || ""));
    for (let i = 0; i < 6; i++) {
      const x = rx[i] || { val: 0, icon: "", badge: "", color: "#888", name: "" };
      const rel = rxTotal > 0 ? Math.max(4, Math.round(x.val / maxRx * 100)) : 4;
      s = s.replaceAll(`__RX_PCT_${i}__`, x.val.toFixed(1) + "%").replaceAll(`__RX_PCT_RAW_${i}__`, x.val.toFixed(1)).replaceAll(`__RX_VAL_${i}__`, x.val.toFixed(1)).replaceAll(`__RX_REL_${i}__`, String(rel)).replaceAll(`__RX_ICON_${i}__`, esc(x.icon)).replaceAll(`__RX_BADGE_${i}__`, esc(x.badge || ""));
    }
    if (s.includes("__TOP1_BADGE_IMG_36__")) {
      s = s.replaceAll("__TOP1_BADGE_IMG_36__", top1.badge ? `<img src="${esc(top1.badge)}" alt="" style="width:36px;height:36px;object-fit:contain">` : `<span>${esc(top1.icon)}</span>`);
    }
    if (s.includes("__TW32_LINKS__")) {
      s = s.replaceAll("__TW32_LINKS__", `<a href="${esc(M.panaxUrl)}" target="_blank" rel="noopener" class="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] font-bold">PANAX \u2197</a><a href="${esc(M.igdbUrl)}" target="_blank" rel="noopener" class="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px]">IGDB</a><a href="${esc(M.steamUrl)}" target="_blank" rel="noopener" class="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px]">Steam</a>`);
    }
    if (s.includes("__PANAX4_MINI_BARS__")) {
      s = s.replaceAll("__PANAX4_MINI_BARS__", `<div class="mini">${rx.map((x) => `<i class="${x.val <= 0 ? "z" : ""}" style="--h:${rxTotal ? Math.round(x.val / maxRx * 100) : 0}%;--c:${x.color}"></i>`).join("")}</div>`);
    }
    if (s.includes("__PANAX4_MEDAL_ROW__")) {
      s = s.replaceAll("__PANAX4_MEDAL_ROW__", `<div class="medal" style="--c:${top1.color}"><div><b>${Math.round(top1.val)}</b><small>${esc(top1.name)}</small></div></div><div class="top3"><b>${top1.val.toFixed(1)}%</b> ${esc(top1.name.toLowerCase())} \xB7 <b>${top2.val.toFixed(1)}%</b> ${esc(top2.name.toLowerCase())}<br>${top3.val.toFixed(1)}% ${esc(top3.name.toLowerCase())}</div>`);
    }
    if (s.includes("__PANAX4_STRIP__")) {
      s = s.replaceAll("__PANAX4_STRIP__", `<div class="strip"><div class="track" style="background:linear-gradient(90deg,${rx.filter((x) => x.val > 0).map((x) => x.color).join(",") || top1.color})"></div><div class="keys">${rx.filter((x) => x.val > 0).slice(0, 4).map((x) => `<span><i style="background:${x.color}"></i>${esc(x.name)} ${Math.round(x.val)}%</span>`).join("")}</div></div>`);
    }
    if (s.includes("__PANAX4_SCALE__")) {
      const pos = Math.min(96, Math.max(4, M.scorePctNum));
      s = s.replaceAll("__PANAX4_SCALE__", `<div class="scale"><div class="mark" style="left:${pos}%"></div><div class="cap">${esc(top1.name)} \xB7 ${Math.round(top1.val)}% \xB7 \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 ${M.posPct}%</div></div>`);
    }
    if (s.includes("__SON_H1_BODY__")) {
      s = s.replaceAll("__SON_H1_BODY__", `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:8px"><span class="lvl" style="color:${top1.color}">${esc(top1.name)}</span><span class="mt">${top1.val.toFixed(1)}% \u0438\u0433\u0440\u043E\u043A\u043E\u0432</span></div><div class="sp">${rx.filter((x) => x.val > 0).map((x, i) => `<i style="--w:${norm[rx.indexOf(x)].toFixed(1)}%;--c:${x.color}"></i>`).join("")}</div><div class="lg">${rx.filter((x) => x.val > 0).map((x) => `<span>${esc(x.name)} ${x.val.toFixed(1)}</span>`).join("")}</div>`);
    }
    if (s.includes("__SON_WAFFLE__")) {
      const cells = [];
      rx.forEach((x) => {
        for (let i = 0; i < Math.round(x.val); i++) cells.push(`<i style="background:${x.color}"></i>`);
      });
      while (cells.length < 100) cells.push(`<i style="background:rgba(255,255,255,.08)"></i>`);
      s = s.replaceAll("__SON_WAFFLE__", cells.slice(0, 100).join(""));
    }
    if (s.includes("__SON_H3_SVG__")) {
      const pts = rx.map((x, i) => `${i * 80},${Math.round(112 - x.val / maxRx * 90)}`);
      s = s.replaceAll("__SON_H3_SVG__", `<svg viewBox="0 0 400 120" preserveAspectRatio="none"><polygon points="${pts.join(" ")} 400,120 0,120" fill="${top1.color}" fill-opacity=".22"/><polyline points="${pts.join(" ")}" fill="none" stroke="${top1.color}" stroke-width="3"/></svg>`);
    }
    if (s.includes("__SON_TOP_SUMMARY__")) {
      s = s.replaceAll("__SON_TOP_SUMMARY__", `${esc(top2.name)} ${Math.round(top2.val)} \xB7 ${esc(top3.name)} ${Math.round(top3.val)}`);
    }
    if (s.includes("__SON_ORBIT_SVG__")) {
      s = s.replaceAll("__SON_ORBIT_SVG__", `<svg viewBox="0 0 120 120" style="width:120px;height:120px"><circle cx="60" cy="60" r="46" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="12"/><circle cx="60" cy="60" r="46" fill="none" stroke="${top1.color}" stroke-width="12" stroke-dasharray="${(top1.val * 2.89).toFixed(1)} 289" transform="rotate(-90 60 60)"/></svg>`);
    }
    if (s.includes("__SON_SEGMENTS__")) {
      s = s.replaceAll("__SON_SEGMENTS__", rx.map((x) => `<div class="sg-r"><span>${esc(x.name)}</span><div class="sg-t"><i style="width:${Math.round(x.val / maxRx * 100)}%;background:${x.color}"></i></div><b>${x.val.toFixed(1)}%</b></div>`).join(""));
    }
    if (s.includes("__SON_PODIUM__")) {
      s = s.replaceAll("__SON_PODIUM__", `<div class="pd">${[top2, top1, top3].map((x, idx) => `<div class="p-${idx === 1 ? "1" : idx === 0 ? "2" : "3"}" style="border-top:3px solid ${x.color}"><b>${Math.round(x.val)}%</b><span>${esc(x.name)}</span></div>`).join("")}</div>`);
    }
    if (s.includes("__SON_TILES__")) {
      s = s.replaceAll("__SON_TILES__", `<div class="tl">${rx.map((x) => `<div style="border-left:3px solid ${x.color}"><b>${x.val.toFixed(1)}%</b><span>${esc(x.name)}</span></div>`).join("")}</div>`);
    }
    if (s.includes("__TWP_W1_BAR__")) {
      s = s.replaceAll("__TWP_W1_BAR__", rx.map((x, i) => norm[i] > 0.1 ? `<div class="h-full bar-anim first:rounded-l-full last:rounded-r-full" style="width:${norm[i].toFixed(2)}%;background:${x.color}"></div>` : "").join(""));
    }
    if (s.includes("__TWP_W1_LEGEND__")) {
      s = s.replaceAll("__TWP_W1_LEGEND__", rx.map((x) => `<div class="flex items-center justify-between text-xs"><span class="flex items-center gap-1.5 font-semibold" style="color:${x.color}"><i class="w-2 h-2 rounded-full inline-block" style="background:${x.color}"></i>${esc(x.name)}</span><span class="font-mono-tech text-zinc-300">${x.val.toFixed(1)}%</span></div>`).join(""));
    }
    if (s.includes("__TWP_W2_PILLARS__")) {
      s = s.replaceAll("__TWP_W2_PILLARS__", rx.map((x) => `<div class="flex flex-col items-center gap-1.5 flex-1"><span class="font-mono-tech text-[11px] font-bold" style="color:${x.color}">${x.val.toFixed(1)}%</span><div class="w-full h-24 rounded-md bg-white/5 flex items-end overflow-hidden p-0.5"><div class="w-full rounded-sm bar-anim" style="height:${rxTotal ? Math.max(4, Math.round(x.val / maxRx * 100)) : 4}%;background:${x.color}"></div></div><span class="text-[10px] text-zinc-400 font-semibold">${esc(x.name)}</span></div>`).join(""));
    }
    if (s.includes("__TWP_W3_LIST__")) {
      s = s.replaceAll("__TWP_W3_LIST__", rx.map((x) => `<div class="flex items-center justify-between text-xs"><span class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background:${x.color}"></span>${esc(x.name)}</span><b class="font-mono-tech">${x.val.toFixed(1)}%</b></div>`).join(""));
    }
    if (s.includes("__TWP_W4_LEADER__")) {
      s = s.replaceAll("__TWP_W4_LEADER__", `<span class="text-xs font-mono-tech uppercase text-stone-500">\u041B\u0418\u0414\u0415\u0420:</span> <b style="color:${top1.color}">${esc(top1.name)} \xB7 ${top1.val.toFixed(1)}%</b>`);
    }
    if (s.includes("__TWP_W4_KEYS__")) {
      s = s.replaceAll("__TWP_W4_KEYS__", rx.map((x) => `<div class="te-keycap bg-white border border-stone-300 rounded-lg p-2 text-center"><div class="text-[10px] font-bold" style="color:${x.color}">${esc(x.name)}</div><div class="font-mono-tech text-sm font-extrabold text-stone-900">${x.val.toFixed(1)}%</div></div>`).join(""));
    }
    if (s.includes("__TWP_W5_PODIUM__")) {
      s = s.replaceAll("__TWP_W5_PODIUM__", [top2, top1, top3].map((x, idx) => `<div class="flex-1 rounded-xl p-3 bg-white/5 border border-white/10 text-center" style="border-top:3px solid ${x.color}"><div class="text-xs text-zinc-400">#${idx === 1 ? 1 : idx === 0 ? 2 : 3}</div><div class="text-lg font-extrabold font-mono-tech" style="color:${x.color}">${x.val.toFixed(1)}%</div><div class="text-xs font-bold">${esc(x.name)}</div></div>`).join(""));
    }
    if (s.includes("__TWP_W5_REST__")) {
      s = s.replaceAll("__TWP_W5_REST__", rx.slice(3).map((x) => `<span class="text-[11px] text-zinc-400">${esc(x.name)}: <b>${x.val.toFixed(1)}%</b></span>`).join(" \xB7 "));
    }
    if (s.includes("__TWP_W6_CELLS__")) {
      s = s.replaceAll("__TWP_W6_CELLS__", rx.map((x) => `<div class="flex-1 px-2 py-2 bg-black/50 backdrop-blur rounded-lg border border-white/10 text-center"><div class="text-[10px]" style="color:${x.color}">${esc(x.name)}</div><div class="font-mono-tech text-xs font-bold text-white">${x.val.toFixed(1)}%</div></div>`).join(""));
    }
    if (s.includes("__TWP_W7_ROWS__")) {
      s = s.replaceAll("__TWP_W7_ROWS__", rx.map((x) => `<div class="flex items-center gap-2 font-mono-tech text-xs"><span class="w-16" style="color:${x.color}">${esc(x.name)}</span><span class="text-emerald-400">${asciiBar(rxTotal ? x.val / maxRx * 100 : 0, 14)}</span><span class="ml-auto">${x.val.toFixed(1)}%</span></div>`).join(""));
    }
    if (s.includes("__TWP_W8_TABLE__")) {
      s = s.replaceAll("__TWP_W8_TABLE__", rx.map((x) => `<div class="flex items-center justify-between py-1.5 border-b border-black/15 text-xs"><b>${esc(x.name)}</b><span class="font-mono-tech font-bold">${x.val.toFixed(1)}%</span></div>`).join(""));
    }
    if (s.includes("__TWP_W9_LABELS__")) {
      s = s.replaceAll("__TWP_W9_LABELS__", rx.map((x) => `<div class="text-center"><div class="text-[10px] font-bold" style="color:${x.color}">${esc(x.name)}</div><div class="font-mono-tech text-[11px] text-zinc-300">${x.val.toFixed(1)}%</div></div>`).join(""));
    }
    if (s.includes("__TWP_W10_BAR__")) {
      s = s.replaceAll("__TWP_W10_BAR__", rx.map((x, i) => norm[i] > 0.5 ? `<div style="width:${norm[i].toFixed(1)}%;background:${x.color}" class="h-full"></div>` : "").join(""));
    }
    return s;
  }
  var Q1_TIERS = [
    { name: "\u041B\u0415\u0413\u0415\u041D\u0414\u0410", color: "#ffd60a", ribbon: "#b8860b", icon: '<path d="M4 9.2 7.6 11.7 12 5.2l4.4 6.5L20 9.2l-1.5 8.6H5.5Z" fill="currentColor"/><rect x="5" y="18.6" width="14" height="2.6" rx="1.3" fill="currentColor" opacity=".8"/><circle cx="4" cy="8.6" r="1.5" fill="currentColor"/><circle cx="12" cy="4.6" r="1.5" fill="currentColor"/><circle cx="20" cy="8.6" r="1.5" fill="currentColor"/>' },
    { name: "\u041A\u0420\u0423\u0422\u041E", color: "#ff9500", ribbon: "#1fb6d4", icon: '<circle cx="12" cy="12" r="9.6" fill="currentColor"/><path d="M7.3 6.6l.85 1.75 1.75.85-1.75.85-.85 1.75-.85-1.75-1.75-.85 1.75-.85Z" fill="#fff"/><path d="M16.7 6.6l.85 1.75 1.75.85-1.75.85-.85 1.75-.85-1.75-1.75-.85 1.75-.85Z" fill="#fff"/><path d="M7.4 14.6q4.6 3.8 9.2 0" stroke="rgba(0,0,0,.55)" stroke-width="1.7" fill="none" stroke-linecap="round"/>' },
    { name: "\u0425\u041E\u0420\u041E\u0428\u041E", color: "#c05cff", ribbon: "#43b649", icon: '<path d="M6.8 10.2v10.6H4.2a1.6 1.6 0 0 1-1.6-1.6v-7.4a1.6 1.6 0 0 1 1.6-1.6Z" fill="currentColor" opacity=".75"/><path d="M6.8 10.2 11 3.1c.6-1.1 2.4-.7 2.4.6v4.9h5.5a2 2 0 0 1 2 2.3l-1.1 6.9a2 2 0 0 1-2 1.7H6.8Z" fill="currentColor"/>' },
    { name: "\u041D\u041E\u0420\u041C", color: "#3d9bff", ribbon: "#ff9800", icon: '<g fill="currentColor"><rect x="11" y="2.6" width="2.9" height="8.6" rx="1.45" transform="rotate(6 12.4 6.9)"/><rect x="14.4" y="3.3" width="2.9" height="8" rx="1.45" transform="rotate(16 15.8 7.3)"/><rect x="17.4" y="5.1" width="2.9" height="6.9" rx="1.45" transform="rotate(26 18.8 8.5)"/><path d="M5 12.6C5 10.6 6.6 9 8.6 9c1.4 0 2.7.8 3.3 2.1l3.5 1.5c1.6.7 1.3 3-.4 3.4l-4.5 1.2C7.6 18 5 15.8 5 12.6Z"/></g><circle cx="8.7" cy="13.3" r="2.2" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="1.5"/>' },
    { name: "\u041F\u041B\u041E\u0425\u041E", color: "#9aa5b1", ribbon: "#cf9b4e", icon: '<g transform="rotate(180 12 12)"><path d="M6.8 10.2v10.6H4.2a1.6 1.6 0 0 1-1.6-1.6v-7.4a1.6 1.6 0 0 1 1.6-1.6Z" fill="currentColor" opacity=".75"/><path d="M6.8 10.2 11 3.1c.6-1.1 2.4-.7 2.4.6v4.9h5.5a2 2 0 0 1 2 2.3l-1.1 6.9a2 2 0 0 1-2 1.7H6.8Z" fill="currentColor"/></g>' },
    { name: "\u0423\u0416\u0410\u0421", color: "#ff3b5c", ribbon: "#d32f2f", icon: '<circle cx="12" cy="12" r="9.6" fill="#8bc34a"/><path d="M6.6 8.2l3 3M9.6 8.2l-3 3M14.4 8.2l3 3M17.4 8.2l-3 3" stroke="rgba(0,0,0,.6)" stroke-width="1.6" stroke-linecap="round"/><path d="M7 16.2q1.6-1.8 3.2 0t3.2 0 3.2 0" stroke="rgba(0,0,0,.6)" stroke-width="1.6" fill="none" stroke-linecap="round"/>' }
  ];
  function buildQwen1Vars() {
    const I = {
      ext: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>',
      code: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 7-5 5 5 5M16 7l5 5-5 5"/></svg>',
      copy: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
      check: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12.5 5 5L20 6.5"/></svg>'
    };
    const pxLogo = (cls = "") => `<span class="px-logo ${cls}"><i>P</i><b>PANAX</b></span>`;
    const posPct = (g) => g.votes.slice(0, 3).reduce((a, b) => a + b, 0).toFixed(1);
    const tagSpans = (g, cls = "") => g.tags.map((t) => `<span class="${cls}">${esc(t)}</span>`).join("");
    const go = (g, cls, label = "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 Panax") => `<a class="${cls}" href="${esc(g.url)}" target="_blank" rel="noopener">${label === I.ext ? I.ext : `${label} ${I.ext}`}</a>`;
    const Araw = (g) => `<a class="w10-link" href="${esc(g.url)}#votes" target="_blank" rel="noopener">view votes</a><a class="w10-link" href="${esc(g.url)}#reviews" target="_blank" rel="noopener">reviews</a>`;
    const rating = (g, size = "", light = false) => {
      const items = Q1_TIERS.map((t, i) => {
        const v = g.votes[i] || 0;
        return `<div class="pxr-col" style="--tc:${t.color};--rb:${t.ribbon}">
        <div class="pxr-track"><i style="--h:${v}%"></i></div>
        <div class="pxr-badge"><svg class="pxr-ico" viewBox="0 0 24 24" style="color:${t.color}" aria-hidden="true">${t.icon}</svg><span class="pxr-ribbon">${t.name}</span></div>
        <div class="pxr-pct">${v.toFixed(1)}%</div>
      </div>`;
      }).join("");
      return `<div class="pxr in ${size} ${light ? "on-light" : ""}">${items}</div>`;
    };
    const VARIANTS = [
      {
        slug: "pulse",
        name: "Pulse",
        cat: ["dark"],
        catLabel: "\u0442\u0451\u043C\u043D\u044B\u0439 \xB7 \u0433\u043B\u0430\u0432\u043D\u044B\u0439 \u043C\u0430\u043A\u0435\u0442",
        note: "\u043F\u043E\u043B\u043D\u0430\u044F \u0448\u0438\u0440\u0438\u043D\u0430 \xB7 \u043A\u0440\u0443\u043F\u043D\u0430\u044F \u0448\u043A\u0430\u043B\u0430, KPI \u0438 \u043A\u043D\u043E\u043F\u043A\u0430 Panax",
        span: true,
        r: (g, u, n) => `<div class="w1">
  <div class="w1-head">${pxLogo()}<span class="w1-hsub">\u041E\u0426\u0415\u041D\u041A\u0410 \u0421\u041E\u041E\u0411\u0429\u0415\u0421\u0422\u0412\u0410</span><span class="w1-live"><i></i>${g.total} \u043E\u0446\u0435\u043D\u043E\u043A</span></div>
  <div class="w1-top">
    <div class="w1-cover"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"></div>
    <div class="w1-info">
      <h4>${g.title}</h4>
      <p class="w1-meta">${g.year} \xB7 ${g.dev} \xB7 ${g.pub}</p>
      <div class="w1-tags">${tagSpans(g)}</div>
      <p class="w1-desc">${g.desc}</p>
      <div class="w1-kpis">
        <div class="w1-kpi"><b>${posPct(g)}%</b><span>\u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445</span></div>
        <div class="w1-kpi"><b>${g.total}</b><span>\u043E\u0446\u0435\u043D\u043E\u043A</span></div>
        <div class="w1-kpi"><b>${g.hltb}</b><span>\u043D\u0430 \u043F\u0440\u043E\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u0435</span></div>
      </div>
    </div>
  </div>
  ${rating(g, "pxr-lg")}
  <div class="w1-foot">${go(g, "w1-go")}<span class="w1-note">\u0428\u043A\u0430\u043B\u0430 Panax: 6 \u0443\u0440\u043E\u0432\u043D\u0435\u0439 \xB7 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E \u0441\u0435\u0433\u043E\u0434\u043D\u044F</span></div>
</div>`
      },
      {
        slug: "prism",
        name: "Prism",
        cat: ["dark", "show"],
        catLabel: "\u0442\u0451\u043C\u043D\u044B\u0439 \xB7 \u0441\u0442\u0435\u043A\u043B\u043E \xB7 3D",
        note: "\u2248560\xD7auto \xB7 frosted-\u0441\u0442\u0435\u043A\u043B\u043E \u0438 \u043D\u0430\u043A\u043B\u043E\u043D \u0437\u0430 \u043A\u0443\u0440\u0441\u043E\u0440\u043E\u043C",
        r: (g, u, n) => `<div class="w2scene">
  <img class="w2bg" src="${u}" alt="" aria-hidden="true" loading="lazy">
  <div class="w2 rest" data-fx="tilt">
    <div class="w2-top">
      <div class="w2-cover"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"></div>
      <div class="w2-info">${pxLogo()}<h4>${g.title}</h4><p class="w2-meta">${g.year} \xB7 ${g.dev}</p><div class="w2-tags">${tagSpans(g)}</div><div class="w2-pos"><b>${posPct(g)}%</b><span>\u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445<br>${g.total} \u043E\u0446\u0435\u043D\u043E\u043A</span></div></div>
    </div>
    ${rating(g, "pxr-sm")}
    <div class="w2-cta">${go(g, "w2-go")}<span class="w2-votes">${g.platforms.join(" \xB7 ")}</span></div>
    <i class="w2-shine"></i>
  </div>
</div>`
      },
      {
        slug: "pass",
        name: "Game Pass",
        cat: ["light"],
        catLabel: "\u0441\u0432\u0435\u0442\u043B\u044B\u0439 \xB7 \u0431\u0438\u043B\u0435\u0442",
        note: "\u2248580\xD7auto \xB7 \u0431\u0438\u043B\u0435\u0442 \u0441 \u043F\u0435\u0440\u0444\u043E\u0440\u0430\u0446\u0438\u0435\u0439 \u0438 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434\u043E\u043C",
        r: (g, u, n) => `<div class="w3">
  <i class="w3-notch top"></i><i class="w3-notch bot"></i>
  <div class="w3-stub"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"><b>GAME PASS<br>PANAX</b><i class="w3-bar"></i></div>
  <div class="w3-main">
    <div class="w3-head">${pxLogo()}<span class="w3-no">\u2116 ${n} \xB7 ${g.year}</span></div>
    <h4>${g.title}</h4><p class="w3-meta">${g.dev} \xB7 ${g.tags.join(" \xB7 ")}</p>
    <div class="w3-pos"><b>${posPct(g)}%</b><span>\u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u043E\u0446\u0435\u043D\u043E\u043A<br>\u043D\u0430\u0440\u043E\u0434\u043D\u0430\u044F \u0448\u043A\u0430\u043B\u0430 Panax</span></div>
    ${rating(g, "pxr-sm", true)}
    <div class="w3-foot">${go(g, "w3-go")}<span class="w3-votes">${g.total} \u043E\u0446\u0435\u043D\u043E\u043A</span></div>
  </div>
</div>`
      },
      {
        slug: "paper",
        name: "Paper",
        cat: ["light"],
        catLabel: "\u0441\u0432\u0435\u0442\u043B\u044B\u0439 \xB7 \u0436\u0443\u0440\u043D\u0430\u043B",
        note: "\u2248560\xD7auto \xB7 \u0441\u0435\u0440\u0438\u0444\u044B, \u0431\u0443\u043A\u0432\u0438\u0446\u0430, \u0448\u043A\u0430\u043B\u0430 \u043D\u0430 \u0431\u0443\u043C\u0430\u0433\u0435",
        r: (g, u, n) => `<div class="w4">
  <div class="w4-head"><span>\u041E\u0431\u043E\u0437\u0440\u0435\u0432\u0430\u0442\u0435\u043B\u044C Panax</span><span>\u2116 ${n} \xB7 ${g.year}</span></div>
  <div class="w4-grid">
    <figure class="w4-fig"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"><figcaption>${g.dev} \xB7 \u043E\u0431\u043B\u043E\u0436\u043A\u0430</figcaption></figure>
    <div class="w4-main"><p class="w4-kicker">\u0420\u0435\u0446\u0435\u043D\u0437\u0438\u044F \xB7 ${g.tags[0]}</p><h4>${g.title}</h4><p class="w4-lede">${g.desc}</p></div>
    <div class="w4-score"><b>${posPct(g)}%</b><span>\u0437\u0430 \xB7 Panax</span><em>${g.total} \u0433\u043E\u043B\u043E\u0441\u043E\u0432</em></div>
  </div>
  ${rating(g, "pxr-sm", true)}
  <div class="w4-foot">${go(g, "w4-read", "\u0427\u0438\u0442\u0430\u0442\u044C \u043D\u0430 Panax \u2192")}<span>${g.release} \xB7 ${g.platforms.join(", ")}</span></div>
</div>`
      },
      {
        slug: "arcade",
        name: "Arcade",
        cat: ["dark", "retro"],
        catLabel: "\u0442\u0451\u043C\u043D\u044B\u0439 \xB7 \u0430\u0440\u043A\u0430\u0434\u0430",
        note: "\u2248540\xD7auto \xB7 CRT-\u044D\u043A\u0440\u0430\u043D, \u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0441\u0442\u043E\u043B\u0431\u0438\u043A\u043E\u0432, PRESS START",
        r: (g, u, n) => `<div class="w5">
  <div class="w5-marquee"><span>\u2605 PANAX COMMUNITY ARCADE \u2605</span></div>
  <div class="w5-crt">
    <div class="w5-row">
      <div class="w5-art"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"></div>
      <div class="w5-data"><p class="w5-px">GAME SELECT_</p><h4 class="w5-title">${g.title}</h4><p class="w5-sub">${g.year} \xB7 ${g.dev}</p><p class="w5-pos">POSITIVE <b>${posPct(g)}%</b><br>VOTES ${g.total}</p></div>
    </div>
    ${rating(g, "pxr-sm")}
    <i class="w5-scanlines"></i><i class="w5-vignette"></i>
  </div>
  <div class="w5-deck">${go(g, "w5-start", "<i>\u25B6</i> PRESS START")}<span class="w5-credit">CREDIT 01 \xB7 PANAX <span class="blink">\u25AE</span></span></div>
</div>`
      },
      {
        slug: "keyart",
        name: "Key Art",
        cat: ["dark", "show"],
        catLabel: "\u0442\u0451\u043C\u043D\u044B\u0439 \xB7 \u043F\u043E\u0441\u0442\u0435\u0440",
        note: "\u043F\u043E\u043B\u043D\u0430\u044F \u0448\u0438\u0440\u0438\u043D\u0430 \xB7 Ken Burns, \u043F\u0430\u0440\u0430\u043B\u043B\u0430\u043A\u0441, \u0441\u0442\u0435\u043A\u043B\u044F\u043D\u043D\u0430\u044F \u0448\u043A\u0430\u043B\u0430",
        span: true,
        flush: true,
        r: (g, u, n) => `<div class="w6" data-fx="pan">
  <div class="w6-artwrap"><img class="w6-art" src="${u}" alt="\u041A\u043B\u044E\u0447\u0435\u0432\u043E\u0439 \u0430\u0440\u0442 ${g.title}" loading="lazy"></div>
  <i class="w6-scrim"></i>
  <div class="w6-top">${pxLogo()}<span class="w6-year">${g.year}</span></div>
  <div class="w6-bottom">
    <div class="w6-left"><p class="w6-kicker">${g.tags.join(" / ")}</p><h4>${g.title}</h4><p class="w6-meta">${g.dev} \xB7 ${g.pub} \xB7 ${g.release}</p>${go(g, "w6-go")}</div>
    <div class="w6-panel"><div class="w6-panel-head"><b>${posPct(g)}%</b><span>${g.total} \u043E\u0446\u0435\u043D\u043E\u043A</span></div>${rating(g, "pxr-sm")}</div>
  </div>
</div>`
      },
      {
        slug: "inline",
        name: "Inline",
        cat: ["compact"],
        catLabel: "\u043A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439 \xB7 \u0441\u0442\u0440\u043E\u043A\u0430",
        note: "100% \u0448\u0438\u0440\u0438\u043D\u044B \xB7 \u043C\u0438\u043D\u0438-\u0448\u043A\u0430\u043B\u0430 \u0432\u043D\u0443\u0442\u0440\u0438 \u0430\u0431\u0437\u0430\u0446\u0430 \u043E\u0431\u0437\u043E\u0440\u0430",
        span: true,
        r: (g, u, n) => `<div class="w7wrap">
  
  <div class="w7">
    <img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy">
    <div class="w7-t"><b>${g.title}</b><span>${g.year} \xB7 ${g.tags[0]} \xB7 ${g.dev}</span></div>
    ${rating(g, "pxr-xs")}
    <span class="w7-pos">${posPct(g)}% \u0437\u0430</span>
    ${go(g, "w7-go", I.ext)}
  </div>
  
</div>`
      },
      {
        slug: "holo",
        name: "Holo Rare",
        cat: ["show"],
        catLabel: "\u044D\u0444\u0444\u0435\u043A\u0442\u043D\u044B\u0439 \xB7 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u043E\u043D\u043D\u0430\u044F",
        note: "306\xD7auto \xB7 \u0433\u043E\u043B\u043E-\u0444\u043E\u043B\u044C\u0433\u0430, \u0431\u043B\u0451\u0441\u0442\u043A\u0438, \u0448\u043A\u0430\u043B\u0430 \u043D\u0430 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0435",
        r: (g, u, n) => {
          const p = +posPct(g), rar = p >= 95 ? "LEGENDARY" : p >= 85 ? "EPIC" : "RARE";
          return `<div class="w8scene"><div class="w8 rest" data-fx="holo">
  <div class="w8-in">
    <div class="w8-head"><b>${g.title}</b><span class="w8-gem"><i>${posPct(g)}%</i></span></div>
    <div class="w8-art"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"><span class="w8-rarity">\u25C6 ${rar}</span></div>
    <div class="w8-type">${g.tags.join(" \xB7 ")} \u2014 ${g.year}</div>
    ${rating(g, "pxr-xs")}
    <p class="w8-flavor">${g.desc}</p>
    <div class="w8-foot"><span>\u2116 ${n}/150 \xB7 PANAX TCG</span>${go(g, "", "Panax")}</div>
  </div>
  <i class="w8-foil"></i><i class="w8-spark"></i>
</div></div>`;
        }
      },
      {
        slug: "brutal",
        name: "Brutal",
        cat: ["light"],
        catLabel: "\u0441\u0432\u0435\u0442\u043B\u044B\u0439 \xB7 \u0431\u0440\u0443\u0442\u0430\u043B",
        note: "\u2248620\xD7auto \xB7 \u0436\u0451\u0441\u0442\u043A\u0430\u044F \u0442\u0435\u043D\u044C, \u0441\u0442\u0438\u043A\u0435\u0440, \u0431\u0435\u0433\u0443\u0449\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430",
        r: (g, u, n) => `<div class="w9">
  <div class="w9-marquee"><div class="w9-track">${("PANAX COMMUNITY RATING \xB7 " + g.title.toUpperCase() + " \xB7 ").repeat(5)}</div></div>
  <div class="w9-body">
    <div class="w9-art"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"><i class="w9-dots"></i></div>
    <div class="w9-info">
      <span class="w9-tape">${g.year} \xB7 PANAX</span><h4>${g.title}</h4><p class="w9-meta">${g.dev} / ${g.pub}</p><div class="w9-tags">${tagSpans(g)}</div>
      ${rating(g, "pxr-sm", true)}
      <div class="w9-cta">${go(g, "w9-go", "\u041E\u0422\u041A\u0420\u042B\u0422\u042C \u041D\u0410 PANAX")}<span class="w9-votes">${g.total} VOTES</span></div>
    </div>
    <span class="w9-sticker"><b>${posPct(g)}%</b><span>\u0417\u0410</span></span>
  </div>
  <div class="w9-foot"><i class="w9-barcode"></i><span>PANAX APPROVED \xB7 NO BACKLOGGD</span></div>
</div>`
      },
      {
        slug: "terminal",
        name: "Terminal",
        cat: ["dark", "retro"],
        catLabel: "\u0442\u0451\u043C\u043D\u044B\u0439 \xB7 \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B",
        note: "\u043F\u043E\u043B\u043D\u0430\u044F \u0448\u0438\u0440\u0438\u043D\u0430 \xB7 HUD, \u0441\u043A\u0430\u043D\u043B\u0430\u0439\u043D, \u0448\u043A\u0430\u043B\u0430 \u043A\u0430\u043A \u0434\u0430\u043D\u043D\u044B\u0435",
        span: true,
        r: (g, u, n) => `<div class="w10">
  <i class="w10-c c1"></i><i class="w10-c c2"></i><i class="w10-c c3"></i><i class="w10-c c4"></i><div class="w10-scan"></div>
  <div class="w10-top"><span>PANAX://RATING.EXE/${g.id}</span><span class="w10-live">\u25CF LIVE<span class="w10-cur">\u25AE</span></span></div>
  <div class="w10-body">
    <div class="w10-left">
      <div class="w10-cover"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"></div>
      <div class="w10-info"><p class="w10-eyebrow">\u041A\u0410\u0420\u0422\u041E\u0427\u041A\u0410 \u0418\u0413\u0420\u042B</p><h4 class="w10-title">${g.title}</h4><p class="w10-meta">${g.year} \xB7 ${g.dev}</p><div class="w10-tags">${g.tags.map((t) => `<span>[${t}]</span>`).join("")}</div><p class="w10-pos">POSITIVE <b>${posPct(g)}%</b><br>VOTES ${g.total}</p></div>
    </div>
    <div class="w10-right">
      <div class="w10-rhead"><span>COMMUNITY_SCALE // 6 TIERS</span><span>100%</span></div>
      ${rating(g, "pxr-sm")}
      <div class="w10-links">${go(g, "w10-link primary", "open panax")}${Araw(g)}</div>
    </div>
  </div>
</div>`
      }
    ];
    return VARIANTS;
  }
  var _q1Cache = null;
  function renderQwen1(slug, M, tools) {
    if (!_q1Cache) _q1Cache = buildQwen1Vars();
    const v = _q1Cache.find((x) => "qwen-" + x.slug === slug);
    if (!v) return null;
    const g = {
      id: M.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "game",
      title: esc(M.title),
      year: esc(M.year),
      dev: esc(M.dev),
      pub: esc(M.pub),
      release: esc(M.year),
      tags: M.genres.map(esc),
      platforms: M.plat.map(esc),
      desc: esc(M.genres.join(" \xB7 ") + " \xB7 " + M.year),
      total: M.rxTotal > 0 ? Math.round(M.rxTotal * 10) : 100,
      hltb: "\u2014",
      url: M.panaxUrl,
      votes: M.rx.map((x) => x.val),
      a: "#7c5cff",
      b: "#22d3ee"
    };
    return `<div class="w w-game v-${esc(slug)} qwen1-scope in">${tools}${v.r(g, esc(M.cover), "01")}</div>`;
  }
  function buildQwen2Vars() {
    const I = {
      pad: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 6h10a5 5 0 0 1 5 5.2l-.7 4.6a3 3 0 0 1-5.2 1.6L14.5 16h-5l-1.6 1.4a3 3 0 0 1-5.2-1.6L2 11.2A5 5 0 0 1 7 6Z"/><path d="M7 10v4M5 12h4M15.5 10.5h.01M18 12.5h.01"/></svg>',
      chart: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
      flame: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4.4 0 7-2.8 7-6.5 0-3-2-5-3.5-6.5C14 7.5 13 5.5 13 2c-3 2-5 5-5 8-1-.8-1.7-1.8-2-3-1.5 1.7-2 3.7-2 5.5C4 19.2 7.6 22 12 22Z"/></svg>',
      globe: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.7 2.6 4 5.6 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.6-4-9s1.3-6.4 4-9Z"/></svg>',
      ext: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>',
      code: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 7-5 5 5 5M16 7l5 5-5 5"/></svg>',
      star: '<svg class="i" viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.7 5.6 6.2.9-4.5 4.3 1.1 6.2L12 17.1 6.5 20l1.1-6.2-4.5-4.3 6.2-.9Z"/></svg>'
    };
    const fmt1 = (n) => Number(n || 0).toFixed(1);
    const sc = (g) => g.score10;
    const igdbU = (g) => g.igdbUrl;
    const steamU = (g) => g.steamUrl;
    const rawgU = (g) => g.panaxUrl;
    const blU = (g) => g.backloggdUrl;
    const linkSet = (g, s) => [
      { n: s.name, u: s.url(g), i: I.pad },
      { n: "IGDB", u: g.igdbUrl, i: I.chart },
      { n: "Steam", u: g.steamUrl, i: I.flame }
    ];
    const A = (u, cls, inner, title) => `<a class="${cls}" href="${esc(safeUrl(u))}" target="_blank" rel="noopener"${title ? ` title="${esc(title)}"` : ""}>${inner}</a>`;
    const tagChips = (g) => g.tags.map((t) => `<span>${esc(t)}</span>`).join("");
    const stars = (n) => "\u2605".repeat(Math.max(1, Math.min(5, Math.round(n / 2))));
    const VARIANTS = [
      {
        slug: "neon-hud",
        name: "Neon HUD",
        cat: ["dark"],
        catLabel: "\u0442\u0451\u043C\u043D\u044B\u0439 \xB7 \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B",
        note: "\u2248560\xD7auto \xB7 \u0441\u043A\u0430\u043D\u043B\u0430\u0439\u043D, HUD-\u0448\u043A\u0430\u043B\u044B, \u0433\u043B\u0438\u0442\u0447 \u043E\u0431\u043B\u043E\u0436\u043A\u0438",
        r: (g, s, u, n) => `<div class="w1" style="--ga:${g.a};--gb:${g.b}">
  <i class="w1-c c1"></i><i class="w1-c c2"></i><i class="w1-c c3"></i><i class="w1-c c4"></i><div class="w1-scan"></div>
  <div class="w1-top"><span>GAME_CARD://${g.id}</span><span class="w1-live">\u25CF LIVE<span class="w1-cur">\u25AE</span></span></div>
  <div class="w1-body">
    <div class="w1-cover"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"><span class="w1-plt">${g.platforms.join(" \xB7 ")}</span></div>
    <div class="w1-info">
      <p class="w1-eyebrow">\u041A\u0410\u0420\u0422\u041E\u0427\u041A\u0410 \u0418\u0413\u0420\u042B \xB7 <b style="color:${s.color}">${s.name.toUpperCase()}</b></p>
      <h4 class="w1-title">${g.title}</h4>
      <p class="w1-meta">${g.year} \xB7 ${g.dev} \xB7 ${g.pub}</p>
      <div class="w1-tags">${g.tags.map((t) => `<span>[${t}]</span>`).join("")}</div>
      <div class="w1-m"><div class="w1-mr"><span>${s.name.toUpperCase()}</span><b>${fmt1(sc(g, s))} / 10</b></div><div class="w1-bar"><i style="--w:${sc(g, s) * 10}%;--mc:var(--ga)"></i></div></div>
      <div class="w1-m"><div class="w1-mr"><span>IGDB</span><b>${g.igdb} / 100</b></div><div class="w1-bar"><i style="--w:${g.igdb}%;--mc:var(--gb)"></i></div></div>
      <div class="w1-links">${linkSet(g, s).map((l) => A(l.u, "w1-link", l.n)).join("")}</div>
    </div>
  </div></div>`
      },
      {
        slug: "aurora-glass",
        name: "Aurora Glass",
        cat: ["dark", "show"],
        catLabel: "\u0442\u0451\u043C\u043D\u044B\u0439 \xB7 \u0441\u0442\u0435\u043A\u043B\u043E \xB7 3D",
        note: "\u2248560\xD7auto \xB7 frosted-\u0441\u0442\u0435\u043A\u043B\u043E, \u043D\u0430\u043A\u043B\u043E\u043D \u0437\u0430 \u043A\u0443\u0440\u0441\u043E\u0440\u043E\u043C",
        r: (g, s, u, n) => `<div class="w2scene" style="--ga:${g.a};--gb:${g.b}">
  <img class="w2bg" src="${u}" alt="" aria-hidden="true" loading="lazy">
  <div class="w2 rest" data-fx="tilt">
    <div class="w2-cover"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"></div>
    <div class="w2-info">
      <span class="w2-src"><i style="background:${s.color}"></i>${s.name}</span>
      <h4>${g.title}</h4>
      <p class="w2-meta">${g.year} \xB7 ${g.dev} \xB7 ${g.pub}</p>
      <div class="w2-tags">${g.tags.map((t) => `<span>${t}</span>`).join("")}</div>
      <div class="w2-scores">
        <div class="w2-sc"><b>${fmt1(sc(g, s))}</b><span>${s.mono}</span></div>
        <div class="w2-sc"><b>${g.igdb}</b><span>IGDB</span></div>
        <div class="w2-sc"><b>${g.steam}%</b><span>Steam</span></div>
      </div>
      <div class="w2-cta">${A(s.url(g), "w2-go", "\u041E\u0442\u043A\u0440\u044B\u0442\u044C " + I.ext)}
        <div class="w2-mini">${A(igdbU(g), "", I.chart, "IGDB")}${A(steamU(g), "", I.flame, "Steam")}${A(rawgU(g), "", I.globe, "RAWG")}</div>
      </div>
    </div><i class="w2-shine"></i>
  </div></div>`
      },
      {
        slug: "editorial",
        name: "Editorial",
        cat: ["light"],
        catLabel: "\u0441\u0432\u0435\u0442\u043B\u044B\u0439 \xB7 \u0436\u0443\u0440\u043D\u0430\u043B",
        note: "\u2248560\xD7auto \xB7 \u0441\u0435\u0440\u0438\u0444\u044B, \u0431\u0443\u043A\u0432\u0438\u0446\u0430, \u043E\u0446\u0435\u043D\u043E\u0447\u043D\u0430\u044F \u043A\u043E\u043B\u043E\u043D\u043A\u0430",
        r: (g, s, u, n) => `<div class="w3">
  <div class="w3-head"><span>\u0418\u0433\u0440\u043E\u0432\u043E\u0439 \u043E\u0431\u043E\u0437\u0440\u0435\u0432\u0430\u0442\u0435\u043B\u044C</span><span>\u2116 ${n} \xB7 ${g.year}</span></div>
  <div class="w3-grid">
    <figure class="w3-fig"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"><figcaption>${g.dev} \xB7 \u043E\u0431\u043B\u043E\u0436\u043A\u0430</figcaption></figure>
    <div class="w3-main">
      <p class="w3-kicker">\u0420\u0435\u0446\u0435\u043D\u0437\u0438\u044F \xB7 ${g.tags[0]}</p>
      <h4>${g.title}</h4>
      <p class="w3-lede">${g.desc}</p>
      <p class="w3-tags">${g.tags.join(" \xB7 ")}</p>
    </div>
    <div class="w3-score"><b>${fmt1(sc(g, s))}</b><span>/ 10 \xB7 ${s.name}</span><em>IGDB \u2014 ${g.igdb}</em></div>
  </div>
  <div class="w3-foot">${A(s.url(g), "w3-read", `\u0427\u0438\u0442\u0430\u0442\u044C \u043D\u0430 ${s.name} \u2192`)}<span>${g.release} \xB7 ${g.platforms.join(", ")}</span></div>
</div>`
      },
      {
        slug: "cartridge",
        name: "Cartridge",
        cat: ["retro"],
        catLabel: "\u0440\u0435\u0442\u0440\u043E \xB7 \u043A\u0430\u0440\u0442\u0440\u0438\u0434\u0436",
        note: "\u2248560\xD7auto \xB7 \u043F\u043B\u0430\u0441\u0442\u0438\u043A\u043E\u0432\u044B\u0439 \u043A\u043E\u0440\u043F\u0443\u0441, LED-\u043E\u0446\u0435\u043D\u043A\u0430, \u0442\u0443\u0433\u0438\u0435 \u043A\u043D\u043E\u043F\u043A\u0438",
        r: (g, s, u, n) => `<div class="w4" style="--ga:${g.a}">
  <div class="w4-ridges"></div>
  <div class="w4-grid">
    <div class="w4-label">
      <img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy">
      <div class="w4-ltitle"><b>${g.title}</b><span>${s.name.toUpperCase()} \xB7 ${g.year}</span></div>
      <span class="w4-sticker" style="--sc:${s.color}">${fmt1(sc(g, s))}</span>
    </div>
    <div class="w4-side">
      <p class="w4-model">PX-8 LINK SYSTEM \xB7 CART ${n}</p>
      <h4>${g.title}</h4>
      <dl class="w4-specs">
        <div><dt>\u0413\u043E\u0434</dt><dd>${g.year}</dd></div>
        <div><dt>\u0421\u0442\u0443\u0434\u0438\u044F</dt><dd>${g.dev}</dd></div>
        <div><dt>\u0416\u0430\u043D\u0440</dt><dd>${g.tags[0]}</dd></div>
        <div><dt>\u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u044B</dt><dd>${g.platforms.join(" / ")}</dd></div>
      </dl>
      <div class="w4-leds">
        <div class="w4-led"><span>${s.mono}</span><b>${fmt1(sc(g, s))}</b></div>
        <div class="w4-led"><span>IGDB</span><b>${g.igdb}</b></div>
      </div>
      <div class="w4-btns">${A(s.url(g), "w4-start", "\u25B6 \u041E\u0422\u041A\u0420\u042B\u0422\u042C")}${A(igdbU(g), "w4-btn", "IGDB")}${A(steamU(g), "w4-btn", "STEAM")}</div>
    </div>
  </div>
  <div class="w4-bottom"><i></i><span>INSERT INTO REVIEW \xB7 REGION FREE</span><i></i></div>
</div>`
      },
      {
        slug: "whisper",
        name: "Whisper",
        cat: ["light", "compact"],
        catLabel: "\u0441\u0432\u0435\u0442\u043B\u044B\u0439 \xB7 \u043C\u0438\u043D\u0438\u043C\u0430\u043B",
        note: "\u2248470\xD7100 \xB7 \u0442\u0438\u0445\u0430\u044F \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0434\u043B\u044F \u0441\u043F\u043E\u043A\u043E\u0439\u043D\u044B\u0445 \u043E\u0431\u0437\u043E\u0440\u043E\u0432",
        r: (g, s, u, n) => `<div class="w5" style="--ga:${g.a}">
  <img class="w5-cover" src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy">
  <div class="w5-mid">
    <div class="w5-t"><b>${g.title}</b><span class="w5-year">${g.year}</span></div>
    <p>${g.dev} \xB7 ${g.tags.join(" \xB7 ")}</p>
    <div class="w5-src"><i style="background:${s.color}">${s.mono}</i>${s.name} \xB7 <b>\u2605 ${fmt1(sc(g, s))}</b></div>
  </div>
  ${A(s.url(g), "w5-go", I.ext, `\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 ${s.name}`)}
</div>`
      },
      {
        slug: "arcade-crt",
        name: "Arcade CRT",
        cat: ["dark", "retro"],
        catLabel: "\u0442\u0451\u043C\u043D\u044B\u0439 \xB7 \u0430\u0440\u043A\u0430\u0434\u0430",
        note: "\u2248520\xD7auto \xB7 CRT-\u044D\u043A\u0440\u0430\u043D, \u043F\u0438\u043A\u0441\u0435\u043B\u0438, PRESS START",
        r: (g, s, u, n) => `<div class="w6" style="--ga:${g.a}">
  <div class="w6-marquee"><span>\u2605 ${s.name.toUpperCase()} ARCADE \u2605</span></div>
  <div class="w6-crt">
    <div class="w6-row">
      <div class="w6-art"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"></div>
      <div class="w6-data">
        <p class="w6-px">GAME SELECT_</p>
        <h4 class="w6-title">${g.title}</h4>
        <p class="w6-sub">${g.year} \xB7 ${g.dev}</p>
        <div class="w6-scores">
          <p>HI-SCORE <b style="color:var(--ga)">${fmt1(sc(g, s))}</b> <span>${s.mono}</span></p>
          <p>2UP&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b style="color:#35e0ff">${g.igdb}</b> <span>IGDB</span></p>
        </div>
        <p class="w6-tags">${g.tags.join(" \xB7 ")}</p>
      </div>
    </div>
    <i class="w6-scanlines"></i><i class="w6-vignette"></i>
  </div>
  <div class="w6-deck">
    ${A(s.url(g), "w6-start", "<i>\u25B6</i> PRESS START")}
    <div class="w6-coins">${A(igdbU(g), "", "IGDB")}${A(steamU(g), "", "STEAM")}${A(s.id === "backloggd" ? rawgU(g) : blU(g), "", s.id === "backloggd" ? "RAWG" : "BL")}</div>
  </div>
  <p class="w6-credit">CREDIT 01 \xB7 ${s.name.toUpperCase()} <span class="blink">\u25AE</span></p>
</div>`
      },
      {
        slug: "key-art",
        name: "Key Art",
        cat: ["dark", "show"],
        catLabel: "\u0442\u0451\u043C\u043D\u044B\u0439 \xB7 \u043F\u043E\u0441\u0442\u0435\u0440",
        note: "\u043F\u043E\u043B\u043D\u0430\u044F \u0448\u0438\u0440\u0438\u043D\u0430 \xB7 Ken Burns, \u043F\u0430\u0440\u0430\u043B\u043B\u0430\u043A\u0441, \u043A\u043E\u043B\u044C\u0446\u043E \u043E\u0446\u0435\u043D\u043A\u0438",
        span: true,
        flush: true,
        r: (g, s, u, n) => `<div class="w7" style="--ga:${g.a};--sc:${s.color}" data-fx="pan">
  <div class="w7-artwrap"><img class="w7-art" src="${u}" alt="\u041A\u043B\u044E\u0447\u0435\u0432\u043E\u0439 \u0430\u0440\u0442 ${g.title}" loading="lazy"></div>
  <i class="w7-scrim"></i>
  <div class="w7-top"><span class="w7-src">${I.pad} ${s.name}</span><span class="w7-year">${g.year}</span></div>
  <div class="w7-bottom">
    <div class="w7-left">
      <p class="w7-kicker">${g.tags.join(" / ")}</p>
      <h4>${g.title}</h4>
      <p class="w7-meta">${g.dev} \xB7 ${g.pub} \xB7 ${g.release}</p>
      <div class="w7-cta">${A(s.url(g), "w7-go", `\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 ${s.name} ${I.ext}`)}
        <div class="w7-mini">${A(igdbU(g), "", I.chart + " IGDB")}${A(steamU(g), "", I.flame + " Steam")}${A(rawgU(g), "", I.globe + " RAWG")}</div>
      </div>
    </div>
    <div class="w7-ring">
      <svg viewBox="0 0 96 96" aria-hidden="true"><circle class="bgc" cx="48" cy="48" r="40"/><circle class="fgc" cx="48" cy="48" r="40" style="--p:${sc(g, s) / 10}"/></svg>
      <div class="w7-rv"><b>${fmt1(sc(g, s))}</b><span>${s.mono} / 10</span></div>
    </div>
  </div>
</div>`
      },
      {
        slug: "slash",
        name: "Slash",
        cat: ["show"],
        catLabel: "\u0430\u043A\u0446\u0435\u043D\u0442\u043D\u044B\u0439 \xB7 \u0434\u0438\u0430\u0433\u043E\u043D\u0430\u043B\u044C",
        note: "\u2248560\xD7300 \xB7 \u0446\u0432\u0435\u0442 \u0438\u0433\u0440\u044B \u0437\u0430\u043B\u0438\u0432\u0430\u0435\u0442 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443, \u0441\u0440\u0435\u0437 \u0435\u0434\u0435\u0442 \u0437\u0430 \u0445\u043E\u0432\u0435\u0440\u043E\u043C",
        r: (g, s, u, n) => `<div class="w8" style="--ga:${g.a};--gb:${g.b}">
  <div class="w8-art"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"></div>
  <i class="w8-stripe"></i><span class="w8-year">${g.year}</span>
  <div class="w8-body">
    <span class="w8-src">${s.name}</span>
    <h4>${g.title}</h4>
    <p class="w8-dev">${g.dev} \xB7 ${g.pub}</p>
    <div class="w8-tags">${g.tags.map((t) => `<span>${t}</span>`).join("")}</div>
    <div class="w8-score"><b>${fmt1(sc(g, s))}</b><span>/ 10<br>${s.name}</span></div>
    ${A(s.url(g), "w8-go", "\u041E\u0442\u043A\u0440\u044B\u0442\u044C " + I.ext)}
  </div>
</div>`
      },
      {
        slug: "inline",
        name: "Inline",
        cat: ["compact"],
        catLabel: "\u043A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439 \xB7 \u0441\u0442\u0440\u043E\u043A\u0430",
        note: "100% \u0448\u0438\u0440\u0438\u043D\u044B \xB7 \u0436\u0438\u0432\u0451\u0442 \u043F\u0440\u044F\u043C\u043E \u0432\u043D\u0443\u0442\u0440\u0438 \u0430\u0431\u0437\u0430\u0446\u0430 \u043E\u0431\u0437\u043E\u0440\u0430",
        r: (g, s, u, n) => `<div class="w9wrap">
  
  <div class="w9" style="--ga:${g.a}">
    <img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy">
    <div class="w9-t"><b>${g.title}</b><span>${g.year} \xB7 ${g.tags[0]} \xB7 ${g.dev}</span></div>
    <span class="w9-score">\u2605 ${fmt1(sc(g, s))}</span>
    <span class="w9-src" style="color:${s.color}">${s.mono}</span>
    ${A(s.url(g), "w9-go", I.ext, `\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 ${s.name}`)}
  </div>
  
</div>`
      },
      {
        slug: "telemetry",
        name: "Telemetry",
        cat: ["dark"],
        catLabel: "\u0442\u0451\u043C\u043D\u044B\u0439 \xB7 \u0434\u0430\u043D\u043D\u044B\u0435",
        note: "\u043F\u043E\u043B\u043D\u0430\u044F \u0448\u0438\u0440\u0438\u043D\u0430 \xB7 \u0441\u043F\u0430\u0440\u043A\u043B\u0430\u0439\u043D, \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u043E\u0446\u0435\u043D\u043E\u043A, live-\u0441\u0442\u0430\u0442\u0443\u0441",
        span: true,
        r: (g, s, u, n) => {
          const mn = Math.min(...g.spark) - 3, mx = Math.max(...g.spark) + 3;
          const pts = g.spark.map((v, k) => `${(k * (220 / (g.spark.length - 1))).toFixed(1)},${(54 - (v - mn) / (mx - mn) * 44).toFixed(1)}`).join(" ");
          const last = pts.split(" ").pop().split(",");
          const dc = ["#b6ff2e", "#35e0ff", "#ffb02e", "#ff4d9d", "#8f6bff"];
          return `<div class="w10" style="--ga:${g.a}">
  <div class="w10-head"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"><div><h4>${g.title}</h4><p>${g.dev} \xB7 ${g.year} \xB7 ${g.tags[0]}</p></div><span class="w10-live"><i></i>\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E 2 \u0447 \u043D\u0430\u0437\u0430\u0434</span></div>
  <div class="w10-tiles">
    <div class="w10-tile" style="--tc:var(--ga)"><span>${s.name}</span><b>${fmt1(sc(g, s))}</b><em>\u0438\u0437 10 \xB7 ${g.reviews} \u043E\u0446\u0435\u043D\u043E\u043A</em></div>
    <div class="w10-tile" style="--tc:#35e0ff"><span>IGDB</span><b>${g.igdb}</b><em>\u0438\u0437 100 \xB7 \u043A\u0440\u0438\u0442\u0438\u043A\u0438</em></div>
    <div class="w10-tile" style="--tc:#ffb02e"><span>\u0418\u0433\u0440\u0430\u044E\u0442 \u0441\u0435\u0439\u0447\u0430\u0441</span><b>${g.players}</b><em>\u043F\u0438\u043A: ${g.peak}</em></div>
    <div class="w10-tile" style="--tc:#ff4d9d"><span>\u041E\u0442\u0437\u044B\u0432\u044B Steam</span><b>${g.steam}%</b><em>${g.reviews} \u043E\u0431\u0437\u043E\u0440\u043E\u0432 \xB7 ${g.hltb}</em></div>
  </div>
  <div class="w10-charts">
    <div class="w10-spark"><span>\u041E\u0446\u0435\u043D\u043A\u0430 \u043F\u043E \u043D\u0435\u0434\u0435\u043B\u044F\u043C \xB7 ${s.name}</span>
      <svg viewBox="0 0 220 60" preserveAspectRatio="none"><polyline points="${pts}" pathLength="1"/><circle class="dot" cx="${last[0]}" cy="${last[1]}" r="3.4"/></svg>
    </div>
    <div class="w10-dist"><span>\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u043E\u0446\u0435\u043D\u043E\u043A</span>
      ${g.dist.map((d, k) => `<div class="w10-drow"><em>${5 - k}\u2605</em><div class="w10-dbar"><i style="--w:${d}%;--dc:${dc[k]}"></i></div><b>${d}%</b></div>`).join("")}
    </div>
  </div>
  <div class="w10-foot">
    <div class="w10-plats">${g.platforms.map((p) => `<span>${p}</span>`).join("")}</div>
    <div class="w10-links">${linkSet(g, s).map((l) => A(l.u, "w10-link", l.i + " " + l.n)).join("")}${A(s.url(g), "w10-go", "\u041F\u043E\u043B\u043D\u0430\u044F \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 " + I.ext)}</div>
  </div>
</div>`;
        }
      },
      {
        slug: "holo-rare",
        name: "Holo Rare",
        cat: ["show"],
        catLabel: "\u044D\u0444\u0444\u0435\u043A\u0442\u043D\u044B\u0439 \xB7 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u043E\u043D\u043D\u0430\u044F",
        note: "302\xD7423 \xB7 \u0433\u043E\u043B\u043E-\u0444\u043E\u043B\u044C\u0433\u0430 \u0438 \u0431\u043B\u0451\u0441\u0442\u043A\u0438 \u0441\u043B\u0435\u0434\u0443\u044E\u0442 \u0437\u0430 \u043A\u0443\u0440\u0441\u043E\u0440\u043E\u043C",
        r: (g, s, u, n) => {
          const v = sc(g, s), rar = v >= 9 ? "LEGENDARY" : v >= 8.5 ? "EPIC" : "RARE";
          return `<div class="w11scene"><div class="w11 rest" data-fx="holo" style="--ga:${g.a}">
  <div class="w11-in">
    <div class="w11-head"><b>${g.title}</b><span class="w11-gem"><i>${fmt1(v)}</i></span></div>
    <div class="w11-art"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"><span class="w11-rarity">\u25C6 ${rar}</span></div>
    <div class="w11-type">${g.tags.join(" \xB7 ")} \u2014 ${g.year}</div>
    <p class="w11-flavor">${g.desc}</p>
    <div class="w11-stats"><span>DEV<b>${g.dev}</b></span><span>IGDB<b>${g.igdb}</b></span><span>TIME<b>${g.hltb}</b></span></div>
    <div class="w11-foot"><span>\u2116 ${n}/150 \xB7 ${s.name.toUpperCase()}</span>${A(s.url(g), "", I.ext, `\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 ${s.name}`)}</div>
  </div>
  <i class="w11-foil"></i><i class="w11-spark"></i>
</div></div>`;
        }
      },
      {
        slug: "loud",
        name: "Loud",
        cat: ["light"],
        catLabel: "\u0441\u0432\u0435\u0442\u043B\u044B\u0439 \xB7 \u0431\u0440\u0443\u0442\u0430\u043B",
        note: "\u2248700\xD7auto \xB7 \u0436\u0451\u0441\u0442\u043A\u0430\u044F \u0442\u0435\u043D\u044C, \u0441\u0442\u0438\u043A\u0435\u0440 \u043E\u0446\u0435\u043D\u043A\u0438, \u0431\u0435\u0433\u0443\u0449\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430",
        r: (g, s, u, n) => `<div class="w12" style="--ga:${g.a}">
  <div class="w12-marquee"><div class="w12-track">${("GAME WIDGET \xB7 " + s.name.toUpperCase() + " \xB7 ").repeat(6)}</div></div>
  <div class="w12-body">
    <div class="w12-art"><img src="${u}" alt="\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${g.title}" loading="lazy"><i class="w12-dots"></i></div>
    <div class="w12-info">
      <span class="w12-tape">${g.year} \xB7 ${s.name}</span>
      <h4>${g.title}</h4>
      <p class="w12-meta">${g.dev} / ${g.pub}</p>
      <div class="w12-tags">${g.tags.map((t) => `<span>${t}</span>`).join("")}</div>
      <div class="w12-cta">${A(s.url(g), "w12-go", "\u041E\u0422\u041A\u0420\u042B\u0422\u042C " + I.ext)}${A(igdbU(g), "w12-sq", "IGDB")}${A(steamU(g), "w12-sq", "STM")}${A(rawgU(g), "w12-sq", "RAWG")}</div>
    </div>
    <span class="w12-sticker"><b>${fmt1(sc(g, s))}</b><span>${s.mono} / 10</span></span>
  </div>
  <div class="w12-foot"><i class="w12-barcode"></i><span>${s.name.toUpperCase()} APPROVED \xB7 NO REFUNDS</span></div>
</div>`
      }
    ];
    return VARIANTS;
  }
  var _q2Cache = null;
  function renderQwen2(slug, M, tools) {
    if (!_q2Cache) _q2Cache = buildQwen2Vars();
    const v = _q2Cache.find((x) => "qwen2-" + x.slug === slug);
    if (!v) return null;
    const g = {
      id: M.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "game",
      title: esc(M.title),
      year: esc(M.year),
      dev: esc(M.dev),
      pub: esc(M.pub),
      release: esc(M.year),
      peak: "\u2014",
      tags: M.genres.map(esc),
      platforms: M.plat.map(esc),
      desc: esc(M.genres.join(" \xB7 ")),
      igdb: M.igdbScore,
      steam: M.steamPct,
      back: M.score10Num,
      panaax: M.score10Num,
      score10: M.score10Num,
      igdbUrl: M.igdbUrl,
      steamUrl: M.steamUrl,
      backloggdUrl: M.backloggdUrl,
      panaxUrl: M.panaxUrl,
      a: "#5b8cff",
      b: "#8f6bff",
      spark: [62, 68, 74, 71, 80, 84, M.scorePctNum],
      dist: M.rxTotal > 0 ? M.rx.slice(0, 5).map((x) => Math.round(x.val)) : [42, 32, 16, 6, 4],
      reviews: M.rxTotal > 0 ? Math.round(M.rxTotal * 12) : 640,
      hltb: "30 \u0447",
      players: "Single"
    };
    const s = {
      id: "panax",
      name: M.scoreSource,
      mono: M.scoreSource === "Backloggd" ? "BL" : "PX",
      color: "#8f6bff",
      url: (x) => x.panaxUrl
    };
    return `<div class="w w-game v-${esc(slug)} qwen2-scope in">${tools}${v.r(g, s, esc(M.cover), "01")}</div>`;
  }
  function renderExtraGameCard(variantId, d, tools, rxList) {
    const M = extractCardMetrics(d, rxList);
    if (variantId.startsWith("qwen-")) return renderQwen1(variantId, M, tools || "");
    if (variantId.startsWith("qwen2-")) return renderQwen2(variantId, M, tools || "");
    const tpl = TEMPLATES[variantId];
    if (!tpl) return null;
    const cls = ["w", "w-game", "v-" + variantId];
    if (tpl.tw) cls.push("tw-card");
    if (tpl.extra) cls.push(tpl.extra);
    return `<div class="${cls.join(" ")}">${tools || ""}${fillTemplate(tpl.html, M)}</div>`;
  }

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\shared\gq-schema.js
  var LIMITS = {
    str: 300,
    longStr: 600,
    url: 2048,
    html: 2e4,
    blocks: 300,
    aspects: 30,
    pc: 40,
    arr: 20,
    mapKeys: 16
  };
  var TEXTY = ["text", "h2", "h3", "quote", "spoiler"];
  var WIDGETS = ["game", "steam", "youtube", "workshop", "image"];
  var BLOCK_TYPES = [...TEXTY, "divider", ...WIDGETS];
  var VERDICTS = ["yes", "neutral", "no", "none"];
  var IMAGE_HOSTS = [
    "cdn.akamai.steamstatic.com",
    "shared.akamai.steamstatic.com",
    "shared.fastly.steamstatic.com",
    "cdn.cloudflare.steamstatic.com",
    "shared.cloudflare.steamstatic.com",
    "steamcdn-a.akamaihd.net",
    "cdn.fastly.steamstatic.com",
    "store.akamai.steamstatic.com",
    "i.ytimg.com",
    "img.youtube.com",
    "images.igdb.com",
    "media.rawg.io",
    "d21t60rno19oyf.cloudfront.net",
    "panaxgames.com",
    "www.panaxgames.com",
    "backloggd.com",
    "www.backloggd.com"
  ];
  var DEFAULT_INTEG = {
    panax: { name: "PANAX", icon: "\u{1F3AE}", color: "#7c5cff" },
    backloggd: { name: "Backloggd", icon: "\u{1F3AE}", color: "#4f8cff" },
    igdb: { name: "IGDB", icon: "\u{1F579}\uFE0F", color: "#9147ff" },
    steam: { name: "Steam Store", icon: "\u2668\uFE0F", color: "#66c0f4" },
    workshop: { name: "Steam Workshop", icon: "\u{1F6E0}\uFE0F", color: "#66c0f4" },
    youtube: { name: "YouTube", icon: "\u25B6\uFE0F", color: "#ff4d6d" },
    rawg: { name: "RAWG", icon: "\u{1F7E1}", color: "#f6c445" },
    metacritic: { name: "Metacritic", icon: "\u{1F4CA}", color: "#ffcc33" },
    hltb: { name: "HowLongToBeat", icon: "\u23F1\uFE0F", color: "#e05353" }
  };
  var isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  function str(v, max = LIMITS.str) {
    if (v === null || v === void 0) return "";
    if (typeof v === "number" && Number.isFinite(v)) v = String(v);
    if (typeof v !== "string") return "";
    let s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    s = s.replace(/\uDB40[\uDD00-\uDDEF]/g, "").replace(/[\uFE00-\uFE0F]{2,}/g, "");
    return s.length > max ? s.slice(0, max) : s;
  }
  function int(v, min, max, def = 0) {
    const n = typeof v === "string" ? parseInt(v, 10) : v;
    if (typeof n !== "number" || !Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, Math.round(n)));
  }
  var encodeUnsafe2 = (href) => href.replace(/['"()\\\s<>`]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
  function safeUrl2(v) {
    const s = str(v, LIMITS.url).trim();
    if (!s) return "";
    try {
      const u = new URL(s);
      if (u.protocol !== "https:" && u.protocol !== "http:") return "";
      if (u.username || u.password) return "";
      return encodeUnsafe2(u.href);
    } catch {
      return "";
    }
  }
  function safeImageUrl(v) {
    const href = safeUrl2(v);
    if (!href) return "";
    try {
      const u = new URL(href);
      if (u.protocol !== "https:") return "";
      const host2 = u.hostname.toLowerCase();
      if (!IMAGE_HOSTS.includes(host2)) return "";
      return encodeUnsafe2(u.href);
    } catch {
      return "";
    }
  }
  function safeColor(v) {
    const s = str(v, 40).trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
    if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/.test(s)) return s;
    return "";
  }
  function strArr(v, max = LIMITS.arr, len = 60) {
    if (!Array.isArray(v)) return [];
    return v.slice(0, max).map((x) => str(x, len)).filter(Boolean);
  }
  function keyMap(v, valueFn) {
    const out = {};
    if (!isObj(v)) return out;
    let n = 0;
    for (const [k, val] of Object.entries(v)) {
      if (n >= LIMITS.mapKeys) break;
      if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(k)) continue;
      const nv = valueFn(val);
      if (nv === "" || nv === null || nv === void 0) continue;
      out[k] = nv;
      n++;
    }
    return out;
  }
  var ORIGIN_OK = (o, url) => o === "upload" || o === "local" || o === "url" ? o : String(url || "").startsWith("data:") ? "local" : "url";
  function normalizeImageItem(it) {
    if (!isObj(it)) return null;
    const url = safeUserImageUrl(it.url);
    if (!url) return null;
    const caption = str(it.caption, CAPTION_MAX).replace(/\s+/g, " ").trim();
    const alt = str(it.alt || caption, CAPTION_MAX).replace(/\s+/g, " ").trim();
    return {
      url,
      width: int(it.width, 0, 2e4, 0),
      height: int(it.height, 0, 2e4, 0),
      caption,
      alt,
      origin: ORIGIN_OK(it.origin, url)
    };
  }
  function countGalleryFrames(doc) {
    let n = 0;
    const blocks = doc && Array.isArray(doc.blocks) ? doc.blocks : [];
    for (const b of blocks) {
      if (!b || b.type !== "image") continue;
      const d = b.data || {};
      if (Array.isArray(d.items) && d.items.length) n += d.items.length;
      else if (d.url) n += 1;
    }
    return n;
  }
  function normalizeImageData(d) {
    if (!isObj(d)) return { url: "", width: 0, height: 0, alt: "", origin: "url", caption: "", items: [] };
    const rawItems = Array.isArray(d.items) && d.items.length ? d.items : d.url ? [d] : [];
    const items = [];
    const seen2 = /* @__PURE__ */ new Set();
    for (const it of rawItems) {
      if (items.length >= MAX_GALLERY_ITEMS) break;
      const n = normalizeImageItem(it);
      if (!n || seen2.has(n.url)) continue;
      seen2.add(n.url);
      items.push(n);
    }
    const caption = str(d.caption, CAPTION_MAX).replace(/\s+/g, " ").trim();
    if (!items.length) return { url: "", width: 0, height: 0, alt: "", origin: "url", caption, items: [] };
    const first = items[0];
    return {
      url: first.url,
      width: first.width,
      height: first.height,
      alt: first.alt || caption,
      origin: first.origin,
      caption,
      items
    };
  }
  function widgetData(type, d) {
    d = isObj(d) ? d : {};
    if (type === "game") {
      const validVariants = ["classic", "duet", "editorial", "staircase", "type", "brutal", ...EXTRA_VARIANT_IDS];
      let panaxReactions = null;
      if (isObj(d.panaxReactions)) {
        panaxReactions = {};
        for (const k of ["legendary", "awesome", "good", "decent", "dislike", "awful"]) {
          const v = Number(d.panaxReactions[k]);
          panaxReactions[k] = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v * 10) / 10)) : 0;
        }
      }
      return {
        gameId: str(d.gameId, 80),
        variant: validVariants.includes(d.variant) ? d.variant : "classic",
        title: str(d.title, 200),
        year: str(d.year, 12),
        dev: str(d.dev, 120),
        pub: str(d.pub, 120),
        genres: strArr(d.genres, 8, 40),
        plat: strArr(d.plat, 8, 30),
        cover: safeImageUrl(d.cover),
        links: keyMap(d.links, safeUrl2),
        ratings: keyMap(d.ratings, (x) => str(x, 16)),
        panaxReactions,
        source: str(d.source, 40)
      };
    }
    if (type === "steam") {
      return {
        title: str(d.title, 200),
        app: str(d.app, 16).replace(/\D/g, ""),
        price: str(d.price, 40),
        old: str(d.old, 40),
        disc: str(d.disc, 12),
        date: str(d.date, 40),
        tags: strArr(d.tags, 8, 30),
        cover: safeImageUrl(d.cover),
        url: safeUrl2(d.url)
      };
    }
    if (type === "youtube") {
      return {
        title: str(d.title, 200),
        channel: str(d.channel, 80),
        dur: str(d.dur, 12),
        url: safeUrl2(d.url),
        cover: safeImageUrl(d.cover)
      };
    }
    if (type === "workshop") {
      return {
        title: str(d.title, 200),
        author: str(d.author, 80),
        subs: str(d.subs, 20),
        game: str(d.game, 120),
        url: safeUrl2(d.url),
        cover: safeImageUrl(d.cover)
      };
    }
    if (type === "image") {
      return normalizeImageData(d);
    }
    return {};
  }
  function normalizeReview(input, opts = {}) {
    if (!isObj(input)) return null;
    const clean2 = typeof opts.sanitizeHtml === "function" ? opts.sanitizeHtml : (h2) => h2;
    const r = {
      v: 1,
      title: str(input.title, LIMITS.str),
      game: str(input.game, LIMITS.str),
      author: str(input.author, 80),
      score: int(input.score, 0, 10),
      recommend: VERDICTS.includes(input.recommend) ? input.recommend : "none",
      aspects: [],
      pros: [],
      cons: [],
      blocks: [],
      integ: {},
      fp: null,
      updatedAt: int(input.updatedAt, 0, 864e13, 0)
    };
    if (Array.isArray(input.aspects)) {
      for (const a of input.aspects.slice(0, LIMITS.aspects)) {
        if (!isObj(a)) continue;
        const name = str(a.name, 80).trim();
        if (!name) continue;
        r.aspects.push({ name, score: int(a.score, 0, 10), unrated: a.unrated === "na" ? "na" : "unsure" });
      }
    }
    for (const k of ["pros", "cons"]) {
      if (!Array.isArray(input[k])) continue;
      for (const p of input[k].slice(0, LIMITS.pc)) {
        const text = str(isObj(p) ? p.text : p, LIMITS.longStr).replace(/\s+/g, " ").trim();
        if (text) r[k].push({ text });
      }
    }
    if (Array.isArray(input.blocks)) {
      for (const b of input.blocks.slice(0, LIMITS.blocks)) {
        if (!isObj(b) || !BLOCK_TYPES.includes(b.type)) continue;
        const nb = { type: b.type };
        if (TEXTY.includes(b.type)) {
          nb.html = clean2(str(b.html, LIMITS.html));
          if (b.type === "spoiler") nb.hidden = b.hidden !== false;
        } else if (b.type === "divider") {
          nb.data = { style: int(isObj(b.data) ? b.data.style : 1, 1, 3, 1) };
        } else if (b.type === "image") {
          const data = widgetData(b.type, b.data);
          if (!data || !data.items || !data.items.length || !data.url) continue;
          nb.data = data;
        } else {
          nb.data = widgetData(b.type, b.data);
        }
        r.blocks.push(nb);
      }
    }
    if (isObj(input.integ)) {
      r.integ = keyMap(input.integ, (v) => {
        if (!isObj(v)) return null;
        const name = str(v.name, 40).trim();
        if (!name) return null;
        return { name, icon: str(v.icon, 8), color: safeColor(v.color) || "#7c5cff" };
      });
    }
    if (isObj(input.fp) && typeof input.fp.h === "string" && /^[0-9a-f]{8}$/.test(input.fp.h)) {
      r.fp = { len: int(input.fp.len, 0, 1e7), h: input.fp.h };
    }
    return r;
  }
  function integMeta(review, key) {
    return review && review.integ && review.integ[key] || DEFAULT_INTEG[key] || { name: key, icon: "\u{1F517}", color: "#7c5cff" };
  }

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\shared\gq-theme.js
  var THEMES = {
    "panax-dark": { id: "panax-dark", name: "PANAX Mono (\u0447\u0451\u0440\u043D\u043E-\u0441\u0435\u0440\u044B\u0439)", short: "PANAX", c1: "#18181b", c2: "#e4e4e7" },
    "steam-slate": { id: "steam-slate", name: "Steam Slate (\u0433\u0440\u0430\u0444\u0438\u0442 \u0438 \u0441\u0438\u043D\u0438\u0439)", short: "Steam", c1: "#171d25", c2: "#66c0f4" },
    "emerald-hud": { id: "emerald-hud", name: "Emerald HUD (\u0438\u0437\u0443\u043C\u0440\u0443\u0434\u043D\u044B\u0439)", short: "Emerald", c1: "#121916", c2: "#3ddc97" },
    "amber-noir": { id: "amber-noir", name: "Amber Noir (\u044F\u043D\u0442\u0430\u0440\u043D\u044B\u0439)", short: "Amber", c1: "#181411", c2: "#f59e0b" },
    gamequill: { id: "gamequill", name: "GameQuill (\u0444\u0438\u043E\u043B\u0435\u0442\u043E\u0432\u044B\u0439)", short: "GameQuill", c1: "#11151f", c2: "#7c5cff" }
  };
  var DEFAULT_THEME = "panax-dark";
  function normalizeTheme(id) {
    const k = String(id || "").trim();
    return THEMES[k] ? k : DEFAULT_THEME;
  }

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\shared\gq-html.js
  var INLINE_OK = /* @__PURE__ */ new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "CODE", "MARK", "A", "BR", "SPAN", "FONT", "SUB", "SUP"]);
  var BLOCK_OK = /* @__PURE__ */ new Set(["P", "DIV", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "BLOCKQUOTE"]);
  var DROP_WITH_CONTENT = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "TEMPLATE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "NOSCRIPT", "TEXTAREA", "SELECT", "TITLE", "HEAD"]);
  var FONT_SIZES = { "1": "0.8em", "2": "0.85em", "3": "", "4": "1.1em", "5": "1.2em", "6": "1.4em", "7": "1.6em" };
  var OK_FONT_SIZES = /* @__PURE__ */ new Set(["0.8em", "0.85em", "1.1em", "1.2em", "1.4em", "1.6em"]);
  function parseHtml(html, win) {
    const P = win && win.DOMParser || (typeof DOMParser !== "undefined" ? DOMParser : null);
    if (!P) throw new Error("DOMParser unavailable");
    const d = new P().parseFromString("<!doctype html><body>" + String(html || ""), "text/html");
    return d.body;
  }
  function safeInlineStyle(styleText) {
    const out = {};
    String(styleText || "").split(";").forEach((decl) => {
      const i = decl.indexOf(":");
      if (i < 0) return;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const val = decl.slice(i + 1).trim();
      if (prop === "color") {
        const c = safeColor(val);
        if (c) out.color = c;
      } else if (prop === "background-color" || prop === "background") {
        const c = safeColor(val);
        if (c) out["background-color"] = c;
      } else if (prop === "font-size" && OK_FONT_SIZES.has(val)) {
        out["font-size"] = val;
      } else if (prop === "font-weight" && /^(bold|[5-9]00)$/.test(val)) {
        out["font-weight"] = "bold";
      }
    });
    return out;
  }
  function styleString(obj) {
    return Object.entries(obj).map(([k, v]) => `${k}:${v}`).join(";");
  }
  function rebuild(src, dst, doc, depth = 0) {
    if (depth > 24) return;
    for (const n of Array.from(src.childNodes)) {
      if (n.nodeType === 3) {
        dst.appendChild(doc.createTextNode(n.nodeValue));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toUpperCase();
      if (DROP_WITH_CONTENT.has(tag)) continue;
      if (!INLINE_OK.has(tag) && !BLOCK_OK.has(tag)) {
        rebuild(n, dst, doc, depth + 1);
        continue;
      }
      let el;
      if (tag === "FONT") {
        el = doc.createElement("span");
        const st = {};
        const c = safeColor(n.getAttribute("color"));
        if (c) st.color = c;
        const fs = FONT_SIZES[String(n.getAttribute("size") || "").trim()];
        if (fs) st["font-size"] = fs;
        Object.assign(st, safeInlineStyle(n.getAttribute("style")));
        if (Object.keys(st).length) el.setAttribute("style", styleString(st));
      } else if (tag === "H1" || tag === "H2" || tag === "H3" || tag === "H4") {
        el = doc.createElement("div");
        const b = doc.createElement("b");
        el.appendChild(b);
        rebuild(n, b, doc, depth + 1);
        dst.appendChild(el);
        continue;
      } else {
        el = doc.createElement(tag.toLowerCase());
        if (tag === "A") {
          const href = safeUrl2(n.getAttribute("href"));
          if (href) {
            el.setAttribute("href", href);
            el.setAttribute("target", "_blank");
            el.setAttribute("rel", "noopener noreferrer nofollow ugc");
          }
          const cls = String(n.getAttribute("class") || "");
          if (/\bgame-chip\b/.test(cls)) el.setAttribute("class", "game-chip");
          else if (/\blnk\b/.test(cls)) el.setAttribute("class", "lnk");
        } else if (tag === "SPAN") {
          const st = safeInlineStyle(n.getAttribute("style"));
          if (Object.keys(st).length) el.setAttribute("style", styleString(st));
        }
      }
      rebuild(n, el, doc, depth + 1);
      dst.appendChild(el);
    }
  }
  function sanitizeHtml(html, win) {
    const body = parseHtml(html, win);
    const doc = body.ownerDocument;
    const holder = doc.createElement("div");
    rebuild(body, holder, doc);
    return holder.innerHTML;
  }
  function sanitizeToFragment(html, targetDoc, win) {
    const body = parseHtml(html, win);
    const frag = targetDoc.createDocumentFragment();
    rebuild(body, frag, targetDoc);
    return frag;
  }

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\shared\gq-cover.js
  var PALETTES = [
    ["#ff2fb3", "#12062b", "#22d3ee"],
    ["#c8a24a", "#14100a", "#ff7a3d"],
    ["#6ea8ff", "#060a24", "#b388ff"],
    ["#7ee787", "#14202b", "#ffd166"],
    ["#ff8a3d", "#171a22", "#66d9ff"],
    ["#ff8fb1", "#1b0f24", "#7cf3d4"],
    ["#7fd4ff", "#07131f", "#a7ff9c"],
    ["#ffd23f", "#1a1207", "#ff4d6d"]
  ];
  function wrapTitle(t, max = 13) {
    const w = t.split(" ");
    const L = [];
    let c = "";
    w.forEach((x) => {
      if ((c + " " + x).trim().length > max && c) {
        L.push(c.trim());
        c = x;
      } else c = (c + " " + x).trim();
    });
    if (c) L.push(c);
    return L.slice(0, 3);
  }
  function paletteFor(seed) {
    let s = 0;
    for (const ch of String(seed)) s = s * 31 + ch.charCodeAt(0) >>> 0;
    return PALETTES[s % PALETTES.length];
  }
  var xmlEsc = (s) => String(s).replace(/[<>&"']/g, "");
  function coverSvg(seed, title, pal) {
    seed = String(seed || title || "gq");
    title = String(title || "GAME").slice(0, 60);
    pal = pal || paletteFor(seed);
    let s = 0;
    for (const ch of seed) s = s * 131 + ch.charCodeAt(0) >>> 0;
    const rnd = () => {
      s = s * 1664525 + 1013904223 >>> 0;
      return s / 4294967296;
    };
    const [a, b, acc] = pal;
    let dots = "";
    for (let i = 0; i < 46; i++) dots += `<circle cx="${(rnd() * 320).toFixed(0)}" cy="${(rnd() * 290).toFixed(0)}" r="${(rnd() * 1.5 + 0.4).toFixed(1)}" fill="#fff" opacity="${(rnd() * 0.55 + 0.15).toFixed(2)}"/>`;
    const cx = (50 + rnd() * 220).toFixed(0), cy = (80 + rnd() * 90).toFixed(0), r = (34 + rnd() * 40).toFixed(0);
    const p1 = `0,480 0,${(300 + rnd() * 50).toFixed(0)} ${(80 + rnd() * 60).toFixed(0)},${(200 + rnd() * 50).toFixed(0)} ${(170 + rnd() * 50).toFixed(0)},${(300 + rnd() * 40).toFixed(0)} 320,${(230 + rnd() * 50).toFixed(0)} 320,480`;
    const p2 = `0,480 0,${(360 + rnd() * 40).toFixed(0)} ${(120 + rnd() * 60).toFixed(0)},${(300 + rnd() * 40).toFixed(0)} ${(230 + rnd() * 50).toFixed(0)},${(380 + rnd() * 30).toFixed(0)} 320,${(320 + rnd() * 40).toFixed(0)} 320,480`;
    const lines = wrapTitle(title.toUpperCase());
    let txt = "";
    lines.forEach((l, i) => {
      txt += `<text x="24" y="${400 + i * 27}" font-family="Arial Black,Arial,sans-serif" font-size="${lines.length > 2 ? 21 : 25}" font-weight="900" fill="#fff" letter-spacing="1">${xmlEsc(l)}</text>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 480" width="320" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="s" cx="50%" cy="50%"><stop offset="0" stop-color="${acc}" stop-opacity=".95"/><stop offset="1" stop-color="${acc}" stop-opacity="0"/></radialGradient><linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".82"/></linearGradient></defs><rect width="320" height="480" fill="url(#g)"/>${dots}<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#s)"/><circle cx="${cx}" cy="${cy}" r="${(r / 2.6).toFixed(0)}" fill="#fff" opacity=".22"/><polygon points="${p1}" fill="#000" opacity=".38"/><polygon points="${p2}" fill="#000" opacity=".55"/><rect y="330" width="320" height="150" fill="url(#d)"/><rect x="24" y="352" width="42" height="4" rx="2" fill="${acc}"/>${txt}<text x="24" y="${400 + lines.length * 27 + 4}" font-family="Arial,sans-serif" font-size="11" fill="#fff" opacity=".55" letter-spacing="3">GAMEQUILL \xB7 COVER</text><rect x="0.5" y="0.5" width="319" height="479" fill="none" stroke="#fff" stroke-opacity=".12"/></svg>`;
  }
  function coverArt(seed, title, pal) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(coverSvg(seed, title, pal));
  }

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\shared\gq-fallback.js
  var SCORES = [
    null,
    { i: "\u{1F4A9}", t: "\u041F\u0440\u043E\u0432\u0430\u043B", d: "\u041D\u0435 \u0438\u0433\u0440\u0430\u0439\u0442\u0435 \u043D\u0438 \u043F\u0440\u0438 \u043A\u0430\u043A\u0438\u0445 \u0443\u0441\u043B\u043E\u0432\u0438\u044F\u0445" },
    { i: "\u{1F922}", t: "\u0423\u0436\u0430\u0441\u043D\u043E", d: "\u0421\u043B\u043E\u043C\u0430\u043D\u043E, \u0441\u043A\u0443\u0447\u043D\u043E, \u0431\u0435\u0437\u043D\u0430\u0434\u0435\u0436\u043D\u043E" },
    { i: "\u{1F616}", t: "\u041F\u043B\u043E\u0445\u043E", d: "\u041C\u0438\u043D\u0443\u0441\u043E\u0432 \u0441\u0438\u043B\u044C\u043D\u043E \u0431\u043E\u043B\u044C\u0448\u0435, \u0447\u0435\u043C \u043F\u043B\u044E\u0441\u043E\u0432" },
    { i: "\u{1F615}", t: "\u0421\u043B\u0430\u0431\u043E", d: "\u041D\u0438\u0436\u0435 \u0441\u0440\u0435\u0434\u043D\u0435\u0433\u043E \u2014 \u043C\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u0431\u043B\u0435\u043C" },
    { i: "\u{1F610}", t: "\u0421\u0440\u0435\u0434\u043D\u0435", d: "\u041F\u0440\u043E\u0445\u043E\u0434\u043D\u044F\u043A \u043D\u0430 \u043E\u0434\u0438\u043D \u0432\u0435\u0447\u0435\u0440" },
    { i: "\u{1F642}", t: "\u041D\u0435\u043F\u043B\u043E\u0445\u043E", d: "\u0415\u0441\u0442\u044C \u0437\u0430 \u0447\u0442\u043E \u043F\u043E\u0445\u0432\u0430\u043B\u0438\u0442\u044C \u0438 \u043F\u043E\u0440\u0443\u0433\u0430\u0442\u044C" },
    { i: "\u{1F60A}", t: "\u0425\u043E\u0440\u043E\u0448\u043E", d: "\u041A\u0440\u0435\u043F\u043A\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430, \u0441\u0442\u043E\u0438\u0442 \u0432\u043D\u0438\u043C\u0430\u043D\u0438\u044F" },
    { i: "\u{1F60D}", t: "\u041E\u0442\u043B\u0438\u0447\u043D\u043E", d: "\u041E\u0434\u0438\u043D \u0438\u0437 \u043B\u0443\u0447\u0448\u0438\u0445 \u0440\u0435\u043B\u0438\u0437\u043E\u0432 \u0436\u0430\u043D\u0440\u0430" },
    { i: "\u{1F929}", t: "\u0412\u0435\u043B\u0438\u043A\u043E\u043B\u0435\u043F\u043D\u043E", d: "\u041F\u043E\u0447\u0442\u0438 \u0438\u0434\u0435\u0430\u043B, \u043C\u0435\u043B\u043A\u0438\u0435 \u043E\u0433\u0440\u0435\u0445\u0438" },
    { i: "\u{1F451}", t: "\u0428\u0435\u0434\u0435\u0432\u0440", d: "\u042D\u0442\u0430\u043B\u043E\u043D, \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u0435\u043D \u043A \u043F\u0440\u043E\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u044E" }
  ];
  var VERDICT = {
    yes: { e: "\u{1F44D}", t: "\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u044E", c: "#3ddc97" },
    neutral: { e: "\u{1F914}", t: "\u041D\u0435\u0439\u0442\u0440\u0430\u043B\u044C\u043D\u043E", c: "#ffc84a" },
    no: { e: "\u{1F44E}", t: "\u041D\u0435 \u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u044E", c: "#ff5f6d" },
    none: { e: "\u2754", t: "\u0412\u0435\u0440\u0434\u0438\u043A\u0442 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D", c: "" }
  };
  var UNRATED = { unsure: "\u0430\u0432\u0442\u043E\u0440 \u043D\u0435 \u0443\u0432\u0435\u0440\u0435\u043D \u0432 \u043E\u0446\u0435\u043D\u043A\u0435", na: "\u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u043C\u043E \u043A \u044D\u0442\u043E\u0439 \u0438\u0433\u0440\u0435" };
  var FOOTER_TEXT = "\u2726 \u041E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u043E \u0432 GameQuill";

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\gamequill-content\render.js
  function h(doc, tag, attrs, ...kids) {
    const el = doc.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === void 0 || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else el.setAttribute(k, String(v));
      }
    }
    for (const k of kids.flat()) {
      if (k === null || k === void 0 || k === false || k === "") continue;
      el.append(typeof k === "string" ? doc.createTextNode(k) : k);
    }
    return el;
  }
  function link(doc, href, cls, ...kids) {
    const u = safeUrl2(href);
    if (!u) return h(doc, "span", { class: cls }, ...kids);
    return h(doc, "a", { class: cls, href: u, target: "_blank", rel: "noopener noreferrer nofollow ugc" }, ...kids);
  }
  function img(doc, src, seed, title, cls) {
    const safe = safeImageUrl(src);
    return h(doc, "img", {
      class: cls,
      src: safe || coverArt(seed || title || "gq", title || "Game", paletteFor(seed || title || "gq")),
      alt: "",
      loading: "lazy",
      referrerpolicy: "no-referrer",
      decoding: "async"
    });
  }
  function richText(doc, html, cls) {
    const d = h(doc, "div", { class: cls });
    d.append(sanitizeToFragment(html || "", doc));
    return d;
  }
  function scoreBlock(doc, r) {
    const sc = SCORES[r.score];
    const stars = h(doc, "div", { class: "stars", "aria-label": r.score ? `\u041E\u0446\u0435\u043D\u043A\u0430 ${r.score} \u0438\u0437 10` : "\u0411\u0435\u0437 \u043E\u0446\u0435\u043D\u043A\u0438" });
    for (let i = 1; i <= 10; i++) stars.append(h(doc, "span", { class: "star" + (i <= r.score ? " lit" : "") }, "\u2605"));
    const left = h(
      doc,
      "div",
      { class: "sc-left" },
      stars,
      h(doc, "div", { class: "sc-num" }, h(doc, "b", { text: r.score ? String(r.score) : "\u2014" }), h(doc, "i", { text: "\u0438\u0437 10" })),
      sc ? h(doc, "div", { class: "sc-cap" }, h(doc, "span", { class: "ico", text: sc.i }), h(doc, "span", null, h(doc, "b", { text: sc.t }), " \xB7 " + r.score + "/10", h(doc, "span", { class: "d", text: sc.d }))) : null
    );
    const v = VERDICT[r.recommend];
    const verdict = r.recommend !== "none" && v ? h(doc, "div", { class: "verdict v-" + r.recommend }, h(doc, "span", { class: "e", text: v.e }), v.t) : null;
    return h(doc, "div", { class: "scorecard" }, left, verdict);
  }
  function aspectsBlock(doc, r) {
    if (!r.aspects.length || !r.aspects.some((a) => a.score > 0 || a.unrated === "na")) return null;
    const box = h(doc, "div", { class: "aspects" }, h(doc, "div", { class: "sec-h", text: "\u{1F4CA} \u041E\u0446\u0435\u043D\u043A\u0438 \u0430\u0441\u043F\u0435\u043A\u0442\u043E\u0432" }));
    for (const a of r.aspects) {
      const row = h(doc, "div", { class: "asp" + (a.score ? "" : " off") }, h(doc, "div", { class: "asp-n", text: a.name }));
      if (a.score) {
        const dots = h(doc, "div", { class: "dots" });
        for (let i = 1; i <= 10; i++) dots.append(h(doc, "span", { class: "dot" + (i <= a.score ? " lit" : "") }));
        row.append(dots, h(doc, "div", { class: "asp-v", text: a.score + "/10" }));
      } else {
        row.append(h(doc, "div", { class: "asp-note", text: UNRATED[a.unrated] || UNRATED.unsure }));
      }
      box.append(row);
    }
    return box;
  }
  function gameWidget(doc, r, d) {
    const keys = Object.keys(d.links || {});
    const badges = Object.entries(d.ratings || {}).map(([k, v2]) => {
      const m = integMeta(r, k);
      return h(doc, "span", { class: "badge" }, `${m.icon} ${v2} \xB7 ${m.name}`);
    });
    const links = keys.map((k) => {
      const m = integMeta(r, k);
      const a = link(doc, d.links[k], "srcbtn", `${m.icon} ${m.name}`);
      const c = safeColor(m.color);
      if (c) a.style.setProperty("--c", c);
      return a;
    });
    const valid = ["classic", "duet", "editorial", "staircase", "type", "brutal", ...EXTRA_VARIANT_IDS];
    const v = valid.includes(d.variant) ? d.variant : "classic";
    const panaxUrl = safeUrl2(d.links && (d.links.panax || d.links.backloggd || d.links.igdb) || "") || "#";
    const badgeSrc = (rel) => {
      try {
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) return chrome.runtime.getURL(rel);
      } catch {
      }
      return "";
    };
    const rxDefs = [
      { k: "legendary", name: "\u041B\u0435\u0433\u0435\u043D\u0434\u0430", color: "#f3cb16", icon: "\u{1F3C6}", badge: "ratings/legendary-on.png" },
      { k: "awesome", name: "\u041A\u0440\u0443\u0442\u043E", color: "#f2a000", icon: "\u{1F918}", badge: "ratings/awesome-on.png" },
      { k: "good", name: "\u0425\u043E\u0440\u043E\u0448\u043E", color: "#bd55e9", icon: "\u{1F604}", badge: "ratings/good-on.png" },
      { k: "decent", name: "\u041D\u043E\u0440\u043C", color: "#3c9df3", icon: "\u270B", badge: "ratings/decent-on.png" },
      { k: "dislike", name: "\u041F\u043B\u043E\u0445\u043E", color: "#8ea6af", icon: "\u{1F61E}", badge: "ratings/dislike-on.png" },
      { k: "awful", name: "\u0423\u0436\u0430\u0441", color: "#e34d68", icon: "\u{1F922}", badge: "ratings/awful-on.png" }
    ];
    const rxRaw = d.panaxReactions || {};
    const rx = rxDefs.map((x) => ({
      k: x.k,
      name: x.name,
      color: x.color,
      icon: x.icon,
      badge: badgeSrc(x.badge),
      val: Number.isFinite(Number(rxRaw[x.k])) ? Number(rxRaw[x.k]) : 0
    }));
    const rxTotal = rx.reduce((s, x) => s + x.val, 0);
    const sorted = [...rx].sort((a, b) => b.val - a.val);
    const top1 = sorted[0];
    const top2 = sorted[1];
    const yearNum = String(d.year || "").replace(/\D/g, "");
    const codeNum = yearNum ? "0" + yearNum.slice(-2) : "PANAX";
    if (EXTRA_VARIANT_IDS.includes(v)) {
      const cover = safeImageUrl(d.cover) || coverArt(d.gameId || d.title || "gq", d.title || "Game", paletteFor(d.gameId || d.title || "gq"));
      const html = renderExtraGameCard(v, { ...d, cover }, "", rx);
      if (html) {
        const tpl = doc.createElement("template");
        tpl.innerHTML = html;
        tpl.content.querySelectorAll("script,iframe,object,embed").forEach((n) => n.remove());
        tpl.content.querySelectorAll("*").forEach((el) => {
          for (const attr of [...el.attributes]) {
            if (/^on/i.test(attr.name) || /^(href|src)$/i.test(attr.name) && /^\s*javascript:/i.test(attr.value)) {
              el.removeAttribute(attr.name);
            }
          }
        });
        const node = tpl.content.firstElementChild;
        if (node) return node;
      }
    }
    if (v === "duet") {
      const metaNodes = [];
      const metaVals = [d.year, d.dev, d.pub].filter(Boolean);
      metaVals.forEach((m, idx) => {
        if (idx > 0) metaNodes.push(" ", h(doc, "i", { text: "\xB7" }), " ");
        metaNodes.push(String(m));
      });
      if (!metaNodes.length) metaNodes.push("PANAX");
      const pos = rx.slice(0, 3).reduce((s, x) => s + x.val, 0);
      const neg = rx.slice(4).reduce((s, x) => s + x.val, 0);
      const noteText = rxTotal <= 0 ? "\u041E\u0446\u0435\u043D\u043A\u0438 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u0435\u0440\u0432\u044B\u0445 \u0440\u0435\u0430\u043A\u0446\u0438\u0439 \u0438\u0433\u0440\u043E\u043A\u043E\u0432 \u043D\u0430 Panax." : pos >= 85 ? "\u041F\u043E\u0434\u0430\u0432\u043B\u044F\u044E\u0449\u0435\u0435 \u0431\u043E\u043B\u044C\u0448\u0438\u043D\u0441\u0442\u0432\u043E \u0438\u0433\u0440\u043E\u043A\u043E\u0432 \u043E\u0446\u0435\u043D\u0438\u043B\u043E \u0438\u0433\u0440\u0443 \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u043E." : pos >= 70 ? "\u041F\u043E\u0447\u0442\u0438 4 \u0438\u0437 5 \u0440\u0435\u0430\u043A\u0446\u0438\u0439 \u2014 \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0432\u043F\u0435\u0447\u0430\u0442\u043B\u0435\u043D\u0438\u044F." : pos >= 55 ? "\u0411\u043E\u043B\u044C\u0448\u0438\u043D\u0441\u0442\u0432\u043E \u0440\u0435\u0430\u043A\u0446\u0438\u0439 \u0441\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u0430 \u2014 \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435." : neg >= 50 ? "\u0421\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u043E \u0432\u043E\u0441\u043F\u0440\u0438\u043D\u044F\u043B\u043E \u0438\u0433\u0440\u0443 \u0441\u0434\u0435\u0440\u0436\u0430\u043D\u043D\u043E \u0438\u043B\u0438 \u043A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0438." : "\u0412\u043F\u0435\u0447\u0430\u0442\u043B\u0435\u043D\u0438\u044F \u0438\u0433\u0440\u043E\u043A\u043E\u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0438\u043B\u0438\u0441\u044C \u043F\u043E\u0440\u043E\u0432\u043D\u0443.";
      const coverImg = img(doc, d.cover, d.gameId || d.title, d.title, "duet-cover");
      coverImg.alt = `\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${d.title || "\u0418\u0433\u0440\u0430"}`;
      const choiceNode = (t) => h(
        doc,
        "div",
        { class: "duet-choice" },
        t.badge ? h(doc, "img", { class: "badge", src: t.badge, alt: t.name, loading: "eager" }) : h(doc, "span", { class: "badge-ico", text: t.icon }),
        h(doc, "div", {}, h(doc, "b", { text: t.name }), h(doc, "strong", { text: `${t.val.toFixed(1)}%` }))
      );
      return h(
        doc,
        "div",
        { class: "w w-game v-duet" },
        h(
          doc,
          "div",
          { class: "duet-head" },
          h(
            doc,
            "div",
            {},
            h(doc, "div", { class: "kicker", text: "PLAYER IMPRESSION" }),
            h(doc, "h2", { class: "game-title", text: d.title || "\u0418\u0433\u0440\u0430" }),
            h(doc, "div", { class: "game-meta" }, ...metaNodes),
            (d.genres || []).length ? h(doc, "div", { class: "genres" }, ...(d.genres || []).slice(0, 4).map((g) => h(doc, "span", { text: g }))) : null
          ),
          coverImg
        ),
        h(
          doc,
          "div",
          { class: "duet-panel" },
          h(doc, "div", { class: "duet-label", text: "\u0414\u0412\u0410 \u0413\u041B\u0410\u0412\u041D\u042B\u0425 \u041E\u0422\u041A\u041B\u0418\u041A\u0410 \u0421\u041E\u041E\u0411\u0429\u0415\u0421\u0422\u0412\u0410" }),
          h(doc, "div", { class: "duet-pair" }, choiceNode(top1), h(doc, "div", { class: "duet-vs", text: "+" }), choiceNode(top2)),
          h(doc, "div", { class: "duet-note", text: noteText })
        ),
        h(
          doc,
          "div",
          { class: "duet-foot" },
          h(
            doc,
            "div",
            { class: "mini-dots", "aria-label": "\u0426\u0432\u0435\u0442\u0430 \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0445 \u0440\u0435\u0430\u043A\u0446\u0438\u0439" },
            ...rx.map((x) => h(doc, "i", { style: `--c:${x.color}`, title: `${x.name}: ${x.val.toFixed(1)}%` }))
          ),
          h(doc, "span", { text: "6 \u0420\u0415\u0410\u041A\u0426\u0418\u0419 PANAX" }),
          link(doc, panaxUrl, "panax-link", "\u041E\u0446\u0435\u043D\u043A\u0438 \u043D\u0430 Panax ", h(doc, "span", { "aria-hidden": "true", text: "\u2197" }))
        )
      );
    }
    if (v === "editorial") {
      const rest = rx.filter((x) => x.k !== top1.k);
      const edMetaVals = [d.dev, ...(d.genres || []).slice(0, 3)].filter(Boolean);
      const edMetaNodes = [];
      edMetaVals.forEach((m, idx) => {
        if (idx > 0) edMetaNodes.push(" ", h(doc, "span", { "aria-hidden": "true", text: "\xB7" }), " ");
        edMetaNodes.push(String(m));
      });
      if (!edMetaNodes.length) edMetaNodes.push("\u0421\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u043E PANAX");
      const edNoteKids = rxTotal <= 0 ? ["\u041E\u0436\u0438\u0434\u0430\u044E\u0442\u0441\u044F \u043F\u0435\u0440\u0432\u044B\u0435 \u043E\u0446\u0435\u043D\u043A\u0438 \u0441\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u0430 PANAX."] : top1.val >= 35 ? ["\u041F\u043E\u0447\u0442\u0438 \u043A\u0430\u0436\u0434\u044B\u0439 \u0432\u0442\u043E\u0440\u043E\u0439 \u0438\u0433\u0440\u043E\u043A", h(doc, "br"), "\u043E\u0441\u0442\u0430\u0432\u0438\u043B \u044D\u0442\u0443 \u0440\u0435\u0430\u043A\u0446\u0438\u044E."] : ["\u041B\u0438\u0434\u0438\u0440\u0443\u044E\u0449\u0430\u044F \u0440\u0435\u0430\u043A\u0446\u0438\u044F \u0441\u0440\u0435\u0434\u0438", h(doc, "br"), "\u043E\u0446\u0435\u043D\u043E\u043A \u0441\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u0430 PANAX."];
      return h(
        doc,
        "div",
        { class: "w w-game v-editorial" },
        h(
          doc,
          "div",
          { class: "ed-top" },
          h(doc, "div", { class: "ed-index" }, `GAME / ${codeNum}`, h(doc, "br"), h(doc, "b", {}, "PLAYER", h(doc, "br"), "VERDICT")),
          h(
            doc,
            "div",
            { class: "ed-head" },
            h(
              doc,
              "div",
              { class: "game-head" },
              h(doc, "div", { class: "kicker", text: `PANAX PLAYER REACTIONS${d.year ? " \xB7 " + d.year : ""}` }),
              h(doc, "div", { class: "game-title", text: (d.title || "\u0418\u0433\u0440\u0430").toUpperCase() }),
              h(doc, "div", { class: "game-meta" }, ...edMetaNodes)
            )
          )
        ),
        h(
          doc,
          "div",
          { class: "ed-feature" },
          h(doc, "div", { class: "ed-feature-label", text: "\u0421\u0410\u041C\u0410\u042F \u0427\u0410\u0421\u0422\u0410\u042F \u0420\u0415\u0410\u041A\u0426\u0418\u042F" }),
          h(
            doc,
            "div",
            { class: "ed-feature-main" },
            h(doc, "span", { text: top1.icon }),
            h(doc, "b", { text: top1.name.toUpperCase() }),
            h(doc, "strong", { style: `color:${top1.k === "awesome" ? "#d78a00" : top1.color}` }, top1.val.toFixed(1), h(doc, "small", { text: "%" }))
          ),
          h(doc, "div", { class: "ed-feature-note" }, ...edNoteKids)
        ),
        h(
          doc,
          "div",
          { class: "ed-rest" },
          ...rest.map(
            (x) => h(
              doc,
              "div",
              { class: "ed-row", style: `--c:${x.color};--v:${x.val.toFixed(1)}%` },
              h(doc, "span", { text: x.icon }),
              h(doc, "b", { text: x.name }),
              h(doc, "i", {}, h(doc, "em", { style: `width:${x.val.toFixed(1)}%;background:${x.color}` })),
              h(doc, "strong", { text: `${x.val.toFixed(1)}%` })
            )
          )
        ),
        h(
          doc,
          "div",
          { class: "ed-foot" },
          h(doc, "span", { text: "\u0426\u0418\u0424\u0420\u042B \u0421\u041E\u041E\u0411\u0429\u0415\u0421\u0422\u0412\u0410 PANAX" }),
          link(doc, panaxUrl, "panax-link", "\u041E\u0446\u0435\u043D\u043A\u0438 \u043D\u0430 Panax ", h(doc, "span", { "aria-hidden": "true", text: "\u2197" }))
        )
      );
    }
    if (v === "staircase") {
      return h(
        doc,
        "div",
        { class: "w w-game v-staircase" },
        h(
          doc,
          "div",
          { class: "stairs-head" },
          h(
            doc,
            "div",
            {},
            h(doc, "div", { class: "kicker", text: "REACTION LEVELS / PANAX" }),
            h(doc, "div", { class: "game-title", text: (d.title || "\u0418\u0433\u0440\u0430").toUpperCase() }),
            h(doc, "div", { class: "game-meta", text: "\u041E\u0442 \u043C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0432\u043E\u0441\u0442\u043E\u0440\u0433\u0430 \u0434\u043E \u043F\u043E\u043B\u043D\u043E\u0433\u043E \u0440\u0430\u0437\u043E\u0447\u0430\u0440\u043E\u0432\u0430\u043D\u0438\u044F" })
          ),
          h(doc, "div", { class: "stairs-number" }, "06", h(doc, "span", { text: "LEVELS" }))
        ),
        h(
          doc,
          "div",
          { class: "stairs-chart" },
          ...rx.map(
            (x, idx) => h(
              doc,
              "div",
              { class: `step step${idx + 1}`, style: `--c:${x.color};--v:${x.val.toFixed(1)}%` },
              h(doc, "div", { class: "step-cap" }, h(doc, "span", { text: x.icon }), h(doc, "b", { text: `${x.val.toFixed(1)}%` })),
              h(doc, "div", { class: "step-fill", style: `height:${x.val.toFixed(1)}%;background:${x.color}` }),
              h(doc, "label", { text: x.name })
            )
          )
        ),
        h(
          doc,
          "div",
          { class: "stairs-foot" },
          h(doc, "span", { text: "\u041E\u0426\u0415\u041D\u041A\u0418 \u0421\u041E\u041E\u0411\u0429\u0415\u0421\u0422\u0412\u0410" }),
          link(doc, panaxUrl, "panax-link", "\u041E\u0446\u0435\u043D\u043A\u0438 \u043D\u0430 Panax ", h(doc, "span", { "aria-hidden": "true", text: "\u2197" }))
        )
      );
    }
    if (v === "type") {
      const words = String(d.title || "\u0418\u0433\u0440\u0430").trim().toUpperCase().split(/\s+/).filter(Boolean);
      const titleKids = words.length >= 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), h(doc, "br"), h(doc, "i", { text: words.slice(Math.ceil(words.length / 2)).join(" ") })] : [words[0] || "\u0418\u0413\u0420\u0410"];
      const devWords = String(d.dev || "PANAX").trim().toUpperCase().split(/\s+/).filter(Boolean);
      const devKids = devWords.length > 1 ? [devWords.slice(0, -1).join(" "), h(doc, "br"), devWords[devWords.length - 1]] : [devWords[0] || "PANAX"];
      const genreTag = String(d.genres && d.genres[0] || d.plat && d.plat[0] || "PANAX").toUpperCase();
      return h(
        doc,
        "div",
        { class: "w w-game v-type typecard" },
        h(
          doc,
          "div",
          { class: "type-meta" },
          h(doc, "span", { text: "PANAX / GAME REACTION INDEX" }),
          h(doc, "span", { text: `${d.year || "PANAX"} \u2014 \u2116 ${codeNum}` })
        ),
        h(
          doc,
          "div",
          { class: "type-hero" },
          h(doc, "div", { class: "game-title" }, ...titleKids),
          h(doc, "div", { class: "type-aside" }, ...devKids, h(doc, "span", { text: genreTag }))
        ),
        h(
          doc,
          "div",
          { class: "type-rule" },
          h(doc, "span", { text: "\u041A\u0410\u041A \u0418\u0413\u0420\u0423 \u0412\u041E\u0421\u041F\u0420\u0418\u041D\u042F\u041B\u0418" }),
          h(doc, "span", { text: rxTotal > 0 ? "100% \u041E\u0422\u0412\u0415\u0422\u041E\u0412" : "\u041D\u0415\u0422 \u041E\u0426\u0415\u041D\u041E\u041A" })
        ),
        h(
          doc,
          "div",
          { class: "type-list" },
          ...rx.map(
            (x) => h(
              doc,
              "div",
              { class: "type-row", style: `--c:${x.color};--v:${x.val.toFixed(1)}%` },
              h(doc, "span", { class: "type-symbol", text: x.icon }),
              h(doc, "b", { text: x.name }),
              h(doc, "div", { class: "type-track" }, h(doc, "i", { style: `width:${x.val.toFixed(1)}%;background:${x.color}` })),
              h(doc, "strong", {}, x.val.toFixed(1), h(doc, "small", { text: "%" }))
            )
          )
        ),
        h(
          doc,
          "div",
          { class: "type-foot" },
          h(doc, "span", { text: "\u041C\u041D\u0415\u041D\u0418\u0415 \u0418\u0413\u0420\u041E\u041A\u041E\u0412 \u2014 \u041D\u0415 \u0420\u0415\u0426\u0415\u041D\u0417\u0418\u042F" }),
          link(doc, panaxUrl, "panax-link", "\u041E\u0446\u0435\u043D\u043A\u0438 \u043D\u0430 Panax ", h(doc, "span", { "aria-hidden": "true", text: "\u2197" }))
        )
      );
    }
    if (v === "brutal") {
      const devMeta = [d.year, d.dev].filter(Boolean).join(" \xB7 ").toUpperCase() || "PANAX";
      return h(
        doc,
        "div",
        { class: "w w-game v-brutal" },
        h(
          doc,
          "div",
          { class: "br-left" },
          h(
            doc,
            "div",
            { class: "br-top" },
            h(doc, "div", { class: "br-poster" }, img(doc, d.cover, d.gameId || d.title, d.title, "")),
            h(
              doc,
              "div",
              {},
              h(doc, "div", { class: "br-dev", text: devMeta }),
              h(doc, "h3", { class: "br-title", text: d.title || "\u0418\u0433\u0440\u0430" })
            )
          ),
          h(
            doc,
            "div",
            { class: "br-bottom" },
            h(
              doc,
              "div",
              {},
              h(doc, "div", { class: "br-dom-lbl", text: "\u0414\u041E\u041C\u0418\u041D\u0418\u0420\u0423\u0415\u0422" }),
              h(doc, "div", { class: "br-leader", text: `${top1.val.toFixed(1)}% ${top1.name.toUpperCase()}` })
            ),
            link(doc, panaxUrl, "br-link", "PANAXGAMES \u2192")
          )
        ),
        h(
          doc,
          "div",
          { class: "br-table" },
          ...rx.map(
            (x) => h(
              doc,
              "div",
              { class: "br-cell" },
              h(doc, "span", { class: "br-cname", text: x.name.toUpperCase() }),
              h(doc, "span", { class: "br-cval", text: `${x.val.toFixed(1)}%` })
            )
          )
        )
      );
    }
    return h(
      doc,
      "div",
      { class: "w w-game v-classic" },
      img(doc, d.cover, d.gameId || d.title, d.title, "w-cover"),
      h(
        doc,
        "div",
        { class: "w-info" },
        h(doc, "div", { class: "w-kick", text: "\u{1F3AE} \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438\u0433\u0440\u044B" + (d.source ? " \xB7 " + d.source : "") }),
        h(doc, "div", { class: "w-title", text: d.title || "\u0418\u0433\u0440\u0430" }),
        h(doc, "div", { class: "w-sub", text: [d.year, d.dev, d.pub].filter(Boolean).join(" \xB7 ") }),
        h(doc, "div", { class: "w-tags" }, ...(d.genres || []).map((g) => h(doc, "span", { text: g }))),
        badges.length ? h(doc, "div", { class: "w-badges" }, ...badges) : null,
        links.length ? h(doc, "div", { class: "w-links" }, ...links) : null
      )
    );
  }
  function steamWidget(doc, d) {
    return h(
      doc,
      "div",
      { class: "w w-steam" },
      h(
        doc,
        "div",
        { class: "ws-head" },
        img(doc, d.cover, d.app || d.title, d.title, "ws-cap"),
        h(
          doc,
          "div",
          null,
          h(doc, "div", { class: "ws-t", text: d.title || "\u0418\u0433\u0440\u0430 \u0432 Steam" }),
          h(doc, "div", { class: "ws-s", text: "\u0412 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0435 Steam" + (d.date ? " \xB7 \u0432\u044B\u043F\u0443\u0441\u043A " + d.date : "") }),
          h(doc, "div", { class: "ws-tags" }, ...(d.tags || []).map((t) => h(doc, "span", { text: t })))
        )
      ),
      h(
        doc,
        "div",
        { class: "ws-body" },
        h(
          doc,
          "div",
          { class: "ws-price" },
          d.disc ? h(doc, "span", { class: "disc", text: d.disc }) : null,
          d.old ? h(doc, "span", { class: "old", text: d.old }) : null,
          h(doc, "span", { class: "now", text: d.price || "\u0426\u0435\u043D\u0430 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u0430" })
        ),
        link(doc, d.url, "ws-btn", "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0432 Steam \u2192")
      )
    );
  }
  function ytWidget(doc, d) {
    const thumb = link(doc, d.url, "yt-thumb", img(doc, d.cover, d.url || d.title, d.title, "yt-img"), h(doc, "span", { class: "yt-play", text: "\u25B6" }), d.dur ? h(doc, "span", { class: "yt-dur", text: d.dur }) : null);
    return h(
      doc,
      "div",
      { class: "w w-yt" },
      thumb,
      h(
        doc,
        "div",
        { class: "yt-info" },
        h(doc, "div", { class: "yt-t", text: d.title || "\u0412\u0438\u0434\u0435\u043E" }),
        h(doc, "div", { class: "yt-c", text: (d.channel || "\u041A\u0430\u043D\u0430\u043B") + " \xB7 YouTube" }),
        link(doc, d.url, "yt-go", "\u25B6 \u0421\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043D\u0430 YouTube")
      )
    );
  }
  function wsWidget(doc, d) {
    const meta = "\u041C\u0430\u0441\u0442\u0435\u0440\u0441\u043A\u0430\u044F Steam \xB7 \u0430\u0432\u0442\u043E\u0440 " + (d.author || "\u2014") + (d.subs ? " \xB7 \u{1F465} " + d.subs + " \u043F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A\u043E\u0432" : "") + (d.game ? " \xB7 " + d.game : "");
    return h(
      doc,
      "div",
      { class: "w w-ws" },
      h(doc, "div", { class: "ws-ic", text: "\u{1F6E0}\uFE0F" }),
      h(doc, "div", null, h(doc, "div", { class: "ws-tt", text: d.title || "\u041F\u0440\u0435\u0434\u043C\u0435\u0442 \u043C\u0430\u0441\u0442\u0435\u0440\u0441\u043A\u043E\u0439" }), h(doc, "div", { class: "ws-ss", text: meta })),
      link(doc, d.url, "ws-sub", "\u041E\u0442\u043A\u0440\u044B\u0442\u044C")
    );
  }
  function imageItems(d) {
    if (Array.isArray(d.items) && d.items.length) return d.items;
    if (d && d.url) return [d];
    return [];
  }
  function imageBlock(doc, d) {
    const items = imageItems(d);
    const n = Math.min(Math.max(items.length, 0), 10);
    const fig = h(doc, "figure", { class: "blk img collage c" + (n || 1) });
    if (!items.length) {
      fig.append(h(doc, "div", { class: "img-err", text: "\u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E (\u0430\u0434\u0440\u0435\u0441 \u043E\u0442\u043A\u043B\u043E\u043D\u0451\u043D \u0438\u043B\u0438 \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0451\u043D)" }));
      return fig;
    }
    const grid = h(doc, "div", { class: "collage-grid" });
    items.forEach((it, i) => {
      const href = safeUserImageUrl(it.url);
      const label = it.caption || it.alt || "\u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 " + (i + 1);
      const cell = h(doc, "button", {
        type: "button",
        class: "cell",
        "data-gq-lb": String(i),
        "data-caption": it.caption || "",
        "aria-label": label
      });
      if (!href) {
        cell.append(h(doc, "div", { class: "img-err", text: "\u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E (\u0430\u0434\u0440\u0435\u0441 \u043E\u0442\u043A\u043B\u043E\u043D\u0451\u043D \u0438\u043B\u0438 \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0451\u043D)" }));
      } else {
        const el = doc.createElement("img");
        el.setAttribute("src", href);
        el.setAttribute("alt", it.alt || it.caption || "");
        el.setAttribute("referrerpolicy", "no-referrer");
        el.setAttribute("loading", "eager");
        const err = h(doc, "div", { class: "img-err", text: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435" });
        err.hidden = true;
        el.addEventListener("error", () => {
          el.hidden = true;
          err.hidden = false;
        });
        cell.append(el, err);
      }
      grid.append(cell);
    });
    fig.append(grid);
    if (d.caption) fig.append(h(doc, "figcaption", { class: "img-cap", text: d.caption }));
    return fig;
  }
  function closeLightbox(root) {
    const lb = root && root.querySelector(":scope > .gq-lb");
    if (!lb) return;
    if (typeof lb._gqOff === "function") lb._gqOff();
    lb.remove();
  }
  function bindImageLightbox(root) {
    if (!root || root.getAttribute("data-gq-lb-bound")) return;
    root.setAttribute("data-gq-lb-bound", "1");
    const doc = root.ownerDocument;
    root.addEventListener("click", (e) => {
      const cell = e.target && e.target.closest && e.target.closest("[data-gq-lb]");
      if (!cell || !root.contains(cell)) return;
      e.preventDefault();
      e.stopPropagation();
      const fig = cell.closest(".blk.img");
      if (!fig) return;
      const cells = [...fig.querySelectorAll("[data-gq-lb]")];
      const items = cells.map((c) => {
        const im = c.querySelector("img");
        return {
          url: im && im.getAttribute("src") || "",
          caption: c.getAttribute("data-caption") || im && im.getAttribute("alt") || ""
        };
      }).filter((it) => it.url);
      if (!items.length) return;
      const start2 = Math.max(0, cells.indexOf(cell));
      const shared = fig.querySelector("figcaption") && fig.querySelector("figcaption").textContent || "";
      openLightbox(root, items, start2, shared);
    });
  }
  function openLightbox(root, items, start2, shared) {
    closeLightbox(root);
    const doc = root.ownerDocument;
    const overlay = h(doc, "div", { class: "gq-lb", role: "dialog", "aria-modal": "true", "aria-label": "\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F" });
    const img2 = doc.createElement("img");
    img2.setAttribute("alt", "");
    img2.setAttribute("referrerpolicy", "no-referrer");
    const cap = h(doc, "div", { class: "lb-cap" });
    const count = h(doc, "div", { class: "lb-count" });
    const closeBtn = h(doc, "button", { type: "button", class: "lb-x", "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\u2715");
    const prev = h(doc, "button", { type: "button", class: "lb-nav lb-prev", "aria-label": "\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0435" }, "\u2039");
    const next = h(doc, "button", { type: "button", class: "lb-nav lb-next", "aria-label": "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435" }, "\u203A");
    overlay.append(closeBtn, prev, img2, next, cap, count);
    let index = start2;
    const show = (i) => {
      if (!items.length) return;
      index = (i + items.length) % items.length;
      const it = items[index];
      img2.setAttribute("src", it.url);
      const text = it.caption || "";
      cap.textContent = text;
      cap.hidden = !text;
      count.textContent = items.length > 1 ? index + 1 + " / " + items.length : "";
      count.hidden = items.length < 2;
      prev.hidden = items.length < 2;
      next.hidden = items.length < 2;
    };
    const close = () => closeLightbox(root);
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
    });
    prev.addEventListener("click", (e) => {
      e.stopPropagation();
      show(index - 1);
    });
    next.addEventListener("click", (e) => {
      e.stopPropagation();
      show(index + 1);
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    const onKey = (e) => {
      if (!root.querySelector(":scope > .gq-lb")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        show(index - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        show(index + 1);
      }
    };
    doc.addEventListener("keydown", onKey);
    overlay._gqOff = () => doc.removeEventListener("keydown", onKey);
    root.append(overlay);
    show(start2);
    try {
      closeBtn.focus();
    } catch {
    }
  }
  function block(doc, r, b) {
    switch (b.type) {
      case "h2":
        return richText(doc, b.html, "blk h2");
      case "h3":
        return richText(doc, b.html, "blk h3");
      case "text":
        return richText(doc, b.html, "blk txt");
      case "quote":
        return richText(doc, b.html, "blk quote");
      case "spoiler": {
        const det = h(doc, "details", { class: "blk spoiler" }, h(doc, "summary", null, "\u26A0\uFE0F \u0421\u043F\u043E\u0439\u043B\u0435\u0440 \u2014 \u043D\u0430\u0436\u043C\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C"));
        if (!b.hidden) det.setAttribute("open", "");
        det.append(richText(doc, b.html, "sp-body"));
        return det;
      }
      case "divider":
        return h(doc, "hr", { class: "divider d" + (b.data && b.data.style || 1) });
      case "game":
        return gameWidget(doc, r, b.data || {});
      case "steam":
        return steamWidget(doc, b.data || {});
      case "youtube":
        return ytWidget(doc, b.data || {});
      case "workshop":
        return wsWidget(doc, b.data || {});
      case "image":
        return imageBlock(doc, b.data || {});
      default:
        return null;
    }
  }
  function prosCons(doc, r) {
    if (!r.pros.length && !r.cons.length) return null;
    const col = (cls, title, items, sign) => h(doc, "div", { class: "pc " + cls }, h(doc, "h4", { text: title }), ...items.map((it) => h(doc, "div", { class: "pc-i" }, h(doc, "span", { class: "pc-ic", text: sign }), h(doc, "span", { text: it.text }))));
    return h(doc, "div", { class: "proscons" }, r.pros.length ? col("p", "\u2705 \u041F\u043B\u044E\u0441\u044B", r.pros, "+") : null, r.cons.length ? col("c", "\u274C \u041C\u0438\u043D\u0443\u0441\u044B", r.cons, "\u2212") : null);
  }
  function renderReview(doc, r) {
    const root = h(doc, "article", { class: "gq" });
    const head = h(doc, "header", { class: "doc-head" });
    if (r.title) head.append(h(doc, "h1", { class: "doc-title", text: r.title }));
    const meta = [r.game ? "\u{1F3AE} " + r.game : "", r.author ? "\u270D\uFE0F " + r.author : ""].filter(Boolean);
    if (meta.length) head.append(h(doc, "div", { class: "doc-meta" }, ...meta.map((m) => h(doc, "span", { class: "chip", text: m }))));
    if (r.score || r.recommend !== "none") head.append(scoreBlock(doc, r));
    const asp = aspectsBlock(doc, r);
    if (asp) head.append(asp);
    if (head.childNodes.length) root.append(head);
    const blocks = h(doc, "div", { class: "blocks" });
    for (const b of r.blocks) {
      const n = block(doc, r, b);
      if (n) blocks.append(n);
    }
    root.append(blocks);
    const pc = prosCons(doc, r);
    if (pc) root.append(pc);
    bindImageLightbox(root);
    return root;
  }

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\gamequill-content\render.css
  var render_default = `/* GameQuill reader view \u2014 lives inside a closed shadow root. */\r
:host{all:initial;display:block}\r
*{box-sizing:border-box}\r
.wrap{\r
--bg:#000000;--panel:#1e1e1e;--panel2:#252525;--panel3:#303030;--line:#3b3b3b;--line2:#474747;\r
--txt:#f2f2f2;--mut:#a3a3a3;--dim:#808080;--acc:#7c4dff;--acc2:#00aef7;--gold:#ffc84a;--grn:#3ddc97;--red:#ff5f6d;\r
--f:system-ui,-apple-system,'Segoe UI','Noto Sans',sans-serif;\r
--fd:system-ui,-apple-system,'Segoe UI',sans-serif;\r
font-family:var(--f);color:var(--txt);font-size:15px;line-height:1.6;position:relative;\r
background:var(--bg);border:1px solid var(--line);border-radius:16px;padding:14px;margin:6px 0;\r
-webkit-font-smoothing:antialiased;text-align:left;\r
}\r
.wrap[data-gq-theme="panax-dark"]{\r
--bg:#000000;--panel:#1e1e1e;--panel2:#252525;--panel3:#303030;--line:#3b3b3b;--line2:#474747;\r
--txt:#f2f2f2;--mut:#a3a3a3;--dim:#808080;--acc:#7c4dff;--acc2:#00aef7;--gold:#ffc84a;--grn:#3ddc97;--red:#ff5f6d;\r
--f:system-ui,-apple-system,'Segoe UI','Noto Sans',sans-serif;\r
--fd:system-ui,-apple-system,'Segoe UI',sans-serif;\r
background:#000;border-color:#303030;border-radius:16px;\r
}\r
.bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px}\r
.pill{display:inline-flex;align-items:center;gap:6px;font:600 11.5px/1 var(--f);padding:6px 11px;border-radius:999px;\r
background:rgba(124,92,255,.14);border:1px solid rgba(124,92,255,.4);color:#d7ccff;cursor:pointer}\r
.pill:hover{background:rgba(124,92,255,.28)}\r
.pill.ghost{background:transparent;border-color:var(--line2);color:var(--mut)}\r
.note{font-size:11.5px;color:var(--dim)}\r
.body{position:relative}\r
.wrap.compact .body{max-height:460px;overflow:hidden}\r
.wrap.compact .body::after{content:'';position:absolute;left:0;right:0;bottom:0;height:90px;background:linear-gradient(transparent,var(--bg));pointer-events:none}\r
.more{display:none;margin:8px auto 0}\r
.wrap.compact .more{display:flex}\r
.wrap.mini .body{display:none}\r
a{color:var(--acc2)}\r
.gq{display:block}\r
.doc-head{background:linear-gradient(160deg,rgba(124,92,255,.14),rgba(34,211,238,.05) 45%,transparent);border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin-bottom:14px;position:relative;overflow:hidden}\r
.doc-title{font-family:var(--fd);font-weight:700;font-size:26px;letter-spacing:-.5px;line-height:1.2;margin:0 0 6px;color:#fff}\r
.doc-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:11.5px;color:var(--mut)}\r
.chip{background:rgba(255,255,255,.05);border:1px solid var(--line);padding:3px 9px;border-radius:20px}\r
.scorecard{display:flex;gap:18px;flex-wrap:wrap;align-items:center;margin-top:14px}\r
.sc-left{flex:1;min-width:240px}\r
.stars{display:flex;gap:2px;margin-bottom:6px}\r
.star{font-size:23px;color:#2b3346;line-height:1}\r
.star.lit{color:var(--gold);text-shadow:0 0 12px rgba(255,200,74,.5)}\r
.sc-num{display:flex;align-items:baseline;gap:8px}\r
.sc-num b{font-family:var(--fd);font-size:30px;line-height:1;background:linear-gradient(135deg,#ffd97a,#ff9d5c);-webkit-background-clip:text;background-clip:text;color:transparent}\r
.sc-num i{font-style:normal;color:var(--dim);font-size:13px}\r
.sc-cap{display:flex;align-items:center;gap:9px;margin-top:6px;font-size:13px;color:var(--mut)}\r
.sc-cap .ico{font-size:22px}\r
.sc-cap b{color:var(--txt)}\r
.sc-cap .d{font-size:11.5px;color:var(--dim);display:block}\r
.verdict{display:flex;align-items:center;gap:9px;padding:10px 14px;border-radius:12px;font-weight:700;font-size:14px;border:1px solid var(--line)}\r
.verdict .e{font-size:18px}\r
.v-yes{background:linear-gradient(135deg,rgba(61,220,151,.2),rgba(61,220,151,.05));border-color:rgba(61,220,151,.55);color:#b9ffe0}\r
.v-neutral{background:linear-gradient(135deg,rgba(255,200,74,.2),rgba(255,200,74,.05));border-color:rgba(255,200,74,.5);color:#ffe9b0}\r
.v-no{background:linear-gradient(135deg,rgba(255,95,109,.2),rgba(255,95,109,.05));border-color:rgba(255,95,109,.55);color:#ffc3c8}\r
.aspects{margin-top:16px;border-top:1px dashed var(--line2);padding-top:12px}\r
.sec-h{font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;margin-bottom:8px}\r
.asp{display:flex;align-items:center;gap:10px;padding:5px 8px;border-radius:10px;background:rgba(255,255,255,.02);margin-bottom:3px}\r
.asp.off{opacity:.7}\r
.asp-n{width:150px;flex:0 0 150px;font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\r
.dots{display:flex;gap:3px;flex:1}\r
.dot{width:13px;height:13px;border-radius:50%;background:#242c3e}\r
.dot.lit{background:linear-gradient(135deg,#8b7bff,#22d3ee);box-shadow:0 0 8px rgba(124,92,255,.45)}\r
.asp-v{width:48px;text-align:right;font-family:var(--fd);font-size:12.5px;color:var(--gold)}\r
.asp-note{font-size:11.5px;color:var(--dim);font-style:italic}\r
.blocks{margin-top:6px}\r
.blk{padding:4px 6px;font-size:15.5px;line-height:1.75;color:#dfe4f2;overflow-wrap:anywhere}\r
.blk.h2{font-family:var(--fd);font-size:22px;font-weight:700;line-height:1.3;color:#fff;margin-top:10px}\r
.blk.h3{font-family:var(--fd);font-size:17px;font-weight:600;color:#f0e6ff;margin-top:6px}\r
.blk.quote{border-left:3px solid var(--acc);background:linear-gradient(90deg,rgba(124,92,255,.09),transparent);font-style:italic;color:#cfd6ea;padding:8px 14px;border-radius:0 10px 10px 0;margin:6px 0}\r
.blk.spoiler{border:1px dashed var(--line2);border-radius:10px;background:rgba(255,255,255,.03);margin:6px 0;padding:6px 10px}\r
.blk.spoiler summary{cursor:pointer;color:var(--gold);font-size:12px;font-weight:700;letter-spacing:.3px}\r
.sp-body{padding-top:6px}\r
.blk mark{background:rgba(255,200,74,.32);color:#fff;padding:0 3px;border-radius:3px}\r
.blk code{background:#0b0e16;border:1px solid var(--line);padding:1px 6px;border-radius:6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13.5px;color:#7ce7d4}\r
.blk a.lnk,.blk a:not(.game-chip){color:var(--acc2);text-decoration:underline;text-underline-offset:2px}\r
.blk a.game-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 9px;border-radius:999px;background:rgba(124,92,255,.16);border:1px solid rgba(124,92,255,.42);color:#d7ccff;text-decoration:none;font-weight:600;font-size:.92em}\r
.blk ul,.blk ol{margin:6px 0;padding-left:24px}\r
.blk li{margin:3px 0}\r
.blk p,.blk div{margin:0}\r
.divider{border:none;height:2px;margin:14px 8px;background:linear-gradient(90deg,transparent,var(--line2) 20%,var(--acc) 50%,var(--line2) 80%,transparent)}\r
.divider.d2{height:0;border-top:2px dashed var(--line2);background:none}\r
.divider.d3{height:auto;background:none;text-align:center;color:var(--dim)}\r
.divider.d3::after{content:'\u2726 \u2726 \u2726';letter-spacing:8px}\r
.w{margin:10px 4px;border-radius:14px;overflow:hidden;border:1px solid var(--line)}\r
.w-game.v-classic{display:flex;gap:16px;padding:14px;background:linear-gradient(120deg,#171c2b,#111521 60%)}\r
.w-cover{width:96px;height:144px;object-fit:cover;border-radius:10px;flex:0 0 96px;border:1px solid var(--line2);background:#1c2231}\r
.w-info{flex:1;min-width:0}\r
.w-kick{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--dim);font-weight:700;margin-bottom:5px}\r
.w-title{font-family:var(--fd);font-size:18px;font-weight:700;line-height:1.2;margin-bottom:3px;color:#fff}\r
.w-sub{font-size:12px;color:var(--mut);margin-bottom:8px}\r
.w-tags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px}\r
.w-tags span{font-size:10.5px;padding:2px 8px;border-radius:20px;background:rgba(255,255,255,.05);border:1px solid var(--line);color:var(--mut)}\r
.w-badges{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px}\r
.badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:8px;background:rgba(255,200,74,.12);border:1px solid rgba(255,200,74,.3);color:var(--gold)}\r
.w-links{display:flex;gap:6px;flex-wrap:wrap}\r
.srcbtn{--c:#7c5cff;display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;padding:5px 11px;border-radius:9px;text-decoration:none;color:#fff;background:color-mix(in srgb,var(--c) 22%,#131826);border:1px solid color-mix(in srgb,var(--c) 55%,transparent)}\r
.srcbtn:hover{background:var(--c)}\r
.w-steam{background:linear-gradient(160deg,#1b2838,#16202d 55%,#101720)}\r
.ws-head{display:flex;gap:14px;padding:12px 14px;align-items:center;border-bottom:1px solid rgba(255,255,255,.06)}\r
.ws-cap{width:150px;height:70px;object-fit:cover;border-radius:8px;flex:0 0 150px;border:1px solid rgba(255,255,255,.1);background:#1c2231}\r
.ws-t{font-size:16px;font-weight:700;color:#fff;line-height:1.2}\r
.ws-s{font-size:11.5px;color:#8f98a0;margin-top:4px}\r
.ws-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}\r
.ws-tags span{font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(102,192,244,.13);color:#66c0f4}\r
.ws-body{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:10px 14px;flex-wrap:wrap}\r
.ws-price{display:flex;align-items:center;gap:8px}\r
.ws-price .disc{background:#4c6b22;color:#beee11;font-weight:800;padding:3px 7px;border-radius:4px;font-size:13px}\r
.ws-price .old{text-decoration:line-through;color:#738895;font-size:12px}\r
.ws-price .now{color:#fff;font-weight:700}\r
.ws-btn{background:linear-gradient(90deg,#75b022,#588a1b);color:#d2e885;font-weight:700;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px}\r
.w-yt{display:flex;background:#141824}\r
.yt-thumb{position:relative;flex:0 0 220px;height:124px;display:grid;place-items:center;overflow:hidden;text-decoration:none;background:#1c2231}\r
.yt-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}\r
.yt-play{position:relative;z-index:2;width:50px;height:36px;background:#ff0033;border-radius:9px;display:grid;place-items:center;color:#fff;font-size:15px;padding-left:3px}\r
.yt-dur{position:absolute;right:8px;bottom:8px;z-index:2;background:rgba(0,0,0,.82);color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;font-weight:600}\r
.yt-info{padding:12px 14px;flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}\r
.yt-t{font-size:14.5px;font-weight:700;color:#fff;line-height:1.35}\r
.yt-c{font-size:12px;color:var(--mut)}\r
.yt-go{margin-top:auto;font-size:11.5px;color:#ff4d6d;font-weight:700;text-decoration:none}\r
.w-ws{display:flex;align-items:center;gap:14px;padding:12px 14px;background:linear-gradient(120deg,#1a2130,#141926)}\r
.ws-ic{width:44px;height:44px;border-radius:11px;background:linear-gradient(135deg,#2b3a52,#1b2434);border:1px solid var(--line2);display:grid;place-items:center;font-size:20px;flex:0 0 44px}\r
.ws-tt{font-weight:700;font-size:14px;color:#fff}\r
.ws-ss{font-size:11.5px;color:var(--mut);margin-top:2px}\r
.ws-sub{margin-left:auto;background:linear-gradient(90deg,#4c6b22,#588a1b);color:#d2e885;font-weight:700;padding:7px 14px;border-radius:6px;text-decoration:none;font-size:12px;white-space:nowrap}\r
.proscons{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}\r
.pc{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 14px}\r
.pc.p{border-top:3px solid var(--grn)}\r
.pc.c{border-top:3px solid var(--red)}\r
.pc h4{margin:0 0 8px;font-family:var(--fd);font-size:13px;text-transform:uppercase;letter-spacing:.4px}\r
.pc-i{display:flex;gap:8px;align-items:flex-start;font-size:14px;margin:5px 0}\r
.pc-ic{flex:0 0 20px;height:20px;border-radius:6px;display:grid;place-items:center;font-weight:800}\r
.pc.p .pc-ic{background:rgba(61,220,151,.15);color:var(--grn)}\r
.pc.c .pc-ic{background:rgba(255,95,109,.15);color:var(--red)}\r
@media (max-width:640px){\r
.proscons{grid-template-columns:1fr}\r
.w-game.v-classic,.w-yt{flex-direction:column}\r
.yt-thumb{flex-basis:auto;width:100%}\r
.asp-n{width:110px;flex-basis:110px}\r
}\r
.wrap.mini{background:none;border:0;padding:0;margin:4px 0}\r
.wrap.mini .bar{margin:0}\r
\r
.blk.img{margin:12px 0;padding:0;border:0;background:none}\r
.blk.img .collage-grid{display:grid;gap:6px;border-radius:14px;overflow:hidden;background:#0b0e16}\r
.blk.img.collage.c1 .collage-grid{grid-template-columns:1fr}\r
.blk.img.collage.c2 .collage-grid{grid-template-columns:1fr 1fr}\r
.blk.img.collage.c3 .collage-grid{grid-template-columns:1.25fr 1fr;grid-template-rows:minmax(120px,1fr) minmax(120px,1fr);min-height:280px}\r
.blk.img.collage.c3 .cell:first-child{grid-row:1/3}\r
.blk.img.collage.c4 .collage-grid{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;min-height:300px}\r
.blk.img.collage.c5 .collage-grid{grid-template-columns:repeat(6,1fr);grid-template-rows:1fr 1fr;min-height:300px}\r
.blk.img.collage.c5 .cell:nth-child(1),.blk.img.collage.c5 .cell:nth-child(2){grid-column:span 3}\r
.blk.img.collage.c5 .cell:nth-child(n+3){grid-column:span 2}\r
.blk.img.collage.c6 .collage-grid,.blk.img.collage.c7 .collage-grid,.blk.img.collage.c8 .collage-grid,.blk.img.collage.c9 .collage-grid,.blk.img.collage.c10 .collage-grid{grid-template-columns:repeat(3,1fr)}\r
.blk.img .cell{position:relative;display:block;width:100%;margin:0;padding:0;border:0;background:#11151f;cursor:zoom-in;overflow:hidden;min-height:90px;color:inherit}\r
.blk.img .cell img{display:block;width:100%;height:100%;object-fit:cover;border-radius:0;background:#11151f}\r
.blk.img.collage.c1 .cell img{object-fit:contain;max-height:640px;height:auto;width:100%;border-radius:12px}\r
.blk.img.collage.c1 .collage-grid{overflow:visible;background:transparent}\r
.blk.img .img-cap{margin:8px 6px 0;text-align:center;font-size:13px;color:var(--mut);font-style:italic;line-height:1.45}\r
\r
.blk.img .img-err{margin:0;padding:18px 14px;border:1px dashed var(--line2);border-radius:12px;background:#11151f;color:var(--mut);font-size:13px;text-align:center}\r
.blk.img img[hidden],.blk.img .img-err[hidden]{display:none}\r
\r
.gq-lb{position:fixed;inset:0;z-index:2147483000;background:rgba(6,8,14,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 16px 32px;gap:10px}\r
.gq-lb img{max-width:min(96vw,1120px);max-height:76vh;object-fit:contain;border-radius:10px;box-shadow:0 16px 50px rgba(0,0,0,.5);background:#0b0e16}\r
.gq-lb .lb-cap{color:#e9ecf6;font-size:14px;text-align:center;max-width:720px;line-height:1.45}\r
.gq-lb .lb-count{color:#8b94aa;font-size:12px}\r
.gq-lb .lb-x,.gq-lb .lb-nav{position:absolute;border:1px solid var(--line2);background:rgba(17,21,31,.86);color:#e9ecf6;border-radius:999px;cursor:pointer;font-size:20px;line-height:1;width:40px;height:40px;display:flex;align-items:center;justify-content:center}\r
.gq-lb .lb-x{top:16px;right:16px;font-size:18px}\r
.gq-lb .lb-prev{left:12px;top:50%;transform:translateY(-50%)}\r
.gq-lb .lb-next{right:12px;top:50%;transform:translateY(-50%)}\r
.gq-lb .lb-x:hover,.gq-lb .lb-nav:hover{background:rgba(124,92,255,.35);border-color:rgba(124,92,255,.6)}\r
\r
\r
/* === 0.3.5 PANAX Dark chrome (rendered review) === */\r
.wrap[data-gq-theme="gamequill"]{\r
--bg:#0c0f18;--panel:#11151f;--panel2:#161b27;--panel3:#1c2231;--line:#222a3a;--line2:#2d3648;\r
--txt:#e9ecf6;--mut:#8b94aa;--dim:#5b6479;--acc:#7c5cff;--acc2:#22d3ee;--gold:#ffc84a;--grn:#3ddc97;--red:#ff5f6d;\r
--f:'GQ Inter','Inter Variable',Inter,system-ui,-apple-system,'Segoe UI',sans-serif;\r
--fd:'GQ Unbounded','GQ Inter',system-ui,sans-serif;\r
}\r
.wrap[data-gq-theme="panax-dark"] .doc-head{\r
background:#1e1e1e;\r
border:1px solid #303030;\r
border-radius:16px;\r
}\r
.wrap[data-gq-theme="panax-dark"] .pill{\r
background:rgba(0,174,247,.12);\r
border-color:rgba(0,174,247,.35);\r
color:#d8eef5;\r
}\r
.wrap[data-gq-theme="panax-dark"] .v-yes{\r
background:#5f7f8a;\r
border-color:#6a8b96;\r
color:#fff;\r
}\r
.wrap[data-gq-theme="panax-dark"] .v-neutral{\r
background:#535353;\r
border-color:#6a6a6a;\r
color:#f2f2f2;\r
}\r
.wrap[data-gq-theme="panax-dark"] .v-no{\r
background:#3b3b3b;\r
border-color:#ff5f6d;\r
color:#ffc3c8;\r
}\r
.wrap[data-gq-theme="panax-dark"] .asp{background:#1e1e1e}\r
.wrap[data-gq-theme="panax-dark"] .dot{background:#303030}\r
.wrap[data-gq-theme="panax-dark"] .dot.lit{\r
background:#00aef7;\r
box-shadow:none;\r
}\r
.wrap[data-gq-theme="panax-dark"] .blk{color:#e8e8e8}\r
.wrap[data-gq-theme="panax-dark"] .blk.h2{color:#fff}\r
.wrap[data-gq-theme="panax-dark"] .blk.h3{color:#f2f2f2}\r
.wrap[data-gq-theme="panax-dark"] .blk.quote{\r
background:linear-gradient(90deg,rgba(124,77,255,.08),transparent);\r
color:#e8e8e8;\r
}\r
.wrap[data-gq-theme="panax-dark"] .blk a.game-chip{\r
background:rgba(124,77,255,.16);\r
border-color:rgba(124,77,255,.42);\r
}\r
.wrap[data-gq-theme="panax-dark"] .w-game.v-classic{\r
background:linear-gradient(120deg,#3a1f6e 0%,#1e1e1e 48%,#152028 100%);\r
}\r
.wrap[data-gq-theme="panax-dark"] .blk.img .collage-grid{background:#000;border-radius:16px}\r
.wrap[data-gq-theme="panax-dark"] .blk.img .cell,\r
.wrap[data-gq-theme="panax-dark"] .blk.img .cell img,\r
.wrap[data-gq-theme="panax-dark"] .blk.img .img-err{background:#1e1e1e}\r
.wrap[data-gq-theme="panax-dark"] .gq-lb{background:rgba(0,0,0,.88)}\r
.wrap[data-gq-theme="panax-dark"] .gq-lb .lb-cap{color:#f2f2f2}\r
.wrap[data-gq-theme="panax-dark"] .gq-lb .lb-count{color:#a3a3a3}\r
.wrap[data-gq-theme="panax-dark"] .gq-lb .lb-x,\r
.wrap[data-gq-theme="panax-dark"] .gq-lb .lb-nav{background:rgba(30,30,30,.92);color:#f2f2f2}\r
.wrap[data-gq-theme="panax-dark"] .gq-lb .lb-x:hover,\r
.wrap[data-gq-theme="panax-dark"] .gq-lb .lb-nav:hover{background:rgba(0,174,247,.28);border-color:rgba(0,174,247,.5)}\r
.wrap[data-gq-theme="panax-dark"] .star{color:#303030}\r
.wrap[data-gq-theme="panax-dark"] .star.lit{color:var(--gold);text-shadow:0 0 12px rgba(255,200,74,.5)}\r
\r
/* Game card variants: 5 editorial/brutal prototypes */\r
.wrap .w.w-game.v-duet,.wrap .w.w-game.v-editorial,.wrap .w.w-game.v-staircase,.wrap .w.w-game.v-type{display:block;position:relative;overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;line-height:1.35}\r
.wrap .w.w-game.v-duet .game-title,.wrap .w.w-game.v-editorial .game-title,.wrap .w.w-game.v-staircase .game-title,.wrap .w.w-game.v-type .game-title{margin:4px 0 6px;font-weight:900;line-height:.98;letter-spacing:-.055em}\r
.wrap .w.w-game.v-duet .kicker,.wrap .w.w-game.v-editorial .kicker,.wrap .w.w-game.v-staircase .kicker{font-size:10px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}\r
.wrap .w.w-game.v-duet .game-meta,.wrap .w.w-game.v-editorial .game-meta,.wrap .w.w-game.v-staircase .game-meta{font-size:12px;letter-spacing:.02em}\r
.wrap .blk .w.w-game.v-duet a.panax-link,.wrap .blk .w.w-game.v-editorial a.panax-link,.wrap .blk .w.w-game.v-staircase a.panax-link,.wrap .blk .w.w-game.v-type a.panax-link{display:inline-flex;align-items:center;gap:10px;text-decoration:none;font-weight:750;font-size:11px;white-space:nowrap;color:#fff;transition:transform .16s ease,opacity .16s ease}\r
.wrap .blk .w.w-game.v-duet a.panax-link:hover,.wrap .blk .w.w-game.v-editorial a.panax-link:hover,.wrap .blk .w.w-game.v-staircase a.panax-link:hover,.wrap .blk .w.w-game.v-type a.panax-link:hover{transform:translateY(-1px);opacity:.84}\r
.wrap .w.w-game.v-duet a.panax-link span,.wrap .w.w-game.v-editorial a.panax-link span,.wrap .w.w-game.v-staircase a.panax-link span,.wrap .w.w-game.v-type a.panax-link span{font-size:15px;line-height:1}\r
\r
/* 1. Duet */\r
.wrap .w.w-game.v-duet{padding:26px 29px;background:#f0eee8;color:#171816;border:1px solid #d7d3c9;border-radius:4px;box-shadow:0 8px 22px #0002}\r
.wrap .w.w-game.v-duet .duet-head{display:flex;justify-content:space-between;gap:24px;align-items:center}\r
.wrap .w.w-game.v-duet .duet-head>div{min-width:0}\r
.wrap .w.w-game.v-duet .game-title{font-family:Georgia,serif;font-size:clamp(28px,4.5vw,42px);letter-spacing:-.05em;color:#171816;line-height:1.02}\r
.wrap .w.w-game.v-duet .kicker{color:#79776e;font-size:9px}\r
.wrap .w.w-game.v-duet .game-meta{color:#66675f;font-size:11px}\r
.wrap .w.w-game.v-duet .game-meta i{font-style:normal;opacity:.6;padding:0 3px}\r
.wrap .w.w-game.v-duet .genres{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}\r
.wrap .w.w-game.v-duet .genres span{border:1px solid #c9c5b9;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:700;color:#55564f;background:#e5e1d7}\r
.wrap .w.w-game.v-duet .duet-cover{width:100px;height:115px;object-fit:cover;flex:0 0 100px;filter:saturate(.8);box-shadow:7px 7px 0 #d3cec2;display:block}\r
.wrap .w.w-game.v-duet .duet-panel{border-top:1px solid #c9c5b9;border-bottom:1px solid #c9c5b9;margin-top:21px;padding:17px 0 14px}\r
.wrap .w.w-game.v-duet .duet-label{font-size:9px;letter-spacing:.17em;font-weight:900;color:#76766e}\r
.wrap .w.w-game.v-duet .duet-pair{display:flex;align-items:center;gap:15px;margin-top:10px}\r
.wrap .w.w-game.v-duet .duet-choice{display:flex;align-items:center;gap:10px;flex:1;min-width:0}\r
.wrap .w.w-game.v-duet .duet-choice .badge{width:58px;height:58px;object-fit:contain;display:block;flex:none;padding:0;background:none;border:none;border-radius:0;color:inherit}\r
.wrap .w.w-game.v-duet .duet-choice .badge-ico{font-size:40px;line-height:1;width:58px;height:58px;display:grid;place-items:center;flex:none}\r
.wrap .w.w-game.v-duet .duet-choice b{display:block;font-family:Georgia,serif;font-size:17px;color:#171816}\r
.wrap .w.w-game.v-duet .duet-choice strong{font-size:25px;letter-spacing:-.05em;color:#171816;font-weight:800}\r
.wrap .w.w-game.v-duet .duet-vs{font:italic 25px Georgia,serif;color:#9d988c}\r
.wrap .w.w-game.v-duet .duet-note{font:italic 12px Georgia,serif;color:#77736b;margin-top:12px}\r
.wrap .w.w-game.v-duet .duet-foot{display:flex;align-items:center;gap:12px;margin-top:14px}\r
.wrap .w.w-game.v-duet .duet-foot>span{font-size:8px;letter-spacing:.14em;color:#89857b;font-weight:800}\r
.wrap .w.w-game.v-duet .mini-dots{display:flex;gap:4px;align-items:center}\r
.wrap .w.w-game.v-duet .mini-dots i{width:7px;height:7px;border-radius:50%;background:var(--c);display:block}\r
.wrap .blk .w.w-game.v-duet a.panax-link{margin-left:auto;color:#fff;background:#1a1d19;padding:9px 13px;border-radius:3px}\r
\r
/* 2. Editorial */\r
.wrap .w.w-game.v-editorial{padding:28px 32px;background:#e9e5dc;color:#22211e;border:1px solid #d5d0c5;border-radius:3px}\r
.wrap .w.w-game.v-editorial:after{content:"";position:absolute;right:-35px;top:160px;width:170px;height:170px;border:1px solid #bbb6ab;border-radius:50%;box-shadow:0 0 0 17px #e9e5dc,0 0 0 18px #bbb6ab,0 0 0 35px #e9e5dc,0 0 0 36px #bbb6ab;opacity:.7;pointer-events:none}\r
.wrap .w.w-game.v-editorial .kicker{color:#7b756b}\r
.wrap .w.w-game.v-editorial .game-title{font-family:Georgia,serif;font-weight:900;font-size:clamp(26px,4.5vw,42px);letter-spacing:-.05em;color:#22211e}\r
.wrap .w.w-game.v-editorial .game-meta{color:#777167}\r
.wrap .w.w-game.v-editorial .ed-top{display:grid;grid-template-columns:110px 1fr;gap:22px;border-bottom:1px solid #bdb8ae;padding-bottom:19px}\r
.wrap .w.w-game.v-editorial .ed-head{min-width:0}\r
.wrap .w.w-game.v-editorial .ed-index{font-family:Georgia,serif;font-size:10px;color:#79746a;letter-spacing:.09em;line-height:1.6}\r
.wrap .w.w-game.v-editorial .ed-index b{display:block;font-size:21px;line-height:.9;color:#292722;margin-top:8px;letter-spacing:-.06em}\r
.wrap .w.w-game.v-editorial .ed-feature{padding:25px 0 18px;position:relative;z-index:1}\r
.wrap .w.w-game.v-editorial .ed-feature-label{font-size:9px;font-weight:900;letter-spacing:.18em;color:#8b5e00}\r
.wrap .w.w-game.v-editorial .ed-feature-main{display:flex;align-items:center;gap:14px;margin:6px 0}\r
.wrap .w.w-game.v-editorial .ed-feature-main>span{font-size:38px;line-height:1}\r
.wrap .w.w-game.v-editorial .ed-feature-main>b{font-family:Georgia,serif;font-size:clamp(24px,4.8vw,38px);letter-spacing:-.05em;color:#22211e}\r
.wrap .w.w-game.v-editorial .ed-feature-main>strong{font-size:clamp(42px,8vw,74px);letter-spacing:-.07em;color:#d78a00;margin-left:auto;line-height:.95}\r
.wrap .w.w-game.v-editorial .ed-feature-main small{font-size:.42em;letter-spacing:0}\r
.wrap .w.w-game.v-editorial .ed-feature-note{font-family:Georgia,serif;font-size:13px;line-height:1.45;color:#716c63;margin-left:53px}\r
.wrap .w.w-game.v-editorial .ed-rest{display:grid;grid-template-columns:1fr 1fr;gap:0 20px;border-top:1px solid #bdb8ae;padding-top:13px;position:relative;z-index:1}\r
.wrap .w.w-game.v-editorial .ed-row{display:grid;grid-template-columns:20px 64px 1fr 42px;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid #d0cbc1}\r
.wrap .w.w-game.v-editorial .ed-row>span{font-size:15px;line-height:1}\r
.wrap .w.w-game.v-editorial .ed-row b{font-family:Georgia,serif;font-size:11px;color:#22211e}\r
.wrap .w.w-game.v-editorial .ed-row i{height:4px;background:#cbc6bc;overflow:hidden;display:block;font-style:normal}\r
.wrap .w.w-game.v-editorial .ed-row em{display:block;height:100%;width:var(--v);background:var(--c)}\r
.wrap .w.w-game.v-editorial .ed-row strong{font-size:11px;text-align:right;color:#22211e;font-variant-numeric:tabular-nums}\r
.wrap .w.w-game.v-editorial .ed-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:18px;color:#8b857b;font-size:8px;font-weight:900;letter-spacing:.15em;position:relative;z-index:1}\r
.wrap .blk .w.w-game.v-editorial a.panax-link{background:#25231f;color:#fff;padding:10px 13px;font-family:Arial,sans-serif;letter-spacing:0;font-size:10px;border-radius:2px}\r
\r
/* 3. Staircase */\r
.wrap .w.w-game.v-staircase{padding:28px 30px;background:#ece8df;color:#20201e;border:1px solid #d7d2c8;border-radius:3px}\r
.wrap .w.w-game.v-staircase .kicker{color:#7b786f}\r
.wrap .w.w-game.v-staircase .game-title{font-family:Georgia,serif;font-size:clamp(26px,4.5vw,42px);letter-spacing:-.05em;color:#20201e}\r
.wrap .w.w-game.v-staircase .game-meta{color:#77736a}\r
.wrap .w.w-game.v-staircase .stairs-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}\r
.wrap .w.w-game.v-staircase .stairs-number{font-family:Georgia,serif;font-size:38px;line-height:.8;text-align:right;color:#20201e}\r
.wrap .w.w-game.v-staircase .stairs-number span{display:block;font-family:Arial,sans-serif;font-size:8px;letter-spacing:.2em;color:#888;margin-top:8px}\r
.wrap .w.w-game.v-staircase .stairs-chart{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;align-items:end;height:190px;padding-top:24px;margin-top:18px;border-bottom:1px solid #bcb8ae}\r
.wrap .w.w-game.v-staircase .step{height:100%;display:flex;flex-direction:column;justify-content:flex-end;position:relative;min-width:0}\r
.wrap .w.w-game.v-staircase .step-cap{display:flex;flex-direction:column;align-items:center;margin-bottom:7px;gap:3px}\r
.wrap .w.w-game.v-staircase .step-cap span{font-size:19px;line-height:1}\r
.wrap .w.w-game.v-staircase .step-cap b{font-size:11px;color:#20201e;font-variant-numeric:tabular-nums}\r
.wrap .w.w-game.v-staircase .step-fill{height:var(--v);min-height:4px;max-height:calc(100% - 66px);background:var(--c);border-radius:4px 4px 0 0;opacity:.93}\r
.wrap .w.w-game.v-staircase .step label{font-size:9px;font-weight:800;text-align:center;padding:8px 0 10px;background:color-mix(in srgb,var(--c),white 75%);border-bottom:3px solid var(--c);color:#20201e;margin:0}\r
.wrap .w.w-game.v-staircase .stairs-foot{display:flex;justify-content:space-between;align-items:center;margin-top:17px;color:#8a857b;font-size:8px;letter-spacing:.16em;font-weight:900}\r
.wrap .blk .w.w-game.v-staircase a.panax-link{background:#21211f;color:#fff;padding:10px 13px;border-radius:2px;font-family:Arial,sans-serif;letter-spacing:0;font-size:10px}\r
\r
/* 4. Type */\r
.wrap .w.w-game.v-type{padding:28px 32px;background:#faf9f5;color:#191919;border:1px solid #dedbd3;border-radius:0}\r
.wrap .w.w-game.v-type .type-meta{display:flex;justify-content:space-between;font-size:8px;letter-spacing:.16em;font-weight:900;color:#777}\r
.wrap .w.w-game.v-type .type-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;padding:22px 0 19px;border-bottom:7px solid #171717}\r
.wrap .w.w-game.v-type .game-title{font-family:Impact,"Arial Narrow",sans-serif;font-size:clamp(44px,8.5vw,88px);line-height:.8;letter-spacing:-.04em;margin:0;color:#191919}\r
.wrap .w.w-game.v-type .game-title i{font-style:normal;color:#999}\r
.wrap .w.w-game.v-type .type-aside{font-family:Georgia,serif;font-size:11px;line-height:1.4;text-align:right;font-weight:700;color:#191919;flex-shrink:0}\r
.wrap .w.w-game.v-type .type-aside span{display:block;font-family:Arial,sans-serif;color:#888;font-size:8px;margin-top:8px;letter-spacing:.16em}\r
.wrap .w.w-game.v-type .type-rule{display:flex;justify-content:space-between;font-size:8px;font-weight:900;letter-spacing:.15em;color:#777;margin:16px 0 6px}\r
.wrap .w.w-game.v-type .type-row{display:grid;grid-template-columns:32px 90px 1fr 75px;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #dedbd3}\r
.wrap .w.w-game.v-type .type-symbol{font-size:20px;line-height:1}\r
.wrap .w.w-game.v-type .type-row>b{font-family:Georgia,serif;font-size:14px;color:#191919}\r
.wrap .w.w-game.v-type .type-track{height:8px;background:#e9e7e1}\r
.wrap .w.w-game.v-type .type-track i{display:block;height:100%;width:var(--v);background:var(--c);font-style:normal}\r
.wrap .w.w-game.v-type .type-row strong{text-align:right;font-size:22px;letter-spacing:-.05em;color:#191919;font-variant-numeric:tabular-nums}\r
.wrap .w.w-game.v-type .type-row small{font-size:10px}\r
.wrap .w.w-game.v-type .type-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:16px;color:#888;font-size:8px;font-weight:900;letter-spacing:.13em}\r
.wrap .blk .w.w-game.v-type a.panax-link{background:#171717;color:#fff;padding:11px 14px;font-size:10px;letter-spacing:0}\r
\r
/* 5. Brutal (#w8) */\r
.wrap .w.w-game.v-brutal{display:grid;grid-template-columns:1fr 1fr;gap:0;background:#fff;color:#000;border:4px solid #000;border-radius:0;padding:0;overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif}\r
.wrap .w.w-game.v-brutal .br-left{padding:20px;border-right:2px solid #000;display:flex;flex-direction:column;justify-content:space-between;gap:16px;background:#fff;min-width:0}\r
.wrap .w.w-game.v-brutal .br-top{display:flex;gap:16px;align-items:flex-start}\r
.wrap .w.w-game.v-brutal .br-top>div{min-width:0}\r
.wrap .w.w-game.v-brutal .br-poster{width:64px;aspect-ratio:3/4;border:2px solid #000;flex-shrink:0;overflow:hidden;background:#141816}\r
.wrap .w.w-game.v-brutal .br-poster img{width:100%;height:100%;object-fit:cover;display:block}\r
.wrap .w.w-game.v-brutal .br-dev{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:10px;font-weight:700;text-transform:uppercase;color:#737373;line-height:1.3}\r
.wrap .w.w-game.v-brutal .br-title{font-size:24px;font-weight:800;text-transform:uppercase;letter-spacing:-.04em;line-height:1.02;margin:4px 0 0;color:#000}\r
.wrap .w.w-game.v-brutal .br-bottom{display:flex;align-items:flex-end;justify-content:space-between;border-top:2px solid #000;padding-top:12px;gap:10px}\r
.wrap .w.w-game.v-brutal .br-dom-lbl{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:10px;font-weight:700;text-transform:uppercase;color:#737373}\r
.wrap .w.w-game.v-brutal .br-leader{font-size:26px;font-weight:800;text-transform:uppercase;color:#ea580c;line-height:1.05;letter-spacing:-.03em}\r
.wrap .blk .w.w-game.v-brutal a.br-link{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;font-weight:800;text-transform:uppercase;color:#000;text-decoration:underline;text-underline-offset:4px;white-space:nowrap}\r
.wrap .blk .w.w-game.v-brutal a.br-link:hover{color:#ea580c}\r
.wrap .w.w-game.v-brutal .br-table{padding:20px;background:#f5f5f5;display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;align-content:center;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px}\r
.wrap .w.w-game.v-brutal .br-cell{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #d4d4d4;padding-bottom:4px;gap:6px}\r
.wrap .w.w-game.v-brutal .br-cname{font-weight:700;color:#404040}\r
.wrap .w.w-game.v-brutal .br-cval{font-weight:800;color:#000;font-variant-numeric:tabular-nums}\r
\r
@media(max-width:600px){\r
  .wrap .w.w-game.v-duet{padding:18px}\r
  .wrap .w.w-game.v-duet .duet-cover{width:73px;height:94px;flex:0 0 73px}\r
  .wrap .w.w-game.v-duet .duet-pair{gap:8px}\r
  .wrap .w.w-game.v-duet .duet-choice{gap:5px}\r
  .wrap .w.w-game.v-duet .duet-choice .badge{width:44px;height:44px}\r
  .wrap .w.w-game.v-duet .duet-choice b{font-size:14px}\r
  .wrap .w.w-game.v-duet .duet-choice strong{font-size:20px}\r
  .wrap .w.w-game.v-duet .duet-foot>span{display:none}\r
  .wrap .w.w-game.v-editorial{padding:20px}\r
  .wrap .w.w-game.v-editorial .ed-top{grid-template-columns:70px 1fr;gap:12px}\r
  .wrap .w.w-game.v-editorial .ed-index b{font-size:16px}\r
  .wrap .w.w-game.v-editorial .ed-rest{grid-template-columns:1fr}\r
  .wrap .w.w-game.v-editorial .ed-feature-main{gap:8px}\r
  .wrap .w.w-game.v-editorial .ed-feature-note{margin-left:0}\r
  .wrap .w.w-game.v-editorial .ed-foot{align-items:flex-start;flex-direction:column}\r
  .wrap .w.w-game.v-staircase{padding:20px}\r
  .wrap .w.w-game.v-staircase .stairs-chart{height:160px;gap:4px}\r
  .wrap .w.w-game.v-staircase .step label{font-size:8px}\r
  .wrap .w.w-game.v-staircase .step-cap span{font-size:15px}\r
  .wrap .w.w-game.v-staircase .step-cap b{font-size:10px}\r
  .wrap .w.w-game.v-staircase .stairs-foot{align-items:flex-start;flex-direction:column;gap:10px}\r
  .wrap .w.w-game.v-type{padding:20px}\r
  .wrap .w.w-game.v-type .type-hero{gap:10px}\r
  .wrap .w.w-game.v-type .game-title{font-size:48px}\r
  .wrap .w.w-game.v-type .type-aside{font-size:9px}\r
  .wrap .w.w-game.v-type .type-row{grid-template-columns:26px 67px 1fr 57px;gap:6px}\r
  .wrap .w.w-game.v-type .type-row>b{font-size:11px}\r
  .wrap .w.w-game.v-type .type-row strong{font-size:17px}\r
  .wrap .w.w-game.v-type .type-foot{align-items:flex-start;flex-direction:column}\r
  .wrap .w.w-game.v-type .type-meta{font-size:7px}\r
  .wrap .w.w-game.v-brutal{grid-template-columns:1fr}\r
  .wrap .w.w-game.v-brutal .br-left{border-right:none;border-bottom:2px solid #000}\r
}\r
`;

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\shared\gq-cards.css
  var gq_cards_default = `/* Base safe reset for extra GameQuill cards */\r
.w.w-game[class*="v-"] img{max-width:100%}\r
.w.w-game[class*="v-"] a{text-decoration:none}\r
.w.w-game.kimi-scope,.w.w-game.qwen1-scope,.w.w-game.qwen2-scope{border:0;border-radius:0;overflow:visible;background:transparent}\r
.w.w-game.tw-card,.w.w-game.tw-card *,.w.w-game.tw-card ::before,.w.w-game.tw-card ::after{\r
  box-sizing:border-box;\r
  border-width:0;\r
  border-style:solid;\r
  border-color:#27272a;\r
}\r
.w.w-game.tw-card p,.w.w-game.tw-card h1,.w.w-game.tw-card h2,.w.w-game.tw-card h3,.w.w-game.tw-card h4{margin:0}\r
.w.w-game.tw-card svg,.w.w-game.tw-card img{display:block}\r
\r
.w.w-game.v-glm-paper 500;600;800&display=swap');\r
.gw01 {max-width:660px;width:100%;box-sizing:border-box;display:flex;gap:20px;background:#fbfaf8;border:1px solid #e8e4db;border-radius:18px;padding:20px;font-family:'Golos Text',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#24231f}\r
.w.w-game.v-glm-paper .gw01 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-paper .gw01-cover {width:176px;height:236px;object-fit:cover;border-radius:12px;flex-shrink:0;display:block}\r
.w.w-game.v-glm-paper .gw01-body {flex:1 1 220px;min-width:200px;display:flex;flex-direction:column}\r
.w.w-game.v-glm-paper .gw01-top {display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#a19b8d}\r
.w.w-game.v-glm-paper .gw01-top em {font-style:normal;color:#b3873e;font-weight:800}\r
.w.w-game.v-glm-paper .gw01-title {margin:10px 0 5px;font-size:30px;line-height:1.05;font-weight:800;letter-spacing:-.02em;color:#24231f}\r
.w.w-game.v-glm-paper .gw01-meta {font-size:13px;color:#8f8a7c}\r
.w.w-game.v-glm-paper .gw01-genres {display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}\r
.w.w-game.v-glm-paper .gw01-genres span {border:1px solid #e5dfd2;background:#fff;border-radius:999px;padding:5px 11px;font-size:12px;color:#6f6a5d;font-weight:500}\r
.w.w-game.v-glm-paper .gw01-stats {display:flex;gap:22px;margin-top:16px;padding-top:14px;border-top:1px solid #ece7dc}\r
.w.w-game.v-glm-paper .gw01-stats b {font-size:22px;font-weight:800;letter-spacing:-.01em;color:#24231f}\r
.w.w-game.v-glm-paper .gw01-stats b i {font-style:normal;font-size:13px;font-weight:700;color:#a19b8d;margin-left:1px}\r
.w.w-game.v-glm-paper .gw01-stats span {display:block;margin-top:3px;font-size:10px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:#a19b8d}\r
.w.w-game.v-glm-paper .gw01-btns {display:flex;gap:8px;margin-top:16px}\r
.w.w-game.v-glm-paper .gw01-btns a {flex:1;text-align:center;padding:10px 0;border:1px solid #dcd5c5;background:#fff;border-radius:10px;font-size:13px;font-weight:600;color:#47433a;text-decoration:none;transition:border-color .15s}\r
.w.w-game.v-glm-paper .gw01-btns a:hover {border-color:#b3873e}\r
.w.w-game.v-glm-paper .gw01-btns a i {font-style:normal;color:#b3873e;margin-left:4px}\r
@media (max-width:560px) {\r
.w.w-game.v-glm-paper .gw01 {flex-direction:column}\r
.w.w-game.v-glm-paper .gw01-cover {width:100%;height:260px}\r
}\r
.w.w-game.v-glm-dark 500;600;800&display=swap');\r
.gw02 {max-width:660px;width:100%;box-sizing:border-box;display:flex;gap:22px;background:#15151b;border:1px solid #262633;border-radius:20px;padding:22px;font-family:'Golos Text',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#eceae2}\r
.w.w-game.v-glm-dark .gw02 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-dark .gw02-cover {width:188px;height:252px;object-fit:cover;border-radius:14px;flex-shrink:0;display:block;border:1px solid #262633}\r
.w.w-game.v-glm-dark .gw02-body {flex:1 1 220px;min-width:200px;display:flex;flex-direction:column}\r
.w.w-game.v-glm-dark .gw02-top {display:flex;align-items:center;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#83818f}\r
.w.w-game.v-glm-dark .gw02-top i {width:8px;height:8px;background:#e0b154;border-radius:2px;display:inline-block;margin-right:10px;flex-shrink:0}\r
.w.w-game.v-glm-dark .gw02-top em {font-style:normal;color:#e0b154;margin-left:6px}\r
.w.w-game.v-glm-dark .gw02-title {margin:12px 0 4px;font-size:30px;font-weight:800;letter-spacing:-.01em;color:#f7f5ee}\r
.w.w-game.v-glm-dark .gw02-meta {font-size:13px;color:#95939f}\r
.w.w-game.v-glm-dark .gw02-genres {margin-top:10px;font-size:13px;color:#b9b7c1}\r
.w.w-game.v-glm-dark .gw02-stats {display:flex;gap:22px;margin-top:18px;padding-top:16px;border-top:1px solid #23232c}\r
.w.w-game.v-glm-dark .gw02-stats b {font-size:24px;font-weight:800;color:#f7f5ee}\r
.w.w-game.v-glm-dark .gw02-stats b i {font-style:normal;font-size:13px;font-weight:600;color:#83818f;margin-left:1px}\r
.w.w-game.v-glm-dark .gw02-stats span {display:block;margin-top:4px;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#83818f}\r
.w.w-game.v-glm-dark .gw02-btns {display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}\r
.w.w-game.v-glm-dark .gw02-btns a {padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none}\r
.w.w-game.v-glm-dark .gw02-btns .p {background:#e0b154;color:#171610}\r
.w.w-game.v-glm-dark .gw02-btns .s {border:1px solid #34343f;color:#d4d2da;transition:border-color .15s}\r
.w.w-game.v-glm-dark .gw02-btns .s:hover {border-color:#e0b154}\r
@media (max-width:560px) {\r
.w.w-game.v-glm-dark .gw02 {flex-direction:column}\r
.w.w-game.v-glm-dark .gw02-cover {width:100%;height:260px}\r
}\r
.w.w-game.v-glm-swiss 700&family=IBM+Plex+Mono:wght@400;600&display=swap');\r
.gw03 {max-width:660px;width:100%;box-sizing:border-box;background:#fff;border:2px solid #111;box-shadow:10px 10px 0 #111;font-family:'Oswald',Arial,sans-serif;color:#111}\r
.w.w-game.v-glm-swiss .gw03 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-swiss .gw03-bar {display:flex;justify-content:space-between;align-items:center;background:#111;color:#fff;padding:9px 14px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase}\r
.w.w-game.v-glm-swiss .gw03-bar .no {display:flex;align-items:center;gap:8px}\r
.w.w-game.v-glm-swiss .gw03-bar .no i {width:8px;height:8px;background:#c7331f;display:inline-block}\r
.w.w-game.v-glm-swiss .gw03-main {display:flex;border-bottom:2px solid #111}\r
.w.w-game.v-glm-swiss .gw03-covwrap {width:208px;flex-shrink:0;border-right:2px solid #111;padding:16px}\r
.w.w-game.v-glm-swiss .gw03-covwrap img {width:100%;height:242px;object-fit:cover;display:block;border:2px solid #111;filter:grayscale(1) contrast(1.08)}\r
.w.w-game.v-glm-swiss .gw03-covcap {font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#777;margin-top:8px}\r
.w.w-game.v-glm-swiss .gw03-info {flex:1;padding:18px 20px;min-width:0}\r
.w.w-game.v-glm-swiss .gw03-kicker {font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#b3873e;margin-bottom:8px}\r
.w.w-game.v-glm-swiss .gw03-title {font-size:44px;font-weight:700;line-height:.95;text-transform:uppercase}\r
.w.w-game.v-glm-swiss .gw03-meta {font-family:'IBM Plex Mono',monospace;font-size:10px;color:#555;margin-top:10px}\r
.w.w-game.v-glm-swiss .gw03-genres {margin-top:14px;display:flex;flex-wrap:wrap;gap:6px}\r
.w.w-game.v-glm-swiss .gw03-genres span {border:1.5px solid #111;padding:4px 10px;font-family:'IBM Plex Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:.06em}\r
.w.w-game.v-glm-swiss .gw03-plat {font-family:'IBM Plex Mono',monospace;font-size:9px;color:#777;text-transform:uppercase;letter-spacing:.08em;margin-top:14px}\r
.w.w-game.v-glm-swiss .gw03-scores {display:flex;border-bottom:2px solid #111}\r
.w.w-game.v-glm-swiss .gw03-scores div {flex:1;padding:12px 16px;border-right:2px solid #111}\r
.w.w-game.v-glm-swiss .gw03-scores div:last-child {border-right:none}\r
.w.w-game.v-glm-swiss .gw03-scores b {font-size:28px;font-weight:700}\r
.w.w-game.v-glm-swiss .gw03-scores b i {font-style:normal;font-size:14px;color:#777}\r
.w.w-game.v-glm-swiss .gw03-scores span {display:block;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#777;margin-top:2px}\r
.w.w-game.v-glm-swiss .gw03-foot {display:flex}\r
.w.w-game.v-glm-swiss .gw03-foot a {flex:1;text-align:center;padding:13px 0;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;text-decoration:none}\r
.w.w-game.v-glm-swiss .gw03-foot .f1 {background:#c7331f;color:#fff}\r
.w.w-game.v-glm-swiss .gw03-foot .f1:hover {background:#a8271a}\r
.w.w-game.v-glm-swiss .gw03-foot .f2, .w.w-game.v-glm-swiss .gw03-foot .f3 {color:#111}\r
.w.w-game.v-glm-swiss .gw03-foot .f2 {border-left:2px solid #111}\r
.w.w-game.v-glm-swiss .gw03-foot .f3 {border-left:2px solid #111}\r
.w.w-game.v-glm-swiss .gw03-foot .f2:hover, .w.w-game.v-glm-swiss .gw03-foot .f3:hover {background:#f0ede6}\r
@media (max-width:600px) {\r
.w.w-game.v-glm-swiss .gw03-main {flex-direction:column}\r
.w.w-game.v-glm-swiss .gw03-covwrap {width:100%;border-right:none;border-bottom:2px solid #111}\r
}\r
.w.w-game.v-glm-editorial 0, .w.w-game.v-glm-editorial 800;1, .w.w-game.v-glm-editorial 500;1, .w.w-game.v-glm-editorial 700&family=Golos+Text:wght@400;500;600&display=swap');\r
.gw05 {position:relative;max-width:660px;width:100%;min-height:430px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;background:#0d0c0a;color:#f3efe6;font-family:'Golos Text',system-ui,sans-serif;overflow:hidden;padding:22px}\r
.w.w-game.v-glm-editorial .gw05 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-editorial .gw05-bg {position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 28%;filter:grayscale(.25) contrast(1.05) brightness(.9)}\r
.w.w-game.v-glm-editorial .gw05-shade {position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,12,10,.52) 0%,rgba(13,12,10,.18) 42%,rgba(13,12,10,.94) 100%)}\r
.w.w-game.v-glm-editorial .gw05-top, .w.w-game.v-glm-editorial .gw05-bottom {position:relative;z-index:1}\r
.w.w-game.v-glm-editorial .gw05-top {display:flex;justify-content:space-between;align-items:flex-start}\r
.w.w-game.v-glm-editorial .gw05-lbl {font-size:10px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#e8e2d2;border-left:3px solid #e0b154;padding-left:10px}\r
.w.w-game.v-glm-editorial .gw05-score {width:66px;height:66px;border:1.5px solid #e0b154;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(13,12,10,.55);backdrop-filter:blur(4px)}\r
.w.w-game.v-glm-editorial .gw05-score b {font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:800;color:#e0b154;line-height:1}\r
.w.w-game.v-glm-editorial .gw05-score span {font-size:8px;letter-spacing:.16em;color:#cfc8b8;margin-top:3px}\r
.w.w-game.v-glm-editorial .gw05-title {font-family:'Playfair Display',Georgia,serif;font-size:46px;font-weight:800;line-height:1.02;letter-spacing:.01em}\r
.w.w-game.v-glm-editorial .gw05-meta {margin-top:8px;font-size:11px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:#cfc8b8}\r
.w.w-game.v-glm-editorial .gw05-genres {margin-top:6px;font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:15px;color:#e8e2d2}\r
.w.w-game.v-glm-editorial .gw05-quote {margin-top:10px;font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:18px;color:#f3efe6;max-width:520px}\r
.w.w-game.v-glm-editorial .gw05-btns {display:flex;flex-wrap:wrap;gap:20px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(243,239,230,.28)}\r
.w.w-game.v-glm-editorial .gw05-btns a {color:#f3efe6;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;display:inline-flex;align-items:center;gap:5px}\r
.w.w-game.v-glm-editorial .gw05-btns a:hover {text-decoration:underline;text-underline-offset:4px}\r
.w.w-game.v-glm-editorial .gw05-btns a i {font-style:normal;color:#e0b154}\r
.w.w-game.v-glm-vertical 500;600;800&display=swap');\r
.gw06 {position:relative;width:340px;max-width:100%;box-sizing:border-box;border-radius:18px;overflow:hidden;background:#0b0b0f;color:#f2f1f4;font-family:'Golos Text',system-ui,sans-serif;border:1px solid #23222b}\r
.w.w-game.v-glm-vertical .gw06 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-vertical .gw06-cover {width:100%;height:360px;object-fit:cover;display:block;object-position:center 25%}\r
.w.w-game.v-glm-vertical .gw06-shade {position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,11,15,.14) 0%,rgba(11,11,15,0) 34%,rgba(11,11,15,.78) 66%,rgba(11,11,15,.98) 100%)}\r
.w.w-game.v-glm-vertical .gw06-chip {position:absolute;top:14px;left:14px;background:rgba(11,11,15,.6);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.18);font-size:9px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;padding:6px 11px;border-radius:999px;color:#ecebee}\r
.w.w-game.v-glm-vertical .gw06-badge {position:absolute;top:14px;right:14px;width:58px;height:58px;background:#e3b357;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#191712;box-shadow:0 4px 14px rgba(0,0,0,.35)}\r
.w.w-game.v-glm-vertical .gw06-badge b {font-size:19px;font-weight:800;line-height:1}\r
.w.w-game.v-glm-vertical .gw06-badge span {font-size:7px;font-weight:700;letter-spacing:.08em;margin-top:2px}\r
.w.w-game.v-glm-vertical .gw06-body {position:absolute;left:0;right:0;bottom:0;padding:18px}\r
.w.w-game.v-glm-vertical .gw06-title {font-size:26px;font-weight:800;letter-spacing:.02em;text-transform:uppercase}\r
.w.w-game.v-glm-vertical .gw06-meta {font-size:12px;color:#b9b7c4;margin-top:4px}\r
.w.w-game.v-glm-vertical .gw06-genres {display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}\r
.w.w-game.v-glm-vertical .gw06-genres span {padding:5px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.09);backdrop-filter:blur(6px);font-size:11px;font-weight:500;color:#ecebee}\r
.w.w-game.v-glm-vertical .gw06-btns {display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:15px}\r
.w.w-game.v-glm-vertical .gw06-btns a {display:block;text-align:center;padding:10px 0;border-radius:10px;font-size:12px;font-weight:700;text-decoration:none}\r
.w.w-game.v-glm-vertical .gw06-btns .p {background:#e3b357;color:#17161c}\r
.w.w-game.v-glm-vertical .gw06-btns .s {background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);color:#f2f1f4;backdrop-filter:blur(6px)}\r
.w.w-game.v-glm-crt 700&display=swap');\r
.gw08 {max-width:640px;width:100%;box-sizing:border-box;background:#050906;border:1px solid #1d4b23;border-radius:10px;padding:18px 20px;color:#6fe37a;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.6;position:relative;overflow:hidden;box-shadow:inset 0 0 40px rgba(30,120,50,.14), 0 0 24px rgba(46,160,70,.1);text-shadow:0 0 8px rgba(90,240,110,.3)}\r
.w.w-game.v-glm-crt .gw08 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-crt .gw08::after {content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.24) 0 1px,transparent 1px 3px);pointer-events:none}\r
.w.w-game.v-glm-crt .gw08-top {display:flex;justify-content:space-between;color:#3f9e4d;font-size:10px;letter-spacing:.1em;margin-bottom:10px}\r
.w.w-game.v-glm-crt .gw08-prompt {color:#b9ffbd}\r
.w.w-game.v-glm-crt .gw08-prompt b {color:#3f9e4d;font-weight:400}\r
.w.w-game.v-glm-crt .gw08-div {border:none;border-top:1px dashed #1d4b23;margin:10px 0}\r
.w.w-game.v-glm-crt .gw08-title {font-size:26px;font-weight:700;color:#c8ffc9;letter-spacing:.08em;text-shadow:0 0 14px rgba(120,255,130,.45);display:flex;align-items:center}\r
.w.w-game.v-glm-crt .gw08-cursor {display:inline-block;width:9px;height:18px;background:#6fe37a;margin-left:10px;animation:gw08blink 1.2s steps(1) infinite}\r
@keyframes gw08blink {\r
50%{opacity:0}\r
}\r
.w.w-game.v-glm-crt .gw08-rows {margin-top:12px}\r
.w.w-game.v-glm-crt .gw08-row {display:flex;gap:10px;align-items:baseline}\r
.w.w-game.v-glm-crt .gw08-row span {color:#3f9e4d;letter-spacing:.08em;font-size:11px}\r
.w.w-game.v-glm-crt .gw08-row i {flex:1;border-bottom:1px dotted #1d4b23;transform:translateY(-3px)}\r
.w.w-game.v-glm-crt .gw08-row b {font-weight:400;color:#a5e9ab}\r
.w.w-game.v-glm-crt .gw08-bars {margin-top:14px}\r
.w.w-game.v-glm-crt .gw08-bar-row {display:flex;align-items:center;gap:10px;margin-top:6px}\r
.w.w-game.v-glm-crt .gw08-bar-row span {width:110px;color:#3f9e4d;font-size:11px;letter-spacing:.06em}\r
.w.w-game.v-glm-crt .gw08-bar-row .bar {flex:1;height:9px;border:1px solid #2e6b37;position:relative;background:rgba(20,60,30,.25)}\r
.w.w-game.v-glm-crt .gw08-bar-row .bar b {position:absolute;top:0;left:0;bottom:0;background:#39b34c;box-shadow:0 0 10px rgba(80,220,110,.5)}\r
.w.w-game.v-glm-crt .gw08-bar-row em {font-style:normal;width:64px;text-align:right;color:#c8ffc9;font-size:11px}\r
.w.w-game.v-glm-crt .gw08-btns {display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}\r
.w.w-game.v-glm-crt .gw08-btns a {color:#6fe37a;border:1px solid #2e6b37;padding:7px 12px;text-decoration:none;font-size:11px;letter-spacing:.08em;position:relative;z-index:1}\r
.w.w-game.v-glm-crt .gw08-btns a:hover {background:#39b34c;color:#050906;text-shadow:none}\r
.w.w-game.v-glm-snes 700&family=IBM+Plex+Mono:wght@400;600&display=swap');\r
.gw09 {width:420px;max-width:100%;box-sizing:border-box;background:#d8d4c6;border:1px solid #b7b3a5;border-radius:10px 10px 14px 14px;padding:12px;font-family:'Oswald',Arial,sans-serif;color:#22201b;box-shadow:inset 0 2px 0 #eceade, inset 0 -3px 0 #b4b0a2, 8px 10px 0 rgba(0,0,0,.13)}\r
.w.w-game.v-glm-snes .gw09 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-snes .gw09-ridges {height:10px;background:repeating-linear-gradient(90deg,#c5c1b3 0 6px,#d8d4c6 6px 12px);border:1px solid #b7b3a5;border-radius:2px;margin-bottom:10px}\r
.w.w-game.v-glm-snes .gw09-label {background:#f2ecdb;border:2px solid #22201b;border-radius:4px;overflow:hidden}\r
.w.w-game.v-glm-snes .gw09-band {display:flex;justify-content:space-between;align-items:center;background:#2c3868;color:#f2ecdb;padding:7px 12px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase}\r
.w.w-game.v-glm-snes .gw09-band em {font-style:normal;background:#c7331f;padding:2px 7px;color:#fff;letter-spacing:.1em}\r
.w.w-game.v-glm-snes .gw09-stripe {height:6px;background:#c7331f;border-top:1px solid #22201b;border-bottom:1px solid #22201b}\r
.w.w-game.v-glm-snes .gw09-body {display:flex;gap:12px;padding:12px}\r
.w.w-game.v-glm-snes .gw09-cov {width:132px;height:172px;flex-shrink:0;border:2px solid #22201b;overflow:hidden;background:#22201b}\r
.w.w-game.v-glm-snes .gw09-cov img {width:100%;height:100%;object-fit:cover;display:block;filter:contrast(1.03) saturate(1.05)}\r
.w.w-game.v-glm-snes .gw09-info {min-width:0;flex:1}\r
.w.w-game.v-glm-snes .gw09-name {font-size:26px;font-weight:700;text-transform:uppercase;line-height:.98}\r
.w.w-game.v-glm-snes .gw09-meta {font-family:'IBM Plex Mono',monospace;font-size:9px;color:#55503f;margin-top:7px;letter-spacing:.02em}\r
.w.w-game.v-glm-snes .gw09-genres {font-size:13px;font-weight:500;color:#3d3a30;line-height:1.5;margin-top:8px}\r
.w.w-game.v-glm-snes .gw09-tags {display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}\r
.w.w-game.v-glm-snes .gw09-tags span {font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;padding:4px 8px;border:1.5px solid #22201b;color:#22201b}\r
.w.w-game.v-glm-snes .gw09-tags .t1 {background:#f7d774}\r
.w.w-game.v-glm-snes .gw09-tags .t2 {background:#a8c6f0}\r
.w.w-game.v-glm-snes .gw09-tags .t3 {background:#f2a49c}\r
.w.w-game.v-glm-snes .gw09-btns {display:flex;gap:8px;margin-top:12px;padding:0 12px 12px}\r
.w.w-game.v-glm-snes .gw09-btns a {flex:1;text-align:center;padding:9px 0;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;border:2px solid #22201b;background:#f2ecdb;color:#22201b;box-shadow:3px 3px 0 #22201b}\r
.w.w-game.v-glm-snes .gw09-btns a:hover {transform:translate(1px,1px);box-shadow:2px 2px 0 #22201b}\r
.w.w-game.v-glm-snes .gw09-btns .f1 {background:#c7331f;color:#fff}\r
.w.w-game.v-glm-snes .gw09-serial {font-family:'IBM Plex Mono',monospace;font-size:8px;color:#8a8577;text-align:center;letter-spacing:.22em;text-transform:uppercase;margin-top:9px}\r
.w.w-game.v-glm-pixel .gw10 {width:600px;max-width:100%;box-sizing:border-box;position:relative;background:#0f132b;color:#e8eaf6;font-family:'Press Start 2P','Courier New',monospace;border:4px solid #3a4170;box-shadow:0 0 0 4px #090b1c, 10px 10px 0 rgba(0,0,0,.4);padding:18px}\r
.w.w-game.v-glm-pixel .gw10 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-pixel .gw10::before {content:'';position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(1px 1px at 12% 20%,rgba(255,255,255,.55) 50%,transparent 51%),radial-gradient(1px 1px at 78% 10%,rgba(255,255,255,.4) 50%,transparent 51%),radial-gradient(2px 2px at 62% 82%,rgba(255,210,63,.3) 50%,transparent 51%),radial-gradient(1px 1px at 30% 72%,rgba(255,255,255,.35) 50%,transparent 51%),radial-gradient(1.5px 1.5px at 90% 52%,rgba(255,255,255,.45) 50%,transparent 51%),radial-gradient(1px 1px at 45% 38%,rgba(255,255,255,.3) 50%,transparent 51%)}\r
.w.w-game.v-glm-pixel .gw10-top {display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;position:relative}\r
.w.w-game.v-glm-pixel .gw10-lbl {font-size:8px;color:#ffd23f;letter-spacing:.12em;display:flex;align-items:center;gap:8px}\r
.w.w-game.v-glm-pixel .gw10-lbl i {width:8px;height:8px;background:#ffd23f;display:inline-block}\r
.w.w-game.v-glm-pixel .gw10-hi {background:#ffd23f;color:#12152e;font-size:7px;padding:5px 7px;box-shadow:2px 2px 0 #000}\r
.w.w-game.v-glm-pixel .gw10-body {display:flex;gap:16px;position:relative}\r
.w.w-game.v-glm-pixel .gw10-cov {width:150px;height:198px;flex-shrink:0;border:3px solid #ffd23f;box-shadow:4px 4px 0 #000;overflow:hidden}\r
.w.w-game.v-glm-pixel .gw10-cov img {width:100%;height:100%;object-fit:cover}\r
.w.w-game.v-glm-pixel .gw10-info {min-width:0;flex:1}\r
.w.w-game.v-glm-pixel .gw10-name {font-size:13px;color:#ffd23f;line-height:1.5;text-shadow:2px 2px 0 #000}\r
.w.w-game.v-glm-pixel .gw10-meta {font-size:7px;color:#9aa0c8;line-height:1.9;margin-top:8px}\r
.w.w-game.v-glm-pixel .gw10-gen {font-size:7px;color:#c7cbef;line-height:1.9;margin-top:4px}\r
.w.w-game.v-glm-pixel .gw10-stats {margin-top:10px}\r
.w.w-game.v-glm-pixel .gw10-stats div {display:flex;justify-content:space-between;align-items:center;background:#181d3f;border:2px solid #3a4170;padding:6px 9px;margin-top:5px;font-size:7px}\r
.w.w-game.v-glm-pixel .gw10-stats span {color:#9aa0c8}\r
.w.w-game.v-glm-pixel .gw10-stats b {color:#fff;font-weight:400}\r
.w.w-game.v-glm-pixel .gw10-btns {display:flex;gap:10px;margin-top:16px;position:relative}\r
.w.w-game.v-glm-pixel .gw10-btns a {flex:1;text-align:center;font-size:8px;padding:10px 2px;text-decoration:none;box-shadow:3px 3px 0 #000}\r
.w.w-game.v-glm-pixel .gw10-btns .p {background:#ffd23f;color:#12152e}\r
.w.w-game.v-glm-pixel .gw10-btns .s {background:#181d3f;color:#e8eaf6;border:2px solid #3a4170}\r
.w.w-game.v-glm-pixel .gw10-hint {margin-top:14px;text-align:center;font-size:7px;color:#5a6090;letter-spacing:.14em;position:relative;animation:gw10blink 1.4s steps(1) infinite}\r
@keyframes gw10blink {\r
50%{opacity:.3}\r
}\r
@media (max-width:520px) {\r
.w.w-game.v-glm-pixel .gw10-body {flex-direction:column}\r
.w.w-game.v-glm-pixel .gw10-cov {width:100%;height:240px}\r
}\r
.w.w-game.v-glm-panax-paper 500;600;800&display=swap');\r
.pa01 {max-width:660px;width:100%;box-sizing:border-box;display:flex;gap:20px;background:#fbfaf8;border:1px solid #e8e4db;border-radius:18px;padding:20px;font-family:'Golos Text',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#24231f}\r
.w.w-game.v-glm-panax-paper .pa01 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-panax-paper .pa01-cover {width:176px;height:236px;object-fit:cover;border-radius:12px;flex-shrink:0;display:block}\r
.w.w-game.v-glm-panax-paper .pa01-body {flex:1 1 220px;min-width:200px;display:flex;flex-direction:column}\r
.w.w-game.v-glm-panax-paper .pa01-top {display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#a19b8d}\r
.w.w-game.v-glm-panax-paper .pa01-top em {font-style:normal;color:#d9a514;font-weight:800}\r
.w.w-game.v-glm-panax-paper .pa01-title {margin:10px 0 5px;font-size:30px;line-height:1.05;font-weight:800;letter-spacing:-.02em;color:#24231f}\r
.w.w-game.v-glm-panax-paper .pa01-meta {font-size:13px;color:#8f8a7c}\r
.w.w-game.v-glm-panax-paper .pa01-genres {display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}\r
.w.w-game.v-glm-panax-paper .pa01-genres span {border:1px solid #e5dfd2;background:#fff;border-radius:999px;padding:5px 11px;font-size:12px;color:#6f6a5d;font-weight:500}\r
.w.w-game.v-glm-panax-paper .pa01-hist {display:flex;gap:10px;margin-top:15px}\r
.w.w-game.v-glm-panax-paper .pa01-col {flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0}\r
.w.w-game.v-glm-panax-paper .pa01-track {width:100%;max-width:44px;height:50px;border-radius:999px;background:#efeade;position:relative;overflow:hidden}\r
.w.w-game.v-glm-panax-paper .pa01-track i {position:absolute;bottom:0;left:0;right:0;border-radius:0 0 999px 999px}\r
.w.w-game.v-glm-panax-paper .pa01-badge {width:22px;height:22px;border-radius:50%;background:#fff;border:1.5px solid #e5dfd2;display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1;font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif}\r
.w.w-game.v-glm-panax-paper .pa01-lbl {font-size:8px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:999px;color:#fff;white-space:nowrap}\r
.w.w-game.v-glm-panax-paper .pa01-val {font-size:10px;font-weight:600;color:#8f8a7c}\r
.w.w-game.v-glm-panax-paper .pa01 .f-gold {background:#f4cf3a}\r
.w.w-game.v-glm-panax-paper .pa01 .f-orange {background:#f5a41f}\r
.w.w-game.v-glm-panax-paper .pa01 .f-purple {background:#bd63f2}\r
.w.w-game.v-glm-panax-paper .pa01 .f-blue {background:#3f83f8}\r
.w.w-game.v-glm-panax-paper .pa01 .f-grey {background:#a8adb8}\r
.w.w-game.v-glm-panax-paper .pa01 .f-green {background:#33c455}\r
.w.w-game.v-glm-panax-paper .pa01 .t-gold {background:#d9a514}\r
.w.w-game.v-glm-panax-paper .pa01 .t-orange {background:#e08a10}\r
.w.w-game.v-glm-panax-paper .pa01 .t-purple {background:#9d4fd1}\r
.w.w-game.v-glm-panax-paper .pa01 .t-blue {background:#3672e8}\r
.w.w-game.v-glm-panax-paper .pa01 .t-grey {background:#8a8f99}\r
.w.w-game.v-glm-panax-paper .pa01 .t-green {background:#2aa04a}\r
.w.w-game.v-glm-panax-paper .pa01-verdict {display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:14px;padding-top:11px;border-top:1px solid #ece7dc;font-size:12px;color:#47433a}\r
.w.w-game.v-glm-panax-paper .pa01-verdict b {font-weight:800}\r
.w.w-game.v-glm-panax-paper .pa01-verdict .e {font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif}\r
.w.w-game.v-glm-panax-paper .pa01-verdict span {font-size:11px;color:#a19b8d;white-space:nowrap}\r
.w.w-game.v-glm-panax-paper .pa01-btns {display:flex;gap:8px;margin-top:14px}\r
.w.w-game.v-glm-panax-paper .pa01-btns a {flex:1;text-align:center;padding:10px 0;border:1px solid #dcd5c5;background:#fff;border-radius:10px;font-size:13px;font-weight:600;color:#47433a;text-decoration:none;transition:border-color .15s}\r
.w.w-game.v-glm-panax-paper .pa01-btns a.p {background:#d9a514;border-color:#d9a514;color:#fff}\r
.w.w-game.v-glm-panax-paper .pa01-btns a:hover {border-color:#d9a514}\r
@media (max-width:560px) {\r
.w.w-game.v-glm-panax-paper .pa01 {flex-direction:column}\r
.w.w-game.v-glm-panax-paper .pa01-cover {width:100%;height:260px}\r
}\r
.w.w-game.v-glm-panax-dark 500;600;800&display=swap');\r
.pa02 {max-width:660px;width:100%;box-sizing:border-box;display:flex;gap:22px;background:#15151b;border:1px solid #262633;border-radius:20px;padding:22px;font-family:'Golos Text',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#eceae2}\r
.w.w-game.v-glm-panax-dark .pa02 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-panax-dark .pa02-cover {width:188px;height:252px;object-fit:cover;border-radius:14px;flex-shrink:0;display:block;border:1px solid #262633}\r
.w.w-game.v-glm-panax-dark .pa02-body {flex:1 1 220px;min-width:200px;display:flex;flex-direction:column}\r
.w.w-game.v-glm-panax-dark .pa02-top {display:flex;align-items:center;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#83818f}\r
.w.w-game.v-glm-panax-dark .pa02-top i {width:8px;height:8px;background:#e0b154;border-radius:2px;display:inline-block;margin-right:10px;flex-shrink:0}\r
.w.w-game.v-glm-panax-dark .pa02-top em {font-style:normal;color:#e0b154;margin-left:6px}\r
.w.w-game.v-glm-panax-dark .pa02-title {margin:12px 0 4px;font-size:30px;font-weight:800;letter-spacing:-.01em;color:#f7f5ee}\r
.w.w-game.v-glm-panax-dark .pa02-meta {font-size:13px;color:#95939f}\r
.w.w-game.v-glm-panax-dark .pa02-genres {margin-top:10px;font-size:13px;color:#b9b7c1}\r
.w.w-game.v-glm-panax-dark .pa02-hist {display:flex;gap:10px;margin-top:16px}\r
.w.w-game.v-glm-panax-dark .pa02-col {flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0}\r
.w.w-game.v-glm-panax-dark .pa02-track {width:100%;max-width:44px;height:52px;border-radius:999px;background:#23232d;position:relative;overflow:hidden}\r
.w.w-game.v-glm-panax-dark .pa02-track i {position:absolute;bottom:0;left:0;right:0;border-radius:0 0 999px 999px}\r
.w.w-game.v-glm-panax-dark .pa02-badge {width:22px;height:22px;border-radius:50%;background:#1d1d25;border:1.5px solid #2e2e39;display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1;font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif}\r
.w.w-game.v-glm-panax-dark .pa02-lbl {font-size:8px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:999px;color:#fff;white-space:nowrap}\r
.w.w-game.v-glm-panax-dark .pa02-val {font-size:10px;font-weight:600;color:#95939f}\r
.w.w-game.v-glm-panax-dark .pa02 .f-gold {background:#f4cf3a}\r
.w.w-game.v-glm-panax-dark .pa02 .f-orange {background:#f5a41f}\r
.w.w-game.v-glm-panax-dark .pa02 .f-purple {background:#bd63f2}\r
.w.w-game.v-glm-panax-dark .pa02 .f-blue {background:#3f83f8}\r
.w.w-game.v-glm-panax-dark .pa02 .f-grey {background:#8a8f99}\r
.w.w-game.v-glm-panax-dark .pa02 .f-green {background:#33c455}\r
.w.w-game.v-glm-panax-dark .pa02 .t-gold {background:#d9a514}\r
.w.w-game.v-glm-panax-dark .pa02 .t-orange {background:#e08a10}\r
.w.w-game.v-glm-panax-dark .pa02 .t-purple {background:#9d4fd1}\r
.w.w-game.v-glm-panax-dark .pa02 .t-blue {background:#3672e8}\r
.w.w-game.v-glm-panax-dark .pa02 .t-grey {background:#6f7480}\r
.w.w-game.v-glm-panax-dark .pa02 .t-green {background:#2aa04a}\r
.w.w-game.v-glm-panax-dark .pa02-verdict {display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:15px;padding-top:12px;border-top:1px solid #23232c;font-size:12px;color:#d4d2da}\r
.w.w-game.v-glm-panax-dark .pa02-verdict b {font-weight:800;color:#f7f5ee}\r
.w.w-game.v-glm-panax-dark .pa02-verdict .e {font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif}\r
.w.w-game.v-glm-panax-dark .pa02-verdict span {font-size:11px;color:#7f7f8c;white-space:nowrap}\r
.w.w-game.v-glm-panax-dark .pa02-btns {display:flex;flex-wrap:wrap;gap:8px;margin-top:15px}\r
.w.w-game.v-glm-panax-dark .pa02-btns a {padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none}\r
.w.w-game.v-glm-panax-dark .pa02-btns .p {background:#e0b154;color:#171610}\r
.w.w-game.v-glm-panax-dark .pa02-btns .s {border:1px solid #34343f;color:#d4d2da;transition:border-color .15s}\r
.w.w-game.v-glm-panax-dark .pa02-btns .s:hover {border-color:#e0b154}\r
@media (max-width:560px) {\r
.w.w-game.v-glm-panax-dark .pa02 {flex-direction:column}\r
.w.w-game.v-glm-panax-dark .pa02-cover {width:100%;height:260px}\r
}\r
.w.w-game.v-glm-panax-swiss 700&family=IBM+Plex+Mono:wght@400;600&display=swap');\r
.pa03 {max-width:660px;width:100%;box-sizing:border-box;background:#fff;border:2px solid #111;box-shadow:10px 10px 0 #111;font-family:'Oswald',Arial,sans-serif;color:#111}\r
.w.w-game.v-glm-panax-swiss .pa03 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-panax-swiss .pa03-bar {display:flex;justify-content:space-between;align-items:center;background:#111;color:#fff;padding:9px 14px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase}\r
.w.w-game.v-glm-panax-swiss .pa03-bar .no {display:flex;align-items:center;gap:8px}\r
.w.w-game.v-glm-panax-swiss .pa03-bar .no i {width:8px;height:8px;background:#c7331f;display:inline-block}\r
.w.w-game.v-glm-panax-swiss .pa03-main {display:flex;border-bottom:2px solid #111}\r
.w.w-game.v-glm-panax-swiss .pa03-covwrap {width:208px;flex-shrink:0;border-right:2px solid #111;padding:16px}\r
.w.w-game.v-glm-panax-swiss .pa03-covwrap img {width:100%;height:242px;object-fit:cover;display:block;border:2px solid #111;filter:grayscale(1) contrast(1.08)}\r
.w.w-game.v-glm-panax-swiss .pa03-covcap {font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#777;margin-top:8px}\r
.w.w-game.v-glm-panax-swiss .pa03-info {flex:1;padding:18px 20px;min-width:0}\r
.w.w-game.v-glm-panax-swiss .pa03-kicker {font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#b3873e;margin-bottom:8px}\r
.w.w-game.v-glm-panax-swiss .pa03-title {font-size:44px;font-weight:700;line-height:.95;text-transform:uppercase}\r
.w.w-game.v-glm-panax-swiss .pa03-meta {font-family:'IBM Plex Mono',monospace;font-size:10px;color:#555;margin-top:10px}\r
.w.w-game.v-glm-panax-swiss .pa03-genres {margin-top:14px;display:flex;flex-wrap:wrap;gap:6px}\r
.w.w-game.v-glm-panax-swiss .pa03-genres span {border:1.5px solid #111;padding:4px 10px;font-family:'IBM Plex Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:.06em}\r
.w.w-game.v-glm-panax-swiss .pa03-plat {font-family:'IBM Plex Mono',monospace;font-size:9px;color:#777;text-transform:uppercase;letter-spacing:.08em;margin-top:14px}\r
.w.w-game.v-glm-panax-swiss .pa03-pollhead {display:flex;justify-content:space-between;align-items:center;padding:9px 16px;border-bottom:2px solid #111;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#111}\r
.w.w-game.v-glm-panax-swiss .pa03-pollhead b {color:#c7331f}\r
.w.w-game.v-glm-panax-swiss .pa03-hist {display:flex;border-bottom:2px solid #111}\r
.w.w-game.v-glm-panax-swiss .pa03-col {flex:1;padding:10px 8px 12px;border-right:2px solid #111;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}\r
.w.w-game.v-glm-panax-swiss .pa03-col:last-child {border-right:none}\r
.w.w-game.v-glm-panax-swiss .pa03-val {font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600}\r
.w.w-game.v-glm-panax-swiss .pa03-track {width:22px;height:46px;border:1.5px solid #111;border-radius:999px;background:#fff;position:relative;overflow:hidden}\r
.w.w-game.v-glm-panax-swiss .pa03-track i {position:absolute;bottom:0;left:0;right:0;border-radius:0 0 999px 999px}\r
.w.w-game.v-glm-panax-swiss .pa03-lbl {font-family:'IBM Plex Mono',monospace;font-size:7.5px;letter-spacing:.04em;text-transform:uppercase;padding:2px 6px;color:#fff;white-space:nowrap}\r
.w.w-game.v-glm-panax-swiss .pa03 .f-gold {background:#f4cf3a}\r
.w.w-game.v-glm-panax-swiss .pa03 .f-orange {background:#f5a41f}\r
.w.w-game.v-glm-panax-swiss .pa03 .f-purple {background:#bd63f2}\r
.w.w-game.v-glm-panax-swiss .pa03 .f-blue {background:#3f83f8}\r
.w.w-game.v-glm-panax-swiss .pa03 .f-grey {background:#a8adb8}\r
.w.w-game.v-glm-panax-swiss .pa03 .f-green {background:#33c455}\r
.w.w-game.v-glm-panax-swiss .pa03 .t-gold {background:#d9a514}\r
.w.w-game.v-glm-panax-swiss .pa03 .t-orange {background:#e08a10}\r
.w.w-game.v-glm-panax-swiss .pa03 .t-purple {background:#9d4fd1}\r
.w.w-game.v-glm-panax-swiss .pa03 .t-blue {background:#3672e8}\r
.w.w-game.v-glm-panax-swiss .pa03 .t-grey {background:#8a8f99}\r
.w.w-game.v-glm-panax-swiss .pa03 .t-green {background:#2aa04a}\r
.w.w-game.v-glm-panax-swiss .pa03-foot {display:flex}\r
.w.w-game.v-glm-panax-swiss .pa03-foot a {flex:1;text-align:center;padding:13px 0;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;text-decoration:none}\r
.w.w-game.v-glm-panax-swiss .pa03-foot .f1 {background:#c7331f;color:#fff}\r
.w.w-game.v-glm-panax-swiss .pa03-foot .f1:hover {background:#a8271a}\r
.w.w-game.v-glm-panax-swiss .pa03-foot .f2, .w.w-game.v-glm-panax-swiss .pa03-foot .f3 {color:#111}\r
.w.w-game.v-glm-panax-swiss .pa03-foot .f2 {border-left:2px solid #111}\r
.w.w-game.v-glm-panax-swiss .pa03-foot .f3 {border-left:2px solid #111}\r
.w.w-game.v-glm-panax-swiss .pa03-foot .f2:hover, .w.w-game.v-glm-panax-swiss .pa03-foot .f3:hover {background:#f0ede6}\r
@media (max-width:600px) {\r
.w.w-game.v-glm-panax-swiss .pa03-main {flex-direction:column}\r
.w.w-game.v-glm-panax-swiss .pa03-covwrap {width:100%;border-right:none;border-bottom:2px solid #111}\r
}\r
.w.w-game.v-glm-panax-editorial 0, .w.w-game.v-glm-panax-editorial 800;1, .w.w-game.v-glm-panax-editorial 500;1, .w.w-game.v-glm-panax-editorial 700&family=Golos+Text:wght@400;500;600&display=swap');\r
.pa05 {position:relative;max-width:660px;width:100%;min-height:470px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;background:#0d0c0a;color:#f3efe6;font-family:'Golos Text',system-ui,sans-serif;overflow:hidden;padding:22px}\r
.w.w-game.v-glm-panax-editorial .pa05 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-panax-editorial .pa05-bg {position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 28%;filter:grayscale(.25) contrast(1.05) brightness(.9)}\r
.w.w-game.v-glm-panax-editorial .pa05-shade {position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,12,10,.52) 0%,rgba(13,12,10,.18) 40%,rgba(13,12,10,.95) 100%)}\r
.w.w-game.v-glm-panax-editorial .pa05-top, .w.w-game.v-glm-panax-editorial .pa05-bottom {position:relative;z-index:1}\r
.w.w-game.v-glm-panax-editorial .pa05-top {display:flex;justify-content:space-between;align-items:flex-start}\r
.w.w-game.v-glm-panax-editorial .pa05-lbl {font-size:10px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#e8e2d2;border-left:3px solid #e0b154;padding-left:10px}\r
.w.w-game.v-glm-panax-editorial .pa05-score {width:66px;height:66px;border:1.5px solid #e0b154;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(13,12,10,.55);backdrop-filter:blur(4px)}\r
.w.w-game.v-glm-panax-editorial .pa05-score b {font-size:17px;font-weight:800;color:#e0b154;line-height:1;letter-spacing:.02em}\r
.w.w-game.v-glm-panax-editorial .pa05-score span {font-size:7px;letter-spacing:.14em;color:#cfc8b8;margin-top:3px}\r
.w.w-game.v-glm-panax-editorial .pa05-title {font-family:'Playfair Display',Georgia,serif;font-size:46px;font-weight:800;line-height:1.02;letter-spacing:.01em}\r
.w.w-game.v-glm-panax-editorial .pa05-meta {margin-top:8px;font-size:11px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:#cfc8b8}\r
.w.w-game.v-glm-panax-editorial .pa05-genres {margin-top:6px;font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:15px;color:#e8e2d2}\r
.w.w-game.v-glm-panax-editorial .pa05-verdict {margin-top:10px;font-size:12px;font-weight:600;letter-spacing:.06em;color:#e0b154}\r
.w.w-game.v-glm-panax-editorial .pa05-verdict .e {font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif}\r
.w.w-game.v-glm-panax-editorial .pa05-hist {display:flex;gap:12px;margin-top:12px}\r
.w.w-game.v-glm-panax-editorial .pa05-col {flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0}\r
.w.w-game.v-glm-panax-editorial .pa05-track {width:100%;max-width:44px;height:46px;border-radius:999px;background:rgba(243,239,230,.16);position:relative;overflow:hidden}\r
.w.w-game.v-glm-panax-editorial .pa05-track i {position:absolute;bottom:0;left:0;right:0;border-radius:0 0 999px 999px}\r
.w.w-game.v-glm-panax-editorial .pa05-badge {width:20px;height:20px;border-radius:50%;background:rgba(13,12,10,.55);border:1px solid rgba(243,239,230,.3);display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1;font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif}\r
.w.w-game.v-glm-panax-editorial .pa05-lbl {font-size:7.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border-radius:999px;color:#fff;white-space:nowrap}\r
.w.w-game.v-glm-panax-editorial .pa05-val {font-size:9px;font-weight:600;color:#cfc8b8}\r
.w.w-game.v-glm-panax-editorial .pa05 .f-gold {background:#f4cf3a}\r
.w.w-game.v-glm-panax-editorial .pa05 .f-orange {background:#f5a41f}\r
.w.w-game.v-glm-panax-editorial .pa05 .f-purple {background:#bd63f2}\r
.w.w-game.v-glm-panax-editorial .pa05 .f-blue {background:#3f83f8}\r
.w.w-game.v-glm-panax-editorial .pa05 .f-grey {background:#8a8f99}\r
.w.w-game.v-glm-panax-editorial .pa05 .f-green {background:#33c455}\r
.w.w-game.v-glm-panax-editorial .pa05 .t-gold {background:#d9a514}\r
.w.w-game.v-glm-panax-editorial .pa05 .t-orange {background:#e08a10}\r
.w.w-game.v-glm-panax-editorial .pa05 .t-purple {background:#9d4fd1}\r
.w.w-game.v-glm-panax-editorial .pa05 .t-blue {background:#3672e8}\r
.w.w-game.v-glm-panax-editorial .pa05 .t-grey {background:#6f7480}\r
.w.w-game.v-glm-panax-editorial .pa05 .t-green {background:#2aa04a}\r
.w.w-game.v-glm-panax-editorial .pa05-btns {display:flex;flex-wrap:wrap;gap:20px;margin-top:14px;padding-top:13px;border-top:1px solid rgba(243,239,230,.28)}\r
.w.w-game.v-glm-panax-editorial .pa05-btns a {color:#f3efe6;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;display:inline-flex;align-items:center;gap:5px}\r
.w.w-game.v-glm-panax-editorial .pa05-btns a:hover {text-decoration:underline;text-underline-offset:4px}\r
.w.w-game.v-glm-panax-editorial .pa05-btns a i {font-style:normal;color:#e0b154}\r
.w.w-game.v-glm-panax-vertical 500;600;800&display=swap');\r
.pa06 {position:relative;width:340px;max-width:100%;box-sizing:border-box;border-radius:18px;overflow:hidden;background:#0b0b0f;color:#f2f1f4;font-family:'Golos Text',system-ui,sans-serif;border:1px solid #23222b}\r
.w.w-game.v-glm-panax-vertical .pa06 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-panax-vertical .pa06-cover {width:100%;height:360px;object-fit:cover;display:block;object-position:center 25%}\r
.w.w-game.v-glm-panax-vertical .pa06-shade {position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,11,15,.14) 0%,rgba(11,11,15,0) 30%,rgba(11,11,15,.8) 62%,rgba(11,11,15,.98) 100%)}\r
.w.w-game.v-glm-panax-vertical .pa06-chip {position:absolute;top:14px;left:14px;background:rgba(11,11,15,.6);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.18);font-size:9px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;padding:6px 11px;border-radius:999px;color:#ecebee}\r
.w.w-game.v-glm-panax-vertical .pa06-badge {position:absolute;top:14px;right:14px;width:62px;height:62px;background:#e3b357;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#191712;box-shadow:0 4px 14px rgba(0,0,0,.35)}\r
.w.w-game.v-glm-panax-vertical .pa06-badge b {font-size:14px;font-weight:800;line-height:1}\r
.w.w-game.v-glm-panax-vertical .pa06-badge span {font-size:7px;font-weight:700;letter-spacing:.06em;margin-top:2px}\r
.w.w-game.v-glm-panax-vertical .pa06-body {position:absolute;left:0;right:0;bottom:0;padding:18px}\r
.w.w-game.v-glm-panax-vertical .pa06-title {font-size:26px;font-weight:800;letter-spacing:.02em;text-transform:uppercase}\r
.w.w-game.v-glm-panax-vertical .pa06-meta {font-size:12px;color:#b9b7c4;margin-top:4px}\r
.w.w-game.v-glm-panax-vertical .pa06-stack {display:flex;gap:2px;height:10px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.14);margin-top:12px}\r
.w.w-game.v-glm-panax-vertical .pa06-stack i {border-radius:999px}\r
.w.w-game.v-glm-panax-vertical .pa06-leg {display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px 10px;margin-top:9px}\r
.w.w-game.v-glm-panax-vertical .pa06-leg div {display:flex;align-items:center;gap:5px;font-size:9px;color:#cfcdd8;min-width:0}\r
.w.w-game.v-glm-panax-vertical .pa06-leg .e {font-size:12px;line-height:1;font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif}\r
.w.w-game.v-glm-panax-vertical .pa06-leg b {color:#fff;font-weight:600;margin-left:auto;font-size:9px}\r
.w.w-game.v-glm-panax-vertical .pa06-genres {display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}\r
.w.w-game.v-glm-panax-vertical .pa06-genres span {padding:5px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.09);backdrop-filter:blur(6px);font-size:11px;font-weight:500;color:#ecebee}\r
.w.w-game.v-glm-panax-vertical .pa06-btns {display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px}\r
.w.w-game.v-glm-panax-vertical .pa06-btns a {display:block;text-align:center;padding:10px 0;border-radius:10px;font-size:12px;font-weight:700;text-decoration:none}\r
.w.w-game.v-glm-panax-vertical .pa06-btns .p {background:#e3b357;color:#17161c}\r
.w.w-game.v-glm-panax-vertical .pa06-btns .s {background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);color:#f2f1f4;backdrop-filter:blur(6px)}\r
.w.w-game.v-glm-panax-vertical .pa06 .f-gold {background:#f4cf3a}\r
.w.w-game.v-glm-panax-vertical .pa06 .f-orange {background:#f5a41f}\r
.w.w-game.v-glm-panax-vertical .pa06 .f-purple {background:#bd63f2}\r
.w.w-game.v-glm-panax-vertical .pa06 .f-grey {background:#a8adb8}\r
.w.w-game.v-glm-panax-crt 700&display=swap');\r
.pa08 {max-width:640px;width:100%;box-sizing:border-box;background:#050906;border:1px solid #1d4b23;border-radius:10px;padding:18px 20px;color:#6fe37a;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.6;position:relative;overflow:hidden;box-shadow:inset 0 0 40px rgba(30,120,50,.14), 0 0 24px rgba(46,160,70,.1);text-shadow:0 0 8px rgba(90,240,110,.3)}\r
.w.w-game.v-glm-panax-crt .pa08 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-panax-crt .pa08::after {content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.24) 0 1px,transparent 1px 3px);pointer-events:none}\r
.w.w-game.v-glm-panax-crt .pa08-top {display:flex;justify-content:space-between;color:#3f9e4d;font-size:10px;letter-spacing:.1em;margin-bottom:10px}\r
.w.w-game.v-glm-panax-crt .pa08-prompt {color:#b9ffbd}\r
.w.w-game.v-glm-panax-crt .pa08-prompt b {color:#3f9e4d;font-weight:400}\r
.w.w-game.v-glm-panax-crt .pa08-div {border:none;border-top:1px dashed #1d4b23;margin:10px 0}\r
.w.w-game.v-glm-panax-crt .pa08-title {font-size:26px;font-weight:700;color:#c8ffc9;letter-spacing:.08em;text-shadow:0 0 14px rgba(120,255,130,.45);display:flex;align-items:center}\r
.w.w-game.v-glm-panax-crt .pa08-cursor {display:inline-block;width:9px;height:18px;background:#6fe37a;margin-left:10px;animation:pa08blink 1.2s steps(1) infinite}\r
@keyframes pa08blink {\r
50%{opacity:0}\r
}\r
.w.w-game.v-glm-panax-crt .pa08-rows {margin-top:12px}\r
.w.w-game.v-glm-panax-crt .pa08-row {display:flex;gap:10px;align-items:baseline}\r
.w.w-game.v-glm-panax-crt .pa08-row span {color:#3f9e4d;letter-spacing:.08em;font-size:11px}\r
.w.w-game.v-glm-panax-crt .pa08-row i {flex:1;border-bottom:1px dotted #1d4b23;transform:translateY(-3px)}\r
.w.w-game.v-glm-panax-crt .pa08-row b {font-weight:400;color:#a5e9ab}\r
.w.w-game.v-glm-panax-crt .pa08-bars {margin-top:14px}\r
.w.w-game.v-glm-panax-crt .pa08-bar-row {display:flex;align-items:center;gap:10px;margin-top:6px}\r
.w.w-game.v-glm-panax-crt .pa08-bar-row span {width:110px;color:#3f9e4d;font-size:11px;letter-spacing:.06em}\r
.w.w-game.v-glm-panax-crt .pa08-bar-row .bar {flex:1;height:9px;border:1px solid #2e6b37;position:relative;background:rgba(20,60,30,.25)}\r
.w.w-game.v-glm-panax-crt .pa08-bar-row .bar i {position:absolute;top:0;bottom:0;left:0}\r
.w.w-game.v-glm-panax-crt .pa08-bar-row em {font-style:normal;width:64px;text-align:right;color:#c8ffc9;font-size:11px}\r
.w.w-game.v-glm-panax-crt .pa08 .f-gold {background:#f4cf3a;box-shadow:0 0 10px rgba(244,207,58,.5)}\r
.w.w-game.v-glm-panax-crt .pa08 .f-orange {background:#f5a41f;box-shadow:0 0 10px rgba(245,164,31,.5)}\r
.w.w-game.v-glm-panax-crt .pa08 .f-purple {background:#bd63f2;box-shadow:0 0 10px rgba(189,99,242,.5)}\r
.w.w-game.v-glm-panax-crt .pa08 .f-blue {background:#3f83f8}\r
.w.w-game.v-glm-panax-crt .pa08 .f-grey {background:#8a8f99}\r
.w.w-game.v-glm-panax-crt .pa08 .f-green {background:#33c455}\r
.w.w-game.v-glm-panax-crt .pa08-verdict {margin-top:12px;color:#c8ffc9;font-size:12px}\r
.w.w-game.v-glm-panax-crt .pa08-verdict .e {font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif;text-shadow:none}\r
.w.w-game.v-glm-panax-crt .pa08-btns {display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}\r
.w.w-game.v-glm-panax-crt .pa08-btns a {color:#6fe37a;border:1px solid #2e6b37;padding:7px 12px;text-decoration:none;font-size:11px;letter-spacing:.08em;position:relative;z-index:1}\r
.w.w-game.v-glm-panax-crt .pa08-btns a:hover {background:#39b34c;color:#050906;text-shadow:none}\r
.w.w-game.v-glm-panax-snes 700&family=IBM+Plex+Mono:wght@400;600&display=swap');\r
.pa09 {width:420px;max-width:100%;box-sizing:border-box;background:#d8d4c6;border:1px solid #b7b3a5;border-radius:10px 10px 14px 14px;padding:12px;font-family:'Oswald',Arial,sans-serif;color:#22201b;box-shadow:inset 0 2px 0 #eceade, inset 0 -3px 0 #b4b0a2, 8px 10px 0 rgba(0,0,0,.13)}\r
.w.w-game.v-glm-panax-snes .pa09 * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.v-glm-panax-snes .pa09-ridges {height:10px;background:repeating-linear-gradient(90deg,#c5c1b3 0 6px,#d8d4c6 6px 12px);border:1px solid #b7b3a5;border-radius:2px;margin-bottom:10px}\r
.w.w-game.v-glm-panax-snes .pa09-label {background:#f2ecdb;border:2px solid #22201b;border-radius:4px;overflow:hidden}\r
.w.w-game.v-glm-panax-snes .pa09-band {display:flex;justify-content:space-between;align-items:center;background:#2c3868;color:#f2ecdb;padding:7px 12px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase}\r
.w.w-game.v-glm-panax-snes .pa09-band em {font-style:normal;background:#c7331f;padding:2px 7px;color:#fff;letter-spacing:.1em}\r
.w.w-game.v-glm-panax-snes .pa09-stripe {height:6px;background:#c7331f;border-top:1px solid #22201b;border-bottom:1px solid #22201b}\r
.w.w-game.v-glm-panax-snes .pa09-body {display:flex;gap:12px;padding:12px}\r
.w.w-game.v-glm-panax-snes .pa09-cov {width:132px;height:172px;flex-shrink:0;border:2px solid #22201b;overflow:hidden;background:#22201b}\r
.w.w-game.v-glm-panax-snes .pa09-cov img {width:100%;height:100%;object-fit:cover;display:block;filter:contrast(1.03) saturate(1.05)}\r
.w.w-game.v-glm-panax-snes .pa09-info {min-width:0;flex:1;display:flex;flex-direction:column}\r
.w.w-game.v-glm-panax-snes .pa09-name {font-size:26px;font-weight:700;text-transform:uppercase;line-height:.98}\r
.w.w-game.v-glm-panax-snes .pa09-meta {font-family:'IBM Plex Mono',monospace;font-size:9px;color:#55503f;margin-top:7px;letter-spacing:.02em}\r
.w.w-game.v-glm-panax-snes .pa09-genres {font-size:13px;font-weight:500;color:#3d3a30;line-height:1.5;margin-top:8px}\r
.w.w-game.v-glm-panax-snes .pa09-stack {display:flex;gap:2px;height:9px;border-radius:999px;overflow:hidden;background:#dcd6c4;border:1px solid #22201b;margin-top:11px}\r
.w.w-game.v-glm-panax-snes .pa09-stack i {border-radius:999px}\r
.w.w-game.v-glm-panax-snes .pa09-leg {display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;margin-top:8px}\r
.w.w-game.v-glm-panax-snes .pa09-leg div {display:flex;align-items:center;gap:4px;font-family:'IBM Plex Mono',monospace;font-size:8px;color:#3d3a30;min-width:0}\r
.w.w-game.v-glm-panax-snes .pa09-leg .e {font-size:11px;line-height:1;font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif}\r
.w.w-game.v-glm-panax-snes .pa09-leg b {margin-left:auto;font-weight:600;font-size:8px;color:#22201b}\r
.w.w-game.v-glm-panax-snes .pa09-verdict {font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:.08em;text-transform:uppercase;margin-top:9px;padding-top:8px;border-top:1px dashed #a89f88;color:#55503f}\r
.w.w-game.v-glm-panax-snes .pa09 .f-gold {background:#f4cf3a}\r
.w.w-game.v-glm-panax-snes .pa09 .f-orange {background:#f5a41f}\r
.w.w-game.v-glm-panax-snes .pa09 .f-purple {background:#bd63f2}\r
.w.w-game.v-glm-panax-snes .pa09 .f-grey {background:#a8adb8}\r
.w.w-game.v-glm-panax-snes .pa09-btns {display:flex;gap:8px;margin-top:12px;padding:0 12px 12px}\r
.w.w-game.v-glm-panax-snes .pa09-btns a {flex:1;text-align:center;padding:9px 0;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;border:2px solid #22201b;background:#f2ecdb;color:#22201b;box-shadow:3px 3px 0 #22201b}\r
.w.w-game.v-glm-panax-snes .pa09-btns a:hover {transform:translate(1px,1px);box-shadow:2px 2px 0 #22201b}\r
.w.w-game.v-glm-panax-snes .pa09-btns .f1 {background:#c7331f;color:#fff}\r
.w.w-game.v-glm-panax-snes .pa09-serial {font-family:'IBM Plex Mono',monospace;font-size:8px;color:#8a8577;text-align:center;letter-spacing:.22em;text-transform:uppercase;margin-top:9px}\r
.w.w-game.v-gpt-halo {color-scheme:light dark}\r
:where(.w.w-game.v-gpt-halo) * {box-sizing:border-box}\r
.w.w-game.v-gpt-halo .pcard {width:100%;max-width:900px;min-width:0;overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;line-height:1.35}\r
.w.w-game.v-gpt-halo .pcard img {display:block}\r
.w.w-game.v-gpt-halo .game-title {margin:4px 0 6px;font-weight:850;line-height:1.02;letter-spacing:-.055em}\r
.w.w-game.v-gpt-halo .kicker {font-size:9px;font-weight:900;letter-spacing:.18em}\r
.w.w-game.v-gpt-halo .game-meta {font-size:11px}\r
.w.w-game.v-gpt-halo .game-meta i {font-style:normal;opacity:.6;padding:0 3px}\r
.w.w-game.v-gpt-halo .genres {display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}\r
.w.w-game.v-gpt-halo .genres span {border-radius:999px;padding:5px 8px;font-size:9px;font-weight:700}\r
.w.w-game.v-gpt-halo .badge {display:block;flex:none;object-fit:contain}\r
.w.w-game.v-gpt-halo .panax-link {transition:transform .15s ease,opacity .15s ease}\r
.w.w-game.v-gpt-halo .panax-link:hover {transform:translateY(-1px);opacity:.84}\r
.w.w-game.v-gpt-halo .pcard a:focus-visible {outline:3px solid #7eb9ff;outline-offset:3px}\r
.w.w-game.v-gpt-halo .halo {padding:25px 28px 17px;background:#f7f5f0;color:#262626;border-radius:24px;border:1px solid #e4ded1}\r
.w.w-game.v-gpt-halo .halo .kicker {color:#8a8072}\r
.w.w-game.v-gpt-halo .halo .game-title {font-family:Georgia,serif;font-weight:500;letter-spacing:-.05em}\r
.w.w-game.v-gpt-halo .halo .game-meta {color:#817b70}\r
.w.w-game.v-gpt-halo .halo .genres span {background:#eeeae2;color:#777064;border:1px solid #e3ded3}\r
.w.w-game.v-gpt-halo .halo-main {display:grid;grid-template-columns:230px 1fr;gap:28px;align-items:center;padding:15px 4px 20px}\r
.w.w-game.v-gpt-halo .halo-ring {width:210px;aspect-ratio:1;border-radius:50%;background:conic-gradient(#f4d000 0 19.58%,#f5a000 19.58% 60.74%,#bd55e9 60.74% 97.95%,#299cf4 97.95% 97.96%,#91aab4 97.96% 99.96%,#e34b69 99.96% 100%);position:relative;margin:auto}\r
.w.w-game.v-gpt-halo .halo-ring:after {content:"";position:absolute;inset:24px;border-radius:50%;background:#f7f5f0}\r
.w.w-game.v-gpt-halo .halo-center {position:absolute;z-index:1;inset:26px;display:flex;align-items:center;justify-content:center;flex-direction:column}\r
.w.w-game.v-gpt-halo .halo-center .badge {width:60px;height:60px;object-fit:contain}\r
.w.w-game.v-gpt-halo .halo-center b {font-size:25px;letter-spacing:-.06em}\r
.w.w-game.v-gpt-halo .halo-center span {font-size:9px;font-weight:900;letter-spacing:.18em;color:#a46e10}\r
.w.w-game.v-gpt-halo .halo-caption {font:italic 16px/1.35 Georgia,serif;color:#777064;margin-bottom:13px}\r
.w.w-game.v-gpt-halo .halo-legend {display:grid;grid-template-columns:1fr 1fr;gap:8px 15px}\r
.w.w-game.v-gpt-halo .halo-legend>div {display:grid;grid-template-columns:8px 1fr auto;align-items:center;gap:6px;font-size:11px;color:#5d5a54}\r
.w.w-game.v-gpt-halo .halo-legend i {width:7px;height:7px;background:var(--c);border-radius:50%}\r
.w.w-game.v-gpt-halo .halo-legend b {color:#222}\r
.w.w-game.v-gpt-halo .halo-foot {display:flex;align-items:center;gap:10px;border-top:1px solid #e1dcd1;padding-top:13px}\r
.w.w-game.v-gpt-halo .halo-thumb {width:37px;height:44px;object-fit:cover;border-radius:4px}\r
.w.w-game.v-gpt-halo .halo-foot>div b, .w.w-game.v-gpt-halo .halo-foot>div small {display:block}\r
.w.w-game.v-gpt-halo .halo-foot>div b {font:700 12px Georgia,serif}\r
.w.w-game.v-gpt-halo .halo-foot>div small {font-size:9px;color:#8a8275}\r
.w.w-game.v-gpt-halo .halo-foot .panax-link {margin-left:auto;color:#fff;background:#272923;padding:9px 12px;border-radius:6px}\r
@media(max-width:600px) {\r
.w.w-game.v-gpt-halo .halo {padding:19px}\r
.w.w-game.v-gpt-halo .halo-main {grid-template-columns:1fr;gap:16px}\r
.w.w-game.v-gpt-halo .halo-ring {width:170px}\r
.w.w-game.v-gpt-halo .halo-legend {grid-template-columns:1fr 1fr}\r
}\r
.w.w-game.v-gpt-bars {color-scheme:light dark}\r
:where(.w.w-game.v-gpt-bars) * {box-sizing:border-box}\r
.w.w-game.v-gpt-bars .pcard {width:100%;max-width:900px;min-width:0;overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;line-height:1.35}\r
.w.w-game.v-gpt-bars .pcard img {display:block}\r
.w.w-game.v-gpt-bars .game-title {margin:4px 0 6px;font-weight:850;line-height:1.02;letter-spacing:-.055em}\r
.w.w-game.v-gpt-bars .kicker {font-size:9px;font-weight:900;letter-spacing:.18em}\r
.w.w-game.v-gpt-bars .game-meta {font-size:11px}\r
.w.w-game.v-gpt-bars .game-meta i {font-style:normal;opacity:.6;padding:0 3px}\r
.w.w-game.v-gpt-bars .genres {display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}\r
.w.w-game.v-gpt-bars .genres span {border-radius:999px;padding:5px 8px;font-size:9px;font-weight:700}\r
.w.w-game.v-gpt-bars .badge {display:block;flex:none;object-fit:contain}\r
.w.w-game.v-gpt-bars .panax-link {transition:transform .15s ease,opacity .15s ease}\r
.w.w-game.v-gpt-bars .panax-link:hover {transform:translateY(-1px);opacity:.84}\r
.w.w-game.v-gpt-bars .pcard a:focus-visible {outline:3px solid #7eb9ff;outline-offset:3px}\r
.w.w-game.v-gpt-bars .bars {background:#111923;color:#edf2f5;border:1px solid #273949;border-radius:17px;overflow:hidden;padding:24px 28px}\r
.w.w-game.v-gpt-bars .bars-main {display:flex;gap:23px;align-items:center}\r
.w.w-game.v-gpt-bars .bars-cover {width:115px;height:145px;object-fit:cover;border-radius:8px;box-shadow:0 8px 25px #0006}\r
.w.w-game.v-gpt-bars .bars .game-title {font-family:ui-monospace,monospace;font-size:clamp(23px,4vw,34px);letter-spacing:-.08em}\r
.w.w-game.v-gpt-bars .bars .kicker {color:#81a0b4}\r
.w.w-game.v-gpt-bars .bars .game-meta {color:#92a4ae}\r
.w.w-game.v-gpt-bars .bars .genres span {background:#1d2a35;border:1px solid #2e4252;color:#a8bdc7}\r
.w.w-game.v-gpt-bars .bars-verdict {display:flex;align-items:center;gap:9px;margin-top:14px}\r
.w.w-game.v-gpt-bars .bars-verdict .badge {width:43px;height:43px;object-fit:contain}\r
.w.w-game.v-gpt-bars .bars-verdict small {display:block;color:#7f9aaa;font-size:8px;font-weight:900;letter-spacing:.14em}\r
.w.w-game.v-gpt-bars .bars-verdict b {font-size:15px}\r
.w.w-game.v-gpt-bars .bars-verdict em {font-style:normal;color:#f5ae28;margin-left:7px}\r
.w.w-game.v-gpt-bars .bars-chart {border-top:1px solid #2b3c4a;margin-top:20px;padding-top:13px}\r
.w.w-game.v-gpt-bars .bars-chart-top {display:flex;justify-content:space-between;color:#7792a4;font-size:8px;font-weight:900;letter-spacing:.15em}\r
.w.w-game.v-gpt-bars .bars-row {height:110px;display:flex;align-items:flex-end;gap:14px;margin-top:7px}\r
.w.w-game.v-gpt-bars .bar-col {height:100%;flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px;min-width:0}\r
.w.w-game.v-gpt-bars .bar-col i {display:block;width:100%;height:var(--h);min-height:3px;background:linear-gradient(180deg,var(--c),color-mix(in srgb,var(--c),#18212c 35%));border-radius:7px 7px 2px 2px;box-shadow:0 0 15px color-mix(in srgb,var(--c),transparent 72%)}\r
.w.w-game.v-gpt-bars .bar-col span {font-size:9px;color:#9daeb8}\r
.w.w-game.v-gpt-bars .bars-foot {border-top:1px solid #2b3c4a;margin-top:14px;padding-top:13px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#7890a0}\r
.w.w-game.v-gpt-bars .bars .panax-link {color:#f4b12c}\r
@media(max-width:560px) {\r
.w.w-game.v-gpt-bars .bars {padding:18px}\r
.w.w-game.v-gpt-bars .bars-main {gap:14px}\r
.w.w-game.v-gpt-bars .bars-cover {width:82px;height:120px}\r
.w.w-game.v-gpt-bars .bars-row {gap:7px;height:90px}\r
.w.w-game.v-gpt-bars .bar-col span {font-size:8px}\r
.w.w-game.v-gpt-bars .bars-foot {font-size:8px}\r
}\r
.w.w-game.v-gpt-poster {color-scheme:light dark}\r
:where(.w.w-game.v-gpt-poster) * {box-sizing:border-box}\r
.w.w-game.v-gpt-poster .pcard {width:100%;max-width:900px;min-width:0;overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;line-height:1.35}\r
.w.w-game.v-gpt-poster .pcard img {display:block}\r
.w.w-game.v-gpt-poster .game-title {margin:4px 0 6px;font-weight:850;line-height:1.02;letter-spacing:-.055em}\r
.w.w-game.v-gpt-poster .kicker {font-size:9px;font-weight:900;letter-spacing:.18em}\r
.w.w-game.v-gpt-poster .game-meta {font-size:11px}\r
.w.w-game.v-gpt-poster .game-meta i {font-style:normal;opacity:.6;padding:0 3px}\r
.w.w-game.v-gpt-poster .genres {display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}\r
.w.w-game.v-gpt-poster .genres span {border-radius:999px;padding:5px 8px;font-size:9px;font-weight:700}\r
.w.w-game.v-gpt-poster .badge {display:block;flex:none;object-fit:contain}\r
.w.w-game.v-gpt-poster .panax-link {transition:transform .15s ease,opacity .15s ease}\r
.w.w-game.v-gpt-poster .panax-link:hover {transform:translateY(-1px);opacity:.84}\r
.w.w-game.v-gpt-poster .pcard a:focus-visible {outline:3px solid #7eb9ff;outline-offset:3px}\r
.w.w-game.v-gpt-poster .poster {background:#0b0e0e;color:#f4f2df;border-radius:19px;overflow:hidden;border:1px solid #353b35}\r
.w.w-game.v-gpt-poster .poster-art {height:285px;position:relative;overflow:hidden}\r
.w.w-game.v-gpt-poster .poster-cover {position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 45%;filter:saturate(.8)}\r
.w.w-game.v-gpt-poster .poster-shade {position:absolute;inset:0;background:linear-gradient(90deg,#07110edb 0%,#07110e75 55%,#07110e10 100%),linear-gradient(0deg,#080e0b 0%,transparent 40%)}\r
.w.w-game.v-gpt-poster .poster-words {position:absolute;left:29px;top:29px}\r
.w.w-game.v-gpt-poster .poster-overline {font-size:9px;letter-spacing:.25em;color:#e0d8b1;font-weight:900}\r
.w.w-game.v-gpt-poster .poster-words h2 {font-size:clamp(40px,7vw,64px);line-height:.83;letter-spacing:-.07em;margin:17px 0 12px;font-weight:1000}\r
.w.w-game.v-gpt-poster .poster-sub {font-size:9px;letter-spacing:.19em;color:#cad0b8}\r
.w.w-game.v-gpt-poster .poster-stamp {position:absolute;right:26px;bottom:23px;width:132px;height:132px;border:1px solid #f1c85b;border-radius:50%;background:#151b17e8;display:flex;align-items:center;justify-content:center;flex-direction:column;box-shadow:0 0 0 6px #101611aa,0 0 0 7px #e4bd54}\r
.w.w-game.v-gpt-poster .poster-stamp .badge {width:48px;height:48px;object-fit:contain}\r
.w.w-game.v-gpt-poster .poster-stamp span {font-size:7px;letter-spacing:.18em;color:#b7ad8a}\r
.w.w-game.v-gpt-poster .poster-stamp b {font-size:13px;letter-spacing:.15em;color:#f3d47e}\r
.w.w-game.v-gpt-poster .poster-stamp strong {font-size:22px;line-height:1}\r
.w.w-game.v-gpt-poster .poster-bottom {display:flex;justify-content:space-between;align-items:center;padding:15px 25px;gap:16px}\r
.w.w-game.v-gpt-poster .poster-bottom small {font-size:8px;color:#9aa195;letter-spacing:.16em;font-weight:900}\r
.w.w-game.v-gpt-poster .poster-bottom .stacked {max-width:340px}\r
.w.w-game.v-gpt-poster .poster .panax-link {color:#f3d47e;border:1px solid #87743f;padding:9px 13px;border-radius:99px}\r
@media(max-width:520px) {\r
.w.w-game.v-gpt-poster .poster-art {height:245px}\r
.w.w-game.v-gpt-poster .poster-words {left:18px;top:22px}\r
.w.w-game.v-gpt-poster .poster-stamp {width:106px;height:106px;right:17px;bottom:18px}\r
.w.w-game.v-gpt-poster .poster-stamp .badge {width:38px;height:38px}\r
.w.w-game.v-gpt-poster .poster-bottom {padding:13px 17px}\r
.w.w-game.v-gpt-poster .poster-bottom small {font-size:7px}\r
}\r
.w.w-game.v-gpt-ticket {color-scheme:light dark}\r
:where(.w.w-game.v-gpt-ticket) * {box-sizing:border-box}\r
.w.w-game.v-gpt-ticket .pcard {width:100%;max-width:900px;min-width:0;overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;line-height:1.35}\r
.w.w-game.v-gpt-ticket .pcard img {display:block}\r
.w.w-game.v-gpt-ticket .game-title {margin:4px 0 6px;font-weight:850;line-height:1.02;letter-spacing:-.055em}\r
.w.w-game.v-gpt-ticket .kicker {font-size:9px;font-weight:900;letter-spacing:.18em}\r
.w.w-game.v-gpt-ticket .game-meta {font-size:11px}\r
.w.w-game.v-gpt-ticket .game-meta i {font-style:normal;opacity:.6;padding:0 3px}\r
.w.w-game.v-gpt-ticket .genres {display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}\r
.w.w-game.v-gpt-ticket .genres span {border-radius:999px;padding:5px 8px;font-size:9px;font-weight:700}\r
.w.w-game.v-gpt-ticket .badge {display:block;flex:none;object-fit:contain}\r
.w.w-game.v-gpt-ticket .panax-link {transition:transform .15s ease,opacity .15s ease}\r
.w.w-game.v-gpt-ticket .panax-link:hover {transform:translateY(-1px);opacity:.84}\r
.w.w-game.v-gpt-ticket .pcard a:focus-visible {outline:3px solid #7eb9ff;outline-offset:3px}\r
.w.w-game.v-gpt-ticket .ticket {display:grid;grid-template-columns:155px 1fr;background:#f5e9cf;color:#27241c;border:1px solid #c8b891;border-radius:12px;overflow:hidden;box-shadow:0 8px 22px #0002}\r
.w.w-game.v-gpt-ticket .ticket-left {position:relative;padding:12px;background:#e1d2ae}\r
.w.w-game.v-gpt-ticket .ticket-cover {width:100%;height:100%;min-height:285px;object-fit:cover;filter:sepia(.2)}\r
.w.w-game.v-gpt-ticket .ticket-side {position:absolute;left:5px;top:14px;writing-mode:vertical-rl;transform:rotate(180deg);font:900 8px ui-monospace,monospace;letter-spacing:.15em;color:#f4e6c5;text-shadow:0 1px 3px #000}\r
.w.w-game.v-gpt-ticket .ticket-right {padding:22px 27px;position:relative}\r
.w.w-game.v-gpt-ticket .ticket-meta {font:800 9px ui-monospace,monospace;letter-spacing:.16em;color:#84775e}\r
.w.w-game.v-gpt-ticket .ticket h2 {font:900 clamp(31px,5vw,43px)/.87 Georgia,serif;letter-spacing:-.05em;margin:12px 0}\r
.w.w-game.v-gpt-ticket .ticket-studio {font:12px Georgia,serif;color:#6d614a}\r
.w.w-game.v-gpt-ticket .ticket-genres {font:800 8px ui-monospace,monospace;letter-spacing:.08em;color:#8c7a5a;margin-top:12px}\r
.w.w-game.v-gpt-ticket .ticket-seal {display:flex;align-items:center;gap:12px;border-top:1px dashed #bba77f;border-bottom:1px dashed #bba77f;margin-top:17px;padding:11px 0}\r
.w.w-game.v-gpt-ticket .ticket-seal .badge {width:60px;height:60px;object-fit:contain}\r
.w.w-game.v-gpt-ticket .ticket-seal small {display:block;font-size:8px;letter-spacing:.13em;color:#8a7755;font-weight:900}\r
.w.w-game.v-gpt-ticket .ticket-seal b {font:700 16px Georgia,serif;display:block}\r
.w.w-game.v-gpt-ticket .ticket-seal strong {font:900 23px Georgia,serif;color:#a56a08}\r
.w.w-game.v-gpt-ticket .ticket-foot {display:flex;align-items:center;gap:10px;margin-top:13px}\r
.w.w-game.v-gpt-ticket .ticket-foot>span {font:800 8px ui-monospace,monospace;color:#998763}\r
.w.w-game.v-gpt-ticket .ticket-link {margin-left:auto;background:#25251f;color:#f7e9c8;padding:9px 12px;border-radius:2px;font-size:9px;letter-spacing:.08em}\r
@media(max-width:540px) {\r
.w.w-game.v-gpt-ticket .ticket {grid-template-columns:105px 1fr}\r
.w.w-game.v-gpt-ticket .ticket-right {padding:17px 15px}\r
.w.w-game.v-gpt-ticket .ticket-cover {min-height:260px}\r
.w.w-game.v-gpt-ticket .ticket-seal .badge {width:48px;height:48px}\r
.w.w-game.v-gpt-ticket .ticket-foot>span {display:none}\r
}\r
.w.w-game.v-gpt-editorial {color-scheme:light dark}\r
:where(.w.w-game.v-gpt-editorial) * {box-sizing:border-box}\r
.w.w-game.v-gpt-editorial .pcard {width:100%;max-width:900px;min-width:0;overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;line-height:1.35}\r
.w.w-game.v-gpt-editorial .pcard img {display:block}\r
.w.w-game.v-gpt-editorial .game-title {margin:4px 0 6px;font-weight:850;line-height:1.02;letter-spacing:-.055em}\r
.w.w-game.v-gpt-editorial .kicker {font-size:9px;font-weight:900;letter-spacing:.18em}\r
.w.w-game.v-gpt-editorial .game-meta {font-size:11px}\r
.w.w-game.v-gpt-editorial .game-meta i {font-style:normal;opacity:.6;padding:0 3px}\r
.w.w-game.v-gpt-editorial .genres {display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}\r
.w.w-game.v-gpt-editorial .genres span {border-radius:999px;padding:5px 8px;font-size:9px;font-weight:700}\r
.w.w-game.v-gpt-editorial .badge {display:block;flex:none;object-fit:contain}\r
.w.w-game.v-gpt-editorial .panax-link {transition:transform .15s ease,opacity .15s ease}\r
.w.w-game.v-gpt-editorial .panax-link:hover {transform:translateY(-1px);opacity:.84}\r
.w.w-game.v-gpt-editorial .pcard a:focus-visible {outline:3px solid #7eb9ff;outline-offset:3px}\r
.w.w-game.v-gpt-editorial .editorial {background:#eeece4;color:#20201d;border:1px solid #d7d3c8;padding:25px 29px;border-radius:3px}\r
.w.w-game.v-gpt-editorial .editorial-top {display:flex;justify-content:space-between;gap:24px;align-items:center}\r
.w.w-game.v-gpt-editorial .editorial-index {font:900 9px ui-monospace,monospace;letter-spacing:.18em;color:#8a887e}\r
.w.w-game.v-gpt-editorial .editorial-index span {margin-left:15px;color:#b1a995}\r
.w.w-game.v-gpt-editorial .editorial h2 {font:900 clamp(36px,6vw,54px)/.82 Georgia,serif;letter-spacing:-.07em;margin:16px 0 11px}\r
.w.w-game.v-gpt-editorial .editorial h2 i {font-weight:400}\r
.w.w-game.v-gpt-editorial .editorial-top p {font:12px Georgia,serif;color:#666359;margin:0}\r
.w.w-game.v-gpt-editorial .editorial-tags {font:800 8px ui-monospace,monospace;letter-spacing:.09em;color:#928b79;margin-top:10px}\r
.w.w-game.v-gpt-editorial .editorial-cover {width:110px;height:142px;object-fit:cover;box-shadow:8px 8px 0 #d2cbbb}\r
.w.w-game.v-gpt-editorial .editorial-rule {border-top:1px solid #c9c3b7;margin:20px 0 14px}\r
.w.w-game.v-gpt-editorial .editorial-label {font:900 8px ui-monospace,monospace;letter-spacing:.18em;color:#8d8679}\r
.w.w-game.v-gpt-editorial .editorial-main-reaction {display:flex;align-items:center;gap:11px;margin-top:10px}\r
.w.w-game.v-gpt-editorial .editorial-main-reaction .badge {width:54px;height:54px;object-fit:contain}\r
.w.w-game.v-gpt-editorial .editorial-main-reaction span {display:block;font:900 8px ui-monospace,monospace;color:#968d7f;letter-spacing:.12em}\r
.w.w-game.v-gpt-editorial .editorial-main-reaction b {font:700 18px Georgia,serif}\r
.w.w-game.v-gpt-editorial .editorial-main-reaction>strong {margin-left:auto;font:900 35px Georgia,serif;color:#b67b12;letter-spacing:-.06em}\r
.w.w-game.v-gpt-editorial .editorial-main-reaction>strong small {font-size:17px}\r
.w.w-game.v-gpt-editorial .editorial-spectrum {height:7px;display:flex;gap:3px;margin-top:13px}\r
.w.w-game.v-gpt-editorial .editorial-spectrum i {width:var(--w);background:var(--c);border-radius:8px;min-width:2px}\r
.w.w-game.v-gpt-editorial .editorial-foot {display:flex;align-items:center;justify-content:space-between;margin-top:12px;color:#979080;font:800 8px ui-monospace,monospace;letter-spacing:.12em}\r
.w.w-game.v-gpt-editorial .editorial .panax-link {background:#22231f;color:#eee9d8;padding:9px 12px;border-radius:2px;font-family:Arial,sans-serif;letter-spacing:0}\r
@media(max-width:540px) {\r
.w.w-game.v-gpt-editorial .editorial {padding:19px}\r
.w.w-game.v-gpt-editorial .editorial-cover {width:83px;height:112px}\r
.w.w-game.v-gpt-editorial .editorial h2 {font-size:38px}\r
.w.w-game.v-gpt-editorial .editorial-foot {font-size:7px}\r
}\r
.w.w-game.v-gpt-capsule {color-scheme:light dark}\r
:where(.w.w-game.v-gpt-capsule) * {box-sizing:border-box}\r
.w.w-game.v-gpt-capsule .pcard {width:100%;max-width:900px;min-width:0;overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;line-height:1.35}\r
.w.w-game.v-gpt-capsule .pcard img {display:block}\r
.w.w-game.v-gpt-capsule .game-title {margin:4px 0 6px;font-weight:850;line-height:1.02;letter-spacing:-.055em}\r
.w.w-game.v-gpt-capsule .kicker {font-size:9px;font-weight:900;letter-spacing:.18em}\r
.w.w-game.v-gpt-capsule .game-meta {font-size:11px}\r
.w.w-game.v-gpt-capsule .game-meta i {font-style:normal;opacity:.6;padding:0 3px}\r
.w.w-game.v-gpt-capsule .genres {display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}\r
.w.w-game.v-gpt-capsule .genres span {border-radius:999px;padding:5px 8px;font-size:9px;font-weight:700}\r
.w.w-game.v-gpt-capsule .badge {display:block;flex:none;object-fit:contain}\r
.w.w-game.v-gpt-capsule .panax-link {transition:transform .15s ease,opacity .15s ease}\r
.w.w-game.v-gpt-capsule .panax-link:hover {transform:translateY(-1px);opacity:.84}\r
.w.w-game.v-gpt-capsule .pcard a:focus-visible {outline:3px solid #7eb9ff;outline-offset:3px}\r
.w.w-game.v-gpt-capsule .capsule {display:grid;grid-template-columns:1.1fr .9fr;background:linear-gradient(140deg,#141a24,#222638);color:#f1f2f6;border:1px solid #394257;border-radius:24px;overflow:hidden;min-height:260px}\r
.w.w-game.v-gpt-capsule .capsule-left {position:relative;min-height:270px}\r
.w.w-game.v-gpt-capsule .capsule-cover {position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.78}\r
.w.w-game.v-gpt-capsule .capsule-caption {position:absolute;left:22px;right:15px;bottom:20px;text-shadow:0 2px 8px #000}\r
.w.w-game.v-gpt-capsule .capsule-caption span {display:block;font-size:8px;letter-spacing:.2em;color:#bfc7d6;font-weight:900}\r
.w.w-game.v-gpt-capsule .capsule-caption b {font-size:25px;display:block;letter-spacing:-.04em}\r
.w.w-game.v-gpt-capsule .capsule-caption small {font-size:10px;color:#d0d4dc}\r
.w.w-game.v-gpt-capsule .capsule-genres {font-size:9px;color:#d0d4dc;margin-top:8px}\r
.w.w-game.v-gpt-capsule .capsule-right {padding:23px 22px;display:flex;align-items:center;flex-direction:column;justify-content:center;text-align:center;background:radial-gradient(circle at 50% 20%,#46416d 0%,#252a3b 44%,#1b202d 100%)}\r
.w.w-game.v-gpt-capsule .capsule-orb {width:100px;height:100px;border-radius:50%;border:1px solid #9586cf;display:flex;align-items:center;justify-content:center;flex-direction:column;background:#151a26a8;box-shadow:0 0 0 8px #8f83c51a,0 0 34px #a18bea33}\r
.w.w-game.v-gpt-capsule .capsule-orb .badge {width:49px;height:49px;object-fit:contain}\r
.w.w-game.v-gpt-capsule .capsule-orb span {font-size:17px;font-weight:900;color:#f3cf79;line-height:1}\r
.w.w-game.v-gpt-capsule .capsule-mood {font-size:8px;letter-spacing:.16em;color:#a9adc1;font-weight:900;margin-top:15px}\r
.w.w-game.v-gpt-capsule .capsule-right h3 {font-size:23px;margin:4px 0 0}\r
.w.w-game.v-gpt-capsule .capsule-right p {font-size:10px;color:#a8afbf;margin:5px 0 10px}\r
.w.w-game.v-gpt-capsule .capsule-dots {margin-bottom:14px}\r
.w.w-game.v-gpt-capsule .capsule-dots .mini-dots {justify-content:center}\r
.w.w-game.v-gpt-capsule .capsule .panax-link {color:#171923;background:#f1ce7a;padding:9px 14px;border-radius:999px}\r
@media(max-width:560px) {\r
.w.w-game.v-gpt-capsule .capsule {grid-template-columns:1fr 150px}\r
.w.w-game.v-gpt-capsule .capsule-left {min-height:245px}\r
.w.w-game.v-gpt-capsule .capsule-right {padding:17px 10px}\r
.w.w-game.v-gpt-capsule .capsule-orb {width:82px;height:82px}\r
.w.w-game.v-gpt-capsule .capsule-caption {left:14px}\r
.w.w-game.v-gpt-capsule .capsule-caption b {font-size:21px}\r
.w.w-game.v-gpt-capsule .capsule-right h3 {font-size:18px}\r
}\r
.w.w-game.v-panax4-bars {box-sizing:border-box;padding:24px 16px;padding-top:max(24px,env(safe-area-inset-top,0px));padding-bottom:max(24px,env(safe-area-inset-bottom,0px));--bg:#f3f1ec;--fg:#1c1b1a;--mut:#6d6a64}\r
@media (prefers-color-scheme:dark) {\r
.w.w-game.v-panax4-bars :root:not([data-theme="light"]) {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
}\r
.w.w-game.v-panax4-bars {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
:where(.w.w-game.v-panax4-bars) * {box-sizing:border-box}\r
.w.w-game.v-panax4-bars h1 {font-size:20px;margin:0 0 4px}\r
.w.w-game.v-panax4-bars p.lead {color:var(--mut);margin:0 0 8px;font-size:14px}\r
.w.w-game.v-panax4-bars h2 {font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:38px 0 14px}\r
.w.w-game.v-panax4-bars .stack {display:grid;gap:18px}\r
.w.w-game.v-panax4-bars .card {position:relative;border-radius:18px;padding:18px;display:flex;gap:18px;color:#f1eef8;background:linear-gradient(135deg,#1a1430,#141a26);border:1px solid rgba(255,138,61,.25);box-shadow:0 12px 30px rgba(0,0,0,.35);overflow:hidden}\r
.w.w-game.v-panax4-bars .cover {flex:0 0 118px;height:168px;border-radius:12px;background:radial-gradient(circle at 70% 25%,#ffe9a8 0 7%,transparent 8%),linear-gradient(160deg,#7ee08a 0%,#2c6b52 45%,#0e1f2b 100%);position:relative;overflow:hidden;box-shadow:0 10px 22px rgba(0,0,0,.5)}\r
.w.w-game.v-panax4-bars .cover::after {content:"";position:absolute;left:-10%;right:-10%;bottom:-5%;height:55%;background:#0b1620;clip-path:polygon(0 70%,30% 25%,52% 55%,75% 15%,100% 60%,100% 100%,0 100%);opacity:.85}\r
.w.w-game.v-panax4-bars .body {flex:1;min-width:0;display:flex;flex-direction:column}\r
.w.w-game.v-panax4-bars .kick {font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ac)}\r
.w.w-game.v-panax4-bars .title {font-size:24px;font-weight:800;line-height:1.1;margin:6px 0 4px;letter-spacing:-.02em}\r
.w.w-game.v-panax4-bars .meta {font-size:13px;color:rgba(241,238,248,.65)}\r
.w.w-game.v-panax4-bars .tags {display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}\r
.w.w-game.v-panax4-bars .tags span {font-size:12px;padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}\r
.w.w-game.v-panax4-bars .btn {margin-top:auto;align-self:flex-start;text-decoration:none;font-weight:700;font-size:13px;padding:10px 16px;border-radius:12px;background:var(--ac);color:#2b1200}\r
.w.w-game.v-panax4-bars .v1 {--ac:#ff8a3d}\r
.w.w-game.v-panax4-bars .v1 .pill {display:inline-flex;align-items:center;gap:8px;border-radius:99px;padding:6px 12px;background:color-mix(in srgb,var(--c) 22%,transparent);border:1px solid var(--c);color:var(--c);font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.05em;align-self:flex-start}\r
.w.w-game.v-panax4-bars .v1 .pill b {color:#fff;font-size:14px}\r
.w.w-game.v-panax4-bars .v1 .mini {display:flex;align-items:flex-end;gap:5px;height:34px;margin-top:12px}\r
.w.w-game.v-panax4-bars .v1 .mini i {flex:1;background:var(--c);border-radius:3px 3px 0 0;height:var(--h);opacity:.9}\r
.w.w-game.v-panax4-bars .v1 .mini i.z {background:#3a3550;height:4px}\r
.w.w-game.v-panax4-bars .v1 .row {display:flex;align-items:center;gap:12px;margin-top:auto;padding-top:12px}\r
.w.w-game.v-panax4-bars .v2 {--ac:#f5c800}\r
.w.w-game.v-panax4-bars .v2 .row {display:flex;align-items:center;gap:14px;margin-top:10px}\r
.w.w-game.v-panax4-bars .v2 .medal {width:64px;height:64px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3b8,var(--c) 55%,#3a2a00);display:grid;place-items:center;flex:none;box-shadow:0 0 0 3px #1a1430,0 0 0 5px var(--c)}\r
.w.w-game.v-panax4-bars .v2 .medal b {font-size:20px;font-weight:900;color:#2b1d00}\r
.w.w-game.v-panax4-bars .v2 .medal small {display:block;font-size:8px;font-weight:800;color:#2b1d00;text-transform:uppercase;text-align:center;letter-spacing:.04em}\r
.w.w-game.v-panax4-bars .v2 .top3 {font-size:12px;line-height:1.7;color:rgba(241,238,248,.75)}\r
.w.w-game.v-panax4-bars .v2 .top3 b {color:#fff}\r
.w.w-game.v-panax4-bars .v2 .foot {margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px}\r
.w.w-game.v-panax4-bars .v3 {--ac:#ff8a3d}\r
.w.w-game.v-panax4-bars .v3 .lbl {display:flex;justify-content:space-between;font-size:12px;color:rgba(241,238,248,.7);margin-top:12px}\r
.w.w-game.v-panax4-bars .v3 .lbl b {color:var(--ac)}\r
.w.w-game.v-panax4-bars .v3 .strip {display:flex;height:12px;border-radius:99px;overflow:hidden;margin-top:6px;background:#2a2540}\r
.w.w-game.v-panax4-bars .v3 .strip i {height:100%;width:var(--w);background:var(--c)}\r
.w.w-game.v-panax4-bars .v3 .strip i:first-child {border-radius:99px 0 0 99px}\r
.w.w-game.v-panax4-bars .v3 .foot {margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:10px;padding-top:12px}\r
.w.w-game.v-panax4-bars .v4 {--ac:#b565f5}\r
.w.w-game.v-panax4-bars .v4 .track {position:relative;height:10px;border-radius:99px;margin:22px 4px 8px;background:linear-gradient(90deg,#e0475b,#8fa3b8 22%,#3b9cff 40%,#b565f5 60%,#f59e0b 80%,#f5c800)}\r
.w.w-game.v-panax4-bars .v4 .knob {position:absolute;top:50%;left:var(--x);transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.2),0 0 14px var(--c)}\r
.w.w-game.v-panax4-bars .v4 .knob::after {content:attr(data-l);position:absolute;bottom:30px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:11px;font-weight:800;color:var(--c);text-transform:uppercase}\r
.w.w-game.v-panax4-bars .v4 .ends {display:flex;justify-content:space-between;font-size:10px;font-weight:800;letter-spacing:.06em;color:rgba(241,238,248,.5);text-transform:uppercase}\r
.w.w-game.v-panax4-bars .v4 .pct {font-size:13px;margin-top:8px;color:rgba(241,238,248,.8)}\r
.w.w-game.v-panax4-bars .v4 .pct b {color:var(--c)}\r
.w.w-game.v-panax4-bars .v4 .foot {margin-top:auto;padding-top:10px}\r
.w.w-game.v-panax4-medal {box-sizing:border-box;padding:24px 16px;padding-top:max(24px,env(safe-area-inset-top,0px));padding-bottom:max(24px,env(safe-area-inset-bottom,0px));--bg:#f3f1ec;--fg:#1c1b1a;--mut:#6d6a64}\r
@media (prefers-color-scheme:dark) {\r
.w.w-game.v-panax4-medal :root:not([data-theme="light"]) {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
}\r
.w.w-game.v-panax4-medal {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
:where(.w.w-game.v-panax4-medal) * {box-sizing:border-box}\r
.w.w-game.v-panax4-medal h1 {font-size:20px;margin:0 0 4px}\r
.w.w-game.v-panax4-medal p.lead {color:var(--mut);margin:0 0 8px;font-size:14px}\r
.w.w-game.v-panax4-medal h2 {font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:38px 0 14px}\r
.w.w-game.v-panax4-medal .stack {display:grid;gap:18px}\r
.w.w-game.v-panax4-medal .card {position:relative;border-radius:18px;padding:18px;display:flex;gap:18px;color:#f1eef8;background:linear-gradient(135deg,#1a1430,#141a26);border:1px solid rgba(255,138,61,.25);box-shadow:0 12px 30px rgba(0,0,0,.35);overflow:hidden}\r
.w.w-game.v-panax4-medal .cover {flex:0 0 118px;height:168px;border-radius:12px;background:radial-gradient(circle at 70% 25%,#ffe9a8 0 7%,transparent 8%),linear-gradient(160deg,#7ee08a 0%,#2c6b52 45%,#0e1f2b 100%);position:relative;overflow:hidden;box-shadow:0 10px 22px rgba(0,0,0,.5)}\r
.w.w-game.v-panax4-medal .cover::after {content:"";position:absolute;left:-10%;right:-10%;bottom:-5%;height:55%;background:#0b1620;clip-path:polygon(0 70%,30% 25%,52% 55%,75% 15%,100% 60%,100% 100%,0 100%);opacity:.85}\r
.w.w-game.v-panax4-medal .body {flex:1;min-width:0;display:flex;flex-direction:column}\r
.w.w-game.v-panax4-medal .kick {font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ac)}\r
.w.w-game.v-panax4-medal .title {font-size:24px;font-weight:800;line-height:1.1;margin:6px 0 4px;letter-spacing:-.02em}\r
.w.w-game.v-panax4-medal .meta {font-size:13px;color:rgba(241,238,248,.65)}\r
.w.w-game.v-panax4-medal .tags {display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}\r
.w.w-game.v-panax4-medal .tags span {font-size:12px;padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}\r
.w.w-game.v-panax4-medal .btn {margin-top:auto;align-self:flex-start;text-decoration:none;font-weight:700;font-size:13px;padding:10px 16px;border-radius:12px;background:var(--ac);color:#2b1200}\r
.w.w-game.v-panax4-medal .v1 {--ac:#ff8a3d}\r
.w.w-game.v-panax4-medal .v1 .pill {display:inline-flex;align-items:center;gap:8px;border-radius:99px;padding:6px 12px;background:color-mix(in srgb,var(--c) 22%,transparent);border:1px solid var(--c);color:var(--c);font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.05em;align-self:flex-start}\r
.w.w-game.v-panax4-medal .v1 .pill b {color:#fff;font-size:14px}\r
.w.w-game.v-panax4-medal .v1 .mini {display:flex;align-items:flex-end;gap:5px;height:34px;margin-top:12px}\r
.w.w-game.v-panax4-medal .v1 .mini i {flex:1;background:var(--c);border-radius:3px 3px 0 0;height:var(--h);opacity:.9}\r
.w.w-game.v-panax4-medal .v1 .mini i.z {background:#3a3550;height:4px}\r
.w.w-game.v-panax4-medal .v1 .row {display:flex;align-items:center;gap:12px;margin-top:auto;padding-top:12px}\r
.w.w-game.v-panax4-medal .v2 {--ac:#f5c800}\r
.w.w-game.v-panax4-medal .v2 .row {display:flex;align-items:center;gap:14px;margin-top:10px}\r
.w.w-game.v-panax4-medal .v2 .medal {width:64px;height:64px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3b8,var(--c) 55%,#3a2a00);display:grid;place-items:center;flex:none;box-shadow:0 0 0 3px #1a1430,0 0 0 5px var(--c)}\r
.w.w-game.v-panax4-medal .v2 .medal b {font-size:20px;font-weight:900;color:#2b1d00}\r
.w.w-game.v-panax4-medal .v2 .medal small {display:block;font-size:8px;font-weight:800;color:#2b1d00;text-transform:uppercase;text-align:center;letter-spacing:.04em}\r
.w.w-game.v-panax4-medal .v2 .top3 {font-size:12px;line-height:1.7;color:rgba(241,238,248,.75)}\r
.w.w-game.v-panax4-medal .v2 .top3 b {color:#fff}\r
.w.w-game.v-panax4-medal .v2 .foot {margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px}\r
.w.w-game.v-panax4-medal .v3 {--ac:#ff8a3d}\r
.w.w-game.v-panax4-medal .v3 .lbl {display:flex;justify-content:space-between;font-size:12px;color:rgba(241,238,248,.7);margin-top:12px}\r
.w.w-game.v-panax4-medal .v3 .lbl b {color:var(--ac)}\r
.w.w-game.v-panax4-medal .v3 .strip {display:flex;height:12px;border-radius:99px;overflow:hidden;margin-top:6px;background:#2a2540}\r
.w.w-game.v-panax4-medal .v3 .strip i {height:100%;width:var(--w);background:var(--c)}\r
.w.w-game.v-panax4-medal .v3 .strip i:first-child {border-radius:99px 0 0 99px}\r
.w.w-game.v-panax4-medal .v3 .foot {margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:10px;padding-top:12px}\r
.w.w-game.v-panax4-medal .v4 {--ac:#b565f5}\r
.w.w-game.v-panax4-medal .v4 .track {position:relative;height:10px;border-radius:99px;margin:22px 4px 8px;background:linear-gradient(90deg,#e0475b,#8fa3b8 22%,#3b9cff 40%,#b565f5 60%,#f59e0b 80%,#f5c800)}\r
.w.w-game.v-panax4-medal .v4 .knob {position:absolute;top:50%;left:var(--x);transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.2),0 0 14px var(--c)}\r
.w.w-game.v-panax4-medal .v4 .knob::after {content:attr(data-l);position:absolute;bottom:30px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:11px;font-weight:800;color:var(--c);text-transform:uppercase}\r
.w.w-game.v-panax4-medal .v4 .ends {display:flex;justify-content:space-between;font-size:10px;font-weight:800;letter-spacing:.06em;color:rgba(241,238,248,.5);text-transform:uppercase}\r
.w.w-game.v-panax4-medal .v4 .pct {font-size:13px;margin-top:8px;color:rgba(241,238,248,.8)}\r
.w.w-game.v-panax4-medal .v4 .pct b {color:var(--c)}\r
.w.w-game.v-panax4-medal .v4 .foot {margin-top:auto;padding-top:10px}\r
.w.w-game.v-panax4-gradient {box-sizing:border-box;padding:24px 16px;padding-top:max(24px,env(safe-area-inset-top,0px));padding-bottom:max(24px,env(safe-area-inset-bottom,0px));--bg:#f3f1ec;--fg:#1c1b1a;--mut:#6d6a64}\r
@media (prefers-color-scheme:dark) {\r
.w.w-game.v-panax4-gradient :root:not([data-theme="light"]) {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
}\r
.w.w-game.v-panax4-gradient {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
:where(.w.w-game.v-panax4-gradient) * {box-sizing:border-box}\r
.w.w-game.v-panax4-gradient h1 {font-size:20px;margin:0 0 4px}\r
.w.w-game.v-panax4-gradient p.lead {color:var(--mut);margin:0 0 8px;font-size:14px}\r
.w.w-game.v-panax4-gradient h2 {font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:38px 0 14px}\r
.w.w-game.v-panax4-gradient .stack {display:grid;gap:18px}\r
.w.w-game.v-panax4-gradient .card {position:relative;border-radius:18px;padding:18px;display:flex;gap:18px;color:#f1eef8;background:linear-gradient(135deg,#1a1430,#141a26);border:1px solid rgba(255,138,61,.25);box-shadow:0 12px 30px rgba(0,0,0,.35);overflow:hidden}\r
.w.w-game.v-panax4-gradient .cover {flex:0 0 118px;height:168px;border-radius:12px;background:radial-gradient(circle at 70% 25%,#ffe9a8 0 7%,transparent 8%),linear-gradient(160deg,#7ee08a 0%,#2c6b52 45%,#0e1f2b 100%);position:relative;overflow:hidden;box-shadow:0 10px 22px rgba(0,0,0,.5)}\r
.w.w-game.v-panax4-gradient .cover::after {content:"";position:absolute;left:-10%;right:-10%;bottom:-5%;height:55%;background:#0b1620;clip-path:polygon(0 70%,30% 25%,52% 55%,75% 15%,100% 60%,100% 100%,0 100%);opacity:.85}\r
.w.w-game.v-panax4-gradient .body {flex:1;min-width:0;display:flex;flex-direction:column}\r
.w.w-game.v-panax4-gradient .kick {font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ac)}\r
.w.w-game.v-panax4-gradient .title {font-size:24px;font-weight:800;line-height:1.1;margin:6px 0 4px;letter-spacing:-.02em}\r
.w.w-game.v-panax4-gradient .meta {font-size:13px;color:rgba(241,238,248,.65)}\r
.w.w-game.v-panax4-gradient .tags {display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}\r
.w.w-game.v-panax4-gradient .tags span {font-size:12px;padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}\r
.w.w-game.v-panax4-gradient .btn {margin-top:auto;align-self:flex-start;text-decoration:none;font-weight:700;font-size:13px;padding:10px 16px;border-radius:12px;background:var(--ac);color:#2b1200}\r
.w.w-game.v-panax4-gradient .v1 {--ac:#ff8a3d}\r
.w.w-game.v-panax4-gradient .v1 .pill {display:inline-flex;align-items:center;gap:8px;border-radius:99px;padding:6px 12px;background:color-mix(in srgb,var(--c) 22%,transparent);border:1px solid var(--c);color:var(--c);font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.05em;align-self:flex-start}\r
.w.w-game.v-panax4-gradient .v1 .pill b {color:#fff;font-size:14px}\r
.w.w-game.v-panax4-gradient .v1 .mini {display:flex;align-items:flex-end;gap:5px;height:34px;margin-top:12px}\r
.w.w-game.v-panax4-gradient .v1 .mini i {flex:1;background:var(--c);border-radius:3px 3px 0 0;height:var(--h);opacity:.9}\r
.w.w-game.v-panax4-gradient .v1 .mini i.z {background:#3a3550;height:4px}\r
.w.w-game.v-panax4-gradient .v1 .row {display:flex;align-items:center;gap:12px;margin-top:auto;padding-top:12px}\r
.w.w-game.v-panax4-gradient .v2 {--ac:#f5c800}\r
.w.w-game.v-panax4-gradient .v2 .row {display:flex;align-items:center;gap:14px;margin-top:10px}\r
.w.w-game.v-panax4-gradient .v2 .medal {width:64px;height:64px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3b8,var(--c) 55%,#3a2a00);display:grid;place-items:center;flex:none;box-shadow:0 0 0 3px #1a1430,0 0 0 5px var(--c)}\r
.w.w-game.v-panax4-gradient .v2 .medal b {font-size:20px;font-weight:900;color:#2b1d00}\r
.w.w-game.v-panax4-gradient .v2 .medal small {display:block;font-size:8px;font-weight:800;color:#2b1d00;text-transform:uppercase;text-align:center;letter-spacing:.04em}\r
.w.w-game.v-panax4-gradient .v2 .top3 {font-size:12px;line-height:1.7;color:rgba(241,238,248,.75)}\r
.w.w-game.v-panax4-gradient .v2 .top3 b {color:#fff}\r
.w.w-game.v-panax4-gradient .v2 .foot {margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px}\r
.w.w-game.v-panax4-gradient .v3 {--ac:#ff8a3d}\r
.w.w-game.v-panax4-gradient .v3 .lbl {display:flex;justify-content:space-between;font-size:12px;color:rgba(241,238,248,.7);margin-top:12px}\r
.w.w-game.v-panax4-gradient .v3 .lbl b {color:var(--ac)}\r
.w.w-game.v-panax4-gradient .v3 .strip {display:flex;height:12px;border-radius:99px;overflow:hidden;margin-top:6px;background:#2a2540}\r
.w.w-game.v-panax4-gradient .v3 .strip i {height:100%;width:var(--w);background:var(--c)}\r
.w.w-game.v-panax4-gradient .v3 .strip i:first-child {border-radius:99px 0 0 99px}\r
.w.w-game.v-panax4-gradient .v3 .foot {margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:10px;padding-top:12px}\r
.w.w-game.v-panax4-gradient .v4 {--ac:#b565f5}\r
.w.w-game.v-panax4-gradient .v4 .track {position:relative;height:10px;border-radius:99px;margin:22px 4px 8px;background:linear-gradient(90deg,#e0475b,#8fa3b8 22%,#3b9cff 40%,#b565f5 60%,#f59e0b 80%,#f5c800)}\r
.w.w-game.v-panax4-gradient .v4 .knob {position:absolute;top:50%;left:var(--x);transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.2),0 0 14px var(--c)}\r
.w.w-game.v-panax4-gradient .v4 .knob::after {content:attr(data-l);position:absolute;bottom:30px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:11px;font-weight:800;color:var(--c);text-transform:uppercase}\r
.w.w-game.v-panax4-gradient .v4 .ends {display:flex;justify-content:space-between;font-size:10px;font-weight:800;letter-spacing:.06em;color:rgba(241,238,248,.5);text-transform:uppercase}\r
.w.w-game.v-panax4-gradient .v4 .pct {font-size:13px;margin-top:8px;color:rgba(241,238,248,.8)}\r
.w.w-game.v-panax4-gradient .v4 .pct b {color:var(--c)}\r
.w.w-game.v-panax4-gradient .v4 .foot {margin-top:auto;padding-top:10px}\r
.w.w-game.v-panax4-scale {box-sizing:border-box;padding:24px 16px;padding-top:max(24px,env(safe-area-inset-top,0px));padding-bottom:max(24px,env(safe-area-inset-bottom,0px));--bg:#f3f1ec;--fg:#1c1b1a;--mut:#6d6a64}\r
@media (prefers-color-scheme:dark) {\r
.w.w-game.v-panax4-scale :root:not([data-theme="light"]) {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
}\r
.w.w-game.v-panax4-scale {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
:where(.w.w-game.v-panax4-scale) * {box-sizing:border-box}\r
.w.w-game.v-panax4-scale h1 {font-size:20px;margin:0 0 4px}\r
.w.w-game.v-panax4-scale p.lead {color:var(--mut);margin:0 0 8px;font-size:14px}\r
.w.w-game.v-panax4-scale h2 {font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:38px 0 14px}\r
.w.w-game.v-panax4-scale .stack {display:grid;gap:18px}\r
.w.w-game.v-panax4-scale .card {position:relative;border-radius:18px;padding:18px;display:flex;gap:18px;color:#f1eef8;background:linear-gradient(135deg,#1a1430,#141a26);border:1px solid rgba(255,138,61,.25);box-shadow:0 12px 30px rgba(0,0,0,.35);overflow:hidden}\r
.w.w-game.v-panax4-scale .cover {flex:0 0 118px;height:168px;border-radius:12px;background:radial-gradient(circle at 70% 25%,#ffe9a8 0 7%,transparent 8%),linear-gradient(160deg,#7ee08a 0%,#2c6b52 45%,#0e1f2b 100%);position:relative;overflow:hidden;box-shadow:0 10px 22px rgba(0,0,0,.5)}\r
.w.w-game.v-panax4-scale .cover::after {content:"";position:absolute;left:-10%;right:-10%;bottom:-5%;height:55%;background:#0b1620;clip-path:polygon(0 70%,30% 25%,52% 55%,75% 15%,100% 60%,100% 100%,0 100%);opacity:.85}\r
.w.w-game.v-panax4-scale .body {flex:1;min-width:0;display:flex;flex-direction:column}\r
.w.w-game.v-panax4-scale .kick {font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ac)}\r
.w.w-game.v-panax4-scale .title {font-size:24px;font-weight:800;line-height:1.1;margin:6px 0 4px;letter-spacing:-.02em}\r
.w.w-game.v-panax4-scale .meta {font-size:13px;color:rgba(241,238,248,.65)}\r
.w.w-game.v-panax4-scale .tags {display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}\r
.w.w-game.v-panax4-scale .tags span {font-size:12px;padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}\r
.w.w-game.v-panax4-scale .btn {margin-top:auto;align-self:flex-start;text-decoration:none;font-weight:700;font-size:13px;padding:10px 16px;border-radius:12px;background:var(--ac);color:#2b1200}\r
.w.w-game.v-panax4-scale .v1 {--ac:#ff8a3d}\r
.w.w-game.v-panax4-scale .v1 .pill {display:inline-flex;align-items:center;gap:8px;border-radius:99px;padding:6px 12px;background:color-mix(in srgb,var(--c) 22%,transparent);border:1px solid var(--c);color:var(--c);font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.05em;align-self:flex-start}\r
.w.w-game.v-panax4-scale .v1 .pill b {color:#fff;font-size:14px}\r
.w.w-game.v-panax4-scale .v1 .mini {display:flex;align-items:flex-end;gap:5px;height:34px;margin-top:12px}\r
.w.w-game.v-panax4-scale .v1 .mini i {flex:1;background:var(--c);border-radius:3px 3px 0 0;height:var(--h);opacity:.9}\r
.w.w-game.v-panax4-scale .v1 .mini i.z {background:#3a3550;height:4px}\r
.w.w-game.v-panax4-scale .v1 .row {display:flex;align-items:center;gap:12px;margin-top:auto;padding-top:12px}\r
.w.w-game.v-panax4-scale .v2 {--ac:#f5c800}\r
.w.w-game.v-panax4-scale .v2 .row {display:flex;align-items:center;gap:14px;margin-top:10px}\r
.w.w-game.v-panax4-scale .v2 .medal {width:64px;height:64px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3b8,var(--c) 55%,#3a2a00);display:grid;place-items:center;flex:none;box-shadow:0 0 0 3px #1a1430,0 0 0 5px var(--c)}\r
.w.w-game.v-panax4-scale .v2 .medal b {font-size:20px;font-weight:900;color:#2b1d00}\r
.w.w-game.v-panax4-scale .v2 .medal small {display:block;font-size:8px;font-weight:800;color:#2b1d00;text-transform:uppercase;text-align:center;letter-spacing:.04em}\r
.w.w-game.v-panax4-scale .v2 .top3 {font-size:12px;line-height:1.7;color:rgba(241,238,248,.75)}\r
.w.w-game.v-panax4-scale .v2 .top3 b {color:#fff}\r
.w.w-game.v-panax4-scale .v2 .foot {margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px}\r
.w.w-game.v-panax4-scale .v3 {--ac:#ff8a3d}\r
.w.w-game.v-panax4-scale .v3 .lbl {display:flex;justify-content:space-between;font-size:12px;color:rgba(241,238,248,.7);margin-top:12px}\r
.w.w-game.v-panax4-scale .v3 .lbl b {color:var(--ac)}\r
.w.w-game.v-panax4-scale .v3 .strip {display:flex;height:12px;border-radius:99px;overflow:hidden;margin-top:6px;background:#2a2540}\r
.w.w-game.v-panax4-scale .v3 .strip i {height:100%;width:var(--w);background:var(--c)}\r
.w.w-game.v-panax4-scale .v3 .strip i:first-child {border-radius:99px 0 0 99px}\r
.w.w-game.v-panax4-scale .v3 .foot {margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:10px;padding-top:12px}\r
.w.w-game.v-panax4-scale .v4 {--ac:#b565f5}\r
.w.w-game.v-panax4-scale .v4 .track {position:relative;height:10px;border-radius:99px;margin:22px 4px 8px;background:linear-gradient(90deg,#e0475b,#8fa3b8 22%,#3b9cff 40%,#b565f5 60%,#f59e0b 80%,#f5c800)}\r
.w.w-game.v-panax4-scale .v4 .knob {position:absolute;top:50%;left:var(--x);transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.2),0 0 14px var(--c)}\r
.w.w-game.v-panax4-scale .v4 .knob::after {content:attr(data-l);position:absolute;bottom:30px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:11px;font-weight:800;color:var(--c);text-transform:uppercase}\r
.w.w-game.v-panax4-scale .v4 .ends {display:flex;justify-content:space-between;font-size:10px;font-weight:800;letter-spacing:.06em;color:rgba(241,238,248,.5);text-transform:uppercase}\r
.w.w-game.v-panax4-scale .v4 .pct {font-size:13px;margin-top:8px;color:rgba(241,238,248,.8)}\r
.w.w-game.v-panax4-scale .v4 .pct b {color:var(--c)}\r
.w.w-game.v-panax4-scale .v4 .foot {margin-top:auto;padding-top:10px}\r
.w.w-game.kimi-scope{color:var(--text);font-family:var(--sans)}\r
.w.w-game.kimi-scope {\r
  --p-paper:oklch(0.965 0.012 140);--p-ink:oklch(0.235 0.018 40);--p-blue:oklch(0.39 0.29 275);--p-line:oklch(0.88 0.014 140);--p-muted:oklch(0.47 0.02 60);--p-yellow:oklch(0.96 0.19 105);--p-orange:oklch(0.65 0.17 45);--p-lime:oklch(0.93 0.22 125);--p-night:oklch(0.22 0.025 180);--p-grey:oklch(0.79 0.012 220);\r
  --surface:var(--p-paper);--text:var(--p-ink);--muted:var(--p-muted);--accent:var(--p-blue);--line:var(--p-line);\r
  --sans:'Manrope',sans-serif;--serif:'Literata',serif;--mono:'IBM Plex Mono',monospace;\r
  --radius:6px;--shadow:0 20px 50px oklch(0.235 0.018 40 / .07);\r
}\r
:where(.w.w-game.kimi-scope) * {box-sizing:border-box;margin:0;padding:0}\r
.w.w-game.kimi-scope button, .w.w-game.kimi-scope a, .w.w-game.kimi-scope select {-webkit-tap-highlight-color:transparent}\r
.w.w-game.kimi-scope button, .w.w-game.kimi-scope select {font:inherit}\r
.w.w-game.kimi-scope button, .w.w-game.kimi-scope a {cursor:pointer}\r
.w.w-game.kimi-scope a {color:inherit;text-decoration:none}\r
.w.w-game.kimi-scope img {display:block;max-width:100%}\r
.w.w-game.kimi-scope :focus-visible {outline:3px solid var(--accent);outline-offset:4px}\r
.w.w-game.kimi-scope ::selection {background:var(--p-yellow);color:var(--text)}\r
.w.w-game.kimi-scope .skip-link {position:fixed;left:16px;top:12px;z-index:20;padding:10px 16px;background:var(--text);color:var(--surface);transform:translateY(-160%);transition:transform .2s ease-out}\r
.w.w-game.kimi-scope .skip-link:focus {transform:translateY(0)}\r
.w.w-game.kimi-scope .site-header {min-height:72px;padding:12px max(24px,calc((100vw - 1400px)/2));display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:10;background:oklch(0.965 0.012 140 / .93);backdrop-filter:blur(12px)}\r
.w.w-game.kimi-scope .brand {display:flex;align-items:center;gap:12px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;min-height:44px}\r
.w.w-game.kimi-scope .brand-mark {display:grid;place-items:center;width:36px;height:36px;background:var(--text);color:var(--surface);font:600 12px var(--mono);letter-spacing:-.06em}\r
.w.w-game.kimi-scope .source-switch {display:flex;border:1px solid var(--text);padding:3px;background:var(--surface)}\r
.w.w-game.kimi-scope .source-button {border:0;background:transparent;min-height:44px;padding:8px 18px;color:var(--text);font:500 12px var(--mono);transition:background .18s ease-out,color .18s ease-out}\r
.w.w-game.kimi-scope .source-button:hover {background:oklch(0.92 0.014 140)}\r
.w.w-game.kimi-scope .source-button.is-active {background:var(--text);color:var(--surface)}\r
.w.w-game.kimi-scope .intro {max-width:1400px;margin:auto;padding:88px 24px 96px;display:grid;grid-template-columns:5fr 7fr;gap:48px;align-items:end}\r
.w.w-game.kimi-scope .intro-index {font:600 clamp(100px,17vw,236px)/.75 var(--mono);letter-spacing:-.12em;color:var(--text);white-space:nowrap}\r
.w.w-game.kimi-scope .intro-index span {display:block;margin:36px 0 0 8px;font:400 13px var(--mono);letter-spacing:.12em;color:var(--muted)}\r
.w.w-game.kimi-scope .kicker, .w.w-game.kimi-scope .w-kicker {font:500 11px var(--mono);text-transform:uppercase;letter-spacing:.12em}\r
.w.w-game.kimi-scope .intro-copy {max-width:680px}\r
.w.w-game.kimi-scope .intro-copy h1 {margin:18px 0 28px;font:600 clamp(42px,5.4vw,78px)/1.03 var(--serif);letter-spacing:-.055em;text-wrap:balance}\r
.w.w-game.kimi-scope .intro-lead {max-width:62ch;font-size:17px;line-height:1.7;color:var(--muted)}\r
.w.w-game.kimi-scope .intro-notes {display:flex;flex-wrap:wrap;gap:8px 24px;margin-top:28px;font:500 11px var(--mono);text-transform:uppercase}\r
.w.w-game.kimi-scope .intro-notes span:before {content:'+';color:var(--accent);margin-right:8px}\r
.w.w-game.kimi-scope .gallery-layout {max-width:1400px;margin:auto;padding:0 24px 96px;display:grid;grid-template-columns:220px minmax(0,1fr);gap:56px}\r
.w.w-game.kimi-scope .side-nav {align-self:start;position:sticky;top:104px}\r
.w.w-game.kimi-scope .side-nav>p {margin-bottom:16px;font:500 11px var(--mono);text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}\r
.w.w-game.kimi-scope .side-nav nav {border-top:1px solid var(--line)}\r
.w.w-game.kimi-scope .side-nav nav a {display:flex;align-items:center;gap:14px;min-height:44px;padding:10px 0;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted);transition:color .18s ease-out,transform .18s ease-out}\r
.w.w-game.kimi-scope .side-nav nav a span {font:400 10px var(--mono)}\r
.w.w-game.kimi-scope .side-nav nav a:hover {color:var(--text);transform:translateX(3px)}\r
.w.w-game.kimi-scope .side-nav nav a.is-current {color:var(--accent);font-weight:700}\r
.w.w-game.kimi-scope .side-legend {display:flex;gap:10px;margin-top:24px;color:var(--muted);font-size:11px;line-height:1.55}\r
.w.w-game.kimi-scope .side-legend i {width:7px;height:7px;margin-top:5px;flex:0 0 auto;border-radius:50%;background:var(--accent)}\r
.w.w-game.kimi-scope .gallery {min-width:0}\r
.w.w-game.kimi-scope .variant {padding:0 0 88px;margin-bottom:88px;border-bottom:1px solid var(--line);scroll-margin-top:96px}\r
.w.w-game.kimi-scope .variant:last-child {margin-bottom:0;border-bottom:0}\r
.w.w-game.kimi-scope .variant-header {display:flex;align-items:center;gap:20px}\r
.w.w-game.kimi-scope .variant-number {font:400 13px var(--mono);color:var(--accent)}\r
.w.w-game.kimi-scope .variant-header p {font:500 10px var(--mono);text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}\r
.w.w-game.kimi-scope .variant-header h2 {margin-top:2px;font:600 clamp(25px,3vw,38px)/1.2 var(--serif);letter-spacing:-.035em}\r
.w.w-game.kimi-scope .variant-description {max-width:65ch;margin:16px 0 28px 40px;color:var(--muted);font-size:14px;line-height:1.7}\r
.w.w-game.kimi-scope .widget-stage {padding:48px;background:oklch(0.935 0.01 140);background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:24px 24px;border:1px solid var(--line)}\r
.w.w-game.kimi-scope .game-widget {width:min(100%,900px);margin:auto;position:relative;isolation:isolate;font-family:var(--sans);color:var(--text);box-shadow:var(--shadow)}\r
.w.w-game.kimi-scope .game-widget * {min-width:0}\r
.w.w-game.kimi-scope .game-widget h3 {text-wrap:balance;overflow-wrap:anywhere}\r
.w.w-game.kimi-scope .game-widget .cover {width:100%;height:100%;object-fit:cover;aspect-ratio:5/7}\r
.w.w-game.kimi-scope .widget-link {display:inline-flex;align-items:center;justify-content:space-between;gap:20px;min-height:44px;font:600 12px var(--mono);text-transform:uppercase;transition:background .18s ease-out,color .18s ease-out,transform .18s ease-out}\r
.w.w-game.kimi-scope .widget-link:hover {transform:translateY(-2px)}\r
.w.w-game.kimi-scope .widget-link:active {transform:translateY(0)}\r
.w.w-game.kimi-scope .mobile-jump {display:none}\r
.w.w-game.kimi-scope .site-footer {max-width:1400px;margin:auto;padding:40px 24px 56px;border-top:1px solid var(--text);display:grid;grid-template-columns:1fr 1fr auto;gap:24px;align-items:start;font-size:12px;color:var(--muted)}\r
.w.w-game.kimi-scope .site-footer strong {color:var(--text)}\r
.w.w-game.kimi-scope .site-footer a {min-height:44px;color:var(--text);font:500 12px var(--mono)}\r
.w.w-game.kimi-scope .toast.is-visible {opacity:1;transform:translate(-50%,0)}\r
.w.w-game.kimi-scope .w-editorial {display:grid;grid-template-columns:128px minmax(0,1fr) 120px;gap:28px;padding:28px;background:oklch(0.985 0.008 140);border-top:2px solid var(--text);border-bottom:1px solid var(--text);box-shadow:none}\r
.w.w-game.kimi-scope .editorial-main h3 {margin:8px 0 4px;font:600 clamp(28px,4vw,44px)/1.08 var(--serif);letter-spacing:-.045em}\r
.w.w-game.kimi-scope .editorial-deck {font:400 13px var(--serif);color:var(--muted)}\r
.w.w-game.kimi-scope .editorial-main .meta {display:flex;flex-wrap:wrap;gap:4px 16px;margin:18px 0 12px;font-size:11px;color:var(--muted)}\r
.w.w-game.kimi-scope .editorial-main .widget-link {color:var(--accent);border-bottom:1px solid currentColor;min-height:36px}\r
.w.w-game.kimi-scope .editorial-score {padding-left:24px;border-left:1px solid var(--line);display:flex;flex-direction:column;align-items:flex-end;justify-content:center}\r
.w.w-game.kimi-scope .editorial-score>span {font:400 10px var(--mono);text-transform:uppercase;color:var(--muted)}\r
.w.w-game.kimi-scope .editorial-score strong {font:400 64px/.95 var(--serif);letter-spacing:-.08em;color:var(--accent)}\r
.w.w-game.kimi-scope .editorial-score small {font:400 11px var(--mono);color:var(--muted)}\r
.w.w-game.kimi-scope .w-swiss {background:oklch(0.99 0 0);border:1px solid oklch(0.85 0 0);box-shadow:none;font-family:var(--mono)}\r
.w.w-game.kimi-scope .swiss-head, .w.w-game.kimi-scope .swiss-foot {display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 16px;background:var(--p-yellow);font-size:10px;font-weight:600;letter-spacing:.05em}\r
.w.w-game.kimi-scope .swiss-grid {display:grid;grid-template-columns:120px minmax(0,1fr) 160px}\r
.w.w-game.kimi-scope .swiss-grid>.cover {border-right:1px solid oklch(0.85 0 0)}\r
.w.w-game.kimi-scope .swiss-title {padding:24px;border-right:1px solid oklch(0.85 0 0)}\r
.w.w-game.kimi-scope .swiss-title>p {font-size:9px;text-transform:uppercase}\r
.w.w-game.kimi-scope .swiss-title h3 {margin:12px 0 20px;font:600 clamp(30px,4vw,48px)/.92 var(--sans);letter-spacing:-.065em;text-transform:uppercase}\r
.w.w-game.kimi-scope .swiss-title .meta {font-size:9px;line-height:1.8;color:oklch(0.4 0 0)}\r
.w.w-game.kimi-scope .swiss-score {padding:24px 18px;display:flex;flex-direction:column;justify-content:center}\r
.w.w-game.kimi-scope .swiss-score>span {font-size:9px}\r
.w.w-game.kimi-scope .swiss-score strong {font:500 64px/1.2 var(--mono);letter-spacing:-.08em}\r
.w.w-game.kimi-scope .score-track {height:7px;background:oklch(0.88 0 0)}\r
.w.w-game.kimi-scope .score-track i {display:block;height:100%;background:var(--p-yellow);width:84%;transition:width .25s ease-out}\r
.w.w-game.kimi-scope .swiss-foot {background:oklch(0.99 0 0);border-top:1px solid oklch(0.85 0 0)}\r
.w.w-game.kimi-scope .swiss-foot .widget-link {min-height:32px;color:var(--accent)}\r
.w.w-game.kimi-scope .w-terminal {background:oklch(0.205 0.025 170);color:oklch(0.93 0.035 130);border:1px solid oklch(0.4 0.04 160);box-shadow:0 20px 50px oklch(0.15 0.03 170 / .22);font-family:var(--mono)}\r
.w.w-game.kimi-scope .terminal-top {display:flex;justify-content:space-between;gap:16px;padding:12px 18px;border-bottom:1px solid oklch(0.4 0.04 160);font-size:10px;letter-spacing:.06em}\r
.w.w-game.kimi-scope .terminal-status {color:var(--p-lime)}\r
.w.w-game.kimi-scope .terminal-body {display:grid;grid-template-columns:104px minmax(0,1fr);gap:24px;padding:24px}\r
.w.w-game.kimi-scope .terminal-body .cover {border:1px solid oklch(0.45 0.04 160)}\r
.w.w-game.kimi-scope .terminal-path {font-size:10px;color:oklch(0.72 0.04 145)}\r
.w.w-game.kimi-scope .terminal-body h3 {margin:8px 0 20px;font:500 clamp(22px,3vw,34px)/1.2 var(--mono);letter-spacing:-.05em;color:var(--p-lime)}\r
.w.w-game.kimi-scope .terminal-body dl {font-size:11px}\r
.w.w-game.kimi-scope .terminal-body dl>div {display:grid;grid-template-columns:100px 1fr;gap:12px;padding:4px 0}\r
.w.w-game.kimi-scope .terminal-body dt {color:oklch(0.68 0.03 145)}\r
.w.w-game.kimi-scope .terminal-body dd {color:oklch(0.96 0.02 130)}\r
.w.w-game.kimi-scope .terminal-rating {display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;border-top:1px solid oklch(0.4 0.04 160);font-size:11px}\r
.w.w-game.kimi-scope .terminal-bars {font-style:normal;color:var(--p-lime);letter-spacing:1px}\r
.w.w-game.kimi-scope .terminal-rating b {color:var(--p-lime)}\r
.w.w-game.kimi-scope .terminal-rating .widget-link {color:var(--p-lime);border:1px solid var(--p-lime);padding:6px 12px;min-height:40px}\r
.w.w-game.kimi-scope .terminal-rating .widget-link:hover {background:var(--p-lime);color:var(--p-night)}\r
.w.w-game.kimi-scope .w-ticket {display:grid;grid-template-columns:82px 112px minmax(0,1fr) 112px;align-items:stretch;background:oklch(0.95 0.025 80);border:2px solid var(--text);border-radius:12px;box-shadow:7px 7px 0 var(--p-orange);overflow:hidden}\r
.w.w-game.kimi-scope .ticket-stub {display:flex;flex-direction:column;align-items:center;justify-content:space-around;padding:16px 8px;background:var(--p-orange);color:oklch(0.985 0.01 80);text-align:center;border-right:2px dashed var(--text)}\r
.w.w-game.kimi-scope .ticket-stub span {font:600 9px var(--mono);writing-mode:vertical-rl;transform:rotate(180deg);letter-spacing:.14em}\r
.w.w-game.kimi-scope .ticket-stub b {font:800 24px/1 var(--sans)}\r
.w.w-game.kimi-scope .ticket-stub small {font:600 8px var(--mono)}\r
.w.w-game.kimi-scope .w-ticket>.cover {margin:18px 0 18px 18px;height:auto;border:1px solid var(--text)}\r
.w.w-game.kimi-scope .ticket-info {padding:24px;display:flex;flex-direction:column;justify-content:center}\r
.w.w-game.kimi-scope .ticket-info>p {font:500 8px var(--mono);letter-spacing:.08em}\r
.w.w-game.kimi-scope .ticket-info h3 {margin:5px 0 12px;font:800 clamp(25px,3vw,36px)/1.1 var(--sans);letter-spacing:-.055em;text-transform:uppercase}\r
.w.w-game.kimi-scope .ticket-info .meta {display:flex;flex-wrap:wrap;gap:8px;font:500 9px var(--mono)}\r
.w.w-game.kimi-scope .ticket-info .widget-link {align-self:flex-start;margin-top:14px;border-bottom:2px solid var(--text);min-height:36px}\r
.w.w-game.kimi-scope .ticket-score {border-left:2px dashed var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;text-align:center}\r
.w.w-game.kimi-scope .ticket-score>span {font:600 9px var(--mono)}\r
.w.w-game.kimi-scope .ticket-score strong {font:800 48px/1.1 var(--sans);letter-spacing:-.08em;color:var(--p-orange)}\r
.w.w-game.kimi-scope .ticket-score small {font:500 8px var(--mono);text-transform:uppercase}\r
.w.w-game.kimi-scope .w-cinema {min-height:350px;display:flex;flex-direction:column;justify-content:space-between;padding:28px;color:oklch(0.97 0.01 120);overflow:hidden;background:var(--p-night);box-shadow:0 24px 50px oklch(0.12 0.02 180 / .25)}\r
.w.w-game.kimi-scope .cinema-art, .w.w-game.kimi-scope .cinema-shade {position:absolute;inset:0;width:100%;height:100%;z-index:-2}\r
.w.w-game.kimi-scope .cinema-art {object-fit:cover;object-position:center 48%;filter:saturate(.85)}\r
.w.w-game.kimi-scope .cinema-shade {z-index:-1;background:oklch(0.12 0.03 180 / .48)}\r
.w.w-game.kimi-scope .cinema-top {display:flex;justify-content:space-between;align-items:flex-start;font:500 10px var(--mono);letter-spacing:.14em}\r
.w.w-game.kimi-scope .cinema-top>div {display:flex;align-items:baseline;padding:8px 12px;background:var(--p-lime);color:var(--p-night);letter-spacing:0}\r
.w.w-game.kimi-scope .cinema-top b {font:600 28px var(--mono)}\r
.w.w-game.kimi-scope .cinema-top small {font-size:10px}\r
.w.w-game.kimi-scope .cinema-bottom>p {font:500 10px var(--mono);letter-spacing:.1em}\r
.w.w-game.kimi-scope .cinema-bottom h3 {margin:4px 0 18px;font:600 clamp(42px,7vw,72px)/1 var(--serif);letter-spacing:-.065em}\r
.w.w-game.kimi-scope .cinema-bottom>div {display:flex;align-items:center;justify-content:space-between;gap:20px}\r
.w.w-game.kimi-scope .source-caption {font-size:11px}\r
.w.w-game.kimi-scope .cinema-bottom .widget-link {padding:8px 14px;border:1px solid oklch(0.97 0.01 120);color:oklch(0.97 0.01 120)}\r
.w.w-game.kimi-scope .cinema-bottom .widget-link:hover {background:oklch(0.97 0.01 120);color:var(--p-night)}\r
.w.w-game.kimi-scope .w-inline {display:grid;grid-template-columns:64px minmax(0,1fr) auto auto;align-items:center;gap:22px;padding:16px 20px;background:oklch(0.985 0.008 140);border-top:1px solid var(--text);border-bottom:1px solid var(--text);box-shadow:none}\r
.w.w-game.kimi-scope .w-inline>.cover {height:84px}\r
.w.w-game.kimi-scope .inline-title p {font:500 9px var(--mono);text-transform:uppercase;color:var(--accent)}\r
.w.w-game.kimi-scope .inline-title h3 {font:600 24px/1.25 var(--serif);letter-spacing:-.035em}\r
.w.w-game.kimi-scope .inline-title>span {font-size:11px;color:var(--muted)}\r
.w.w-game.kimi-scope .inline-score {display:flex;align-items:baseline;gap:5px}\r
.w.w-game.kimi-scope .inline-score strong {font:600 38px var(--serif);letter-spacing:-.07em}\r
.w.w-game.kimi-scope .inline-score span {font:400 10px var(--mono);color:var(--muted)}\r
.w.w-game.kimi-scope .w-inline>.widget-link {padding:8px 12px;background:var(--text);color:var(--surface)}\r
.w.w-game.kimi-scope .w-inline>.widget-link:hover {background:var(--accent)}\r
.w.w-game.kimi-scope .w-brutal {background:var(--p-yellow);border:3px solid oklch(0.16 0 0);box-shadow:10px 10px 0 oklch(0.16 0 0);font-family:var(--sans)}\r
.w.w-game.kimi-scope .brutal-label {padding:8px 14px;border-bottom:3px solid oklch(0.16 0 0);font:800 12px var(--mono);letter-spacing:.08em}\r
.w.w-game.kimi-scope .brutal-body {display:grid;grid-template-columns:132px minmax(0,1fr) 120px;gap:22px;padding:22px}\r
.w.w-game.kimi-scope .brutal-body>.cover {border:3px solid oklch(0.16 0 0)}\r
.w.w-game.kimi-scope .brutal-copy>p {font:700 9px var(--mono)}\r
.w.w-game.kimi-scope .brutal-copy h3 {margin:8px 0 14px;font:800 clamp(34px,5vw,56px)/.86 var(--sans);letter-spacing:-.075em}\r
.w.w-game.kimi-scope .brutal-tags {display:flex;flex-wrap:wrap;gap:6px}\r
.w.w-game.kimi-scope .brutal-tags span {padding:4px 8px;border:2px solid oklch(0.16 0 0);font:700 9px var(--mono)}\r
.w.w-game.kimi-scope .brutal-score {display:flex;flex-direction:column;align-items:center;justify-content:center;background:oklch(0.16 0 0);color:var(--p-yellow);border:3px solid oklch(0.16 0 0)}\r
.w.w-game.kimi-scope .brutal-score strong {font:800 52px/1 var(--sans);letter-spacing:-.08em}\r
.w.w-game.kimi-scope .brutal-score span {font:700 8px var(--mono)}\r
.w.w-game.kimi-scope .brutal-foot {display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 18px;border-top:3px solid oklch(0.16 0 0)}\r
.w.w-game.kimi-scope .brutal-foot .source-caption {font:700 10px var(--mono)}\r
.w.w-game.kimi-scope .brutal-foot .widget-link {padding:8px 14px;background:oklch(0.16 0 0);color:var(--p-yellow)}\r
.w.w-game.kimi-scope .brutal-foot .widget-link:hover {background:var(--accent);color:oklch(0.98 0 0)}\r
.w.w-game.kimi-scope .w-poster {min-height:360px;display:grid;grid-template-columns:180px minmax(0,1fr) 130px;grid-template-rows:auto 1fr auto;gap:20px 28px;padding:28px;background:var(--p-blue);color:oklch(0.96 0.01 140);overflow:hidden;box-shadow:0 24px 50px oklch(0.39 0.29 275 / .2)}\r
.w.w-game.kimi-scope .poster-ghost {position:absolute;right:-18px;top:-58px;z-index:-1;font:800 260px/.9 var(--sans);letter-spacing:-.13em;color:oklch(0.96 0.01 140 / .07)}\r
.w.w-game.kimi-scope .poster-index {grid-column:1/-1;font:500 9px var(--mono);letter-spacing:.12em}\r
.w.w-game.kimi-scope .w-poster>.cover {grid-row:2/4;align-self:stretch;border:1px solid oklch(0.96 0.01 140 / .5)}\r
.w.w-game.kimi-scope .poster-copy {align-self:center}\r
.w.w-game.kimi-scope .poster-copy>p {font:500 9px var(--mono)}\r
.w.w-game.kimi-scope .poster-copy h3 {margin:10px 0 16px;font:600 clamp(42px,6vw,66px)/.95 var(--serif);letter-spacing:-.065em}\r
.w.w-game.kimi-scope .poster-copy>span {font-size:12px;line-height:1.8}\r
.w.w-game.kimi-scope .poster-score {align-self:center;display:flex;flex-direction:column}\r
.w.w-game.kimi-scope .poster-score strong {font:400 64px/1 var(--serif);letter-spacing:-.08em}\r
.w.w-game.kimi-scope .poster-score>span {margin-top:8px;font:500 8px/1.7 var(--mono)}\r
.w.w-game.kimi-scope .poster-link {grid-column:2/4}\r
.w.w-game.kimi-scope .poster-link .widget-link {width:100%;padding:8px 0;border-top:1px solid oklch(0.96 0.01 140 / .5);border-bottom:1px solid oklch(0.96 0.01 140 / .5)}\r
.w.w-game.kimi-scope .poster-link .widget-link:hover {color:var(--p-yellow)}\r
.w.w-game.kimi-scope .w-dock {display:grid;grid-template-columns:76px minmax(0,1fr) 96px auto;align-items:center;gap:22px;padding:18px 20px;background:oklch(0.235 0.018 250);color:oklch(0.96 0.008 250);border-radius:10px;box-shadow:0 18px 40px oklch(0.18 0.02 250 / .2)}\r
.w.w-game.kimi-scope .w-dock>.cover {height:104px;border-radius:3px}\r
.w.w-game.kimi-scope .dock-info>p {font:500 8px var(--mono);letter-spacing:.1em;color:oklch(0.72 0.015 250)}\r
.w.w-game.kimi-scope .dock-info h3 {font:600 25px/1.3 var(--sans);letter-spacing:-.04em}\r
.w.w-game.kimi-scope .dock-info>span {font-size:10px;color:oklch(0.78 0.01 250)}\r
.w.w-game.kimi-scope .dock-platforms {margin-top:10px;font:500 8px var(--mono);color:var(--p-lime)}\r
.w.w-game.kimi-scope .dock-score {position:relative;width:90px;height:90px}\r
.w.w-game.kimi-scope .dock-score svg {width:100%;height:100%;transform:rotate(-90deg)}\r
.w.w-game.kimi-scope .dock-score circle {fill:none;stroke:oklch(0.38 0.018 250);stroke-width:4}\r
.w.w-game.kimi-scope .dock-score .dock-progress {stroke:var(--p-lime);stroke-linecap:round;stroke-dasharray:179.4 213.6;transition:stroke-dasharray .25s ease-out}\r
.w.w-game.kimi-scope .dock-score>div {position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}\r
.w.w-game.kimi-scope .dock-score strong {font:600 24px/1 var(--mono)}\r
.w.w-game.kimi-scope .dock-score span {max-width:70px;margin-top:4px;font:400 7px var(--mono);overflow:hidden;text-overflow:ellipsis}\r
.w.w-game.kimi-scope .w-dock>.widget-link {padding:8px 12px;border:1px solid oklch(0.5 0.02 250);border-radius:4px;font-size:10px}\r
.w.w-game.kimi-scope .w-dock>.widget-link:hover {border-color:var(--p-lime);color:var(--p-lime)}\r
.w.w-game.kimi-scope .w-cartridge {padding:34px 24px 20px;background:var(--p-grey);border:2px solid oklch(0.32 0.012 220);border-radius:12px 12px 22px 22px;clip-path:polygon(7% 0,93% 0,93% 3%,100% 3%,100% 94%,94% 100%,6% 100%,0 94%,0 3%,7% 3%);box-shadow:none;font-family:var(--mono)}\r
.w.w-game.kimi-scope .cartridge-grip {position:absolute;top:10px;left:24%;right:24%;display:flex;justify-content:space-between}\r
.w.w-game.kimi-scope .cartridge-grip i {height:13px;width:12%;border:1px solid oklch(0.52 0.012 220);background:oklch(0.68 0.012 220)}\r
.w.w-game.kimi-scope .cartridge-label {display:grid;grid-template-columns:104px minmax(0,1fr) 94px;gap:20px;padding:18px;background:oklch(0.3 0.08 185);color:oklch(0.96 0.02 130);border:2px solid oklch(0.25 0.04 190)}\r
.w.w-game.kimi-scope .cartridge-label>.cover {height:140px}\r
.w.w-game.kimi-scope .cartridge-label p {font-size:8px;color:var(--p-lime)}\r
.w.w-game.kimi-scope .cartridge-label h3 {margin:10px 0;font:600 clamp(22px,3vw,32px)/1.1 var(--mono);letter-spacing:-.06em}\r
.w.w-game.kimi-scope .cartridge-label>div>span {font-size:9px}\r
.w.w-game.kimi-scope .cartridge-score {align-self:center;text-align:center;color:var(--p-lime)}\r
.w.w-game.kimi-scope .cartridge-score strong {display:block;font:600 38px/1 var(--mono);letter-spacing:-.08em}\r
.w.w-game.kimi-scope .cartridge-score small {font-size:9px}\r
.w.w-game.kimi-scope .cartridge-foot {display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 4px 0;font-size:9px}\r
.w.w-game.kimi-scope .cartridge-foot .widget-link {min-height:36px;color:oklch(0.25 0.06 275)}\r
.w.w-game.kimi-scope .cartridge-foot .widget-link:hover {color:var(--accent)}\r
@media (max-width:1100px) {\r
.w.w-game.kimi-scope .gallery-layout {grid-template-columns:1fr;gap:32px}\r
.w.w-game.kimi-scope .side-nav {display:none}\r
.w.w-game.kimi-scope .mobile-jump {display:flex;max-width:1400px;margin:0 auto 40px;padding:0 24px;align-items:center;gap:16px}\r
.w.w-game.kimi-scope .mobile-jump label {font:500 11px var(--mono);white-space:nowrap}\r
.w.w-game.kimi-scope .mobile-jump select {width:100%;min-height:44px;padding:8px 12px;border:1px solid var(--text);background:var(--surface);color:var(--text);font-size:13px}\r
.w.w-game.kimi-scope .intro {padding-top:64px}\r
}\r
@media (max-width:760px) {\r
.w.w-game.kimi-scope .site-header {padding:10px 16px;gap:12px;min-height:64px}\r
.w.w-game.kimi-scope .brand>span:last-child {display:none}\r
.w.w-game.kimi-scope .source-button {padding:8px 11px;font-size:12px}\r
.w.w-game.kimi-scope .intro {grid-template-columns:1fr;padding:48px 16px 56px;gap:36px}\r
.w.w-game.kimi-scope .intro-index {font-size:96px}\r
.w.w-game.kimi-scope .intro-index span {display:inline;margin:0 0 0 24px}\r
.w.w-game.kimi-scope .intro-copy h1 {font-size:43px}\r
.w.w-game.kimi-scope .intro-lead {font-size:16px}\r
.w.w-game.kimi-scope .gallery-layout {padding:0 16px 64px}\r
.w.w-game.kimi-scope .mobile-jump {padding:0 16px;margin-bottom:32px;display:block}\r
.w.w-game.kimi-scope .mobile-jump label {display:block;margin-bottom:8px}\r
.w.w-game.kimi-scope .variant {padding-bottom:56px;margin-bottom:56px;scroll-margin-top:80px}\r
.w.w-game.kimi-scope .variant-description {margin-left:0}\r
.w.w-game.kimi-scope .variant-header p, .w.w-game.kimi-scope .kicker, .w.w-game.kimi-scope .intro-notes, .w.w-game.kimi-scope .mobile-jump label {font-size:12px}\r
.w.w-game.kimi-scope .widget-stage {padding:20px 12px;background-size:20px 20px}\r
.w.w-game.kimi-scope .site-footer {padding:32px 16px max(40px,env(safe-area-inset-bottom));grid-template-columns:1fr;gap:12px}\r
.w.w-game.kimi-scope .game-widget {box-shadow:0 12px 30px oklch(0.235 0.018 40 / .08)}\r
.w.w-game.kimi-scope .game-widget .widget-link {min-height:44px}\r
.w.w-game.kimi-scope .w-editorial {grid-template-columns:88px minmax(0,1fr);gap:18px;padding:18px}\r
.w.w-game.kimi-scope .editorial-score {grid-column:1/-1;padding:14px 0 0;border-left:0;border-top:1px solid var(--line);flex-direction:row;align-items:baseline;justify-content:flex-end;gap:8px}\r
.w.w-game.kimi-scope .editorial-score strong {font-size:48px}\r
.w.w-game.kimi-scope .editorial-main h3 {font-size:29px}\r
.w.w-game.kimi-scope .editorial-deck {font-size:12px}\r
.w.w-game.kimi-scope .swiss-grid {grid-template-columns:96px minmax(0,1fr)}\r
.w.w-game.kimi-scope .swiss-title {padding:18px;border-right:0}\r
.w.w-game.kimi-scope .swiss-title h3 {font-size:30px}\r
.w.w-game.kimi-scope .swiss-score {grid-column:1/-1;padding:14px 16px;border-top:1px solid oklch(0.85 0 0);display:grid;grid-template-columns:1fr auto;align-items:center}\r
.w.w-game.kimi-scope .swiss-score strong {font-size:38px}\r
.w.w-game.kimi-scope .swiss-score .score-track {grid-column:1/-1}\r
.w.w-game.kimi-scope .swiss-foot {font-size:8px}\r
.w.w-game.kimi-scope .terminal-body {grid-template-columns:80px minmax(0,1fr);gap:16px;padding:18px}\r
.w.w-game.kimi-scope .terminal-body h3 {font-size:20px}\r
.w.w-game.kimi-scope .terminal-body dl>div {grid-template-columns:1fr;gap:0}\r
.w.w-game.kimi-scope .terminal-rating {align-items:flex-start;flex-direction:column}\r
.w.w-game.kimi-scope .terminal-rating .widget-link {width:100%}\r
.w.w-game.kimi-scope .w-ticket {grid-template-columns:60px 88px minmax(0,1fr);box-shadow:6px 6px 0 var(--p-orange)}\r
.w.w-game.kimi-scope .ticket-info {padding:16px 12px}\r
.w.w-game.kimi-scope .ticket-info h3 {font-size:23px}\r
.w.w-game.kimi-scope .w-ticket>.cover {margin:14px 0 14px 12px}\r
.w.w-game.kimi-scope .ticket-score {grid-column:2/4;border-left:0;border-top:2px dashed var(--text);flex-direction:row;gap:8px;padding:10px}\r
.w.w-game.kimi-scope .ticket-score strong {font-size:30px}\r
.w.w-game.kimi-scope .ticket-stub {grid-row:1/3}\r
.w.w-game.kimi-scope .w-cinema {min-height:380px;padding:20px}\r
.w.w-game.kimi-scope .cinema-bottom h3 {font-size:45px}\r
.w.w-game.kimi-scope .cinema-bottom>div {align-items:flex-start;flex-direction:column;gap:10px}\r
.w.w-game.kimi-scope .cinema-bottom .widget-link {width:100%}\r
.w.w-game.kimi-scope .w-inline {grid-template-columns:54px minmax(0,1fr) auto;gap:14px;padding:14px}\r
.w.w-game.kimi-scope .w-inline>.cover {height:76px}\r
.w.w-game.kimi-scope .inline-title h3 {font-size:20px}\r
.w.w-game.kimi-scope .inline-title>span {font-size:9px}\r
.w.w-game.kimi-scope .inline-score strong {font-size:30px}\r
.w.w-game.kimi-scope .w-inline>.widget-link {grid-column:1/-1;width:100%}\r
.w.w-game.kimi-scope .brutal-body {grid-template-columns:96px minmax(0,1fr);gap:16px;padding:16px}\r
.w.w-game.kimi-scope .brutal-copy h3 {font-size:34px}\r
.w.w-game.kimi-scope .brutal-score {grid-column:1/-1;flex-direction:row;gap:10px;padding:10px}\r
.w.w-game.kimi-scope .brutal-score strong {font-size:36px}\r
.w.w-game.kimi-scope .brutal-foot {align-items:flex-start;flex-direction:column}\r
.w.w-game.kimi-scope .brutal-foot .widget-link {width:100%}\r
.w.w-game.kimi-scope .w-poster {grid-template-columns:112px minmax(0,1fr);grid-template-rows:auto 1fr auto auto;gap:16px;padding:20px;min-height:0}\r
.w.w-game.kimi-scope .w-poster>.cover {grid-row:2/4}\r
.w.w-game.kimi-scope .poster-copy h3 {font-size:39px}\r
.w.w-game.kimi-scope .poster-score {grid-column:2;flex-direction:row;align-items:center;gap:12px}\r
.w.w-game.kimi-scope .poster-score strong {font-size:45px}\r
.w.w-game.kimi-scope .poster-link {grid-column:1/-1}\r
.w.w-game.kimi-scope .w-dock {grid-template-columns:64px minmax(0,1fr) 82px;gap:14px;padding:16px}\r
.w.w-game.kimi-scope .w-dock>.cover {height:92px}\r
.w.w-game.kimi-scope .dock-info h3 {font-size:20px}\r
.w.w-game.kimi-scope .dock-score {width:78px;height:78px}\r
.w.w-game.kimi-scope .w-dock>.widget-link {grid-column:1/-1;width:100%}\r
.w.w-game.kimi-scope .w-cartridge {padding:32px 14px 16px}\r
.w.w-game.kimi-scope .cartridge-label {grid-template-columns:80px minmax(0,1fr);gap:14px;padding:14px}\r
.w.w-game.kimi-scope .cartridge-label>.cover {height:112px}\r
.w.w-game.kimi-scope .cartridge-label h3 {font-size:20px}\r
.w.w-game.kimi-scope .cartridge-score {grid-column:1/-1;display:flex;align-items:baseline;justify-content:center;gap:5px;border-top:1px solid oklch(0.5 0.05 185);padding-top:10px}\r
.w.w-game.kimi-scope .cartridge-score strong {font-size:30px}\r
.w.w-game.kimi-scope .cartridge-foot {align-items:flex-start;flex-direction:column;gap:4px}\r
.w.w-game.kimi-scope .cartridge-foot .widget-link {width:100%}\r
.w.w-game.kimi-scope .w-kicker, .w.w-game.kimi-scope .editorial-main .meta, .w.w-game.kimi-scope .editorial-score>span, .w.w-game.kimi-scope .editorial-score small {font-size:12px}\r
.w.w-game.kimi-scope .swiss-head, .w.w-game.kimi-scope .swiss-foot, .w.w-game.kimi-scope .swiss-title>p, .w.w-game.kimi-scope .swiss-title .meta, .w.w-game.kimi-scope .swiss-score>span {font-size:12px}\r
.w.w-game.kimi-scope .terminal-top, .w.w-game.kimi-scope .terminal-path, .w.w-game.kimi-scope .terminal-body dl, .w.w-game.kimi-scope .terminal-rating {font-size:12px}\r
.w.w-game.kimi-scope .ticket-info>p, .w.w-game.kimi-scope .ticket-info .meta, .w.w-game.kimi-scope .ticket-score>span, .w.w-game.kimi-scope .ticket-score small, .w.w-game.kimi-scope .ticket-stub small {font-size:12px}\r
.w.w-game.kimi-scope .cinema-top, .w.w-game.kimi-scope .cinema-bottom>p, .w.w-game.kimi-scope .source-caption {font-size:12px}\r
.w.w-game.kimi-scope .inline-title p, .w.w-game.kimi-scope .inline-title>span, .w.w-game.kimi-scope .inline-score span {font-size:12px}\r
.w.w-game.kimi-scope .brutal-copy>p, .w.w-game.kimi-scope .brutal-tags span, .w.w-game.kimi-scope .brutal-foot .source-caption, .w.w-game.kimi-scope .brutal-score span {font-size:12px}\r
.w.w-game.kimi-scope .poster-index, .w.w-game.kimi-scope .poster-copy>p, .w.w-game.kimi-scope .poster-score>span {font-size:12px}\r
.w.w-game.kimi-scope .dock-info>p, .w.w-game.kimi-scope .dock-info>span, .w.w-game.kimi-scope .dock-platforms {font-size:12px}\r
.w.w-game.kimi-scope .dock-score span {display:none}\r
.w.w-game.kimi-scope .cartridge-label p, .w.w-game.kimi-scope .cartridge-label>div>span, .w.w-game.kimi-scope .cartridge-foot {font-size:12px}\r
}\r
@media (max-width:390px) {\r
.w.w-game.kimi-scope .source-button {padding:8px;font-size:12px}\r
.w.w-game.kimi-scope .intro-copy h1 {font-size:39px}\r
.w.w-game.kimi-scope .editorial-main .meta {gap:3px 8px;font-size:12px}\r
.w.w-game.kimi-scope .terminal-body {grid-template-columns:64px minmax(0,1fr);gap:12px;padding:14px}\r
.w.w-game.kimi-scope .terminal-body h3 {font-size:17px}\r
.w.w-game.kimi-scope .terminal-body dl {font-size:12px}\r
.w.w-game.kimi-scope .dock-info>span {font-size:12px}\r
.w.w-game.kimi-scope .w-dock {gap:10px;padding:12px}\r
}\r
@media (prefers-reduced-motion:reduce) {\r
:where(.w.w-game.kimi-scope) *, :where(.w.w-game.kimi-scope) *:before, :where(.w.w-game.kimi-scope) *:after {animation:none!important;transition:none!important}\r
}\r
.w.w-game.son-p-scope{--bg:#121214;--fg:#eceae6;--mut:#8f8c86;--c1:#f5c800;--c2:#f59e0b;--c3:#b565f5;--c4:#38bdf8;--c5:#8fa3b8;--c6:#e34d68}\r
.w.w-game.son-p-scope {box-sizing:border-box;padding:24px 16px;padding-top:max(24px,env(safe-area-inset-top,0px));padding-bottom:max(24px,env(safe-area-inset-bottom,0px));--bg:#f3f1ec;--fg:#1c1b1a;--mut:#6d6a64}\r
@media (prefers-color-scheme:dark) {\r
.w.w-game.son-p-scope :root:not([data-theme="light"]) {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
}\r
.w.w-game.son-p-scope {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
:where(.w.w-game.son-p-scope) * {box-sizing:border-box}\r
.w.w-game.son-p-scope h1 {font-size:20px;margin:0 0 4px}\r
.w.w-game.son-p-scope p.lead {color:var(--mut);margin:0 0 8px;font-size:14px}\r
.w.w-game.son-p-scope h2 {font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:38px 0 14px}\r
.w.w-game.son-p-scope .g {--c1:#f5c800;--c2:#f59e0b;--c3:#b565f5;--c4:#3b9cff;--c5:#8fa3b8;--c6:#e0475b;--ac:#ff8a3d}\r
.w.w-game.son-p-scope .src {font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ac);font-weight:700}\r
.w.w-game.son-p-scope .ttl {font-size:18px;font-weight:800;margin:0}\r
.w.w-game.son-p-scope .mt {font-size:12px;opacity:.65}\r
.w.w-game.son-p-scope .btn {display:inline-block;text-decoration:none;background:var(--ac);color:#2b1200;font-weight:700;font-size:13px;padding:9px 16px;border-radius:10px}\r
.w.w-game.son-p-scope .big {font-size:44px;font-weight:900;line-height:1;letter-spacing:-.03em}\r
.w.w-game.son-p-scope .lvl {font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}\r
.w.w-game.son-p-scope .h1 {background:#14161c;color:#eef0f5;border-radius:16px;padding:20px;max-width:520px;margin:0 auto}\r
.w.w-game.son-p-scope .h1 .sp {display:flex;height:64px;border-radius:12px;overflow:hidden;margin:16px 0 10px}\r
.w.w-game.son-p-scope .h1 .sp i {height:100%;width:var(--w);background:var(--c)}\r
.w.w-game.son-p-scope .h1 .lg {display:flex;justify-content:space-between;font-size:11px;color:#9aa1ad}\r
.w.w-game.son-p-scope .h2 {background:#fff;color:#111;border-radius:16px;padding:18px;max-width:440px;margin:0 auto;display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center}\r
.w.w-game.son-p-scope .h2 .wf {display:grid;grid-template-columns:repeat(10,1fr);gap:3px;width:200px}\r
.w.w-game.son-p-scope .h2 .wf i {aspect-ratio:1;border-radius:3px;background:var(--c)}\r
.w.w-game.son-p-scope .h2 .wf i.e {background:#eceef2}\r
.w.w-game.son-p-scope .h2 .info .lvl {color:var(--c)}\r
.w.w-game.son-p-scope .h3 {background:linear-gradient(180deg,#1b1530,#0c0a14);color:#fff;border-radius:18px;padding:18px;max-width:520px;margin:0 auto;overflow:hidden}\r
.w.w-game.son-p-scope .h3 svg {width:100%;height:120px;display:block;margin-top:14px}\r
.w.w-game.son-p-scope .h4 {background:var(--c);color:#2a1700;border-radius:18px;padding:22px;max-width:420px;margin:0 auto;position:relative;overflow:hidden;min-height:200px}\r
.w.w-game.son-p-scope .h4 .n {font-size:110px;font-weight:900;line-height:.85;letter-spacing:-.05em}\r
.w.w-game.son-p-scope .h4 .sub {font-weight:800;text-transform:uppercase;font-size:14px;letter-spacing:.08em;margin-top:10px}\r
.w.w-game.son-p-scope .h4 .mini {position:absolute;right:16px;bottom:16px;display:flex;gap:4px}\r
.w.w-game.son-p-scope .h4 .mini i {display:block;width:8px;border-radius:4px;background:rgba(0,0,0,.35)}\r
.w.w-game.son-p-scope .h5 {background:#fff;color:#111;border-radius:16px;padding:20px;max-width:500px;margin:0 auto;border:1px solid #e6e6ea}\r
.w.w-game.son-p-scope .h5 .scale {position:relative;height:14px;border-radius:99px;background:linear-gradient(90deg,var(--c6),var(--c5) 30%,var(--c4) 45%,var(--c3) 60%,var(--c2) 80%,var(--c1))}\r
.w.w-game.son-p-scope .h5 .mk {position:absolute;top:-8px;left:var(--x);width:24px;height:30px;margin-left:-12px;background:#111;border-radius:6px;color:#fff;font-size:10px;font-weight:800;display:grid;place-items:center}\r
.w.w-game.son-p-scope .h5 .ends {display:flex;justify-content:space-between;font-size:10px;font-weight:800;text-transform:uppercase;color:#777;margin-top:14px}\r
.w.w-game.son-p-scope .h6 {background:#ffe600;color:#111;border:3px solid #111;border-radius:18px;padding:18px;max-width:440px;margin:0 auto;position:relative;box-shadow:6px 6px 0 #111}\r
.w.w-game.son-p-scope .h6 .bub {background:#fff;border:3px solid #111;border-radius:16px;padding:14px 16px;position:relative;display:inline-block}\r
.w.w-game.son-p-scope .h6 .bub::after {content:"";position:absolute;bottom:-16px;left:30px;border:10px solid transparent;border-top:16px solid #111;border-left-width:12px;border-right-width:0}\r
.w.w-game.son-p-scope .h6 .big {font-size:52px;font-weight:900;text-transform:uppercase;color:var(--c);-webkit-text-stroke:2px #111;letter-spacing:-.02em}\r
.w.w-game.son-p-scope .h6 .meta {margin-top:24px;display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:13px}\r
.w.w-game.son-p-scope .h7 {background:#0b0d14;color:#e8ecf4;border-radius:18px;padding:16px;max-width:460px;margin:0 auto;display:grid;grid-template-columns:200px 1fr;gap:12px;align-items:center}\r
.w.w-game.son-p-scope .h7 svg {width:200px;height:200px}\r
.w.w-game.son-p-scope .h7 .lg div {display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid #1d2230}\r
.w.w-game.son-p-scope .h7 .lg b {color:var(--c)}\r
.w.w-game.son-p-scope .h8 {background:#1c1f26;color:#f4f5f7;border-radius:14px;padding:18px;max-width:480px;margin:0 auto}\r
.w.w-game.son-p-scope .h8 .row {display:grid;grid-template-columns:1fr;gap:6px;margin-top:10px}\r
.w.w-game.son-p-scope .h8 .seg {height:10px;display:flex;border-radius:99px;overflow:hidden;background:#2c313b}\r
.w.w-game.son-p-scope .h8 .seg i {height:100%;width:var(--w);background:var(--c)}\r
.w.w-game.son-p-scope .h8 .cap {display:flex;justify-content:space-between;font-size:11px;color:#9aa1ad}\r
.w.w-game.son-p-scope .h9 {background:radial-gradient(circle at 50% 0,#2a2445,#0d0b16 70%);color:#fff;border-radius:18px;padding:20px 16px 0;max-width:460px;margin:0 auto;text-align:center}\r
.w.w-game.son-p-scope .h9 .pod {display:flex;align-items:flex-end;justify-content:center;gap:10px;height:170px}\r
.w.w-game.son-p-scope .h9 .pod div {flex:1;border-radius:10px 10px 0 0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:10px;background:var(--c);color:#1a1200;font-weight:800;text-transform:uppercase;font-size:11px}\r
.w.w-game.son-p-scope .h9 .pod div b {font-size:22px;letter-spacing:-.02em;text-transform:none}\r
.w.w-game.son-p-scope .h9 .foot {display:flex;justify-content:space-between;align-items:center;padding:12px 4px 16px;font-size:12px;color:#aaa}\r
.w.w-game.son-p-scope .h10 {background:#fff;color:#111;border-radius:20px;padding:18px;max-width:480px;margin:0 auto;box-shadow:0 14px 28px rgba(0,0,0,.12)}\r
.w.w-game.son-p-scope .h10 .tiles {display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}\r
.w.w-game.son-p-scope .h10 .t {border-radius:12px;padding:12px 10px;background:color-mix(in srgb,var(--c) 18%,#fff);text-align:left}\r
.w.w-game.son-p-scope .h10 .t b {display:block;font-size:20px;color:var(--c);filter:brightness(.7)}\r
.w.w-game.son-p-scope .h10 .t span {font-size:11px;font-weight:800;text-transform:uppercase;color:#333;letter-spacing:.04em}\r
.w.w-game.son-num-1{--bg:#121214;--fg:#eceae6;--mut:#8f8c86;--card:#1b1c22}\r
.w.w-game.son-num-1 {box-sizing:border-box;padding:24px 16px;padding-top:max(24px,env(safe-area-inset-top,0px));padding-bottom:max(24px,env(safe-area-inset-bottom,0px));\r
--bg:#f3f1ec;--fg:#1c1b1a;--mut:#6d6a64}\r
@media (prefers-color-scheme:dark) {\r
.w.w-game.son-num-1 :root:not([data-theme="light"]) {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
}\r
.w.w-game.son-num-1 {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
:where(.w.w-game.son-num-1) * {box-sizing:border-box}\r
.w.w-game.son-num-1 h1 {font-size:20px;margin:0 0 4px}\r
.w.w-game.son-num-1 p.lead {color:var(--mut);margin:0 0 28px;font-size:14px}\r
.w.w-game.son-num-1 h2 {font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:36px 0 14px}\r
.w.w-game.son-num-1 .stack {display:grid;gap:18px}\r
.w.w-game.son-num-1 [data-src="backloggd"] {--accent:#34d3b4;--accent-ink:#04231d;--src:"Backloggd"}\r
.w.w-game.son-num-1 [data-src="panaax"] {--accent:#ff8a3d;--accent-ink:#2b1200;--src:"panaaxgames"}\r
.w.w-game.son-num-1 .cover {background:radial-gradient(circle at 70% 25%,#ffe9a8 0 7%,transparent 8%),linear-gradient(160deg,#7ee08a 0%,#2c6b52 45%,#0e1f2b 100%);position:relative;overflow:hidden}\r
.w.w-game.son-num-1 .cover::after {content:"";position:absolute;left:-10%;right:-10%;bottom:-5%;height:55%;background:#0b1620;clip-path:polygon(0 70%,30% 25%,52% 55%,75% 15%,100% 60%,100% 100%,0 100%);opacity:.85}\r
.w.w-game.son-num-1 .cover img {position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1}\r
.w.w-game.son-num-1 .wa {position:relative;overflow:hidden;border-radius:22px;padding:18px;display:flex;gap:18px;color:#f4f2ee;background:#0d1117;isolation:isolate;box-shadow:0 10px 30px rgba(0,0,0,.25)}\r
.w.w-game.son-num-1 .wa::before {content:"";position:absolute;inset:-40px;z-index:-2;background:radial-gradient(circle at 15% 30%,color-mix(in srgb,var(--accent) 55%,transparent),transparent 55%),linear-gradient(160deg,#2c6b52,#0e1f2b);filter:blur(30px) saturate(1.3);opacity:.75}\r
.w.w-game.son-num-1 .wa::after {content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(10,12,16,.25),rgba(10,12,16,.7))}\r
.w.w-game.son-num-1 .wa .cover {flex:0 0 118px;height:168px;border-radius:12px;box-shadow:0 12px 28px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.12)}\r
.w.w-game.son-num-1 .wa .body {flex:1;min-width:0;display:flex;flex-direction:column}\r
.w.w-game.son-num-1 .wa .src {font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);display:flex;align-items:center;gap:6px}\r
.w.w-game.son-num-1 .wa .src::before {content:"";width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent)}\r
.w.w-game.son-num-1 .wa h3 {margin:6px 0 2px;font-size:26px;line-height:1.1;letter-spacing:-.02em}\r
.w.w-game.son-num-1 .wa .meta {font-size:13px;color:rgba(244,242,238,.65)}\r
.w.w-game.son-num-1 .wa .tags {display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}\r
.w.w-game.son-num-1 .wa .tags span {font-size:12px;padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.1);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.12)}\r
.w.w-game.son-num-1 .wa .row {margin-top:auto;display:flex;align-items:center;gap:14px;flex-wrap:wrap}\r
.w.w-game.son-num-1 .ring {--p:84;width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--accent) calc(var(--p)*1%),rgba(255,255,255,.14) 0);position:relative;flex:none}\r
.w.w-game.son-num-1 .ring::before {content:"";position:absolute;inset:5px;border-radius:50%;background:#0f1520}\r
.w.w-game.son-num-1 .ring b {position:relative;font-size:17px}\r
.w.w-game.son-num-1 .wa .lbl {font-size:12px;color:rgba(244,242,238,.6);line-height:1.35}\r
.w.w-game.son-num-1 .wa .lbl strong {display:block;color:#fff;font-size:13px}\r
.w.w-game.son-num-1 .wa .cta {margin-left:auto;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:12px;background:var(--accent);color:var(--accent-ink);transition:transform .15s,box-shadow .15s}\r
.w.w-game.son-num-1 .wa .cta:hover {transform:translateY(-2px);box-shadow:0 8px 20px color-mix(in srgb,var(--accent) 45%,transparent)}\r
.w.w-game.son-num-1 .wb {--paper:#fbf9f4;--ink:#1c1b1a;--line:#e3ddd0;display:grid;grid-template-columns:104px 1fr auto;gap:20px;align-items:center;padding:20px 22px;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:6px;position:relative;box-shadow:6px 6px 0 var(--accent)}\r
.w.w-game.son-num-1 .wb .cover {width:104px;height:148px;border-radius:3px;box-shadow:0 6px 14px rgba(0,0,0,.25);transform:rotate(-2deg)}\r
.w.w-game.son-num-1 .wb .kicker {font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a7568;font-weight:600}\r
.w.w-game.son-num-1 .wb h3 {font-family:Georgia,"Times New Roman",serif;font-weight:700;font-size:28px;line-height:1.1;margin:4px 0 6px;letter-spacing:-.01em}\r
.w.w-game.son-num-1 .wb .meta {font-size:13px;color:#5f5a50}\r
.w.w-game.son-num-1 .wb .genres {margin-top:10px;font-size:12px;color:#7a7568;font-style:italic}\r
.w.w-game.son-num-1 .wb .score {text-align:center;padding-left:20px;border-left:1px dashed var(--line);min-width:112px}\r
.w.w-game.son-num-1 .wb .score .n {font-family:Georgia,serif;font-size:50px;font-weight:700;line-height:1}\r
.w.w-game.son-num-1 .wb .score .n small {font-size:16px;color:#9a9486;font-weight:400}\r
.w.w-game.son-num-1 .wb .score .s {font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#7a7568;margin:4px 0 12px}\r
.w.w-game.son-num-1 .wb .score a {display:inline-block;font-size:13px;font-weight:600;color:var(--ink);text-decoration:none;padding:7px 12px;background:var(--accent);color:var(--accent-ink);border-radius:4px}\r
.w.w-game.son-num-1 .wb .score a:hover {filter:brightness(.95)}\r
@media (max-width:560px) {\r
.w.w-game.son-num-1 .wa {flex-direction:column}\r
.w.w-game.son-num-1 .wa .cover {width:110px;flex-basis:auto}\r
.w.w-game.son-num-1 .wa .cta {margin-left:0;width:100%;text-align:center}\r
.w.w-game.son-num-1 .wb {grid-template-columns:90px 1fr}\r
.w.w-game.son-num-1 .wb .cover {width:90px;height:128px}\r
.w.w-game.son-num-1 .wb .score {grid-column:1/-1;display:flex;align-items:center;gap:14px;border-left:0;border-top:1px dashed var(--line);padding:14px 0 0;text-align:left}\r
.w.w-game.son-num-1 .wb .score .s {margin:0}\r
.w.w-game.son-num-1 .wb .score a {margin-left:auto}\r
}\r
.w.w-game.son-num-2{--bg:#121214;--fg:#eceae6;--mut:#8f8c86;--card:#1b1c22}\r
.w.w-game.son-num-2 {box-sizing:border-box;padding:24px 16px;padding-top:max(24px,env(safe-area-inset-top,0px));padding-bottom:max(24px,env(safe-area-inset-bottom,0px));--bg:#f3f1ec;--fg:#1c1b1a;--mut:#6d6a64}\r
@media (prefers-color-scheme:dark) {\r
.w.w-game.son-num-2 :root:not([data-theme="light"]) {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
}\r
.w.w-game.son-num-2 {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
:where(.w.w-game.son-num-2) * {box-sizing:border-box}\r
.w.w-game.son-num-2 h1 {font-size:20px;margin:0 0 4px}\r
.w.w-game.son-num-2 p.lead {color:var(--mut);margin:0 0 16px;font-size:14px}\r
.w.w-game.son-num-2 h2 {font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:38px 0 14px}\r
.w.w-game.son-num-2 .tog {display:inline-flex;border:1px solid var(--mut);border-radius:99px;padding:3px;position:sticky;top:max(8px,env(safe-area-inset-top,0px));background:var(--bg);z-index:5}\r
.w.w-game.son-num-2 .tog button {border:0;background:none;color:var(--fg);font:600 13px inherit;font-family:inherit;padding:7px 16px;border-radius:99px;cursor:pointer}\r
.w.w-game.son-num-2 .tog button.on {background:var(--fg);color:var(--bg)}\r
.w.w-game.son-num-2 [data-src="backloggd"] {--accent:#34d3b4;--ink:#04231d}\r
.w.w-game.son-num-2 [data-src="panaax"] {--accent:#ff8a3d;--ink:#2b1200}\r
.w.w-game.son-num-2 .cover {background:radial-gradient(circle at 70% 25%,#ffe9a8 0 7%,transparent 8%),linear-gradient(160deg,#7ee08a 0%,#2c6b52 45%,#0e1f2b 100%);position:relative;overflow:hidden}\r
.w.w-game.son-num-2 .cover::after {content:"";position:absolute;left:-10%;right:-10%;bottom:-5%;height:55%;background:#0b1620;clip-path:polygon(0 70%,30% 25%,52% 55%,75% 15%,100% 60%,100% 100%,0 100%);opacity:.85}\r
.w.w-game.son-num-2 .wc {font-family:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;background:#06100a;color:#b9f5c8;border:1px solid var(--accent);border-radius:8px;padding:18px 20px;position:relative;overflow:hidden;box-shadow:0 0 24px color-mix(in srgb,var(--accent) 30%,transparent)}\r
.w.w-game.son-num-2 .wc::after {content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.25) 0 1px,transparent 1px 3px)}\r
.w.w-game.son-num-2 .wc .h {color:var(--accent);font-size:13px;margin-bottom:10px}\r
.w.w-game.son-num-2 .wc h3 {margin:0 0 8px;font-size:22px;color:#fff;text-shadow:0 0 10px var(--accent);text-transform:uppercase;letter-spacing:.04em}\r
.w.w-game.son-num-2 .wc .l {font-size:13px;line-height:1.7;color:#8fcba0}\r
.w.w-game.son-num-2 .wc .l b {color:#d8ffe2;font-weight:500}\r
.w.w-game.son-num-2 .wc .bar {color:var(--accent);letter-spacing:1px}\r
.w.w-game.son-num-2 .wc a {display:inline-block;margin-top:12px;color:var(--accent);font-size:13px;text-decoration:none;border-bottom:1px dashed var(--accent)}\r
.w.w-game.son-num-2 .wc a::after {content:"_";animation:bl 1s steps(1) infinite}\r
@keyframes bl {\r
50%{opacity:0}\r
}\r
.w.w-game.son-num-2 .wd {width:250px;margin:0 auto;padding:6px;border-radius:16px;background:linear-gradient(125deg,var(--accent),#c58cff,#ffe27a,var(--accent));background-size:300% 300%;animation:holo 6s ease infinite;box-shadow:0 14px 30px rgba(0,0,0,.3)}\r
@keyframes holo {\r
50%{background-position:100% 100%}\r
}\r
.w.w-game.son-num-2 .wd .in {background:#14161c;color:#f1efe9;border-radius:11px;padding:10px}\r
.w.w-game.son-num-2 .wd .t {display:flex;justify-content:space-between;align-items:baseline;gap:8px}\r
.w.w-game.son-num-2 .wd h3 {margin:0;font-size:17px}\r
.w.w-game.son-num-2 .wd .hp {font-size:12px;color:var(--accent);font-weight:700;white-space:nowrap}\r
.w.w-game.son-num-2 .wd .cover {height:150px;border-radius:7px;margin:8px 0;border:2px solid rgba(255,255,255,.18)}\r
.w.w-game.son-num-2 .wd .ty {font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#a5a29a;border-top:1px solid #2a2d36;border-bottom:1px solid #2a2d36;padding:4px 0;text-align:center}\r
.w.w-game.son-num-2 .wd .st {display:flex;justify-content:space-around;margin:10px 0 6px;text-align:center;font-size:11px;color:#a5a29a}\r
.w.w-game.son-num-2 .wd .st b {display:block;font-size:20px;color:#fff}\r
.w.w-game.son-num-2 .wd a {display:block;text-align:center;text-decoration:none;font-weight:700;font-size:13px;padding:9px;border-radius:8px;background:var(--accent);color:var(--ink)}\r
.w.w-game.son-num-2 .we {display:inline-flex;align-items:center;gap:10px;vertical-align:middle;padding:5px 12px 5px 5px;border-radius:12px;border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);background:color-mix(in srgb,var(--accent) 12%,transparent);color:inherit;text-decoration:none;line-height:1.2;transition:background .15s}\r
.w.w-game.son-num-2 .we:hover {background:color-mix(in srgb,var(--accent) 24%,transparent)}\r
.w.w-game.son-num-2 .we .cover {width:34px;height:46px;border-radius:6px;flex:none}\r
.w.w-game.son-num-2 .we strong {display:block;font-size:14px}\r
.w.w-game.son-num-2 .we small {font-size:11.5px;color:var(--mut)}\r
.w.w-game.son-num-2 .we .sc {margin-left:4px;font-weight:800;font-size:13px;padding:3px 8px;border-radius:8px;background:var(--accent);color:var(--ink)}\r
.w.w-game.son-num-2 p.demo {line-height:2.2;font-size:15px;max-width:60ch}\r
.w.w-game.son-num-2 .wf {background:var(--accent);color:#111;border:3px solid #111;border-radius:14px;box-shadow:7px 7px 0 #111;padding:16px;display:flex;gap:16px;position:relative}\r
.w.w-game.son-num-2 .wf .cover {flex:0 0 100px;height:140px;border:3px solid #111;border-radius:8px}\r
.w.w-game.son-num-2 .wf h3 {margin:0 0 4px;font-size:27px;line-height:1;text-transform:uppercase;font-weight:900;letter-spacing:-.02em}\r
.w.w-game.son-num-2 .wf .m {font-weight:600;font-size:13px}\r
.w.w-game.son-num-2 .wf .c {display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}\r
.w.w-game.son-num-2 .wf .c span {background:#fff;border:2px solid #111;border-radius:99px;padding:2px 10px;font-size:12px;font-weight:700}\r
.w.w-game.son-num-2 .wf a {display:inline-block;background:#111;color:#fff;text-decoration:none;font-weight:800;padding:8px 14px;border-radius:8px;font-size:13px;transition:transform .12s}\r
.w.w-game.son-num-2 .wf a:hover {transform:translate(-2px,-2px)}\r
.w.w-game.son-num-2 .wf .sticker {position:absolute;top:-16px;right:-10px;background:#fff;border:3px solid #111;border-radius:50%;width:66px;height:66px;display:grid;place-items:center;font-weight:900;font-size:22px;transform:rotate(10deg);box-shadow:3px 3px 0 #111}\r
.w.w-game.son-num-2 .wg {border-radius:18px;overflow:hidden;background:#0c0e13;color:#f4f2ee;box-shadow:0 12px 30px rgba(0,0,0,.3)}\r
.w.w-game.son-num-2 .wg .hero {height:190px;position:relative;display:flex;align-items:flex-end;padding:18px 20px}\r
.w.w-game.son-num-2 .wg .hero::before {content:"";position:absolute;inset:0;background:radial-gradient(circle at 78% 28%,#ffe9a8 0 5%,transparent 6%),linear-gradient(120deg,#7ee08a,#2c6b52 40%,#0e1f2b)}\r
.w.w-game.son-num-2 .wg .hero::after {content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 20%,#0c0e13 100%)}\r
.w.w-game.son-num-2 .wg .hero>* {position:relative;z-index:1}\r
.w.w-game.son-num-2 .wg .tag {position:absolute;top:14px;left:20px;z-index:1;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;background:var(--accent);color:var(--ink);padding:4px 10px;border-radius:99px}\r
.w.w-game.son-num-2 .wg h3 {margin:0;font-size:32px;letter-spacing:-.02em;line-height:1}\r
.w.w-game.son-num-2 .wg .by {font-size:13px;opacity:.75;margin-top:4px}\r
.w.w-game.son-num-2 .wg .strip {display:grid;grid-template-columns:repeat(3,1fr) auto;align-items:center;gap:1px;background:#1d2029}\r
.w.w-game.son-num-2 .wg .strip div {background:#0c0e13;padding:12px 16px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8d8a84}\r
.w.w-game.son-num-2 .wg .strip b {display:block;font-size:17px;letter-spacing:0;text-transform:none;color:var(--accent);margin-top:2px}\r
.w.w-game.son-num-2 .wg .strip a {background:var(--accent);color:var(--ink);align-self:stretch;display:grid;place-items:center;padding:0 20px;font-weight:700;text-decoration:none;font-size:14px}\r
@media (max-width:560px) {\r
.w.w-game.son-num-2 .wf {flex-direction:column}\r
.w.w-game.son-num-2 .wf .cover {flex-basis:auto;width:100px}\r
.w.w-game.son-num-2 .wg .strip {grid-template-columns:1fr 1fr}\r
.w.w-game.son-num-2 .wg .strip a {grid-column:1/-1;padding:14px}\r
}\r
.w.w-game.son-num-3{--bg:#121214;--fg:#eceae6;--mut:#8f8c86;--card:#1b1c22}\r
.w.w-game.son-num-3 {box-sizing:border-box;padding:24px 16px;padding-top:max(24px,env(safe-area-inset-top,0px));padding-bottom:max(24px,env(safe-area-inset-bottom,0px));--bg:#f3f1ec;--fg:#1c1b1a;--mut:#6d6a64}\r
@media (prefers-color-scheme:dark) {\r
.w.w-game.son-num-3 :root:not([data-theme="light"]) {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
}\r
.w.w-game.son-num-3 {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
:where(.w.w-game.son-num-3) * {box-sizing:border-box}\r
.w.w-game.son-num-3 h1 {font-size:20px;margin:0 0 4px}\r
.w.w-game.son-num-3 p.lead {color:var(--mut);margin:0 0 16px;font-size:14px}\r
.w.w-game.son-num-3 h2 {font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:38px 0 14px}\r
.w.w-game.son-num-3 .tog {display:inline-flex;border:1px solid var(--mut);border-radius:99px;padding:3px;position:sticky;top:8px;background:var(--bg);z-index:5}\r
.w.w-game.son-num-3 .tog button {border:0;background:none;color:var(--fg);font-family:inherit;font-size:13px;font-weight:600;padding:7px 16px;border-radius:99px;cursor:pointer}\r
.w.w-game.son-num-3 .tog button.on {background:var(--fg);color:var(--bg)}\r
.w.w-game.son-num-3 [data-src="backloggd"] {--accent:#34d3b4;--ink:#04231d}\r
.w.w-game.son-num-3 [data-src="panaax"] {--accent:#ff8a3d;--ink:#2b1200}\r
.w.w-game.son-num-3 .cover {background:radial-gradient(circle at 70% 25%,#ffe9a8 0 7%,transparent 8%),linear-gradient(160deg,#7ee08a 0%,#2c6b52 45%,#0e1f2b 100%);position:relative;overflow:hidden}\r
.w.w-game.son-num-3 .cover::after {content:"";position:absolute;left:-10%;right:-10%;bottom:-5%;height:55%;background:#0b1620;clip-path:polygon(0 70%,30% 25%,52% 55%,75% 15%,100% 60%,100% 100%,0 100%);opacity:.85}\r
.w.w-game.son-num-3 .wh {background:#0a0a0f;color:#f5f5f5;border-radius:4px;padding:14px;display:flex;gap:14px;position:relative;overflow:hidden;font-family:"Courier New",monospace}\r
.w.w-game.son-num-3 .wh::after {content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.04) 0 2px,transparent 2px 4px);pointer-events:none}\r
.w.w-game.son-num-3 .wh .cover {flex:0 0 96px;height:128px;filter:saturate(1.4) contrast(1.1)}\r
.w.w-game.son-num-3 .wh .play {font-size:12px;color:var(--accent);letter-spacing:.1em}\r
.w.w-game.son-num-3 .wh h3 {margin:4px 0;font-size:22px;text-shadow:2px 0 #ff2d6f,-2px 0 #2de2ff}\r
.w.w-game.son-num-3 .wh .m {font-size:12px;opacity:.7}\r
.w.w-game.son-num-3 .wh .sc {margin-top:10px;font-size:12px;color:var(--accent)}\r
.w.w-game.son-num-3 .wi {display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:22px 0;border-top:2px solid var(--fg);border-bottom:1px solid var(--mut)}\r
.w.w-game.son-num-3 .wi h3 {margin:0 0 6px;font-size:24px;font-weight:700;letter-spacing:-.02em}\r
.w.w-game.son-num-3 .wi .m {font-size:13px;color:var(--mut)}\r
.w.w-game.son-num-3 .wi .n {font-size:84px;font-weight:800;line-height:.8;color:var(--accent);letter-spacing:-.05em}\r
.w.w-game.son-num-3 .wi .s {font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--mut);text-align:right;margin-top:6px}\r
.w.w-game.son-num-3 .wj {display:flex;border-radius:8px;overflow:hidden;background:linear-gradient(90deg,#1b2838,#223247);color:#c7d5e0;box-shadow:0 6px 16px rgba(0,0,0,.35)}\r
.w.w-game.son-num-3 .wj .cover {flex:0 0 184px;height:86px}\r
.w.w-game.son-num-3 .wj .info {padding:10px 14px;flex:1;display:flex;flex-direction:column;justify-content:center}\r
.w.w-game.son-num-3 .wj h3 {margin:0;color:#fff;font-size:16px}\r
.w.w-game.son-num-3 .wj .tg {font-size:12px;color:#8f98a0;margin-top:4px}\r
.w.w-game.son-num-3 .wj .sc {display:inline-flex;align-items:center;gap:8px;margin-top:8px;font-size:12px}\r
.w.w-game.son-num-3 .wj .sc b {background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:3px;font-weight:700}\r
.w.w-game.son-num-3 .wj .src {margin-left:auto;align-self:flex-end;padding:10px 14px;font-size:11px;color:var(--accent);text-transform:uppercase;letter-spacing:.08em}\r
.w.w-game.son-num-3 .wk {background:#f7f1e3;color:#2a241a;padding:20px 22px;border-top:4px double #2a241a;border-bottom:4px double #2a241a;font-family:Georgia,"Times New Roman",serif;display:grid;grid-template-columns:110px 1fr;gap:18px}\r
.w.w-game.son-num-3 .wk .cover {height:150px;border-radius:2px}\r
.w.w-game.son-num-3 .wk .k {font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}\r
.w.w-game.son-num-3 .wk h3 {margin:4px 0;font-size:26px;font-style:italic;font-weight:700}\r
.w.w-game.son-num-3 .wk .m {font-size:13px;color:#6b604d}\r
.w.w-game.son-num-3 .wk p {margin:8px 0 0;font-size:14px;line-height:1.5}\r
.w.w-game.son-num-3 .wk p::first-letter {float:left;font-size:44px;line-height:.9;padding:4px 6px 0 0;font-weight:700;color:var(--accent)}\r
.w.w-game.son-num-3 .wl {background:#fff;padding:12px 12px 22px;width:230px;margin:0 auto;box-shadow:0 10px 24px rgba(0,0,0,.25);transform:rotate(-2.5deg);color:#222;font-family:"Comic Sans MS","Segoe Print",cursive}\r
.w.w-game.son-num-3 .wl .cover {height:200px}\r
.w.w-game.son-num-3 .wl .c {margin-top:12px;font-size:17px;font-weight:700;text-align:center}\r
.w.w-game.son-num-3 .wl .d {font-size:12px;color:#666;text-align:center;margin-top:2px}\r
.w.w-game.son-num-3 .wl .tape {position:absolute;width:70px;height:20px;background:rgba(255,230,140,.7);top:-8px;left:50%;margin-left:-35px}\r
.w.w-game.son-num-3 .wl {position:relative}\r
.w.w-game.son-num-3 .wm {background:#1a1c2c;color:#f4f4f4;padding:14px;display:flex;gap:14px;align-items:center;font-family:"Courier New",monospace;image-rendering:pixelated;box-shadow:inset 0 0 0 4px #1a1c2c,inset 0 0 0 6px #5d275d,0 0 0 4px #1a1c2c}\r
.w.w-game.son-num-3 .wm .cover {flex:0 0 72px;height:96px;border:4px solid #f4f4f4}\r
.w.w-game.son-num-3 .wm h3 {margin:0 0 4px;font-size:18px;text-transform:uppercase;color:#ffcd75}\r
.w.w-game.son-num-3 .wm .m {font-size:11px;color:#a7f070}\r
.w.w-game.son-num-3 .wm .hp {display:flex;gap:4px;margin-top:8px}\r
.w.w-game.son-num-3 .wm .hp i {width:14px;height:14px;background:var(--accent)}\r
.w.w-game.son-num-3 .wm .hp i.e {background:#333}\r
.w.w-game.son-num-3 .wm a {display:block;margin-top:10px;color:#ffcd75;font-size:12px;text-decoration:none}\r
.w.w-game.son-num-3 .wn {position:relative;border-radius:20px;padding:18px;overflow:hidden;background:linear-gradient(135deg,#ffd6a5,#ffadc4 50%,#b6c8ff);color:#1d1830}\r
.w.w-game.son-num-3 .wn::before {content:"";position:absolute;width:160px;height:160px;border-radius:50%;background:var(--accent);opacity:.5;filter:blur(40px);right:-30px;top:-30px}\r
.w.w-game.son-num-3 .wn .card {position:relative;display:flex;gap:16px;background:rgba(255,255,255,.45);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.7);border-radius:14px;padding:14px}\r
.w.w-game.son-num-3 .wn .cover {flex:0 0 90px;height:120px;border-radius:10px}\r
.w.w-game.son-num-3 .wn h3 {margin:0;font-size:20px}\r
.w.w-game.son-num-3 .wn .m {font-size:12.5px;opacity:.7;margin-top:2px}\r
.w.w-game.son-num-3 .wn .row {display:flex;gap:8px;margin-top:12px;align-items:center}\r
.w.w-game.son-num-3 .wn .pill {background:#1d1830;color:#fff;font-weight:700;font-size:13px;padding:5px 11px;border-radius:99px}\r
.w.w-game.son-num-3 .wn .pill.a {background:rgba(255,255,255,.7);color:#1d1830}\r
.w.w-game.son-num-3 .wo {position:relative;background:#161a22;color:#eef1f6;border-radius:12px;padding:16px;overflow:hidden;display:flex;gap:16px}\r
.w.w-game.son-num-3 .wo .rib {position:absolute;top:14px;right:-38px;background:var(--accent);color:var(--ink);font-weight:800;font-size:12px;padding:5px 46px;transform:rotate(38deg);letter-spacing:.06em;text-transform:uppercase}\r
.w.w-game.son-num-3 .wo .cover {flex:0 0 100px;height:132px;border-radius:8px}\r
.w.w-game.son-num-3 .wo h3 {margin:0;font-size:21px;padding-right:50px}\r
.w.w-game.son-num-3 .wo .m {font-size:13px;color:#8b93a3;margin-top:4px}\r
.w.w-game.son-num-3 .wo .ch {display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}\r
.w.w-game.son-num-3 .wo .ch span {font-size:11.5px;color:#c4cad6;border:1px solid #2b3240;padding:3px 8px;border-radius:6px}\r
.w.w-game.son-num-3 .wp {background:#fff;color:#111;border-radius:18px;padding:18px;display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center;border:1px solid #e6e6ea}\r
.w.w-game.son-num-3 .wp .donut {width:110px;height:110px;border-radius:50%;background:conic-gradient(var(--accent) 0 84%,#eee 0);display:grid;place-items:center;position:relative}\r
.w.w-game.son-num-3 .wp .donut::before {content:"";position:absolute;inset:12px;border-radius:50%;background:#fff}\r
.w.w-game.son-num-3 .wp .donut b {position:relative;font-size:28px;letter-spacing:-.03em}\r
.w.w-game.son-num-3 .wp h3 {margin:0 0 2px;font-size:19px}\r
.w.w-game.son-num-3 .wp .m {font-size:12.5px;color:#777}\r
.w.w-game.son-num-3 .wp .pf {display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}\r
.w.w-game.son-num-3 .wp .pf span {font-size:11.5px;background:#f2f2f5;padding:3px 8px;border-radius:99px;color:#444}\r
.w.w-game.son-num-3 .wp a {display:inline-block;margin-top:10px;font-size:13px;font-weight:600;color:#111;text-decoration:none;border-bottom:2px solid var(--accent)}\r
.w.w-game.son-num-3 .wq {display:flex;background:#0f1116;color:#f2f2f2;border-radius:10px;overflow:hidden;font-family:Inter,system-ui,sans-serif}\r
.w.w-game.son-num-3 .wq .bar {width:10px;background:linear-gradient(180deg,var(--accent),transparent)}\r
.w.w-game.son-num-3 .wq .in {padding:14px 16px;flex:1;display:grid;grid-template-columns:1fr auto;gap:6px 14px;align-items:center}\r
.w.w-game.son-num-3 .wq h3 {margin:0;font-size:18px}\r
.w.w-game.son-num-3 .wq .m {font-size:12.5px;color:#8a8f99;grid-column:1}\r
.w.w-game.son-num-3 .wq .big {grid-row:1/3;grid-column:2;font-size:36px;font-weight:800;color:var(--accent);text-align:right;line-height:1}\r
.w.w-game.son-num-3 .wq .big small {display:block;font-size:10px;color:#8a8f99;letter-spacing:.1em;font-weight:500;margin-top:4px}\r
.w.w-game.son-num-3 .wq a {grid-column:1/-1;font-size:12.5px;color:var(--accent);text-decoration:none}\r
@media (max-width:560px) {\r
.w.w-game.son-num-3 .wj {flex-direction:column}\r
.w.w-game.son-num-3 .wj .cover {flex-basis:auto;height:120px}\r
.w.w-game.son-num-3 .wj .src {margin-left:0;align-self:auto;padding-top:0}\r
.w.w-game.son-num-3 .wp {grid-template-columns:1fr;justify-items:center;text-align:center}\r
.w.w-game.son-num-3 .wp .pf {justify-content:center}\r
.w.w-game.son-num-3 .wk {grid-template-columns:1fr}\r
.w.w-game.son-num-3 .wk .cover {width:110px}\r
}\r
.w.w-game.son-num-4{--bg:#121214;--fg:#eceae6;--mut:#8f8c86;--card:#1b1c22}\r
.w.w-game.son-num-4 {box-sizing:border-box;padding:24px 16px;padding-top:max(24px,env(safe-area-inset-top,0px));padding-bottom:max(24px,env(safe-area-inset-bottom,0px));--bg:#f3f1ec;--fg:#1c1b1a;--mut:#6d6a64}\r
@media (prefers-color-scheme:dark) {\r
.w.w-game.son-num-4 :root:not([data-theme="light"]) {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
}\r
.w.w-game.son-num-4 {--bg:#121214;--fg:#eceae6;--mut:#8f8c86}\r
:where(.w.w-game.son-num-4) * {box-sizing:border-box}\r
.w.w-game.son-num-4 h1 {font-size:20px;margin:0 0 4px}\r
.w.w-game.son-num-4 p.lead {color:var(--mut);margin:0 0 16px;font-size:14px}\r
.w.w-game.son-num-4 h2 {font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:38px 0 14px}\r
.w.w-game.son-num-4 .tog {display:inline-flex;border:1px solid var(--mut);border-radius:99px;padding:3px;position:sticky;top:8px;background:var(--bg);z-index:5}\r
.w.w-game.son-num-4 .tog button {border:0;background:none;color:var(--fg);font-family:inherit;font-size:13px;font-weight:600;padding:7px 16px;border-radius:99px;cursor:pointer}\r
.w.w-game.son-num-4 .tog button.on {background:var(--fg);color:var(--bg)}\r
.w.w-game.son-num-4 [data-src="backloggd"] {--accent:#34d3b4;--ink:#04231d}\r
.w.w-game.son-num-4 [data-src="panaax"] {--accent:#ff8a3d;--ink:#2b1200}\r
.w.w-game.son-num-4 .cover {background:radial-gradient(circle at 70% 25%,#ffe9a8 0 7%,transparent 8%),linear-gradient(160deg,#7ee08a 0%,#2c6b52 45%,#0e1f2b 100%);position:relative;overflow:hidden}\r
.w.w-game.son-num-4 .cover::after {content:"";position:absolute;left:-10%;right:-10%;bottom:-5%;height:55%;background:#0b1620;clip-path:polygon(0 70%,30% 25%,52% 55%,75% 15%,100% 60%,100% 100%,0 100%);opacity:.85}\r
.w.w-game.son-num-4 .wr {background:#fff27a;color:#2b2810;padding:18px 18px 16px;width:280px;margin:0 auto;transform:rotate(1.5deg);box-shadow:0 10px 18px rgba(0,0,0,.2);position:relative;font-family:"Segoe Print","Comic Sans MS",cursive}\r
.w.w-game.son-num-4 .wr::before {content:"";position:absolute;top:-9px;left:50%;margin-left:-40px;width:80px;height:18px;background:rgba(255,255,255,.55)}\r
.w.w-game.son-num-4 .wr .cover {height:120px;border-radius:2px}\r
.w.w-game.son-num-4 .wr h3 {margin:10px 0 2px;font-size:20px}\r
.w.w-game.son-num-4 .wr .m {font-size:13px}\r
.w.w-game.son-num-4 .wr .big {font-size:30px;font-weight:700;color:var(--accent);filter:brightness(.7);margin-top:4px}\r
.w.w-game.son-num-4 .ws {width:300px;aspect-ratio:1.586;margin:0 auto;border-radius:16px;padding:16px;color:#fff;position:relative;overflow:hidden;background:linear-gradient(135deg,#1a1d29,#2b3142);box-shadow:0 14px 26px rgba(0,0,0,.4);display:flex;flex-direction:column;justify-content:space-between}\r
.w.w-game.son-num-4 .ws::before {content:"";position:absolute;width:220px;height:220px;border-radius:50%;background:var(--accent);opacity:.35;filter:blur(40px);right:-60px;top:-60px}\r
.w.w-game.son-num-4 .ws .chip {width:34px;height:26px;border-radius:5px;background:linear-gradient(135deg,#f3d37c,#b58d3a);position:relative;z-index:1}\r
.w.w-game.son-num-4 .ws .t {position:relative;z-index:1}\r
.w.w-game.son-num-4 .ws h3 {margin:0;font-size:22px;letter-spacing:.02em}\r
.w.w-game.son-num-4 .ws .m {font-size:12px;opacity:.7;margin-top:2px}\r
.w.w-game.son-num-4 .ws .f {position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-end;font-size:12px}\r
.w.w-game.son-num-4 .ws .f b {font-size:26px;color:var(--accent)}\r
.w.w-game.son-num-4 .wt {display:flex;background:#f6f0e0;color:#222;border-radius:10px;overflow:hidden;position:relative;font-family:Inter,system-ui,sans-serif}\r
.w.w-game.son-num-4 .wt .stub {width:96px;background:var(--accent);color:var(--ink);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;position:relative}\r
.w.w-game.son-num-4 .wt .stub::after {content:"";position:absolute;right:-6px;top:0;bottom:0;width:12px;background:radial-gradient(circle at 0 50%,#f6f0e0 5px,transparent 6px) 0 0/12px 16px repeat-y}\r
.w.w-game.son-num-4 .wt .stub b {font-size:30px;line-height:1}\r
.w.w-game.son-num-4 .wt .stub small {font-size:10px;letter-spacing:.1em;text-transform:uppercase}\r
.w.w-game.son-num-4 .wt .in {padding:14px 18px 14px 22px;flex:1}\r
.w.w-game.son-num-4 .wt h3 {margin:0 0 4px;font-size:21px}\r
.w.w-game.son-num-4 .wt .m {font-size:12.5px;color:#666}\r
.w.w-game.son-num-4 .wt .src {font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-top:10px}\r
.w.w-game.son-num-4 .wu {background:#2a2e38;color:#eef0f5;border-radius:24px 24px 60px 60px;padding:18px 22px 22px;display:flex;gap:16px;align-items:center;max-width:460px;margin:0 auto}\r
.w.w-game.son-num-4 .wu .cover {flex:0 0 96px;height:126px;border-radius:10px}\r
.w.w-game.son-num-4 .wu h3 {margin:0;font-size:19px}\r
.w.w-game.son-num-4 .wu .m {font-size:12.5px;color:#9aa1b0;margin-top:3px}\r
.w.w-game.son-num-4 .wu .btns {display:grid;grid-template-columns:repeat(2,auto);gap:8px;margin-top:12px;align-items:center}\r
.w.w-game.son-num-4 .wu .btn {width:30px;height:30px;border-radius:50%;background:#1a1d24;display:grid;place-items:center;font-size:12px;font-weight:800;color:var(--accent)}\r
.w.w-game.son-num-4 .wu .lb {font-size:12.5px;color:#c9ced9}\r
.w.w-game.son-num-4 .wu .lb b {color:var(--accent)}\r
.w.w-game.son-num-4 .wv {background:#0f1218;color:#eef0f5;border-radius:16px;padding:18px;display:grid;grid-template-columns:150px 1fr;gap:16px;align-items:center}\r
.w.w-game.son-num-4 .wv .gauge {width:150px;height:80px;border-radius:150px 150px 0 0;background:conic-gradient(from 270deg,var(--accent) calc(var(--p,84)*1.8deg),#262b36 0);position:relative;overflow:hidden;margin-top:10px}\r
.w.w-game.son-num-4 .wv .gauge::after {content:"";position:absolute;left:18px;right:18px;top:18px;height:128px;border-radius:50%;background:#0f1218}\r
.w.w-game.son-num-4 .wv .gv {position:absolute;left:0;right:0;bottom:-2px;text-align:center;font-size:28px;font-weight:800;z-index:1}\r
.w.w-game.son-num-4 .wv .gauge {position:relative}\r
.w.w-game.son-num-4 .wv h3 {margin:0 0 4px;font-size:19px}\r
.w.w-game.son-num-4 .wv .m {font-size:12.5px;color:#9aa1b0}\r
.w.w-game.son-num-4 .wv a {display:inline-block;margin-top:10px;font-size:13px;color:var(--accent);text-decoration:none}\r
.w.w-game.son-num-4 .ww {background:#0b0b0b;padding:14px 0;color:#eee;border-radius:6px;position:relative}\r
.w.w-game.son-num-4 .ww .holes {position:absolute;left:0;right:0;height:10px;background:repeating-linear-gradient(90deg,#222 0 10px,transparent 10px 22px)}\r
.w.w-game.son-num-4 .ww .holes.t {top:4px}\r
.w.w-game.son-num-4 .ww .holes.b {bottom:4px}\r
.w.w-game.son-num-4 .ww .frames {display:flex;gap:6px;padding:0 14px}\r
.w.w-game.son-num-4 .ww .fr {flex:1;height:110px;background:linear-gradient(135deg,var(--accent),#1c2433);border-radius:3px;position:relative;overflow:hidden}\r
.w.w-game.son-num-4 .ww .fr span {position:absolute;left:8px;bottom:6px;font-size:11px;font-weight:700;background:rgba(0,0,0,.55);padding:2px 6px;border-radius:3px}\r
.w.w-game.son-num-4 .ww .info {padding:12px 16px 4px;display:flex;justify-content:space-between;align-items:baseline;gap:10px}\r
.w.w-game.son-num-4 .ww h3 {margin:0;font-size:18px}\r
.w.w-game.son-num-4 .ww .m {font-size:12px;color:#999}\r
.w.w-game.son-num-4 .ww .sc {font-size:20px;font-weight:800;color:var(--accent)}\r
.w.w-game.son-num-4 .wx {background:#000;color:#fff;padding:18px;position:relative;font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;overflow:hidden}\r
.w.w-game.son-num-4 .wx h3 {margin:0;font-size:30px;letter-spacing:.02em;position:relative;text-transform:uppercase}\r
.w.w-game.son-num-4 .wx h3::before, .w.w-game.son-num-4 .wx h3::after {content:attr(data-t);position:absolute;left:0;top:0;width:100%;overflow:hidden}\r
.w.w-game.son-num-4 .wx h3::before {color:#ff2d6f;clip-path:polygon(0 10%,100% 10%,100% 40%,0 40%);transform:translate(3px,0)}\r
.w.w-game.son-num-4 .wx h3::after {color:#2de2ff;clip-path:polygon(0 60%,100% 60%,100% 80%,0 80%);transform:translate(-3px,0)}\r
.w.w-game.son-num-4 .wx .m {font-size:12px;color:#aaa;margin:8px 0}\r
.w.w-game.son-num-4 .wx .sc {display:inline-block;background:var(--accent);color:var(--ink);font-weight:800;padding:4px 10px;font-size:13px}\r
.w.w-game.son-num-4 .wx a {color:var(--accent);font-size:13px;margin-left:10px}\r
.w.w-game.son-num-4 .wy {background:#07060f;border-radius:14px;padding:18px 20px;border:2px solid var(--accent);box-shadow:0 0 6px var(--accent),0 0 18px color-mix(in srgb,var(--accent) 60%,transparent),inset 0 0 14px color-mix(in srgb,var(--accent) 35%,transparent);color:#fff;text-align:center}\r
.w.w-game.son-num-4 .wy h3 {margin:0 0 6px;font-size:26px;color:var(--accent);text-shadow:0 0 8px var(--accent),0 0 20px var(--accent)}\r
.w.w-game.son-num-4 .wy .m {font-size:13px;color:#cfd;opacity:.8}\r
.w.w-game.son-num-4 .wy .sc {margin-top:12px;font-size:15px;font-weight:700;letter-spacing:.1em;text-shadow:0 0 8px var(--accent)}\r
.w.w-game.son-num-4 .wz {background:#fff;color:#1d1d1f;border:1px solid #e3e3e8;border-radius:12px;overflow:hidden;font-size:13px;max-width:360px;margin:0 auto}\r
.w.w-game.son-num-4 .wz .hd {display:flex;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid #eee}\r
.w.w-game.son-num-4 .wz .hd .cover {width:44px;height:58px;border-radius:6px;flex:none}\r
.w.w-game.son-num-4 .wz .hd h3 {margin:0;font-size:17px}\r
.w.w-game.son-num-4 .wz .hd span {color:#888;font-size:12px}\r
.w.w-game.son-num-4 .wz dl {margin:0;display:grid;grid-template-columns:1fr auto}\r
.w.w-game.son-num-4 .wz dt, .w.w-game.son-num-4 .wz dd {margin:0;padding:9px 16px;border-bottom:1px solid #f1f1f4}\r
.w.w-game.son-num-4 .wz dt {color:#777}\r
.w.w-game.son-num-4 .wz dd {text-align:right;font-weight:600}\r
.w.w-game.son-num-4 .wz .ft {padding:10px 16px;background:var(--accent);color:var(--ink);font-weight:700;text-align:center;text-decoration:none;display:block}\r
.w.w-game.son-num-4 .waa {display:flex;flex-direction:column;align-items:center;gap:6px;color:#fff;max-width:240px;margin:0 auto;text-align:center}\r
.w.w-game.son-num-4 .waa .medal {width:120px;height:120px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3b8,var(--accent) 45%,#2a1d00 100%);display:grid;place-items:center;box-shadow:0 0 0 6px #1b1b1f,0 0 0 8px var(--accent),0 10px 20px rgba(0,0,0,.4)}\r
.w.w-game.son-num-4 .waa .medal b {font-size:40px;font-weight:900;color:var(--ink);letter-spacing:-.03em}\r
.w.w-game.son-num-4 .waa .rb {display:flex;gap:4px;margin-top:-6px}\r
.w.w-game.son-num-4 .waa .rb i {width:26px;height:40px;background:var(--accent);clip-path:polygon(0 0,100% 0,100% 100%,50% 80%,0 100%)}\r
.w.w-game.son-num-4 .waa h3 {margin:8px 0 2px;font-size:19px}\r
.w.w-game.son-num-4 .waa .m {font-size:12px;color:#9aa1b0}\r
.w.w-game.qwen1-scope{--accent:#7c5cff;--line:rgba(255,255,255,.1);color:var(--ink);font-family:var(--fb)}\r
.w.w-game.qwen1-scope .pxr-track i{height:var(--h)}\r
.w.w-game.qwen1-scope {\r
  --bg:#080a12; --surface:#0f1322; --surface2:#141a30; --overlay:#0a0d18;\r
  --line:#202842; --line2:#2e3a5e;\r
  --ink:#f0f3ff; --muted:#9aa4c4; --dim:#606c92;\r
  --panax:#8f6bff; --panax2:#c8ff3d; --cyan:#35e0ff; --magenta:#ff4d9d;\r
  --ok:#3ddc84; --warn:#ffb02e; --danger:#ff3b5c; --info:#3d9bff;\r
  --paper:#f5efe2; --paperink:#221c12;\r
  --t1:#ffd60a; --t2:#ff9500; --t3:#c05cff; --t4:#3d9bff; --t5:#9aa5b1; --t6:#ff3b5c;\r
  --fd:'Unbounded',system-ui,sans-serif; --fb:'Manrope',system-ui,sans-serif;\r
  --fm:'JetBrains Mono',ui-monospace,monospace; --fs:'Playfair Display',Georgia,serif;\r
  --fp:'Press Start 2P',monospace;\r
  --pxr-base:128px;\r
}\r
:where(.w.w-game.qwen1-scope) * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.qwen1-scope ::selection {background:var(--panax2);color:#0c1005}\r
.w.w-game.qwen1-scope ::-webkit-scrollbar {width:10px;height:10px}\r
.w.w-game.qwen1-scope ::-webkit-scrollbar-track {background:#0b0e1a}\r
.w.w-game.qwen1-scope ::-webkit-scrollbar-thumb {background:linear-gradient(180deg,var(--panax),#4b3f9e);border-radius:8px;border:2px solid #0b0e1a}\r
.w.w-game.qwen1-scope ::-webkit-scrollbar-thumb:hover {background:linear-gradient(180deg,var(--panax2),#8fbf17)}\r
.w.w-game.qwen1-scope :focus-visible {outline:2px solid var(--panax2);outline-offset:2px;border-radius:4px}\r
.w.w-game.qwen1-scope img {display:block;max-width:100%}\r
.w.w-game.qwen1-scope a {color:inherit;text-decoration:none}\r
.w.w-game.qwen1-scope button {font-family:inherit;color:inherit;background:none;border:none;cursor:pointer}\r
.w.w-game.qwen1-scope input {font-family:inherit}\r
.w.w-game.qwen1-scope .i {width:1em;height:1em;flex:none;display:inline-block;vertical-align:-.14em}\r
.w.w-game.qwen1-scope .bg {position:fixed;inset:0;z-index:-1;overflow:hidden;\r
  background:radial-gradient(1100px 760px at 84% -12%,#221650 0%,transparent 58%),\r
             radial-gradient(950px 700px at -12% 36%,#0c2a34 0%,transparent 55%),\r
             radial-gradient(900px 700px at 55% 118%,#2a0f26 0%,transparent 55%),var(--bg)}\r
.w.w-game.qwen1-scope .blob {position:absolute;border-radius:50%;filter:blur(95px);opacity:.3;animation:drift 26s ease-in-out infinite alternate}\r
.w.w-game.qwen1-scope .b1 {width:520px;height:520px;background:#5b3fd6;top:-160px;left:56%}\r
.w.w-game.qwen1-scope .b2 {width:430px;height:430px;background:#0e7f96;top:36%;left:-150px;animation-delay:-9s}\r
.w.w-game.qwen1-scope .b3 {width:400px;height:400px;background:#a1256b;bottom:-160px;right:6%;animation-delay:-17s}\r
@keyframes drift {\r
to{transform:translate(70px,-50px) scale(1.18)}\r
}\r
.w.w-game.qwen1-scope body::after {content:"";position:fixed;inset:0;z-index:99;pointer-events:none;opacity:.05;\r
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.6'/%3E%3C/svg%3E")}\r
.w.w-game.qwen1-scope .progress {position:fixed;top:0;left:0;right:0;height:2px;z-index:210}\r
.w.w-game.qwen1-scope .progress i {display:block;height:100%;width:0;background:linear-gradient(90deg,var(--t1),var(--t2),var(--t3),var(--t4),var(--t6))}\r
.w.w-game.qwen1-scope .nav {position:fixed;top:0;left:0;right:0;z-index:90;background:rgba(8,10,18,.76);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line);transition:box-shadow .3s}\r
.w.w-game.qwen1-scope .nav.scrolled {box-shadow:0 12px 40px rgba(0,0,0,.45)}\r
.w.w-game.qwen1-scope .nav-in {max-width:1280px;margin:0 auto;padding:0 24px;height:64px;display:flex;align-items:center;gap:26px}\r
.w.w-game.qwen1-scope .logo {display:flex;align-items:center;gap:10px;font-family:var(--fd);font-weight:900;font-size:13px;letter-spacing:1px}\r
.w.w-game.qwen1-scope .logo-mark {width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,var(--panax),var(--panax2));display:grid;place-items:center;font-size:14px;color:#07090f;box-shadow:0 4px 18px rgba(143,107,255,.35)}\r
.w.w-game.qwen1-scope .logo em {font-style:normal;color:var(--panax2)}\r
.w.w-game.qwen1-scope .nav-links {display:flex;gap:4px;margin-left:8px}\r
.w.w-game.qwen1-scope .nav-links a {font-size:13px;font-weight:700;color:var(--muted);padding:8px 12px;border-radius:8px;transition:.2s;position:relative}\r
.w.w-game.qwen1-scope .nav-links a:hover {color:var(--ink);background:#141a2c}\r
.w.w-game.qwen1-scope .nav-links a.active {color:var(--panax2)}\r
.w.w-game.qwen1-scope .nav-links a.active::after {content:"";position:absolute;left:12px;right:12px;bottom:2px;height:2px;border-radius:2px;background:var(--panax2)}\r
.w.w-game.qwen1-scope .nav-right {margin-left:auto;display:flex;align-items:center;gap:12px}\r
.w.w-game.qwen1-scope .nav-badge {font-family:var(--fm);font-size:10.5px;color:var(--dim);letter-spacing:1px;text-transform:uppercase}\r
.w.w-game.qwen1-scope .btn {display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:800;font-size:13px;padding:10px 16px;border-radius:10px;border:1px solid transparent;transition:.2s;white-space:nowrap}\r
.w.w-game.qwen1-scope .btn-panax {background:linear-gradient(92deg,var(--panax),#6a4dff);color:#fff;box-shadow:0 6px 22px rgba(143,107,255,.3)}\r
.w.w-game.qwen1-scope .btn-panax:hover {transform:translateY(-1px);filter:brightness(1.08)}\r
.w.w-game.qwen1-scope .btn-lime {background:var(--panax2);color:#0c1005;box-shadow:0 6px 22px rgba(200,255,61,.2)}\r
.w.w-game.qwen1-scope .btn-lime:hover {transform:translateY(-1px);filter:brightness(1.05)}\r
.w.w-game.qwen1-scope .btn-ghost {background:#141a2c;border-color:var(--line2);color:var(--ink)}\r
.w.w-game.qwen1-scope .btn-ghost:hover {border-color:var(--panax);box-shadow:0 0 0 3px rgba(143,107,255,.14)}\r
.w.w-game.qwen1-scope .btn-sm {padding:7px 12px;font-size:12px;border-radius:8px}\r
.w.w-game.qwen1-scope .hero {padding:126px 0 40px}\r
.w.w-game.qwen1-scope .hero-in {display:grid;grid-template-columns:1.05fr .95fr;gap:44px;align-items:center}\r
.w.w-game.qwen1-scope .eyebrow {font-family:var(--fm);font-size:11px;letter-spacing:3px;color:var(--panax2);text-transform:uppercase;display:flex;align-items:center;gap:10px;margin-bottom:18px}\r
.w.w-game.qwen1-scope .eyebrow::before {content:"\u25AE";animation:blink 1.2s steps(2) infinite}\r
@keyframes blink {\r
50%{opacity:0}\r
}\r
.w.w-game.qwen1-scope .hero h1 {font-family:var(--fd);font-weight:900;font-size:clamp(28px,4.2vw,50px);line-height:1.1;letter-spacing:-.5px}\r
.w.w-game.qwen1-scope .grad {background:linear-gradient(92deg,var(--t1) 0%,var(--t2) 30%,var(--t3) 62%,var(--panax) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}\r
.w.w-game.qwen1-scope .hero-sub {color:var(--muted);font-size:15.5px;max-width:560px;margin:18px 0 22px;line-height:1.75}\r
.w.w-game.qwen1-scope .hero-sub b {color:var(--ink)}\r
.w.w-game.qwen1-scope .tierline {display:flex;flex-wrap:wrap;gap:7px;margin-bottom:22px}\r
.w.w-game.qwen1-scope .tierchip {display:inline-flex;align-items:center;gap:7px;font-size:10.5px;font-weight:800;letter-spacing:.5px;padding:6px 11px;border-radius:999px;border:1px solid var(--line);background:#0e1424;color:var(--muted)}\r
.w.w-game.qwen1-scope .tierchip i {width:9px;height:9px;border-radius:50%;background:var(--tc);box-shadow:0 0 10px var(--tc)}\r
.w.w-game.qwen1-scope .hero-code {display:flex;align-items:center;gap:10px;background:#0c1120;border:1px solid var(--line);border-radius:12px;padding:10px 12px;max-width:600px}\r
.w.w-game.qwen1-scope .hero-code code {font-family:var(--fm);font-size:11.5px;color:#9fe8ff;white-space:nowrap;overflow-x:auto;flex:1;scrollbar-width:thin}\r
.w.w-game.qwen1-scope .hero-code code b {color:var(--panax2);font-weight:400}\r
.w.w-game.qwen1-scope .livechart {background:linear-gradient(180deg,#10152a,#0b0f1e);border:1px solid var(--line2);border-radius:22px;padding:22px 24px;box-shadow:0 30px 80px rgba(0,0,0,.5);position:relative;overflow:hidden}\r
.w.w-game.qwen1-scope .livechart::before {content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--t1),var(--t2),var(--t3),var(--t4),var(--t5),var(--t6))}\r
.w.w-game.qwen1-scope .lc-head {display:flex;align-items:center;gap:12px;margin-bottom:6px}\r
.w.w-game.qwen1-scope .lc-head .px-logo {font-size:12px}\r
.w.w-game.qwen1-scope .lc-game {margin-left:auto;font-size:11px;font-weight:800;color:var(--muted);text-align:right}\r
.w.w-game.qwen1-scope .lc-game b {display:block;color:var(--ink);font-size:12.5px}\r
.w.w-game.qwen1-scope .lc-sub {font-family:var(--fm);font-size:9.5px;letter-spacing:2px;color:var(--dim);text-transform:uppercase;margin-bottom:16px}\r
.w.w-game.qwen1-scope .lc-foot {display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:13px;border-top:1px dashed var(--line2);font-size:11.5px;color:var(--muted)}\r
.w.w-game.qwen1-scope .lc-foot b {color:var(--panax2);font-family:var(--fm)}\r
.w.w-game.qwen1-scope .px-logo {display:inline-flex;align-items:center;gap:7px;font-family:var(--fd);font-weight:900;font-size:11px;letter-spacing:1.5px;color:inherit}\r
.w.w-game.qwen1-scope .px-logo i {width:20px;height:20px;border-radius:6px;background:linear-gradient(135deg,var(--panax),var(--panax2));display:grid;place-items:center;font-style:normal;font-size:10px;color:#0a0c14;flex:none}\r
.w.w-game.qwen1-scope .pxr {display:flex;gap:12px;align-items:flex-end;width:100%;justify-content:space-between}\r
.w.w-game.qwen1-scope .pxr-col {flex:1;display:flex;flex-direction:column;align-items:center;gap:9px;min-width:0}\r
.w.w-game.qwen1-scope .pxr-track {position:relative;width:100%;max-width:44px;height:var(--pxr-base);background:rgba(255,255,255,.075);border-radius:999px;overflow:hidden;transition:height .35s ease;box-shadow:inset 0 1px 3px rgba(0,0,0,.35)}\r
.w.w-game.qwen1-scope .pxr-track i {position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(180deg,color-mix(in srgb,var(--tc) 72%,#fff),var(--tc));border-radius:999px;transition:height 1.15s cubic-bezier(.2,.8,.2,1);box-shadow:0 0 18px color-mix(in srgb,var(--tc) 40%,transparent)}\r
.w.w-game.qwen1-scope .in .pxr-track i, .w.w-game.qwen1-scope .livechart.in .pxr-track i {height:var(--h)}\r
.w.w-game.qwen1-scope .pxr-badge {position:relative;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,color-mix(in srgb,var(--tc) 32%,#20263a),#10131d 72%);border:2px solid var(--tc);box-shadow:0 4px 14px rgba(0,0,0,.4),0 0 14px color-mix(in srgb,var(--tc) 26%,transparent);margin-top:2px}\r
.w.w-game.qwen1-scope .pxr-ico {width:60%;height:60%;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}\r
.w.w-game.qwen1-scope .pxr-ribbon {position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);background:var(--rb);color:#fff;font-size:6.5px;font-weight:800;letter-spacing:.6px;padding:2.5px 7px;border-radius:4px;white-space:nowrap;border:1px solid rgba(0,0,0,.4);box-shadow:0 2px 6px rgba(0,0,0,.4);text-shadow:0 1px 1px rgba(0,0,0,.35)}\r
.w.w-game.qwen1-scope .pxr-pct {font-family:var(--fm);font-size:12.5px;font-weight:700;color:var(--muted);margin-top:7px;letter-spacing:-.3px}\r
.w.w-game.qwen1-scope .pxr-lg .pxr-track {max-width:48px;height:calc(var(--pxr-base)*1.5)}\r
.w.w-game.qwen1-scope .pxr-lg .pxr-badge {width:48px;height:48px}\r
.w.w-game.qwen1-scope .pxr-lg .pxr-pct {font-size:14px}\r
.w.w-game.qwen1-scope .pxr-sm .pxr-track {max-width:34px;height:calc(var(--pxr-base)*.62)}\r
.w.w-game.qwen1-scope .pxr-sm .pxr-badge {width:34px;height:34px;border-width:1.5px}\r
.w.w-game.qwen1-scope .pxr-sm .pxr-ribbon {font-size:5.5px;padding:2px 5px;bottom:-7px}\r
.w.w-game.qwen1-scope .pxr-sm .pxr-pct {font-size:10px;margin-top:6px}\r
.w.w-game.qwen1-scope .pxr-sm {gap:8px}\r
.w.w-game.qwen1-scope .pxr-xs .pxr-track {max-width:22px;height:calc(var(--pxr-base)*.34)}\r
.w.w-game.qwen1-scope .pxr-xs .pxr-badge {width:24px;height:24px;border-width:1.5px}\r
.w.w-game.qwen1-scope .pxr-xs .pxr-ribbon {display:none}\r
.w.w-game.qwen1-scope .pxr-xs .pxr-pct {font-size:8px;margin-top:2px}\r
.w.w-game.qwen1-scope .pxr-xs {gap:6px}\r
.w.w-game.qwen1-scope .pxr-xs .pxr-col {gap:5px}\r
.w.w-game.qwen1-scope .pxr.on-light .pxr-track {background:rgba(24,18,8,.13);box-shadow:inset 0 1px 3px rgba(0,0,0,.15)}\r
.w.w-game.qwen1-scope .pxr.on-light .pxr-badge {background:radial-gradient(circle at 35% 28%,#fff,color-mix(in srgb,var(--tc) 26%,#fff) 78%);box-shadow:0 4px 12px rgba(60,40,10,.22)}\r
.w.w-game.qwen1-scope .pxr.on-light .pxr-pct {color:#4a4234}\r
.w.w-game.qwen1-scope body.hide-pct .pxr-pct {display:none}\r
.w.w-game.qwen1-scope body.hide-ribbon .pxr-ribbon {display:none}\r
.w.w-game.qwen1-scope .controls {position:sticky;top:64px;z-index:80;background:rgba(9,11,20,.88);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-block:1px solid var(--line)}\r
.w.w-game.qwen1-scope .controls-in {max-width:1280px;margin:0 auto;padding:12px 24px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}\r
.w.w-game.qwen1-scope .clabel {font-family:var(--fm);font-size:9.5px;letter-spacing:2px;color:var(--dim);text-transform:uppercase}\r
.w.w-game.qwen1-scope .gchips {display:flex;gap:8px;flex-wrap:wrap}\r
.w.w-game.qwen1-scope .gchip {display:flex;align-items:center;gap:8px;padding:5px 13px 5px 5px;border-radius:999px;border:1px solid var(--line);background:#0e1424;font-size:12px;font-weight:800;color:var(--muted);transition:.2s}\r
.w.w-game.qwen1-scope .gchip img {width:23px;height:31px;object-fit:cover;border-radius:5px}\r
.w.w-game.qwen1-scope .gchip:hover {border-color:var(--line2);color:var(--ink)}\r
.w.w-game.qwen1-scope .gchip.active {border-color:var(--panax2);color:var(--ink);box-shadow:0 0 0 3px rgba(200,255,61,.12)}\r
.w.w-game.qwen1-scope .tunes {display:flex;align-items:center;gap:12px;flex-wrap:wrap}\r
.w.w-game.qwen1-scope .tune {display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:var(--muted)}\r
.w.w-game.qwen1-scope .tune input[type=range] {width:96px;accent-color:var(--panax);cursor:pointer}\r
.w.w-game.qwen1-scope .tune output {font-family:var(--fm);font-size:10px;color:var(--panax2);min-width:34px}\r
.w.w-game.qwen1-scope .switch {display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:700;color:var(--muted);cursor:pointer;user-select:none}\r
.w.w-game.qwen1-scope .switch input {position:absolute;opacity:0;pointer-events:none}\r
.w.w-game.qwen1-scope .switch i {width:30px;height:17px;border-radius:999px;background:#1a2138;border:1px solid var(--line2);position:relative;transition:.2s;flex:none}\r
.w.w-game.qwen1-scope .switch i::after {content:"";position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;background:var(--dim);transition:.2s}\r
.w.w-game.qwen1-scope .switch input:checked+i {background:var(--panax);border-color:var(--panax)}\r
.w.w-game.qwen1-scope .switch input:checked+i::after {left:15px;background:#fff}\r
.w.w-game.qwen1-scope .fchips {display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}\r
.w.w-game.qwen1-scope .fchip {font-family:var(--fm);font-size:10.5px;padding:7px 11px;border-radius:8px;border:1px solid var(--line);color:var(--muted);transition:.2s;letter-spacing:.4px}\r
.w.w-game.qwen1-scope .fchip sup {color:var(--dim);margin-left:3px}\r
.w.w-game.qwen1-scope .fchip:hover {color:var(--ink);border-color:var(--line2)}\r
.w.w-game.qwen1-scope .fchip.active {background:var(--panax2);border-color:var(--panax2);color:#0c1005;font-weight:700}\r
.w.w-game.qwen1-scope .fchip.active sup {color:#3c5207}\r
.w.w-game.qwen1-scope .section {padding:36px 0 60px;scroll-margin-top:170px}\r
.w.w-game.qwen1-scope .grid {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}\r
.w.w-game.qwen1-scope .vcard {background:linear-gradient(180deg,#0e1322,#0b0f1c);border:1px solid var(--line);border-radius:20px;overflow:hidden;opacity:0;scroll-margin-top:180px;transition:border-color .3s}\r
.w.w-game.qwen1-scope .vcard:hover {border-color:#2c3757}\r
.w.w-game.qwen1-scope .vcard.in {animation:cardIn .65s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0ms)}\r
@keyframes cardIn {\r
from{opacity:0;transform:translateY(28px) scale(.985)}to{opacity:1;transform:none}\r
}\r
.w.w-game.qwen1-scope .vcard.hide {display:none}\r
.w.w-game.qwen1-scope .vcard.span2 {grid-column:1/-1}\r
.w.w-game.qwen1-scope .vcard.flash {animation:flash 1.3s ease}\r
@keyframes flash {\r
0%,100%{box-shadow:none}25%,60%{box-shadow:0 0 0 3px var(--panax2),0 0 60px rgba(200,255,61,.3)}\r
}\r
.w.w-game.qwen1-scope .vhead {display:flex;align-items:center;gap:14px;padding:15px 20px;border-bottom:1px dashed #1c2338}\r
.w.w-game.qwen1-scope .vnum {font-family:var(--fd);font-weight:900;font-size:23px;color:#39415f;line-height:1}\r
@supports(-webkit-text-stroke:1px #fff) {\r
.w.w-game.qwen1-scope .vnum {color:transparent;-webkit-text-stroke:1.2px #3a4468}\r
.w.w-game.qwen1-scope .vcard:hover .vnum {-webkit-text-stroke-color:var(--panax2)}\r
}\r
.w.w-game.qwen1-scope .vhead h3 {font-size:15px;font-weight:800;letter-spacing:.2px}\r
.w.w-game.qwen1-scope .vcat {font-family:var(--fm);font-size:9.5px;color:var(--dim);text-transform:uppercase;letter-spacing:1.5px;margin-top:2px}\r
.w.w-game.qwen1-scope .vhead .btn {margin-left:auto}\r
.w.w-game.qwen1-scope .stage.flush {padding:0;background:#0a0d18}\r
.w.w-game.qwen1-scope .vfoot {display:flex;align-items:center;gap:12px;padding:11px 20px;border-top:1px dashed #1c2338}\r
.w.w-game.qwen1-scope .vnote {font-family:var(--fm);font-size:10px;color:var(--dim);flex:1;letter-spacing:.3px}\r
.w.w-game.qwen1-scope .grid.swap .stage {animation:swap .45s ease}\r
@keyframes swap {\r
from{opacity:.3;transform:translateY(7px)}to{opacity:1;transform:none}\r
}\r
.w.w-game.qwen1-scope .w1 {width:min(100%,920px);background:linear-gradient(180deg,#0e1426,#0a0e1c);border:1px solid #232c4a;border-radius:20px;padding:22px 24px;box-shadow:0 26px 70px rgba(0,0,0,.5);position:relative;overflow:hidden}\r
.w.w-game.qwen1-scope .w1::before {content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--t1),var(--t2),var(--t3),var(--t4),var(--t5),var(--t6))}\r
.w.w-game.qwen1-scope .w1-head {display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap}\r
.w.w-game.qwen1-scope .w1-hsub {font-family:var(--fm);font-size:9px;letter-spacing:2.5px;color:var(--dim);text-transform:uppercase}\r
.w.w-game.qwen1-scope .w1-live {margin-left:auto;display:flex;align-items:center;gap:7px;font-family:var(--fm);font-size:10px;color:var(--muted)}\r
.w.w-game.qwen1-scope .w1-live i {width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 10px var(--ok);animation:pulse 2s infinite}\r
@keyframes pulse {\r
50%{opacity:.35}\r
}\r
.w.w-game.qwen1-scope .w1-top {display:flex;gap:20px;margin-bottom:20px}\r
.w.w-game.qwen1-scope .w1-cover {flex:none;width:150px}\r
.w.w-game.qwen1-scope .w1-cover img {width:100%;height:212px;object-fit:cover;border-radius:13px;border:1px solid #2a3350;box-shadow:0 14px 34px rgba(0,0,0,.45)}\r
.w.w-game.qwen1-scope .w1-info {flex:1;min-width:0}\r
.w.w-game.qwen1-scope .w1-info h4 {font-family:var(--fd);font-weight:900;font-size:26px;line-height:1.12;margin-bottom:7px}\r
.w.w-game.qwen1-scope .w1-meta {font-size:12px;color:var(--muted);margin-bottom:10px}\r
.w.w-game.qwen1-scope .w1-tags {display:flex;flex-wrap:wrap;gap:6px;margin-bottom:11px}\r
.w.w-game.qwen1-scope .w1-tags span {font-size:10px;font-weight:800;color:var(--panax2);background:rgba(200,255,61,.08);border:1px solid rgba(200,255,61,.25);padding:3px 10px;border-radius:999px}\r
.w.w-game.qwen1-scope .w1-desc {font-size:12.5px;color:#b9c2dc;line-height:1.65;margin-bottom:13px}\r
.w.w-game.qwen1-scope .w1-kpis {display:flex;gap:9px;flex-wrap:wrap}\r
.w.w-game.qwen1-scope .w1-kpi {background:#10172c;border:1px solid #232c4a;border-radius:10px;padding:8px 13px}\r
.w.w-game.qwen1-scope .w1-kpi b {display:block;font-family:var(--fm);font-weight:700;font-size:16px;color:var(--panax2)}\r
.w.w-game.qwen1-scope .w1-kpi span {font-size:9px;color:var(--dim);letter-spacing:.5px}\r
.w.w-game.qwen1-scope .w1-foot {display:flex;align-items:center;gap:14px;margin-top:18px;padding-top:15px;border-top:1px dashed #232c4a;flex-wrap:wrap}\r
.w.w-game.qwen1-scope .w1-go {display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:#fff;background:linear-gradient(92deg,var(--panax),#6a4dff);padding:11px 18px;border-radius:11px;box-shadow:0 8px 26px rgba(143,107,255,.35);transition:.2s}\r
.w.w-game.qwen1-scope .w1-go:hover {transform:translateY(-2px);filter:brightness(1.08)}\r
.w.w-game.qwen1-scope .w1-note {font-family:var(--fm);font-size:9.5px;color:var(--dim);letter-spacing:.5px}\r
.w.w-game.qwen1-scope .w2scene {position:relative;width:min(100%,560px);border-radius:22px;overflow:hidden;perspective:1100px;box-shadow:0 30px 70px rgba(0,0,0,.5)}\r
.w.w-game.qwen1-scope .w2bg {position:absolute;inset:-30px;width:calc(100% + 60px);height:calc(100% + 60px);object-fit:cover;filter:blur(30px) saturate(1.5) brightness(.5);transform:scale(1.15)}\r
.w.w-game.qwen1-scope .w2 {position:relative;margin:20px;padding:18px;border-radius:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transform-style:preserve-3d;box-shadow:0 20px 50px rgba(0,0,0,.35)}\r
.w.w-game.qwen1-scope .w2.rest {transition:transform .6s cubic-bezier(.2,.8,.2,1)}\r
.w.w-game.qwen1-scope .w2-top {display:flex;gap:15px;margin-bottom:15px;transform:translateZ(26px)}\r
.w.w-game.qwen1-scope .w2-cover {flex:none;width:104px}\r
.w.w-game.qwen1-scope .w2-cover img {width:100%;height:150px;object-fit:cover;border-radius:11px;box-shadow:0 14px 30px rgba(0,0,0,.5)}\r
.w.w-game.qwen1-scope .w2-info {flex:1;min-width:0}\r
.w.w-game.qwen1-scope .w2-info .px-logo {font-size:9px;margin-bottom:7px;color:#fff}\r
.w.w-game.qwen1-scope .w2-info .px-logo i {width:16px;height:16px;font-size:8px;border-radius:5px}\r
.w.w-game.qwen1-scope .w2-info h4 {font-family:var(--fd);font-weight:800;font-size:18px;color:#fff;line-height:1.2}\r
.w.w-game.qwen1-scope .w2-meta {font-size:10.5px;color:rgba(255,255,255,.65);margin:4px 0 8px}\r
.w.w-game.qwen1-scope .w2-tags {display:flex;flex-wrap:wrap;gap:4px}\r
.w.w-game.qwen1-scope .w2-tags span {font-size:9px;font-weight:700;color:rgba(255,255,255,.85);background:rgba(255,255,255,.1);padding:2.5px 8px;border-radius:999px}\r
.w.w-game.qwen1-scope .w2-pos {display:flex;align-items:baseline;gap:7px;margin:9px 0 0}\r
.w.w-game.qwen1-scope .w2-pos b {font-family:var(--fd);font-weight:900;font-size:20px;color:var(--panax2)}\r
.w.w-game.qwen1-scope .w2-pos span {font-size:9.5px;color:rgba(255,255,255,.6)}\r
.w.w-game.qwen1-scope .w2 .pxr {transform:translateZ(18px)}\r
.w.w-game.qwen1-scope .w2-cta {display:flex;align-items:center;gap:9px;margin-top:15px;transform:translateZ(22px)}\r
.w.w-game.qwen1-scope .w2-go {flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:12px;font-weight:800;color:#0b0d08;background:linear-gradient(92deg,var(--panax2),#9fe870);padding:10px 14px;border-radius:10px;transition:.2s}\r
.w.w-game.qwen1-scope .w2-go:hover {filter:brightness(1.06);transform:translateY(-1px)}\r
.w.w-game.qwen1-scope .w2-votes {font-family:var(--fm);font-size:9px;color:rgba(255,255,255,.6);white-space:nowrap}\r
.w.w-game.qwen1-scope .w2-shine {position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(420px circle at var(--mx,50%) var(--my,50%),rgba(255,255,255,.13),transparent 60%)}\r
.w.w-game.qwen1-scope .w3 {position:relative;width:min(100%,580px);display:flex;background:var(--paper);color:var(--paperink);border-radius:16px;overflow:hidden;box-shadow:0 26px 60px rgba(0,0,0,.5);border:1px solid #d8cdb8}\r
.w.w-game.qwen1-scope .w3-stub {flex:none;width:150px;background:linear-gradient(160deg,#2a2440,#171326);color:#fff;padding:14px;display:flex;flex-direction:column;gap:10px;position:relative}\r
.w.w-game.qwen1-scope .w3-stub::after {content:"";position:absolute;top:0;bottom:0;right:-1px;width:2px;background:repeating-linear-gradient(180deg,transparent 0 7px,#d8cdb8 7px 13px)}\r
.w.w-game.qwen1-scope .w3-stub img {width:100%;height:150px;object-fit:cover;border-radius:9px;border:2px solid rgba(255,255,255,.2)}\r
.w.w-game.qwen1-scope .w3-stub b {font-family:var(--fd);font-weight:900;font-size:10px;letter-spacing:2px;text-align:center;color:var(--panax2)}\r
.w.w-game.qwen1-scope .w3-bar {height:26px;background:repeating-linear-gradient(90deg,#fff 0 2px,transparent 2px 4px,#fff 4px 7px,transparent 7px 9px);opacity:.85;border-radius:2px}\r
.w.w-game.qwen1-scope .w3-main {flex:1;min-width:0;padding:18px 20px}\r
.w.w-game.qwen1-scope .w3-head {display:flex;align-items:center;gap:10px;margin-bottom:9px}\r
.w.w-game.qwen1-scope .w3-head .px-logo {font-size:9px;color:var(--paperink)}\r
.w.w-game.qwen1-scope .w3-head .px-logo i {width:16px;height:16px;font-size:8px}\r
.w.w-game.qwen1-scope .w3-no {margin-left:auto;font-family:var(--fm);font-size:9px;color:#8a7d66;letter-spacing:1px}\r
.w.w-game.qwen1-scope .w3-main h4 {font-family:var(--fd);font-weight:900;font-size:20px;line-height:1.12;margin-bottom:4px}\r
.w.w-game.qwen1-scope .w3-meta {font-size:10.5px;color:#7a6f5c;margin-bottom:12px}\r
.w.w-game.qwen1-scope .w3-pos {display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #ddd2bc;border-radius:10px;padding:7px 11px;margin-bottom:12px}\r
.w.w-game.qwen1-scope .w3-pos b {font-family:var(--fd);font-weight:900;font-size:18px;color:#5b3fd6}\r
.w.w-game.qwen1-scope .w3-pos span {font-size:9.5px;color:#7a6f5c;line-height:1.4}\r
.w.w-game.qwen1-scope .w3-foot {display:flex;align-items:center;gap:10px;margin-top:13px}\r
.w.w-game.qwen1-scope .w3-go {display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:800;color:#fff;background:#5b3fd6;padding:9px 14px;border-radius:9px;transition:.2s}\r
.w.w-game.qwen1-scope .w3-go:hover {background:#4a32b8}\r
.w.w-game.qwen1-scope .w3-votes {font-family:var(--fm);font-size:9px;color:#8a7d66}\r
.w.w-game.qwen1-scope .w3-notch {position:absolute;left:149px;width:18px;height:18px;border-radius:50%;background:#0c101d;z-index:2}\r
.w.w-game.qwen1-scope .w3-notch.top {top:-9px}\r
.w.w-game.qwen1-scope .w3-notch.bot {bottom:-9px}\r
.w.w-game.qwen1-scope .w4 {width:min(100%,560px);background:var(--paper);color:var(--paperink);border-radius:5px;padding:22px 24px;box-shadow:0 24px 60px rgba(0,0,0,.45)}\r
.w.w-game.qwen1-scope .w4-head {display:flex;justify-content:space-between;font-size:9.5px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;border-top:3px double var(--paperink);border-bottom:1px solid var(--paperink);padding:8px 2px;margin-bottom:16px}\r
.w.w-game.qwen1-scope .w4-grid {display:grid;grid-template-columns:108px 1fr auto;gap:16px;align-items:start;margin-bottom:16px}\r
.w.w-game.qwen1-scope .w4-fig img {width:108px;height:154px;object-fit:cover;border:1px solid var(--paperink);padding:4px;background:#fff}\r
.w.w-game.qwen1-scope .w4-fig figcaption {font-size:8.5px;font-style:italic;color:#7a6f60;margin-top:6px;text-align:center;font-family:var(--fs)}\r
.w.w-game.qwen1-scope .w4-kicker {font-size:9.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#5b3fd6;margin-bottom:6px}\r
.w.w-game.qwen1-scope .w4-main h4 {font-family:var(--fs);font-weight:900;font-size:26px;line-height:1.08;margin-bottom:8px}\r
.w.w-game.qwen1-scope .w4-lede {font-size:11.5px;line-height:1.65;color:#453c31}\r
.w.w-game.qwen1-scope .w4-lede::first-letter {font-family:var(--fs);font-weight:900;font-size:30px;float:left;line-height:.85;padding:3px 6px 0 0;color:#5b3fd6}\r
.w.w-game.qwen1-scope .w4-score {text-align:right;border-left:1px solid #d8cfbf;padding-left:14px}\r
.w.w-game.qwen1-scope .w4-score b {display:block;font-family:var(--fs);font-weight:900;font-size:40px;line-height:1;color:#5b3fd6}\r
.w.w-game.qwen1-scope .w4-score span {display:block;font-size:8.5px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-top:5px}\r
.w.w-game.qwen1-scope .w4-score em {display:block;font-family:var(--fs);font-style:italic;font-size:10.5px;color:#7a6f60;margin-top:6px}\r
.w.w-game.qwen1-scope .w4-foot {display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid var(--paperink);margin-top:15px;padding-top:11px;flex-wrap:wrap}\r
.w.w-game.qwen1-scope .w4-read {font-size:12px;font-weight:800;color:#5b3fd6;text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:1.5px}\r
.w.w-game.qwen1-scope .w4-read:hover {color:#3f2a99}\r
.w.w-game.qwen1-scope .w4-foot>span {font-size:9.5px;color:#7a6f60;letter-spacing:.5px}\r
.w.w-game.qwen1-scope .w5 {width:min(100%,540px);background:#151027;border:3px solid #000;border-radius:18px;padding:14px;box-shadow:0 0 0 3px #2c2447,0 28px 60px rgba(0,0,0,.6)}\r
.w.w-game.qwen1-scope .w5-marquee {background:linear-gradient(90deg,var(--t1),var(--t2),var(--t3),var(--t4));border:2px solid #000;border-radius:8px;padding:8px;text-align:center;margin-bottom:12px}\r
.w.w-game.qwen1-scope .w5-marquee span {font-family:var(--fp);font-size:8px;color:#0b0714;letter-spacing:1px}\r
.w.w-game.qwen1-scope .w5-crt {position:relative;background:#020409;border:3px solid #000;border-radius:12px;padding:15px;overflow:hidden;margin-bottom:13px}\r
.w.w-game.qwen1-scope .w5-row {display:flex;gap:15px;position:relative;z-index:1;margin-bottom:14px}\r
.w.w-game.qwen1-scope .w5-art {flex:none;width:104px}\r
.w.w-game.qwen1-scope .w5-art img {width:100%;height:146px;object-fit:cover;box-shadow:0 0 0 3px var(--panax2),0 0 26px rgba(200,255,61,.4)}\r
.w.w-game.qwen1-scope .w5-data {flex:1;min-width:0}\r
.w.w-game.qwen1-scope .w5-px {font-family:var(--fp);font-size:7px;color:#8f9bd4;letter-spacing:1px;margin-bottom:8px}\r
.w.w-game.qwen1-scope .w5-title {font-family:var(--fp);font-size:11px;line-height:1.7;color:#fff;text-transform:uppercase;text-shadow:2px 2px 0 var(--t6),-2px -2px 0 var(--t4);margin-bottom:8px}\r
.w.w-game.qwen1-scope .w5-sub {font-family:var(--fm);font-size:9.5px;color:#7c88b8;margin-bottom:9px}\r
.w.w-game.qwen1-scope .w5-pos {font-family:var(--fp);font-size:8px;color:#aab4e0;line-height:2}\r
.w.w-game.qwen1-scope .w5-pos b {color:var(--panax2);font-size:10px}\r
.w.w-game.qwen1-scope .w5 .pxr {position:relative;z-index:1}\r
.w.w-game.qwen1-scope .w5 .pxr-track {border-radius:4px;background:#10142a}\r
.w.w-game.qwen1-scope .w5 .pxr-track i {border-radius:4px}\r
.w.w-game.qwen1-scope .w5 .pxr-badge {border-radius:6px}\r
.w.w-game.qwen1-scope .w5-scanlines {position:absolute;inset:0;z-index:2;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.045) 0 1px,transparent 1px 3px)}\r
.w.w-game.qwen1-scope .w5-vignette {position:absolute;inset:0;z-index:2;pointer-events:none;background:radial-gradient(120% 100% at 50% 50%,transparent 55%,rgba(0,0,0,.55));animation:crtflick 4s steps(3) infinite}\r
@keyframes crtflick {\r
0%,100%{opacity:1}50%{opacity:.92}\r
}\r
.w.w-game.qwen1-scope .w5-deck {display:flex;align-items:center;gap:12px;flex-wrap:wrap}\r
.w.w-game.qwen1-scope .w5-start {display:inline-flex;align-items:center;gap:9px;font-family:var(--fp);font-size:9px;color:#fff;background:var(--danger);border:3px solid #000;border-radius:9px;padding:12px 16px;box-shadow:0 5px 0 #7a0f22;transition:.1s}\r
.w.w-game.qwen1-scope .w5-start i {font-style:normal;animation:blink 1s steps(2) infinite}\r
.w.w-game.qwen1-scope .w5-start:hover {filter:brightness(1.1)}\r
.w.w-game.qwen1-scope .w5-start:active {transform:translateY(4px);box-shadow:0 1px 0 #7a0f22}\r
.w.w-game.qwen1-scope .w5-credit {font-family:var(--fp);font-size:7px;color:#596390;margin-left:auto;letter-spacing:1px}\r
.w.w-game.qwen1-scope .w5-credit .blink {animation:blink 1s steps(2) infinite;color:var(--panax2)}\r
.w.w-game.qwen1-scope .w6 {position:relative;width:100%;min-height:430px;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between}\r
.w.w-game.qwen1-scope .w6-artwrap {position:absolute;inset:0;overflow:hidden;transform:translate(var(--px,0px),var(--py,0px)) scale(1.07);transition:transform .25s ease-out}\r
.w.w-game.qwen1-scope .w6-art {width:100%;height:100%;object-fit:cover;animation:kenburns 26s ease-in-out infinite alternate}\r
@keyframes kenburns {\r
from{transform:scale(1.05)}to{transform:scale(1.16) translate(-14px,-8px)}\r
}\r
.w.w-game.qwen1-scope .w6-scrim {position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,6,10,.45),rgba(5,6,10,.06) 36%,rgba(5,6,10,.95) 84%)}\r
.w.w-game.qwen1-scope .w6-top {position:relative;display:flex;justify-content:space-between;align-items:center;padding:22px 26px}\r
.w.w-game.qwen1-scope .w6-top .px-logo {color:#fff;background:rgba(8,10,16,.55);border:1px solid rgba(255,255,255,.22);backdrop-filter:blur(8px);padding:7px 14px;border-radius:999px}\r
.w.w-game.qwen1-scope .w6-year {font-family:var(--fd);font-weight:900;font-size:15px;color:rgba(255,255,255,.85);text-shadow:0 2px 14px rgba(0,0,0,.6)}\r
.w.w-game.qwen1-scope .w6-bottom {position:relative;display:flex;align-items:flex-end;gap:26px;padding:0 26px 26px;flex-wrap:wrap}\r
.w.w-game.qwen1-scope .w6-left {flex:1;min-width:260px}\r
.w.w-game.qwen1-scope .w6-kicker {font-family:var(--fm);font-size:10.5px;letter-spacing:2.5px;text-transform:uppercase;color:var(--panax2);margin-bottom:9px;text-shadow:0 0 16px rgba(200,255,61,.5)}\r
.w.w-game.qwen1-scope .w6-left h4 {font-family:var(--fd);font-weight:900;font-size:clamp(28px,4.4vw,50px);line-height:1.04;color:#fff;text-shadow:0 6px 40px rgba(0,0,0,.65)}\r
.w.w-game.qwen1-scope .w6-meta {font-size:12.5px;color:rgba(255,255,255,.72);margin:10px 0 16px;font-weight:600}\r
.w.w-game.qwen1-scope .w6-go {display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:#fff;background:linear-gradient(92deg,var(--panax),#6a4dff);padding:11px 18px;border-radius:11px;box-shadow:0 10px 30px rgba(143,107,255,.4);transition:.2s}\r
.w.w-game.qwen1-scope .w6-go:hover {transform:translateY(-2px);filter:brightness(1.08)}\r
.w.w-game.qwen1-scope .w6-panel {flex:none;width:340px;background:rgba(8,10,16,.6);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-radius:16px;padding:15px 16px}\r
.w.w-game.qwen1-scope .w6-panel-head {display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}\r
.w.w-game.qwen1-scope .w6-panel-head b {font-family:var(--fd);font-weight:900;font-size:17px;color:var(--panax2)}\r
.w.w-game.qwen1-scope .w6-panel-head span {font-size:9px;color:rgba(255,255,255,.6);letter-spacing:1px;text-transform:uppercase}\r
.w.w-game.qwen1-scope .w7wrap {width:min(100%,760px)}\r
.w.w-game.qwen1-scope .w7-p {font-size:13.5px;color:#aab3cf;line-height:1.8}\r
.w.w-game.qwen1-scope .w7-p b {color:var(--ink)}\r
.w.w-game.qwen1-scope .w7 {display:flex;align-items:center;gap:14px;background:#10141f;border:1px solid #232a3d;border-left:3px solid var(--panax);border-radius:12px;padding:11px 15px;margin:14px 0;transition:.25s}\r
.w.w-game.qwen1-scope .w7:hover {border-color:var(--panax);transform:translateX(3px);box-shadow:0 12px 34px rgba(0,0,0,.4)}\r
.w.w-game.qwen1-scope .w7>img {width:42px;height:58px;object-fit:cover;border-radius:7px;flex:none}\r
.w.w-game.qwen1-scope .w7-t {flex:1;min-width:0}\r
.w.w-game.qwen1-scope .w7-t b {display:block;font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\r
.w.w-game.qwen1-scope .w7-t span {font-size:10.5px;color:var(--muted)}\r
.w.w-game.qwen1-scope .w7 .pxr {flex:none;width:190px}\r
.w.w-game.qwen1-scope .w7-pos {flex:none;font-size:11px;font-weight:800;color:#0c1005;background:var(--panax2);padding:5px 10px;border-radius:999px;white-space:nowrap}\r
.w.w-game.qwen1-scope .w7-go {display:grid;place-items:center;width:32px;height:32px;flex:none;border-radius:9px;background:linear-gradient(135deg,var(--panax),#6a4dff);color:#fff;font-size:14px;transition:.2s}\r
.w.w-game.qwen1-scope .w7-go:hover {filter:brightness(1.12);transform:scale(1.06)}\r
.w.w-game.qwen1-scope .w8scene {perspective:1200px;display:grid;place-items:center;padding:8px}\r
.w.w-game.qwen1-scope .w8 {position:relative;width:306px;border-radius:18px;background:linear-gradient(160deg,#2c2540,#161221);box-shadow:0 0 0 2px #453a63,0 0 0 5px #1c1730,0 34px 70px rgba(0,0,0,.65);transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transform-style:preserve-3d;padding:11px}\r
.w.w-game.qwen1-scope .w8.rest {transition:transform .7s cubic-bezier(.2,.8,.2,1)}\r
.w.w-game.qwen1-scope .w8-in {position:relative;display:flex;flex-direction:column;gap:7px;background:linear-gradient(180deg,#1b1628,#120e1d);border:1px solid #3c3258;border-radius:11px;padding:11px;overflow:hidden}\r
.w.w-game.qwen1-scope .w8-head {display:flex;align-items:center;gap:8px}\r
.w.w-game.qwen1-scope .w8-head b {flex:1;font-family:var(--fd);font-weight:800;font-size:13px;color:#f1ecff;line-height:1.25}\r
.w.w-game.qwen1-scope .w8-gem {flex:none;min-width:46px;height:40px;padding:0 8px;display:grid;place-items:center;background:conic-gradient(from 210deg,var(--panax2),#fff8,var(--panax),#0006,var(--panax2));clip-path:polygon(12% 0,88% 0,100% 50%,88% 100%,12% 100%,0 50%)}\r
.w.w-game.qwen1-scope .w8-gem i {font-style:normal;font-family:var(--fd);font-weight:900;font-size:11px;color:#0e0a18}\r
.w.w-game.qwen1-scope .w8-art {position:relative;border:2px solid #4a4166;border-radius:8px;overflow:hidden}\r
.w.w-game.qwen1-scope .w8-art img {width:100%;height:170px;object-fit:cover}\r
.w.w-game.qwen1-scope .w8-rarity {position:absolute;top:7px;left:7px;font-family:var(--fm);font-size:7.5px;font-weight:700;letter-spacing:2px;color:#0e0a18;background:linear-gradient(90deg,#ffe9a3,var(--t1));padding:3px 8px;border-radius:4px;box-shadow:0 3px 10px rgba(0,0,0,.5)}\r
.w.w-game.qwen1-scope .w8-type {font-size:9px;font-weight:800;letter-spacing:.6px;color:#c9bfe6;background:#241d3a;border:1px solid #3c3258;border-radius:5px;padding:4px 8px}\r
.w.w-game.qwen1-scope .w8 .pxr {padding:4px 2px 0}\r
.w.w-game.qwen1-scope .w8-flavor {font-family:var(--fs);font-style:italic;font-size:10px;line-height:1.5;color:#a99cc9;padding:0 3px}\r
.w.w-game.qwen1-scope .w8-foot {display:flex;align-items:center;justify-content:space-between;border-top:1px solid #3c3258;padding-top:7px}\r
.w.w-game.qwen1-scope .w8-foot>span {font-family:var(--fm);font-size:7px;letter-spacing:1.5px;color:#6f6396}\r
.w.w-game.qwen1-scope .w8-foot a {display:inline-flex;align-items:center;gap:5px;font-size:9px;font-weight:800;color:var(--panax2)}\r
.w.w-game.qwen1-scope .w8-foot a:hover {text-decoration:underline}\r
.w.w-game.qwen1-scope .w8-foil {position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:var(--fo,0);transition:opacity .35s;mix-blend-mode:color-dodge;filter:hue-rotate(calc(var(--mxn,0)*160deg));\r
  background:linear-gradient(115deg,transparent 22%,rgba(255,0,132,.32) 36%,rgba(0,229,255,.32) 47%,rgba(200,255,61,.32) 58%,transparent 74%),radial-gradient(circle at var(--mx,50%) var(--my,50%),rgba(255,255,255,.34),transparent 46%)}\r
.w.w-game.qwen1-scope .w8-spark {position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:calc(var(--fo,0)*.6);transition:opacity .35s;mix-blend-mode:screen;\r
  background-image:radial-gradient(circle,rgba(255,255,255,.95) 0 1px,transparent 1.8px),radial-gradient(circle,rgba(255,255,255,.7) 0 .8px,transparent 1.4px);\r
  background-size:88px 88px,53px 53px;background-position:calc(var(--mxn,0)*46px) calc(var(--myn,0)*36px),calc(var(--mxn,0)*-30px) calc(var(--myn,0)*-24px)}\r
.w.w-game.qwen1-scope .w9 {position:relative;width:min(100%,620px);background:var(--t1);color:#0d0d0d;border:3px solid #0d0d0d;border-radius:6px;box-shadow:10px 10px 0 #0d0d0d;transition:.2s}\r
.w.w-game.qwen1-scope .w9:hover {transform:translate(-3px,-3px);box-shadow:14px 14px 0 #0d0d0d}\r
.w.w-game.qwen1-scope .w9-marquee {background:#0d0d0d;overflow:hidden;padding:7px 0;border-bottom:3px solid #0d0d0d}\r
.w.w-game.qwen1-scope .w9-track {display:inline-block;white-space:nowrap;font-family:var(--fm);font-size:9px;font-weight:700;letter-spacing:2px;color:var(--t1);animation:marq 16s linear infinite}\r
@keyframes marq {\r
to{transform:translateX(-50%)}\r
}\r
.w.w-game.qwen1-scope .w9-body {position:relative;display:flex;gap:16px;padding:18px}\r
.w.w-game.qwen1-scope .w9-art {position:relative;flex:none;width:118px;border:3px solid #0d0d0d;box-shadow:6px 6px 0 rgba(13,13,13,.35)}\r
.w.w-game.qwen1-scope .w9-art img {width:100%;height:160px;object-fit:cover}\r
.w.w-game.qwen1-scope .w9-dots {position:absolute;inset:0;background-image:radial-gradient(rgba(13,13,13,.5) 1px,transparent 1.4px);background-size:5px 5px;mix-blend-mode:multiply;opacity:.35;pointer-events:none}\r
.w.w-game.qwen1-scope .w9-info {flex:1;min-width:0}\r
.w.w-game.qwen1-scope .w9-tape {display:inline-block;font-family:var(--fm);font-size:9px;font-weight:700;letter-spacing:1.5px;background:rgba(255,255,255,.75);border:2px solid #0d0d0d;padding:3px 10px;transform:rotate(-1.5deg);margin-bottom:8px}\r
.w.w-game.qwen1-scope .w9-info h4 {font-family:var(--fd);font-weight:900;font-size:20px;line-height:1.05;text-transform:uppercase;letter-spacing:-.5px;margin-bottom:5px}\r
.w.w-game.qwen1-scope .w9-meta {font-size:10.5px;font-weight:800;margin-bottom:9px}\r
.w.w-game.qwen1-scope .w9-tags {display:flex;flex-wrap:wrap;gap:5px;margin-bottom:11px}\r
.w.w-game.qwen1-scope .w9-tags span {font-size:8.5px;font-weight:800;background:#fff;border:2px solid #0d0d0d;padding:2.5px 8px;text-transform:uppercase}\r
.w.w-game.qwen1-scope .w9 .pxr-track {background:rgba(13,13,13,.2);box-shadow:none}\r
.w.w-game.qwen1-scope .w9 .pxr-badge {border-color:#0d0d0d;background:#fff;box-shadow:3px 3px 0 rgba(13,13,13,.4)}\r
.w.w-game.qwen1-scope .w9 .pxr-pct {color:#0d0d0d;font-weight:700}\r
.w.w-game.qwen1-scope .w9-cta {display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}\r
.w.w-game.qwen1-scope .w9-go {display:inline-flex;align-items:center;gap:8px;font-family:var(--fd);font-weight:800;font-size:11px;letter-spacing:.5px;background:#0d0d0d;color:var(--t1);border:3px solid #0d0d0d;padding:9px 15px;transition:.15s}\r
.w.w-game.qwen1-scope .w9-go:hover {background:#fff;color:#0d0d0d}\r
.w.w-game.qwen1-scope .w9-votes {display:inline-flex;align-items:center;font-family:var(--fm);font-size:9px;font-weight:700;letter-spacing:1px;background:#fff;border:3px solid #0d0d0d;padding:9px 11px}\r
.w.w-game.qwen1-scope .w9-sticker {position:absolute;top:-16px;right:14px;width:74px;height:74px;border-radius:50%;background:var(--danger);color:#fff;border:3px solid #0d0d0d;display:grid;place-content:center;text-align:center;transform:rotate(9deg);box-shadow:4px 4px 0 #0d0d0d}\r
.w.w-game.qwen1-scope .w9-sticker b {font-family:var(--fd);font-weight:900;font-size:15px;line-height:1}\r
.w.w-game.qwen1-scope .w9-sticker span {font-family:var(--fm);font-size:6.5px;font-weight:700;letter-spacing:1px;margin-top:3px}\r
.w.w-game.qwen1-scope .w9-foot {display:flex;align-items:center;gap:13px;padding:0 18px 15px}\r
.w.w-game.qwen1-scope .w9-barcode {width:100px;height:22px;background:repeating-linear-gradient(90deg,#0d0d0d 0 2px,transparent 2px 4px,#0d0d0d 4px 7px,transparent 7px 9px,#0d0d0d 9px 10px,transparent 10px 14px)}\r
.w.w-game.qwen1-scope .w9-foot span {font-family:var(--fm);font-size:8px;font-weight:700;letter-spacing:2px}\r
.w.w-game.qwen1-scope .w10 {position:relative;width:min(100%,920px);background:#05070c;border:1px solid #2a2150;border-radius:8px;padding:18px 20px;font-family:var(--fm);overflow:hidden;color:#d7dcf0}\r
.w.w-game.qwen1-scope .w10-c {position:absolute;width:14px;height:14px;border:0 solid var(--panax)}\r
.w.w-game.qwen1-scope .w10-c.c1 {top:-1px;left:-1px;border-top-width:2px;border-left-width:2px}\r
.w.w-game.qwen1-scope .w10-c.c2 {top:-1px;right:-1px;border-top-width:2px;border-right-width:2px}\r
.w.w-game.qwen1-scope .w10-c.c3 {bottom:-1px;left:-1px;border-bottom-width:2px;border-left-width:2px}\r
.w.w-game.qwen1-scope .w10-c.c4 {bottom:-1px;right:-1px;border-bottom-width:2px;border-right-width:2px}\r
.w.w-game.qwen1-scope .w10-scan {position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent 0 44%,rgba(143,107,255,.08) 50%,transparent 56%);animation:w10scan 5.5s linear infinite}\r
@keyframes w10scan {\r
from{transform:translateY(-100%)}to{transform:translateY(100%)}\r
}\r
.w.w-game.qwen1-scope .w10-top {display:flex;justify-content:space-between;font-size:9.5px;letter-spacing:1.5px;color:var(--panax);border-bottom:1px dashed #2a2150;padding-bottom:9px;margin-bottom:15px}\r
.w.w-game.qwen1-scope .w10-live {color:var(--panax2)}\r
.w.w-game.qwen1-scope .w10-cur {animation:blink 1s steps(2) infinite;margin-left:4px}\r
.w.w-game.qwen1-scope .w10-body {display:flex;gap:22px}\r
.w.w-game.qwen1-scope .w10-left {flex:none;width:280px;display:flex;gap:14px}\r
.w.w-game.qwen1-scope .w10-cover {position:relative;flex:none;width:118px;border:1px solid #2a2150;overflow:hidden}\r
.w.w-game.qwen1-scope .w10-cover img {width:100%;height:170px;object-fit:cover}\r
.w.w-game.qwen1-scope .w10-cover::after {content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px);pointer-events:none}\r
.w.w-game.qwen1-scope .w10-cover:hover img {animation:w10glitch .35s steps(2) 2}\r
@keyframes w10glitch {\r
25%{transform:translate(-3px,1px);filter:hue-rotate(40deg) saturate(2)}75%{transform:translate(3px,-1px);filter:hue-rotate(-40deg)}\r
}\r
.w.w-game.qwen1-scope .w10-info {flex:1;min-width:0}\r
.w.w-game.qwen1-scope .w10-eyebrow {font-size:8.5px;letter-spacing:2px;color:#6d7490;margin-bottom:6px}\r
.w.w-game.qwen1-scope .w10-title {font-family:var(--fd);font-weight:900;font-size:17px;color:#f2f4ff;line-height:1.2;text-shadow:0 0 22px rgba(143,107,255,.45);margin-bottom:6px}\r
.w.w-game.qwen1-scope .w10-meta {font-size:9.5px;color:#8b92b0;margin-bottom:9px}\r
.w.w-game.qwen1-scope .w10-tags {display:flex;flex-direction:column;gap:3px;margin-bottom:10px}\r
.w.w-game.qwen1-scope .w10-tags span {font-size:9px;color:var(--panax2)}\r
.w.w-game.qwen1-scope .w10-pos {font-size:9.5px;color:#8b92b0;line-height:1.7}\r
.w.w-game.qwen1-scope .w10-pos b {color:var(--panax2);font-size:12px}\r
.w.w-game.qwen1-scope .w10-right {flex:1;min-width:0}\r
.w.w-game.qwen1-scope .w10-rhead {display:flex;justify-content:space-between;font-size:9px;letter-spacing:1.5px;color:#6d7490;margin-bottom:12px}\r
.w.w-game.qwen1-scope .w10 .pxr-track {border-radius:3px;background:#101223}\r
.w.w-game.qwen1-scope .w10 .pxr-track i {border-radius:3px}\r
.w.w-game.qwen1-scope .w10 .pxr-badge {border-radius:5px}\r
.w.w-game.qwen1-scope .w10 .pxr-pct {color:#aab2d0}\r
.w.w-game.qwen1-scope .w10-links {display:flex;flex-wrap:wrap;gap:6px;margin-top:15px}\r
.w.w-game.qwen1-scope .w10-link {display:inline-flex;align-items:center;gap:6px;font-size:9.5px;letter-spacing:.5px;padding:7px 11px;border:1px solid #2a2150;color:#a9b0d0;transition:.2s}\r
.w.w-game.qwen1-scope .w10-link:hover {border-color:var(--panax);color:var(--panax2);box-shadow:0 0 14px rgba(143,107,255,.3)}\r
.w.w-game.qwen1-scope .w10-link::before {content:">";color:var(--panax)}\r
.w.w-game.qwen1-scope .w10-link.primary {border-color:var(--panax);color:var(--panax2);background:rgba(143,107,255,.1)}\r
.w.w-game.qwen1-scope .embed {padding:10px 0 80px;scroll-margin-top:170px}\r
.w.w-game.qwen1-scope .embed-head {margin-bottom:24px}\r
.w.w-game.qwen1-scope .embed-head h2 {font-family:var(--fd);font-weight:900;font-size:clamp(22px,3vw,32px)}\r
.w.w-game.qwen1-scope .embed-head p {color:var(--muted);margin-top:8px;max-width:640px}\r
.w.w-game.qwen1-scope .codeblock {background:#0a0e19;border:1px solid var(--line);border-radius:16px;overflow:hidden}\r
.w.w-game.qwen1-scope .codeblock-head {display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--line)}\r
.w.w-game.qwen1-scope .codeblock-head i {width:10px;height:10px;border-radius:50%;background:#2a3350}\r
.w.w-game.qwen1-scope .codeblock-head i:nth-child(1) {background:var(--danger)}\r
.w.w-game.qwen1-scope .codeblock-head i:nth-child(2) {background:var(--warn)}\r
.w.w-game.qwen1-scope .codeblock-head i:nth-child(3) {background:var(--ok)}\r
.w.w-game.qwen1-scope .codeblock-head span {font-family:var(--fm);font-size:10.5px;color:var(--dim);margin-left:6px;flex:1}\r
.w.w-game.qwen1-scope .codeblock pre {padding:18px;overflow-x:auto;font-family:var(--fm);font-size:12px;line-height:1.8;color:#c6cfe8;scrollbar-width:thin}\r
.w.w-game.qwen1-scope .ct {color:var(--magenta);font-weight:400}\r
.w.w-game.qwen1-scope .ca {color:var(--cyan);font-weight:400}\r
.w.w-game.qwen1-scope .cs {color:var(--panax2);font-weight:400}\r
.w.w-game.qwen1-scope .cc {color:#5f6a8c;font-weight:400}\r
.w.w-game.qwen1-scope .attrs {display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}\r
.w.w-game.qwen1-scope .attr {background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 15px}\r
.w.w-game.qwen1-scope .attr code {display:block;font-family:var(--fm);font-size:11.5px;color:var(--cyan);margin-bottom:4px}\r
.w.w-game.qwen1-scope .attr span {font-size:11.5px;color:var(--muted)}\r
.w.w-game.qwen1-scope footer {border-top:1px solid var(--line);padding:26px 0;background:rgba(9,11,20,.6)}\r
.w.w-game.qwen1-scope .foot-in {display:flex;align-items:center;gap:18px;flex-wrap:wrap}\r
.w.w-game.qwen1-scope .foot-in p {font-size:12px;color:var(--muted)}\r
.w.w-game.qwen1-scope .foot-in .srcs {margin-left:auto;font-family:var(--fm);font-size:10px;color:var(--dim);letter-spacing:1px}\r
.w.w-game.qwen1-scope .toasts {position:fixed;bottom:22px;right:22px;z-index:300;display:flex;flex-direction:column;gap:9px}\r
.w.w-game.qwen1-scope .toast .i {color:var(--panax2);font-size:15px}\r
.w.w-game.qwen1-scope .toast.out {animation:toastOut .3s forwards}\r
@keyframes toastIn {\r
from{opacity:0;transform:translateY(14px) scale(.96)}\r
}\r
@keyframes toastOut {\r
to{opacity:0;transform:translateX(20px)}\r
}\r
.w.w-game.qwen1-scope .overlay {position:fixed;inset:0;z-index:250;background:rgba(4,6,10,.72);backdrop-filter:blur(8px);display:grid;place-items:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .25s}\r
.w.w-game.qwen1-scope .overlay.open {opacity:1;pointer-events:auto}\r
.w.w-game.qwen1-scope .modal {width:min(100%,640px);background:#0e1322;border:1px solid var(--line2);border-radius:18px;box-shadow:0 40px 100px rgba(0,0,0,.7);transform:scale(.95) translateY(10px);transition:transform .3s cubic-bezier(.2,.8,.2,1);max-height:88vh;display:flex;flex-direction:column}\r
.w.w-game.qwen1-scope .overlay.open .modal {transform:none}\r
.w.w-game.qwen1-scope .modal-head {display:flex;align-items:center;gap:12px;padding:17px 20px;border-bottom:1px solid var(--line)}\r
.w.w-game.qwen1-scope .modal-head .vnum {font-size:20px}\r
.w.w-game.qwen1-scope .modal-head h3 {font-size:15px;font-weight:800;flex:1}\r
.w.w-game.qwen1-scope .modal-x {display:grid;place-items:center;width:32px;height:32px;border-radius:9px;border:1px solid var(--line2);color:var(--muted);transition:.2s}\r
.w.w-game.qwen1-scope .modal-x:hover {color:var(--ink);border-color:var(--danger)}\r
.w.w-game.qwen1-scope .modal-body {padding:18px 20px;overflow-y:auto;scrollbar-width:thin}\r
.w.w-game.qwen1-scope .modal-body>p {font-size:12.5px;color:var(--muted);margin-bottom:13px}\r
.w.w-game.qwen1-scope .modal-body pre {background:#0a0e19;border:1px solid var(--line);border-radius:12px;padding:15px;font-family:var(--fm);font-size:11.5px;line-height:1.8;overflow-x:auto;color:#c6cfe8;scrollbar-width:thin}\r
.w.w-game.qwen1-scope .modal-tags {display:flex;gap:6px;flex-wrap:wrap;margin-top:13px}\r
.w.w-game.qwen1-scope .modal-tags span {font-family:var(--fm);font-size:9.5px;color:var(--cyan);background:#0a0e19;border:1px solid var(--line);border-radius:6px;padding:4px 9px}\r
.w.w-game.qwen1-scope .modal-foot {display:flex;gap:10px;justify-content:flex-end;padding:15px 20px;border-top:1px solid var(--line)}\r
.w.w-game.qwen1-scope .backtop {position:fixed;bottom:22px;left:22px;z-index:150;width:42px;height:42px;border-radius:12px;background:#141a2c;border:1px solid var(--line2);color:var(--muted);display:grid;place-items:center;font-size:16px;opacity:0;pointer-events:none;transition:.3s;transform:translateY(8px)}\r
.w.w-game.qwen1-scope .backtop.show {opacity:1;pointer-events:auto;transform:none}\r
.w.w-game.qwen1-scope .backtop:hover {color:var(--panax2);border-color:var(--panax2)}\r
.w.w-game.qwen1-scope noscript div {padding:100px 24px;text-align:center;color:var(--warn);font-weight:700}\r
@media(max-width:1020px) {\r
.w.w-game.qwen1-scope .grid {grid-template-columns:1fr}\r
.w.w-game.qwen1-scope .hero-in {grid-template-columns:1fr;gap:30px}\r
.w.w-game.qwen1-scope .attrs {grid-template-columns:1fr}\r
.w.w-game.qwen1-scope .w6-panel {width:min(340px,100%)}\r
}\r
@media(max-width:860px) {\r
.w.w-game.qwen1-scope .controls {position:static}\r
.w.w-game.qwen1-scope .fchips {margin-left:0}\r
.w.w-game.qwen1-scope .nav-links, .w.w-game.qwen1-scope .nav-badge {display:none}\r
.w.w-game.qwen1-scope .section, .w.w-game.qwen1-scope .embed {scroll-margin-top:84px}\r
.w.w-game.qwen1-scope .vcard {scroll-margin-top:84px}\r
}\r
@media(max-width:640px) {\r
.w.w-game.qwen1-scope .hero {padding-top:104px}\r
.w.w-game.qwen1-scope .w1-top, .w.w-game.qwen1-scope .w2-top, .w.w-game.qwen1-scope .w5-row, .w.w-game.qwen1-scope .w10-body, .w.w-game.qwen1-scope .w10-left {flex-direction:column}\r
.w.w-game.qwen1-scope .w1-cover {width:100%;max-width:200px}\r
.w.w-game.qwen1-scope .w1-cover img {height:190px}\r
.w.w-game.qwen1-scope .w2-cover {width:96px}\r
.w.w-game.qwen1-scope .w2-cover img {height:138px}\r
.w.w-game.qwen1-scope .w3 {flex-direction:column}\r
.w.w-game.qwen1-scope .w3-stub {width:100%;flex-direction:row;align-items:center}\r
.w.w-game.qwen1-scope .w3-stub img {width:86px;height:110px}\r
.w.w-game.qwen1-scope .w3-stub::after {top:auto;left:0;right:0;bottom:-1px;width:auto;height:2px;background:repeating-linear-gradient(90deg,transparent 0 7px,#d8cdb8 7px 13px)}\r
.w.w-game.qwen1-scope .w3-notch {display:none}\r
.w.w-game.qwen1-scope .w3-bar {flex:1}\r
.w.w-game.qwen1-scope .w4-grid {grid-template-columns:88px 1fr}\r
.w.w-game.qwen1-scope .w4-fig img {width:88px;height:126px}\r
.w.w-game.qwen1-scope .w4-score {grid-column:1/-1;border-left:none;border-top:1px solid #d8cfbf;padding:10px 0 0;display:flex;align-items:baseline;gap:12px;text-align:left}\r
.w.w-game.qwen1-scope .w4-score b {font-size:32px}\r
.w.w-game.qwen1-scope .w5-art {width:100%;max-width:160px}\r
.w.w-game.qwen1-scope .w6 {min-height:380px}\r
.w.w-game.qwen1-scope .w6-bottom {gap:18px}\r
.w.w-game.qwen1-scope .w7 {flex-wrap:wrap}\r
.w.w-game.qwen1-scope .w7 .pxr {width:100%;order:3}\r
.w.w-game.qwen1-scope .w7-pos {margin-left:auto}\r
.w.w-game.qwen1-scope .w8 {width:min(306px,100%)}\r
.w.w-game.qwen1-scope .w9-body {flex-direction:column}\r
.w.w-game.qwen1-scope .w9-art {width:100%;max-width:170px}\r
.w.w-game.qwen1-scope .w9-sticker {width:62px;height:62px;top:-14px;right:10px}\r
.w.w-game.qwen1-scope .w9-sticker b {font-size:12px}\r
.w.w-game.qwen1-scope .w10-left {width:100%}\r
.w.w-game.qwen1-scope .w10-cover {width:104px}\r
.w.w-game.qwen1-scope .pxr {gap:7px}\r
.w.w-game.qwen1-scope .pxr-track {max-width:34px}\r
.w.w-game.qwen1-scope .pxr-badge {width:36px;height:36px}\r
.w.w-game.qwen1-scope .pxr-ribbon {font-size:5.5px;padding:2px 5px}\r
.w.w-game.qwen1-scope .pxr-pct {font-size:10.5px}\r
.w.w-game.qwen1-scope .pxr-lg .pxr-track {max-width:36px}\r
.w.w-game.qwen1-scope .pxr-lg .pxr-badge {width:38px;height:38px}\r
.w.w-game.qwen1-scope .pxr-lg .pxr-pct {font-size:11.5px}\r
.w.w-game.qwen1-scope .vnote {display:none}\r
.w.w-game.qwen1-scope .toasts {left:16px;right:16px}\r
.w.w-game.qwen1-scope .backtop {display:none}\r
}\r
@media(max-width:400px) {\r
.w.w-game.qwen1-scope .pxr-badge {width:30px;height:30px}\r
.w.w-game.qwen1-scope .pxr-ribbon {display:none}\r
.w.w-game.qwen1-scope .pxr-pct {font-size:9px}\r
.w.w-game.qwen1-scope .pxr-track {max-width:26px}\r
.w.w-game.qwen1-scope .w7 .pxr {width:100%}\r
}\r
@media(prefers-reduced-motion:reduce) {\r
:where(.w.w-game.qwen1-scope) *, :where(.w.w-game.qwen1-scope) *::before, :where(.w.w-game.qwen1-scope) *::after {animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}\r
}\r
.w.w-game.qwen2-scope{--accent:#7c5cff;color:var(--ink);font-family:var(--fb)}\r
.w.w-game.qwen2-scope {\r
  --bg:#07090f; --bg2:#0b0e1a; --surface:#0e1322; --surface2:#121830;\r
  --line:#1d2438; --line2:#2a3350;\r
  --ink:#eef1fb; --muted:#98a2c0; --dim:#5f6a8c;\r
  --lime:#b6ff2e; --violet:#8f6bff; --cyan:#35e0ff; --magenta:#ff4d9d;\r
  --amber:#ffb02e; --red:#ff4d6d; --green:#3ddc84; --paper:#f6f1e7;\r
  --fd:'Unbounded',system-ui,sans-serif; --fb:'Manrope',system-ui,sans-serif;\r
  --fm:'JetBrains Mono',ui-monospace,monospace; --fs:'Playfair Display',Georgia,serif;\r
  --fp:'Press Start 2P',monospace;\r
}\r
:where(.w.w-game.qwen2-scope) * {margin:0;padding:0;box-sizing:border-box}\r
.w.w-game.qwen2-scope ::selection {background:var(--lime);color:#0c1005}\r
.w.w-game.qwen2-scope ::-webkit-scrollbar {width:10px;height:10px}\r
.w.w-game.qwen2-scope ::-webkit-scrollbar-track {background:#0b0e1a}\r
.w.w-game.qwen2-scope ::-webkit-scrollbar-thumb {background:linear-gradient(180deg,var(--violet),#4b3f9e);border-radius:8px;border:2px solid #0b0e1a}\r
.w.w-game.qwen2-scope ::-webkit-scrollbar-thumb:hover {background:linear-gradient(180deg,var(--lime),#7fb317)}\r
.w.w-game.qwen2-scope :focus-visible {outline:2px solid var(--lime);outline-offset:2px;border-radius:4px}\r
.w.w-game.qwen2-scope img {display:block;max-width:100%}\r
.w.w-game.qwen2-scope a {color:inherit;text-decoration:none}\r
.w.w-game.qwen2-scope button {font-family:inherit;color:inherit;background:none;border:none;cursor:pointer}\r
.w.w-game.qwen2-scope .i {width:1em;height:1em;flex:none;display:inline-block;vertical-align:-.14em}\r
.w.w-game.qwen2-scope .bg {position:fixed;inset:0;z-index:-1;overflow:hidden;\r
  background:radial-gradient(1100px 760px at 82% -12%,#1c1442 0%,transparent 58%),\r
             radial-gradient(950px 700px at -12% 34%,#0c2a34 0%,transparent 55%),\r
             radial-gradient(900px 700px at 55% 118%,#2a0f26 0%,transparent 55%),var(--bg)}\r
.w.w-game.qwen2-scope .blob {position:absolute;border-radius:50%;filter:blur(95px);opacity:.32;animation:drift 26s ease-in-out infinite alternate}\r
.w.w-game.qwen2-scope .b1 {width:520px;height:520px;background:#5b3fd6;top:-160px;left:56%}\r
.w.w-game.qwen2-scope .b2 {width:430px;height:430px;background:#0e7f96;top:36%;left:-150px;animation-delay:-9s}\r
.w.w-game.qwen2-scope .b3 {width:400px;height:400px;background:#a1256b;bottom:-160px;right:6%;animation-delay:-17s}\r
@keyframes drift {\r
to{transform:translate(70px,-50px) scale(1.18)}\r
}\r
.w.w-game.qwen2-scope body::after {content:"";position:fixed;inset:0;z-index:99;pointer-events:none;opacity:.05;\r
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.6'/%3E%3C/svg%3E")}\r
.w.w-game.qwen2-scope .progress {position:fixed;top:0;left:0;right:0;height:2px;z-index:210;background:transparent}\r
.w.w-game.qwen2-scope .progress i {display:block;height:100%;width:0;background:linear-gradient(90deg,var(--lime),var(--cyan),var(--violet),var(--magenta))}\r
.w.w-game.qwen2-scope .nav {position:fixed;top:0;left:0;right:0;z-index:90;background:rgba(7,9,15,.74);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line);transition:box-shadow .3s}\r
.w.w-game.qwen2-scope .nav.scrolled {box-shadow:0 12px 40px rgba(0,0,0,.45)}\r
.w.w-game.qwen2-scope .nav-in {max-width:1280px;margin:0 auto;padding:0 24px;height:64px;display:flex;align-items:center;gap:26px}\r
.w.w-game.qwen2-scope .logo {display:flex;align-items:center;gap:10px;font-family:var(--fd);font-weight:700;font-size:13px;letter-spacing:.5px}\r
.w.w-game.qwen2-scope .logo-mark {width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,var(--lime),var(--cyan));display:grid;place-items:center;font-family:var(--fd);font-weight:900;font-size:14px;color:#07090f;box-shadow:0 4px 18px rgba(182,255,46,.3)}\r
.w.w-game.qwen2-scope .logo em {font-style:normal;color:var(--lime)}\r
.w.w-game.qwen2-scope .nav-links {display:flex;gap:4px;margin-left:8px}\r
.w.w-game.qwen2-scope .nav-links a {font-size:13px;font-weight:600;color:var(--muted);padding:8px 12px;border-radius:8px;transition:.2s;position:relative}\r
.w.w-game.qwen2-scope .nav-links a:hover {color:var(--ink);background:#141a2c}\r
.w.w-game.qwen2-scope .nav-links a.active {color:var(--lime)}\r
.w.w-game.qwen2-scope .nav-links a.active::after {content:"";position:absolute;left:12px;right:12px;bottom:2px;height:2px;border-radius:2px;background:var(--lime)}\r
.w.w-game.qwen2-scope .nav-right {margin-left:auto;display:flex;align-items:center;gap:12px}\r
.w.w-game.qwen2-scope .nav-badge {font-family:var(--fm);font-size:10.5px;color:var(--dim);letter-spacing:1px;text-transform:uppercase}\r
.w.w-game.qwen2-scope .btn {display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:13px;padding:10px 16px;border-radius:10px;border:1px solid transparent;transition:.2s;white-space:nowrap}\r
.w.w-game.qwen2-scope .btn-lime {background:var(--lime);color:#0c1005;box-shadow:0 6px 22px rgba(182,255,46,.22)}\r
.w.w-game.qwen2-scope .btn-lime:hover {transform:translateY(-1px);filter:brightness(1.06)}\r
.w.w-game.qwen2-scope .btn-ghost {background:#141a2c;border-color:var(--line2);color:var(--ink)}\r
.w.w-game.qwen2-scope .btn-ghost:hover {border-color:var(--violet);box-shadow:0 0 0 3px rgba(143,107,255,.14)}\r
.w.w-game.qwen2-scope .btn-sm {padding:7px 12px;font-size:12px;border-radius:8px}\r
.w.w-game.qwen2-scope .hero {padding:132px 0 44px}\r
.w.w-game.qwen2-scope .hero-in {display:grid;grid-template-columns:1.15fr .85fr;gap:44px;align-items:center}\r
.w.w-game.qwen2-scope .eyebrow {font-family:var(--fm);font-size:11px;letter-spacing:3px;color:var(--lime);text-transform:uppercase;display:flex;align-items:center;gap:10px;margin-bottom:18px}\r
.w.w-game.qwen2-scope .eyebrow::before {content:"\u25AE";animation:blink 1.2s steps(2) infinite}\r
@keyframes blink {\r
50%{opacity:0}\r
}\r
.w.w-game.qwen2-scope .hero h1 {font-family:var(--fd);font-weight:900;font-size:clamp(30px,4.6vw,54px);line-height:1.1;letter-spacing:-.5px}\r
.w.w-game.qwen2-scope .grad {background:linear-gradient(92deg,var(--lime) 5%,var(--cyan) 50%,var(--violet) 95%);-webkit-background-clip:text;background-clip:text;color:transparent}\r
.w.w-game.qwen2-scope .hero-sub {color:var(--muted);font-size:15.5px;max-width:560px;margin:18px 0 24px;line-height:1.75}\r
.w.w-game.qwen2-scope .hero-sub b {color:var(--ink)}\r
.w.w-game.qwen2-scope .hero-stats {display:flex;flex-wrap:wrap;gap:10px;margin-bottom:24px}\r
.w.w-game.qwen2-scope .hstat {display:flex;align-items:baseline;gap:8px;background:#0e1424;border:1px solid var(--line);border-radius:10px;padding:9px 14px}\r
.w.w-game.qwen2-scope .hstat b {font-family:var(--fd);font-weight:800;font-size:17px}\r
.w.w-game.qwen2-scope .hstat span {font-size:11px;color:var(--muted);font-weight:600}\r
.w.w-game.qwen2-scope .hstat:nth-child(1) b {color:var(--lime)}\r
.w.w-game.qwen2-scope .hstat:nth-child(2) b {color:var(--cyan)}\r
.w.w-game.qwen2-scope .hstat:nth-child(3) b {color:var(--amber)}\r
.w.w-game.qwen2-scope .hstat:nth-child(4) b {color:var(--magenta)}\r
.w.w-game.qwen2-scope .hero-code {display:flex;align-items:center;gap:10px;background:#0c1120;border:1px solid var(--line);border-radius:12px;padding:10px 12px;max-width:600px}\r
.w.w-game.qwen2-scope .hero-code code {font-family:var(--fm);font-size:11.5px;color:#9fe8ff;white-space:nowrap;overflow-x:auto;flex:1;scrollbar-width:thin}\r
.w.w-game.qwen2-scope .hero-code code b {color:var(--lime);font-weight:400}\r
.w.w-game.qwen2-scope .fan {position:relative;height:360px;display:grid;place-items:center}\r
.w.w-game.qwen2-scope .fan-card {position:absolute;width:196px;aspect-ratio:2/3;border-radius:16px;overflow:hidden;border:2px solid rgba(255,255,255,.14);box-shadow:0 26px 60px rgba(0,0,0,.55);transition:transform .5s cubic-bezier(.2,.8,.2,1),border-color .3s,box-shadow .3s;padding:0}\r
.w.w-game.qwen2-scope .fan-card img {width:100%;height:100%;object-fit:cover}\r
.w.w-game.qwen2-scope .fan-card span {position:absolute;left:0;right:0;bottom:0;padding:26px 12px 10px;font-family:var(--fd);font-weight:700;font-size:10.5px;text-align:left;background:linear-gradient(transparent,rgba(4,5,10,.9));color:#fff}\r
.w.w-game.qwen2-scope .fan-card:nth-child(1) {transform:rotate(-13deg) translate(-128px,14px)}\r
.w.w-game.qwen2-scope .fan-card:nth-child(2) {transform:rotate(1deg) translate(0,-8px);z-index:2}\r
.w.w-game.qwen2-scope .fan-card:nth-child(3) {transform:rotate(13deg) translate(128px,16px)}\r
.w.w-game.qwen2-scope .fan:hover .fan-card:nth-child(1) {transform:rotate(-17deg) translate(-152px,20px)}\r
.w.w-game.qwen2-scope .fan:hover .fan-card:nth-child(3) {transform:rotate(17deg) translate(152px,22px)}\r
.w.w-game.qwen2-scope .fan-card.active {border-color:var(--lime);box-shadow:0 0 0 4px rgba(182,255,46,.22),0 30px 70px rgba(0,0,0,.6);z-index:3;transform:rotate(0deg) translate(0,-16px) scale(1.05)}\r
.w.w-game.qwen2-scope .fan-hint {position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);font-family:var(--fm);font-size:10px;color:var(--dim);letter-spacing:1px;white-space:nowrap}\r
.w.w-game.qwen2-scope .controls {position:sticky;top:64px;z-index:80;background:rgba(9,11,20,.86);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-block:1px solid var(--line)}\r
.w.w-game.qwen2-scope .controls-in {max-width:1280px;margin:0 auto;padding:12px 24px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}\r
.w.w-game.qwen2-scope .clabel {font-family:var(--fm);font-size:9.5px;letter-spacing:2px;color:var(--dim);text-transform:uppercase}\r
.w.w-game.qwen2-scope .gchips {display:flex;gap:8px;flex-wrap:wrap}\r
.w.w-game.qwen2-scope .gchip {display:flex;align-items:center;gap:8px;padding:5px 13px 5px 5px;border-radius:999px;border:1px solid var(--line);background:#0e1424;font-size:12px;font-weight:800;color:var(--muted);transition:.2s}\r
.w.w-game.qwen2-scope .gchip img {width:23px;height:31px;object-fit:cover;border-radius:5px}\r
.w.w-game.qwen2-scope .gchip:hover {border-color:var(--line2);color:var(--ink)}\r
.w.w-game.qwen2-scope .gchip.active {border-color:var(--lime);color:var(--ink);box-shadow:0 0 0 3px rgba(182,255,46,.13)}\r
.w.w-game.qwen2-scope .seg {display:flex;background:#0e1424;border:1px solid var(--line);border-radius:999px;padding:3px}\r
.w.w-game.qwen2-scope .seg button {padding:7px 15px;border-radius:999px;font-size:12px;font-weight:800;color:var(--muted);transition:.2s;display:flex;align-items:center;gap:7px}\r
.w.w-game.qwen2-scope .seg button i {width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.55}\r
.w.w-game.qwen2-scope .seg button.active[data-source="backloggd"] {background:#3f6dff;color:#fff}\r
.w.w-game.qwen2-scope .seg button.active[data-source="panaax"] {background:var(--violet);color:#fff}\r
.w.w-game.qwen2-scope .fchips {display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}\r
.w.w-game.qwen2-scope .fchip {font-family:var(--fm);font-size:10.5px;padding:7px 11px;border-radius:8px;border:1px solid var(--line);color:var(--muted);transition:.2s;letter-spacing:.4px}\r
.w.w-game.qwen2-scope .fchip sup {color:var(--dim);margin-left:3px}\r
.w.w-game.qwen2-scope .fchip:hover {color:var(--ink);border-color:var(--line2)}\r
.w.w-game.qwen2-scope .fchip.active {background:var(--lime);border-color:var(--lime);color:#0c1005;font-weight:700}\r
.w.w-game.qwen2-scope .fchip.active sup {color:#3c5207}\r
.w.w-game.qwen2-scope .section {padding:36px 0 70px;scroll-margin-top:150px}\r
.w.w-game.qwen2-scope .grid {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}\r
.w.w-game.qwen2-scope .vcard {background:linear-gradient(180deg,#0e1322,#0b0f1c);border:1px solid var(--line);border-radius:20px;overflow:hidden;opacity:0;scroll-margin-top:160px;transition:border-color .3s}\r
.w.w-game.qwen2-scope .vcard:hover {border-color:#2c3757}\r
.w.w-game.qwen2-scope .vcard.in {animation:cardIn .65s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0ms)}\r
@keyframes cardIn {\r
from{opacity:0;transform:translateY(28px) scale(.985)}to{opacity:1;transform:none}\r
}\r
.w.w-game.qwen2-scope .vcard.hide {display:none}\r
.w.w-game.qwen2-scope .vcard.span2 {grid-column:1/-1}\r
.w.w-game.qwen2-scope .vcard.flash {animation:flash 1.3s ease}\r
@keyframes flash {\r
0%,100%{box-shadow:none}25%,60%{box-shadow:0 0 0 3px var(--lime),0 0 60px rgba(182,255,46,.35)}\r
}\r
.w.w-game.qwen2-scope .vhead {display:flex;align-items:center;gap:14px;padding:15px 20px;border-bottom:1px dashed #1c2338}\r
.w.w-game.qwen2-scope .vnum {font-family:var(--fd);font-weight:900;font-size:23px;color:#39415f;line-height:1}\r
@supports(-webkit-text-stroke:1px #fff) {\r
.w.w-game.qwen2-scope .vnum {color:transparent;-webkit-text-stroke:1.2px #3a4468}\r
.w.w-game.qwen2-scope .vcard:hover .vnum {-webkit-text-stroke-color:var(--lime)}\r
}\r
.w.w-game.qwen2-scope .vhead h3 {font-size:15px;font-weight:800;letter-spacing:.2px}\r
.w.w-game.qwen2-scope .vcat {font-family:var(--fm);font-size:9.5px;color:var(--dim);text-transform:uppercase;letter-spacing:1.5px;margin-top:2px}\r
.w.w-game.qwen2-scope .vhead .btn {margin-left:auto}\r
.w.w-game.qwen2-scope .stage.flush {padding:0;background:#0a0d18}\r
.w.w-game.qwen2-scope .vfoot {display:flex;align-items:center;gap:12px;padding:11px 20px;border-top:1px dashed #1c2338}\r
.w.w-game.qwen2-scope .vnote {font-family:var(--fm);font-size:10px;color:var(--dim);flex:1;letter-spacing:.3px}\r
.w.w-game.qwen2-scope .grid.swap .stage {animation:swap .45s ease}\r
@keyframes swap {\r
from{opacity:.3;transform:translateY(7px)}to{opacity:1;transform:none}\r
}\r
.w.w-game.qwen2-scope .w1 {position:relative;width:min(100%,560px);background:#05070c;border:1px solid #1a2a1a;border-color:color-mix(in srgb,var(--ga) 30%,#0a0f0a);border-radius:6px;padding:16px 18px;font-family:var(--fm);overflow:hidden;color:#d7e2d0}\r
.w.w-game.qwen2-scope .w1-c {position:absolute;width:14px;height:14px;border:0 solid var(--ga)}\r
.w.w-game.qwen2-scope .w1-c.c1 {top:-1px;left:-1px;border-top-width:2px;border-left-width:2px}\r
.w.w-game.qwen2-scope .w1-c.c2 {top:-1px;right:-1px;border-top-width:2px;border-right-width:2px}\r
.w.w-game.qwen2-scope .w1-c.c3 {bottom:-1px;left:-1px;border-bottom-width:2px;border-left-width:2px}\r
.w.w-game.qwen2-scope .w1-c.c4 {bottom:-1px;right:-1px;border-bottom-width:2px;border-right-width:2px}\r
.w.w-game.qwen2-scope .w1-scan {position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent 0 44%,color-mix(in srgb,var(--ga) 8%,transparent) 50%,transparent 56%);animation:w1scan 5.5s linear infinite}\r
@keyframes w1scan {\r
from{transform:translateY(-100%)}to{transform:translateY(100%)}\r
}\r
.w.w-game.qwen2-scope .w1-top {display:flex;justify-content:space-between;font-size:9.5px;letter-spacing:1.5px;color:color-mix(in srgb,var(--ga) 75%,#fff);border-bottom:1px dashed #1c2a1c;padding-bottom:9px;margin-bottom:14px}\r
.w.w-game.qwen2-scope .w1-live {color:var(--ga)}\r
.w.w-game.qwen2-scope .w1-cur {animation:blink 1s steps(2) infinite;margin-left:4px}\r
.w.w-game.qwen2-scope .w1-body {display:flex;gap:18px}\r
.w.w-game.qwen2-scope .w1-cover {position:relative;width:150px;flex:none;border:1px solid #223022;overflow:hidden}\r
.w.w-game.qwen2-scope .w1-cover img {width:100%;height:214px;object-fit:cover;filter:saturate(1.1)}\r
.w.w-game.qwen2-scope .w1-cover::after {content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px);pointer-events:none}\r
.w.w-game.qwen2-scope .w1-cover:hover img {animation:w1glitch .35s steps(2) 2}\r
@keyframes w1glitch {\r
25%{transform:translate(-3px,1px);filter:hue-rotate(40deg) saturate(2)}75%{transform:translate(3px,-1px);filter:hue-rotate(-40deg)}\r
}\r
.w.w-game.qwen2-scope .w1-plt {position:absolute;left:0;right:0;bottom:0;font-size:8.5px;letter-spacing:1px;padding:5px 8px;background:rgba(4,6,4,.85);color:var(--ga)}\r
.w.w-game.qwen2-scope .w1-info {flex:1;min-width:0}\r
.w.w-game.qwen2-scope .w1-eyebrow {font-size:9px;letter-spacing:2px;color:#6d7a68;margin-bottom:7px}\r
.w.w-game.qwen2-scope .w1-title {font-family:var(--fd);font-weight:900;font-size:21px;color:#f2f7ee;line-height:1.15;text-shadow:0 0 22px color-mix(in srgb,var(--ga) 45%,transparent)}\r
.w.w-game.qwen2-scope .w1-meta {font-size:10.5px;color:#8b978a;margin:6px 0 10px}\r
.w.w-game.qwen2-scope .w1-tags {display:flex;flex-wrap:wrap;gap:6px;margin-bottom:13px}\r
.w.w-game.qwen2-scope .w1-tags span {font-size:9.5px;color:var(--ga);letter-spacing:.5px}\r
.w.w-game.qwen2-scope .w1-m {margin-bottom:9px}\r
.w.w-game.qwen2-scope .w1-mr {display:flex;justify-content:space-between;font-size:9.5px;letter-spacing:1px;color:#93a091;margin-bottom:4px}\r
.w.w-game.qwen2-scope .w1-mr b {color:#eef4ea;font-size:11px}\r
.w.w-game.qwen2-scope .w1-bar {height:6px;background:#101810;border:1px solid #1d281d}\r
.w.w-game.qwen2-scope .w1-bar i {display:block;height:100%;width:var(--w);background:linear-gradient(90deg,var(--mc),color-mix(in srgb,var(--mc) 55%,#fff));box-shadow:0 0 12px var(--mc);animation:grow 1.1s .15s cubic-bezier(.2,.8,.2,1) backwards}\r
@keyframes grow {\r
from{width:0}\r
}\r
.w.w-game.qwen2-scope .w1-links {display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}\r
.w.w-game.qwen2-scope .w1-link {display:inline-flex;align-items:center;gap:6px;font-size:9.5px;letter-spacing:.5px;padding:6px 9px;border:1px solid #223022;color:#a9b6a6;transition:.2s}\r
.w.w-game.qwen2-scope .w1-link:hover {border-color:var(--ga);color:var(--ga);box-shadow:0 0 14px color-mix(in srgb,var(--ga) 30%,transparent)}\r
.w.w-game.qwen2-scope .w1-link::before {content:">";color:var(--ga)}\r
.w.w-game.qwen2-scope .w2scene {position:relative;width:min(100%,560px);border-radius:22px;overflow:hidden;perspective:1100px;box-shadow:0 30px 70px rgba(0,0,0,.5)}\r
.w.w-game.qwen2-scope .w2bg {position:absolute;inset:-30px;width:calc(100% + 60px);height:calc(100% + 60px);object-fit:cover;filter:blur(30px) saturate(1.5) brightness(.55);transform:scale(1.15)}\r
.w.w-game.qwen2-scope .w2 {position:relative;margin:22px;display:flex;gap:18px;padding:20px;border-radius:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transform-style:preserve-3d;box-shadow:0 20px 50px rgba(0,0,0,.35)}\r
.w.w-game.qwen2-scope .w2.rest {transition:transform .6s cubic-bezier(.2,.8,.2,1)}\r
.w.w-game.qwen2-scope .w2-cover {flex:none;width:128px;transform:translateZ(34px)}\r
.w.w-game.qwen2-scope .w2-cover img {width:100%;height:186px;object-fit:cover;border-radius:12px;box-shadow:0 16px 36px rgba(0,0,0,.5)}\r
.w.w-game.qwen2-scope .w2-info {flex:1;min-width:0;transform:translateZ(18px)}\r
.w.w-game.qwen2-scope .w2-src {display:inline-flex;align-items:center;gap:7px;font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#fff;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);padding:4px 11px;border-radius:999px;margin-bottom:9px}\r
.w.w-game.qwen2-scope .w2-src i {width:7px;height:7px;border-radius:50%}\r
.w.w-game.qwen2-scope .w2-info h4 {font-family:var(--fd);font-weight:800;font-size:20px;color:#fff;line-height:1.2}\r
.w.w-game.qwen2-scope .w2-meta {font-size:11.5px;color:rgba(255,255,255,.65);margin:5px 0 9px}\r
.w.w-game.qwen2-scope .w2-tags {display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px}\r
.w.w-game.qwen2-scope .w2-tags span {font-size:10px;font-weight:600;color:rgba(255,255,255,.85);background:rgba(255,255,255,.09);padding:3px 9px;border-radius:999px}\r
.w.w-game.qwen2-scope .w2-scores {display:flex;gap:8px;margin-bottom:13px}\r
.w.w-game.qwen2-scope .w2-sc {flex:1;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:7px 9px;text-align:center}\r
.w.w-game.qwen2-scope .w2-sc b {display:block;font-family:var(--fd);font-weight:800;font-size:16px;color:var(--ga)}\r
.w.w-game.qwen2-scope .w2-sc:nth-child(2) b {color:var(--cyan)}\r
.w.w-game.qwen2-scope .w2-sc:nth-child(3) b {color:var(--amber)}\r
.w.w-game.qwen2-scope .w2-sc span {font-size:8.5px;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.55)}\r
.w.w-game.qwen2-scope .w2-cta {display:flex;align-items:center;gap:8px;flex-wrap:wrap}\r
.w.w-game.qwen2-scope .w2-go {display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;color:#0b0d08;background:linear-gradient(92deg,var(--ga),var(--gb));padding:9px 15px;border-radius:10px;box-shadow:0 8px 24px color-mix(in srgb,var(--ga) 35%,transparent);transition:.2s}\r
.w.w-game.qwen2-scope .w2-go:hover {transform:translateY(-1px);filter:brightness(1.07)}\r
.w.w-game.qwen2-scope .w2-mini {display:flex;gap:5px}\r
.w.w-game.qwen2-scope .w2-mini a {display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.8);font-size:13px;transition:.2s}\r
.w.w-game.qwen2-scope .w2-mini a:hover {background:rgba(255,255,255,.2);color:#fff}\r
.w.w-game.qwen2-scope .w2-shine {position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(420px circle at var(--mx,50%) var(--my,50%),rgba(255,255,255,.13),transparent 60%)}\r
.w.w-game.qwen2-scope .w3 {width:min(100%,560px);background:var(--paper);color:#1c1712;border-radius:4px;padding:22px 24px;font-family:var(--fb);box-shadow:0 24px 60px rgba(0,0,0,.45)}\r
.w.w-game.qwen2-scope .w3-head {display:flex;justify-content:space-between;font-size:9.5px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;border-top:3px double #1c1712;border-bottom:1px solid #1c1712;padding:8px 2px;margin-bottom:16px}\r
.w.w-game.qwen2-scope .w3-grid {display:grid;grid-template-columns:118px 1fr auto;gap:18px;align-items:start}\r
.w.w-game.qwen2-scope .w3-fig img {width:118px;height:168px;object-fit:cover;border:1px solid #1c1712;padding:4px;background:#fff}\r
.w.w-game.qwen2-scope .w3-fig figcaption {font-size:8.5px;font-style:italic;color:#7a6f60;margin-top:6px;text-align:center;font-family:var(--fs)}\r
.w.w-game.qwen2-scope .w3-kicker {font-size:9.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#b3341f;margin-bottom:6px}\r
.w.w-game.qwen2-scope .w3-main h4 {font-family:var(--fs);font-weight:900;font-size:27px;line-height:1.08;margin-bottom:8px}\r
.w.w-game.qwen2-scope .w3-lede {font-size:11.5px;line-height:1.65;color:#453c31}\r
.w.w-game.qwen2-scope .w3-lede::first-letter {font-family:var(--fs);font-weight:900;font-size:32px;float:left;line-height:.85;padding:3px 6px 0 0;color:#b3341f}\r
.w.w-game.qwen2-scope .w3-tags {font-family:var(--fs);font-style:italic;font-size:11px;color:#7a6f60;margin-top:9px}\r
.w.w-game.qwen2-scope .w3-score {text-align:right;border-left:1px solid #d8cfbf;padding-left:16px}\r
.w.w-game.qwen2-scope .w3-score b {display:block;font-family:var(--fs);font-weight:900;font-size:52px;line-height:1;color:#b3341f}\r
.w.w-game.qwen2-scope .w3-score span {display:block;font-size:9px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-top:5px}\r
.w.w-game.qwen2-scope .w3-score em {display:block;font-family:var(--fs);font-style:italic;font-size:11px;color:#7a6f60;margin-top:7px}\r
.w.w-game.qwen2-scope .w3-foot {display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid #1c1712;margin-top:16px;padding-top:11px;flex-wrap:wrap}\r
.w.w-game.qwen2-scope .w3-read {font-size:12px;font-weight:800;color:#b3341f;text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:1.5px}\r
.w.w-game.qwen2-scope .w3-read:hover {color:#7e2113}\r
.w.w-game.qwen2-scope .w3-foot>span {font-size:9.5px;color:#7a6f60;letter-spacing:.5px}\r
.w.w-game.qwen2-scope .w4 {width:min(100%,560px);background:linear-gradient(180deg,#31353e,#22252c);border-radius:16px 16px 9px 9px;padding:16px 18px 13px;box-shadow:inset 0 2px 0 rgba(255,255,255,.09),inset 0 -3px 0 rgba(0,0,0,.4),0 26px 55px rgba(0,0,0,.55);color:#cfd4de}\r
.w.w-game.qwen2-scope .w4-ridges {height:13px;border-radius:4px;background:repeating-linear-gradient(90deg,#1b1e24 0 9px,#2b2f37 9px 18px);margin-bottom:14px;box-shadow:inset 0 2px 4px rgba(0,0,0,.5)}\r
.w.w-game.qwen2-scope .w4-grid {display:flex;gap:18px}\r
.w.w-game.qwen2-scope .w4-label {position:relative;flex:none;width:168px;background:#0c0d10;padding:7px;border-radius:7px;box-shadow:inset 0 0 0 1px #000,0 4px 12px rgba(0,0,0,.4)}\r
.w.w-game.qwen2-scope .w4-label img {width:100%;height:180px;object-fit:cover;border-radius:4px}\r
.w.w-game.qwen2-scope .w4-ltitle {padding:8px 4px 3px}\r
.w.w-game.qwen2-scope .w4-ltitle b {display:block;font-family:var(--fd);font-weight:800;font-size:11px;color:#fff;letter-spacing:.4px}\r
.w.w-game.qwen2-scope .w4-ltitle span {font-family:var(--fm);font-size:8px;color:#7d8494;letter-spacing:1.5px}\r
.w.w-game.qwen2-scope .w4-sticker {position:absolute;top:-11px;right:-11px;width:52px;height:52px;border-radius:50%;background:var(--sc);border:2px solid #0b0d10;display:grid;place-items:center;font-family:var(--fd);font-weight:900;font-size:14px;color:#fff;transform:rotate(9deg);box-shadow:0 6px 16px rgba(0,0,0,.5)}\r
.w.w-game.qwen2-scope .w4-side {flex:1;min-width:0}\r
.w.w-game.qwen2-scope .w4-model {font-family:var(--fm);font-size:8.5px;letter-spacing:2px;color:#7d8494;margin-bottom:6px}\r
.w.w-game.qwen2-scope .w4-side h4 {font-family:var(--fd);font-weight:800;font-size:17px;color:#f0f2f7;margin-bottom:10px}\r
.w.w-game.qwen2-scope .w4-specs {display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-bottom:11px}\r
.w.w-game.qwen2-scope .w4-specs dt {font-family:var(--fm);font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:#7d8494}\r
.w.w-game.qwen2-scope .w4-specs dd {font-size:11.5px;font-weight:800;color:#e6e9f0}\r
.w.w-game.qwen2-scope .w4-leds {display:flex;gap:8px;margin-bottom:12px}\r
.w.w-game.qwen2-scope .w4-led {flex:1;background:#050705;border-radius:5px;padding:6px 10px;box-shadow:inset 0 0 14px #000,inset 0 0 5px rgba(134,255,122,.25);display:flex;justify-content:space-between;align-items:center}\r
.w.w-game.qwen2-scope .w4-led span {font-family:var(--fm);font-size:8px;letter-spacing:1px;color:#4e6b4c}\r
.w.w-game.qwen2-scope .w4-led b {font-family:var(--fm);font-weight:700;font-size:16px;color:#86ff7a;text-shadow:0 0 9px rgba(134,255,122,.8)}\r
.w.w-game.qwen2-scope .w4-btns {display:flex;gap:7px;flex-wrap:wrap}\r
.w.w-game.qwen2-scope .w4-start {display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:1px;color:#0b0d08;background:var(--ga);padding:9px 14px;border-radius:8px;border-bottom:3px solid rgba(0,0,0,.4);transition:.12s}\r
.w.w-game.qwen2-scope .w4-start:active {transform:translateY(2px);border-bottom-width:1px}\r
.w.w-game.qwen2-scope .w4-btn {font-family:var(--fm);font-size:9.5px;letter-spacing:1px;color:#cfd4de;background:linear-gradient(#3a3f49,#262a31);border:1px solid #14161a;border-bottom-width:3px;border-radius:8px;padding:8px 12px;transition:.12s}\r
.w.w-game.qwen2-scope .w4-btn:hover {color:#fff;filter:brightness(1.15)}\r
.w.w-game.qwen2-scope .w4-btn:active {transform:translateY(2px);border-bottom-width:1px}\r
.w.w-game.qwen2-scope .w4-bottom {display:flex;align-items:center;gap:12px;margin-top:14px}\r
.w.w-game.qwen2-scope .w4-bottom i {flex:1;height:5px;border-radius:3px;background:repeating-linear-gradient(90deg,#1b1e24 0 7px,#2b2f37 7px 14px)}\r
.w.w-game.qwen2-scope .w4-bottom span {font-family:var(--fm);font-size:7.5px;letter-spacing:2px;color:#6b7280;white-space:nowrap}\r
.w.w-game.qwen2-scope .w5 {width:min(100%,470px);display:flex;align-items:center;gap:14px;background:#fbfbf8;color:#191c22;border:1px solid #e7e5dd;border-radius:14px;padding:13px 15px;transition:.25s;box-shadow:0 14px 40px rgba(0,0,0,.35)}\r
.w.w-game.qwen2-scope .w5:hover {transform:translateY(-3px);border-color:var(--ga);box-shadow:0 20px 50px rgba(0,0,0,.45)}\r
.w.w-game.qwen2-scope .w5-cover {width:52px;height:74px;object-fit:cover;border-radius:8px;flex:none}\r
.w.w-game.qwen2-scope .w5-mid {flex:1;min-width:0}\r
.w.w-game.qwen2-scope .w5-t {display:flex;align-items:baseline;gap:8px}\r
.w.w-game.qwen2-scope .w5-t b {font-size:15px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\r
.w.w-game.qwen2-scope .w5-year {font-size:11.5px;color:#9a9788;font-weight:600}\r
.w.w-game.qwen2-scope .w5-mid>p {font-size:11px;color:#8b887a;margin:2px 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\r
.w.w-game.qwen2-scope .w5-src {display:flex;align-items:center;gap:7px;font-size:10.5px;color:#6d6a5e;font-weight:600}\r
.w.w-game.qwen2-scope .w5-src i {display:grid;place-items:center;width:17px;height:17px;border-radius:5px;font-style:normal;font-size:7.5px;font-weight:800;color:#fff}\r
.w.w-game.qwen2-scope .w5-src b {color:#191c22}\r
.w.w-game.qwen2-scope .w5-go {display:grid;place-items:center;width:36px;height:36px;flex:none;border-radius:10px;border:1px solid #e7e5dd;color:#8b887a;font-size:15px;transition:.2s}\r
.w.w-game.qwen2-scope .w5:hover .w5-go {background:var(--ga);border-color:var(--ga);color:#12140c}\r
.w.w-game.qwen2-scope .w6 {width:min(100%,520px);background:#151027;border:3px solid #000;border-radius:18px;padding:14px;box-shadow:0 0 0 3px #2c2447,0 28px 60px rgba(0,0,0,.6)}\r
.w.w-game.qwen2-scope .w6-marquee {background:linear-gradient(90deg,var(--ga),var(--cyan),var(--magenta));border:2px solid #000;border-radius:8px;padding:8px;text-align:center;margin-bottom:12px}\r
.w.w-game.qwen2-scope .w6-marquee span {font-family:var(--fp);font-size:8px;color:#0b0714;letter-spacing:1px}\r
.w.w-game.qwen2-scope .w6-crt {position:relative;background:#020409;border:3px solid #000;border-radius:12px;padding:16px;overflow:hidden}\r
.w.w-game.qwen2-scope .w6-row {display:flex;gap:16px;position:relative;z-index:1}\r
.w.w-game.qwen2-scope .w6-art {flex:none;width:118px}\r
.w.w-game.qwen2-scope .w6-art img {width:100%;height:164px;object-fit:cover;box-shadow:0 0 0 3px var(--ga),0 0 26px color-mix(in srgb,var(--ga) 45%,transparent);image-rendering:auto}\r
.w.w-game.qwen2-scope .w6-data {flex:1;min-width:0}\r
.w.w-game.qwen2-scope .w6-px {font-family:var(--fp);font-size:7px;color:#8f9bd4;letter-spacing:1px;margin-bottom:9px}\r
.w.w-game.qwen2-scope .w6-title {font-family:var(--fp);font-size:12px;line-height:1.7;color:#fff;text-transform:uppercase;text-shadow:2px 2px 0 #ff4d9d,-2px -2px 0 #35e0ff;margin-bottom:9px}\r
.w.w-game.qwen2-scope .w6-sub {font-family:var(--fm);font-size:9.5px;color:#7c88b8;margin-bottom:11px}\r
.w.w-game.qwen2-scope .w6-scores p {font-family:var(--fp);font-size:8px;color:#aab4e0;line-height:2.1}\r
.w.w-game.qwen2-scope .w6-scores b {font-size:11px}\r
.w.w-game.qwen2-scope .w6-scores span {color:#596390;font-size:7px}\r
.w.w-game.qwen2-scope .w6-tags {font-family:var(--fm);font-size:8.5px;color:var(--ga);margin-top:9px;letter-spacing:.5px}\r
.w.w-game.qwen2-scope .w6-scanlines {position:absolute;inset:0;z-index:2;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.045) 0 1px,transparent 1px 3px)}\r
.w.w-game.qwen2-scope .w6-vignette {position:absolute;inset:0;z-index:2;pointer-events:none;background:radial-gradient(120% 100% at 50% 50%,transparent 55%,rgba(0,0,0,.55));animation:crtflick 4s steps(3) infinite}\r
@keyframes crtflick {\r
0%,100%{opacity:1}50%{opacity:.92}\r
}\r
.w.w-game.qwen2-scope .w6-deck {display:flex;align-items:center;gap:12px;margin-top:13px;flex-wrap:wrap}\r
.w.w-game.qwen2-scope .w6-start {display:inline-flex;align-items:center;gap:9px;font-family:var(--fp);font-size:9px;color:#fff;background:#ff3355;border:3px solid #000;border-radius:9px;padding:12px 16px;box-shadow:0 5px 0 #7a0f22;transition:.1s}\r
.w.w-game.qwen2-scope .w6-start i {font-style:normal;animation:blink 1s steps(2) infinite}\r
.w.w-game.qwen2-scope .w6-start:hover {filter:brightness(1.1)}\r
.w.w-game.qwen2-scope .w6-start:active {transform:translateY(4px);box-shadow:0 1px 0 #7a0f22}\r
.w.w-game.qwen2-scope .w6-coins {display:flex;gap:7px;margin-left:auto}\r
.w.w-game.qwen2-scope .w6-coins a {font-family:var(--fp);font-size:7px;color:#ffd23f;background:#241c3f;border:2px solid #000;border-radius:999px;padding:9px 11px;box-shadow:0 3px 0 #000;transition:.1s}\r
.w.w-game.qwen2-scope .w6-coins a:hover {background:#322757}\r
.w.w-game.qwen2-scope .w6-coins a:active {transform:translateY(3px);box-shadow:none}\r
.w.w-game.qwen2-scope .w6-credit {font-family:var(--fp);font-size:7px;color:#596390;text-align:center;margin-top:12px;letter-spacing:1px}\r
.w.w-game.qwen2-scope .w6-credit .blink {animation:blink 1s steps(2) infinite;color:var(--ga)}\r
.w.w-game.qwen2-scope .w7 {position:relative;width:100%;min-height:400px;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between}\r
.w.w-game.qwen2-scope .w7-artwrap {position:absolute;inset:0;overflow:hidden;transform:translate(var(--px,0px),var(--py,0px)) scale(1.07);transition:transform .25s ease-out}\r
.w.w-game.qwen2-scope .w7-art {width:100%;height:100%;object-fit:cover;animation:kenburns 26s ease-in-out infinite alternate}\r
@keyframes kenburns {\r
from{transform:scale(1.05) translate(0,0)}to{transform:scale(1.16) translate(-14px,-8px)}\r
}\r
.w.w-game.qwen2-scope .w7-scrim {position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,6,10,.42),rgba(5,6,10,.04) 38%,rgba(5,6,10,.94) 86%)}\r
.w.w-game.qwen2-scope .w7-top {position:relative;display:flex;justify-content:space-between;align-items:center;padding:22px 26px}\r
.w.w-game.qwen2-scope .w7-src {display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#fff;background:rgba(8,10,16,.55);border:1px solid rgba(255,255,255,.22);backdrop-filter:blur(8px);padding:7px 14px;border-radius:999px}\r
.w.w-game.qwen2-scope .w7-src .i {color:var(--sc)}\r
.w.w-game.qwen2-scope .w7-year {font-family:var(--fd);font-weight:900;font-size:15px;color:rgba(255,255,255,.85);text-shadow:0 2px 14px rgba(0,0,0,.6)}\r
.w.w-game.qwen2-scope .w7-bottom {position:relative;display:flex;align-items:flex-end;gap:26px;padding:0 26px 26px;flex-wrap:wrap}\r
.w.w-game.qwen2-scope .w7-left {flex:1;min-width:260px}\r
.w.w-game.qwen2-scope .w7-kicker {font-family:var(--fm);font-size:10.5px;letter-spacing:2.5px;text-transform:uppercase;color:var(--ga);margin-bottom:9px;text-shadow:0 0 16px color-mix(in srgb,var(--ga) 60%,transparent)}\r
.w.w-game.qwen2-scope .w7-left h4 {font-family:var(--fd);font-weight:900;font-size:clamp(28px,4.4vw,50px);line-height:1.04;color:#fff;text-shadow:0 6px 40px rgba(0,0,0,.65)}\r
.w.w-game.qwen2-scope .w7-meta {font-size:12.5px;color:rgba(255,255,255,.72);margin:10px 0 16px;font-weight:600}\r
.w.w-game.qwen2-scope .w7-cta {display:flex;align-items:center;gap:9px;flex-wrap:wrap}\r
.w.w-game.qwen2-scope .w7-go {display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:#0b0d08;background:var(--ga);padding:11px 18px;border-radius:11px;box-shadow:0 10px 30px color-mix(in srgb,var(--ga) 40%,transparent);transition:.2s}\r
.w.w-game.qwen2-scope .w7-go:hover {transform:translateY(-2px);filter:brightness(1.06)}\r
.w.w-game.qwen2-scope .w7-mini {display:flex;gap:6px}\r
.w.w-game.qwen2-scope .w7-mini a {display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:rgba(255,255,255,.85);background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);backdrop-filter:blur(8px);padding:9px 13px;border-radius:11px;transition:.2s}\r
.w.w-game.qwen2-scope .w7-mini a:hover {background:rgba(255,255,255,.22);color:#fff}\r
.w.w-game.qwen2-scope .w7-ring {position:relative;width:104px;height:104px;flex:none}\r
.w.w-game.qwen2-scope .w7-ring svg {width:100%;height:100%;transform:rotate(-90deg)}\r
.w.w-game.qwen2-scope .w7-ring circle {fill:none;stroke-width:7;stroke-linecap:round}\r
.w.w-game.qwen2-scope .w7-ring .bgc {stroke:rgba(255,255,255,.16)}\r
.w.w-game.qwen2-scope .w7-ring .fgc {stroke:var(--ga);stroke-dasharray:251.3;stroke-dashoffset:calc(251.3 - 251.3*var(--p));filter:drop-shadow(0 0 8px var(--ga));animation:ringdraw 1.5s .3s cubic-bezier(.2,.8,.2,1) backwards}\r
@keyframes ringdraw {\r
from{stroke-dashoffset:251.3}\r
}\r
.w.w-game.qwen2-scope .w7-rv {position:absolute;inset:0;display:grid;place-content:center;text-align:center}\r
.w.w-game.qwen2-scope .w7-rv b {font-family:var(--fd);font-weight:900;font-size:24px;color:#fff}\r
.w.w-game.qwen2-scope .w7-rv span {font-family:var(--fm);font-size:8px;letter-spacing:2px;color:rgba(255,255,255,.65)}\r
.w.w-game.qwen2-scope .w8 {position:relative;width:min(100%,560px);min-height:308px;background:var(--ga);color:#101208;border-radius:18px;overflow:hidden;box-shadow:0 26px 60px rgba(0,0,0,.5)}\r
.w.w-game.qwen2-scope .w8-art {position:absolute;inset:0;clip-path:polygon(0 0,46% 0,34% 100%,0 100%);transition:clip-path .55s cubic-bezier(.2,.8,.2,1)}\r
.w.w-game.qwen2-scope .w8-art img {width:100%;height:100%;object-fit:cover}\r
.w.w-game.qwen2-scope .w8:hover .w8-art {clip-path:polygon(0 0,51% 0,39% 100%,0 100%)}\r
.w.w-game.qwen2-scope .w8-stripe {position:absolute;inset:0;background:var(--gb);clip-path:polygon(46% 0,49.5% 0,37.5% 100%,34% 100%);transition:clip-path .55s cubic-bezier(.2,.8,.2,1)}\r
.w.w-game.qwen2-scope .w8:hover .w8-stripe {clip-path:polygon(51% 0,54.5% 0,42.5% 100%,39% 100%)}\r
.w.w-game.qwen2-scope .w8-year {position:absolute;top:18px;right:14px;writing-mode:vertical-rl;font-family:var(--fd);font-weight:900;font-size:13px;letter-spacing:3px;opacity:.55}\r
.w.w-game.qwen2-scope .w8-body {position:relative;margin-left:52%;padding:24px 34px 24px 12px;display:flex;flex-direction:column;align-items:flex-start;gap:9px;min-height:308px}\r
.w.w-game.qwen2-scope .w8-src {font-family:var(--fm);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;background:#101208;color:var(--ga);padding:4px 10px;border-radius:4px}\r
.w.w-game.qwen2-scope .w8-body h4 {font-family:var(--fd);font-weight:900;font-size:24px;line-height:1.08;text-transform:uppercase;letter-spacing:-.5px}\r
.w.w-game.qwen2-scope .w8-dev {font-size:11.5px;font-weight:800;opacity:.75}\r
.w.w-game.qwen2-scope .w8-tags {display:flex;flex-wrap:wrap;gap:5px}\r
.w.w-game.qwen2-scope .w8-tags span {font-size:9.5px;font-weight:800;background:#101208;color:var(--ga);padding:3px 9px;border-radius:999px}\r
.w.w-game.qwen2-scope .w8-score {display:flex;align-items:center;gap:10px;margin-top:auto}\r
.w.w-game.qwen2-scope .w8-score b {font-family:var(--fd);font-weight:900;font-size:44px;line-height:1}\r
.w.w-game.qwen2-scope .w8-score span {font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;line-height:1.5;opacity:.75}\r
.w.w-game.qwen2-scope .w8-go {display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:800;background:#101208;color:var(--ga);padding:10px 16px;border-radius:10px;transition:.2s}\r
.w.w-game.qwen2-scope .w8-go:hover {transform:translateX(3px);box-shadow:-5px 5px 0 rgba(16,18,8,.3)}\r
.w.w-game.qwen2-scope .w9wrap {width:min(100%,620px)}\r
.w.w-game.qwen2-scope .w9-p {font-size:13.5px;color:#aab3cf;line-height:1.8}\r
.w.w-game.qwen2-scope .w9-p b {color:var(--ink)}\r
.w.w-game.qwen2-scope .w9 {display:flex;align-items:center;gap:13px;background:#10141f;border:1px solid #232a3d;border-left:3px solid var(--ga);border-radius:11px;padding:10px 14px;margin:14px 0;transition:.25s}\r
.w.w-game.qwen2-scope .w9:hover {border-color:var(--ga);transform:translateX(3px);box-shadow:0 12px 34px rgba(0,0,0,.4)}\r
.w.w-game.qwen2-scope .w9>img {width:40px;height:56px;object-fit:cover;border-radius:6px;flex:none}\r
.w.w-game.qwen2-scope .w9-t {flex:1;min-width:0}\r
.w.w-game.qwen2-scope .w9-t b {display:block;font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\r
.w.w-game.qwen2-scope .w9-t span {font-size:10.5px;color:var(--muted)}\r
.w.w-game.qwen2-scope .w9-score {flex:none;font-size:11.5px;font-weight:800;color:#12140c;background:var(--ga);padding:4px 10px;border-radius:999px}\r
.w.w-game.qwen2-scope .w9-src {flex:none;font-family:var(--fd);font-weight:900;font-size:11px}\r
.w.w-game.qwen2-scope .w9-go {display:grid;place-items:center;width:30px;height:30px;flex:none;border-radius:8px;border:1px solid #2a3350;color:var(--muted);font-size:13px;transition:.2s}\r
.w.w-game.qwen2-scope .w9-go:hover {color:var(--ga);border-color:var(--ga)}\r
.w.w-game.qwen2-scope .w10 {width:min(100%,880px);background:#0c1017;border:1px solid #1d2433;border-radius:16px;padding:18px;color:#dbe2f2;box-shadow:0 26px 60px rgba(0,0,0,.5)}\r
.w.w-game.qwen2-scope .w10-head {display:flex;align-items:center;gap:13px;margin-bottom:15px}\r
.w.w-game.qwen2-scope .w10-head img {width:44px;height:60px;object-fit:cover;border-radius:7px}\r
.w.w-game.qwen2-scope .w10-head h4 {font-size:16px;font-weight:800}\r
.w.w-game.qwen2-scope .w10-head p {font-size:11px;color:var(--muted)}\r
.w.w-game.qwen2-scope .w10-live {margin-left:auto;display:flex;align-items:center;gap:7px;font-family:var(--fm);font-size:9.5px;color:#6f7a99}\r
.w.w-game.qwen2-scope .w10-live i {width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green);animation:pulse 2s infinite}\r
@keyframes pulse {\r
50%{opacity:.35}\r
}\r
.w.w-game.qwen2-scope .w10-tiles {display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:11px}\r
.w.w-game.qwen2-scope .w10-tile {background:#10151f;border:1px solid #1c2333;border-radius:11px;padding:11px 13px;position:relative;overflow:hidden}\r
.w.w-game.qwen2-scope .w10-tile::before {content:"";position:absolute;top:0;left:0;right:0;height:2px;background:var(--tc)}\r
.w.w-game.qwen2-scope .w10-tile span {display:block;font-family:var(--fm);font-size:8.5px;letter-spacing:1.5px;text-transform:uppercase;color:#6f7a99;margin-bottom:5px}\r
.w.w-game.qwen2-scope .w10-tile b {font-family:var(--fm);font-weight:700;font-size:22px;color:var(--tc)}\r
.w.w-game.qwen2-scope .w10-tile em {display:block;font-style:normal;font-size:9.5px;color:#6f7a99;margin-top:3px}\r
.w.w-game.qwen2-scope .w10-charts {display:grid;grid-template-columns:1.2fr 1fr;gap:9px;margin-bottom:13px}\r
.w.w-game.qwen2-scope .w10-spark, .w.w-game.qwen2-scope .w10-dist {background:#10151f;border:1px solid #1c2333;border-radius:11px;padding:11px 13px}\r
.w.w-game.qwen2-scope .w10-spark>span, .w.w-game.qwen2-scope .w10-dist>span {display:block;font-family:var(--fm);font-size:8.5px;letter-spacing:1.5px;text-transform:uppercase;color:#6f7a99;margin-bottom:8px}\r
.w.w-game.qwen2-scope .w10-spark svg {width:100%;height:64px}\r
.w.w-game.qwen2-scope .w10-spark polyline {fill:none;stroke:var(--ga);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;animation:sparkdraw 1.6s .2s ease forwards}\r
@keyframes sparkdraw {\r
to{stroke-dashoffset:0}\r
}\r
.w.w-game.qwen2-scope .w10-spark .dot {fill:var(--ga);animation:pulse 2s infinite}\r
.w.w-game.qwen2-scope .w10-drow {display:flex;align-items:center;gap:8px;margin-bottom:5px}\r
.w.w-game.qwen2-scope .w10-drow em {font-style:normal;font-family:var(--fm);font-size:9px;color:#8b96b5;width:20px;flex:none}\r
.w.w-game.qwen2-scope .w10-dbar {flex:1;height:7px;background:#171d2b;border-radius:4px;overflow:hidden}\r
.w.w-game.qwen2-scope .w10-dbar i {display:block;height:100%;width:var(--w);background:var(--dc);border-radius:4px;animation:grow 1s .2s backwards}\r
.w.w-game.qwen2-scope .w10-drow b {font-family:var(--fm);font-size:9px;color:#8b96b5;width:30px;text-align:right;flex:none}\r
.w.w-game.qwen2-scope .w10-foot {display:flex;align-items:center;gap:10px;flex-wrap:wrap}\r
.w.w-game.qwen2-scope .w10-plats {display:flex;gap:6px;flex-wrap:wrap}\r
.w.w-game.qwen2-scope .w10-plats span {font-family:var(--fm);font-size:9px;letter-spacing:1px;color:#9aa5c4;border:1px solid #26304a;border-radius:6px;padding:4px 9px}\r
.w.w-game.qwen2-scope .w10-links {display:flex;gap:6px;margin-left:auto;flex-wrap:wrap}\r
.w.w-game.qwen2-scope .w10-link {display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;color:#9aa5c4;border:1px solid #26304a;border-radius:8px;padding:6px 10px;transition:.2s}\r
.w.w-game.qwen2-scope .w10-link:hover {color:var(--ga);border-color:var(--ga)}\r
.w.w-game.qwen2-scope .w10-go {display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;color:#0b0d08;background:var(--ga);padding:8px 13px;border-radius:8px;transition:.2s}\r
.w.w-game.qwen2-scope .w10-go:hover {filter:brightness(1.07)}\r
.w.w-game.qwen2-scope .w11scene {perspective:1200px;display:grid;place-items:center;padding:8px}\r
.w.w-game.qwen2-scope .w11 {position:relative;width:302px;aspect-ratio:5/7;border-radius:18px;background:linear-gradient(160deg,#2c2540,#161221);box-shadow:0 0 0 2px #453a63,0 0 0 5px #1c1730,0 34px 70px rgba(0,0,0,.65);transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transform-style:preserve-3d;padding:11px}\r
.w.w-game.qwen2-scope .w11.rest {transition:transform .7s cubic-bezier(.2,.8,.2,1)}\r
.w.w-game.qwen2-scope .w11-in {position:relative;height:100%;display:flex;flex-direction:column;gap:7px;background:linear-gradient(180deg,#1b1628,#120e1d);border:1px solid #3c3258;border-radius:11px;padding:11px;overflow:hidden}\r
.w.w-game.qwen2-scope .w11-head {display:flex;align-items:center;gap:8px}\r
.w.w-game.qwen2-scope .w11-head b {flex:1;font-family:var(--fd);font-weight:800;font-size:13px;color:#f1ecff;line-height:1.25}\r
.w.w-game.qwen2-scope .w11-gem {flex:none;width:42px;height:46px;display:grid;place-items:center;background:conic-gradient(from 210deg,var(--ga),#fff8,var(--ga),#0006,var(--ga));clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}\r
.w.w-game.qwen2-scope .w11-gem i {font-style:normal;font-family:var(--fd);font-weight:900;font-size:12px;color:#0e0a18;text-shadow:0 1px 0 rgba(255,255,255,.4)}\r
.w.w-game.qwen2-scope .w11-art {position:relative;border:2px solid #4a4166;border-radius:8px;overflow:hidden}\r
.w.w-game.qwen2-scope .w11-art img {width:100%;height:196px;object-fit:cover}\r
.w.w-game.qwen2-scope .w11-rarity {position:absolute;top:7px;left:7px;font-family:var(--fm);font-size:7.5px;font-weight:700;letter-spacing:2px;color:#0e0a18;background:linear-gradient(90deg,#ffe9a3,#ffb02e);padding:3px 8px;border-radius:4px;box-shadow:0 3px 10px rgba(0,0,0,.5)}\r
.w.w-game.qwen2-scope .w11-type {font-size:9px;font-weight:800;letter-spacing:.6px;color:#c9bfe6;background:#241d3a;border:1px solid #3c3258;border-radius:5px;padding:4px 8px}\r
.w.w-game.qwen2-scope .w11-flavor {flex:1;font-family:var(--fs);font-style:italic;font-size:10.5px;line-height:1.55;color:#a99cc9;padding:2px 3px}\r
.w.w-game.qwen2-scope .w11-stats {display:flex;justify-content:space-between;border-top:1px solid #3c3258;padding-top:7px}\r
.w.w-game.qwen2-scope .w11-stats span {font-family:var(--fm);font-size:7px;letter-spacing:1px;color:#6f6396}\r
.w.w-game.qwen2-scope .w11-stats b {display:block;font-size:9.5px;color:#e8e1ff;letter-spacing:0;margin-top:2px}\r
.w.w-game.qwen2-scope .w11-foot {display:flex;align-items:center;justify-content:space-between}\r
.w.w-game.qwen2-scope .w11-foot>span {font-family:var(--fm);font-size:7px;letter-spacing:1.5px;color:#6f6396}\r
.w.w-game.qwen2-scope .w11-foot a {display:grid;place-items:center;width:24px;height:24px;border-radius:6px;background:#241d3a;border:1px solid #3c3258;color:#c9bfe6;font-size:11px;transition:.2s}\r
.w.w-game.qwen2-scope .w11-foot a:hover {color:var(--ga);border-color:var(--ga)}\r
.w.w-game.qwen2-scope .w11-foil {position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:var(--fo,0);transition:opacity .35s;mix-blend-mode:color-dodge;filter:hue-rotate(calc(var(--mxn,0)*160deg));\r
  background:linear-gradient(115deg,transparent 22%,rgba(255,0,132,.32) 36%,rgba(0,229,255,.32) 47%,rgba(182,255,46,.32) 58%,transparent 74%),radial-gradient(circle at var(--mx,50%) var(--my,50%),rgba(255,255,255,.34),transparent 46%)}\r
.w.w-game.qwen2-scope .w11-spark {position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:calc(var(--fo,0)*.6);transition:opacity .35s;mix-blend-mode:screen;\r
  background-image:radial-gradient(circle,rgba(255,255,255,.95) 0 1px,transparent 1.8px),radial-gradient(circle,rgba(255,255,255,.7) 0 .8px,transparent 1.4px);\r
  background-size:88px 88px,53px 53px;background-position:calc(var(--mxn,0)*46px) calc(var(--myn,0)*36px),calc(var(--mxn,0)*-30px) calc(var(--myn,0)*-24px)}\r
.w.w-game.qwen2-scope .w12 {position:relative;width:min(100%,700px);background:#ffd23f;color:#0d0d0d;border:3px solid #0d0d0d;border-radius:6px;box-shadow:10px 10px 0 #0d0d0d;transition:.2s}\r
.w.w-game.qwen2-scope .w12:hover {transform:translate(-3px,-3px);box-shadow:14px 14px 0 #0d0d0d}\r
.w.w-game.qwen2-scope .w12-marquee {background:#0d0d0d;overflow:hidden;padding:7px 0;border-bottom:3px solid #0d0d0d}\r
.w.w-game.qwen2-scope .w12-track {display:inline-block;white-space:nowrap;font-family:var(--fm);font-size:9px;font-weight:700;letter-spacing:2px;color:#ffd23f;animation:marq 16s linear infinite}\r
@keyframes marq {\r
to{transform:translateX(-50%)}\r
}\r
.w.w-game.qwen2-scope .w12-body {position:relative;display:flex;gap:18px;padding:20px}\r
.w.w-game.qwen2-scope .w12-art {position:relative;flex:none;width:138px;border:3px solid #0d0d0d;box-shadow:6px 6px 0 rgba(13,13,13,.35)}\r
.w.w-game.qwen2-scope .w12-art img {width:100%;height:190px;object-fit:cover}\r
.w.w-game.qwen2-scope .w12-dots {position:absolute;inset:0;background-image:radial-gradient(rgba(13,13,13,.5) 1px,transparent 1.4px);background-size:5px 5px;mix-blend-mode:multiply;opacity:.35;pointer-events:none}\r
.w.w-game.qwen2-scope .w12-info {flex:1;min-width:0}\r
.w.w-game.qwen2-scope .w12-tape {display:inline-block;font-family:var(--fm);font-size:9px;font-weight:700;letter-spacing:1.5px;background:rgba(255,255,255,.75);border:2px solid #0d0d0d;padding:3px 10px;transform:rotate(-1.5deg);margin-bottom:9px}\r
.w.w-game.qwen2-scope .w12-info h4 {font-family:var(--fd);font-weight:900;font-size:23px;line-height:1.05;text-transform:uppercase;letter-spacing:-.5px;margin-bottom:6px}\r
.w.w-game.qwen2-scope .w12-meta {font-size:11px;font-weight:800;margin-bottom:10px}\r
.w.w-game.qwen2-scope .w12-tags {display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}\r
.w.w-game.qwen2-scope .w12-tags span {font-size:9.5px;font-weight:800;background:#fff;border:2px solid #0d0d0d;padding:3px 9px;text-transform:uppercase}\r
.w.w-game.qwen2-scope .w12-cta {display:flex;gap:8px;flex-wrap:wrap}\r
.w.w-game.qwen2-scope .w12-go {display:inline-flex;align-items:center;gap:8px;font-family:var(--fd);font-weight:800;font-size:11px;letter-spacing:.5px;background:#0d0d0d;color:#ffd23f;border:3px solid #0d0d0d;padding:9px 16px;transition:.15s}\r
.w.w-game.qwen2-scope .w12-go:hover {background:#fff;color:#0d0d0d}\r
.w.w-game.qwen2-scope .w12-sq {display:inline-flex;align-items:center;font-family:var(--fm);font-size:9px;font-weight:700;letter-spacing:1px;background:#fff;border:3px solid #0d0d0d;padding:9px 11px;transition:.15s}\r
.w.w-game.qwen2-scope .w12-sq:hover {background:#0d0d0d;color:#fff}\r
.w.w-game.qwen2-scope .w12-sticker {position:absolute;top:-16px;right:16px;width:78px;height:78px;border-radius:50%;background:#ff3355;color:#fff;border:3px solid #0d0d0d;display:grid;place-content:center;text-align:center;transform:rotate(9deg);box-shadow:4px 4px 0 #0d0d0d}\r
.w.w-game.qwen2-scope .w12-sticker b {font-family:var(--fd);font-weight:900;font-size:20px;line-height:1}\r
.w.w-game.qwen2-scope .w12-sticker span {font-family:var(--fm);font-size:7px;font-weight:700;letter-spacing:1.5px;margin-top:3px}\r
.w.w-game.qwen2-scope .w12-foot {display:flex;align-items:center;gap:13px;padding:0 20px 16px}\r
.w.w-game.qwen2-scope .w12-barcode {width:110px;height:24px;background:repeating-linear-gradient(90deg,#0d0d0d 0 2px,transparent 2px 4px,#0d0d0d 4px 7px,transparent 7px 9px,#0d0d0d 9px 10px,transparent 10px 14px)}\r
.w.w-game.qwen2-scope .w12-foot span {font-family:var(--fm);font-size:8.5px;font-weight:700;letter-spacing:2px}\r
.w.w-game.qwen2-scope .embed {padding:20px 0 90px;scroll-margin-top:150px}\r
.w.w-game.qwen2-scope .embed-head {margin-bottom:28px}\r
.w.w-game.qwen2-scope .embed-head h2 {font-family:var(--fd);font-weight:900;font-size:clamp(22px,3vw,34px)}\r
.w.w-game.qwen2-scope .embed-head p {color:var(--muted);margin-top:8px;max-width:640px}\r
.w.w-game.qwen2-scope .steps {display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px}\r
.w.w-game.qwen2-scope .step {background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;transition:.25s}\r
.w.w-game.qwen2-scope .step:hover {border-color:var(--violet);transform:translateY(-3px)}\r
.w.w-game.qwen2-scope .step b {display:block;font-family:var(--fd);font-weight:900;font-size:26px;color:transparent;-webkit-text-stroke:1.2px var(--violet);margin-bottom:10px}\r
.w.w-game.qwen2-scope .step:nth-child(2) b {-webkit-text-stroke-color:var(--cyan)}\r
.w.w-game.qwen2-scope .step:nth-child(3) b {-webkit-text-stroke-color:var(--lime)}\r
.w.w-game.qwen2-scope .step h3 {font-size:14.5px;font-weight:800;margin-bottom:6px}\r
.w.w-game.qwen2-scope .step p {font-size:12.5px;color:var(--muted);line-height:1.7}\r
.w.w-game.qwen2-scope .codeblock {background:#0a0e19;border:1px solid var(--line);border-radius:16px;overflow:hidden}\r
.w.w-game.qwen2-scope .codeblock-head {display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--line)}\r
.w.w-game.qwen2-scope .codeblock-head i {width:10px;height:10px;border-radius:50%;background:#2a3350}\r
.w.w-game.qwen2-scope .codeblock-head i:nth-child(1) {background:var(--red)}\r
.w.w-game.qwen2-scope .codeblock-head i:nth-child(2) {background:var(--amber)}\r
.w.w-game.qwen2-scope .codeblock-head i:nth-child(3) {background:var(--green)}\r
.w.w-game.qwen2-scope .codeblock-head span {font-family:var(--fm);font-size:10.5px;color:var(--dim);margin-left:6px;flex:1}\r
.w.w-game.qwen2-scope .codeblock pre {padding:18px;overflow-x:auto;font-family:var(--fm);font-size:12px;line-height:1.8;color:#c6cfe8;scrollbar-width:thin}\r
.w.w-game.qwen2-scope .ct {color:var(--magenta);font-weight:400}\r
.w.w-game.qwen2-scope .ca {color:var(--cyan);font-weight:400}\r
.w.w-game.qwen2-scope .cs {color:var(--lime);font-weight:400}\r
.w.w-game.qwen2-scope .cc {color:#5f6a8c;font-weight:400}\r
.w.w-game.qwen2-scope .attrs {display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:18px}\r
.w.w-game.qwen2-scope .attr {display:flex;gap:12px;align-items:baseline;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 15px}\r
.w.w-game.qwen2-scope .attr code {font-family:var(--fm);font-size:11.5px;color:var(--cyan);flex:none}\r
.w.w-game.qwen2-scope .attr span {font-size:11.5px;color:var(--muted)}\r
.w.w-game.qwen2-scope footer {border-top:1px solid var(--line);padding:26px 0;background:rgba(9,11,20,.6)}\r
.w.w-game.qwen2-scope .foot-in {display:flex;align-items:center;gap:18px;flex-wrap:wrap}\r
.w.w-game.qwen2-scope .foot-in p {font-size:12px;color:var(--muted)}\r
.w.w-game.qwen2-scope .foot-in .srcs {margin-left:auto;font-family:var(--fm);font-size:10px;color:var(--dim);letter-spacing:1px}\r
.w.w-game.qwen2-scope .toasts {position:fixed;bottom:22px;right:22px;z-index:300;display:flex;flex-direction:column;gap:9px}\r
.w.w-game.qwen2-scope .toast .i {color:var(--lime);font-size:15px}\r
.w.w-game.qwen2-scope .toast.out {animation:toastOut .3s forwards}\r
@keyframes toastIn {\r
from{opacity:0;transform:translateY(14px) scale(.96)}\r
}\r
@keyframes toastOut {\r
to{opacity:0;transform:translateX(20px)}\r
}\r
.w.w-game.qwen2-scope .overlay {position:fixed;inset:0;z-index:250;background:rgba(4,6,10,.72);backdrop-filter:blur(8px);display:grid;place-items:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .25s}\r
.w.w-game.qwen2-scope .overlay.open {opacity:1;pointer-events:auto}\r
.w.w-game.qwen2-scope .modal {width:min(100%,640px);background:#0e1322;border:1px solid var(--line2);border-radius:18px;box-shadow:0 40px 100px rgba(0,0,0,.7);transform:scale(.95) translateY(10px);transition:transform .3s cubic-bezier(.2,.8,.2,1);max-height:88vh;display:flex;flex-direction:column}\r
.w.w-game.qwen2-scope .overlay.open .modal {transform:none}\r
.w.w-game.qwen2-scope .modal-head {display:flex;align-items:center;gap:12px;padding:17px 20px;border-bottom:1px solid var(--line)}\r
.w.w-game.qwen2-scope .modal-head .vnum {font-size:20px}\r
.w.w-game.qwen2-scope .modal-head h3 {font-size:15px;font-weight:800;flex:1}\r
.w.w-game.qwen2-scope .modal-x {display:grid;place-items:center;width:32px;height:32px;border-radius:9px;border:1px solid var(--line2);color:var(--muted);transition:.2s}\r
.w.w-game.qwen2-scope .modal-x:hover {color:var(--ink);border-color:var(--red)}\r
.w.w-game.qwen2-scope .modal-body {padding:18px 20px;overflow-y:auto;scrollbar-width:thin}\r
.w.w-game.qwen2-scope .modal-body>p {font-size:12.5px;color:var(--muted);margin-bottom:13px}\r
.w.w-game.qwen2-scope .modal-body pre {background:#0a0e19;border:1px solid var(--line);border-radius:12px;padding:15px;font-family:var(--fm);font-size:11.5px;line-height:1.8;overflow-x:auto;color:#c6cfe8;scrollbar-width:thin}\r
.w.w-game.qwen2-scope .modal-tags {display:flex;gap:6px;flex-wrap:wrap;margin-top:13px}\r
.w.w-game.qwen2-scope .modal-tags span {font-family:var(--fm);font-size:9.5px;color:var(--cyan);background:#0a0e19;border:1px solid var(--line);border-radius:6px;padding:4px 9px}\r
.w.w-game.qwen2-scope .modal-foot {display:flex;gap:10px;justify-content:flex-end;padding:15px 20px;border-top:1px solid var(--line)}\r
.w.w-game.qwen2-scope .backtop {position:fixed;bottom:22px;left:22px;z-index:150;width:42px;height:42px;border-radius:12px;background:#141a2c;border:1px solid var(--line2);color:var(--muted);display:grid;place-items:center;font-size:16px;opacity:0;pointer-events:none;transition:.3s;transform:translateY(8px)}\r
.w.w-game.qwen2-scope .backtop.show {opacity:1;pointer-events:auto;transform:none}\r
.w.w-game.qwen2-scope .backtop:hover {color:var(--lime);border-color:var(--lime)}\r
.w.w-game.qwen2-scope noscript div {padding:100px 24px;text-align:center;color:var(--amber);font-weight:700}\r
@media(max-width:1020px) {\r
.w.w-game.qwen2-scope .grid {grid-template-columns:1fr}\r
.w.w-game.qwen2-scope .hero-in {grid-template-columns:1fr;gap:30px}\r
.w.w-game.qwen2-scope .fan {height:320px}\r
.w.w-game.qwen2-scope .steps {grid-template-columns:1fr}\r
.w.w-game.qwen2-scope .attrs {grid-template-columns:1fr}\r
}\r
@media(max-width:860px) {\r
.w.w-game.qwen2-scope .controls {position:static}\r
.w.w-game.qwen2-scope .fchips {margin-left:0}\r
.w.w-game.qwen2-scope .nav-links {display:none}\r
.w.w-game.qwen2-scope .nav-badge {display:none}\r
.w.w-game.qwen2-scope .section, .w.w-game.qwen2-scope .embed {scroll-margin-top:84px}\r
.w.w-game.qwen2-scope .vcard {scroll-margin-top:84px}\r
}\r
@media(max-width:600px) {\r
.w.w-game.qwen2-scope .hero {padding-top:104px}\r
.w.w-game.qwen2-scope .fan {height:270px}\r
.w.w-game.qwen2-scope .fan-card {width:150px}\r
.w.w-game.qwen2-scope .fan-card:nth-child(1) {transform:rotate(-12deg) translate(-92px,12px)}\r
.w.w-game.qwen2-scope .fan-card:nth-child(3) {transform:rotate(12deg) translate(92px,14px)}\r
.w.w-game.qwen2-scope .fan:hover .fan-card:nth-child(1) {transform:rotate(-14deg) translate(-104px,16px)}\r
.w.w-game.qwen2-scope .fan:hover .fan-card:nth-child(3) {transform:rotate(14deg) translate(104px,18px)}\r
.w.w-game.qwen2-scope .w1-body, .w.w-game.qwen2-scope .w2, .w.w-game.qwen2-scope .w4-grid, .w.w-game.qwen2-scope .w6-row {flex-direction:column}\r
.w.w-game.qwen2-scope .w1-cover {width:100%}\r
.w.w-game.qwen2-scope .w1-cover img {height:190px}\r
.w.w-game.qwen2-scope .w2-cover {width:110px}\r
.w.w-game.qwen2-scope .w2-cover img {height:158px}\r
.w.w-game.qwen2-scope .w4-label {width:100%;max-width:220px;margin:0 auto}\r
.w.w-game.qwen2-scope .w6-art {width:100%;max-width:170px}\r
.w.w-game.qwen2-scope .w3-grid {grid-template-columns:96px 1fr}\r
.w.w-game.qwen2-scope .w3-fig img {width:96px;height:140px}\r
.w.w-game.qwen2-scope .w3-score {grid-column:1/-1;border-left:none;border-top:1px solid #d8cfbf;padding:10px 0 0;display:flex;align-items:baseline;gap:12px;text-align:left}\r
.w.w-game.qwen2-scope .w3-score b {font-size:38px}\r
.w.w-game.qwen2-scope .w8 {min-height:0}\r
.w.w-game.qwen2-scope .w8-art {position:relative;height:170px;clip-path:polygon(0 0,100% 0,100% 80%,0 100%)}\r
.w.w-game.qwen2-scope .w8:hover .w8-art {clip-path:polygon(0 0,100% 0,100% 86%,0 100%)}\r
.w.w-game.qwen2-scope .w8-stripe, .w.w-game.qwen2-scope .w8-year {display:none}\r
.w.w-game.qwen2-scope .w8-body {margin-left:0;padding:16px 18px 20px;min-height:0}\r
.w.w-game.qwen2-scope .w10-tiles {grid-template-columns:1fr 1fr}\r
.w.w-game.qwen2-scope .w10-charts {grid-template-columns:1fr}\r
.w.w-game.qwen2-scope .w12-body {flex-direction:column}\r
.w.w-game.qwen2-scope .w12-art {width:100%;max-width:190px}\r
.w.w-game.qwen2-scope .w12-sticker {width:64px;height:64px;top:-14px;right:10px}\r
.w.w-game.qwen2-scope .w12-sticker b {font-size:16px}\r
.w.w-game.qwen2-scope .w7 {min-height:340px}\r
.w.w-game.qwen2-scope .w7-ring {width:84px;height:84px}\r
.w.w-game.qwen2-scope .w11 {width:min(302px,100%)}\r
.w.w-game.qwen2-scope .vnote {display:none}\r
.w.w-game.qwen2-scope .toasts {left:16px;right:16px}\r
.w.w-game.qwen2-scope .backtop {display:none}\r
}\r
@media(prefers-reduced-motion:reduce) {\r
:where(.w.w-game.qwen2-scope) *, :where(.w.w-game.qwen2-scope) *::before, :where(.w.w-game.qwen2-scope) *::after {animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}\r
}\r
.w.w-game.tw-card{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#f5f3ef;--stone-bg:#e8e4dc;--paper-card:#f6f3ec;--ink-black:#141413;--signal-orange:#ff4f00;--acid-lime:#c8f904}\r
\r
.w.w-game.tw-card .font-display { font-family: 'Space Grotesk', sans-serif; }\r
.w.w-game.tw-card .font-editorial { font-family: 'Instrument Serif', Georgia, serif; }\r
.w.w-game.tw-card .font-mono-tech {\r
      font-family: 'JetBrains Mono', monospace;\r
      font-variant-numeric: tabular-nums;\r
    }\r
.w.w-game.tw-card .te-grid-bg {\r
      background-color: #f4f0e6;\r
      background-image:\r
        linear-gradient(to right, rgba(20, 20, 19, 0.05) 1px, transparent 1px),\r
        linear-gradient(to bottom, rgba(20, 20, 19, 0.05) 1px, transparent 1px);\r
      background-size: 22px 22px;\r
    }\r
.w.w-game.tw-card .crt-box {\r
      position: relative;\r
      background: #060b08;\r
      border: 1px solid #1e462d;\r
      overflow: hidden;\r
    }\r
.w.w-game.tw-card .crt-box::after {\r
      content: '';\r
      position: absolute;\r
      inset: 0;\r
      background: repeating-linear-gradient(0deg, rgba(0,0,0,0.2), rgba(0,0,0,0.2) 1px, transparent 1px, transparent 3px);\r
      pointer-events: none;\r
    }\r
.w.w-game.tw-card .bar-anim {\r
      transition: width 0.45s cubic-bezier(0.22, 1, 0.36, 1), height 0.45s cubic-bezier(0.22, 1, 0.36, 1);\r
    }\r
.w.w-game.tw-card {\r
      --stone-bg: #e8e4dc;\r
      --paper-card: #f6f3ec;\r
      --ink-black: #141413;\r
      --signal-orange: #ff4f00;\r
      --acid-lime: #c8f904;\r
    }\r
.w.w-game.tw-card .font-display { font-family: 'Space Grotesk', sans-serif; }\r
.w.w-game.tw-card .font-editorial { font-family: 'Instrument Serif', Georgia, serif; }\r
.w.w-game.tw-card .font-mono-tech {\r
      font-family: 'JetBrains Mono', monospace;\r
      font-variant-numeric: tabular-nums;\r
    }\r
.w.w-game.tw-card .te-ticket {\r
      position: relative;\r
      background-color: #f4f0e6;\r
      color: #141413;\r
      border-radius: 18px;\r
      border: 2px solid #141413;\r
      box-shadow: 6px 6px 0px #141413;\r
      overflow: hidden;\r
      transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.2s ease;\r
    }\r
.w.w-game.tw-card .te-ticket:hover {\r
      transform: translate(-2px, -2px);\r
      box-shadow: 8px 8px 0px #141413;\r
    }\r
.w.w-game.tw-card .te-grid-bg {\r
      background-image:\r
        linear-gradient(to right, rgba(20, 20, 19, 0.05) 1px, transparent 1px),\r
        linear-gradient(to bottom, rgba(20, 20, 19, 0.05) 1px, transparent 1px);\r
      background-size: 24px 24px;\r
    }\r
.w.w-game.tw-card .te-perforation {\r
      position: relative;\r
      border-top: 2px dashed #141413;\r
    }\r
@media (min-width: 768px) {\r
.w.w-game.tw-card .te-perforation {\r
        border-top: none;\r
        border-left: 2px dashed #141413;\r
      }\r
.w.w-game.tw-card .te-perforation::before, .w.w-game.tw-card .te-perforation::after {\r
        content: '';\r
        position: absolute;\r
        left: -11px;\r
        width: 20px;\r
        height: 20px;\r
        background-color: #1e1e1c;\r
        border: 2px solid #141413;\r
        border-radius: 9999px;\r
        z-index: 20;\r
      }\r
.w.w-game.tw-card .te-perforation::before { top: -12px; }\r
.w.w-game.tw-card .te-perforation::after { bottom: -12px; }\r
}\r
.w.w-game.tw-card .te-index-tab {\r
      display: inline-flex;\r
      align-items: center;\r
      justify-content: space-between;\r
      gap: 6px;\r
      padding: 6px 10px;\r
      font-family: 'JetBrains Mono', monospace;\r
      font-size: 11px;\r
      font-weight: 700;\r
      text-transform: uppercase;\r
      letter-spacing: 0.04em;\r
      color: #141413;\r
      background: #e7e2d5;\r
      border-right: 1.5px solid #141413;\r
      border-top: 1.5px solid #141413;\r
      transition: background 0.15s ease, color 0.15s ease;\r
      text-decoration: none;\r
    }\r
.w.w-game.tw-card .te-index-tab:first-child {\r
      border-left: 1.5px solid #141413;\r
      border-top-left-radius: 6px;\r
    }\r
.w.w-game.tw-card .te-index-tab:last-child { border-top-right-radius: 6px; }\r
.w.w-game.tw-card .te-index-tab:hover { background: #141413; color: #f4f0e6; }\r
.w.w-game.tw-card .te-index-tab.active-source { background: #ff4f00; color: #ffffff; }\r
.w.w-game.tw-card .te-index-tab.active-source-panax { background: #00a86b; color: #ffffff; }\r
.w.w-game.tw-card .cine-canvas {\r
      position: relative;\r
      border-radius: 24px;\r
      overflow: hidden;\r
      min-height: 250px;\r
      background: #0d0d0c;\r
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.75);\r
      border: 1px solid rgba(255, 255, 255, 0.12);\r
    }\r
.w.w-game.tw-card .cine-backdrop {\r
      position: absolute;\r
      inset: 0;\r
      z-index: 0;\r
      transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);\r
    }\r
.w.w-game.tw-card .cine-canvas:hover .cine-backdrop { transform: scale(1.03); }\r
.w.w-game.tw-card .cine-vignette {\r
      position: absolute;\r
      inset: 0;\r
      z-index: 1;\r
      background:\r
        linear-gradient(90deg, rgba(12, 11, 10, 0.95) 0%, rgba(12, 11, 10, 0.78) 48%, rgba(12, 11, 10, 0.35) 100%),\r
        linear-gradient(0deg, rgba(12, 11, 10, 0.92) 0%, transparent 65%);\r
    }\r
.w.w-game.tw-card .cine-hud-capsule {\r
      background: rgba(20, 19, 18, 0.72);\r
      backdrop-filter: blur(20px);\r
      -webkit-backdrop-filter: blur(20px);\r
      border: 1px solid rgba(255, 255, 255, 0.14);\r
      border-radius: 20px;\r
      box-shadow: 0 16px 32px rgba(0, 0, 0, 0.45);\r
    }\r
.w.w-game.tw-card .cine-icon-node {\r
      position: relative;\r
      width: 38px;\r
      height: 38px;\r
      border-radius: 9999px;\r
      display: inline-flex;\r
      align-items: center;\r
      justify-content: center;\r
      background: rgba(255, 255, 255, 0.08);\r
      border: 1px solid rgba(255, 255, 255, 0.15);\r
      color: #f5f3ef;\r
      transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);\r
      text-decoration: none;\r
    }\r
.w.w-game.tw-card .cine-icon-node:hover {\r
      background: #f5f3ef;\r
      color: #141413;\r
      transform: translateY(-2px) scale(1.06);\r
      border-color: #ffffff;\r
    }\r
.w.w-game.tw-card .cine-icon-node .cine-tooltip {\r
      position: absolute;\r
      bottom: calc(100% + 8px);\r
      left: 50%;\r
      transform: translateX(-50%) translateY(4px);\r
      padding: 4px 8px;\r
      border-radius: 6px;\r
      background: #f5f3ef;\r
      color: #141413;\r
      font-family: 'JetBrains Mono', monospace;\r
      font-size: 10px;\r
      font-weight: 700;\r
      white-space: nowrap;\r
      opacity: 0;\r
      pointer-events: none;\r
      transition: all 0.16s ease;\r
      box-shadow: 0 6px 16px rgba(0,0,0,0.4);\r
    }\r
.w.w-game.tw-card .cine-icon-node:hover .cine-tooltip {\r
      opacity: 1;\r
      transform: translateX(-50%) translateY(0);\r
    }\r
.w.w-game.tw-card .gauge-ring { transition: stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1); }\r
.w.w-game.tw-card .dmg-shell {\r
      background: #c7c4b8;\r
      border-radius: 16px 16px 42px 16px;\r
      border: 3px solid #2b2b27;\r
      box-shadow: inset -4px -4px 0 #9f9b8c, 6px 6px 0 #0c0c0b;\r
      color: #0f380f;\r
    }\r
.w.w-game.tw-card .dmg-bezel {\r
      background: #54565b;\r
      border-radius: 10px 10px 28px 10px;\r
      border: 2px solid #2b2b27;\r
    }\r
.w.w-game.tw-card .dmg-lcd {\r
      background-color: #9bbc0f;\r
      background-image:\r
        linear-gradient(rgba(15, 56, 15, 0.08) 1px, transparent 1px),\r
        linear-gradient(90deg, rgba(15, 56, 15, 0.08) 1px, transparent 1px);\r
      background-size: 4px 4px;\r
      border: 3px solid #0f380f;\r
      box-shadow: inset 3px 3px 8px rgba(15, 56, 15, 0.35);\r
      color: #0f380f;\r
    }\r
.w.w-game.tw-card .crt-box {\r
      position: relative;\r
      background: #050a06;\r
      border: 1px solid #1f4d2b;\r
      box-shadow: 0 0 30px rgba(34, 197, 94, 0.08), inset 0 0 24px rgba(0, 0, 0, 0.9);\r
      overflow: hidden;\r
    }\r
.w.w-game.tw-card .crt-box::after {\r
      content: '';\r
      position: absolute;\r
      inset: 0;\r
      background: repeating-linear-gradient(\r
        0deg,\r
        rgba(0, 0, 0, 0.18),\r
        rgba(0, 0, 0, 0.18) 1px,\r
        transparent 1px,\r
        transparent 3px\r
      );\r
      pointer-events: none;\r
    }\r
.w.w-game.tw-card .metal-plate {\r
      background: linear-gradient(145deg, #27292e 0%, #1a1c20 50%, #222429 100%);\r
      border: 1px solid #3d414a;\r
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 18px 35px rgba(0,0,0,0.6);\r
    }\r
.w.w-game.tw-card .arcade-hazard {\r
      background: repeating-linear-gradient(\r
        -45deg,\r
        #facc15,\r
        #facc15 10px,\r
        #18181b 10px,\r
        #18181b 20px\r
      );\r
    }\r
.w.w-game.tw-card .blueprint-bg {\r
      background-color: #0c3559;\r
      background-image:\r
        linear-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px),\r
        linear-gradient(90deg, rgba(255, 255, 255, 0.12) 1px, transparent 1px),\r
        linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),\r
        linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);\r
      background-size: 50px 50px, 50px 50px, 10px 10px, 10px 10px;\r
    }\r
.w.w-game.tw-card .comic-dots {\r
      background-color: #fef9c3;\r
      background-image: radial-gradient(#eab308 1px, transparent 1px);\r
      background-size: 8px 8px;\r
    }\r
.w.w-game.tw-card .win95-box {\r
      background: #c0c0c0;\r
      border-top: 2px solid #ffffff;\r
      border-left: 2px solid #ffffff;\r
      border-right: 2px solid #404040;\r
      border-bottom: 2px solid #404040;\r
      box-shadow: 4px 4px 0 #000000;\r
      color: #000000;\r
    }\r
.w.w-game.tw-card .win95-inset {\r
      background: #ffffff;\r
      border-top: 2px solid #808080;\r
      border-left: 2px solid #808080;\r
      border-right: 2px solid #dfdfdf;\r
      border-bottom: 2px solid #dfdfdf;\r
    }\r
.w.w-game.tw-card .flap-tile {\r
      position: relative;\r
      background: #18181b;\r
      border: 1px solid #3f3f46;\r
      border-radius: 4px;\r
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);\r
    }\r
.w.w-game.tw-card .flap-tile::after {\r
      content: '';\r
      position: absolute;\r
      left: 0; right: 0; top: 50%;\r
      height: 1px;\r
      background: rgba(0,0,0,0.7);\r
    }\r
.w.w-game.tw-card .ribbon-clip {\r
      clip-path: polygon(0 0, 100% 0, 96% 50%, 100% 100%, 0 100%);\r
    }\r
.w.w-game.tw-card .tcg-foil {\r
      background: linear-gradient(135deg, #d4af37 0%, #fef08a 30%, #ca8a04 60%, #fde047 100%);\r
    }\r
.w.w-game.tw-card .scifi-chamfer {\r
      clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px);\r
    }\r
.w.w-game.tw-card .receipt-edge {\r
      background-image: linear-gradient(135deg, #fafaf9 50%, transparent 50%), linear-gradient(225deg, #fafaf9 50%, transparent 50%);\r
      background-position: bottom left;\r
      background-size: 12px 12px;\r
      background-repeat: repeat-x;\r
    }\r
.w.w-game.tw-card, .w.w-game.tw-card *, .w.w-game.tw-card ::before, .w.w-game.tw-card ::after{--tw-border-spacing-x:0;--tw-border-spacing-y:0;--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;--tw-skew-x:0;--tw-skew-y:0;--tw-scale-x:1;--tw-scale-y:1;--tw-pan-x: ;--tw-pan-y: ;--tw-pinch-zoom: ;--tw-scroll-snap-strictness:proximity;--tw-gradient-from-position: ;--tw-gradient-via-position: ;--tw-gradient-to-position: ;--tw-ordinal: ;--tw-slashed-zero: ;--tw-numeric-figure: ;--tw-numeric-spacing: ;--tw-numeric-fraction: ;--tw-ring-inset: ;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-color:rgb(59 130 246 / 0.5);--tw-ring-offset-shadow:0 0 #0000;--tw-ring-shadow:0 0 #0000;--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000;--tw-blur: ;--tw-brightness: ;--tw-contrast: ;--tw-grayscale: ;--tw-hue-rotate: ;--tw-invert: ;--tw-saturate: ;--tw-sepia: ;--tw-drop-shadow: ;--tw-backdrop-blur: ;--tw-backdrop-brightness: ;--tw-backdrop-contrast: ;--tw-backdrop-grayscale: ;--tw-backdrop-hue-rotate: ;--tw-backdrop-invert: ;--tw-backdrop-opacity: ;--tw-backdrop-saturate: ;--tw-backdrop-sepia: ;--tw-contain-size: ;--tw-contain-layout: ;--tw-contain-paint: ;--tw-contain-style: }\r
.w.w-game.tw-card .pointer-events-none {pointer-events:none}\r
.w.w-game.tw-card .fixed {position:fixed}\r
.w.w-game.tw-card .absolute {position:absolute}\r
.w.w-game.tw-card .relative {position:relative}\r
.w.w-game.tw-card .sticky {position:sticky}\r
.w.w-game.tw-card .inset-0 {inset:0px}\r
.w.w-game.tw-card .bottom-5 {bottom:1.25rem}\r
.w.w-game.tw-card .right-5 {right:1.25rem}\r
.w.w-game.tw-card .top-0 {top:0px}\r
.w.w-game.tw-card .z-10 {z-index:10}\r
.w.w-game.tw-card .z-40 {z-index:40}\r
.w.w-game.tw-card .z-50 {z-index:50}\r
.w.w-game.tw-card .mx-auto {margin-left:auto;margin-right:auto}\r
.w.w-game.tw-card .mb-1 {margin-bottom:0.25rem}\r
.w.w-game.tw-card .mb-3 {margin-bottom:0.75rem}\r
.w.w-game.tw-card .mb-4 {margin-bottom:1rem}\r
.w.w-game.tw-card .mr-1 {margin-right:0.25rem}\r
.w.w-game.tw-card .mt-0\\.5 {margin-top:0.125rem}\r
.w.w-game.tw-card .mt-1 {margin-top:0.25rem}\r
.w.w-game.tw-card .mt-1\\.5 {margin-top:0.375rem}\r
.w.w-game.tw-card .mt-2 {margin-top:0.5rem}\r
.w.w-game.tw-card .block {display:block}\r
.w.w-game.tw-card .flex {display:flex}\r
.w.w-game.tw-card .inline-flex {display:inline-flex}\r
.w.w-game.tw-card .grid {display:grid}\r
.w.w-game.tw-card .hidden {display:none}\r
.w.w-game.tw-card .aspect-\\[3\\/4\\] {aspect-ratio:3/4}\r
.w.w-game.tw-card .h-1\\.5 {height:0.375rem}\r
.w.w-game.tw-card .h-12 {height:3rem}\r
.w.w-game.tw-card .h-14 {height:3.5rem}\r
.w.w-game.tw-card .h-28 {height:7rem}\r
.w.w-game.tw-card .h-3\\.5 {height:0.875rem}\r
.w.w-game.tw-card .h-32 {height:8rem}\r
.w.w-game.tw-card .h-9 {height:2.25rem}\r
.w.w-game.tw-card .h-2 {height:0.5rem}\r
.w.w-game.tw-card .h-24 {height:6rem}\r
.w.w-game.tw-card .h-full {height:100%}\r
.w.w-game.tw-card .min-h-screen {min-height:100vh}\r
.w.w-game.tw-card .w-10 {width:2.5rem}\r
.w.w-game.tw-card .w-12 {width:3rem}\r
.w.w-game.tw-card .w-14 {width:3.5rem}\r
.w.w-game.tw-card .w-16 {width:4rem}\r
.w.w-game.tw-card .w-20 {width:5rem}\r
.w.w-game.tw-card .w-32 {width:8rem}\r
.w.w-game.tw-card .w-44 {width:11rem}\r
.w.w-game.tw-card .w-9 {width:2.25rem}\r
.w.w-game.tw-card .w-full {width:100%}\r
.w.w-game.tw-card .w-2 {width:0.5rem}\r
.w.w-game.tw-card .w-4 {width:1rem}\r
.w.w-game.tw-card .min-w-0 {min-width:0px}\r
.w.w-game.tw-card .max-w-5xl {max-width:64rem}\r
.w.w-game.tw-card .flex-1 {flex:1 1 0%}\r
.w.w-game.tw-card .shrink-0 {flex-shrink:0}\r
.w.w-game.tw-card .translate-y-20 {--tw-translate-y:5rem;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .-rotate-90 {--tw-rotate:-90deg;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .transform {transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .scroll-mt-28 {scroll-margin-top:7rem}\r
.w.w-game.tw-card .grid-cols-1 {grid-template-columns:repeat(1, minmax(0, 1fr))}\r
.w.w-game.tw-card .grid-cols-2 {grid-template-columns:repeat(2, minmax(0, 1fr))}\r
.w.w-game.tw-card .grid-cols-3 {grid-template-columns:repeat(3, minmax(0, 1fr))}\r
.w.w-game.tw-card .grid-cols-6 {grid-template-columns:repeat(6, minmax(0, 1fr))}\r
.w.w-game.tw-card .flex-col {flex-direction:column}\r
.w.w-game.tw-card .flex-wrap {flex-wrap:wrap}\r
.w.w-game.tw-card .items-start {align-items:flex-start}\r
.w.w-game.tw-card .items-end {align-items:flex-end}\r
.w.w-game.tw-card .items-center {align-items:center}\r
.w.w-game.tw-card .items-stretch {align-items:stretch}\r
.w.w-game.tw-card .justify-end {justify-content:flex-end}\r
.w.w-game.tw-card .justify-center {justify-content:center}\r
.w.w-game.tw-card .justify-between {justify-content:space-between}\r
.w.w-game.tw-card .gap-0\\.5 {gap:0.125rem}\r
.w.w-game.tw-card .gap-1 {gap:0.25rem}\r
.w.w-game.tw-card .gap-1\\.5 {gap:0.375rem}\r
.w.w-game.tw-card .gap-2 {gap:0.5rem}\r
.w.w-game.tw-card .gap-2\\.5 {gap:0.625rem}\r
.w.w-game.tw-card .gap-3 {gap:0.75rem}\r
.w.w-game.tw-card .gap-3\\.5 {gap:0.875rem}\r
.w.w-game.tw-card .gap-4 {gap:1rem}\r
.w.w-game.tw-card .gap-5 {gap:1.25rem}\r
.w.w-game.tw-card .gap-6 {gap:1.5rem}\r
.w.w-game.tw-card .gap-x-4 {column-gap:1rem}\r
.w.w-game.tw-card .gap-x-5 {column-gap:1.25rem}\r
.w.w-game.tw-card .gap-y-1 {row-gap:0.25rem}\r
.w.w-game.tw-card .gap-y-1\\.5 {row-gap:0.375rem}\r
.w.w-game.tw-card .gap-y-2\\.5 {row-gap:0.625rem}\r
.w.w-game.tw-card .space-y-1\\.5 > :not([hidden]) ~ :not([hidden]) {--tw-space-y-reverse:0;margin-top:calc(0.375rem * calc(1 - var(--tw-space-y-reverse)));margin-bottom:calc(0.375rem * var(--tw-space-y-reverse))}\r
.w.w-game.tw-card .space-y-11 > :not([hidden]) ~ :not([hidden]) {--tw-space-y-reverse:0;margin-top:calc(2.75rem * calc(1 - var(--tw-space-y-reverse)));margin-bottom:calc(2.75rem * var(--tw-space-y-reverse))}\r
.w.w-game.tw-card .space-y-2 > :not([hidden]) ~ :not([hidden]) {--tw-space-y-reverse:0;margin-top:calc(0.5rem * calc(1 - var(--tw-space-y-reverse)));margin-bottom:calc(0.5rem * var(--tw-space-y-reverse))}\r
.w.w-game.tw-card .space-y-2\\.5 > :not([hidden]) ~ :not([hidden]) {--tw-space-y-reverse:0;margin-top:calc(0.625rem * calc(1 - var(--tw-space-y-reverse)));margin-bottom:calc(0.625rem * var(--tw-space-y-reverse))}\r
.w.w-game.tw-card .space-y-3 > :not([hidden]) ~ :not([hidden]) {--tw-space-y-reverse:0;margin-top:calc(0.75rem * calc(1 - var(--tw-space-y-reverse)));margin-bottom:calc(0.75rem * var(--tw-space-y-reverse))}\r
.w.w-game.tw-card .space-y-4 > :not([hidden]) ~ :not([hidden]) {--tw-space-y-reverse:0;margin-top:calc(1rem * calc(1 - var(--tw-space-y-reverse)));margin-bottom:calc(1rem * var(--tw-space-y-reverse))}\r
.w.w-game.tw-card .space-y-5 > :not([hidden]) ~ :not([hidden]) {--tw-space-y-reverse:0;margin-top:calc(1.25rem * calc(1 - var(--tw-space-y-reverse)));margin-bottom:calc(1.25rem * var(--tw-space-y-reverse))}\r
.w.w-game.tw-card .self-start {align-self:flex-start}\r
.w.w-game.tw-card .overflow-hidden {overflow:hidden}\r
.w.w-game.tw-card .overflow-visible {overflow:visible}\r
.w.w-game.tw-card .overflow-x-auto {overflow-x:auto}\r
.w.w-game.tw-card .truncate {overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\r
.w.w-game.tw-card .rounded {border-radius:0.25rem}\r
.w.w-game.tw-card .rounded-2xl {border-radius:1rem}\r
.w.w-game.tw-card .rounded-full {border-radius:9999px}\r
.w.w-game.tw-card .rounded-lg {border-radius:0.5rem}\r
.w.w-game.tw-card .rounded-xl {border-radius:0.75rem}\r
.w.w-game.tw-card .border {border-width:1px}\r
.w.w-game.tw-card .border-2 {border-width:2px}\r
.w.w-game.tw-card .border-4 {border-width:4px}\r
.w.w-game.tw-card .border-b {border-bottom-width:1px}\r
.w.w-game.tw-card .border-b-2 {border-bottom-width:2px}\r
.w.w-game.tw-card .border-t {border-top-width:1px}\r
.w.w-game.tw-card .border-t-2 {border-top-width:2px}\r
.w.w-game.tw-card .border-\\[\\#141413\\] {--tw-border-opacity:1;border-color:rgb(20 20 19 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-black {--tw-border-opacity:1;border-color:rgb(0 0 0 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-emerald-500\\/30 {border-color:rgb(16 185 129 / 0.3)}\r
.w.w-game.tw-card .border-green-700 {--tw-border-opacity:1;border-color:rgb(21 128 61 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-orange-500\\/30 {border-color:rgb(249 115 22 / 0.3)}\r
.w.w-game.tw-card .border-purple-500\\/30 {border-color:rgb(168 85 247 / 0.3)}\r
.w.w-game.tw-card .border-rose-500\\/30 {border-color:rgb(244 63 94 / 0.3)}\r
.w.w-game.tw-card .border-sky-500\\/30 {border-color:rgb(14 165 233 / 0.3)}\r
.w.w-game.tw-card .border-slate-500\\/30 {border-color:rgb(100 116 139 / 0.3)}\r
.w.w-game.tw-card .border-white\\/10 {border-color:rgb(255 255 255 / 0.1)}\r
.w.w-game.tw-card .border-white\\/15 {border-color:rgb(255 255 255 / 0.15)}\r
.w.w-game.tw-card .border-white\\/5 {border-color:rgb(255 255 255 / 0.05)}\r
.w.w-game.tw-card .border-yellow-500\\/30 {border-color:rgb(234 179 8 / 0.3)}\r
.w.w-game.tw-card .border-zinc-700 {--tw-border-opacity:1;border-color:rgb(63 63 70 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-zinc-700\\/80 {border-color:rgb(63 63 70 / 0.8)}\r
.w.w-game.tw-card .border-zinc-800 {--tw-border-opacity:1;border-color:rgb(39 39 42 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-zinc-800\\/80 {border-color:rgb(39 39 42 / 0.8)}\r
.w.w-game.tw-card .border-neutral-300 {--tw-border-opacity:1;border-color:rgb(212 212 212 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-white\\/20 {border-color:rgb(255 255 255 / 0.2)}\r
.w.w-game.tw-card .border-white\\/40 {border-color:rgb(255 255 255 / 0.4)}\r
.w.w-game.tw-card .bg-\\[\\#0d0e10\\] {--tw-bg-opacity:1;background-color:rgb(13 14 16 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#0e1015\\] {--tw-bg-opacity:1;background-color:rgb(14 16 21 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#101114\\] {--tw-bg-opacity:1;background-color:rgb(16 17 20 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#101115\\] {--tw-bg-opacity:1;background-color:rgb(16 17 21 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#111216\\] {--tw-bg-opacity:1;background-color:rgb(17 18 22 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#111318\\] {--tw-bg-opacity:1;background-color:rgb(17 19 24 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#121316\\]\\/95 {background-color:rgb(18 19 22 / 0.95)}\r
.w.w-game.tw-card .bg-\\[\\#12131a\\] {--tw-bg-opacity:1;background-color:rgb(18 19 26 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#141413\\] {--tw-bg-opacity:1;background-color:rgb(20 20 19 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#141519\\] {--tw-bg-opacity:1;background-color:rgb(20 21 25 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#18191d\\] {--tw-bg-opacity:1;background-color:rgb(24 25 29 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#191b20\\] {--tw-bg-opacity:1;background-color:rgb(25 27 32 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#f4f0e6\\] {--tw-bg-opacity:1;background-color:rgb(244 240 230 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-amber-400 {--tw-bg-opacity:1;background-color:rgb(251 191 36 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-black {--tw-bg-opacity:1;background-color:rgb(0 0 0 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-black\\/40 {background-color:rgb(0 0 0 / 0.4)}\r
.w.w-game.tw-card .bg-cyan-500 {--tw-bg-opacity:1;background-color:rgb(6 182 212 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-emerald-400 {--tw-bg-opacity:1;background-color:rgb(52 211 153 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-emerald-500 {--tw-bg-opacity:1;background-color:rgb(16 185 129 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-emerald-500\\/15 {background-color:rgb(16 185 129 / 0.15)}\r
.w.w-game.tw-card .bg-green-950 {--tw-bg-opacity:1;background-color:rgb(5 46 22 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-neutral-100 {--tw-bg-opacity:1;background-color:rgb(245 245 245 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-orange-500 {--tw-bg-opacity:1;background-color:rgb(249 115 22 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-orange-500\\/15 {background-color:rgb(249 115 22 / 0.15)}\r
.w.w-game.tw-card .bg-purple-500 {--tw-bg-opacity:1;background-color:rgb(168 85 247 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-rose-500 {--tw-bg-opacity:1;background-color:rgb(244 63 94 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-sky-500 {--tw-bg-opacity:1;background-color:rgb(14 165 233 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-transparent {background-color:transparent}\r
.w.w-game.tw-card .bg-white {--tw-bg-opacity:1;background-color:rgb(255 255 255 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-white\\/10 {background-color:rgb(255 255 255 / 0.1)}\r
.w.w-game.tw-card .bg-white\\/\\[0\\.04\\] {background-color:rgb(255 255 255 / 0.04)}\r
.w.w-game.tw-card .bg-zinc-100 {--tw-bg-opacity:1;background-color:rgb(244 244 245 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-zinc-800 {--tw-bg-opacity:1;background-color:rgb(39 39 42 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-zinc-800\\/70 {background-color:rgb(39 39 42 / 0.7)}\r
.w.w-game.tw-card .bg-zinc-900 {--tw-bg-opacity:1;background-color:rgb(24 24 27 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-black\\/45 {background-color:rgb(0 0 0 / 0.45)}\r
.w.w-game.tw-card .bg-white\\/15 {background-color:rgb(255 255 255 / 0.15)}\r
.w.w-game.tw-card .bg-white\\/\\[0\\.02\\] {background-color:rgb(255 255 255 / 0.02)}\r
.w.w-game.tw-card .bg-white\\/\\[0\\.03\\] {background-color:rgb(255 255 255 / 0.03)}\r
.w.w-game.tw-card .bg-white\\/\\[0\\.06\\] {background-color:rgb(255 255 255 / 0.06)}\r
.w.w-game.tw-card .bg-zinc-800\\/90 {background-color:rgb(39 39 42 / 0.9)}\r
.w.w-game.tw-card .bg-gradient-to-br {background-image:linear-gradient(to bottom right, var(--tw-gradient-stops))}\r
.w.w-game.tw-card .bg-gradient-to-t {background-image:linear-gradient(to top, var(--tw-gradient-stops))}\r
.w.w-game.tw-card .from-amber-400 {--tw-gradient-from:#fbbf24 var(--tw-gradient-from-position);--tw-gradient-to:rgb(251 191 36 / 0) var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from), var(--tw-gradient-to)}\r
.w.w-game.tw-card .from-black {--tw-gradient-from:#000 var(--tw-gradient-from-position);--tw-gradient-to:rgb(0 0 0 / 0) var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from), var(--tw-gradient-to)}\r
.w.w-game.tw-card .via-black\\/70 {--tw-gradient-to:rgb(0 0 0 / 0)  var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from), rgb(0 0 0 / 0.7) var(--tw-gradient-via-position), var(--tw-gradient-to)}\r
.w.w-game.tw-card .to-black\\/30 {--tw-gradient-to:rgb(0 0 0 / 0.3) var(--tw-gradient-to-position)}\r
.w.w-game.tw-card .to-orange-500 {--tw-gradient-to:#f97316 var(--tw-gradient-to-position)}\r
.w.w-game.tw-card .object-cover {object-fit:cover}\r
.w.w-game.tw-card .p-0\\.5 {padding:0.125rem}\r
.w.w-game.tw-card .p-2\\.5 {padding:0.625rem}\r
.w.w-game.tw-card .p-3 {padding:0.75rem}\r
.w.w-game.tw-card .p-4 {padding:1rem}\r
.w.w-game.tw-card .p-5 {padding:1.25rem}\r
.w.w-game.tw-card .p-1\\.5 {padding:0.375rem}\r
.w.w-game.tw-card .p-2 {padding:0.5rem}\r
.w.w-game.tw-card .p-3\\.5 {padding:0.875rem}\r
.w.w-game.tw-card .px-2 {padding-left:0.5rem;padding-right:0.5rem}\r
.w.w-game.tw-card .px-2\\.5 {padding-left:0.625rem;padding-right:0.625rem}\r
.w.w-game.tw-card .px-3 {padding-left:0.75rem;padding-right:0.75rem}\r
.w.w-game.tw-card .px-3\\.5 {padding-left:0.875rem;padding-right:0.875rem}\r
.w.w-game.tw-card .px-4 {padding-left:1rem;padding-right:1rem}\r
.w.w-game.tw-card .px-5 {padding-left:1.25rem;padding-right:1.25rem}\r
.w.w-game.tw-card .py-0\\.5 {padding-top:0.125rem;padding-bottom:0.125rem}\r
.w.w-game.tw-card .py-1 {padding-top:0.25rem;padding-bottom:0.25rem}\r
.w.w-game.tw-card .py-1\\.5 {padding-top:0.375rem;padding-bottom:0.375rem}\r
.w.w-game.tw-card .py-2 {padding-top:0.5rem;padding-bottom:0.5rem}\r
.w.w-game.tw-card .py-2\\.5 {padding-top:0.625rem;padding-bottom:0.625rem}\r
.w.w-game.tw-card .py-3 {padding-top:0.75rem;padding-bottom:0.75rem}\r
.w.w-game.tw-card .pb-2 {padding-bottom:0.5rem}\r
.w.w-game.tw-card .pb-20 {padding-bottom:5rem}\r
.w.w-game.tw-card .pt-1 {padding-top:0.25rem}\r
.w.w-game.tw-card .pt-2 {padding-top:0.5rem}\r
.w.w-game.tw-card .pt-3 {padding-top:0.75rem}\r
.w.w-game.tw-card .pt-7 {padding-top:1.75rem}\r
.w.w-game.tw-card .pb-1 {padding-bottom:0.25rem}\r
.w.w-game.tw-card .text-center {text-align:center}\r
.w.w-game.tw-card .text-right {text-align:right}\r
.w.w-game.tw-card .text-2xl {font-size:1.5rem;line-height:2rem}\r
.w.w-game.tw-card .text-3xl {font-size:1.875rem;line-height:2.25rem}\r
.w.w-game.tw-card .text-\\[10px\\] {font-size:10px}\r
.w.w-game.tw-card .text-\\[11px\\] {font-size:11px}\r
.w.w-game.tw-card .text-\\[9px\\] {font-size:9px}\r
.w.w-game.tw-card .text-base {font-size:1rem;line-height:1.5rem}\r
.w.w-game.tw-card .text-lg {font-size:1.125rem;line-height:1.75rem}\r
.w.w-game.tw-card .text-sm {font-size:0.875rem;line-height:1.25rem}\r
.w.w-game.tw-card .text-xl {font-size:1.25rem;line-height:1.75rem}\r
.w.w-game.tw-card .text-xs {font-size:0.75rem;line-height:1rem}\r
.w.w-game.tw-card .font-bold {font-weight:700}\r
.w.w-game.tw-card .font-extrabold {font-weight:800}\r
.w.w-game.tw-card .font-semibold {font-weight:600}\r
.w.w-game.tw-card .uppercase {text-transform:uppercase}\r
.w.w-game.tw-card .leading-none {line-height:1}\r
.w.w-game.tw-card .leading-relaxed {line-height:1.625}\r
.w.w-game.tw-card .leading-tight {line-height:1.25}\r
.w.w-game.tw-card .tracking-tight {letter-spacing:-0.025em}\r
.w.w-game.tw-card .tracking-tighter {letter-spacing:-0.05em}\r
.w.w-game.tw-card .tracking-wider {letter-spacing:0.05em}\r
.w.w-game.tw-card .tracking-widest {letter-spacing:0.1em}\r
.w.w-game.tw-card .text-\\[\\#141413\\] {--tw-text-opacity:1;color:rgb(20 20 19 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#c8f904\\] {--tw-text-opacity:1;color:rgb(200 249 4 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#f4f0e6\\] {--tw-text-opacity:1;color:rgb(244 240 230 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-amber-300 {--tw-text-opacity:1;color:rgb(252 211 77 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-black {--tw-text-opacity:1;color:rgb(0 0 0 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-cyan-300 {--tw-text-opacity:1;color:rgb(103 232 249 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-emerald-300 {--tw-text-opacity:1;color:rgb(110 231 183 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-emerald-400 {--tw-text-opacity:1;color:rgb(52 211 153 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-green-400 {--tw-text-opacity:1;color:rgb(74 222 128 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-neutral-500 {--tw-text-opacity:1;color:rgb(115 115 115 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-orange-300 {--tw-text-opacity:1;color:rgb(253 186 116 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-orange-400 {--tw-text-opacity:1;color:rgb(251 146 60 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-orange-600 {--tw-text-opacity:1;color:rgb(234 88 12 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-purple-300 {--tw-text-opacity:1;color:rgb(216 180 254 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-purple-400 {--tw-text-opacity:1;color:rgb(192 132 252 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-rose-300 {--tw-text-opacity:1;color:rgb(253 164 175 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-rose-400 {--tw-text-opacity:1;color:rgb(251 113 133 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-sky-300 {--tw-text-opacity:1;color:rgb(125 211 252 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-sky-400 {--tw-text-opacity:1;color:rgb(56 189 248 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-slate-400 {--tw-text-opacity:1;color:rgb(148 163 184 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-stone-200 {--tw-text-opacity:1;color:rgb(231 229 228 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-stone-600 {--tw-text-opacity:1;color:rgb(87 83 78 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-white {--tw-text-opacity:1;color:rgb(255 255 255 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-yellow-400 {--tw-text-opacity:1;color:rgb(250 204 21 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-zinc-200 {--tw-text-opacity:1;color:rgb(228 228 231 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-zinc-300 {--tw-text-opacity:1;color:rgb(212 212 216 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-zinc-400 {--tw-text-opacity:1;color:rgb(161 161 170 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-zinc-500 {--tw-text-opacity:1;color:rgb(113 113 122 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-zinc-950 {--tw-text-opacity:1;color:rgb(9 9 11 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-neutral-700 {--tw-text-opacity:1;color:rgb(64 64 64 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .underline {-webkit-text-decoration-line:underline;text-decoration-line:underline}\r
.w.w-game.tw-card .underline-offset-4 {text-underline-offset:4px}\r
.w.w-game.tw-card .opacity-0 {opacity:0}\r
.w.w-game.tw-card .opacity-65 {opacity:0.65}\r
.w.w-game.tw-card .shadow {--tw-shadow:0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);--tw-shadow-colored:0 1px 3px 0 var(--tw-shadow-color), 0 1px 2px -1px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .shadow-\\[3px_3px_0_\\#141413\\] {--tw-shadow:3px 3px 0 #141413;--tw-shadow-colored:3px 3px 0 var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .shadow-\\[6px_6px_0_\\#000\\] {--tw-shadow:6px 6px 0 #000;--tw-shadow-colored:6px 6px 0 var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .shadow-xl {--tw-shadow:0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);--tw-shadow-colored:0 20px 25px -5px var(--tw-shadow-color), 0 8px 10px -6px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .ring-1 {--tw-ring-offset-shadow:var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color);--tw-ring-shadow:var(--tw-ring-inset) 0 0 0 calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color);box-shadow:var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000)}\r
.w.w-game.tw-card .ring-2 {--tw-ring-offset-shadow:var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color);--tw-ring-shadow:var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color);box-shadow:var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000)}\r
.w.w-game.tw-card .ring-white\\/15 {--tw-ring-color:rgb(255 255 255 / 0.15)}\r
.w.w-game.tw-card .ring-white\\/25 {--tw-ring-color:rgb(255 255 255 / 0.25)}\r
.w.w-game.tw-card .backdrop-blur-md {--tw-backdrop-blur:blur(12px);-webkit-backdrop-filter:var(--tw-backdrop-blur) var(--tw-backdrop-brightness) var(--tw-backdrop-contrast) var(--tw-backdrop-grayscale) var(--tw-backdrop-hue-rotate) var(--tw-backdrop-invert) var(--tw-backdrop-opacity) var(--tw-backdrop-saturate) var(--tw-backdrop-sepia);backdrop-filter:var(--tw-backdrop-blur) var(--tw-backdrop-brightness) var(--tw-backdrop-contrast) var(--tw-backdrop-grayscale) var(--tw-backdrop-hue-rotate) var(--tw-backdrop-invert) var(--tw-backdrop-opacity) var(--tw-backdrop-saturate) var(--tw-backdrop-sepia)}\r
.w.w-game.tw-card .transition {transition-property:color, background-color, border-color, fill, stroke, opacity, box-shadow, transform, filter, -webkit-text-decoration-color, -webkit-backdrop-filter;transition-property:color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter;transition-property:color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter, -webkit-text-decoration-color, -webkit-backdrop-filter;transition-timing-function:cubic-bezier(0.4, 0, 0.2, 1);transition-duration:150ms}\r
.w.w-game.tw-card .transition-all {transition-property:all;transition-timing-function:cubic-bezier(0.4, 0, 0.2, 1);transition-duration:150ms}\r
.w.w-game.tw-card .duration-300 {transition-duration:300ms}\r
.w.w-game.tw-card .first\\:rounded-l-full:first-child {border-top-left-radius:9999px;border-bottom-left-radius:9999px}\r
.w.w-game.tw-card .last\\:rounded-r-full:last-child {border-top-right-radius:9999px;border-bottom-right-radius:9999px}\r
.w.w-game.tw-card .hover\\:bg-amber-300:hover {--tw-bg-opacity:1;background-color:rgb(252 211 77 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .hover\\:bg-emerald-400:hover {--tw-bg-opacity:1;background-color:rgb(52 211 153 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .hover\\:bg-emerald-500\\/25:hover {background-color:rgb(16 185 129 / 0.25)}\r
.w.w-game.tw-card .hover\\:bg-white:hover {--tw-bg-opacity:1;background-color:rgb(255 255 255 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .hover\\:bg-white\\/20:hover {background-color:rgb(255 255 255 / 0.2)}\r
.w.w-game.tw-card .hover\\:bg-zinc-700:hover {--tw-bg-opacity:1;background-color:rgb(63 63 70 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .hover\\:bg-zinc-800:hover {--tw-bg-opacity:1;background-color:rgb(39 39 42 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .hover\\:text-orange-600:hover {--tw-text-opacity:1;color:rgb(234 88 12 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .hover\\:underline:hover {-webkit-text-decoration-line:underline;text-decoration-line:underline}\r
.w.w-game.tw-card .focus\\:border-amber-400:focus {--tw-border-opacity:1;border-color:rgb(251 191 36 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .focus\\:outline-none:focus {outline:2px solid transparent;outline-offset:2px}\r
@media (min-width: 640px) {\r
.w.w-game.tw-card .sm\\:block {display:block}\r
.w.w-game.tw-card .sm\\:inline {display:inline}\r
.w.w-game.tw-card .sm\\:w-56 {width:14rem}\r
.w.w-game.tw-card .sm\\:w-auto {width:auto}\r
.w.w-game.tw-card .sm\\:w-5 {width:1.25rem}\r
.w.w-game.tw-card .sm\\:grid-cols-3 {grid-template-columns:repeat(3, minmax(0, 1fr))}\r
.w.w-game.tw-card .sm\\:grid-cols-6 {grid-template-columns:repeat(6, minmax(0, 1fr))}\r
.w.w-game.tw-card .sm\\:flex-row {flex-direction:row}\r
.w.w-game.tw-card .sm\\:items-center {align-items:center}\r
.w.w-game.tw-card .sm\\:gap-3 {gap:0.75rem}\r
.w.w-game.tw-card .sm\\:self-center {align-self:center}\r
.w.w-game.tw-card .sm\\:p-5 {padding:1.25rem}\r
.w.w-game.tw-card .sm\\:p-6 {padding:1.5rem}\r
.w.w-game.tw-card .sm\\:px-6 {padding-left:1.5rem;padding-right:1.5rem}\r
.w.w-game.tw-card .sm\\:text-3xl {font-size:1.875rem;line-height:2.25rem}\r
.w.w-game.tw-card .sm\\:text-base {font-size:1rem;line-height:1.5rem}\r
.w.w-game.tw-card .sm\\:text-lg {font-size:1.125rem;line-height:1.75rem}\r
}\r
@media (min-width: 768px) {\r
.w.w-game.tw-card .md\\:col-span-6 {grid-column:span 6 / span 6}\r
.w.w-game.tw-card .md\\:w-64 {width:16rem}\r
.w.w-game.tw-card .md\\:w-auto {width:auto}\r
.w.w-game.tw-card .md\\:grid-cols-12 {grid-template-columns:repeat(12, minmax(0, 1fr))}\r
.w.w-game.tw-card .md\\:grid-cols-6 {grid-template-columns:repeat(6, minmax(0, 1fr))}\r
.w.w-game.tw-card .md\\:flex-row {flex-direction:row}\r
.w.w-game.tw-card .md\\:border-b-0 {border-bottom-width:0px}\r
.w.w-game.tw-card .md\\:border-l {border-left-width:1px}\r
.w.w-game.tw-card .md\\:border-r-2 {border-right-width:2px}\r
.w.w-game.tw-card .md\\:border-t-0 {border-top-width:0px}\r
.w.w-game.tw-card .md\\:pl-6 {padding-left:1.5rem}\r
.w.w-game.tw-card .-bottom-2 {bottom:-0.5rem}\r
.w.w-game.tw-card .-right-2 {right:-0.5rem}\r
.w.w-game.tw-card .bottom-2\\.5 {bottom:0.625rem}\r
.w.w-game.tw-card .left-2\\.5 {left:0.625rem}\r
.w.w-game.tw-card .right-0 {right:0px}\r
.w.w-game.tw-card .right-2\\.5 {right:0.625rem}\r
.w.w-game.tw-card .top-2\\.5 {top:0.625rem}\r
.w.w-game.tw-card .col-span-2 {grid-column:span 2 / span 2}\r
.w.w-game.tw-card .col-span-3 {grid-column:span 3 / span 3}\r
.w.w-game.tw-card .my-0\\.5 {margin-top:0.125rem;margin-bottom:0.125rem}\r
.w.w-game.tw-card .my-1 {margin-top:0.25rem;margin-bottom:0.25rem}\r
.w.w-game.tw-card .my-2 {margin-top:0.5rem;margin-bottom:0.5rem}\r
.w.w-game.tw-card .my-auto {margin-top:auto;margin-bottom:auto}\r
.w.w-game.tw-card .-mb-5 {margin-bottom:-1.25rem}\r
.w.w-game.tw-card .mb-2 {margin-bottom:0.5rem}\r
.w.w-game.tw-card .mb-5 {margin-bottom:1.25rem}\r
.w.w-game.tw-card .ml-1 {margin-left:0.25rem}\r
.w.w-game.tw-card .mt-2\\.5 {margin-top:0.625rem}\r
.w.w-game.tw-card .mt-3 {margin-top:0.75rem}\r
.w.w-game.tw-card .mt-5 {margin-top:1.25rem}\r
.w.w-game.tw-card .inline-block {display:inline-block}\r
.w.w-game.tw-card .aspect-square {aspect-ratio:1 / 1}\r
.w.w-game.tw-card .h-10 {height:2.5rem}\r
.w.w-game.tw-card .h-16 {height:4rem}\r
.w.w-game.tw-card .h-2\\.5 {height:0.625rem}\r
.w.w-game.tw-card .h-3 {height:0.75rem}\r
.w.w-game.tw-card .h-4 {height:1rem}\r
.w.w-game.tw-card .h-8 {height:2rem}\r
.w.w-game.tw-card .min-h-\\[210px\\] {min-height:210px}\r
.w.w-game.tw-card .min-h-\\[250px\\] {min-height:250px}\r
.w.w-game.tw-card .w-11 {width:2.75rem}\r
.w.w-game.tw-card .w-2\\.5 {width:0.625rem}\r
.w.w-game.tw-card .w-24 {width:6rem}\r
.w.w-game.tw-card .w-28 {width:7rem}\r
.w.w-game.tw-card .w-8 {width:2rem}\r
.w.w-game.tw-card .w-px {width:1px}\r
.w.w-game.tw-card .max-w-xl {max-width:36rem}\r
.w.w-game.tw-card .translate-x-2 {--tw-translate-x:0.5rem;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .translate-y-2 {--tw-translate-y:0.5rem;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .-rotate-1 {--tw-rotate:-1deg;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .-rotate-12 {--tw-rotate:-12deg;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .-rotate-2 {--tw-rotate:-2deg;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .-rotate-3 {--tw-rotate:-3deg;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .rotate-1 {--tw-rotate:1deg;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .rotate-2 {--tw-rotate:2deg;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .-skew-x-12 {--tw-skew-x:-12deg;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .items-baseline {align-items:baseline}\r
.w.w-game.tw-card .gap-y-2 {row-gap:0.5rem}\r
.w.w-game.tw-card .space-y-0\\.5 > :not([hidden]) ~ :not([hidden]) {--tw-space-y-reverse:0;margin-top:calc(0.125rem * calc(1 - var(--tw-space-y-reverse)));margin-bottom:calc(0.125rem * var(--tw-space-y-reverse))}\r
.w.w-game.tw-card .space-y-1 > :not([hidden]) ~ :not([hidden]) {--tw-space-y-reverse:0;margin-top:calc(0.25rem * calc(1 - var(--tw-space-y-reverse)));margin-bottom:calc(0.25rem * var(--tw-space-y-reverse))}\r
.w.w-game.tw-card .space-y-12 > :not([hidden]) ~ :not([hidden]) {--tw-space-y-reverse:0;margin-top:calc(3rem * calc(1 - var(--tw-space-y-reverse)));margin-bottom:calc(3rem * var(--tw-space-y-reverse))}\r
.w.w-game.tw-card .whitespace-nowrap {white-space:nowrap}\r
.w.w-game.tw-card .rounded-3xl {border-radius:1.5rem}\r
.w.w-game.tw-card .rounded-md {border-radius:0.375rem}\r
.w.w-game.tw-card .rounded-sm {border-radius:0.125rem}\r
.w.w-game.tw-card .border-y {border-top-width:1px;border-bottom-width:1px}\r
.w.w-game.tw-card .border-l-4 {border-left-width:4px}\r
.w.w-game.tw-card .border-l-8 {border-left-width:8px}\r
.w.w-game.tw-card .border-r {border-right-width:1px}\r
.w.w-game.tw-card .border-dashed {border-style:dashed}\r
.w.w-game.tw-card .border-\\[\\#0f380f\\] {--tw-border-opacity:1;border-color:rgb(15 56 15 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-\\[\\#141413\\]\\/15 {border-color:rgb(20 20 19 / 0.15)}\r
.w.w-game.tw-card .border-\\[\\#1c1917\\] {--tw-border-opacity:1;border-color:rgb(28 25 23 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-\\[\\#1c1917\\]\\/15 {border-color:rgb(28 25 23 / 0.15)}\r
.w.w-game.tw-card .border-\\[\\#1c1917\\]\\/20 {border-color:rgb(28 25 23 / 0.2)}\r
.w.w-game.tw-card .border-\\[\\#b48b57\\] {--tw-border-opacity:1;border-color:rgb(180 139 87 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-\\[\\#b48b57\\]\\/60 {border-color:rgb(180 139 87 / 0.6)}\r
.w.w-game.tw-card .border-\\[\\#c5a35d\\] {--tw-border-opacity:1;border-color:rgb(197 163 93 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-\\[\\#c5a35d\\]\\/30 {border-color:rgb(197 163 93 / 0.3)}\r
.w.w-game.tw-card .border-\\[\\#c5a35d\\]\\/50 {border-color:rgb(197 163 93 / 0.5)}\r
.w.w-game.tw-card .border-\\[\\#d6cbb9\\] {--tw-border-opacity:1;border-color:rgb(214 203 185 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-\\[\\#d9a76a\\] {--tw-border-opacity:1;border-color:rgb(217 167 106 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-\\[\\#e5c98b\\]\\/40 {border-color:rgb(229 201 139 / 0.4)}\r
.w.w-game.tw-card .border-\\[\\#ff4f00\\] {--tw-border-opacity:1;border-color:rgb(255 79 0 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-amber-400\\/70 {border-color:rgb(251 191 36 / 0.7)}\r
.w.w-game.tw-card .border-amber-500\\/20 {border-color:rgb(245 158 11 / 0.2)}\r
.w.w-game.tw-card .border-amber-500\\/40 {border-color:rgb(245 158 11 / 0.4)}\r
.w.w-game.tw-card .border-amber-700\\/60 {border-color:rgb(180 83 9 / 0.6)}\r
.w.w-game.tw-card .border-cyan-400\\/70 {border-color:rgb(34 211 238 / 0.7)}\r
.w.w-game.tw-card .border-cyan-500\\/30 {border-color:rgb(6 182 212 / 0.3)}\r
.w.w-game.tw-card .border-cyan-500\\/40 {border-color:rgb(6 182 212 / 0.4)}\r
.w.w-game.tw-card .border-cyan-500\\/50 {border-color:rgb(6 182 212 / 0.5)}\r
.w.w-game.tw-card .border-cyan-500\\/60 {border-color:rgb(6 182 212 / 0.6)}\r
.w.w-game.tw-card .border-emerald-500\\/25 {border-color:rgb(16 185 129 / 0.25)}\r
.w.w-game.tw-card .border-emerald-500\\/40 {border-color:rgb(16 185 129 / 0.4)}\r
.w.w-game.tw-card .border-emerald-500\\/60 {border-color:rgb(16 185 129 / 0.6)}\r
.w.w-game.tw-card .border-emerald-700 {--tw-border-opacity:1;border-color:rgb(4 120 87 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-green-500\\/40 {border-color:rgb(34 197 94 / 0.4)}\r
.w.w-game.tw-card .border-neutral-200 {--tw-border-opacity:1;border-color:rgb(229 229 229 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-purple-500\\/40 {border-color:rgb(168 85 247 / 0.4)}\r
.w.w-game.tw-card .border-rose-500\\/40 {border-color:rgb(244 63 94 / 0.4)}\r
.w.w-game.tw-card .border-sky-400\\/50 {border-color:rgb(56 189 248 / 0.5)}\r
.w.w-game.tw-card .border-sky-500\\/40 {border-color:rgb(14 165 233 / 0.4)}\r
.w.w-game.tw-card .border-slate-200 {--tw-border-opacity:1;border-color:rgb(226 232 240 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-slate-300 {--tw-border-opacity:1;border-color:rgb(203 213 225 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-stone-300 {--tw-border-opacity:1;border-color:rgb(214 211 209 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-stone-400 {--tw-border-opacity:1;border-color:rgb(168 162 158 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-stone-700 {--tw-border-opacity:1;border-color:rgb(68 64 60 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-stone-700\\/80 {border-color:rgb(68 64 60 / 0.8)}\r
.w.w-game.tw-card .border-stone-800 {--tw-border-opacity:1;border-color:rgb(41 37 36 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-stone-800\\/80 {border-color:rgb(41 37 36 / 0.8)}\r
.w.w-game.tw-card .border-stone-900\\/15 {border-color:rgb(28 25 23 / 0.15)}\r
.w.w-game.tw-card .border-stone-900\\/20 {border-color:rgb(28 25 23 / 0.2)}\r
.w.w-game.tw-card .border-white {--tw-border-opacity:1;border-color:rgb(255 255 255 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-white\\/50 {border-color:rgb(255 255 255 / 0.5)}\r
.w.w-game.tw-card .border-white\\/60 {border-color:rgb(255 255 255 / 0.6)}\r
.w.w-game.tw-card .border-white\\/80 {border-color:rgb(255 255 255 / 0.8)}\r
.w.w-game.tw-card .border-yellow-400 {--tw-border-opacity:1;border-color:rgb(250 204 21 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-zinc-600 {--tw-border-opacity:1;border-color:rgb(82 82 91 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .border-yellow-400\\/50 {border-color:rgb(250 204 21 / 0.5)}\r
.w.w-game.tw-card .border-l-\\[\\#ff4f00\\] {--tw-border-opacity:1;border-left-color:rgb(255 79 0 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#000080\\] {--tw-bg-opacity:1;background-color:rgb(0 0 128 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#06131c\\] {--tw-bg-opacity:1;background-color:rgb(6 19 28 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#082640\\]\\/80 {background-color:rgb(8 38 64 / 0.8)}\r
.w.w-game.tw-card .bg-\\[\\#09090b\\] {--tw-bg-opacity:1;background-color:rgb(9 9 11 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#0b0c0e\\] {--tw-bg-opacity:1;background-color:rgb(11 12 14 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#0c3559\\] {--tw-bg-opacity:1;background-color:rgb(12 53 89 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#111113\\] {--tw-bg-opacity:1;background-color:rgb(17 17 19 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#121211\\] {--tw-bg-opacity:1;background-color:rgb(18 18 17 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#121212\\] {--tw-bg-opacity:1;background-color:rgb(18 18 18 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#121e17\\] {--tw-bg-opacity:1;background-color:rgb(18 30 23 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#141418\\] {--tw-bg-opacity:1;background-color:rgb(20 20 24 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#14171f\\] {--tw-bg-opacity:1;background-color:rgb(20 23 31 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#161518\\] {--tw-bg-opacity:1;background-color:rgb(22 21 24 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#161615\\]\\/95 {background-color:rgb(22 22 21 / 0.95)}\r
.w.w-game.tw-card .bg-\\[\\#181512\\] {--tw-bg-opacity:1;background-color:rgb(24 21 18 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#18181b\\] {--tw-bg-opacity:1;background-color:rgb(24 24 27 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#181a1b\\] {--tw-bg-opacity:1;background-color:rgb(24 26 27 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#1a181c\\] {--tw-bg-opacity:1;background-color:rgb(26 24 28 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#1d1814\\] {--tw-bg-opacity:1;background-color:rgb(29 24 20 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#1e1e1c\\] {--tw-bg-opacity:1;background-color:rgb(30 30 28 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#231e18\\] {--tw-bg-opacity:1;background-color:rgb(35 30 24 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#233329\\] {--tw-bg-opacity:1;background-color:rgb(35 51 41 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#2563eb\\] {--tw-bg-opacity:1;background-color:rgb(37 99 235 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#2a2119\\] {--tw-bg-opacity:1;background-color:rgb(42 33 25 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#2a2520\\] {--tw-bg-opacity:1;background-color:rgb(42 37 32 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#2c2219\\] {--tw-bg-opacity:1;background-color:rgb(44 34 25 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#8f2950\\] {--tw-bg-opacity:1;background-color:rgb(143 41 80 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#9bbc0f\\] {--tw-bg-opacity:1;background-color:rgb(155 188 15 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#c0c0c0\\] {--tw-bg-opacity:1;background-color:rgb(192 192 192 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#dc2626\\] {--tw-bg-opacity:1;background-color:rgb(220 38 38 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#e8dfd1\\] {--tw-bg-opacity:1;background-color:rgb(232 223 209 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#ea580c\\] {--tw-bg-opacity:1;background-color:rgb(234 88 12 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#eab308\\] {--tw-bg-opacity:1;background-color:rgb(234 179 8 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#ebe5d8\\] {--tw-bg-opacity:1;background-color:rgb(235 229 216 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#f3ece0\\] {--tw-bg-opacity:1;background-color:rgb(243 236 224 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#f8fafc\\] {--tw-bg-opacity:1;background-color:rgb(248 250 252 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#faf8f5\\] {--tw-bg-opacity:1;background-color:rgb(250 248 245 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#fafaf9\\] {--tw-bg-opacity:1;background-color:rgb(250 250 249 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#fafafa\\] {--tw-bg-opacity:1;background-color:rgb(250 250 250 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#fef08a\\] {--tw-bg-opacity:1;background-color:rgb(254 240 138 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#ff4f00\\] {--tw-bg-opacity:1;background-color:rgb(255 79 0 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#ff4f00\\]\\/15 {background-color:rgb(255 79 0 / 0.15)}\r
.w.w-game.tw-card .bg-amber-500\\/20 {background-color:rgb(245 158 11 / 0.2)}\r
.w.w-game.tw-card .bg-amber-950\\/50 {background-color:rgb(69 26 3 / 0.5)}\r
.w.w-game.tw-card .bg-black\\/25 {background-color:rgb(0 0 0 / 0.25)}\r
.w.w-game.tw-card .bg-cyan-500\\/20 {background-color:rgb(6 182 212 / 0.2)}\r
.w.w-game.tw-card .bg-cyan-500\\/30 {background-color:rgb(6 182 212 / 0.3)}\r
.w.w-game.tw-card .bg-cyan-950 {--tw-bg-opacity:1;background-color:rgb(8 51 68 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-cyan-950\\/50 {background-color:rgb(8 51 68 / 0.5)}\r
.w.w-game.tw-card .bg-emerald-500\\/20 {background-color:rgb(16 185 129 / 0.2)}\r
.w.w-game.tw-card .bg-emerald-950 {--tw-bg-opacity:1;background-color:rgb(2 44 34 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-emerald-950\\/30 {background-color:rgb(2 44 34 / 0.3)}\r
.w.w-game.tw-card .bg-emerald-950\\/40 {background-color:rgb(2 44 34 / 0.4)}\r
.w.w-game.tw-card .bg-green-400 {--tw-bg-opacity:1;background-color:rgb(74 222 128 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-green-500\\/20 {background-color:rgb(34 197 94 / 0.2)}\r
.w.w-game.tw-card .bg-indigo-500 {--tw-bg-opacity:1;background-color:rgb(99 102 241 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-orange-600 {--tw-bg-opacity:1;background-color:rgb(234 88 12 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-purple-500\\/20 {background-color:rgb(168 85 247 / 0.2)}\r
.w.w-game.tw-card .bg-red-500 {--tw-bg-opacity:1;background-color:rgb(239 68 68 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-rose-500\\/20 {background-color:rgb(244 63 94 / 0.2)}\r
.w.w-game.tw-card .bg-sky-500\\/20 {background-color:rgb(14 165 233 / 0.2)}\r
.w.w-game.tw-card .bg-sky-600 {--tw-bg-opacity:1;background-color:rgb(2 132 199 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-sky-700 {--tw-bg-opacity:1;background-color:rgb(3 105 161 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-slate-200 {--tw-bg-opacity:1;background-color:rgb(226 232 240 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-slate-50 {--tw-bg-opacity:1;background-color:rgb(248 250 252 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-slate-700 {--tw-bg-opacity:1;background-color:rgb(51 65 85 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-slate-800 {--tw-bg-opacity:1;background-color:rgb(30 41 59 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-stone-100 {--tw-bg-opacity:1;background-color:rgb(245 245 244 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-stone-200 {--tw-bg-opacity:1;background-color:rgb(231 229 228 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-stone-800 {--tw-bg-opacity:1;background-color:rgb(41 37 36 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-stone-800\\/60 {background-color:rgb(41 37 36 / 0.6)}\r
.w.w-game.tw-card .bg-stone-900 {--tw-bg-opacity:1;background-color:rgb(28 25 23 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-stone-950 {--tw-bg-opacity:1;background-color:rgb(12 10 9 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-teal-200 {--tw-bg-opacity:1;background-color:rgb(153 246 228 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-white\\/60 {background-color:rgb(255 255 255 / 0.6)}\r
.w.w-game.tw-card .bg-white\\/70 {background-color:rgb(255 255 255 / 0.7)}\r
.w.w-game.tw-card .bg-white\\/80 {background-color:rgb(255 255 255 / 0.8)}\r
.w.w-game.tw-card .bg-yellow-300 {--tw-bg-opacity:1;background-color:rgb(253 224 71 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-yellow-400 {--tw-bg-opacity:1;background-color:rgb(250 204 21 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-zinc-500 {--tw-bg-opacity:1;background-color:rgb(113 113 122 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-zinc-700 {--tw-bg-opacity:1;background-color:rgb(63 63 70 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-\\[\\#0f380f\\] {--tw-bg-opacity:1;background-color:rgb(15 56 15 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .bg-gradient-to-tr {background-image:linear-gradient(to top right, var(--tw-gradient-stops))}\r
.w.w-game.tw-card .from-\\[\\#e0f2fe\\] {--tw-gradient-from:#e0f2fe var(--tw-gradient-from-position);--tw-gradient-to:rgb(224 242 254 / 0) var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from), var(--tw-gradient-to)}\r
.w.w-game.tw-card .from-black\\/90 {--tw-gradient-from:rgb(0 0 0 / 0.9) var(--tw-gradient-from-position);--tw-gradient-to:rgb(0 0 0 / 0) var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from), var(--tw-gradient-to)}\r
.w.w-game.tw-card .from-white\\/5 {--tw-gradient-from:rgb(255 255 255 / 0.05) var(--tw-gradient-from-position);--tw-gradient-to:rgb(255 255 255 / 0) var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from), var(--tw-gradient-to)}\r
.w.w-game.tw-card .from-zinc-950 {--tw-gradient-from:#09090b var(--tw-gradient-from-position);--tw-gradient-to:rgb(9 9 11 / 0) var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from), var(--tw-gradient-to)}\r
.w.w-game.tw-card .via-\\[\\#f0fdf4\\] {--tw-gradient-to:rgb(240 253 244 / 0)  var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from), #f0fdf4 var(--tw-gradient-via-position), var(--tw-gradient-to)}\r
.w.w-game.tw-card .via-black\\/40 {--tw-gradient-to:rgb(0 0 0 / 0)  var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from), rgb(0 0 0 / 0.4) var(--tw-gradient-via-position), var(--tw-gradient-to)}\r
.w.w-game.tw-card .via-white\\/20 {--tw-gradient-to:rgb(255 255 255 / 0)  var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from), rgb(255 255 255 / 0.2) var(--tw-gradient-via-position), var(--tw-gradient-to)}\r
.w.w-game.tw-card .via-zinc-800 {--tw-gradient-to:rgb(39 39 42 / 0)  var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from), #27272a var(--tw-gradient-via-position), var(--tw-gradient-to)}\r
.w.w-game.tw-card .to-\\[\\#fef3c7\\] {--tw-gradient-to:#fef3c7 var(--tw-gradient-to-position)}\r
.w.w-game.tw-card .to-transparent {--tw-gradient-to:transparent var(--tw-gradient-to-position)}\r
.w.w-game.tw-card .to-zinc-950 {--tw-gradient-to:#09090b var(--tw-gradient-to-position)}\r
.w.w-game.tw-card .p-1 {padding:0.25rem}\r
.w.w-game.tw-card .p-6 {padding:1.5rem}\r
.w.w-game.tw-card .px-1\\.5 {padding-left:0.375rem;padding-right:0.375rem}\r
.w.w-game.tw-card .py-4 {padding-top:1rem;padding-bottom:1rem}\r
.w.w-game.tw-card .px-1 {padding-left:0.25rem;padding-right:0.25rem}\r
.w.w-game.tw-card .pb-3 {padding-bottom:0.75rem}\r
.w.w-game.tw-card .pb-4 {padding-bottom:1rem}\r
.w.w-game.tw-card .pb-7 {padding-bottom:1.75rem}\r
.w.w-game.tw-card .pl-5 {padding-left:1.25rem}\r
.w.w-game.tw-card .pr-10 {padding-right:2.5rem}\r
.w.w-game.tw-card .pr-12 {padding-right:3rem}\r
.w.w-game.tw-card .pr-2 {padding-right:0.5rem}\r
.w.w-game.tw-card .pt-1\\.5 {padding-top:0.375rem}\r
.w.w-game.tw-card .pt-4 {padding-top:1rem}\r
.w.w-game.tw-card .pt-8 {padding-top:2rem}\r
.w.w-game.tw-card .text-4xl {font-size:2.25rem;line-height:2.5rem}\r
.w.w-game.tw-card .text-5xl {font-size:3rem;line-height:1}\r
.w.w-game.tw-card .text-6xl {font-size:3.75rem;line-height:1}\r
.w.w-game.tw-card .text-\\[8px\\] {font-size:8px}\r
.w.w-game.tw-card .font-light {font-weight:300}\r
.w.w-game.tw-card .font-medium {font-weight:500}\r
.w.w-game.tw-card .font-normal {font-weight:400}\r
.w.w-game.tw-card .italic {font-style:italic}\r
.w.w-game.tw-card .leading-\\[0\\.95\\] {line-height:0.95}\r
.w.w-game.tw-card .leading-snug {line-height:1.375}\r
.w.w-game.tw-card .tracking-\\[0\\.2em\\] {letter-spacing:0.2em}\r
.w.w-game.tw-card .tracking-wide {letter-spacing:0.025em}\r
.w.w-game.tw-card .text-\\[\\#000080\\] {--tw-text-opacity:1;color:rgb(0 0 128 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#0f380f\\] {--tw-text-opacity:1;color:rgb(15 56 15 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#171717\\] {--tw-text-opacity:1;color:rgb(23 23 23 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#1c1917\\] {--tw-text-opacity:1;color:rgb(28 25 23 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#292524\\] {--tw-text-opacity:1;color:rgb(41 37 36 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#3f3e38\\] {--tw-text-opacity:1;color:rgb(63 62 56 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#c5a35d\\] {--tw-text-opacity:1;color:rgb(197 163 93 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#cbb89d\\] {--tw-text-opacity:1;color:rgb(203 184 157 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#cbbba0\\] {--tw-text-opacity:1;color:rgb(203 187 160 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#d9a76a\\] {--tw-text-opacity:1;color:rgb(217 167 106 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#e5c98b\\] {--tw-text-opacity:1;color:rgb(229 201 139 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#f3e6d3\\] {--tw-text-opacity:1;color:rgb(243 230 211 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#f4ead5\\] {--tw-text-opacity:1;color:rgb(244 234 213 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#fef08a\\] {--tw-text-opacity:1;color:rgb(254 240 138 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#ff4f00\\] {--tw-text-opacity:1;color:rgb(255 79 0 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#fff5e6\\] {--tw-text-opacity:1;color:rgb(255 245 230 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#fff8eb\\] {--tw-text-opacity:1;color:rgb(255 248 235 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-amber-100 {--tw-text-opacity:1;color:rgb(254 243 199 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-amber-100\\/80 {color:rgb(254 243 199 / 0.8)}\r
.w.w-game.tw-card .text-amber-200 {--tw-text-opacity:1;color:rgb(253 230 138 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-amber-200\\/90 {color:rgb(253 230 138 / 0.9)}\r
.w.w-game.tw-card .text-amber-400 {--tw-text-opacity:1;color:rgb(251 191 36 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-amber-50 {--tw-text-opacity:1;color:rgb(255 251 235 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-cyan-200\\/70 {color:rgb(165 243 252 / 0.7)}\r
.w.w-game.tw-card .text-cyan-400 {--tw-text-opacity:1;color:rgb(34 211 238 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-cyan-50 {--tw-text-opacity:1;color:rgb(236 254 255 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-emerald-200\\/90 {color:rgb(167 243 208 / 0.9)}\r
.w.w-game.tw-card .text-emerald-500\\/70 {color:rgb(16 185 129 / 0.7)}\r
.w.w-game.tw-card .text-emerald-500\\/80 {color:rgb(16 185 129 / 0.8)}\r
.w.w-game.tw-card .text-emerald-600 {--tw-text-opacity:1;color:rgb(5 150 105 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-emerald-700 {--tw-text-opacity:1;color:rgb(4 120 87 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-green-300 {--tw-text-opacity:1;color:rgb(134 239 172 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-indigo-300 {--tw-text-opacity:1;color:rgb(165 180 252 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-lime-300 {--tw-text-opacity:1;color:rgb(190 242 100 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-neutral-400 {--tw-text-opacity:1;color:rgb(163 163 163 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-neutral-600 {--tw-text-opacity:1;color:rgb(82 82 82 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-neutral-800 {--tw-text-opacity:1;color:rgb(38 38 38 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-neutral-900 {--tw-text-opacity:1;color:rgb(23 23 23 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-sky-100\\/80 {color:rgb(224 242 254 / 0.8)}\r
.w.w-game.tw-card .text-sky-200 {--tw-text-opacity:1;color:rgb(186 230 253 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-sky-700 {--tw-text-opacity:1;color:rgb(3 105 161 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-slate-200 {--tw-text-opacity:1;color:rgb(226 232 240 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-slate-300 {--tw-text-opacity:1;color:rgb(203 213 225 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-slate-500 {--tw-text-opacity:1;color:rgb(100 116 139 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-slate-600 {--tw-text-opacity:1;color:rgb(71 85 105 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-slate-700 {--tw-text-opacity:1;color:rgb(51 65 85 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-slate-800 {--tw-text-opacity:1;color:rgb(30 41 59 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-slate-900 {--tw-text-opacity:1;color:rgb(15 23 42 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-stone-100 {--tw-text-opacity:1;color:rgb(245 245 244 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-stone-300 {--tw-text-opacity:1;color:rgb(214 211 209 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-stone-400 {--tw-text-opacity:1;color:rgb(168 162 158 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-stone-500 {--tw-text-opacity:1;color:rgb(120 113 108 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-stone-700 {--tw-text-opacity:1;color:rgb(68 64 60 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-stone-800 {--tw-text-opacity:1;color:rgb(41 37 36 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-stone-900 {--tw-text-opacity:1;color:rgb(28 25 23 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-teal-200 {--tw-text-opacity:1;color:rgb(153 246 228 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-teal-700 {--tw-text-opacity:1;color:rgb(15 118 110 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-teal-800 {--tw-text-opacity:1;color:rgb(17 94 89 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-teal-950 {--tw-text-opacity:1;color:rgb(4 47 46 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-white\\/80 {color:rgb(255 255 255 / 0.8)}\r
.w.w-game.tw-card .text-yellow-200 {--tw-text-opacity:1;color:rgb(254 240 138 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-yellow-300 {--tw-text-opacity:1;color:rgb(253 224 71 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-zinc-100 {--tw-text-opacity:1;color:rgb(244 244 245 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .text-\\[\\#9bbc0f\\] {--tw-text-opacity:1;color:rgb(155 188 15 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .decoration-stone-400 {-webkit-text-decoration-color:#a8a29e;text-decoration-color:#a8a29e}\r
.w.w-game.tw-card .underline-offset-2 {text-underline-offset:2px}\r
.w.w-game.tw-card .opacity-55 {opacity:0.55}\r
.w.w-game.tw-card .opacity-80 {opacity:0.8}\r
.w.w-game.tw-card .opacity-90 {opacity:0.9}\r
.w.w-game.tw-card .shadow-2xl {--tw-shadow:0 25px 50px -12px rgb(0 0 0 / 0.25);--tw-shadow-colored:0 25px 50px -12px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .shadow-\\[0_0_25px_rgba\\(250\\2c 204\\2c 21\\2c 0\\.12\\)\\] {--tw-shadow:0 0 25px rgba(250,204,21,0.12);--tw-shadow-colored:0 0 25px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .shadow-\\[0_0_6px_\\#ef4444\\] {--tw-shadow:0 0 6px #ef4444;--tw-shadow-colored:0 0 6px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .shadow-\\[2px_2px_0px_\\#141413\\] {--tw-shadow:2px 2px 0px #141413;--tw-shadow-colored:2px 2px 0px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .shadow-\\[4px_4px_0_\\#000\\] {--tw-shadow:4px 4px 0 #000;--tw-shadow-colored:4px 4px 0 var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .shadow-\\[4px_4px_0px_\\#141413\\] {--tw-shadow:4px 4px 0px #141413;--tw-shadow-colored:4px 4px 0px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .shadow-\\[8px_8px_0px_\\#000000\\] {--tw-shadow:8px 8px 0px #000000;--tw-shadow-colored:8px 8px 0px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .shadow-\\[inset_0_3px_10px_rgba\\(0\\2c 0\\2c 0\\2c 0\\.9\\)\\] {--tw-shadow:inset 0 3px 10px rgba(0,0,0,0.9);--tw-shadow-colored:inset 0 3px 10px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .shadow-inner {--tw-shadow:inset 0 2px 4px 0 rgb(0 0 0 / 0.05);--tw-shadow-colored:inset 0 2px 4px 0 var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .shadow-lg {--tw-shadow:0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);--tw-shadow-colored:0 10px 15px -3px var(--tw-shadow-color), 0 4px 6px -4px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .shadow-md {--tw-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);--tw-shadow-colored:0 4px 6px -1px var(--tw-shadow-color), 0 2px 4px -2px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .shadow-sm {--tw-shadow:0 1px 2px 0 rgb(0 0 0 / 0.05);--tw-shadow-colored:0 1px 2px 0 var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)}\r
.w.w-game.tw-card .contrast-125 {--tw-contrast:contrast(1.25);filter:var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)}\r
.w.w-game.tw-card .contrast-150 {--tw-contrast:contrast(1.5);filter:var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)}\r
.w.w-game.tw-card .contrast-200 {--tw-contrast:contrast(2);filter:var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)}\r
.w.w-game.tw-card .drop-shadow-md {--tw-drop-shadow:drop-shadow(0 4px 3px rgb(0 0 0 / 0.07)) drop-shadow(0 2px 2px rgb(0 0 0 / 0.06));filter:var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)}\r
.w.w-game.tw-card .grayscale {--tw-grayscale:grayscale(100%);filter:var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)}\r
.w.w-game.tw-card .backdrop-blur {--tw-backdrop-blur:blur(8px);-webkit-backdrop-filter:var(--tw-backdrop-blur) var(--tw-backdrop-brightness) var(--tw-backdrop-contrast) var(--tw-backdrop-grayscale) var(--tw-backdrop-hue-rotate) var(--tw-backdrop-invert) var(--tw-backdrop-opacity) var(--tw-backdrop-saturate) var(--tw-backdrop-sepia);backdrop-filter:var(--tw-backdrop-blur) var(--tw-backdrop-brightness) var(--tw-backdrop-contrast) var(--tw-backdrop-grayscale) var(--tw-backdrop-hue-rotate) var(--tw-backdrop-invert) var(--tw-backdrop-opacity) var(--tw-backdrop-saturate) var(--tw-backdrop-sepia)}\r
.w.w-game.tw-card .backdrop-blur-xl {--tw-backdrop-blur:blur(24px);-webkit-backdrop-filter:var(--tw-backdrop-blur) var(--tw-backdrop-brightness) var(--tw-backdrop-contrast) var(--tw-backdrop-grayscale) var(--tw-backdrop-hue-rotate) var(--tw-backdrop-invert) var(--tw-backdrop-opacity) var(--tw-backdrop-saturate) var(--tw-backdrop-sepia);backdrop-filter:var(--tw-backdrop-blur) var(--tw-backdrop-brightness) var(--tw-backdrop-contrast) var(--tw-backdrop-grayscale) var(--tw-backdrop-hue-rotate) var(--tw-backdrop-invert) var(--tw-backdrop-opacity) var(--tw-backdrop-saturate) var(--tw-backdrop-sepia)}\r
.w.w-game.tw-card .transition-transform {transition-property:transform;transition-timing-function:cubic-bezier(0.4, 0, 0.2, 1);transition-duration:150ms}\r
.w.w-game.tw-card .hover\\:border-amber-400:hover {--tw-border-opacity:1;border-color:rgb(251 191 36 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .hover\\:bg-stone-700:hover {--tw-bg-opacity:1;background-color:rgb(68 64 60 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .hover\\:bg-stone-800:hover {--tw-bg-opacity:1;background-color:rgb(41 37 36 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .hover\\:bg-black:hover {--tw-bg-opacity:1;background-color:rgb(0 0 0 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .hover\\:bg-cyan-400:hover {--tw-bg-opacity:1;background-color:rgb(34 211 238 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .hover\\:bg-yellow-400:hover {--tw-bg-opacity:1;background-color:rgb(250 204 21 / var(--tw-bg-opacity, 1))}\r
.w.w-game.tw-card .hover\\:text-white:hover {--tw-text-opacity:1;color:rgb(255 255 255 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .hover\\:text-amber-300:hover {--tw-text-opacity:1;color:rgb(252 211 77 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .hover\\:text-black:hover {--tw-text-opacity:1;color:rgb(0 0 0 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .hover\\:text-green-400:hover {--tw-text-opacity:1;color:rgb(74 222 128 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .hover\\:text-sky-200:hover {--tw-text-opacity:1;color:rgb(186 230 253 / var(--tw-text-opacity, 1))}\r
.w.w-game.tw-card .hover\\:opacity-70:hover {opacity:0.7}\r
.w.w-game.tw-card .hover\\:opacity-80:hover {opacity:0.8}\r
.w.w-game.tw-card .focus\\:border-\\[\\#ff4f00\\]:focus {--tw-border-opacity:1;border-color:rgb(255 79 0 / var(--tw-border-opacity, 1))}\r
.w.w-game.tw-card .active\\:translate-y-px:active {--tw-translate-y:1px;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .group:hover .group-hover\\:rotate-0 {--tw-rotate:0deg;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .sm\\:col-span-1 {grid-column:span 1 / span 1}\r
.w.w-game.tw-card .sm\\:col-span-2 {grid-column:span 2 / span 2}\r
.w.w-game.tw-card .sm\\:my-auto {margin-top:auto;margin-bottom:auto}\r
.w.w-game.tw-card .sm\\:-mb-6 {margin-bottom:-1.5rem}\r
.w.w-game.tw-card .sm\\:mt-2 {margin-top:0.5rem}\r
.w.w-game.tw-card .sm\\:h-36 {height:9rem}\r
.w.w-game.tw-card .sm\\:w-14 {width:3.5rem}\r
.w.w-game.tw-card .sm\\:w-24 {width:6rem}\r
.w.w-game.tw-card .sm\\:w-32 {width:8rem}\r
.w.w-game.tw-card .sm\\:w-36 {width:9rem}\r
.w.w-game.tw-card .sm\\:-rotate-90 {--tw-rotate:-90deg;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .sm\\:grid-cols-2 {grid-template-columns:repeat(2, minmax(0, 1fr))}\r
.w.w-game.tw-card .sm\\:flex-col {flex-direction:column}\r
.w.w-game.tw-card .sm\\:flex-nowrap {flex-wrap:nowrap}\r
.w.w-game.tw-card .sm\\:justify-end {justify-content:flex-end}\r
.w.w-game.tw-card .sm\\:border-b-0 {border-bottom-width:0px}\r
.w.w-game.tw-card .sm\\:border-l {border-left-width:1px}\r
.w.w-game.tw-card .sm\\:border-l-2 {border-left-width:2px}\r
.w.w-game.tw-card .sm\\:border-r {border-right-width:1px}\r
.w.w-game.tw-card .sm\\:border-t-0 {border-top-width:0px}\r
.w.w-game.tw-card .sm\\:p-4 {padding:1rem}\r
.w.w-game.tw-card .sm\\:p-7 {padding:1.75rem}\r
.w.w-game.tw-card .sm\\:p-8 {padding:2rem}\r
.w.w-game.tw-card .sm\\:py-4 {padding-top:1rem;padding-bottom:1rem}\r
.w.w-game.tw-card .sm\\:pl-4 {padding-left:1rem}\r
.w.w-game.tw-card .sm\\:pl-6 {padding-left:1.5rem}\r
.w.w-game.tw-card .sm\\:pt-0 {padding-top:0px}\r
.w.w-game.tw-card .sm\\:text-right {text-align:right}\r
.w.w-game.tw-card .sm\\:text-2xl {font-size:1.5rem;line-height:2rem}\r
.w.w-game.tw-card .sm\\:text-4xl {font-size:2.25rem;line-height:2.5rem}\r
.w.w-game.tw-card .sm\\:text-sm {font-size:0.875rem;line-height:1.25rem}\r
.w.w-game.tw-card .sm\\:text-xl {font-size:1.25rem;line-height:1.75rem}\r
.w.w-game.tw-card .md\\:col-span-1 {grid-column:span 1 / span 1}\r
.w.w-game.tw-card .md\\:col-span-3 {grid-column:span 3 / span 3}\r
.w.w-game.tw-card .md\\:col-span-4 {grid-column:span 4 / span 4}\r
.w.w-game.tw-card .md\\:col-span-7 {grid-column:span 7 / span 7}\r
.w.w-game.tw-card .md\\:col-span-8 {grid-column:span 8 / span 8}\r
.w.w-game.tw-card .md\\:my-auto {margin-top:auto;margin-bottom:auto}\r
.w.w-game.tw-card .md\\:w-48 {width:12rem}\r
.w.w-game.tw-card .md\\:w-full {width:100%}\r
.w.w-game.tw-card .md\\:-rotate-90 {--tw-rotate:-90deg;transform:translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}\r
.w.w-game.tw-card .md\\:grid-cols-2 {grid-template-columns:repeat(2, minmax(0, 1fr))}\r
.w.w-game.tw-card .md\\:grid-cols-4 {grid-template-columns:repeat(4, minmax(0, 1fr))}\r
.w.w-game.tw-card .md\\:flex-col {flex-direction:column}\r
.w.w-game.tw-card .md\\:justify-start {justify-content:flex-start}\r
.w.w-game.tw-card .md\\:border-l-2 {border-left-width:2px}\r
.w.w-game.tw-card .md\\:border-r {border-right-width:1px}\r
.w.w-game.tw-card .md\\:pb-0 {padding-bottom:0px}\r
.w.w-game.tw-card .md\\:pr-5 {padding-right:1.25rem}\r
.w.w-game.tw-card .md\\:text-left {text-align:left}\r
@media (min-width: 1024px) {\r
.w.w-game.tw-card .lg\\:flex-row {flex-direction:row}\r
.w.w-game.tw-card .lg\\:items-end {align-items:flex-end}`;

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\gamequill-content\native-text.js
  function nativeText(el) {
    let t = "";
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) t += c.nodeValue;
        else if (c.nodeType === 1) {
          if (c.getAttribute("aria-hidden") === "true" || c.hasAttribute("data-gq-view")) continue;
          const tag = c.tagName;
          if (tag === "BR" || tag === "P" || tag === "DIV" || tag === "LI" || /^H\d$/.test(tag)) t += "\n";
          walk(c);
        }
      }
    };
    walk(el);
    const i = t.indexOf(FOOTER_TEXT);
    return i >= 0 ? t.slice(0, i) : t;
  }

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\gamequill-content\detect.js
  var FOOTER_RE = /✦\s*Оформлено в GameQuill/;
  var QUICK_VS = /[\uFE00-\uFE0F]|\uDB40[\uDD00-\uDDEF]/;
  function isReviewPage(loc = globalThis.location) {
    const p = String(loc && loc.pathname || "").replace(/\/+$/, "") || "/";
    if (/^\/u\/[^/]+\/review\/\d+/i.test(p)) return true;
    if (/^\/reviews?\/\d+/i.test(p)) return true;
    return false;
  }
  function findReviewTextareas(root = document) {
    if (!root || !root.querySelectorAll) return [];
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    root.querySelectorAll('textarea[name="review"], textarea#review').forEach((el) => {
      if (!seen.has(el)) {
        seen.add(el);
        out.push(el);
      }
    });
    return out;
  }
  function looksLikePayloadText(text) {
    if (typeof text !== "string" || text.length < 8) return false;
    return FOOTER_RE.test(text) || QUICK_VS.test(text);
  }
  function carrierKeyFromText(text) {
    if (!text) return "";
    const bytes = vsExtract(text);
    return bytes ? "vs:" + toB64url(bytes) : "";
  }
  var SKIP = [
    "[data-gq-view]",
    "[data-gq-preview]",
    "[data-gq-bar]",
    "[data-i18n-ignore]",
    "gq-composer",
    "textarea",
    "input",
    "header",
    "nav",
    '[role="menu"]',
    ".modal-header",
    ".modal-footer",
    '[class*="notification"]'
  ].join(",");
  function isBlockedPage(loc = globalThis.location) {
    const p = String(loc && loc.pathname || "").replace(/\/+$/, "") || "/";
    return /^\/(?:settings|users\/sign_in|users\/sign_up)(?:\/|$)/i.test(p);
  }
  function contentRootFromMarker(node, root = document) {
    let el = node && node.nodeType === 3 ? node.parentElement : node;
    if (!el || !el.closest) return null;
    if (el.closest(SKIP)) return null;
    const reviewRoot = el.closest(".review-body") || el.closest(".review__body") || el.closest(".review-content") || el.closest(".review-text") || el.closest('[id^="collapseReview"]') || el.closest(".card-text");
    if (reviewRoot && !reviewRoot.closest(SKIP)) return reviewRoot;
    while (el.parentElement && el.parentElement !== root.body && el.parentElement !== root.documentElement) {
      const p = el.parentElement;
      if (p.tagName === "MAIN" || p.classList?.contains("main") || p.classList?.contains("review-card") || p.classList?.contains("card")) {
        break;
      }
      if (p.closest && p.closest(SKIP)) break;
      const et = (el.textContent || "").length;
      const pt = (p.textContent || "").length;
      if (pt > et * 1.8 + 120) break;
      if (p.getAttribute("data-gq-view") != null) break;
      el = p;
    }
    return el;
  }
  function findViewRoots(root = document, loc = globalThis.location) {
    const out = [];
    if (isBlockedPage(loc)) return out;
    const seen = /* @__PURE__ */ new Set();
    const add = (el) => {
      if (!el || seen.has(el) || el.closest && el.closest(SKIP)) return;
      seen.add(el);
      out.push(el);
    };
    if (root.querySelectorAll) {
      root.querySelectorAll("[data-gq-carrier]").forEach(add);
    }
    const scope = root.body || root.documentElement || root;
    if (!scope || !root.createTreeWalker) return out;
    const walker = root.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode(n2) {
        const t = n2.nodeValue || "";
        if (!looksLikePayloadText(t)) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while (n = walker.nextNode()) {
      add(contentRootFromMarker(n, root));
    }
    return out;
  }

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\gamequill-content\viewer.js
  var state = /* @__PURE__ */ new WeakMap();
  var cache = /* @__PURE__ */ new Map();
  var enabled = true;
  function injectFonts() {
    if (document.getElementById("gq-fonts")) return;
    const u = (f) => chrome.runtime.getURL("fonts/" + f);
    const face = (fam, file, style, range) => `@font-face{font-family:'${fam}';font-style:${style};font-weight:100 900;font-display:swap;src:url('${u(file)}') format('woff2');unicode-range:${range}}`;
    const LAT = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
    const CYR = "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116";
    const s = document.createElement("style");
    s.id = "gq-fonts";
    s.textContent = [
      face("GQ Inter", "inter-latin-wght-normal.woff2", "normal", LAT),
      face("GQ Inter", "inter-cyrillic-wght-normal.woff2", "normal", CYR),
      face("GQ Inter", "inter-latin-wght-italic.woff2", "italic", LAT),
      face("GQ Inter", "inter-cyrillic-wght-italic.woff2", "italic", CYR),
      face("GQ Unbounded", "unbounded-latin-wght-normal.woff2", "normal", LAT),
      face("GQ Unbounded", "unbounded-cyrillic-wght-normal.woff2", "normal", CYR)
    ].join("\n");
    (document.head || document.documentElement).appendChild(s);
  }
  function carrierKey(el) {
    const a = el.getAttribute && el.getAttribute("data-gq-carrier");
    if (a) return a;
    return carrierKeyFromText(el.textContent || "");
  }
  function loadDoc(key) {
    if (!cache.has(key)) {
      const p = (async () => {
        try {
          const raw = key.startsWith("vs:") ? await decodeCarrier({ kind: "vs", bytes: fromB64url(key.slice(3)) }) : await decodeCarrier(key);
          return normalizeReview(raw, { sanitizeHtml: (h2) => sanitizeHtml(h2) });
        } catch (e) {
          console.debug("[GameQuill] bad carrier", e && e.code);
          return null;
        }
      })();
      cache.set(key, p);
      if (cache.size > 200) cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
  }
  function stopInteractive(e) {
    const t = e.target;
    if (t && t.closest && t.closest("a,button,summary,details")) e.stopPropagation();
  }
  function buildView(el, doc, mismatch) {
    const host2 = document.createElement("div");
    const theme = normalizeTheme((getSettings() || {}).gqTheme || DEFAULT_THEME);
    host2.setAttribute("data-gq-view", "");
    host2.setAttribute("data-gq-frames", String(countGalleryFrames(doc)));
    host2.setAttribute("data-gq-theme", theme);
    host2.setAttribute("data-i18n-ignore", "");
    const root = host2.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = render_default + "\n" + gq_cards_default;
    const wrap = document.createElement("div");
    wrap.className = "wrap";
    wrap.setAttribute("data-gq-theme", theme);
    const bar = document.createElement("div");
    bar.className = "bar";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "pill";
    const note = document.createElement("span");
    note.className = "note";
    bar.append(toggle, note);
    const body = document.createElement("div");
    body.className = "body";
    body.append(renderReview(document, doc));
    const more = document.createElement("button");
    more.type = "button";
    more.className = "pill ghost more";
    more.textContent = "\u0420\u0430\u0437\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u043E\u0431\u0437\u043E\u0440 \u25BE";
    wrap.append(bar, body, more);
    root.append(style, wrap);
    ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend"].forEach(
      (t) => wrap.addEventListener(t, stopInteractive)
    );
    let showing = true;
    const compactable = !isReviewPage();
    const apply = () => {
      if (showing) {
        el.setAttribute("data-gq-hidden", "");
        wrap.classList.remove("mini");
        toggle.textContent = "\u2728 GameQuill \xB7 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B";
        note.textContent = "";
      } else {
        el.removeAttribute("data-gq-hidden");
        wrap.classList.add("mini");
        wrap.classList.remove("compact");
        toggle.textContent = "\u2728 \u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435 GameQuill";
        note.textContent = mismatch ? "\u0442\u0435\u043A\u0441\u0442 \u043E\u0442\u0437\u044B\u0432\u0430 \u0438\u0437\u043C\u0435\u043D\u0451\u043D \u043F\u043E\u0441\u043B\u0435 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u044F" : "";
      }
      if (showing && compactable && !wrap.dataset.expanded) wrap.classList.add("compact");
    };
    toggle.addEventListener("click", () => {
      showing = !showing;
      apply();
    });
    more.addEventListener("click", () => {
      wrap.dataset.expanded = "1";
      wrap.classList.remove("compact");
    });
    apply();
    host2._gqUpdateTheme = (newTheme) => {
      const nt = normalizeTheme(newTheme);
      host2.setAttribute("data-gq-theme", nt);
      wrap.setAttribute("data-gq-theme", nt);
    };
    return host2;
  }
  function teardown(el) {
    const st = state.get(el);
    if (st && st.host) st.host.remove();
    el.removeAttribute("data-gq-hidden");
    state.delete(el);
  }
  async function processEl(el) {
    const key = enabled ? carrierKey(el) : "";
    const st = state.get(el);
    if (!key) {
      if (st) teardown(el);
      return;
    }
    if (st && st.key === key) {
      if (st.host && !st.host.isConnected && el.isConnected && el.parentNode) el.after(st.host);
      return;
    }
    if (st) teardown(el);
    state.set(el, { key, host: null });
    const doc = await loadDoc(key);
    const cur = state.get(el);
    if (!cur || cur.key !== key || !el.isConnected) return;
    if (!doc) return;
    const fp = fingerprintText(nativeText(el));
    const mismatch = !!(doc.fp && (doc.fp.h !== fp.h || doc.fp.len !== fp.len));
    const host2 = buildView(el, doc, mismatch);
    el.after(host2);
    cur.host = host2;
  }
  var queued = false;
  function scan() {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      findViewRoots(document).forEach((el) => {
        processEl(el).catch(() => {
        });
      });
    }, 150);
  }
  function setViewerEnabled(on) {
    enabled = !!on;
    scan();
  }
  function refreshViewerThemes(theme) {
    document.querySelectorAll("[data-gq-view]").forEach((host2) => {
      if (typeof host2._gqUpdateTheme === "function") host2._gqUpdateTheme(theme);
    });
  }
  function startViewer(opts = {}) {
    if (globalThis.__GQ_VIEWER__) return;
    globalThis.__GQ_VIEWER__ = true;
    enabled = opts.enabled !== false;
    injectFonts();
    const mo = new MutationObserver(scan);
    const go = () => {
      mo.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-gq-carrier"]
      });
      scan();
      setInterval(scan, 2500);
    };
    if (document.body) go();
    else document.addEventListener("DOMContentLoaded", go, { once: true });
  }

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\gamequill-content\composer.js
  var SS_DRAFT = "gq:composer-draft";
  var host = null;
  var ui = null;
  var frameReady = false;
  var lastDoc = null;
  var preview = null;
  var activeTextarea = null;
  var boundTextareas = /* @__PURE__ */ new WeakMap();
  var EXT_ORIGIN = () => {
    try {
      return "chrome-extension://" + chrome.runtime.id;
    } catch {
      return "";
    }
  };
  var CSS_OVERLAY = `
:host{all:initial}
.ov{position:fixed;inset:0;z-index:2147483000;background:rgba(5,6,12,.76);display:none}
.ov.on{display:block}
.ov iframe{position:absolute;inset:12px;width:calc(100% - 24px);height:calc(100% - 24px);border:0;border-radius:14px;
background:#080a11;box-shadow:0 30px 90px rgba(0,0,0,.6)}
.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483001;max-width:520px;
font:500 13px/1.45 system-ui,sans-serif;color:#fff;background:#1c2231;border:1px solid #2d3648;
padding:10px 16px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
.toast.err{border-color:#ff5f6d}
`;
  function toast(msg, err) {
    if (!ui) return;
    const t = document.createElement("div");
    t.className = "toast" + (err ? " err" : "");
    t.textContent = msg;
    ui.root.appendChild(t);
    setTimeout(() => t.remove(), 5200);
  }
  function ensureUi() {
    if (host && host.isConnected) return;
    host = document.createElement("gq-composer");
    host.setAttribute("data-i18n-ignore", "");
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS_OVERLAY;
    const ov = document.createElement("div");
    ov.className = "ov";
    root.append(style, ov);
    ov.addEventListener("click", (e) => {
      if (e.target === ov) closeEditor();
    });
    document.documentElement.appendChild(host);
    ui = { root, overlay: ov, frame: null };
    frameReady = false;
  }
  function openEditor(textarea) {
    if (textarea) activeTextarea = textarea;
    ensureUi();
    if (!ui.frame) {
      const f = document.createElement("iframe");
      f.src = chrome.runtime.getURL("gamequill/index.html");
      f.setAttribute("allow", "clipboard-write");
      f.title = "GameQuill";
      ui.overlay.appendChild(f);
      ui.frame = f;
    } else if (frameReady) {
      sendInit();
    }
    ui.overlay.classList.add("on");
    document.documentElement.style.overflow = "hidden";
  }
  function closeEditor() {
    if (!ui) return;
    ui.overlay.classList.remove("on");
    document.documentElement.style.overflow = "";
  }
  function post(msg) {
    if (ui && ui.frame && ui.frame.contentWindow) {
      ui.frame.contentWindow.postMessage(msg, EXT_ORIGIN());
    }
  }
  function getActiveTextarea() {
    if (activeTextarea && activeTextarea.isConnected) return activeTextarea;
    const list = findReviewTextareas(document);
    activeTextarea = list[0] || null;
    return activeTextarea;
  }
  function reviewContextKey(ta) {
    const form = ta && ta.closest ? ta.closest("form") : null;
    const action = form && form.getAttribute("action");
    if (action) return action.replace(/[^\w/-]+/g, "").slice(0, 80);
    return (location.pathname || "/").replace(/[^\w/-]+/g, "").slice(0, 80);
  }
  function detectGameTitle(ta) {
    const modal = ta && ta.closest ? ta.closest(".modal, form") : null;
    const selectors = [
      ".game-title-section h1",
      "h1.game-title",
      ".game-header h1",
      ".game-details h1"
    ];
    if (modal) {
      const mTitle = modal.querySelector(".game-title, .modal-game-title, .modal-title");
      const raw = mTitle ? (mTitle.textContent || "").trim() : "";
      if (raw && !/^(log|review|edit|запись|обзор|рецензия|редактировать)/i.test(raw)) {
        return raw.slice(0, 200);
      }
    }
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const txt = el ? (el.textContent || "").trim() : "";
      if (txt) return txt.slice(0, 200);
    }
    return "";
  }
  async function decodeCarrierString(s) {
    if (!s) throw new GQError("not-gq");
    if (s.startsWith("vs:")) return decodeCarrier({ kind: "vs", bytes: fromB64url(s.slice(3)) });
    return decodeCarrier(s);
  }
  async function docFromCarrier(s) {
    if (!s) return null;
    try {
      const raw = await decodeCarrierString(s);
      return normalizeReview(raw, { sanitizeHtml: (h2) => sanitizeHtml(h2) });
    } catch {
      return null;
    }
  }
  function draftStorageKey(key) {
    return SS_DRAFT + ":" + (key || "default");
  }
  function rememberDraft(carrier, key) {
    if (!carrier) return;
    try {
      sessionStorage.setItem(draftStorageKey(key), carrier);
    } catch {
    }
  }
  function readDraft(key) {
    try {
      return sessionStorage.getItem(draftStorageKey(key)) || "";
    } catch {
      return "";
    }
  }
  async function findExistingDoc(ta, key) {
    const tries = [];
    const val = ta ? String(ta.value || "") : "";
    const fromField = carrierKeyFromText(val);
    if (fromField) tries.push(fromField);
    const draft = readDraft(key);
    if (draft && !val.trim()) tries.push(draft);
    const seen = /* @__PURE__ */ new Set();
    for (const c of tries) {
      if (!c || seen.has(c)) continue;
      seen.add(c);
      const doc = await docFromCarrier(c);
      if (doc) return doc;
    }
    if (lastDoc && preview && preview.textarea === ta) return lastDoc;
    return null;
  }
  var escHtml = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function cleanPlainText(raw) {
    return String(raw || "").replace(/[\uFE00-\uFE0F]|\uDB40[\uDD00-\uDDEF]/g, "").trim();
  }
  async function sendInit() {
    const ta = getActiveTextarea();
    const key = reviewContextKey(ta);
    const val = ta ? cleanPlainText(ta.value) : "";
    const mode = val ? "edit" : "new";
    const gameTitle = detectGameTitle(ta);
    const s = getSettings();
    post({
      type: "gq:init",
      steamCountry: s.steamCountry || "KZ",
      postId: key,
      mode,
      gameTitle
    });
    const doc = await findExistingDoc(ta, key);
    if (doc) {
      post({ type: "gq:load", doc });
      return;
    }
    if (val) {
      const html = val.split("\n").map((l) => escHtml(l)).join("<br>");
      post({
        type: "gq:load",
        soft: true,
        doc: { title: "", game: gameTitle || "", blocks: [{ type: "text", html }] }
      });
    }
  }
  function currentTheme() {
    return normalizeTheme((getSettings() || {}).gqTheme || DEFAULT_THEME);
  }
  function setTextareaHidden(ta, on) {
    if (!ta) return;
    const bar = boundTextareas.get(ta);
    if (on) {
      ta.setAttribute("data-gq-composer-hidden", "");
      if (bar) bar.setAttribute("data-gq-composer-hidden", "");
    } else {
      ta.removeAttribute("data-gq-composer-hidden");
      if (bar) bar.removeAttribute("data-gq-composer-hidden");
    }
  }
  function hidePreview() {
    if (preview) {
      if (preview.host) preview.host.remove();
      if (preview.textarea) setTextareaHidden(preview.textarea, false);
    }
    preview = null;
  }
  function showComposerPreview(ta, doc, { carrier, locked } = {}) {
    if (!ta || !ta.isConnected || !doc) return null;
    lastDoc = doc;
    const ctxKey = reviewContextKey(ta);
    if (carrier) rememberDraft(carrier, ctxKey);
    injectFonts();
    const keepLocked = !!(locked || preview && preview.textarea === ta && preview.locked);
    hidePreview();
    const wrap = document.createElement("div");
    wrap.setAttribute("data-gq-preview", "");
    wrap.setAttribute("data-gq-frames", String(countGalleryFrames(doc)));
    wrap.setAttribute("data-gq-theme", currentTheme());
    wrap.setAttribute("data-i18n-ignore", "");
    const bar = document.createElement("div");
    bar.className = "gq-preview-bar";
    const label = document.createElement("span");
    label.append("\u2728 GameQuill \xB7 ");
    const ro = document.createElement("span");
    ro.className = "gq-ro";
    ro.textContent = "\u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440";
    label.append(ro);
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.setAttribute("data-gq-edit", "");
    editBtn.textContent = "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0432 GameQuill";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ghost";
    toggle.setAttribute("data-gq-toggle", "");
    toggle.textContent = "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0442\u0435\u043A\u0441\u0442 \u0441\u0430\u0439\u0442\u0430";
    bar.append(label, editBtn, toggle);
    const body = document.createElement("div");
    body.setAttribute("data-gq-preview-body", "");
    const root = body.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = render_default + "\n" + gq_cards_default;
    const inner = document.createElement("div");
    inner.className = "wrap";
    inner.setAttribute("data-gq-theme", currentTheme());
    inner.append(renderReview(document, doc));
    root.append(style, inner);
    wrap.append(bar, body);
    ta.after(wrap);
    let showing = true;
    const apply = () => {
      setTextareaHidden(ta, showing);
      wrap.classList.toggle("is-plain", !showing);
      body.style.display = showing ? "" : "none";
      toggle.textContent = showing ? "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0442\u0435\u043A\u0441\u0442 \u0441\u0430\u0439\u0442\u0430" : "\u2728 \u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435 GameQuill";
    };
    editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openEditor(ta);
    });
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showing = !showing;
      apply();
    });
    apply();
    wrap._gqUpdateTheme = (newTheme) => {
      const nt = normalizeTheme(newTheme);
      wrap.setAttribute("data-gq-theme", nt);
      inner.setAttribute("data-gq-theme", nt);
    };
    preview = {
      host: wrap,
      textarea: ta,
      showing: () => showing,
      locked: keepLocked,
      fresh: Date.now(),
      key: carrier || ""
    };
    return wrap;
  }
  function writeIntoTextarea(ta, text) {
    if (!ta) return false;
    ta.focus();
    ta.value = text;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  async function onTransfer(m) {
    if (!Array.isArray(m.ops) || typeof m.plain !== "string") return;
    const ta = getActiveTextarea();
    if (!ta) {
      post({
        type: "gq:transfer-result",
        ok: false,
        message: "\u041F\u043E\u043B\u0435 \u043E\u0442\u0437\u044B\u0432\u0430 (#review) \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0444\u043E\u0440\u043C\u0443 \u043E\u0442\u0437\u044B\u0432\u0430 \u0438 \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430."
      });
      return;
    }
    writeIntoTextarea(ta, m.plain);
    const carrier = m.carrier || carrierKeyFromText(m.plain || "") || "";
    const transferred = m.doc && typeof m.doc === "object" ? normalizeReview(m.doc, { sanitizeHtml: (h2) => sanitizeHtml(h2) }) : null;
    const doc = transferred || carrier && await docFromCarrier(carrier) || lastDoc;
    if (doc) {
      const el = showComposerPreview(ta, doc, { carrier: carrierKeyFromText(m.plain) || carrier, locked: true });
      if (el && preview) preview.fresh = Date.now();
    }
    post({
      type: "gq:transfer-result",
      ok: true,
      message: "\u0413\u043E\u0442\u043E\u0432\u043E: \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0435\u043D\u043E \u0432 \u043E\u0442\u0437\u044B\u0432. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xABSave\xBB / \xAB\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C\xBB \u0432 \u0444\u043E\u0440\u043C\u0435 Backloggd."
    });
    closeEditor();
    toast("GameQuill: \u043E\u0431\u0437\u043E\u0440 \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0451\u043D \u0432 \u0444\u043E\u0440\u043C\u0443. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xABSave\xBB / \xAB\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C\xBB \u043D\u0430 \u0441\u0430\u0439\u0442\u0435.");
  }
  function onUploadImage(m) {
    post({
      type: "gq:upload-result",
      reqId: m && m.reqId,
      ok: false,
      code: "unsupported",
      error: "Backloggd \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u0444\u0430\u0439\u043B\u043E\u0432 \u0441 \u041F\u041A \u0432 \u043E\u0442\u0437\u044B\u0432\u044B"
    });
  }
  function onMessage(e) {
    if (!ui || !ui.frame || e.source !== ui.frame.contentWindow) return;
    if (e.origin !== EXT_ORIGIN()) return;
    const m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "gq:ready") {
      frameReady = true;
      sendInit();
    } else if (m.type === "gq:close") {
      closeEditor();
    } else if (m.type === "gq:transfer") {
      onTransfer(m);
    } else if (m.type === "gq:upload-image") {
      onUploadImage(m);
    }
  }
  function ensureTextareaBar(ta) {
    if (!ta || !ta.isConnected || !ta.parentNode) return;
    let bar = boundTextareas.get(ta);
    if (bar && bar.isConnected) return;
    bar = document.createElement("div");
    bar.className = "gq-composer-bar";
    bar.setAttribute("data-gq-bar", "");
    bar.setAttribute("data-i18n-ignore", "");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gq-open-btn";
    btn.textContent = "\u2728 \u041E\u0444\u043E\u0440\u043C\u0438\u0442\u044C \u0432 GameQuill";
    btn.title = "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u043D\u044B\u0439 \u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440 \u043E\u0431\u0437\u043E\u0440\u043E\u0432 GameQuill";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openEditor(ta);
    });
    const hint = document.createElement("span");
    hint.className = "gq-open-hint";
    hint.textContent = "\u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438 \u0438\u0433\u0440, \u0441\u043F\u043E\u0439\u043B\u0435\u0440\u044B, \u043F\u043B\u044E\u0441\u044B/\u043C\u0438\u043D\u0443\u0441\u044B, \u043E\u0446\u0435\u043D\u043A\u0438";
    bar.append(btn, hint);
    ta.before(bar);
    ta.addEventListener("input", tick);
    boundTextareas.set(ta, bar);
  }
  async function syncPreview() {
    const list = findReviewTextareas(document);
    if (!list.length) {
      hidePreview();
      return;
    }
    for (const ta2 of list) {
      ensureTextareaBar(ta2);
    }
    const ta = getActiveTextarea();
    if (!ta) {
      hidePreview();
      return;
    }
    const txt = String(ta.value || "");
    const key = carrierKeyFromText(txt);
    if (key) {
      if (preview && preview.host.isConnected && preview.textarea === ta && lastDoc && preview.key === key) return;
      const doc = await docFromCarrier(key);
      if (doc) {
        const el = showComposerPreview(ta, doc, { carrier: key });
        if (el && preview) preview.key = key;
        return;
      }
    }
    if (lastDoc && looksLikePayloadText(txt)) {
      if (preview && preview.host.isConnected && preview.textarea === ta) return;
      showComposerPreview(ta, lastDoc);
      return;
    }
    if (!looksLikePayloadText(txt)) {
      if (preview && preview.textarea === ta && (preview.locked || Date.now() - (preview.fresh || 0) < 6e4) && txt.trim()) {
        if (!preview.host || !preview.host.isConnected) showComposerPreview(ta, lastDoc, { locked: true });
        return;
      }
      hidePreview();
      lastDoc = null;
    }
  }
  var queued2 = false;
  function tick() {
    if (queued2) return;
    queued2 = true;
    setTimeout(() => {
      queued2 = false;
      syncPreview().catch(() => {
      });
    }, 150);
  }
  function refreshComposerTheme(theme) {
    if (preview && preview.host && typeof preview.host._gqUpdateTheme === "function") {
      preview.host._gqUpdateTheme(theme);
    }
  }
  function startComposer() {
    if (globalThis.__GQ_COMPOSER__) return;
    globalThis.__GQ_COMPOSER__ = true;
    window.addEventListener("message", onMessage);
    document.addEventListener(
      "focusin",
      (e) => {
        if (ui && ui.overlay.classList.contains("on")) {
          if (e.target === host || host && host.contains(e.target)) {
            e.stopImmediatePropagation();
          }
        }
      },
      true
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && ui && ui.overlay.classList.contains("on")) {
        e.preventDefault();
        e.stopPropagation();
        closeEditor();
      }
    });
    const mo = new MutationObserver(tick);
    const go = () => {
      mo.observe(document.documentElement, { childList: true, subtree: true });
      tick();
      setInterval(tick, 1200);
    };
    if (document.body) go();
    else document.addEventListener("DOMContentLoaded", go, { once: true });
  }

  // src/gamequill-content/index.js
  async function startGameQuill() {
    const s = await loadSettings();
    startComposer();
    startViewer({ enabled: s.showGameQuill !== false });
    bindSettingsUpdates((next, changes) => {
      if (changes.showGameQuill) {
        setViewerEnabled(next.showGameQuill !== false);
      }
      if (changes.gqTheme) {
        refreshViewerThemes(next.gqTheme);
        refreshComposerTheme(next.gqTheme);
      }
    });
  }
  startGameQuill().catch((err) => console.warn("[Backloggd i18n] GameQuill init failed:", err));
})();
