import { safeUrl } from "../shared/gq-schema.js";
import { safeUserImageUrl } from "../shared/gq-image.js";
import { steamCover, ytCover } from "./bridge-core.js";

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getParser(win) {
  const P = (win && win.DOMParser) || (typeof DOMParser !== "undefined" ? DOMParser : null);
  if (!P) throw new Error("DOMParser unavailable");
  return new P();
}

function stripInlineHandlers(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function parseDoc(html, win) {
  return getParser(win).parseFromString(stripInlineHandlers(html), "text/html");
}

function parseFrag(html, win) {
  return getParser(win).parseFromString("<!doctype html><html><body>" + stripInlineHandlers(html) + "</body></html>", "text/html").body;
}

export function extractYoutubeId(url) {
  try {
    const u = new URL(String(url || "").trim());
    const h = u.hostname.replace(/^www\./, "").toLowerCase();
    if (h === "youtu.be") return u.pathname.replace(/^\//, "").split(/[/?#]/)[0] || "";
    if (h === "youtube.com" || h === "m.youtube.com" || h === "youtube-nocookie.com") {
      if (u.pathname.startsWith("/watch")) return u.searchParams.get("v") || "";
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{6,})/);
      if (m) return m[1];
    }
  } catch {
  }
  return "";
}

export function extractSteamAppId(url) {
  const m = String(url || "").match(/store\.steampowered\.com\/(?:app|widget)\/(\d+)/i);
  return m ? m[1] : "";
}

