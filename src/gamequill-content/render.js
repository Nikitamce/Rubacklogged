import { safeUserImageUrl } from "../shared/gq-image.js";
import { safeUrl, safeImageUrl, safeColor, integMeta } from "../shared/gq-schema.js";
import { sanitizeToFragment } from "../shared/gq-html.js";
import { EXTRA_VARIANT_IDS, renderExtraGameCard } from "../shared/gq-cards.js";
import { paletteFor, coverArt } from "../shared/gq-cover.js";
import { SCORES, VERDICT, UNRATED } from "../shared/gq-fallback.js";

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
  const u = safeUrl(href);
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
  const badges = Object.entries(d.ratings || {}).map(([k, v]) => {
    const m = integMeta(r, k);
    return h(doc, "span", { class: "badge" }, `${m.icon} ${v} \xB7 ${m.name}`);
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
  const panaxUrl = safeUrl((d.links && (d.links.panax || d.links.backloggd || d.links.igdb)) || "") || "#";
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
          if (/^on/i.test(attr.name) || (/^(href|src)$/i.test(attr.name) && /^\s*javascript:/i.test(attr.value))) {
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
    const noteText = rxTotal <= 0
      ? "\u041E\u0446\u0435\u043D\u043A\u0438 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u0435\u0440\u0432\u044B\u0445 \u0440\u0435\u0430\u043A\u0446\u0438\u0439 \u0438\u0433\u0440\u043E\u043A\u043E\u0432 \u043D\u0430 Panax."
      : pos >= 85 ? "\u041F\u043E\u0434\u0430\u0432\u043B\u044F\u044E\u0449\u0435\u0435 \u0431\u043E\u043B\u044C\u0448\u0438\u043D\u0441\u0442\u0432\u043E \u0438\u0433\u0440\u043E\u043A\u043E\u0432 \u043E\u0446\u0435\u043D\u0438\u043B\u043E \u0438\u0433\u0440\u0443 \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u043E."
      : pos >= 70 ? "\u041F\u043E\u0447\u0442\u0438 4 \u0438\u0437 5 \u0440\u0435\u0430\u043A\u0446\u0438\u0439 \u2014 \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0432\u043F\u0435\u0447\u0430\u0442\u043B\u0435\u043D\u0438\u044F."
      : pos >= 55 ? "\u0411\u043E\u043B\u044C\u0448\u0438\u043D\u0441\u0442\u0432\u043E \u0440\u0435\u0430\u043A\u0446\u0438\u0439 \u0441\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u0430 \u2014 \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435."
      : neg >= 50 ? "\u0421\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u043E \u0432\u043E\u0441\u043F\u0440\u0438\u043D\u044F\u043B\u043E \u0438\u0433\u0440\u0443 \u0441\u0434\u0435\u0440\u0436\u0430\u043D\u043D\u043E \u0438\u043B\u0438 \u043A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0438."
      : "\u0412\u043F\u0435\u0447\u0430\u0442\u043B\u0435\u043D\u0438\u044F \u0438\u0433\u0440\u043E\u043A\u043E\u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0438\u043B\u0438\u0441\u044C \u043F\u043E\u0440\u043E\u0432\u043D\u0443.";
    const coverImg = img(doc, d.cover, d.gameId || d.title, d.title, "duet-cover");
    coverImg.alt = `\u041E\u0431\u043B\u043E\u0436\u043A\u0430 ${d.title || "\u0418\u0433\u0440\u0430"}`;
    const choiceNode = (t) => h(
      doc,
      "div",
      { class: "duet-choice" },
      t.badge
        ? h(doc, "img", { class: "badge", src: t.badge, alt: t.name, loading: "eager" })
        : h(doc, "span", { class: "badge-ico", text: t.icon }),
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
          (d.genres || []).length
            ? h(doc, "div", { class: "genres" }, ...(d.genres || []).slice(0, 4).map((g) => h(doc, "span", { text: g })))
            : null
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
    const edNoteKids = rxTotal <= 0
      ? ["\u041E\u0436\u0438\u0434\u0430\u044E\u0442\u0441\u044F \u043F\u0435\u0440\u0432\u044B\u0435 \u043E\u0446\u0435\u043D\u043A\u0438 \u0441\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u0430 PANAX."]
      : top1.val >= 35
      ? ["\u041F\u043E\u0447\u0442\u0438 \u043A\u0430\u0436\u0434\u044B\u0439 \u0432\u0442\u043E\u0440\u043E\u0439 \u0438\u0433\u0440\u043E\u043A", h(doc, "br"), "\u043E\u0441\u0442\u0430\u0432\u0438\u043B \u044D\u0442\u0443 \u0440\u0435\u0430\u043A\u0446\u0438\u044E."]
      : ["\u041B\u0438\u0434\u0438\u0440\u0443\u044E\u0449\u0430\u044F \u0440\u0435\u0430\u043A\u0446\u0438\u044F \u0441\u0440\u0435\u0434\u0438", h(doc, "br"), "\u043E\u0446\u0435\u043D\u043E\u043A \u0441\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u0430 PANAX."];
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
        ...rest.map((x) =>
          h(
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
        ...rx.map((x, idx) =>
          h(
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
    const titleKids = words.length >= 2
      ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), h(doc, "br"), h(doc, "i", { text: words.slice(Math.ceil(words.length / 2)).join(" ") })]
      : [words[0] || "\u0418\u0413\u0420\u0410"];
    const devWords = String(d.dev || "PANAX").trim().toUpperCase().split(/\s+/).filter(Boolean);
    const devKids = devWords.length > 1
      ? [devWords.slice(0, -1).join(" "), h(doc, "br"), devWords[devWords.length - 1]]
      : [devWords[0] || "PANAX"];
    const genreTag = String((d.genres && d.genres[0]) || (d.plat && d.plat[0]) || "PANAX").toUpperCase();
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
        ...rx.map((x) =>
          h(
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
        ...rx.map((x) =>
          h(
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
export function renderReview(doc, r) {
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
