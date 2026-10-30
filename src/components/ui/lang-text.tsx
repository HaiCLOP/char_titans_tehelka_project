import { useLocale } from "next-intl";
import { pickedLang } from "@/lib/lang";

type LangTextProps = {
  /** English value (`*_en` column). */
  en: string | null | undefined;
  /** Assamese value (`*_as` column). */
  as: string | null | undefined;
  /** Rendered when both are empty. */
  fallback?: React.ReactNode;
  className?: string;
  tag?: "span" | "p" | "h1" | "h2" | "h3" | "div";
};

/**
 * Shows the `_as` value in Assamese UI and `_en` otherwise, falling back to the other language when empty.
 * Sets `lang` on the element so Assamese gets the right font/line-height. Use `pickLang()` from
 * `@/lib/lang` when you need the plain string.
 */
export function LangText({ en, as, fallback = null, className, tag: Tag = "span" }: LangTextProps) {
  const locale = useLocale();
  const lang = pickedLang(en, as, locale);
  const text = (lang === "as" ? as : en)?.trim();
  if (!text) return <>{fallback}</>;
  return (
    <Tag lang={lang} className={className}>
      {text}
    </Tag>
  );
}
