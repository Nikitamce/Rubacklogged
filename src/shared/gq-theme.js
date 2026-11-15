var THEMES = {
  "panax-dark": { id: "panax-dark", name: "PANAX Mono (чёрно-серый)", short: "PANAX", c1: "#18181b", c2: "#e4e4e7" },
  "steam-slate": { id: "steam-slate", name: "Steam Slate (графит и синий)", short: "Steam", c1: "#171d25", c2: "#66c0f4" },
  "emerald-hud": { id: "emerald-hud", name: "Emerald HUD (изумрудный)", short: "Emerald", c1: "#121916", c2: "#3ddc97" },
  "amber-noir": { id: "amber-noir", name: "Amber Noir (янтарный)", short: "Amber", c1: "#181411", c2: "#f59e0b" },
  gamequill: { id: "gamequill", name: "GameQuill (фиолетовый)", short: "GameQuill", c1: "#11151f", c2: "#7c5cff" }
};
export var DEFAULT_THEME = "panax-dark";
export function normalizeTheme(id) {
  const k = String(id || "").trim();
  return THEMES[k] ? k : DEFAULT_THEME;
}
export function themeList() {
  return Object.values(THEMES);
}
