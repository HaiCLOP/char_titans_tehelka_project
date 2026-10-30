import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { BrandMark } from "@/components/shell/brand-mark";
import { LanguageSwitch } from "@/components/preference-switchers";
import { afterLoginPath, requireUser, roleHome, safeNext } from "@/lib/auth";
import type { NamedRef } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

/**
 * S04 — first-run setup. Outside the (student) shell on purpose: a focused flow with only the brand
 * and the language switch. requireUser() skips its onboarding redirect on /onboarding, so no loop.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const [{ profile }, sp] = await Promise.all([requireUser(), searchParams]);
  const next = typeof sp.next === "string" ? sp.next : null;
  if (profile.onboarded_at) redirect(afterLoginPath(profile, next));

  const supabase = await createClient();
  const [t, depts, hostels] = await Promise.all([
    getTranslations("onboarding"),
    supabase.from("departments").select("id, name_en, name_as").order("name_en"),
    supabase.from("locations").select("id, name_en, name_as").eq("type", "hostel").order("name_en"),
  ]);

  // A safe `next` that is not onboarding itself, else the role home.
  const safe = safeNext(next);
  const destination = safe && !safe.startsWith("/onboarding") ? safe : roleHome(profile.role);

  return (
    // Fixed full-viewport column: the page itself never scrolls; only the step area may, as a last resort.
    <div className="fixed inset-0 flex h-dvh flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border bg-surface px-4 sm:px-8">
        <div className="mx-auto flex h-14 max-w-[60rem] items-center gap-3 sm:h-[4.5rem]">
          <Link href="/" aria-label={t("brandHome")} className="flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BrandMark className="size-10 rounded-xl" />
            <span className="hidden text-[0.9375rem] font-semibold tracking-[-0.01em] sm:inline">CivicSense</span>
          </Link>
          <LanguageSwitch className="ml-auto" />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <OnboardingFlow
          role={profile.role}
          initialName={profile.full_name ?? ""}
          initialHostel={profile.hostel}
          initialCourse={profile.course}
          initialDepartment={profile.department_id}
          departments={(depts.data ?? []) as NamedRef[]}
          hostels={(hostels.data ?? []) as NamedRef[]}
          loadFailed={Boolean(depts.error || hostels.error)}
          destination={destination}
        />
      </main>
    </div>
  );
}
