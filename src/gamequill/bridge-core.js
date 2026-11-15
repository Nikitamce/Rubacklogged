import { paletteFor } from "../shared/gq-cover.js";
import { sanitizeHtml } from "../shared/gq-html.js";
import { str, DEFAULT_INTEG, safeUrl, safeImageUrl, safeColor, normalizeReview } from "../shared/gq-schema.js";

var uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
export var plain = (s, n = 200) => str(s, n).replace(/[<>"'&`]/g, "").trim();
export function toEditorReview(x, sanitize) {
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
export function cleanInteg(ni) {
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
    base: safeUrl(ni.base),
    enabled: ni.enabled !== false,
    ai: !!ni.ai
  };
}
export function buildIntegMap(review, integrations) {
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
export var steamCover = (app) => `https://cdn.akamai.steamstatic.com/steam/apps/${String(app).replace(/\D/g, "")}/header.jpg`;
export function ytCover(url) {
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
export function adaptSteamSearch(json) {
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
export function adaptSteamDetails(json, app) {
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
export function steamWidgetPatch(det) {
  const o = { price: det.price, old: det.old, disc: det.disc, date: det.date, tags: det.genres.slice(0, 4) };
  if (det.title) o.title = det.title;
  if (det.cover) o.cover = det.cover;
  return o;
}
export function mergeDetails(g, det) {
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

export function panaxCoverUrl(raw) {
  const s = str(raw, 400).trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return safeImageUrl(s);
  if (/^\/\/.+/.test(s)) return safeImageUrl("https:" + s);
  const cleanFile = s.replace(/^\/+/, "");
  const full = /^images\//i.test(cleanFile)
    ? `https://d21t60rno19oyf.cloudfront.net/${cleanFile}`
    : `https://d21t60rno19oyf.cloudfront.net/images/t_cover_big/${cleanFile}`;
  return safeImageUrl(full);
}

export function adaptPanaxSearch(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : Array.isArray(data?.items) ? data.items : Array.isArray(data?.games) ? data.games : [];
  return list.slice(0, 12).map((x) => {
    const id = x?.id ?? x?.game_id ?? "";
    const panaxTag = plain(x?.tag || x?.game_tag || "", 120);
    const title = plain(x?.name || x?.title || x?.game_name || "", 140);
    const cover = panaxCoverUrl(x?.cover_image_url || x?.cover || x?.cover_url || x?.image || x?.thumbnail || x?.poster || "");
    const year = String(x?.release_year || (x?.release_date ? String(x.release_date).slice(0, 4) : "") || "");
    const pageUrl = id ? `https://panaxgames.com/game-detail/${id}` : `https://panaxgames.com/search?q=${enc(title)}`;
    return {
      id: "panax_" + id,
      panaxId: String(id || ""),
      panaxTag,
      title,
      year,
      cover,
      dev: plain(x?.developer || x?.dev || "", 100),
      pub: plain(x?.publisher || x?.pub || "", 100),
      genres: Array.isArray(x?.genres) ? x.genres.slice(0, 4).map((g) => plain(typeof g === "string" ? g : g?.name || "", 40)).filter(Boolean) : [],
      plat: Array.isArray(x?.platforms) ? x.platforms.slice(0, 5).map((p) => plain(typeof p === "string" ? p : p?.name || "", 30)).filter(Boolean) : [],
      links: { panax: pageUrl },
      ratings: {},
      source: "PANAX"
    };
  }).filter((g) => g.title);
}
