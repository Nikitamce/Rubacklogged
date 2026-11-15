import { safeUrl, safeColor } from "./gq-schema.js";

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
export function safeInlineStyle(styleText) {
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
        const href = safeUrl(n.getAttribute("href"));
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
export function sanitizeHtml(html, win) {
  const body = parseHtml(html, win);
  const doc = body.ownerDocument;
  const holder = doc.createElement("div");
  rebuild(body, holder, doc);
  return holder.innerHTML;
}
export function sanitizeToFragment(html, targetDoc, win) {
  const body = parseHtml(html, win);
  const frag = targetDoc.createDocumentFragment();
  rebuild(body, frag, targetDoc);
  return frag;
}

export function parseForWalk(html, win) {
  return parseHtml(html, win);
}
