import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** Unicode Bengali-Assamese block → treat as Assamese input */
export const isAssameseText = (s: string) => /[ঀ-৿]/.test(s);

/** Assamese uses ৰ/ৱ; Bengali র (U+09B0) or ব-as-wa in output signals a Bengali drift */
export const hasBengaliDrift = (s: string) => /র/.test(s);

const AS_DIGITS = "০১২৩৪৫৬৭৮৯";
export const toLocaleDigits = (n: number | string, locale: string) =>
  locale === "as" ? String(n).replace(/\d/g, (d) => AS_DIGITS[Number(d)]) : String(n);

export const setCookie = (name: string, value: string) => {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
};
