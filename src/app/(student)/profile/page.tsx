import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import type { NamedRef } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { MODE_COOKIE } from "@/lib/theme";
import { ProfileForm } from "@/components/profile/profile-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("profile");
  return { title: t("metaTitle") };
}

// S10 — Profile. Departments are publicly readable, so they are loaded here with the RLS client.
export default async function ProfilePage() {
  const { user, profile } = await requireUser();
  const [supabase, store] = await Promise.all([createClient(), cookies()]);
  const dark = store.get(MODE_COOKIE)?.value === "dark";
  const { data } = await supabase.from("departments").select("id, name_en, name_as").order("name_en");
  return <ProfileForm profile={profile} email={user.email ?? null} departments={(data ?? []) as NamedRef[]} initialDark={dark} />;
}