export function extractWorkshopId(url) {
  const m = String(url || "").match(/steamcommunity\.com\/sharedfiles\/filedetails\/?\?[^#]*\bid=(\d+)/i);
  return m ? m[1] : "";
}

export function unwrapExternalUrl(rawHref, baseUrl = "https://backloggd.com/") {
  const raw = String(rawHref || "").trim();
  if (!raw || /^javascript:/i.test(raw)) return "";
  try {
    const resolved = new URL(raw, baseUrl);
    if (resolved.hostname.endsWith("stopgame.ru") && resolved.pathname === "/to") {
      const target = raw.includes("/to?") ? raw.split("/to?")[1] : resolved.search.slice(1);
      if (target) {
        try {
          const decoded = decodeURIComponent(target);
          if (/^https?:\/\//i.test(decoded)) return safeUrl(decoded);
        } catch {
        }
      }
    }
    if (resolved.hostname.endsWith("steamcommunity.com") && resolved.pathname.startsWith("/linkfilter")) {
      const u = resolved.searchParams.get("u") || resolved.searchParams.get("url");
      if (u && /^https?:\/\//i.test(u)) return safeUrl(u);
    }
    return safeUrl(resolved.href);
  } catch {
    return "";
  }
}

export function buildImportUrlCandidates(rawUrl) {
  const s = String(rawUrl || "").trim();
  if (!s) return [];
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s);
  } catch {
    return [];
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return [];
  const host = u.hostname.toLowerCase();
  const list = [];
  if (host.endsWith("stopgame.ru")) {
    const noBrowser = new URL(u.href);
    noBrowser.pathname = noBrowser.pathname.replace(/\/browser\/?$/i, "");
    list.push(noBrowser.href);
    if (noBrowser.href !== u.href) list.push(u.href);
  } else {
    list.push(u.href);
  }
  return list;
}

function cleanInlineNode(node, doc, opts = {}) {
  if (!node) return null;
  if (node.nodeType === 3) {
    return doc.createTextNode(node.nodeValue || "");
  }
  if (node.nodeType !== 1) return null;
  const tag = node.tagName.toUpperCase();
  const cls = String(node.getAttribute("class") || "");

  if (tag === "SCRIPT" || tag === "STYLE" || tag === "SVG" || tag === "NOSCRIPT") return null;
  if (cls.includes("bb_link_host")) return null;
  if (tag === "BR") return doc.createElement("br");

  if (tag === "A") {
    const rawHref = node.getAttribute("href") || "";
    const href = unwrapExternalUrl(rawHref, opts.baseUrl);
    const isGameChip = cls.includes("game-link") || cls.includes("game-chip") || (opts.source === "stopgame" && /^\/game\/[^/]+$/i.test(rawHref));
    const el = doc.createElement("a");
    if (href) {
      el.setAttribute("href", href);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
    if (isGameChip) {
      el.setAttribute("class", "game-chip");
      let txt = (node.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      if (txt && !txt.startsWith("🎮")) txt = "🎮 " + txt;
      el.textContent = txt || "🎮 Игра";
      return el;
    }
    for (const ch of Array.from(node.childNodes)) {
      const c = cleanInlineNode(ch, doc, opts);
      if (c) el.appendChild(c);
    }
    return el.textContent.trim() ? el : null;
  }

  if (tag === "DEL" || tag === "S" || tag === "STRIKE" || cls.includes("bb_strike")) {
    const el = doc.createElement("s");
    for (const ch of Array.from(node.childNodes)) {
      const c = cleanInlineNode(ch, doc, opts);
      if (c) el.appendChild(c);
    }
    return el.childNodes.length ? el : null;
  }

  if (tag === "B" || tag === "STRONG" || tag === "I" || tag === "EM" || tag === "U" || tag === "CODE" || tag === "MARK" || tag === "SUB" || tag === "SUP") {
    const outTag = tag === "STRONG" ? "b" : tag === "EM" ? "i" : tag.toLowerCase();
    const el = doc.createElement(outTag);
    for (const ch of Array.from(node.childNodes)) {
      const c = cleanInlineNode(ch, doc, opts);
      if (c) el.appendChild(c);
    }
    return el.childNodes.length ? el : null;
  }

  const frag = doc.createDocumentFragment();
  for (const ch of Array.from(node.childNodes)) {
    const c = cleanInlineNode(ch, doc, opts);
    if (c) frag.appendChild(c);
  }
  return frag;
}

function serializeInline(nodes, doc, opts) {
  const wrap = doc.createElement("div");
  for (const n of nodes) {
    const c = cleanInlineNode(n, doc, opts);
    if (c) wrap.appendChild(c);
  }
  return wrap.innerHTML
    .replace(/^(?:<br\s*\/?>|\s|&nbsp;)+/gi, "")
    .replace(/(?:<br\s*\/?>|\s|&nbsp;)+$/gi, "")
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>")
    .trim();
}

function extractStandaloneLinkWidget(containerEl, opts = {}) {
  const clone = containerEl.cloneNode(true);
  clone.querySelectorAll(".bb_link_host").forEach((x) => x.remove());
  const links = Array.from(clone.querySelectorAll("a[href]"));
  if (links.length !== 1) return null;
  const a = links[0];
  const outsideText = clone.textContent.replace(a.textContent || "", "").replace(/[\s\u00a0:：—-]+/g, "").trim();
  if (outsideText) return null;
  const url = unwrapExternalUrl(a.getAttribute("href"), opts.baseUrl);
  if (!url) return null;
  const linkTxt = (a.textContent || "").replace(/\s+/g, " ").trim();
  const isBareUrl = !linkTxt || /^https?:\/\//i.test(linkTxt);
  if (!isBareUrl) return null;
  const ytId = extractYoutubeId(url);
  if (ytId) {
    const watchUrl = `https://www.youtube.com/watch?v=${ytId}`;
    return { type: "youtube", data: { title: "Видео на YouTube", channel: "", dur: "", url: watchUrl, cover: ytCover(watchUrl) } };
  }
  const appId = extractSteamAppId(url);
  if (appId) {
    return { type: "steam", data: { title: opts.game || "Игра в Steam", app: appId, price: "", old: "", disc: "", date: "", tags: [], cover: steamCover(appId), url: `https://store.steampowered.com/app/${appId}/` } };
  }
  const wsId = extractWorkshopId(url);
  if (wsId) {
    return { type: "workshop", data: { title: "Предмет Мастерской Steam", author: "", subs: "", game: opts.game || "", url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${wsId}`, cover: "" } };
  }
  return null;
}

function isHeadingParagraph(pEl) {
  const txt = (pEl.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!txt || txt.length > 90 || /[.!?,;:]$/.test(txt)) return false;
  if (pEl.querySelector("a, img")) return false;
  const clone = pEl.cloneNode(true);
  clone.querySelectorAll("b, strong").forEach((el) => el.remove());
  const leftover = clone.textContent.replace(/[\s\u00a0]+/g, "").trim();
  return leftover === "" && !!pEl.querySelector("b, strong");
}

function cleanListEl(listEl, doc, opts) {
  const tag = listEl.tagName.toLowerCase() === "ol" ? "ol" : "ul";
  const out = doc.createElement(tag);
  for (const li of Array.from(listEl.children)) {
    if (li.tagName.toUpperCase() !== "LI") continue;
    const item = doc.createElement("li");
    for (const ch of Array.from(li.childNodes)) {
      const c = cleanInlineNode(ch, doc, opts);
      if (c) item.appendChild(c);
    }
    item.innerHTML = item.innerHTML.replace(/(?:<br\s*\/?>|\s|&nbsp;)+$/gi, "").trim();
    if (item.textContent.trim() || item.querySelector("a")) out.appendChild(item);
  }
  return out.children.length ? out.outerHTML : "";
}

function detectScoreFromText(text) {
  const s = String(text || "");
  const m = s.match(/(?:оценка(?:\s+всего\s+сборника|\s+игры)?|итог(?:овая)?|verdict|score)[^.\n]{0,45}?\b(10|[1-9])\s*(?:из\s*10|\/\s*10)\b/i)
    || s.match(/\b(10|[1-9])\s*(?:из\s*10|\/\s*10)\b(?!\s*ч\.)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 10) return n;
  }
  return 0;
}

/* ============================================================================
 * STOPGAME.RU PARSER
 * ============================================================================ */
export function parseStopGameHtml(html, baseUrl = "https://stopgame.ru/", opts = {}) {
  const doc = parseDoc(html, opts.win);
  const extractMeta = opts.extractMeta !== false;

  const h1 = doc.querySelector('div[class*="_review-content_"] h1, h1[class*="_title_"], article h1, h1');
  let title = h1 ? h1.textContent.replace(/\s+/g, " ").trim() : "";
  const docTitle = (doc.querySelector("title")?.textContent || "").trim();
  if (!title && docTitle) {
    title = docTitle.replace(/\s*\|\s*StopGame.*$/i, "").trim();
  }

  let game = "";
  const gameLinks = Array.from(doc.querySelectorAll('#sg-breadcrumbs a[href*="/game/"], a[class*="_mobile-game-info_"][href*="/game/"], div[class*="_left-column_"] a[href*="/game/"]'));
  for (const a of gameLinks) {
    const href = a.getAttribute("href") || "";
    if (!/^\/game\/[^/?#]+$/i.test(href) && !/stopgame\.ru\/game\/[^/?#]+$/i.test(href)) continue;
    const t = a.textContent.replace(/\s+/g, " ").trim();
    if (t) { game = t; break; }
  }
  if (!game && docTitle) {
    const tm = docTitle.match(/Отзыв об игре\s+(.+?)\s+от пользователя/i);
    if (tm) game = tm[1].trim();
  }

  let score = 0;
  const filledStars = doc.querySelector('div[class*="_review-content_"] div[class*="_stars--filled_"]');
  if (filledStars) {
    const svgs = Array.from(filledStars.querySelectorAll("svg"));
    let pts = 0;
    for (const svg of svgs) {
      const cls = String(svg.getAttribute("class") || "");
      const useHref = svg.querySelector("use")?.getAttribute("href") || "";
      if (cls.includes("half") || useHref.includes("half")) pts += 1;
      else pts += 2;
    }
    if (pts > 0) score = Math.min(10, Math.max(1, pts));
  }

  const pros = [];
  const cons = [];
  if (extractMeta) {
    const pm = doc.querySelector('div[class*="_plus-minus_"]');
    if (pm) {
      pm.querySelectorAll('span[class*="_plus-minus--plus_"]').forEach((sp) => {
        const text = (sp.querySelector("span")?.textContent || sp.textContent || "").replace(/\s+/g, " ").trim();
        if (text) pros.push({ text });
      });
      pm.querySelectorAll('span[class*="_plus-minus--minus_"]').forEach((sp) => {
        const text = (sp.querySelector("span")?.textContent || sp.textContent || "").replace(/\s+/g, " ").trim();
        if (text) cons.push({ text });
      });
    }
  }

  const content = doc.querySelector('div[class*="_review-content_"] div[class*="_content-wrapper_"]')
    || doc.querySelector('div[class*="_content-wrapper_"]')
    || doc.querySelector('div[class*="_review-content_"]');

  const blocks = [];
  const inlineOpts = { baseUrl, source: "stopgame", game };

  if (content) {
    for (const child of Array.from(content.children)) {
      const tag = child.tagName.toUpperCase();
      const cls = String(child.getAttribute("class") || "");

      if (cls.includes("_image-wrapper_") || tag === "FIGURE") {
        const light = child.querySelector('a[href]');
        const imgEl = child.querySelector("img");
        const rawUrl = (light && light.getAttribute("href")) || (imgEl && imgEl.getAttribute("src")) || "";
        const imgUrl = safeUserImageUrl(unwrapExternalUrl(rawUrl, baseUrl));
        const capEl = child.querySelector('div[class*="_caption_"], figcaption');
        const caption = (capEl ? capEl.textContent : imgEl?.getAttribute("alt") || "").replace(/\s+/g, " ").trim();
        if (imgUrl) {
          blocks.push({
            type: "image",
            data: { url: imgUrl, caption, alt: caption, origin: "url", items: [{ url: imgUrl, caption, alt: caption, origin: "url" }] }
          });
        }
        continue;
      }

      if (tag === "IFRAME") {
        const ytId = extractYoutubeId(child.getAttribute("src") || "");
        if (ytId) {
          const watchUrl = `https://www.youtube.com/watch?v=${ytId}`;
          blocks.push({ type: "youtube", data: { title: "Видео", channel: "", dur: "", url: watchUrl, cover: ytCover(watchUrl) } });
        }
        continue;
      }

      if (tag === "H1" || tag === "H2") {
        const htmlTxt = serializeInline(Array.from(child.childNodes), doc, inlineOpts);
        if (htmlTxt) blocks.push({ type: "h2", html: htmlTxt });
        continue;
      }
      if (tag === "H3" || tag === "H4") {
        const htmlTxt = serializeInline(Array.from(child.childNodes), doc, inlineOpts);
        if (htmlTxt) blocks.push({ type: "h3", html: htmlTxt });
        continue;
      }
      if (tag === "BLOCKQUOTE") {
        const htmlTxt = serializeInline(Array.from(child.childNodes), doc, inlineOpts);
        if (htmlTxt) blocks.push({ type: "quote", html: htmlTxt });
        continue;
      }
      if (tag === "HR") {
        blocks.push({ type: "divider", data: { style: 1 } });
        continue;
      }
      if (tag === "UL" || tag === "OL") {
        const listHtml = cleanListEl(child, doc, inlineOpts);
        if (listHtml) blocks.push({ type: "text", html: listHtml });
        continue;
      }

      const standalone = extractStandaloneLinkWidget(child, inlineOpts);
      if (standalone) {
        blocks.push(standalone);
        continue;
      }

      if (isHeadingParagraph(child)) {
        const headingText = child.textContent.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
        const isMainSection = /^(итог|итоги|заключение|введение|вердикт)$/i.test(headingText);
        blocks.push({ type: isMainSection ? "h2" : "h3", html: escHtml(headingText) });
        continue;
      }

      const imgInside = child.querySelector("img");
      if (imgInside && !child.textContent.trim()) {
        const imgUrl = safeUserImageUrl(unwrapExternalUrl(imgInside.getAttribute("src"), baseUrl));
        const caption = (imgInside.getAttribute("alt") || "").trim();
        if (imgUrl) {
          blocks.push({ type: "image", data: { url: imgUrl, caption, alt: caption, origin: "url", items: [{ url: imgUrl, caption, alt: caption, origin: "url" }] } });
          continue;
        }
      }

      const htmlTxt = serializeInline(Array.from(child.childNodes), doc, inlineOpts);
      if (htmlTxt) {
        blocks.push({ type: "text", html: htmlTxt });
      }
    }
  }

  if (!score && extractMeta && content) {
    score = detectScoreFromText(content.textContent);
  }
  const recommend = score >= 7 ? "yes" : score >= 5 ? "neutral" : score >= 1 ? "no" : "none";

  return {
    title,
    game,
    appId: "",
    sourceUrl: baseUrl,
    sourceKind: "stopgame",
    score,
    recommend,
    aspects: [],
    pros,
    cons,
    blocks,
    warnings: []
  };
}

/* ============================================================================
 * STEAM BBCODE -> HTML CONVERTER + STEAM REVIEW CONTAINER PARSER
 * ============================================================================ */
export function steamBbCodeToHtml(bbcode) {
  let s = String(bbcode || "").replace(/\r\n?/g, "\n");
  const protectedBlocks = [];
  const protect = (htmlStr) => {
    const key = `\u0000GQ_PROT_${protectedBlocks.length}\u0000`;
    protectedBlocks.push(htmlStr);
    return key;
  };

  // Preserve [noparse]...[/noparse] literally
  s = s.replace(/\[noparse\]([\s\S]*?)\[\/noparse\]/gi, (_, inner) => protect(escHtml(inner)));
  // Preserve [code]...[/code] verbatim inside div.bb_code
  s = s.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (_, inner) => {
    const trimmed = inner.replace(/^\n+|\n+$/g, "");
    return protect(`<div class="bb_code">${escHtml(trimmed)}</div>`);
  });

  // Escape raw HTML brackets outside protected sections
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Tables
  s = s.replace(/\[table(?:\s+[^\]]*)?\]([\s\S]*?)\[\/table\]/gi, (_, tbl) => {
    let body = tbl;
    body = body.replace(/\[tr\]([\s\S]*?)\[\/tr\]/gi, (_, tr) => `<div class="bb_table_tr">${tr}</div>`);
    body = body.replace(/\[th\]([\s\S]*?)\[\/th\]/gi, (_, th) => `<div class="bb_table_th">${th.trim()}</div>`);
    body = body.replace(/\[td\]([\s\S]*?)\[\/td\]/gi, (_, td) => `<div class="bb_table_td">${td.trim()}</div>`);
    return `<div class="bb_table">${body}</div>`;
  });

  // Lists
  const convertList = (tagName, inner) => {
    const parts = inner.split(/\[\*\]/g).map((x) => x.trim()).filter(Boolean);
    return `<${tagName} class="${tagName === "ul" ? "bb_ul" : ""}">${parts.map((p) => `<li>${p}</li>`).join("")}</${tagName}>`;
  };
  s = s.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (_, inner) => convertList("ul", inner));
  s = s.replace(/\[olist\]([\s\S]*?)\[\/olist\]/gi, (_, inner) => convertList("ol", inner));

  // Quotes
  s = s.replace(/\[quote=([^\]]+)\]([\s\S]*?)\[\/quote\]/gi, (_, author, body) =>
    `<blockquote class="bb_blockquote with_author"><div class="bb_quoteauthor">Автор: <b>${author.trim()}</b></div>${body.trim()}</blockquote>`
  );
  s = s.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, (_, body) =>
    `<blockquote class="bb_blockquote">${body.trim()}</blockquote>`
  );

  // Headings
  s = s.replace(/\[h1\]([\s\S]*?)\[\/h1\]/gi, (_, t) => `<div class="bb_h1">${t.trim()}</div>`);
  s = s.replace(/\[h2\]([\s\S]*?)\[\/h2\]/gi, (_, t) => `<div class="bb_h2">${t.trim()}</div>`);
  s = s.replace(/\[h3\]([\s\S]*?)\[\/h3\]/gi, (_, t) => `<div class="bb_h3">${t.trim()}</div>`);

  // Horizontal rule
  s = s.replace(/\[hr\]\s*\[\/hr\]|\[hr\]/gi, "<hr>");

  // Spoiler
  s = s.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, (_, t) => `<span class="bb_spoiler"><span>${t}</span></span>`);

  // Links
  s = s.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, href, text) => {
    const cleanHref = /^https?:\/\//i.test(href.trim()) ? href.trim() : "https://" + href.trim();
    return `<a class="bb_link" href="${cleanHref}">${text}</a>`;
  });
  s = s.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_, href) => {
    const cleanHref = /^https?:\/\//i.test(href.trim()) ? href.trim() : "https://" + href.trim();
    return `<a class="bb_link" href="${cleanHref}">${href.trim()}</a>`;
  });

  // Inline formatting
  s = s.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, "<b>$1</b>");
  s = s.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, "<u>$1</u>");
  s = s.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "<i>$1</i>");
  s = s.replace(/\[strike\]([\s\S]*?)\[\/strike\]/gi, '<span class="bb_strike">$1</span>');

  // Auto-link bare YouTube / Steam Store / Workshop URLs on their own line
  s = s.replace(/(^|\n)(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?[^\s<]+|youtu\.be\/[^\s<]+|store\.steampowered\.com\/app\/\d+[^\s<]*|steamcommunity\.com\/sharedfiles\/filedetails\/\?id=\d+[^\s<]*))(?=\n|$)/gi,
    (_, lead, url) => `${lead}<a class="bb_link" href="${url}">${url}</a>`
  );

  // Clean extra newlines around block tags and turn remaining newlines to <br>
  s = s.replace(/\n*(<(?:div class="bb_(?:h[123]|table|code)"|blockquote|ul|ol|hr)[^>]*>)/gi, "$1");
  s = s.replace(/(<\/(?:div|blockquote|ul|ol)>|<hr>)\n+/gi, "$1");
  s = s.replace(/\n/g, "<br>");

  // Restore protected blocks
  s = s.replace(/\u0000GQ_PROT_(\d+)\u0000/g, (_, idx) => protectedBlocks[Number(idx)] || "");
  return s;
}

