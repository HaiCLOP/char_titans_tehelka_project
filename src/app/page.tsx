import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, CheckCircle2, Clock, Play, Sparkles, Users, Wrench } from "lucide-react";
import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";
import { createClient } from "@/lib/supabase/server";
import { toLocaleDigits } from "@/lib/utils";

type Stats = { open: number; in_progress: number; resolved: number; contributors: number };

async function getStats(): Promise<Stats> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("dashboard_stats");
    return (data as Stats) ?? { open: 0, in_progress: 0, resolved: 0, contributors: 0 };
  } catch {
    return { open: 0, in_progress: 0, resolved: 0, contributors: 0 };
  }
}

export default async function Home() {
  const [t, locale, stats] = await Promise.all([getTranslations(), getLocale(), getStats()]);
  const cards = [
    { label: t("stats.open"), value: stats.open, icon: Wrench, tone: "text-primary bg-primary-soft" },
    { label: t("stats.progress"), value: stats.in_progress, icon: Clock, tone: "text-[var(--p3)] bg-[color-mix(in_oklab,var(--p3)_14%,transparent)]" },
    { label: t("stats.resolved"), value: stats.resolved, icon: CheckCircle2, tone: "text-[var(--p4)] bg-[color-mix(in_oklab,var(--p4)_14%,transparent)]" },
    { label: t("stats.contributors"), value: stats.contributors, icon: Users, tone: "text-accent bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]" },
  ];

  return (
    <div className="flex">
      <Sidebar active="/" />
      <main className="min-w-0 flex-1 px-4 pb-24 sm:px-8">
        <Header />

        {/* Hero — Aman: replace with a real DU photo at /public/campus-hero.jpg */}
        <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-r from-background via-background/90 to-primary-soft px-6 py-10 sm:px-10 sm:py-14">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{t("hero.eyebrow")}</p>
          <h1 className="mt-3 max-w-xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{t("hero.title")}</h1>
          <p className="mt-4 max-w-md text-muted-foreground">{t("hero.subtitle")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/report" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110">
              {t("hero.cta")} <ArrowRight className="size-4" />
            </Link>
            <button className="inline-flex items-center gap-2 rounded-full bg-surface px-5 py-3 text-sm font-medium shadow-sm">
              <Play className="size-4 text-primary" /> {t("hero.how")}
            </button>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="flex items-center gap-4 rounded-card border border-border bg-surface p-4 shadow-sm">
              <span className={`grid size-11 place-items-center rounded-xl ${c.tone}`}><c.icon className="size-5" /></span>
              <span>
                <span className="block text-2xl font-semibold">{toLocaleDigits(c.value, locale)}</span>
                <span className="block text-sm text-muted-foreground">{c.label}</span>
              </span>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="rounded-card border border-border bg-surface p-5 shadow-sm">
            <h2 className="font-semibold">{t("home.map")}</h2>
            <div className="mt-4 grid aspect-[16/8] place-items-center rounded-xl bg-surface-muted text-sm text-muted-foreground">
              Campus map — Devansh (F17)
            </div>
          </div>
          <div className="rounded-card border border-border bg-surface p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-primary" /> {t("home.insights")}</h2>
            <p className="mt-4 text-sm text-muted-foreground">AI daily brief — Arnav (F18)</p>
          </div>
        </section>
      </main>
    </div>
  );
}
