import { safeUserImageUrl, MAX_GALLERY_ITEMS, CAPTION_MAX } from "./gq-image.js";
import { EXTRA_VARIANT_IDS } from "./gq-cards.js";
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
export var DEFAULT_INTEG = {
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
export function str(v, max = LIMITS.str) {
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
export function safeUrl(v) {
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
export function safeImageUrl(v) {
  const href = safeUrl(v);
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
export function safeColor(v) {
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
export function countGalleryFrames(doc) {
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
      links: keyMap(d.links, safeUrl),
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
      url: safeUrl(d.url)
    };
  }
  if (type === "youtube") {
    return {
      title: str(d.title, 200),
      channel: str(d.channel, 80),
      dur: str(d.dur, 12),
      url: safeUrl(d.url),
      cover: safeImageUrl(d.cover)
    };
  }
  if (type === "workshop") {
    return {
      title: str(d.title, 200),
      author: str(d.author, 80),
      subs: str(d.subs, 20),
      game: str(d.game, 120),
      url: safeUrl(d.url),
      cover: safeImageUrl(d.cover)
    };
  }
  if (type === "image") {
    return normalizeImageData(d);
  }
  return {};
}
export function normalizeReview(input, opts = {}) {
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
export function integMeta(review, key) {
  return review && review.integ && review.integ[key] || DEFAULT_INTEG[key] || { name: key, icon: "\u{1F517}", color: "#7c5cff" };
}

export function hasContent(r) {
  if (!r) return false;
  return !!(r.title.trim() || r.score || r.blocks.length || r.pros.length || r.cons.length || r.aspects.some((a) => a.score > 0));
}