function parseSteamTableEl(tableEl, doc, inlineOpts, state) {
  const trEls = Array.from(tableEl.querySelectorAll(".bb_table_tr, tr"));
  if (!trEls.length) return null;
  const rows = trEls.map((tr) => {
    const cells = Array.from(tr.children).filter((c) => /bb_table_t[hd]|^(?:TH|TD)$/i.test((c.className || "") + " " + c.tagName));
    return cells.map((cell) => ({
      isHeader: /bb_table_th|^TH$/i.test((cell.className || "") + " " + cell.tagName),
      text: cell.textContent.replace(/\s+/g, " ").trim(),
      html: serializeInline(Array.from(cell.childNodes), doc, inlineOpts)
    }));
  }).filter((r) => r.length > 0);
  if (!rows.length) return null;

  // Check if verdict box (e.g. "9/10 Моя оценка | 👍 РЕКОМЕНДУЮ")
  const flatText = rows.flat().map((c) => c.text).join(" | ");
  const verdictScore = flatText.match(/\b(10|[1-9])\s*\/\s*10\b/);
  if (state.extractMeta && rows.length <= 2 && verdictScore && /рекомендую|recommended/i.test(flatText)) {
    const n = parseInt(verdictScore[1], 10);
    if (n >= 1 && n <= 10 && !state.score) state.score = n;
    if (/не\s*рекомендую|not\s*recommended/i.test(flatText)) state.recommend = "no";
    else state.recommend = "yes";
  }

  // Check if aspect rating table (e.g. Графика | 10/10 | 🌸 Великолепно)
  const scoreRowMatches = [];
  for (const row of rows) {
    if (row.every((c) => c.isHeader)) continue;
    if (row.length < 2) continue;
    const scoreIdx = row.findIndex((c, idx) => idx > 0 && /^\s*(10|[0-9])\s*\/\s*10\s*$/i.test(c.text));
    if (scoreIdx >= 1 && row[0].text && row[0].text.length <= 50) {
      const m = row[scoreIdx].text.match(/(\d+)/);
      const val = m ? Math.min(10, Math.max(0, parseInt(m[1], 10))) : 0;
      const extra = row.filter((_, idx) => idx !== 0 && idx !== scoreIdx).map((c) => c.text).filter(Boolean).join(" · ");
      scoreRowMatches.push({ name: row[0].text, score: val, extra });
    }
  }
  if (state.extractMeta && scoreRowMatches.length >= 2) {
    for (const item of scoreRowMatches) {
      if (!state.aspects.some((a) => a.name.toLowerCase() === item.name.toLowerCase())) {
        state.aspects.push({ name: item.name, score: item.score, unrated: "unsure" });
      }
    }
    const lines = scoreRowMatches.map((x) => `<b>${escHtml(x.name)}</b> — ${x.score}/10${x.extra ? ` · ${escHtml(x.extra)}` : ""}`);
    if (lines.some((l) => l.includes("·"))) {
      return { type: "text", html: lines.join("<br>") };
    }
    return null;
  }

  // Generic formatted table -> clean readable text lines
  const outLines = rows.map((row) => {
    return row.map((c) => {
      if (!c.html) return escHtml(c.text);
      return c.isHeader && !/^<b>/i.test(c.html) ? `<b>${c.html}</b>` : c.html;
    }).filter(Boolean).join(" — ");
  }).filter(Boolean);
  return outLines.length ? { type: "text", html: outLines.join("<br>") } : null;
}

