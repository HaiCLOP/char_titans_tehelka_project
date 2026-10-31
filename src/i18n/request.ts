import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, type Locale } from "./config";
import en from "../../messages/en.json";
import as from "../../messages/as.json";

// ponytail: static in-memory mapping prevents dynamic JSON imports from reading and parsing disk on every request
const MESSAGES: Record<Locale, Record<string, unknown>> = { en, as };

// Language lives in a cookie (no /en /as URL prefix) so switching is instant
// and every route works in both languages.
export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = raw === "as" ? "as" : "en";
  return {
    locale,
    messages: MESSAGES[locale],
  };
});
