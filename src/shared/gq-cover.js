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
function wrapTitle(t, max = 13) {
  const w = t.split(" ");
  const L = [];
  let c = "";
  w.forEach((x) => {
    if ((c + " " + x).trim().length > max && c) {
      L.push(c.trim());
      c = x;
    } else c = (c + " " + x).trim();
  });
  if (c) L.push(c);
  return L.slice(0, 3);
}
export function paletteFor(seed) {
  let s = 0;
  for (const ch of String(seed)) s = s * 31 + ch.charCodeAt(0) >>> 0;
  return PALETTES[s % PALETTES.length];
}
var xmlEsc = (s) => String(s).replace(/[<>&"']/g, "");
function coverSvg(seed, title, pal) {
  seed = String(seed || title || "gq");
  title = String(title || "GAME").slice(0, 60);
  pal = pal || paletteFor(seed);
  let s = 0;
  for (const ch of seed) s = s * 131 + ch.charCodeAt(0) >>> 0;
  const rnd = () => {
    s = s * 1664525 + 1013904223 >>> 0;
    return s / 4294967296;
  };
  const [a, b, acc] = pal;
  let dots = "";
  for (let i = 0; i < 46; i++) dots += `<circle cx="${(rnd() * 320).toFixed(0)}" cy="${(rnd() * 290).toFixed(0)}" r="${(rnd() * 1.5 + 0.4).toFixed(1)}" fill="#fff" opacity="${(rnd() * 0.55 + 0.15).toFixed(2)}"/>`;
  const cx = (50 + rnd() * 220).toFixed(0), cy = (80 + rnd() * 90).toFixed(0), r = (34 + rnd() * 40).toFixed(0);
  const p1 = `0,480 0,${(300 + rnd() * 50).toFixed(0)} ${(80 + rnd() * 60).toFixed(0)},${(200 + rnd() * 50).toFixed(0)} ${(170 + rnd() * 50).toFixed(0)},${(300 + rnd() * 40).toFixed(0)} 320,${(230 + rnd() * 50).toFixed(0)} 320,480`;
  const p2 = `0,480 0,${(360 + rnd() * 40).toFixed(0)} ${(120 + rnd() * 60).toFixed(0)},${(300 + rnd() * 40).toFixed(0)} ${(230 + rnd() * 50).toFixed(0)},${(380 + rnd() * 30).toFixed(0)} 320,${(320 + rnd() * 40).toFixed(0)} 320,480`;
  const lines = wrapTitle(title.toUpperCase());
  let txt = "";
  lines.forEach((l, i) => {
    txt += `<text x="24" y="${400 + i * 27}" font-family="Arial Black,Arial,sans-serif" font-size="${lines.length > 2 ? 21 : 25}" font-weight="900" fill="#fff" letter-spacing="1">${xmlEsc(l)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 480" width="320" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="s" cx="50%" cy="50%"><stop offset="0" stop-color="${acc}" stop-opacity=".95"/><stop offset="1" stop-color="${acc}" stop-opacity="0"/></radialGradient><linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".82"/></linearGradient></defs><rect width="320" height="480" fill="url(#g)"/>${dots}<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#s)"/><circle cx="${cx}" cy="${cy}" r="${(r / 2.6).toFixed(0)}" fill="#fff" opacity=".22"/><polygon points="${p1}" fill="#000" opacity=".38"/><polygon points="${p2}" fill="#000" opacity=".55"/><rect y="330" width="320" height="150" fill="url(#d)"/><rect x="24" y="352" width="42" height="4" rx="2" fill="${acc}"/>${txt}<text x="24" y="${400 + lines.length * 27 + 4}" font-family="Arial,sans-serif" font-size="11" fill="#fff" opacity=".55" letter-spacing="3">GAMEQUILL \xB7 COVER</text><rect x="0.5" y="0.5" width="319" height="479" fill="none" stroke="#fff" stroke-opacity=".12"/></svg>`;
}
export function coverArt(seed, title, pal) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(coverSvg(seed, title, pal));
}
