export const THEMES = ["tea", "brahmaputra", "muga"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "cs_theme";
export const MODE_COOKIE = "cs_mode";
export const isTheme = (v: unknown): v is Theme => typeof v === "string" && (THEMES as readonly string[]).includes(v);