function parseSteamContainer(containerEl, doc, baseUrl, opts = {}) {
  const blocks = [];
  const state = {
    extractMeta: opts.extractMeta !== false,
    score: opts.initialScore || 0,
    recommend: opts.initialRecommend || "none",
    aspects: [],
    pros: [],
    cons: []
  };
  const inlineOpts = { baseUrl, source: "steam", game: opts.game || "" };
  let inlineBuf = [];

  const flushInline = () => {
    if (!inlineBuf.length) return;
    const holder = doc.createElement("div");
    for (const n of inlineBuf) holder.appendChild(n.cloneNode(true));
    inlineBuf = [];
    const widget = extractStandaloneLinkWidget(holder, inlineOpts);
    if (widget) {
      blocks.push(widget);
      return;
    }
    const htmlTxt = serializeInline(Array.from(holder.childNodes), doc, inlineOpts);
    if (htmlTxt) blocks.push({ type: "text", html: htmlTxt });
  };

  let brRun = 0;
  for (const node of Array.from(containerEl.childNodes)) {
    if (node.nodeType === 3) {
      const txt = node.nodeValue || "";
      if (txt.trim()) brRun = 0;
      inlineBuf.push(node);
      continue;
    }
    if (node.nodeType !== 1) continue;
    const tag = node.tagName.toUpperCase();
    const cls = String(node.getAttribute("class") || "");

    if (cls.includes("bb_link_host")) continue;

    if (tag === "BR") {
      brRun += 1;
      if (brRun >= 2) {
        flushInline();
      } else {
        inlineBuf.push(node);
      }
      continue;
    }
    brRun = 0;

    if (cls.includes("bb_h1") || cls.includes("bb_h2") || tag === "H1" || tag === "H2") {
      flushInline();
      const htmlTxt = serializeInline(Array.from(node.childNodes), doc, inlineOpts);
      if (htmlTxt) blocks.push({ type: "h2", html: htmlTxt });
      continue;
    }
    if (cls.includes("bb_h3") || tag === "H3" || tag === "H4") {
      flushInline();
      const htmlTxt = serializeInline(Array.from(node.childNodes), doc, inlineOpts);
      if (htmlTxt) blocks.push({ type: "h3", html: htmlTxt });
      continue;
    }
    if (tag === "HR") {
      flushInline();
      blocks.push({ type: "divider", data: { style: 1 } });
      continue;
    }
    if (tag === "BLOCKQUOTE" || cls.includes("bb_blockquote")) {
      flushInline();
      const clone = node.cloneNode(true);
      const authorEl = clone.querySelector(".bb_quoteauthor");
      let prefix = "";
      if (authorEl) {
        let at = authorEl.textContent.replace(/\s+/g, " ").trim();
        at = at.replace(/^Originally posted by\s*/i, "Автор: ").replace(/:\s*$/, "");
        authorEl.remove();
        if (at) prefix = `<b>${escHtml(at)}</b><br>`;
      }
      const bodyHtml = serializeInline(Array.from(clone.childNodes), doc, inlineOpts);
      if (prefix || bodyHtml) blocks.push({ type: "quote", html: prefix + bodyHtml });
      continue;
    }
    if (cls.includes("bb_spoiler")) {
      flushInline();
      const spHtml = serializeInline(Array.from(node.childNodes), doc, inlineOpts);
      if (spHtml) blocks.push({ type: "spoiler", html: spHtml, hidden: true });
      continue;
    }
    if (cls.includes("bb_code") || tag === "PRE") {
      flushInline();
      const rawCode = node.textContent.replace(/^\n+|\n+$/g, "");
      if (rawCode.trim()) {
        const htmlLines = rawCode.split(/\r?\n/).map((l) => escHtml(l)).join("<br>");
        blocks.push({ type: "text", html: `<code>${htmlLines}</code>` });
      }
      continue;
    }
    if (tag === "UL" || tag === "OL" || cls.includes("bb_ul")) {
      flushInline();
      const listHtml = cleanListEl(node, doc, inlineOpts);
      if (listHtml) blocks.push({ type: "text", html: listHtml });
      continue;
    }
    if (cls.includes("bb_table") || tag === "TABLE") {
      flushInline();
      const tblBlock = parseSteamTableEl(node, doc, inlineOpts, state);
      if (tblBlock) blocks.push(tblBlock);
      continue;
    }
    if (tag === "A" && (cls.includes("workshop_item") || cls.includes("dynamiclink_box"))) {
      flushInline();
      const url = unwrapExternalUrl(node.getAttribute("href"), baseUrl);
      const title = (node.querySelector(".dynamiclink_name")?.textContent || "Предмет Мастерской").replace(/\u00a0/g, " ").trim();
      const author = (node.querySelector(".dynamiclink_authorname")?.textContent || "").trim();
      const typeTxt = (node.querySelector(".dynamiclink_type")?.textContent || "").trim();
      const gameMatch = typeTxt.match(/(?:для|for)\s+(.+)$/i);
      const game = gameMatch ? gameMatch[1].trim() : typeTxt;
      const coverRaw = node.querySelector("img.dynamiclink_preview")?.getAttribute("src") || "";
      const cover = safeUserImageUrl(coverRaw);
      if (url) {
        blocks.push({ type: "workshop", data: { title, author, subs: "", game, url, cover } });
      }
      continue;
    }
    if (tag === "IFRAME") {
      flushInline();
      const src = node.getAttribute("src") || "";
      const appId = extractSteamAppId(src);
      if (appId) {
        blocks.push({
          type: "steam",
          data: { title: opts.game || "Игра в Steam", app: appId, price: "", old: "", disc: "", date: "", tags: [], cover: steamCover(appId), url: `https://store.steampowered.com/app/${appId}/` }
        });
      } else {
        const ytId = extractYoutubeId(src);
        if (ytId) {
          const watchUrl = `https://www.youtube.com/watch?v=${ytId}`;
          blocks.push({ type: "youtube", data: { title: "Видео на YouTube", channel: "", dur: "", url: watchUrl, cover: ytCover(watchUrl) } });
        }
      }
      continue;
    }
    if (tag === "IMG") {
      flushInline();
      const url = safeUserImageUrl(unwrapExternalUrl(node.getAttribute("src"), baseUrl));
      const caption = (node.getAttribute("alt") || "").trim();
      if (url) blocks.push({ type: "image", data: { url, caption, alt: caption, origin: "url", items: [{ url, caption, alt: caption, origin: "url" }] } });
      continue;
    }
    if (tag === "DIV" || tag === "P") {
      const innerHasBlock = node.querySelector(".bb_h1, .bb_h2, .bb_h3, .bb_table, .bb_blockquote, .bb_code, .bb_spoiler, ul, ol, iframe, blockquote");
      if (!innerHasBlock && !inlineBuf.length) {
        const widget = extractStandaloneLinkWidget(node, inlineOpts);
        if (widget) { blocks.push(widget); continue; }
        const htmlTxt = serializeInline(Array.from(node.childNodes), doc, inlineOpts);
        if (htmlTxt) blocks.push({ type: "text", html: htmlTxt });
        continue;
      }
    }
    inlineBuf.push(node);
  }
  flushInline();

  return {
    blocks,
    score: state.score,
    recommend: state.recommend,
    aspects: state.aspects,
    pros: state.pros,
    cons: state.cons
  };
}

