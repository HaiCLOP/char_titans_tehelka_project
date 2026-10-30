export const LOCALES = ["en", "as"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "cs_locale";
