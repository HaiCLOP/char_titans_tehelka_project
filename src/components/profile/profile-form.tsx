"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { LogOut, Moon, Save, Type } from "lucide-react";
import type { NamedRef, Profile, ProfileUpdate } from "@/lib/domain";
import { MODE_COOKIE } from "@/lib/theme";
import { pickLang } from "@/lib/lang";
import { cn, setCookie } from "@/lib/utils";
import { Avatar, Button, Card, CardHeader, Input, Select, Switch } from "@/components/ui";
import { signOut } from "@/app/auth/actions";
import { apiFetch, isApiError } from "@/components/api-client";
import { saveFontSize, type FontSize } from "./font-size";

type Props = { profile: Profile; email: string | null; departments: NamedRef[]; initialDark: boolean };

function Segmented<V extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: V;
  options: { value: V; label: React.ReactNode; lang?: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium" id={`seg-${label}`}>
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={`seg-${label}`} className="mt-2 grid grid-cols-2 gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            lang={o.lang}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-full border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === o.value ? "border-foreground bg-surface text-foreground ring-1 ring-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProfileForm({ profile, email, departments, initialDark }: Props) {
  const t = useTranslations("profile");
  const tr = useTranslations("roles");
  const locale = useLocale();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  const [name, setName] = useState(profile.full_name ?? "");
  const [lang, setLang] = useState<"en" | "as">(profile.lang_pref);
  const [hostel, setHostel] = useState(profile.hostel ?? "");
  const [dept, setDept] = useState(profile.department_id ?? "");
  const [course, setCourse] = useState(profile.course ?? "");
  const [font, setFont] = useState<FontSize>(profile.font_size);
  const [dark, setDark] = useState(initialDark);
  const [nameError, setNameError] = useState<string | null>(null);
  const isStudent = profile.role === "student";
  const canPickDept = profile.role === "staff";

  // Keep the font cookie in step with the saved profile (e.g. set on another device).
  useEffect(() => {
    saveFontSize(profile.font_size);
  }, [profile.font_size]);

  const toggleDark = (on: boolean) => {
    setDark(on);
    const apply = () => {
      document.documentElement.classList.toggle("dark", on);
      setCookie(MODE_COOKIE, on ? "dark" : "light");
    };
    const d = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (d.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) d.startViewTransition(apply);
    else apply();
  };

  const patch: ProfileUpdate = {};
  if (name.trim() !== (profile.full_name ?? "")) patch.full_name = name.trim();
  if (lang !== profile.lang_pref) patch.lang_pref = lang;
  if (hostel.trim() !== (profile.hostel ?? "")) patch.hostel = hostel.trim() || null;
  if (canPickDept && dept !== (profile.department_id ?? "")) patch.department_id = dept || null;
  if (isStudent && course.trim() !== (profile.course ?? "")) patch.course = course.trim() || null;
  if (font !== profile.font_size) patch.font_size = font;
  const dirty = Object.keys(patch).length > 0;

  const save = useMutation({
    mutationFn: (body: ProfileUpdate) => apiFetch<Profile>("/api/profile", { method: "PATCH", json: body }),
    onSuccess: (_p, body) => {
      if (body.font_size) saveFontSize(body.font_size);
      toast.success(body.lang_pref ? (body.lang_pref === "as" ? t("savedAs") : t("savedEn")) : t("saved"));
      startRefresh(() => router.refresh());
    },
    onError: (e) => toast.error(isApiError(e, "FORBIDDEN") ? t("deptLocked") : t("saveFailed")),
  });

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (patch.full_name !== undefined && patch.full_name.length === 0) {
      setNameError(t("nameRequired"));
      return;
    }
    if (dirty) save.mutate(patch);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
    <form onSubmit={onSave} className="space-y-5" noValidate>
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card className="flex items-center gap-4">
        <Avatar name={name || email} src={profile.avatar_url} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{name || t("noName")}</p>
          {email && <p className="truncate text-sm text-muted-foreground">{email}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{tr(profile.role)}</p>
        </div>
      </Card>

      <Card className="space-y-4">
        <CardHeader title={t("about")} className="mb-0" />
        <Input
          id="profile-name"
          label={t("name")}
          value={name}
          maxLength={80}
          autoComplete="name"
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
          error={nameError ?? undefined}
        />
        <Input
          id="profile-hostel"
          label={t("hostel")}
          hint={t("hostelHint")}
          value={hostel}
          maxLength={80}
          onChange={(e) => setHostel(e.target.value)}
        />
        {isStudent ? (
          <Input
            id="profile-course"
            label={t("course")}
            hint={t("courseHint")}
            placeholder={t("coursePlaceholder")}
            value={course}
            maxLength={80}
            onChange={(e) => setCourse(e.target.value)}
          />
        ) : canPickDept ? (
          <Select
            id="profile-dept"
            label={t("department")}
            placeholder={t("noDepartment")}
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            options={departments.map((d) => ({ value: d.id, label: pickLang(d, "name", locale) }))}
          />
        ) : (
          <div>
            <p className="text-sm font-medium">{t("department")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {pickLang(departments.find((d) => d.id === profile.department_id) ?? {}, "name", locale) || t("noDepartment")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("deptLocked")}</p>
          </div>
        )}
      </Card>

      <Card className="space-y-5">
        <CardHeader title={t("display")} className="mb-0" />
        <Segmented
          label={t("language")}
          value={lang}
          onChange={setLang}
          options={[
            { value: "en", label: "English", lang: "en" },
            { value: "as", label: "অসমীয়া", lang: "as" },
          ]}
        />
        <Segmented<FontSize>
          label={t("fontSize")}
          value={font}
          onChange={setFont}
          options={[
            { value: "normal", label: <><Type className="size-3.5" aria-hidden />{t("fontNormal")}</> },
            { value: "large", label: <><Type className="size-5" aria-hidden />{t("fontLarge")}</> },
          ]}
        />
        <Switch
          id="profile-dark"
          checked={dark}
          onCheckedChange={toggleDark}
          label={
            <span className="inline-flex items-center gap-1.5">
              <Moon className="size-4 text-muted-foreground" aria-hidden />
              {t("darkMode")}
            </span>
          }
          description={t("darkModeHint")}
        />
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={save.isPending || refreshing} disabled={!dirty}>
          {!(save.isPending || refreshing) && <Save aria-hidden />}
          {dirty ? t("save") : t("noChanges")}
        </Button>
      </div>
    </form>
    <form action={signOut} className="border-t border-border pt-5">
      <Button type="submit" variant="secondary">
        <LogOut aria-hidden />
        {t("signOut")}
      </Button>
    </form>
    </div>
  );
}
