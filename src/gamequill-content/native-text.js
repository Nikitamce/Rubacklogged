import { FOOTER_TEXT } from "../shared/gq-fallback.js";

export function nativeText(el) {
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
