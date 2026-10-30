export type Lang = "en" | "as";

/**
 * Picks `<field>_<locale>` from a row with `_en`/`_as` columns, falling back to the other language
 * when the preferred one is empty. Returns "" when both are empty.
 */
export function pickLang<F extends string>(
  row: Partial<Record<`${F}_en` | `${F}_as`, string | null | undefined>>,
  field: F,
  locale: string,
): string {
  const r = row as Record<string, string | null | undefined>;
  const primary = locale === "as" ? r[`${field}_as`] : r[`${field}_en`];
  const other = locale === "as" ? r[`${field}_en`] : r[`${field}_as`];
  return (primary && primary.trim()) || (other && other.trim()) || "";
}

/** Which language `pickLang` actually returned (useful for the `lang` attribute). */
export function pickedLang(en: string | null | undefined, as: string | null | undefined, locale: string): Lang {
  if (locale === "as") return as && as.trim() ? "as" : "en";
  return en && en.trim() ? "en" : "as";
}