export function parseSteamReviewHtml(html, baseUrl = "https://steamcommunity.com/", opts = {}) {
  const doc = parseDoc(html, opts.win);
  const fullText = doc.body ? doc.body.textContent : "";
  const isHidden = /automated content check|автоматической проверки контента/i.test(fullText);

  let game = "";
  const locs = Array.from(doc.querySelectorAll(".profile_small_header_location"));
  if (locs.length) game = locs[locs.length - 1].textContent.replace(/\s+/g, " ").trim();
  const docTitle = (doc.querySelector("title")?.textContent || "").trim();
  if (!game && docTitle) {
    const m = docTitle.match(/(?:Обзор|Review for)\s+(.+?)\s*$/i);
    if (m) game = m[1].trim();
  }

  let appId = extractSteamAppId(baseUrl);
  if (!appId) {
    const m = String(baseUrl || "").match(/\/recommended\/(\d+)/i);
    if (m) appId = m[1];
  }
  if (!appId) {
    const storeBtn = doc.querySelector('#rightContents a[href*="store.steampowered.com/app/"], a[href*="store.steampowered.com/app/"]');
    if (storeBtn) appId = extractSteamAppId(storeBtn.getAttribute("href") || "");
  }

  let recommend = "none";
  const recText = (doc.querySelector("#ReviewTitle .ratingSummary, .ratingSummary")?.textContent || "").trim();
  if (/не\s*рекомендую|not\s*recommended/i.test(recText)) recommend = "no";
  else if (/рекомендую|recommended/i.test(recText)) recommend = "yes";

  const reviewEl = doc.querySelector("#ReviewText") || doc.querySelector(".review_area_content");
  if (!reviewEl) {
    if (isHidden) {
      const err = new Error("Обзор в Steam временно скрыт автоматической проверкой и недоступен по публичной ссылке.");
      err.code = "steam-hidden";
      throw err;
    }
    const err = new Error("На странице Steam не найден текст обзора (#ReviewText).");
    err.code = "no-content";
    throw err;
  }

  const parsed = parseSteamContainer(reviewEl, doc, baseUrl, { ...opts, game, initialRecommend: recommend });
  let title = "";
  if (parsed.blocks.length && parsed.blocks[0].type === "h2") {
    const firstH = parseFrag(parsed.blocks[0].html, opts.win).textContent.replace(/\s+/g, " ").trim();
    if (firstH && firstH.length <= 160) {
      title = firstH;
      parsed.blocks.shift();
    }
  }
  if (!title) title = game ? `Обзор ${game}` : "Обзор из Steam";

  const warnings = [];
  if (isHidden) warnings.push("В Steam активна плашка автоматической проверки контента — проверьте перенесённый текст.");

  return {
    title,
    game,
    appId,
    sourceUrl: baseUrl,
    sourceKind: "steam",
    score: parsed.score || (opts.extractMeta !== false ? detectScoreFromText(reviewEl.textContent) : 0),
    recommend: parsed.recommend !== "none" ? parsed.recommend : recommend,
    aspects: parsed.aspects,
    pros: parsed.pros,
    cons: parsed.cons,
    blocks: parsed.blocks,
    warnings
  };
}

