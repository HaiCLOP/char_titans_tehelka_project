"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { apiFetch } from "@/components/api-client";
import { Button, Card, Input, Select } from "@/components/ui";
import type { NamedRef, ProfileUpdate, Role } from "@/lib/domain";
import { cn, toLocaleDigits } from "@/lib/utils";

type Props = {
  role: Role;
  initialName: string;
  initialHostel: string | null;
  initialCourse: string | null;
  initialDepartment: string | null;
  departments: NamedRef[];
  hostels: NamedRef[];
  loadFailed: boolean;
  /** Safe path to open when setup is finished. */
  destination: string;
};

type Step = 0 | 1 | 2;
type Kind = "student" | "staff";

const ICON = { strokeWidth: 1.75, "aria-hidden": true } as const;
// Short laptop screens (≤780px tall) get a smaller headline so every step fits without scrolling.
const HEADING = "text-display text-[1.75rem] sm:text-[clamp(2rem,4vw,3.25rem)] sm:[@media(max-height:780px)]:text-[2.25rem]";
const LEAD = "mt-2 max-w-xl text-[0.9375rem] leading-relaxed text-muted-foreground sm:mt-3 sm:text-[1.0625rem]";

/**
 * Renders three flex children for the page's full-height column: progress row, step content
 * (flex-1, centred) and a footer action bar that is always on screen.
 */
