export var MAX_DATA_IMAGE = 40 * 1024;
export var MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
var LOCAL_TARGET_BYTES = 28 * 1024;
var PANAX_IMAGE_CDN = "https://d21t60rno19oyf.cloudfront.net";
var PANAX_IMAGE_CDN_HOST = "d21t60rno19oyf.cloudfront.net";
var SITE_IMAGE_HOSTS = [
  "gamedb-oz.s3.amazonaws.com",
  "gamedb-oz.s3.ap-northeast-2.amazonaws.com",
  "gamedb-oz.s3.ap-southeast-1.amazonaws.com",
  "gamedb-oz.s3-accelerate.amazonaws.com",
  PANAX_IMAGE_CDN_HOST
];
var UUID_RE = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
var PANAX_INPUT_RE = new RegExp("^/image/input/(" + UUID_RE + ")$");
var PANAX_DERIV_RE = new RegExp("^/image/(large|medium|small)/(" + UUID_RE + ")\\.webp$", "i");
var SIGNED_PARAM_RE = /^(AWSAccessKeyId|Signature|Expires|x-amz-security-token|X-Amz-Algorithm|X-Amz-Credential|X-Amz-Date|X-Amz-Expires|X-Amz-SignedHeaders|X-Amz-Signature|X-Amz-Security-Token|content-type|x-amz-meta-.+)$/i;
var extraAllowedOrigins = [];
var encodeUnsafe = (href) => href.replace(/['"()\\\s<>`]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
var PRIVATE_HOST = /^(localhost|127\.0\.0\.1|::1|0\.0\.0\.0)$/i;
var PRIVATE_IP = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/;
export function isPrivateHost(host2) {
  const h2 = String(host2 || "").toLowerCase();
  if (PRIVATE_HOST.test(h2) || h2.endsWith(".local") || h2.endsWith(".localhost")) return true;
  if (PRIVATE_IP.test(h2)) return true;
  return false;
}
function isSiteImageHost(host2) {
  const h2 = String(host2 || "").toLowerCase();
  if (SITE_IMAGE_HOSTS.includes(h2)) return true;
  if (/(^|\.)s3[.-]/.test(h2) && h2.includes("gamedb")) return true;
  return false;
}
export function isSiteImageUrl(v) {
  try {
    const u = new URL(String(v || ""));
    if (u.protocol === "https:" && isSiteImageHost(u.hostname)) return true;
    if (isAllowedExtraOrigin(u) && (PANAX_INPUT_RE.test(u.pathname) || PANAX_DERIV_RE.test(u.pathname))) return true;
    return false;
  } catch {
    return false;
  }
}
export function hasSignedQuery(urlOrSearch) {
  try {
    const u = typeof urlOrSearch === "string" && urlOrSearch.includes("://") ? new URL(urlOrSearch) : null;
    const params = u ? u.searchParams : new URLSearchParams(String(urlOrSearch || "").replace(/^\?/, ""));
    for (const k of params.keys()) if (SIGNED_PARAM_RE.test(k)) return true;
    return false;
  } catch {
    return /AWSAccessKeyId|X-Amz-Signature|x-amz-security-token|X-Amz-Security-Token/i.test(String(urlOrSearch || ""));
  }
}
export function toPublicPanaxImageUrl(v, opts = {}) {
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
export function safeUserImageUrl(v, opts = {}) {
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
function s3PutUrl(presigned, opts = {}) {
  const t = new URL(String(presigned || ""));
  if (t.protocol !== "https:" && t.protocol !== "http:") throw new Error("bad presign");
  if (isPrivateHost(t.hostname) || opts.pageOrigin && originsEqual(t, opts.pageOrigin)) {
    return t.origin + t.pathname + t.search;
  }
  return "https://gamedb-oz.s3.amazonaws.com" + t.pathname + t.search;
}
function originsEqual(u, origin) {
  try {
    const o = new URL(origin);
    return o.protocol === u.protocol && o.hostname === u.hostname && (o.port || defaultPort(o.protocol)) === (u.port || defaultPort(u.protocol));
  } catch {
    return false;
  }
}
export function base64ToBytes(b64) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(String(b64), "base64"));
  const bin = atob(String(b64));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function isRasterImageType(type) {
  return /^(image\/(png|jpe?g|webp|gif))$/i.test(String(type || ""));
}
export function isGifBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : bytes ? new Uint8Array(bytes) : new Uint8Array();
  return u8.length >= 6 && u8[0] === 71 && u8[1] === 73 && u8[2] === 70 && u8[3] === 56;
}
export function shouldPreserveAnimation(file, bytes) {
  const type = file && file.type || "";
  const name = file && file.name || "";
  if (/^image\/gif$/i.test(type) || /\.gif$/i.test(name)) return true;
  if (bytes && isGifBytes(bytes)) return true;
  if (bytes && inspectImageBytes(bytes).animated) return true;
  if (/^image\/webp$/i.test(type) && bytes && inspectImageBytes(bytes).type === "webp" && inspectImageBytes(bytes).animated) return true;
  return false;
}
export var MAX_GALLERY_ITEMS = 10;
export var CAPTION_MAX = 200;
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
export function inspectImageBytes(bytes) {
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
export function panaxImageId(v) {
  try {
    const u = new URL(String(v || "").trim());
    const input = PANAX_INPUT_RE.exec(u.pathname);
    if (input) return input[1].toLowerCase();
    const deriv = PANAX_DERIV_RE.exec(u.pathname);
    if (deriv) return deriv[2].toLowerCase();
    return "";
  } catch {
    return "";
  }
}
export function panaxDerivativeUrl(id, size, opts = {}) {
  const uuid = String(id || "").toLowerCase();
  if (!new RegExp("^" + UUID_RE + "$").test(uuid)) return "";
  const kind = size === "medium" || size === "small" || size === "large" ? size : "large";
  const origin = opts.origin || PANAX_IMAGE_CDN;
  return origin + "/image/" + kind + "/" + uuid + ".webp";
}
export function panaxInputUrl(id, opts = {}) {
  const uuid = String(id || "").toLowerCase();
  if (!new RegExp("^" + UUID_RE + "$").test(uuid)) return "";
  return (opts.origin || PANAX_IMAGE_CDN) + "/image/input/" + uuid;
}
export var FLAT_GIF_HINT = "\u0421\u0435\u0440\u0432\u0435\u0440 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u043B \u0433\u0438\u0444\u043A\u0443 \u043A\u0430\u043A \u0441\u0442\u0430\u0442\u0438\u0447\u043D\u044B\u0439 \u043A\u0430\u0434\u0440. \u0427\u0442\u043E\u0431\u044B \u0430\u043D\u0438\u043C\u0430\u0446\u0438\u044F \u0442\u043E\u0447\u043D\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u043B\u0430, \u0432\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0441\u0441\u044B\u043B\u043A\u0443 \u0441 Giphy, Tenor \u0438\u043B\u0438 Imgur \u043D\u0430 \u0441\u0430\u043C \u0444\u0430\u0439\u043B .gif.";
var ANON_USER_TOKEN = "ad9739191285443a88dd2994ce7da73fbcf58f8d6525407989193eaebcca77d4";
export async function uploadImageToPanax(p) {
  const fetchImpl = p.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
  if (!fetchImpl) return { ok: false, code: "no-fetch", error: "fetch \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D" };
  const bytes = p.bytes instanceof Uint8Array ? p.bytes : new Uint8Array(p.bytes || []);
  const contentType = isRasterImageType(p.contentType) ? p.contentType : "image/jpeg";
  const width = Math.max(0, Math.round(+p.width || 0));
  const height = Math.max(0, Math.round(+p.height || 0));
  if (!bytes.length) return { ok: false, code: "empty", error: "\u043F\u0443\u0441\u0442\u043E\u0439 \u0444\u0430\u0439\u043B" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, code: "too-large", error: "\u0444\u0430\u0439\u043B \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439" };
  const q = new URLSearchParams({
    file_type: "image",
    content_type: contentType,
    width: String(width || ""),
    height: String(height || "")
  });
  let presign;
  try {
    presign = await getJson(fetchImpl, "/community/upload-pre-signed-url?" + q.toString(), {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-Anonymous-User-Token": ANON_USER_TOKEN
      }
    });
  } catch (e) {
    const code = e && e.status === 401 ? "auth" : e && e.code ? e.code : "presign";
    return { ok: false, code, error: e && e.message || "\u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0430\u0434\u0440\u0435\u0441 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438", status: e && e.status };
  }
  const uploadUrl = presign && (presign.upload_pre_signed_url || presign.url);
  if (!uploadUrl) return { ok: false, code: "presign", error: "\u0441\u0435\u0440\u0432\u0435\u0440 \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B \u0430\u0434\u0440\u0435\u0441 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438" };
  let putTo;
  try {
    putTo = s3PutUrl(uploadUrl, { pageOrigin: p.pageOrigin });
  } catch (e) {
    return { ok: false, code: "presign", error: "\u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438" };
  }
  const put = await fetchImpl(putTo, {
    method: "PUT",
    body: bytes,
    credentials: "omit",
    headers: {
      "Content-Type": contentType,
      "x-amz-meta-width": String(width || 0),
      "x-amz-meta-height": String(height || 0)
    }
  });
  if (!put.ok) return { ok: false, code: "put", error: "\u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0444\u0430\u0439\u043B\u0430 \u043D\u0435 \u0443\u0434\u0430\u043B\u0430\u0441\u044C (" + put.status + ")", status: put.status };
  const deadline = Date.now() + 3e4;
  let conv = null;
  let completed = false;
  while (Date.now() < deadline) {
    try {
      conv = await getJson(fetchImpl, "/community/check-image-convert?pre_signed_url=" + encodeURIComponent(uploadUrl), {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "X-Anonymous-User-Token": ANON_USER_TOKEN
        }
      });
      if (conv && conv.is_completed) {
        completed = true;
        break;
      }
      if (conv && (conv.status === "ERROR" || conv.status === "CANCELED")) {
        return { ok: false, code: "convert", error: "\u0441\u0435\u0440\u0432\u0435\u0440 \u043D\u0435 \u0441\u043C\u043E\u0433 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435" };
      }
    } catch (e) {
      if (e && e.status === 401) return { ok: false, code: "auth", error: e.message || "\u043D\u0443\u0436\u0435\u043D \u0432\u0445\u043E\u0434 \u043D\u0430 \u0441\u0430\u0439\u0442\u0435", status: 401 };
    }
    await sleep(1e3);
  }
  if (!completed) return { ok: false, code: "convert", error: "\u0441\u0435\u0440\u0432\u0435\u0440 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043B \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0443 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u0432\u043E\u0432\u0440\u0435\u043C\u044F" };
  const candidates = [
    conv && (conv.image_url || conv.public_url || conv.url || conv.converted_url),
    uploadUrl
  ];
  let href = "";
  for (const c of candidates) {
    if (!c) continue;
    href = toPublicPanaxImageUrl(c, { pageOrigin: p.pageOrigin }) || safeUserImageUrl(c);
    if (href && !hasSignedQuery(href)) break;
    href = "";
  }
  if (!href) return { ok: false, code: "url", error: "\u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F" };
  const wantAnim = shouldPreserveAnimation({ type: contentType }, bytes);
  const probeUntil = Date.now() + 12e3;
  let probed = null;
  while (Date.now() < probeUntil) {
    probed = await probeFetched(fetchImpl, href);
    if (probed) break;
    await sleep(800);
  }
  if (!probed) return { ok: false, code: "not-ready", error: "\u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043F\u043E\u043A\u0430 \u043D\u0435 \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F", url: href };
  const picked = await pickAnimatedPublicUrl(fetchImpl, href, probed, { wantAnim, pageOrigin: p.pageOrigin });
  const out = {
    ok: true,
    url: picked.url,
    width,
    height,
    origin: "upload",
    probed: true,
    animated: !!picked.animated,
    kind: picked.kind || ""
  };
  if (wantAnim && !picked.animated) {
    out.warning = FLAT_GIF_HINT;
  }
  return out;
}
async function pickAnimatedPublicUrl(fetchImpl, href, firstProbe, opts = {}) {
  const wantAnim = !!opts.wantAnim;
  const list = [];
  const add = (u) => {
    const clean2 = toPublicPanaxImageUrl(u, { pageOrigin: opts.pageOrigin }) || safeUserImageUrl(u);
    if (clean2 && !hasSignedQuery(clean2) && !list.includes(clean2)) list.push(clean2);
  };
  add(href);
  const id = panaxImageId(href);
  if (id) {
    const origin = new URL(href).origin;
    const local = isPrivateHost(new URL(href).hostname) || isAllowedExtraOrigin(new URL(href));
    const base = local ? { origin } : {};
    add(panaxInputUrl(id, base));
    add(panaxDerivativeUrl(id, "large", base));
    add(panaxDerivativeUrl(id, "medium", base));
  }
  let bestStill = href;
  let bestStillKind = firstProbe && firstProbe.info && firstProbe.info.type || "";
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    const probe = i === 0 && firstProbe && firstProbe.url === u ? firstProbe : await probeFetched(fetchImpl, u);
    if (!probe) continue;
    const info = probe.info || inspectImageBytes(probe.bytes || []);
    if (info.animated) return { url: u, animated: true, kind: info.type, frames: info.frames, contentType: probe.contentType };
    if (!bestStill) {
      bestStill = u;
      bestStillKind = info.type;
    }
    if (info.type === "gif" || info.type === "webp") {
      bestStill = u;
      bestStillKind = info.type;
    }
  }
  return { url: bestStill, animated: false, kind: bestStillKind };
}
async function probeFetched(fetchImpl, url) {
  try {
    const r = await fetchImpl(url, { method: "GET", credentials: "omit", headers: { Accept: "image/*,*/*" } });
    if (!r.ok) return null;
    const ct = r.headers && typeof r.headers.get === "function" && r.headers.get("content-type") || "";
    if (ct && !/^image\//i.test(ct) && !/^application\/octet-stream/i.test(ct)) return null;
    let buf = new Uint8Array();
    if (typeof r.arrayBuffer === "function") buf = new Uint8Array(await r.arrayBuffer());
    if (!buf.length) return null;
    return { url, contentType: ct, bytes: buf, info: inspectImageBytes(buf) };
  } catch {
    return null;
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function getJson(fetchImpl, url, init) {
  const r = await fetchImpl(url, init);
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!r.ok) {
    const msg = data && (data.detail || data.error || data.message) || "HTTP " + r.status;
    const err = new Error(typeof msg === "string" ? msg : "HTTP " + r.status);
    err.status = r.status;
    err.code = r.status === 401 ? "auth" : "http";
    throw err;
  }
  if (data && data.success === false) {
    const err = new Error(data.error && data.error.message || data.detail || "request failed");
    err.code = "http";
    throw err;
  }
  if (data && data.success === true && data.data != null) return data.data;
  return data;
}

var COMPRESS_MAX_EDGE = 1600;
var COMPRESS_QUALITY = 0.82;
export function bytesToBase64(bytes) {
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
export function normalizeExternalGifUrl(v) {
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
export function probeImageLoad(url, opts = {}) {
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
export async function compressImage(source, opts = {}) {
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