export function parseSteamBbCodeText(bbcode, opts = {}) {
  const html = steamBbCodeToHtml(bbcode);
  const frag = parseFrag(html, opts.win);
  const parsed = parseSteamContainer(frag, frag.ownerDocument, "https://steamcommunity.com/", opts);
  let title = String(opts.title || "").trim();
  if (!title && parsed.blocks.length && parsed.blocks[0].type === "h2") {
    const firstH = parseFrag(parsed.blocks[0].html, opts.win).textContent.replace(/\s+/g, " ").trim();
    if (firstH && firstH.length <= 160) {
      title = firstH;
      parsed.blocks.shift();
    }
  }
  const game = String(opts.game || "").trim();
  if (!title) title = game ? `Обзор ${game}` : "Импортированный обзор";
  return {
    title,
    game,
    appId: opts.appId || "",
    sourceUrl: "",
    sourceKind: "bbcode",
    score: opts.score > 0 ? opts.score : parsed.score,
    recommend: opts.recommend && opts.recommend !== "none" ? opts.recommend : parsed.recommend,
    aspects: parsed.aspects,
    pros: parsed.pros,
    cons: parsed.cons,
    blocks: parsed.blocks,
    warnings: []
  };
}

/* ============================================================================
 * GENERIC HTML REVIEW PARSER (fallback for arbitrary review pages/fragments)
 * ============================================================================ */
