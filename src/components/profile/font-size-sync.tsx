"use client";
import { useEffect } from "react";
import { applyFontSize, readFontCookie } from "./font-size";

/**
 * Applies the saved font size (cookie `cs_font`) on every page. Mount once in the root layout:
 * `<FontSizeSync />` inside <body>. (A server-side `data-font` attribute on <html> would avoid the
 * first-paint jump; this keeps the root layout untouched.)
 */
export function FontSizeSync() {
  useEffect(() => {
    applyFontSize(readFontCookie());
  }, []);
  return null;
}
