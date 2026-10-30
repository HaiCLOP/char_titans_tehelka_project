import { setCookie } from "@/lib/utils";

/** Cookie mirroring `profiles.font_size` so every page can apply it before data loads. */
export const FONT_COOKIE = "cs_font";
export type FontSize = "normal" | "large";

/** Applies the font size to <html> (rem-based UI scales with it). Browser only. */
export function applyFontSize(size: FontSize) {
  document.documentElement.style.fontSize = size === "large" ? "112.5%" : "";
  document.documentElement.dataset.font = size;
}

export function saveFontSize(size: FontSize) {
  setCookie(FONT_COOKIE, size);
  applyFontSize(size);
}

export function readFontCookie(): FontSize {
  return /(?:^|;\s*)cs_font=large(?:;|$)/.test(document.cookie) ? "large" : "normal";
}