export function parseGenericHtml(html, baseUrl = "https://backloggd.com/", opts = {}) {
  const doc = parseDoc(html, opts.win);
  const h1 = doc.querySelector("article h1, main h1, h1");
  let title = String(opts.title || "").trim() || (h1 ? h1.textContent.replace(/\s+/g, " ").trim() : "");
  if (!title) title = (doc.querySelector("title")?.textContent || "").replace(/\s*[|—-]\s*[^|—-]+$/, "").trim();

  let root = doc.querySelector("article") || doc.querySelector("main") || doc.body;
  if (!root || root === doc.body) {
    const cands = Array.from(doc.querySelectorAll("article, main, [class*='review'], [class*='post'], [class*='content'], div"));
    let best = doc.body;
    let bestLen = 0;
    for (const c of cands) {
      const pLen = Array.from(c.querySelectorAll(":scope > p")).reduce((s, p) => s + p.textContent.length, 0);
      if (pLen > bestLen) { bestLen = pLen; best = c; }
    }
    root = best || doc.body;
  }

  const blocks = [];
  const inlineOpts = { baseUrl, source: "generic", game: opts.game || "" };
  const walk = (el) => {
    for (const ch of Array.from(el.children)) {
      const tag = ch.tagName.toUpperCase();
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NAV" || tag === "HEADER" || tag === "FOOTER" || tag === "ASIDE") continue;
      if (tag === "H1") continue;
      if (tag === "H2") {
        const ht = serializeInline(Array.from(ch.childNodes), doc, inlineOpts);
        if (ht) blocks.push({ type: "h2", html: ht });
        continue;
      }
      if (tag === "H3" || tag === "H4") {
        const ht = serializeInline(Array.from(ch.childNodes), doc, inlineOpts);
        if (ht) blocks.push({ type: "h3", html: ht });
        continue;
      }
      if (tag === "BLOCKQUOTE") {
        const ht = serializeInline(Array.from(ch.childNodes), doc, inlineOpts);
        if (ht) blocks.push({ type: "quote", html: ht });
        continue;
      }
      if (tag === "HR") {
        blocks.push({ type: "divider", data: { style: 1 } });
        continue;
      }
      if (tag === "UL" || tag === "OL") {
        const lh = cleanListEl(ch, doc, inlineOpts);
        if (lh) blocks.push({ type: "text", html: lh });
        continue;
      }
      if (tag === "FIGURE") {
        const img = ch.querySelector("img");
        const url = img ? safeUserImageUrl(unwrapExternalUrl(img.getAttribute("src"), baseUrl)) : "";
        const cap = (ch.querySelector("figcaption")?.textContent || img?.getAttribute("alt") || "").replace(/\s+/g, " ").trim();
        if (url) blocks.push({ type: "image", data: { url, caption: cap, alt: cap, origin: "url", items: [{ url, caption: cap, alt: cap, origin: "url" }] } });
        continue;
      }
      if (tag === "IMG") {
        const url = safeUserImageUrl(unwrapExternalUrl(ch.getAttribute("src"), baseUrl));
        const cap = (ch.getAttribute("alt") || "").trim();
        if (url) blocks.push({ type: "image", data: { url, caption: cap, alt: cap, origin: "url", items: [{ url, caption: cap, alt: cap, origin: "url" }] } });
        continue;
      }
      if (tag === "IFRAME") {
        const ytId = extractYoutubeId(ch.getAttribute("src") || "");
        if (ytId) {
          const watchUrl = `https://www.youtube.com/watch?v=${ytId}`;
          blocks.push({ type: "youtube", data: { title: "Видео", channel: "", dur: "", url: watchUrl, cover: ytCover(watchUrl) } });
        }
        continue;
      }
      if (tag === "P") {
        const standalone = extractStandaloneLinkWidget(ch, inlineOpts);
        if (standalone) { blocks.push(standalone); continue; }
        const ht = serializeInline(Array.from(ch.childNodes), doc, inlineOpts);
        if (ht) blocks.push({ type: "text", html: ht });
        continue;
      }
      if (tag === "DIV" || tag === "SECTION") {
        if (ch.querySelector("p, h2, h3, h4, blockquote, ul, ol, figure, img, iframe, div, section")) walk(ch);
        else {
          const ht = serializeInline(Array.from(ch.childNodes), doc, inlineOpts);
          if (ht) blocks.push({ type: "text", html: ht });
        }
      }
    }
  };
  if (root) walk(root);

  const score = opts.score > 0 ? opts.score : (opts.extractMeta !== false ? detectScoreFromText(root?.textContent || "") : 0);
  return {
    title: title || "Импортированный обзор",
    game: String(opts.game || "").trim(),
    appId: extractSteamAppId(baseUrl),
    sourceUrl: baseUrl,
    sourceKind: "html",
    score,
    recommend: opts.recommend && opts.recommend !== "none" ? opts.recommend : (score >= 7 ? "yes" : score >= 5 ? "neutral" : score >= 1 ? "no" : "none"),
    aspects: [],
    pros: [],
    cons: [],
    blocks,
    warnings: []
  };
}

