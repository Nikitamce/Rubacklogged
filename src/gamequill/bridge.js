import { MAX_DATA_IMAGE, MAX_UPLOAD_BYTES, toPublicPanaxImageUrl, safeUserImageUrl, base64ToBytes, isRasterImageType, isGifBytes, shouldPreserveAnimation, MAX_GALLERY_ITEMS, inspectImageBytes, FLAT_GIF_HINT, bytesToBase64, normalizeExternalGifUrl, probeImageLoad, compressImage } from "../shared/gq-image.js";
import { str, safeUrl, safeImageUrl, safeColor, normalizeReview, hasContent } from "../shared/gq-schema.js";
import { DEMO_CONFIRM, DEMO_GAME, makeDemoReview, applyDemoReview } from "../shared/gq-demo.js";
import { sanitizeHtml } from "../shared/gq-html.js";
import { FOOTER_TEXT, buildFallback, attachCarriers, opsToHtml } from "../shared/gq-fallback.js";
import { VS_MAX_CHARS, encodeDoc, vsEncode } from "../shared/gq-payload.js";
import { paletteFor } from "../shared/gq-cover.js";
import { DEFAULT_THEME, normalizeTheme, themeList } from "../shared/gq-theme.js";
import { EXTRA_VARIANTS, renderExtraGameCard } from "../shared/gq-cards.js";
import { plain, toEditorReview, cleanInteg, buildIntegMap, steamCover, ytCover, panaxCoverUrl, adaptSteamSearch, adaptSteamDetails, adaptPanaxSearch, steamWidgetPatch, mergeDetails } from "./bridge-core.js";

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
var PANAX_ANON_TOKEN = "ad9739191285443a88dd2994ce7da73fbcf58f8d6525407989193eaebcca77d4";
var PANAX_REACTION_CNT_KEYS = [
  ["legendary", "rating_legendary_cnt"],
  ["awesome", "rating_awesome_cnt"],
  ["good", "rating_good_cnt"],
  ["decent", "rating_decent_cnt"],
  ["dislike", "rating_dislike_cnt"],
  ["awful", "rating_awful_cnt"]
];
var panaxDetCache = /* @__PURE__ */ new Map();
var panaxSearchCache = /* @__PURE__ */ new Map();

function extractBalancedJson(s, start) {
  if (!s || s[start] !== "{") return "";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  return "";
}

function extractFlightGameDetails(html) {
  if (!html) return null;
  let pos = html.indexOf("rating_legendary_cnt");
  if (pos < 0) pos = html.indexOf("gameDetails");
  if (pos >= 0) {
    const prefix = html.lastIndexOf('[1,"', pos);
    if (prefix >= 0 && pos - prefix < 250000) {
      const qStart = prefix + 3;
      let esc = false;
      let qEnd = -1;
      for (let i = qStart + 1; i < html.length; i++) {
        const c = html[i];
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') { qEnd = i; break; }
      }
      if (qEnd > qStart) {
        try {
          const decoded = JSON.parse(html.slice(qStart, qEnd + 1));
          const gdIdx = decoded.indexOf('"gameDetails":');
          if (gdIdx >= 0) {
            const brace = decoded.indexOf("{", gdIdx + 14);
            const jsonText = brace >= 0 ? extractBalancedJson(decoded, brace) : "";
            if (jsonText) return JSON.parse(jsonText);
          }
        } catch {
        }
      }
    }
  }
  const directIdx = html.indexOf('"gameDetails":');
  if (directIdx >= 0) {
    try {
      const brace = html.indexOf("{", directIdx + 14);
      const jsonText = brace >= 0 ? extractBalancedJson(html, brace) : "";
      if (jsonText) return JSON.parse(jsonText);
    } catch {
    }
  }
  return null;
}

function normTitleKey(t) {
  return String(t || "").toLowerCase().replace(/[™®©:\-–—'’"`.,!?/()\[\]]+/g, " ").replace(/\s+/g, " ").trim();
}

function extractPanaxId(v) {
  if (!v) return "";
  if (typeof v === "object") {
    return extractPanaxId(v.panaxId || "") || extractPanaxId(v.id || "") || extractPanaxId(v.gameId || "") || extractPanaxId(v.links && v.links.panax || "");
  }
  const s = String(v).trim();
  const mDetail = /panaxgames\.com\/game-detail\/(\d+)/i.exec(s);
  if (mDetail) return mDetail[1];
  const mPref = /^panax_(\d+)$/i.exec(s);
  if (mPref) return mPref[1];
  if (/^\d+$/.test(s)) return s;
  return "";
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
    url: safeUrl,
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
