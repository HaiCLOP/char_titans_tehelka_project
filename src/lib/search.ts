/**
 * Search normalisation that works for English and Assamese text.
 * - NFC + lowercase
 * - strips Latin accents only (Assamese vowel signs are combining marks too, so we must not strip all \p{M})
 * - removes zero-width joiners/non-joiners
 * - folds Bengali র (U+09B0) → Assamese ৰ (U+09F0) so a Bengali keyboard still finds Assamese names
 */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .replace(/[‌‍]/g, "")
    .replace(/র/g, "ৰ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** True when every whitespace-separated term of `query` occurs in `text` (normalised). Empty query matches. */
export function matchesQuery(text: string, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const hay = normalizeSearch(text);
  return q.split(" ").every((term) => hay.includes(term));
}
