import { fingerprintText } from "./gq-hash.js";
import { safeUserImageUrl } from "./gq-image.js";
import { safeUrl, integMeta } from "./gq-schema.js";
import { safeInlineStyle, parseForWalk } from "./gq-html.js";

export var SCORES = [
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
export var VERDICT = {
  yes: { e: "\u{1F44D}", t: "\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u044E", c: "#3ddc97" },
  neutral: { e: "\u{1F914}", t: "\u041D\u0435\u0439\u0442\u0440\u0430\u043B\u044C\u043D\u043E", c: "#ffc84a" },
  no: { e: "\u{1F44E}", t: "\u041D\u0435 \u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u044E", c: "#ff5f6d" },
  none: { e: "\u2754", t: "\u0412\u0435\u0440\u0434\u0438\u043A\u0442 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D", c: "" }
};
export var UNRATED = { unsure: "\u0430\u0432\u0442\u043E\u0440 \u043D\u0435 \u0443\u0432\u0435\u0440\u0435\u043D \u0432 \u043E\u0446\u0435\u043D\u043A\u0435", na: "\u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u043C\u043E \u043A \u044D\u0442\u043E\u0439 \u0438\u0433\u0440\u0435" };
export var FOOTER_TEXT = "\u2726 \u041E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u043E \u0432 GameQuill";
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
        const href = safeUrl(n.getAttribute("href"));
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
export function buildFallback(r, opts = {}) {
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
export function attachCarriers(ops, { text, vs } = {}) {
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
export function opsToHtml(ops) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
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
    let h = esc(s.text);
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
      html += `<p><img src="${esc(ln.image)}" alt="" referrerpolicy="no-referrer" loading="lazy"></p>`;
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