export function OnboardingFlow(p: Props) {
  const t = useTranslations("onboarding");
  const locale = useLocale() as "en" | "as";
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  // Department membership of field staff and admins is set by a super admin, not here.
  const managed = p.role !== "student" && p.role !== "staff";
  // Which fields apply comes from the real role (set by an admin, never chosen here): students give
  // hostel + course, staff give their department. PATCH /api/profile enforces the same split.
  const kind: Kind = p.role === "staff" ? "staff" : "student";
  const [name, setName] = useState(p.initialName);
  const [hostel, setHostel] = useState(p.initialHostel ?? "");
  const [course, setCourse] = useState(p.initialCourse ?? "");
  const [department, setDepartment] = useState(p.initialDepartment ?? "");
  const [nameError, setNameError] = useState<string | null>(null);

  const pick = (r: NamedRef) => (locale === "as" ? r.name_as : r.name_en);
  const n = (v: number) => toLocaleDigits(v, locale);

  const save = async (body: ProfileUpdate) => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/profile", { method: "PATCH", json: body });
      return true;
    } catch {
      setError(t("saveError"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const chooseLanguage = async (l: "en" | "as") => {
    // The API also sets the cs_locale cookie; refresh so the rest of the flow renders in that language.
    if (await save({ lang_pref: l })) {
      startRefresh(() => router.refresh());
      setStep(1);
    }
  };

  const saveAbout = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("nameRequired"));
      return;
    }
    setNameError(null);
    const body: ProfileUpdate = { full_name: trimmed };
    if (!managed) {
      // Students never pick a department (departments are the fixing side); they give hostel + course.
      if (kind === "student") Object.assign(body, { hostel: hostel || null, course: course.trim() || null });
      else Object.assign(body, { department_id: department || null });
    }
    if (await save(body)) setStep(2);
  };

  const finish = async () => {
    if (await save({ onboarded: true })) {
      router.replace(p.destination);
      router.refresh();
    }
  };

  const hostelOptions = [
    { value: "", label: t("hostelNone") },
    ...p.hostels.map((h) => ({ value: h.name_en, label: pick(h) })),
    ...(p.initialHostel && !p.hostels.some((h) => h.name_en === p.initialHostel) ? [{ value: p.initialHostel, label: p.initialHostel }] : []),
  ];
  const deptName = p.departments.find((d) => d.id === department);
  const hostelName = hostelOptions.find((o) => o.value === hostel && o.value)?.label;
  const steps = [t("stepLanguage"), t("stepAbout"), t("stepDone")];

  return (
    <>
      {/* One centred column: progress, step, actions. The action row is sticky, so on very short screens it pins
          to the bottom edge instead of scrolling away; when everything fits it simply sits under the card. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[42rem] flex-col justify-center px-4 pt-4 sm:px-6 sm:pt-8">
          <ol aria-label={t("progress", { step: n(step + 1), total: n(3) })} className="mb-6 grid grid-cols-3 gap-2.5 sm:mb-8">
            {steps.map((label, i) => (
              <li key={label} aria-current={i === step ? "step" : undefined}>
                <span className={cn("block h-1.5 rounded-full transition-colors duration-500 ease-out-expo", i <= step ? "bg-primary" : "bg-border")} aria-hidden />
                <span className={cn("mt-2.5 block truncate text-[13px]", i === step ? "font-medium text-foreground" : "text-muted-foreground")}>
                  <span className="sr-only">{t("progress", { step: n(i + 1), total: n(3) })}: </span>
                  {label}
                </span>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <section aria-labelledby="ob-lang">
              <h1 id="ob-lang" className={HEADING}>{t("langTitle")}</h1>
              <p className={LEAD}>{t("langBody")}</p>
              <div className="mt-5 grid gap-3 sm:mt-6 sm:grid-cols-2">
                {(["as", "en"] as const).map((l) => {
                  const on = locale === l;
                  return (
                    <button
                      key={l}
                      type="button"
                      lang={l}
                      disabled={saving}
                      aria-pressed={on}
                      onClick={() => chooseLanguage(l)}
                      className={cn(
                        "group flex min-h-24 flex-col justify-between rounded-card border bg-surface p-5 text-left shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:min-h-32 sm:p-6",
                        on ? "border-foreground" : "border-border hover:border-border-strong",
                      )}
                    >
                      <span className="text-[1.5rem] leading-tight font-bold tracking-[-0.02em] sm:text-[1.75rem]">{l === "as" ? "অসমীয়া" : "English"}</span>
                      <span className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                        <span lang={locale}>{l === "as" ? t("langCardAs") : t("langCardEn")}</span>
                        {on ? (
                          <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-4" {...ICON} />
                          </span>
                        ) : (
                          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" {...ICON} />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {step === 1 && (
            <section aria-labelledby="ob-about" aria-busy={refreshing || undefined}>
              <h1 id="ob-about" className={HEADING}>{t("aboutTitle")}</h1>
              <p className={LEAD}>{t("aboutBody")}</p>

              <Card className="mt-5 space-y-4 p-5 sm:mt-6 sm:space-y-5 sm:p-6">
                <Input
                  label={t("nameLabel")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  autoComplete="name"
                  required
                  error={nameError ?? undefined}
                />

                {managed ? (
                  <p className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-muted-foreground">{t("managedNote")}</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                    {kind === "student" ? (
                      <Select fieldClassName="min-w-0" label={t("hostelLabel")} value={hostel} onChange={(e) => setHostel(e.target.value)} options={hostelOptions} />
                    ) : (
                      <Select
                        label={t("departmentLabel")}
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        fieldClassName="sm:col-span-2"
                        placeholder={t("departmentNone")}
                        options={p.departments.map((d) => ({ value: d.id, label: pick(d) }))}
                      />
                    )}
                    {kind === "student" && (
                      <Input
                        label={t("courseLabel")}
                        hint={t("courseHint")}
                        placeholder={t("coursePlaceholder")}
                        value={course}
                        onChange={(e) => setCourse(e.target.value)}
                        maxLength={80}
                      />
                    )}
                    <p className="hidden text-xs leading-relaxed text-muted-foreground sm:col-span-2 sm:block">
                      {p.loadFailed ? t("listError") : t("kindHint")}
                    </p>
                  </div>
                )}
              </Card>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="ob-done">
              <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-5" {...ICON} />
              </span>
              <h1 id="ob-done" className={cn(HEADING, "mt-4")}>{t("doneTitle", { name: name.trim().split(/\s+/)[0] ?? "" })}</h1>
              <p className={LEAD}>{t("doneBody")}</p>
              <Card className="mt-5 p-5 sm:mt-6 sm:p-6">
                <dl className="divide-y divide-border text-sm">
                  <div className="flex justify-between gap-4 pb-3">
                    <dt className="text-muted-foreground">{t("summaryLanguage")}</dt>
                    <dd className="font-medium">{locale === "as" ? "অসমীয়া" : "English"}</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-muted-foreground">{t("nameLabel")}</dt>
                    <dd className="truncate font-medium">{name.trim()}</dd>
                  </div>
                  {!managed && kind === "student" && course.trim() && (
                    <div className="flex justify-between gap-4 py-3">
                      <dt className="text-muted-foreground">{t("courseLabel")}</dt>
                      <dd className="truncate text-right font-medium">{course.trim()}</dd>
                    </div>
                  )}
                  {!managed && (
                    <div className="flex justify-between gap-4 pt-3">
                      <dt className="text-muted-foreground">{kind === "student" ? t("hostelLabel") : t("departmentLabel")}</dt>
                      <dd className="truncate text-right font-medium">
                        {kind === "student" ? (hostelName ?? t("hostelNone")) : deptName ? pick(deptName) : t("departmentNone")}
                      </dd>
                    </div>
                  )}
                </dl>
              </Card>
              <p className="mt-3 text-xs text-muted-foreground">{t("changeLater")}</p>
            </section>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-2xl border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="sticky bottom-0 -mx-4 mt-4 flex items-center gap-3 bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:mt-6 sm:px-6 sm:pb-8">
            {step > 0 && (
              <Button
                variant="ghost"
                size="lg"
                className="-ml-3"
                disabled={saving}
                onClick={() => {
                  setError(null);
                  setStep((s) => (s - 1) as Step);
                }}
              >
                <ArrowLeft {...ICON} />
                {t("back")}
              </Button>
            )}
            <Button size="lg" className="ml-auto" loading={saving} onClick={step === 0 ? () => chooseLanguage(locale) : step === 1 ? saveAbout : finish}>
              {step === 2 ? t("finish") : t("continue")}
              {!saving && <ArrowRight {...ICON} />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
