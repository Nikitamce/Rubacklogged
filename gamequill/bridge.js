(() => {
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
  function base64ToBytes(b64) {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(String(b64), "base64"));
    const bin = atob(String(b64));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function isRasterImageType(type) {
    return /^(image\/(png|jpe?g|webp|gif))$/i.test(String(type || ""));
  }
  function isGifBytes(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : bytes ? new Uint8Array(bytes) : new Uint8Array();
    return u8.length >= 6 && u8[0] === 71 && u8[1] === 73 && u8[2] === 70 && u8[3] === 56;
  }
  function shouldPreserveAnimation(file, bytes) {
    const type = file && file.type || "";
    const name = file && file.name || "";
    if (/^image\/gif$/i.test(type) || /\.gif$/i.test(name)) return true;
    if (bytes && isGifBytes(bytes)) return true;
    if (bytes && inspectImageBytes(bytes).animated) return true;
    if (/^image\/webp$/i.test(type) && bytes && inspectImageBytes(bytes).type === "webp" && inspectImageBytes(bytes).animated) return true;
    return false;
  }
  var MAX_GALLERY_ITEMS = 10;
  var CAPTION_MAX = 200;
  function gifFrameCount(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (!isGifBytes(u8) || u8.length < 14) return 0;
    const gct = u8[10] & 128;
    const gctSize = gct ? 3 * 2 ** ((u8[10] & 7) + 1) : 0;
    let i = 13 + gctSize;
    let frames = 0;
    while (i < u8.length) {
      const b = u8[i];
      if (b === 59) break;
      if (b === 44) {
        if (i + 10 > u8.length) break;
        const lct = u8[i + 9] & 128;
        const lsz = lct ? 3 * 2 ** ((u8[i + 9] & 7) + 1) : 0;
        i = i + 10 + lsz;
        if (i >= u8.length) break;
        i += 1;
        while (i < u8.length && u8[i] !== 0) i += 1 + u8[i];
        i += 1;
        frames += 1;
        continue;
      }
      if (b === 33) {
        i += 2;
        while (i < u8.length && u8[i] !== 0) i += 1 + u8[i];
        i += 1;
        continue;
      }
      i += 1;
    }
    return frames;
  }
  function webpInfo(u8) {
    const out = { type: "webp", animated: false, frames: 0 };
    if (u8.length < 16) return out;
    let i = 12;
    while (i + 8 <= u8.length) {
      const tag = String.fromCharCode(u8[i], u8[i + 1], u8[i + 2], u8[i + 3]);
      const size = u8[i + 4] | u8[i + 5] << 8 | u8[i + 6] << 16 | u8[i + 7] << 24;
      if (tag === "VP8X" && i + 12 <= u8.length) {
        if (u8[i + 8] & 2) out.animated = true;
      }
      if (tag === "ANIM") out.animated = true;
      if (tag === "ANMF") {
        out.animated = true;
        out.frames += 1;
      }
      i += 8 + size + (size & 1);
    }
    return out;
  }
  function inspectImageBytes(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : bytes ? new Uint8Array(bytes) : new Uint8Array();
    if (isGifBytes(u8)) {
      const frames = gifFrameCount(u8);
      return { type: "gif", animated: frames > 1, frames };
    }
    if (u8.length >= 16 && u8[0] === 82 && u8[1] === 73 && u8[2] === 70 && u8[3] === 70 && u8[8] === 87 && u8[9] === 69 && u8[10] === 66 && u8[11] === 80) {
      return webpInfo(u8);
    }
    if (u8.length >= 3 && u8[0] === 255 && u8[1] === 216 && u8[2] === 255) return { type: "jpeg", animated: false, frames: 1 };
    if (u8.length >= 8 && u8[0] === 137 && u8[1] === 80 && u8[2] === 78 && u8[3] === 71) return { type: "png", animated: false, frames: 1 };
    return { type: "unknown", animated: false, frames: 0 };
  }
  var FLAT_GIF_HINT = "\u0421\u0435\u0440\u0432\u0435\u0440 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u043B \u0433\u0438\u0444\u043A\u0443 \u043A\u0430\u043A \u0441\u0442\u0430\u0442\u0438\u0447\u043D\u044B\u0439 \u043A\u0430\u0434\u0440. \u0427\u0442\u043E\u0431\u044B \u0430\u043D\u0438\u043C\u0430\u0446\u0438\u044F \u0442\u043E\u0447\u043D\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u043B\u0430, \u0432\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0441\u0441\u044B\u043B\u043A\u0443 \u0441 Giphy, Tenor \u0438\u043B\u0438 Imgur \u043D\u0430 \u0441\u0430\u043C \u0444\u0430\u0439\u043B .gif.";
  var COMPRESS_MAX_EDGE = 1600;
  var COMPRESS_QUALITY = 0.82;
  function bytesToBase64(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (typeof Buffer !== "undefined") return Buffer.from(u8).toString("base64");
    let s = "";
    const chunk = 32768;
    for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode(...u8.subarray(i, i + chunk));
    return btoa(s);
  }
  function dataUrlToBytes(dataUrl) {
    const m = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || "").replace(/\s+/g, ""));
    if (!m) return null;
    return { type: m[1], bytes: base64ToBytes(m[2]) };
  }
  function normalizeExternalGifUrl(v) {
    try {
      const raw = String(v || "").trim();
      if (!raw) return "";
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") return "";
      if (u.username || u.password) return "";
      u.protocol = "https:";
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      if (host === "giphy.com" || host.endsWith(".giphy.com")) {
        const media = /\/media\/(?:[^/]+\/)*([A-Za-z0-9]+)(?:\/|$)/.exec(u.pathname);
        const page = /\/gifs\/(?:[\w-]*-)?([A-Za-z0-9]+)\/?$/.exec(u.pathname);
        const id = media && media[1] || page && page[1];
        if (id) return "https://media.giphy.com/media/" + id + "/giphy.gif";
        if (/\.gif$/i.test(u.pathname)) {
          u.search = "";
          u.hash = "";
          return u.href;
        }
        return "";
      }
      if (host === "tenor.com" || host.endsWith(".tenor.com")) {
        if (/\.gif$/i.test(u.pathname)) {
          u.search = "";
          u.hash = "";
          return u.href;
        }
        return "";
      }
      return "";
    } catch {
      return "";
    }
  }
  function probeImageLoad(url, opts = {}) {
    const timeout = opts.timeout ?? 15e3;
    const Img = opts.Image || (typeof Image !== "undefined" ? Image : null);
    const href = safeUserImageUrl(url, opts);
    if (!href || href.startsWith("data:")) {
      if (href.startsWith("data:")) return Promise.resolve({ ok: true, width: 0, height: 0, url: href });
      return Promise.resolve({ ok: false, url: "" });
    }
    if (!Img) return Promise.resolve({ ok: false, url: href, code: "no-image" });
    return new Promise((resolve) => {
      const img = new Img();
      let done = false;
      const finish = (res) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        img.onload = img.onerror = null;
        resolve(res);
      };
      const t = setTimeout(() => finish({ ok: false, url: href, code: "timeout" }), timeout);
      img.onload = () => finish({ ok: true, width: img.naturalWidth || 0, height: img.naturalHeight || 0, url: href });
      img.onerror = () => finish({ ok: false, url: href, code: "error" });
      try {
        img.referrerPolicy = "no-referrer";
      } catch {
      }
      img.src = href;
    });
  }
  async function compressImage(source, opts = {}) {
    const maxEdge = opts.maxEdge ?? COMPRESS_MAX_EDGE;
    const quality = opts.quality ?? COMPRESS_QUALITY;
    const maxBytes = opts.maxBytes || 0;
    const doc = opts.document || (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.createElement !== "function") throw new Error("compress requires a document");
    const img = await loadImage(source, doc, opts);
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("bad image");
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    const canvas = doc.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    if (typeof img._revoke === "function") img._revoke();
    const tryType = (type2, q) => new Promise((resolve) => {
      if (typeof canvas.toBlob !== "function") {
        try {
          const dataUrl2 = canvas.toDataURL(type2, q);
          resolve(dataUrl2 && dataUrl2.startsWith("data:") ? dataUrlToBlob(dataUrl2) : null);
        } catch {
          resolve(null);
        }
        return;
      }
      canvas.toBlob((b) => resolve(b), type2, q);
    });
    let type = "image/webp";
    let blob = await tryType(type, quality);
    if (!blob || !blob.size) {
      type = "image/jpeg";
      blob = await tryType(type, quality);
    }
    if (!blob) throw new Error("compress failed");
    if (maxBytes && blob.size > maxBytes) {
      for (const q of [0.7, 0.55, 0.4, 0.28]) {
        const smaller = await tryType(type, q);
        if (smaller && smaller.size <= maxBytes) {
          blob = smaller;
          break;
        }
        if (smaller && smaller.size < blob.size) blob = smaller;
      }
    }
    const dataUrl = await blobToDataUrl(blob);
    return { blob, dataUrl, width: w, height: h, type: blob.type || type };
  }
  function dataUrlToBlob(dataUrl) {
    const parsed = dataUrlToBytes(dataUrl);
    if (!parsed) return null;
    return new Blob([parsed.bytes], { type: parsed.type });
  }
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => reject(new Error("read failed"));
      fr.readAsDataURL(blob);
    });
  }
  function loadImage(source, doc, opts) {
    return new Promise((resolve, reject) => {
      const img = doc.createElement ? new (opts.Image || (typeof Image !== "undefined" ? Image : null) || function() {
      })() : null;
      if (!img) return reject(new Error("no Image"));
      const done = () => resolve(img);
      const fail = () => {
        if (typeof img._revoke === "function") img._revoke();
        reject(new Error("bad image"));
      };
      img.onload = done;
      img.onerror = fail;
      if (typeof source === "string") {
        img.src = source;
        return;
      }
      if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" && (source instanceof Blob || typeof File !== "undefined" && source instanceof File)) {
        const obj = URL.createObjectURL(source);
        img._revoke = () => URL.revokeObjectURL(obj);
        img.src = obj;
        return;
      }
      reject(new Error("unsupported image source"));
    });
  }

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
    const stars2 = (n) => "\u2605".repeat(Math.max(1, Math.min(5, Math.round(n / 2))));
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
  function hasContent(r) {
    if (!r) return false;
    return !!(r.title.trim() || r.score || r.blocks.length || r.pros.length || r.cons.length || r.aspects.some((a) => a.score > 0));
  }

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\shared\gq-demo.js
  var DEMO_CONFIRM = "\u0412 \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u043C \u043E\u0431\u0437\u043E\u0440\u0435 \u0443\u0436\u0435 \u0435\u0441\u0442\u044C \u0442\u0435\u043A\u0441\u0442. \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u044C \u0435\u0433\u043E \u0442\u0435\u0441\u0442\u043E\u0432\u044B\u043C \u043E\u0431\u0437\u043E\u0440\u043E\u043C \xAB\u041D\u0435\u043E\u043D\u043E\u0432\u044B\u0439 \u0440\u0435\u043A\u0432\u0438\u0435\u043C \u043F\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u0447\u0435\u0441\u0442\u0432\u0443\xBB? \u0422\u0435\u043A\u0443\u0449\u0435\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435 \u0431\u0443\u0434\u0435\u0442 \u043F\u043E\u0442\u0435\u0440\u044F\u043D\u043E.";
  var DEMO_GAME = {
    id: "neon-requiem",
    title: "Neon Requiem",
    year: 2025,
    dev: "Voidline Studio",
    pub: "Nova Interactive",
    genres: ["Action RPG", "\u041A\u0438\u0431\u0435\u0440\u043F\u0430\u043D\u043A", "\u041E\u0442\u043A\u0440\u044B\u0442\u044B\u0439 \u043C\u0438\u0440"],
    plat: ["PC", "PS5", "Xbox Series"],
    pal: ["#ff2fb3", "#12062b", "#22d3ee"],
    r: { backloggd: 8.4, igdb: 82, metacritic: 86, hltb: "38 \u0447." },
    panaxReactions: { legendary: 19.6, awesome: 41.2, good: 37.3, decent: 0, dislike: 2, awful: 0 },
    links: {
      backloggd: "https://www.backloggd.com/games/neon-requiem/",
      igdb: "https://www.igdb.com/games/neon-requiem",
      steam: "https://store.steampowered.com/app/2448510/Neon_Requiem/",
      rawg: "https://rawg.io/games/neon-requiem",
      metacritic: "https://www.metacritic.com/game/neon-requiem",
      hltb: "https://howlongtobeat.com/game?id=118402"
    },
    steam: { app: 2448510, price: "1 999 \u20BD", old: "2 499 \u20BD", disc: "-20%", date: "14 \u043C\u0430\u0440. 2025", tags: ["\u042D\u043A\u0448\u0435\u043D", "RPG", "\u041A\u0438\u0431\u0435\u0440\u043F\u0430\u043D\u043A", "\u0421\u044E\u0436\u0435\u0442"] },
    trailer: { t: "Neon Requiem \u2014 \u043E\u0444\u0438\u0446\u0438\u0430\u043B\u044C\u043D\u044B\u0439 \u0442\u0440\u0435\u0439\u043B\u0435\u0440 \u0437\u0430\u043F\u0443\u0441\u043A\u0430", ch: "Voidline Studio", dur: "2:14", url: "https://www.youtube.com/watch?v=neonrequiem-trailer" },
    ws: [
      { t: "Neon Requiem: \u0424\u043E\u0442\u043E\u0440\u0435\u0436\u0438\u043C Deluxe", a: "KiraMods", s: "12 480" },
      { t: "\u041A\u043E\u0441\u0442\u044E\u043C \xAB\u041D\u0435\u043E\u043D\u043E\u0432\u044B\u0439 \u0441\u0430\u043C\u0443\u0440\u0430\u0439\xBB", a: "Rin_Art", s: "5 213" }
    ]
  };
  var seq = 0;
  var defaultUid = () => "demo-" + ++seq + "-" + Math.random().toString(36).slice(2, 8);
  function makeDemoReview(opts = {}) {
    const uid2 = opts.uid || defaultUid;
    const g = opts.game || DEMO_GAME;
    const cover = opts.cover || g.cover || "";
    const gameData = {
      gameId: g.id,
      title: g.title,
      year: g.year,
      dev: g.dev,
      pub: g.pub,
      genres: g.genres.slice(),
      plat: g.plat.slice(),
      cover,
      links: {
        backloggd: g.links.backloggd,
        igdb: g.links.igdb,
        steam: g.links.steam,
        rawg: g.links.rawg
      },
      ratings: { backloggd: g.r.backloggd, igdb: g.r.igdb },
      panaxReactions: g.panaxReactions ? { ...g.panaxReactions } : null,
      source: "Backloggd"
    };
    const steamData = {
      title: g.title,
      app: String(g.steam.app),
      price: g.steam.price,
      old: g.steam.old,
      disc: g.steam.disc,
      date: g.steam.date,
      tags: g.steam.tags.slice(),
      cover,
      url: g.links.steam
    };
    const ytData = {
      title: g.trailer.t,
      channel: g.trailer.ch,
      dur: g.trailer.dur,
      url: g.trailer.url,
      cover
    };
    return {
      title: "\u041D\u0435\u043E\u043D\u043E\u0432\u044B\u0439 \u0440\u0435\u043A\u0432\u0438\u0435\u043C \u043F\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u0447\u0435\u0441\u0442\u0432\u0443",
      game: g.title,
      score: 8,
      recommend: "yes",
      aspects: [
        { id: uid2(), name: "\u0421\u044E\u0436\u0435\u0442", score: 9, unrated: "unsure" },
        { id: uid2(), name: "\u0413\u0440\u0430\u0444\u0438\u043A\u0430", score: 10, unrated: "unsure" },
        { id: uid2(), name: "\u0413\u0435\u0439\u043C\u043F\u043B\u0435\u0439", score: 8, unrated: "unsure" },
        { id: uid2(), name: "\u041E\u043F\u0442\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u044F", score: 0, unrated: "unsure" },
        { id: uid2(), name: "\u041B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F", score: 7, unrated: "unsure" },
        { id: uid2(), name: "\u0420\u0435\u0438\u0433\u0440\u0430\u0431\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C", score: 0, unrated: "na" }
      ],
      blocks: [
        { id: uid2(), type: "game", data: gameData },
        { id: uid2(), type: "text", html: "<b>Neon Requiem</b> \u2014 \u044D\u0442\u043E \u0442\u043E\u0442 \u0440\u0435\u0434\u043A\u0438\u0439 \u0441\u043B\u0443\u0447\u0430\u0439, \u043A\u043E\u0433\u0434\u0430 \u044D\u043A\u0448\u0435\u043D \u043E\u0442 \u043F\u0435\u0440\u0432\u043E\u0433\u043E \u043B\u0438\u0446\u0430 \u043D\u0435 \u043F\u044B\u0442\u0430\u0435\u0442\u0441\u044F \u0431\u044B\u0442\u044C \u0432\u0441\u0435\u043C \u0441\u0440\u0430\u0437\u0443. \u041F\u0435\u0440\u0432\u044B\u0435 \u0434\u0432\u0430 \u0447\u0430\u0441\u0430 \u0438\u0433\u0440\u0430 \u0431\u0443\u043A\u0432\u0430\u043B\u044C\u043D\u043E <mark>\u0431\u0435\u0440\u0451\u0442 \u0432\u0430\u0441 \u0437\u0430 \u0448\u043A\u0438\u0440\u043A\u0443</mark> \u0438 \u0442\u0430\u0449\u0438\u0442 \u0441\u043A\u0432\u043E\u0437\u044C \u043D\u0435\u043E\u043D\u043E\u0432\u044B\u0435 \u0442\u0440\u0443\u0449\u043E\u0431\u044B, \u043D\u0435 \u0434\u0430\u0432\u0430\u044F \u043D\u0438 \u0441\u0435\u043A\u0443\u043D\u0434\u044B \u043D\u0430 \u043F\u0435\u0440\u0435\u0434\u044B\u0448\u043A\u0443." },
        { id: uid2(), type: "h2", html: "\u0421\u044E\u0436\u0435\u0442 \u0431\u0435\u0437 \u0441\u043F\u043E\u0439\u043B\u0435\u0440\u043E\u0432" },
        { id: uid2(), type: "text", html: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043D\u0430\u0451\u043C\u043D\u0438\u0446\u044B \u0412\u0435\u043A\u0441\u044B \u043F\u043E\u0434\u0430\u043D\u0430 \u0447\u0435\u0440\u0435\u0437 <u>\u043A\u043E\u0440\u043E\u0442\u043A\u0438\u0435 \u0431\u0440\u0438\u0444\u0438\u043D\u0433\u0438</u> \u0438 \u0434\u0438\u0430\u043B\u043E\u0433\u0438 \u0432 \u043F\u0443\u0442\u0438 \u2014 \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u0440\u043E\u043B\u0438\u043A\u0430 \u0434\u043E\u043B\u044C\u0448\u0435 \u0434\u0432\u0443\u0445 \u043C\u0438\u043D\u0443\u0442. \u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0439 \u0434\u0435\u0440\u0436\u0438\u0442 \u0438\u043D\u0442\u0440\u0438\u0433\u0443 \u0434\u043E \u0444\u0438\u043D\u0430\u043B\u0430, \u0430 \u0444\u0438\u043D\u0430\u043B, \u043A \u0441\u043B\u043E\u0432\u0443, <i>\u0437\u0430\u0432\u0438\u0441\u0438\u0442 \u043E\u0442 \u0442\u0440\u0451\u0445 \u0432\u0430\u0448\u0438\u0445 \u0440\u0435\u0448\u0435\u043D\u0438\u0439</i>." },
        { id: uid2(), type: "quote", html: "\xAB\u0413\u043E\u0440\u043E\u0434 \u043D\u0435 \u0441\u043F\u0430\u0441\u0430\u044E\u0442. \u0412 \u043D\u0451\u043C \u043F\u0440\u043E\u0441\u0442\u043E \u0432\u044B\u0431\u0438\u0440\u0430\u044E\u0442, \u043A\u0442\u043E \u0432\u044B\u0436\u0438\u0432\u0435\u0442.\xBB \u2014 \u0412\u0435\u043A\u0441\u0430, \u0442\u0440\u0435\u0442\u0438\u0439 \u0430\u043A\u0442" },
        { id: uid2(), type: "h3", html: "\u0413\u0435\u0439\u043C\u043F\u043B\u0435\u0439 \u0438 \u0438\u043C\u043F\u043B\u0430\u043D\u0442\u044B" },
        { id: uid2(), type: "text", html: "\u0411\u043E\u0435\u0432\u0430\u044F \u0441\u0438\u0441\u0442\u0435\u043C\u0430 \u0441\u0442\u0440\u043E\u0438\u0442\u0441\u044F \u0432\u043E\u043A\u0440\u0443\u0433 <code>\u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0438\u043C\u043F\u043B\u0430\u043D\u0442\u043E\u0432</code> \u043D\u0430 \u043B\u0435\u0442\u0443: \u0440\u044B\u0432\u043E\u043A, \u0437\u0430\u043C\u0435\u0434\u043B\u0435\u043D\u0438\u0435 \u0432\u0440\u0435\u043C\u0435\u043D\u0438, \u0432\u0437\u043B\u043E\u043C \u0442\u0443\u0440\u0435\u043B\u0435\u0439. \u041A\u043E\u043C\u0431\u043E \u0441\u043E\u0431\u0438\u0440\u0430\u044E\u0442\u0441\u044F \u0438\u043D\u0442\u0443\u0438\u0442\u0438\u0432\u043D\u043E, \u0430 \u0441\u043B\u043E\u0436\u043D\u043E\u0441\u0442\u044C \u0447\u0435\u0441\u0442\u043D\u043E \u0440\u0430\u0441\u0442\u0451\u0442." },
        { id: uid2(), type: "spoiler", html: "\u0424\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u043E\u0432\u043E\u0440\u043E\u0442 \u0441 \u0434\u0432\u043E\u0439\u043D\u0438\u043A\u043E\u043C \u0412\u0435\u043A\u0441\u044B \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u043C\u0435\u043D\u044F\u0435\u0442 \u043C\u043E\u0442\u0438\u0432\u0430\u0446\u0438\u044E \u0430\u043D\u0442\u0430\u0433\u043E\u043D\u0438\u0441\u0442\u0430 \u2014 \u0438 \u0438\u043C\u0435\u043D\u043D\u043E \u0437\u0430 \u044D\u0442\u043E \u0438\u0433\u0440\u0435 \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0441\u0442\u0438\u0442\u044C \u0441\u043B\u0430\u0431\u044B\u0439 \u0442\u0440\u0435\u0442\u0438\u0439 \u0430\u043A\u0442.", hidden: true },
        { id: uid2(), type: "divider", data: { style: 1 } },
        { id: uid2(), type: "youtube", data: ytData },
        { id: uid2(), type: "h2", html: "\u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0447\u0430\u0441\u0442\u044C" },
        { id: uid2(), type: "steam", data: steamData },
        { id: uid2(), type: "text", html: "\u041D\u0430 \u0440\u0435\u043B\u0438\u0437\u0435 \u0438\u0433\u0440\u0430 <s>\u0440\u0430\u0431\u043E\u0442\u0430\u043B\u0430 \u0438\u0434\u0435\u0430\u043B\u044C\u043D\u043E</s> \u043F\u0440\u043E\u0441\u0435\u0434\u0430\u043B\u0430 \u0434\u043E 45 FPS \u0432 \u0446\u0435\u043D\u0442\u0440\u0435 \u0433\u043E\u0440\u043E\u0434\u0430, \u043D\u043E \u043F\u0430\u0442\u0447 1.0.3 \u043F\u043E\u0447\u0442\u0438 \u0432\u0441\u0451 \u043F\u043E\u0447\u0438\u043D\u0438\u043B. \u041F\u043E\u043B\u043D\u043E\u0435 \u043F\u0440\u043E\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u0435 \u0437\u0430\u043D\u044F\u043B\u043E \u0443 \u043C\u0435\u043D\u044F <b>34 \u0447\u0430\u0441\u0430</b>." },
        { id: uid2(), type: "workshop", data: { title: g.ws[0].t, author: g.ws[0].a, subs: g.ws[0].s, game: g.title, url: "https://steamcommunity.com/sharedfiles/filedetails/?id=299411220", cover } },
        { id: uid2(), type: "h2", html: "\u0418\u0442\u043E\u0433" },
        { id: uid2(), type: "text", html: 'Neon Requiem \u2014 \u043B\u0443\u0447\u0448\u0438\u0439 \u043A\u0438\u0431\u0435\u0440\u043F\u0430\u043D\u043A-\u044D\u043A\u0448\u0435\u043D \u0441\u043E \u0432\u0440\u0435\u043C\u0451\u043D \u0436\u0430\u043D\u0440\u043E\u0432\u043E\u0433\u043E \u0440\u0435\u043D\u0435\u0441\u0441\u0430\u043D\u0441\u0430. \u0411\u0435\u0440\u0438\u0442\u0435, \u0435\u0441\u043B\u0438 \u043B\u044E\u0431\u0438\u0442\u0435 <a class="lnk" href="https://www.backloggd.com/games/neon-requiem/" target="_blank" rel="noopener">\u0441\u044E\u0436\u0435\u0442\u043D\u044B\u0435 \u043F\u0435\u0441\u043E\u0447\u043D\u0438\u0446\u044B</a> \u0438 \u0433\u043E\u0442\u043E\u0432\u044B \u043F\u0440\u043E\u0441\u0442\u0438\u0442\u044C \u043C\u0435\u043B\u043A\u0438\u0435 \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043E\u0433\u0440\u0435\u0445\u0438 \u0440\u0430\u0434\u0438 \u043F\u043E\u0442\u0440\u044F\u0441\u0430\u044E\u0449\u0435\u0439 \u0430\u0442\u043C\u043E\u0441\u0444\u0435\u0440\u044B.' }
      ],
      pros: [
        { id: uid2(), text: "\u041D\u0435\u0432\u0435\u0440\u043E\u044F\u0442\u043D\u044B\u0439 \u0430\u0440\u0442-\u0434\u0438\u0437\u0430\u0439\u043D \u0438 \u0440\u0430\u0431\u043E\u0442\u0430 \u0441\u043E \u0441\u0432\u0435\u0442\u043E\u043C" },
        { id: uid2(), text: "\u0411\u043E\u0435\u0432\u0430\u044F \u0441\u0438\u0441\u0442\u0435\u043C\u0430 \u0441 \u0438\u043C\u043F\u043B\u0430\u043D\u0442\u0430\u043C\u0438 \u2014 \u043B\u0443\u0447\u0448\u0430\u044F \u0432 \u0436\u0430\u043D\u0440\u0435" },
        { id: uid2(), text: "\u0416\u0438\u0432\u043E\u0439 \u0433\u043E\u0440\u043E\u0434, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u0440\u0435\u0430\u0433\u0438\u0440\u0443\u0435\u0442 \u043D\u0430 \u0432\u0430\u0448\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F" },
        { id: uid2(), text: "\u041F\u043E\u043B\u043D\u0430\u044F \u0440\u0443\u0441\u0441\u043A\u0430\u044F \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u0441 \u043E\u0442\u043B\u0438\u0447\u043D\u043E\u0439 \u043E\u0437\u0432\u0443\u0447\u043A\u043E\u0439" }
      ],
      cons: [
        { id: uid2(), text: "\u041F\u0440\u043E\u0441\u0430\u0434\u043A\u0438 FPS \u0432 \u0446\u0435\u043D\u0442\u0440\u0435 \u041D\u0435\u043E-\u041A\u0438\u043E\u0442\u043E \u043D\u0430 \u0440\u0435\u043B\u0438\u0437\u0435" },
        { id: uid2(), text: "\u0421\u043B\u0430\u0431\u044B\u0439 \u0442\u0440\u0435\u0442\u0438\u0439 \u0430\u043A\u0442 \u0438 \u0441\u043A\u043E\u043C\u043A\u0430\u043D\u043D\u044B\u0439 \u0444\u0438\u043D\u0430\u043B \u043F\u043E\u0431\u043E\u0447\u0435\u043A" },
        { id: uid2(), text: "\u041D\u0435\u0442 \u0444\u043E\u0442\u043E\u0440\u0435\u0436\u0438\u043C\u0430 \u0438\u0437 \u043A\u043E\u0440\u043E\u0431\u043A\u0438 \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u043C\u043E\u0434 \u0432 \u041C\u0430\u0441\u0442\u0435\u0440\u0441\u043A\u043E\u0439" }
      ]
    };
  }
  function applyDemoReview(target, opts = {}) {
    const demo = makeDemoReview(opts);
    const id = target && target.id;
    const createdAt = target && target.createdAt;
    const panaxPostId = target && target.panaxPostId;
    Object.assign(target, demo);
    if (id) target.id = id;
    if (createdAt) target.createdAt = createdAt;
    if (panaxPostId) target.panaxPostId = panaxPostId;
    target.updatedAt = Date.now();
    return target;
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
  function parseForWalk(html, win) {
    return parseHtml(html, win);
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
  var C = {
    gold: "#ffc84a",
    dim: "#8b94aa",
    quote: "#c9b8ff",
    green: "#3ddc97",
    red: "#ff5f6d",
    cyan: "#22d3ee",
    codeFg: "#7ce7d4",
    codeBg: "#0b0e16",
    mark: "#5a4a1c",
    spoiler: "#2a2a2a"
  };
  function cleanAttrs(a) {
    const o = {};
    for (const [k, v] of Object.entries(a || {})) if (v !== void 0 && v !== null && v !== false && v !== "") o[k] = v;
    return Object.keys(o).length ? o : null;
  }
  var sameAttrs = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
  var OpsBuilder = class {
    constructor() {
      this.ops = [];
      this.plain = "";
      this.lineOpen = false;
      this.blankPending = false;
    }
    _push(insert, attrs) {
      attrs = cleanAttrs(attrs);
      const last = this.ops[this.ops.length - 1];
      if (last && typeof last.insert === "string" && insert !== "\n" && last.insert !== "\n" && !last.insert.endsWith("\n") && sameAttrs(last.attributes, attrs)) {
        last.insert += insert;
        return;
      }
      const op = { insert };
      if (attrs) op.attributes = attrs;
      this.ops.push(op);
    }
    _flushBlank() {
      if (this.blankPending) {
        this.blankPending = false;
        this._push("\n");
        this.plain += "\n";
      }
    }
    text(s, attrs) {
      s = String(s || "").replace(/\r/g, "");
      if (!s) return;
      const parts = s.split("\n");
      parts.forEach((p, i) => {
        if (i > 0) this.newline();
        if (!p) return;
        if (!this.lineOpen) {
          this._flushBlank();
          p = p.replace(/^[ \t]+/, "");
          if (!p) return;
        } else if (/[ \t]$/.test(this.plain)) {
          p = p.replace(/^[ \t]+/, "");
          if (!p) return;
        }
        this._push(p, attrs);
        this.plain += p;
        this.lineOpen = true;
      });
    }
    newline(attrs) {
      this._flushBlank();
      this._push("\n", attrs);
      this.plain = this.plain.replace(/[ \t]+$/, "") + "\n";
      this.lineOpen = false;
    }
    endLine() {
      if (this.lineOpen) this.newline();
    }
    /** Quill embed (e.g. { 'custom-image': { url, width, height } }). */
    embed(obj) {
      if (!obj || typeof obj !== "object") return;
      this.endLine();
      this._flushBlank();
      this.ops.push({ insert: obj });
      this._push("\n");
      this.plain += "\n";
      this.lineOpen = false;
    }
    /** visual gap between blocks (one empty line) */
    gap() {
      this.endLine();
      if (this.ops.length) this.blankPending = true;
    }
    heading(text, level) {
      const t = String(text || "").replace(/\s+/g, " ").trim();
      if (!t) return;
      this.endLine();
      this._flushBlank();
      this.ops.push({ insert: t, attributes: { header: level } });
      this.ops.push({ insert: "\n", attributes: { header: level } });
      this.plain += t + "\n";
      this.lineOpen = false;
    }
    listItem(runs, listType = "bullet") {
      this.endLine();
      this._flushBlank();
      let any = false;
      for (const r of runs) {
        const t = String(r.text || "").replace(/\n+/g, " ");
        if (!t) continue;
        this._push(t, r.attrs);
        this.plain += t;
        any = true;
      }
      if (!any) {
        this._push(" ");
        this.plain += " ";
      }
      this.ops.push({ insert: "\n", attributes: { list: listType } });
      this.plain += "\n";
      this.lineOpen = false;
    }
  };
  var BLOCKY = /* @__PURE__ */ new Set(["P", "DIV", "H1", "H2", "H3", "H4", "BLOCKQUOTE"]);
  function styleAttrs(el) {
    const st = safeInlineStyle(el.getAttribute && el.getAttribute("style"));
    const a = {};
    if (st.color) a.color = st.color;
    if (st["background-color"]) a.background = st["background-color"];
    if (st["font-weight"]) a.bold = true;
    if (st["font-size"]) {
      const n = parseFloat(st["font-size"]);
      if (n >= 1.2) a.size = "large";
      else if (n < 1) a.size = "small";
    }
    return a;
  }
  function emitInlineHtml(b, html, base = {}, win) {
    const body = parseForWalk(html, win);
    const walk = (node, attrs) => {
      for (const n of Array.from(node.childNodes)) {
        if (n.nodeType === 3) {
          const t = n.nodeValue.replace(/\u00a0/g, " ").replace(/[ \t\r\n]+/g, " ");
          if (t) b.text(t, attrs);
          continue;
        }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName.toUpperCase();
        if (["SCRIPT", "STYLE", "TEMPLATE", "IFRAME", "SVG", "NOSCRIPT"].includes(tag)) continue;
        if (tag === "BR") {
          b.newline();
          continue;
        }
        if (tag === "UL" || tag === "OL") {
          let k = 0;
          for (const li of Array.from(n.children)) {
            if (li.tagName !== "LI") continue;
            k++;
            b.endLine();
            b.text(tag === "OL" ? k + ". " : "\u2022 ", attrs);
            walk(li, attrs);
            b.endLine();
          }
          continue;
        }
        let a = { ...attrs };
        if (tag === "B" || tag === "STRONG") a.bold = true;
        else if (tag === "I" || tag === "EM") a.italic = true;
        else if (tag === "U") a.underline = true;
        else if (tag === "S" || tag === "STRIKE" || tag === "DEL") a.strike = true;
        else if (tag === "MARK") {
          a.background = C.mark;
          a.color = "#ffffff";
        } else if (tag === "CODE") {
          a.color = C.codeFg;
          a.background = C.codeBg;
        } else if (tag === "FONT") {
          const col = n.getAttribute("color");
          if (col && /^#[0-9a-f]{3,8}$/i.test(col)) a.color = col;
          const sz = parseInt(n.getAttribute("size") || "0", 10);
          if (sz >= 5) a.size = "large";
          else if (sz > 0 && sz <= 2) a.size = "small";
        }
        Object.assign(a, styleAttrs(n));
        if (tag === "A") {
          const href = safeUrl2(n.getAttribute("href"));
          const chip = /\bgame-chip\b/.test(String(n.getAttribute("class") || ""));
          const la = { ...a, color: a.color || C.cyan };
          if (chip) la.bold = true;
          else la.underline = true;
          walk(n, la);
          const txt = (n.textContent || "").trim();
          if (href && txt !== href && txt !== href.replace(/\/$/, "")) b.text(" \u2014 " + href + " ", attrs);
          continue;
        }
        const isBlock = BLOCKY.has(tag);
        if (isBlock) b.endLine();
        if (/^H[1-4]$/.test(tag)) a.bold = true;
        walk(n, a);
        if (isBlock) b.endLine();
      }
    };
    const walkTop = (node, attrs) => {
      for (const n of Array.from(node.childNodes)) {
        if (n.nodeType === 1 && (n.tagName === "UL" || n.tagName === "OL")) {
          const type = n.tagName === "OL" ? "ordered" : "bullet";
          for (const li of Array.from(n.children)) {
            if (li.tagName !== "LI") continue;
            const tmp = new OpsBuilder();
            collectRuns(li, attrs, tmp, win);
            const runs = tmp.ops.filter((o) => typeof o.insert === "string" && o.insert !== "\n").map((o) => ({ text: o.insert, attrs: o.attributes }));
            b.listItem(runs, type);
          }
          continue;
        }
        if (n.nodeType === 1 && BLOCKY.has(n.tagName) && n.querySelector && n.querySelector("ul,ol")) {
          b.endLine();
          walkTop(n, attrs);
          b.endLine();
          continue;
        }
        const wrapper = { childNodes: [n] };
        walk(wrapper, attrs);
      }
    };
    walkTop(body, base);
  }
  function collectRuns(li, attrs, tmp, win) {
    emitInlineHtmlFromNode(tmp, li, attrs, win);
  }
  function emitInlineHtmlFromNode(b, node, attrs, win) {
    const holder = node.ownerDocument.createElement("div");
    for (const c of Array.from(node.childNodes)) {
      if (c.nodeType === 1 && (c.tagName === "UL" || c.tagName === "OL")) continue;
      holder.appendChild(c.cloneNode(true));
    }
    emitInlineHtml(b, holder.innerHTML, attrs, win);
  }
  var stars = (n, total = 10) => "\u2605".repeat(n) + "\u2606".repeat(Math.max(0, total - n));
  var dots = (n) => "\u25CF".repeat(n) + "\u25CB".repeat(Math.max(0, 10 - n));
  function linkLines(b, pairs) {
    for (const [label, url] of pairs) {
      if (!url) continue;
      b.text(label + ": ", { color: C.dim });
      b.text(url);
      b.newline();
    }
  }
  function buildFallback(r, opts = {}) {
    const win = opts.win;
    const b = new OpsBuilder();
    if (r.title) b.heading(r.title, 1);
    if (r.game) {
      b.text("\u{1F3AE} \u0418\u0433\u0440\u0430: ", { bold: true });
      b.text(r.game);
      b.newline();
    }
    const sc = SCORES[r.score];
    if (r.score > 0 && sc) {
      b.text("\u2B50 \u041E\u0446\u0435\u043D\u043A\u0430: ", { bold: true });
      b.text(r.score + "/10 ", { bold: true });
      b.text(stars(r.score), { color: C.gold });
      b.text(" \u2014 \xAB" + sc.t + "\xBB " + sc.i);
      b.newline();
      b.text(sc.d, { italic: true, color: C.dim });
      b.newline();
    }
    const v = VERDICT[r.recommend];
    if (v && r.recommend !== "none") {
      b.text("\u0412\u0435\u0440\u0434\u0438\u043A\u0442: ", { bold: true });
      b.text(v.e + " " + v.t, { bold: true, color: v.c });
      b.newline();
    }
    const aspects = r.aspects || [];
    if (aspects.length && aspects.some((a) => a.score > 0 || a.unrated === "na")) {
      b.gap();
      b.heading("\u{1F4CA} \u041E\u0446\u0435\u043D\u043A\u0438 \u0430\u0441\u043F\u0435\u043A\u0442\u043E\u0432", 3);
      for (const a of aspects) {
        if (a.score > 0) {
          b.listItem([
            { text: a.name + " \u2014 ", attrs: { bold: true } },
            { text: a.score + "/10 ", attrs: null },
            { text: dots(a.score), attrs: { color: C.cyan } }
          ]);
        } else {
          b.listItem([
            { text: a.name + " \u2014 ", attrs: { bold: true } },
            { text: UNRATED[a.unrated] || UNRATED.unsure, attrs: { italic: true, color: C.dim } }
          ]);
        }
      }
    }
    for (const bl of r.blocks || []) {
      const d = bl.data || {};
      switch (bl.type) {
        case "h2":
        case "h3": {
          const tmp = parseForWalk(bl.html || "", win);
          b.gap();
          b.heading((tmp.textContent || "").replace(/\u00a0/g, " "), bl.type === "h2" ? 2 : 3);
          break;
        }
        case "text":
          b.gap();
          emitInlineHtml(b, bl.html || "", {}, win);
          b.endLine();
          break;
        case "quote":
          b.gap();
          b.text("\u258D ", { color: C.quote, bold: true });
          emitInlineHtml(b, bl.html || "", { italic: true, color: C.quote }, win);
          b.endLine();
          break;
        case "spoiler":
          b.gap();
          b.text("\u26A0\uFE0F \u0421\u043F\u043E\u0439\u043B\u0435\u0440", { bold: true, color: C.gold });
          b.text(" (\u0432\u044B\u0434\u0435\u043B\u0438\u0442\u0435 \u0442\u0435\u043A\u0441\u0442, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C):", { italic: true, color: C.dim });
          b.newline();
          emitInlineHtml(b, bl.html || "", { color: C.spoiler, background: C.spoiler }, win);
          b.endLine();
          break;
        case "divider":
          b.gap();
          b.text(d.style === 3 ? "\u2726  \u2726  \u2726" : d.style === 2 ? "\u2014 \u2014 \u2014 \u2014 \u2014 \u2014 \u2014 \u2014 \u2014 \u2014" : "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500", { color: C.dim });
          b.newline();
          break;
        case "game": {
          b.gap();
          b.text("\u{1F3AE} " + (d.title || "\u0418\u0433\u0440\u0430"), { bold: true, size: "large" });
          b.newline();
          const sub = [d.year, d.dev, d.pub].filter(Boolean).join(" \xB7 ");
          if (sub) {
            b.text(sub, { color: C.dim });
            b.newline();
          }
          if ((d.genres || []).length) {
            b.text("\u0416\u0430\u043D\u0440\u044B: ", { color: C.dim });
            b.text(d.genres.join(", "));
            b.newline();
          }
          const rt = Object.entries(d.ratings || {}).map(([k, val]) => integMeta(r, k).name + ": " + val);
          if (rt.length) {
            b.text("\u041E\u0446\u0435\u043D\u043A\u0438: ", { color: C.dim });
            b.text(rt.join(" \xB7 "), { bold: true, color: C.gold });
            b.newline();
          }
          linkLines(
            b,
            Object.entries(d.links || {}).map(([k, url]) => {
              const m = integMeta(r, k);
              return [m.icon + " " + m.name, url];
            })
          );
          break;
        }
        case "steam": {
          b.gap();
          b.text("\u2668\uFE0F " + (d.title || "\u0418\u0433\u0440\u0430") + " \u2014 \u0432 Steam", { bold: true, size: "large" });
          b.newline();
          if ((d.tags || []).length) {
            b.text("\u0422\u0435\u0433\u0438: ", { color: C.dim });
            b.text(d.tags.join(", "));
            b.newline();
          }
          if (d.date) {
            b.text("\u0414\u0430\u0442\u0430 \u0432\u044B\u0445\u043E\u0434\u0430: ", { color: C.dim });
            b.text(d.date);
            b.newline();
          }
          b.text("\u0426\u0435\u043D\u0430: ", { color: C.dim });
          if (d.disc) b.text(d.disc + " ", { bold: true, color: "#a4d007" });
          if (d.old) b.text(d.old, { strike: true, color: C.dim });
          if (d.old) b.text(" ");
          b.text(d.price || "\u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u0430", { bold: true });
          b.newline();
          linkLines(b, [["\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0432 Steam", d.url]]);
          break;
        }
        case "youtube": {
          b.gap();
          b.text("\u25B6\uFE0F " + (d.title || "\u0412\u0438\u0434\u0435\u043E"), { bold: true, size: "large" });
          b.newline();
          b.text([d.channel || "YouTube", d.dur].filter(Boolean).join(" \xB7 "), { color: C.dim });
          b.newline();
          linkLines(b, [["\u0421\u043C\u043E\u0442\u0440\u0435\u0442\u044C", d.url]]);
          break;
        }
        case "workshop": {
          b.gap();
          b.text("\u{1F6E0}\uFE0F " + (d.title || "\u041F\u0440\u0435\u0434\u043C\u0435\u0442 \u041C\u0430\u0441\u0442\u0435\u0440\u0441\u043A\u043E\u0439"), { bold: true, size: "large" });
          b.newline();
          const meta = ["\u041C\u0430\u0441\u0442\u0435\u0440\u0441\u043A\u0430\u044F Steam", d.author ? "\u0430\u0432\u0442\u043E\u0440: " + d.author : "", d.subs ? "\u043F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A\u043E\u0432: " + d.subs : "", d.game].filter(Boolean).join(" \xB7 ");
          b.text(meta, { color: C.dim });
          b.newline();
          linkLines(b, [["\u041E\u0442\u043A\u0440\u044B\u0442\u044C", d.url]]);
          break;
        }
        case "image": {
          b.gap();
          const items = Array.isArray(d.items) && d.items.length ? d.items : d.url ? [d] : [];
          for (const it of items) {
            const url = safeUserImageUrl(it.url);
            if (url && /^https?:/i.test(url)) {
              b.embed({ "custom-image": { url, width: it.width || 0, height: it.height || 0 } });
              const cap = String(it.caption || it.alt || "").trim();
              linkLines(b, [[cap ? "\u{1F5BC} " + cap : "\u{1F5BC} \u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435", url]]);
            } else if (url && url.startsWith("data:")) {
              b.text("\u{1F5BC} \u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 (\u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u043A\u043E\u043F\u0438\u044F, \u0432\u0438\u0434\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0441 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u0435\u043C GameQuill)", { italic: true, color: C.dim });
              b.newline();
            }
          }
          if (d.caption) {
            b.text(String(d.caption), { italic: true, color: C.dim });
            b.newline();
          }
          break;
        }
        default:
          break;
      }
    }
    if ((r.pros || []).length) {
      b.gap();
      b.text("\u2705 \u041F\u043B\u044E\u0441\u044B", { bold: true, color: C.green, size: "large" });
      b.newline();
      for (const p of r.pros) b.listItem([{ text: p.text, attrs: null }]);
    }
    if ((r.cons || []).length) {
      b.gap();
      b.text("\u274C \u041C\u0438\u043D\u0443\u0441\u044B", { bold: true, color: C.red, size: "large" });
      b.newline();
      for (const c of r.cons) b.listItem([{ text: c.text, attrs: null }]);
    }
    const fp = fingerprintText(b.plain);
    b.gap();
    b.text(FOOTER_TEXT, { color: C.dim, size: "small", italic: true });
    return { ops: b.ops, plain: b.plain.replace(/\n{3,}/g, "\n\n").trim(), fp };
  }
  function attachCarriers(ops, { text, vs } = {}) {
    const out = ops.map((o) => ({ ...o, attributes: o.attributes ? { ...o.attributes } : void 0 }));
    for (const o of out) if (!o.attributes) delete o.attributes;
    if (vs) {
      for (let i = out.length - 1; i >= 0; i--) {
        if (typeof out[i].insert === "string" && out[i].insert.includes(FOOTER_TEXT)) {
          out[i].insert = out[i].insert + vs;
          break;
        }
      }
    }
    const nl = { insert: "\n" };
    if (text) nl.attributes = { gq: text };
    out.push(nl);
    return out;
  }
  function opsToHtml(ops) {
    const esc2 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const lines = [];
    let cur = [];
    for (const op of ops) {
      if (typeof op.insert !== "string") {
        const emb = op.insert && op.insert["custom-image"];
        const src = emb && safeUserImageUrl(emb.url);
        if (src && /^https?:/i.test(src)) {
          if (cur.length) lines.push({ segs: cur, attrs: {} });
          cur = [];
          lines.push({ segs: [], attrs: {}, image: src });
        }
        continue;
      }
      const parts = op.insert.split("\n");
      parts.forEach((p, i) => {
        if (i > 0) {
          lines.push({ segs: cur, attrs: i === parts.length - 1 && op.insert.endsWith("\n") ? op.attributes || {} : {} });
          cur = [];
        }
        if (p) cur.push({ text: p, a: op.attributes || {} });
      });
    }
    if (cur.length) lines.push({ segs: cur, attrs: {} });
    const seg = (s) => {
      let h = esc2(s.text);
      const a = s.a;
      if (a.bold) h = `<strong>${h}</strong>`;
      if (a.italic) h = `<em>${h}</em>`;
      if (a.underline) h = `<u>${h}</u>`;
      if (a.strike) h = `<s>${h}</s>`;
      const st = [];
      if (a.color) st.push("color:" + a.color);
      if (a.background) st.push("background-color:" + a.background);
      if (st.length) h = `<span style="${st.join(";")}">${h}</span>`;
      return h;
    };
    let html = "";
    let list = null;
    for (const ln of lines) {
      if (ln.image) {
        if (list) {
          html += `</${list}>`;
          list = null;
        }
        html += `<p><img src="${esc2(ln.image)}" alt="" referrerpolicy="no-referrer" loading="lazy"></p>`;
        continue;
      }
      const inner = ln.segs.map(seg).join("");
      const lt = ln.attrs && ln.attrs.list;
      if (lt) {
        const tag = lt === "ordered" ? "ol" : "ul";
        if (list !== tag) {
          if (list) html += `</${list}>`;
          html += `<${tag}>`;
          list = tag;
        }
        html += `<li>${inner}</li>`;
        continue;
      }
      if (list) {
        html += `</${list}>`;
        list = null;
      }
      const hl = ln.attrs && ln.attrs.header || ln.segs[0] && ln.segs[0].a.header;
      html += hl ? `<h${hl}>${inner}</h${hl}>` : `<p>${inner || "<br>"}</p>`;
    }
    if (list) html += `</${list}>`;
    return html;
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
  function toB64url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  var hex8 = (n) => (n >>> 0).toString(16).padStart(8, "0");
  var VS_MAX_CHARS = 12e3;
  async function deflate(bytes) {
    const cs = new CompressionStream("deflate-raw");
    const w = cs.writable.getWriter();
    w.write(bytes);
    w.close();
    return streamBytes(cs.readable, Infinity);
  }
  async function encodeDoc(doc) {
    const json = JSON.stringify(doc);
    const raw = te.encode(json);
    if (raw.byteLength > MAX_RAW) throw new GQError("too-large", "document too large");
    const comp = await deflate(raw);
    if (comp.byteLength > MAX_COMPRESSED) throw new GQError("too-large", "compressed document too large");
    const crc = crc32(comp);
    const text = PREFIX + toB64url(comp) + "." + hex8(crc);
    const bytes = new Uint8Array(7 + comp.byteLength);
    bytes.set([71, 81, 1, crc >>> 24 & 255, crc >>> 16 & 255, crc >>> 8 & 255, crc & 255], 0);
    bytes.set(comp, 7);
    return { text, bytes, compressedSize: comp.byteLength, rawSize: raw.byteLength };
  }
  function vsEncode(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      s += b < 16 ? String.fromCharCode(65024 + b) : String.fromCodePoint(917760 + (b - 16));
    }
    return s;
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
  function paletteFor(seed) {
    let s = 0;
    for (const ch of String(seed)) s = s * 31 + ch.charCodeAt(0) >>> 0;
    return PALETTES[s % PALETTES.length];
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
  function themeList() {
    return Object.values(THEMES);
  }

  // local-fs:C:\Users\arist\Gemini\Backlogged18n\src\gamequill\bridge-core.js
  var uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  var plain = (s, n = 200) => str(s, n).replace(/[<>"'&`]/g, "").trim();
  function toEditorReview(x, sanitize) {
    const r = normalizeReview(x, { sanitizeHtml: sanitize });
    if (!r) return null;
    const now = Date.now();
    return {
      id: uid(),
      title: r.title,
      game: r.game,
      createdAt: now,
      updatedAt: r.updatedAt || now,
      score: r.score,
      recommend: r.recommend,
      aspects: r.aspects.map((a) => ({ id: uid(), ...a })),
      pros: r.pros.map((p) => ({ id: uid(), text: p.text })),
      cons: r.cons.map((p) => ({ id: uid(), text: p.text })),
      blocks: r.blocks.map((b) => ({ id: uid(), ...b })),
      integ: r.integ
    };
  }
  function cleanInteg(ni) {
    if (!ni || typeof ni !== "object") return null;
    const id = String(ni.id || "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) return null;
    const name = plain(ni.name, 40);
    if (!name) return null;
    return {
      id,
      name,
      icon: plain(ni.icon, 8) || "\u{1F517}",
      color: safeColor(ni.color) || "#7c5cff",
      base: safeUrl2(ni.base),
      enabled: ni.enabled !== false,
      ai: !!ni.ai
    };
  }
  function buildIntegMap(review, integrations) {
    const keys = /* @__PURE__ */ new Set();
    for (const b of review && review.blocks || []) {
      const d = b && b.data;
      if (!d) continue;
      Object.keys(d.links || {}).forEach((k) => keys.add(k));
      Object.keys(d.ratings || {}).forEach((k) => keys.add(k));
    }
    const out = {};
    for (const k of keys) {
      const s = (integrations || []).find((i) => i && i.id === k);
      if (s) out[k] = { name: plain(s.name, 40), icon: plain(s.icon, 8), color: safeColor(s.color) || "#7c5cff" };
      else if (DEFAULT_INTEG[k]) out[k] = { ...DEFAULT_INTEG[k] };
    }
    return out;
  }
  var steamCover = (app) => `https://cdn.akamai.steamstatic.com/steam/apps/${String(app).replace(/\D/g, "")}/header.jpg`;
  function ytCover(url) {
    try {
      const u = new URL(url);
      let id = "";
      if (/(^|\.)youtube\.com$/.test(u.hostname)) id = u.searchParams.get("v") || (u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/) || [])[1] || "";
      else if (u.hostname === "youtu.be") id = u.pathname.slice(1);
      return /^[\w-]{6,20}$/.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
    } catch {
      return "";
    }
  }
  var enc = encodeURIComponent;
  function searchLinks(name, app) {
    return {
      panax: `https://panaxgames.com/search?q=${enc(name)}`,
      steam: `https://store.steampowered.com/app/${app}/`,
      backloggd: `https://www.backloggd.com/search/games/${enc(name)}/`,
      igdb: `https://www.igdb.com/search?type=1&q=${enc(name)}`,
      rawg: `https://rawg.io/search?query=${enc(name)}`,
      metacritic: `https://www.metacritic.com/search/${enc(name)}/`,
      hltb: `https://howlongtobeat.com/?q=${enc(name)}`
    };
  }
  function fmtPrice(p) {
    if (!p || typeof p.final !== "number") return "";
    const n = p.final / 100;
    return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " " + plain(p.currency, 5);
  }
  function adaptSteamSearch(json) {
    const items = (json && Array.isArray(json.items) ? json.items : []).filter((it) => it && (it.type === "app" || !it.type)).slice(0, 24);
    return items.map((it) => {
      const app = String(it.id || "").replace(/\D/g, "");
      const title = plain(it.name, 120);
      if (!app || !title) return null;
      const pl = it.platforms || {};
      const plat = [pl.windows && "Windows", pl.mac && "macOS", pl.linux && "Linux"].filter(Boolean);
      const r = {};
      const ms = parseInt(it.metascore, 10);
      if (ms > 0) r.metacritic = ms;
      let disc = "";
      let old = "";
      if (it.price && it.price.initial > it.price.final) {
        disc = "-" + Math.round((1 - it.price.final / it.price.initial) * 100) + "%";
        old = fmtPrice({ final: it.price.initial, currency: it.price.currency });
      }
      return {
        id: "steam-" + app,
        title,
        year: "",
        dev: "",
        pub: "",
        genres: [],
        plat,
        pal: paletteFor(app),
        cover: steamCover(app),
        r,
        links: searchLinks(title, app),
        steam: { app, price: it.price ? fmtPrice(it.price) : "", old, disc, date: "", tags: [] },
        trailer: { t: title + " \u2014 \u0442\u0440\u0435\u0439\u043B\u0435\u0440", ch: "\u043F\u043E\u0438\u0441\u043A \u043D\u0430 YouTube", dur: "", url: `https://www.youtube.com/results?search_query=${enc(title + " trailer")}` },
        ws: [{ t: "\u041C\u0430\u0441\u0442\u0435\u0440\u0441\u043A\u0430\u044F: " + title, a: "Steam", s: "", url: `https://steamcommunity.com/app/${app}/workshop/` }]
      };
    }).filter(Boolean);
  }
  function adaptSteamDetails(json, app) {
    const e = json && json[app];
    if (!e || !e.success || !e.data) return null;
    const d = e.data;
    const po = d.price_overview || null;
    const date = plain(d.release_date && d.release_date.date, 40);
    const ym = /(19|20)\d{2}/.exec(date);
    return {
      title: plain(d.name, 120),
      dev: plain((d.developers || []).join(", "), 120),
      pub: plain((d.publishers || []).join(", "), 120),
      genres: (d.genres || []).map((g) => plain(g && g.description, 40)).filter(Boolean).slice(0, 6),
      date,
      year: ym ? ym[0] : "",
      price: d.is_free ? "\u0411\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u043E" : po ? plain(po.final_formatted, 40) : "",
      old: po && po.discount_percent ? plain(po.initial_formatted, 40) : "",
      disc: po && po.discount_percent ? "-" + parseInt(po.discount_percent, 10) + "%" : "",
      cover: safeImageUrl(d.header_image) || steamCover(app),
      metacritic: d.metacritic && d.metacritic.score ? parseInt(d.metacritic.score, 10) : 0
    };
  }
  function steamWidgetPatch(det) {
    const o = { price: det.price, old: det.old, disc: det.disc, date: det.date, tags: det.genres.slice(0, 4) };
    if (det.title) o.title = det.title;
    if (det.cover) o.cover = det.cover;
    return o;
  }
  function mergeDetails(g, det) {
    if (!g || !det) return g;
    if (det.dev) g.dev = det.dev;
    if (det.pub) g.pub = det.pub;
    if (det.year) g.year = det.year;
    if (det.genres.length) g.genres = det.genres;
    if (det.cover) g.cover = det.cover;
    if (det.metacritic) g.r.metacritic = det.metacritic;
    Object.assign(g.steam, { price: det.price || g.steam.price, old: det.old, disc: det.disc, date: det.date, tags: det.genres.slice(0, 4) });
    return g;
  }
  function panaxCoverUrl(raw) {
    const s = str(raw, 400).trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return safeImageUrl(s);
    if (/^\/\/.+/.test(s)) return safeImageUrl("https:" + s);
    const cleanFile = s.replace(/^\/+/, "");
    const full = /^images\//i.test(cleanFile) ? `https://d21t60rno19oyf.cloudfront.net/${cleanFile}` : `https://d21t60rno19oyf.cloudfront.net/images/t_cover_big/${cleanFile}`;
    return safeImageUrl(full);
  }

  // src/gamequill/bridge.js
  var ALLOWED_PARENTS = ["https://backloggd.com", "https://www.backloggd.com"];
  if (false) {
    ALLOWED_PARENTS.push("http://localhost:8765", "http://127.0.0.1:8765");
    setAllowedImageOrigins(["http://localhost:8765", "http://127.0.0.1:8765"]);
  }
  function stripLocalImageBlocks(doc) {
    if (!doc || !Array.isArray(doc.blocks)) return false;
    const before = doc.blocks.length;
    doc.blocks = doc.blocks.filter((b) => !(b.type === "image" && b.data && String(b.data.url || "").startsWith("data:")));
    return doc.blocks.length !== before;
  }
  var uploadPending = /* @__PURE__ */ new Map();
  var uploadSeq = 0;
  function uploadImage(payload) {
    const reqId = "u" + ++uploadSeq;
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        uploadPending.delete(reqId);
        resolve({ ok: false, code: "timeout", error: "\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B\u0430 \u043D\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443." });
      }, 15e3);
      uploadPending.set(reqId, (res) => {
        clearTimeout(t);
        resolve(res);
      });
      window.GQ.post({ type: "gq:upload-image", reqId, name: payload.name || "", contentType: payload.contentType, width: payload.width || 0, height: payload.height || 0, b64: payload.b64 });
    });
  }
  function onUploadResult(m) {
    const fn = m && m.reqId && uploadPending.get(m.reqId);
    if (!fn) return;
    uploadPending.delete(m.reqId);
    fn(m);
  }
  function detectParent() {
    if (window.parent === window) return null;
    try {
      const ao = location.ancestorOrigins;
      const o = ao && ao.length ? ao[0] : "";
      return ALLOWED_PARENTS.includes(o) ? o : null;
    } catch {
      return null;
    }
  }
  var parentOrigin = detectParent();
  var clean = (h) => sanitizeHtml(h, window);
  async function exportForPost(review, settings, win = window) {
    const s = settings || {};
    const author = s.author && s.author !== "\u0412\u0430\u0448\u0435 \u0438\u043C\u044F" ? s.author : "";
    const integ = buildIntegMap(review, s.integrations);
    const doc = normalizeReview({ ...review, author, integ, updatedAt: Date.now() }, { sanitizeHtml: (h) => sanitizeHtml(h, win) });
    if (!doc || !hasContent(doc)) throw Object.assign(new Error("\u041E\u0431\u0437\u043E\u0440 \u043F\u0443\u0441\u0442\u043E\u0439"), { code: "empty" });
    const fb0 = buildFallback(doc, { win });
    doc.fp = fb0.fp;
    let enc2;
    try {
      enc2 = await encodeDoc(doc);
    } catch (e) {
      if (!(e && e.code === "too-large")) throw e;
      const stripped = stripLocalImageBlocks(doc);
      if (!stripped) throw e;
      const fb1 = buildFallback(doc, { win });
      doc.fp = fb1.fp;
      enc2 = await encodeDoc(doc);
    }
    const fb = buildFallback(doc, { win });
    const vs = enc2.bytes.length <= VS_MAX_CHARS ? vsEncode(enc2.bytes) : "";
    const ops = attachCarriers(fb.ops, { text: enc2.text, vs });
    let plain2 = fb.plain;
    if (vs) {
      const i = plain2.lastIndexOf(FOOTER_TEXT);
      plain2 = i >= 0 ? plain2.slice(0, i + FOOTER_TEXT.length) + vs + plain2.slice(i + FOOTER_TEXT.length) : plain2 + vs;
    }
    return {
      ops,
      plain: plain2,
      html: opsToHtml(ops),
      carrierText: enc2.text,
      fp: fb.fp,
      sizes: { raw: enc2.rawSize, compressed: enc2.compressedSize, vs: vs ? enc2.bytes.length : 0 },
      doc
    };
  }
  async function getJson(url) {
    const r = await fetch(url, { credentials: "omit", cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  async function panaxSearch() {
    return [];
  }
  async function panaxDetails() {
    return null;
  }
  async function panaxResolveGame() {
    return null;
  }
  async function steamSearch(q, cc = "KZ") {
    const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=russian&cc=${encodeURIComponent(cc)}`;
    return adaptSteamSearch(await getJson(url));
  }
  async function steamDetails(app, cc = "KZ") {
    app = String(app).replace(/\D/g, "");
    if (!app) return null;
    const url = `https://store.steampowered.com/api/appdetails?appids=${app}&cc=${encodeURIComponent(cc)}&l=russian`;
    return adaptSteamDetails(await getJson(url), app);
  }
  if (typeof window !== "undefined" && window.document) {
    window.GQ = {
      parentOrigin,
      post(msg) {
        if (parentOrigin) window.parent.postMessage(msg, parentOrigin);
      },
      onMessage(fn) {
        window.addEventListener("message", (e) => {
          if (!parentOrigin || e.source !== window.parent || e.origin !== parentOrigin) return;
          try {
            if (e.data && e.data.type === "gq:upload-result") onUploadResult(e.data);
            fn(e.data);
          } catch (err) {
            console.error("[GameQuill]", err);
          }
        });
      },
      palette: paletteFor,
      color: (c) => safeColor(c) || "#7c5cff",
      url: safeUrl2,
      imageUrl: safeImageUrl,
      userImageUrl: safeUserImageUrl,
      publicImageUrl: toPublicPanaxImageUrl,
      probeImageLoad: (url, opts) => probeImageLoad(url, { Image: window.Image, ...opts }),
      shouldPreserveAnimation,
      isGifBytes,
      inspectImageBytes,
      normalizeExternalGifUrl,
      MAX_GALLERY_ITEMS,
      FLAT_GIF_HINT,
      str,
      hasContent: (r) => !!r && hasContent({ title: r.title || "", score: r.score, blocks: r.blocks || [], pros: r.pros || [], cons: r.cons || [], aspects: r.aspects || [] }),
      sanitizeHtml: clean,
      toEditorReview: (x) => toEditorReview(x, clean),
      cleanInteg,
      exportForPost: (r, s) => exportForPost(r, s, window),
      themeList: () => themeList(),
      defaultTheme: DEFAULT_THEME,
      normalizeTheme,
      async loadTheme() {
        try {
          if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            const stored = await chrome.storage.local.get({ gqTheme: DEFAULT_THEME });
            return normalizeTheme(stored && stored.gqTheme);
          }
        } catch {
        }
        try {
          return normalizeTheme(localStorage.getItem("gqTheme"));
        } catch {
        }
        return DEFAULT_THEME;
      },
      setTheme(id) {
        const t = normalizeTheme(id);
        try {
          localStorage.setItem("gqTheme", t);
        } catch {
        }
        try {
          if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) chrome.storage.local.set({ gqTheme: t });
        } catch {
        }
        return t;
      },
      makeDemoReview,
      applyDemoReview,
      DEMO_CONFIRM,
      DEMO_GAME,
      compressImage: (src, opts) => compressImage(src, { ...opts, document: window.document, Image: window.Image }),
      uploadImage,
      bytesToBase64,
      base64ToBytes,
      isRasterImageType,
      MAX_DATA_IMAGE,
      MAX_UPLOAD_BYTES,
      panaxSearch,
      panaxDetails,
      panaxResolveGame,
      panaxCoverUrl,
      extraCardVariants: () => EXTRA_VARIANTS,
      renderExtraGameCard,
      steamSearch,
      steamDetails,
      steamWidgetPatch,
      mergeDetails,
      steamCover,
      ytCover
    };
  }
})();
