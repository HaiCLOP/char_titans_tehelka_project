import type { Metadata } from "next";
import { Inter, Noto_Sans_Bengali } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";
import { THEME_COOKIE, MODE_COOKIE, isTheme } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Noto Sans Bengali covers the Assamese letters ৰ (U+09F0) and ৱ (U+09F1)
const notoBengali = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--font-noto-bengali", display: "swap" });

export const metadata: Metadata = {
  title: "CivicSense — Campus Together",
  description: "Bilingual AI campus issue management for Dibrugarh University",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const store = await cookies();
  const themeRaw = store.get(THEME_COOKIE)?.value;
  const theme = isTheme(themeRaw) ? themeRaw : "tea";
  const dark = store.get(MODE_COOKIE)?.value === "dark";

  return (
    <html lang={locale} data-theme={theme} className={`${inter.variable} ${notoBengali.variable} ${dark ? "dark" : ""}`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
          <Toaster richColors position="top-center" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