export function detectReviewInputKind(raw, url = "") {
  const u = String(url || "").toLowerCase();
  const s = String(raw || "");
  if (u.includes("stopgame.ru") || /class="[^"]*_review-content_/i.test(s) || /stopgame\.ru\/game\//i.test(s)) return "stopgame";
  if (u.includes("steamcommunity.com") || /\bid=["']ReviewText["']/i.test(s) || /class="[^"]*\bbb_(?:h[123]|table|blockquote|spoiler|code)\b/i.test(s)) return "steam-html";
  if (/\[(?:h[123]|b|i|u|strike|spoiler|quote(?:=[^\]]+)?|code|list|olist|table|noparse|url=[^\]]+)\]/i.test(s)) return "bbcode";
  if (/<(?:p|div|h[1-4]|blockquote|ul|ol|figure|img)\b/i.test(s)) return "html";
  return "plain";
}

export function parsePlainTextReview(text, opts = {}) {
  const paras = String(text || "").replace(/\r\n?/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const blocks = paras.map((p) => {
    const ytId = extractYoutubeId(p);
    if (ytId && /^https?:\/\/\S+$/i.test(p)) {
      const watchUrl = `https://www.youtube.com/watch?v=${ytId}`;
      return { type: "youtube", data: { title: "Видео на YouTube", channel: "", dur: "", url: watchUrl, cover: ytCover(watchUrl) } };
    }
    const appId = extractSteamAppId(p);
    if (appId && /^https?:\/\/\S+$/i.test(p)) {
      return { type: "steam", data: { title: opts.game || "Игра в Steam", app: appId, price: "", old: "", disc: "", date: "", tags: [], cover: steamCover(appId), url: `https://store.steampowered.com/app/${appId}/` } };
    }
    return { type: "text", html: escHtml(p).replace(/\n/g, "<br>") };
  });
  return {
    title: String(opts.title || "").trim() || (opts.game ? `Обзор ${opts.game}` : "Импортированный обзор"),
    game: String(opts.game || "").trim(),
    appId: "",
    sourceUrl: "",
    sourceKind: "plain",
    score: opts.score || 0,
    recommend: opts.recommend || "none",
    aspects: [],
    pros: [],
    cons: [],
    blocks,
    warnings: []
  };
}

export function parseImportedReview(raw, opts = {}) {
  const kind = detectReviewInputKind(raw, opts.url);
  if (kind === "stopgame") return parseStopGameHtml(raw, opts.url || "https://stopgame.ru/", opts);
  if (kind === "steam-html") return parseSteamReviewHtml(raw, opts.url || "https://steamcommunity.com/", opts);
  if (kind === "bbcode") return parseSteamBbCodeText(raw, opts);
  if (kind === "html") return parseGenericHtml(raw, opts.url || "https://backloggd.com/", opts);
  return parsePlainTextReview(raw, opts);
}
