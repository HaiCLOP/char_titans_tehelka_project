import type { Metadata } from "next";
import { Geist, Noto_Sans_Bengali } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";
import { PwaManager } from "@/components/pwa/pwa-manager";
import { FONT_SIZE_COOKIE, MODE_COOKIE } from "@/lib/theme";
import "./globals.css";

// Geist carries both the UI and the heavy display headings; Assamese falls through to Noto Sans Bengali.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
// Noto Sans Bengali covers the Assamese letters ৰ (U+09F0) and ৱ (U+09F1)
const notoBengali = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--font-noto-bengali", display: "swap" });

export const metadata: Metadata = {
  title: "CivicSense — Campus Together",
  description: "Bilingual AI campus issue management for Dibrugarh University",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CivicSense",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const store = await cookies();
  const dark = store.get(MODE_COOKIE)?.value === "dark";
  const fontSize = store.get(FONT_SIZE_COOKIE)?.value === "large" ? "large" : "normal";

  return (
    <html lang={locale} data-font-size={fontSize} className={`${geist.variable} ${notoBengali.variable} ${dark ? "dark" : ""}`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
          <PwaManager />
          <Toaster position="top-center" toastOptions={{ className: "!rounded-2xl !border-border !bg-surface !text-foreground !shadow-md" }} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
