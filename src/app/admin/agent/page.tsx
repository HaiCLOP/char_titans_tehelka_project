import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AgentChat } from "@/components/agent/agent-chat";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.admin");
  return { title: `${t("agent")} — ${t("title")}` };
}

type Dept = { id: string; name_en: string; name_as: string };

// S16 — Ask CivicSense. dept_admin: always their own department; super_admin: all or one picked in the chat.
export default async function AgentPage() {
  const { profile } = await requireRole("dept_admin", "super_admin");
  const [t, locale, supabase] = await Promise.all([getTranslations("agent"), getLocale(), createClient()]);
  const { data } = await supabase.from("departments").select("id, name_en, name_as").order("name_en");
  const departments = (data ?? []) as Dept[];
  const own = departments.find((d) => d.id === profile.department_id);
  const isSuper = profile.role === "super_admin";

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-5">
        <h1 className="text-display">{t("title")}</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{t("subtitle")}</p>
        {!isSuper && own && (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("scopeLabel")}: <span className="font-medium text-foreground">{t("scopeDept", { department: locale === "as" ? own.name_as : own.name_en })}</span>
          </p>
        )}
      </header>
      <AgentChat role={isSuper ? "super_admin" : "dept_admin"} departments={isSuper ? departments : []} />
    </div>
  );
}
