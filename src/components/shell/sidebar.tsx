import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Bell, BookOpen, Building2, CircleHelp, ClipboardList, Home, Landmark, Map, PlusCircle, Users, ArrowRight } from "lucide-react";

const MAIN = [
  { href: "/", key: "home", icon: Home },
  { href: "/report", key: "report", icon: PlusCircle },
  { href: "/my", key: "myReports", icon: ClipboardList },
  { href: "/map", key: "map", icon: Map },
  { href: "/notifications", key: "notifications", icon: Bell },
  { href: "/community", key: "community", icon: Users },
  { href: "/guidelines", key: "guidelines", icon: BookOpen },
] as const;
const INFO = [
  { href: "/buildings", key: "buildings", icon: Building2 },
  { href: "/departments", key: "departments", icon: Landmark },
  { href: "/help", key: "help", icon: CircleHelp },
] as const;

export async function Sidebar({ active = "/" }: { active?: string }) {
  const t = await getTranslations();
  const item = (i: (typeof MAIN)[number] | (typeof INFO)[number]) => {
    const on = active === i.href;
    return (
      <Link key={i.href} href={i.href}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${on ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"}`}>
        <i.icon className="size-[18px]" aria-hidden />
        {t(`nav.${i.key}`)}
      </Link>
    );
  };
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-border bg-surface/70 px-4 py-6 backdrop-blur lg:flex">
      <Link href="/" className="flex items-center gap-3 px-2">
        <span className="grid size-10 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">C</span>
        <span>
          <span className="block text-lg font-semibold leading-tight">{t("app.name")}</span>
          <span className="block text-xs text-muted-foreground">{t("app.tagline")}</span>
        </span>
      </Link>
      <nav className="flex flex-col gap-1">{MAIN.map(item)}</nav>
      <div>
        <p className="px-3 pb-2 text-xs text-muted-foreground">{t("nav.campusInfo")}</p>
        <nav className="flex flex-col gap-1">{INFO.map(item)}</nav>
      </div>
      <div className="mt-auto rounded-2xl bg-primary-soft p-4 text-sm">
        <p className="text-foreground">{t("home.slogan")}</p>
        <Link href="/report" aria-label={t("nav.report")} className="mt-3 inline-grid size-8 place-items-center rounded-full bg-surface text-primary">
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </aside>
  );
}
