// Pure monochrome: light/dark is the only theme choice (the PRD's colour themes were dropped by design).
// THEMES stays only so stored profile values and the profile API keep validating.
export const THEMES = ["tea", "brahmaputra", "muga"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "cs_theme";
export const MODE_COOKIE = "cs_mode";
export const FONT_SIZE_COOKIE = "cs_font";
export const isTheme = (v: unknown): v is Theme => typeof v === "string" && (THEMES as readonly string[]).includes(v);
