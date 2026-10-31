"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Building2, Pencil, Plus, ShieldCheck, Trash2, UserPlus, Users, Workflow } from "lucide-react";
import {
  ASSIGN_MODES, CATEGORIES, DEFAULT_SLA_HOURS, DEPT_ADMIN_MEMBER_ROLES, MEMBER_ROLES,
  type AdminSettings, type StaffExperience, type Category, type Department, type Member, type MemberRole, type NamedRef, type SlaHours,
} from "@/lib/domain";
import { cn, toLocaleDigits } from "@/lib/utils";
import {
  Button, Card, CardHeader, Chip, Dialog, EmptyState, ErrorState, Input, LangText, ListSkeleton, Select, Switch,
} from "@/components/ui";
import { apiFetch, isApiError } from "@/components/api-client";

const PRIORITIES = ["1", "2", "3", "4"] as const;

/** Toggle chips for a multi-select (categories, buildings). */
function ChipPicker<T extends string>({
  label, options, value, onChange, disabled,
}: { label: string; options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
              className={cn(
                "inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                on ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-surface text-foreground hover:bg-surface-muted",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function useSlaText() {
  const t = useTranslations("departments");
  const locale = useLocale();
  return (h: number) =>
    h >= 48 && h % 24 === 0 ? t("days", { n: toLocaleDigits(h / 24, locale) }) : t("hours", { n: toLocaleDigits(h, locale) });
}

// ---------------------------------------------------------------------------------------------------
// Department dialog
// ---------------------------------------------------------------------------------------------------

type DeptForm = { name_en: string; name_as: string; categories: Category[]; sla: Record<(typeof PRIORITIES)[number], string> };

const toForm = (d?: Department): DeptForm => ({
  name_en: d?.name_en ?? "",
  name_as: d?.name_as ?? "",
  categories: d?.categories ?? [],
  sla: Object.fromEntries(PRIORITIES.map((p) => [p, String((d?.sla_hours ?? DEFAULT_SLA_HOURS)[p])])) as DeptForm["sla"],
});

function DepartmentDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Department | null }) {
  const t = useTranslations("departments");
  const tc = useTranslations("category");
  const tp = useTranslations("priority");
  const qc = useQueryClient();
  const [form, setForm] = useState<DeptForm>(() => toForm(editing ?? undefined));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: { name_en: string; name_as: string; categories: Category[]; sla_hours: SlaHours }) =>
      editing
        ? apiFetch<Department>(`/api/admin/departments/${editing.id}`, { method: "PATCH", json: body })
        : apiFetch<Department>("/api/admin/departments", { method: "POST", json: body }),
    onSuccess: () => {
      toast.success(editing ? t("toast.saved") : t("toast.created"));
      void qc.invalidateQueries({ queryKey: ["departments"] });
      onOpenChange(false);
    },
    onError: (e) => setError(isApiError(e, "VALIDATION_ERROR") ? t("errors.invalid") : t("errors.generic")),
  });

  const submit = () => {
    setError(null);
    const hours = PRIORITIES.map((p) => Number(form.sla[p]));
    if (form.name_en.trim().length < 2 || form.name_as.trim().length < 2) return setError(t("errors.names"));
    if (form.name_as.includes("র")) return setError(t("errors.bengaliRa"));
    if (hours.some((h) => !Number.isInteger(h) || h < 1 || h > 2160)) return setError(t("errors.sla"));
    save.mutate({
      name_en: form.name_en.trim(),
      name_as: form.name_as.trim(),
      categories: form.categories,
      sla_hours: { "1": hours[0], "2": hours[1], "3": hours[2], "4": hours[3] },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? t("dialog.editTitle") : t("dialog.newTitle")}
      description={t("dialog.body")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("dialog.cancel")}</Button>
          <Button loading={save.isPending} onClick={submit}>{editing ? t("dialog.save") : t("dialog.create")}</Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="dept-name-en" label={t("dialog.nameEn")} value={form.name_en} maxLength={80} lang="en" onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
          <Input id="dept-name-as" label={t("dialog.nameAs")} value={form.name_as} maxLength={80} lang="as" onChange={(e) => setForm({ ...form, name_as: e.target.value })} />
        </div>
        <ChipPicker<Category>
          label={t("dialog.categories")}
          options={CATEGORIES.map((c) => ({ value: c, label: tc(c) }))}
          value={form.categories}
          onChange={(categories) => setForm({ ...form, categories })}
        />
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("dialog.sla")}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PRIORITIES.map((p) => (
              <Input
                key={p}
                id={`dept-sla-${p}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={2160}
                label={`P${p} · ${tp(p)}`}
                value={form.sla[p]}
                className="tabular"
                onChange={(e) => setForm({ ...form, sla: { ...form.sla, [p]: e.target.value } })}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("dialog.slaHint")}</p>
        </fieldset>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="sr-only" tabIndex={-1}>{t("dialog.save")}</button>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------------
// Member dialog (add by email / edit)
// ---------------------------------------------------------------------------------------------------

type MemberForm = { email: string; role: MemberRole; department_id: string; skills: Category[]; coverage: string[]; active: boolean };

function MemberDialog({
  open, onOpenChange, department, departments, locations, editing, initialRole = "field_staff", limited = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  department: Department | null;
  departments: Department[];
  locations: NamedRef[];
  editing: Member | null;
  initialRole?: MemberRole;
  /** Department admins: limited roles, their own department only. */
  limited?: boolean;
}) {
  const t = useTranslations("members");
  const tr = useTranslations("roles");
  const tc = useTranslations("category");
  const locale = useLocale();
  const qc = useQueryClient();
  const [form, setForm] = useState<MemberForm>(() => ({
    email: editing?.email ?? "",
    role: editing && (MEMBER_ROLES as readonly string[]).includes(editing.role) ? (editing.role as MemberRole) : initialRole,
    department_id: editing?.department_id ?? department?.id ?? departments[0]?.id ?? "",
    skills: editing?.skills ?? [],
    coverage: editing?.coverage_location_ids ?? [],
    active: editing?.active ?? true,
  }));
  const [error, setError] = useState<string | null>(null);
  const isField = form.role === "field_staff";
  const needsDept = form.role === "field_staff" || form.role === "dept_admin" || form.role === "staff";

  const save = useMutation({
    mutationFn: () => {
      const dept = form.role === "student" || form.role === "super_admin" ? null : form.department_id || null;
      const common = {
        role: form.role,
        department_id: dept,
        ...(isField ? { skills: form.skills, coverage_location_ids: form.coverage } : {}),
      };
      return editing
        ? apiFetch<Member>(`/api/admin/members/${editing.id}`, { method: "PATCH", json: { ...common, active: form.active } })
        : apiFetch<Member>("/api/admin/members", { method: "POST", json: { email: form.email.trim(), ...common } });
    },
    onSuccess: (m) => {
      toast.success(editing ? t("toast.saved") : m.invited ? t("toast.invited", { email: form.email.trim() }) : t("toast.added"));
      void qc.invalidateQueries({ queryKey: ["members"] });
      void qc.invalidateQueries({ queryKey: ["departments"] });
      onOpenChange(false);
    },
    onError: (e) =>
      setError(
        isApiError(e, "NOT_FOUND") ? t("errors.notFound")
        : isApiError(e, "CONFLICT") ? (editing?.role === "super_admin" ? t("errors.lastSuper") : t("errors.openJobs"))
        : isApiError(e, "RATE_LIMITED") ? t("errors.inviteLimit")
        : isApiError(e, "FORBIDDEN") ? t("errors.forbidden")
        : isApiError(e, "VALIDATION_ERROR") ? t("errors.invalid")
        : t("errors.generic"),
      ),
  });

  const submit = () => {
    setError(null);
    if (!editing && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError(t("errors.email"));
    if ((form.role === "field_staff" || form.role === "dept_admin") && !form.department_id) return setError(t("errors.department"));
    save.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? t("dialog.editTitle", { name: editing.name || editing.email || t("noName") }) : t("dialog.addTitle")}
      description={editing ? undefined : t("dialog.addBody")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("dialog.cancel")}</Button>
          <Button loading={save.isPending} onClick={submit}>{editing ? t("dialog.save") : t("dialog.add")}</Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!editing && (
          <Input id="member-email" type="email" autoComplete="off" label={t("dialog.email")} hint={t("dialog.emailHint")} value={form.email} maxLength={254} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            id="member-role"
            label={t("dialog.role")}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as MemberRole })}
            options={(limited ? DEPT_ADMIN_MEMBER_ROLES : MEMBER_ROLES).map((r) => ({ value: r, label: tr(r) }))}
          />
          {needsDept && !limited && (
            <Select
              id="member-dept"
              label={t("dialog.department")}
              value={form.department_id}
              placeholder={form.role === "staff" ? t("dialog.noDepartment") : undefined}
              onChange={(e) => setForm({ ...form, department_id: e.target.value })}
              options={departments.map((d) => ({ value: d.id, label: locale === "as" ? d.name_as : d.name_en }))}
            />
          )}
        </div>
        {isField && (
          <>
            <ChipPicker<Category>
              label={t("dialog.skills")}
              options={CATEGORIES.map((c) => ({ value: c, label: tc(c) }))}
              value={form.skills}
              onChange={(skills) => setForm({ ...form, skills })}
            />
            <div>
              <ChipPicker<string>
                label={t("dialog.coverage")}
                options={locations.map((l) => ({ value: l.id, label: locale === "as" ? l.name_as : l.name_en }))}
                value={form.coverage}
                onChange={(coverage) => setForm({ ...form, coverage })}
              />
              <p className="mt-2 text-xs text-muted-foreground">{t("dialog.coverageHint")}</p>
            </div>
          </>
        )}
        {editing && (
          <Switch id="member-active" checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} label={t("active")} description={t("activeHint")} />
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" className="sr-only" tabIndex={-1}>{t("dialog.save")}</button>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------------
// Members panel
// ---------------------------------------------------------------------------------------------------

/** Hidden experience: level name and the work behind it (super admins, the dept's admins and the person only). */
export function ExperienceLine({ exp }: { exp: StaffExperience }) {
  const t = useTranslations("members.experience");
  const locale = useLocale();
  const n = (v: number) => toLocaleDigits(v, locale);
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular">
      <Chip tone={exp.level >= 3 ? "primary" : "neutral"}>{t(`level.${exp.level}`)}</Chip>
      <span>{t("jobs", { count: exp.jobs_done, n: n(exp.jobs_done) })}</span>
      <span>{t("points", { n: n(exp.points) })}</span>
      {exp.avg_rating != null && <span>{t("rating", { n: toLocaleDigits(Math.round(exp.avg_rating * 10) / 10, locale) })}</span>}
      {exp.on_time_pct != null && <span>{t("onTime", { n: n(exp.on_time_pct) })}</span>}
    </p>
  );
}

export function MembersPanel({ department, departments, locations, limited = false }: { department: Department; departments: Department[]; locations: NamedRef[]; limited?: boolean }) {
  const t = useTranslations("members");
  const tr = useTranslations("roles");
  const tc = useTranslations("category");
  const locale = useLocale();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; editing: Member | null; key: number }>({ open: false, editing: null, key: 0 });
  const key = ["members", department.id] as const;
  const members = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<Member[]>(`/api/admin/members?department=${department.id}`, { signal }),
  });
  const toggle = useMutation({
    mutationFn: (m: Member) => apiFetch<Member>(`/api/admin/members/${m.id}`, { method: "PATCH", json: { active: !m.active } }),
    onSuccess: (m) => {
      toast.success(m.active ? t("toast.activated") : t("toast.deactivated"));
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: () => toast.error(t("errors.generic")),
  });
  const locName = new Map(locations.map((l) => [l.id, locale === "as" ? l.name_as : l.name_en]));
  const n = (v: number) => toLocaleDigits(v, locale);
  const open = (editing: Member | null) => setDialog((d) => ({ open: true, editing, key: d.key + 1 }));

  return (
    <Card>
      <CardHeader
        icon={<Users className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />}
        title={t("title", { department: locale === "as" ? department.name_as : department.name_en })}
        description={t("body")}
        action={
          <Button size="sm" onClick={() => open(null)}>
            <UserPlus aria-hidden />
            {t("add")}
          </Button>
        }
        className="mb-4"
      />
      {members.isPending ? (
        <ListSkeleton rows={3} />
      ) : members.isError ? (
        <ErrorState bare className="py-6" onRetry={() => void members.refetch()} retrying={members.isFetching} />
      ) : members.data.length === 0 ? (
        <EmptyState bare icon={Users} title={t("emptyTitle")} body={t("emptyBody")} action={<Button size="sm" variant="secondary" onClick={() => open(null)}>{t("add")}</Button>} />
      ) : (
        <ul className="divide-y divide-border">
          {members.data.map((m) => (
            <li key={m.id} className={cn("py-3.5", !m.active && "opacity-60")}>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{m.name || t("noName")}</span>
                    <Chip tone={m.role === "dept_admin" ? "primary" : "neutral"}>{tr(m.role)}</Chip>
                    {!m.active && <Chip tone="muted">{t("inactive")}</Chip>}
                  </p>
                  {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                  {m.experience && <ExperienceLine exp={m.experience} />}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="mr-2 text-xs text-muted-foreground tabular">{t("openJobs", { count: m.open_jobs, n: n(m.open_jobs) })}</span>
                  {m.role !== "super_admin" && (!limited || m.role !== "dept_admin") && (
                    <>
                      <Button size="sm" variant="ghost" loading={toggle.isPending && toggle.variables?.id === m.id} onClick={() => toggle.mutate(m)}>
                        {m.active ? t("deactivate") : t("activate")}
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => open(m)} aria-label={t("editAria", { name: m.name || t("noName") })}>
                        <Pencil strokeWidth={1.75} aria-hidden />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {m.role === "field_staff" && (
                <dl className="mt-2 grid gap-1.5 text-xs sm:grid-cols-[6rem_1fr]">
                  <dt className="text-muted-foreground">{t("skills")}</dt>
                  <dd className="flex flex-wrap gap-1">
                    {m.skills.length ? m.skills.map((s) => <Chip key={s} tone="accent">{tc(s)}</Chip>) : <span className="text-muted-foreground">{t("anySkill")}</span>}
                  </dd>
                  <dt className="text-muted-foreground">{t("coverage")}</dt>
                  <dd className="min-w-0">
                    {m.coverage_location_ids.length
                      ? m.coverage_location_ids.map((id) => locName.get(id) ?? "—").join(" · ")
                      : <span className="text-muted-foreground">{t("allBuildings")}</span>}
                  </dd>
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
      {dialog.open && (
        <MemberDialog
          key={dialog.key}
          open={dialog.open}
          onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
          department={department}
          departments={departments}
          locations={locations}
          editing={dialog.editing}
          limited={limited}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------
// Super admins (no department: they see and manage everything)
// ---------------------------------------------------------------------------------------------------

function SuperAdminsPanel({ departments, locations }: { departments: Department[]; locations: NamedRef[] }) {
  const t = useTranslations("members");
  const [dialog, setDialog] = useState<{ open: boolean; editing: Member | null; key: number }>({ open: false, editing: null, key: 0 });
  const members = useQuery({
    queryKey: ["members", "all"],
    queryFn: ({ signal }) => apiFetch<Member[]>("/api/admin/members", { signal }),
  });
  const supers = (members.data ?? []).filter((m) => m.role === "super_admin");
  const open = (editing: Member | null) => setDialog((d) => ({ open: true, editing, key: d.key + 1 }));

  return (
    <Card className="mt-5">
      <CardHeader
        icon={<ShieldCheck className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />}
        title={t("supers.title")}
        description={t("supers.body")}
        action={
          <Button size="sm" onClick={() => open(null)}>
            <UserPlus aria-hidden />
            {t("supers.add")}
          </Button>
        }
        className="mb-4"
      />
      {members.isPending ? (
        <ListSkeleton rows={2} />
      ) : members.isError ? (
        <ErrorState bare className="py-6" onRetry={() => void members.refetch()} retrying={members.isFetching} />
      ) : (
        <ul className="divide-y divide-border">
          {supers.map((m) => (
            <li key={m.id} className={cn("flex items-center gap-3 py-3", !m.active && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.name || t("noName")}</p>
                {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
              </div>
              <Button size="icon-sm" variant="ghost" onClick={() => open(m)} aria-label={t("editAria", { name: m.name || m.email || t("noName") })}>
                <Pencil strokeWidth={1.75} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {dialog.open && (
        <MemberDialog
          key={dialog.key}
          open={dialog.open}
          onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
          department={null}
          departments={departments}
          locations={locations}
          editing={dialog.editing}
          initialRole="super_admin"
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------

/** S18 — departments (bilingual names, categories, SLA) and their members (super admin). */
/** Super admin: how safe tickets get assigned (off / approval / automatic) and emergency auto-assignment. */
function AssignmentWorkflow() {
  const t = useTranslations("departments.workflow");
  const te = useTranslations("departments.emergency");
  const locale = useLocale();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-settings"],
    queryFn: ({ signal }) => apiFetch<AdminSettings>("/api/admin/settings", { signal }),
  });
  const save = useMutation({
    mutationFn: (body: Partial<AdminSettings>) => apiFetch<AdminSettings>("/api/admin/settings", { method: "PATCH", json: body }),
    onSuccess: (r) => {
      qc.setQueryData(["admin-settings"], r);
      toast.success(t("saved"));
    },
    onError: () => toast.error(te("error")),
  });
  const cur = q.data ? { ...q.data, ...(save.isPending ? save.variables : {}) } : null;
  const busy = q.isPending || save.isPending;

  return (
    <Card className="mt-6">
      <CardHeader
        icon={<Workflow className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />}
        title={t("title")}
        description={t("body")}
        className="mb-4"
      />
      {q.isError ? (
        <ErrorState bare className="py-2" title={te("loadError")} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium" id="assign-mode-label">{t("modeLabel")}</p>
            <div role="radiogroup" aria-labelledby="assign-mode-label" className="mt-2 inline-flex flex-wrap rounded-full bg-surface-sunken/70 p-1">
              {ASSIGN_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={cur?.assign_mode === m}
                  disabled={busy}
                  onClick={() => save.mutate({ assign_mode: m })}
                  className={cn(
                    "h-10 rounded-full px-4 text-sm font-medium transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                    cur?.assign_mode === m ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`mode.${m}`)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{cur ? t(`modeHint.${cur.assign_mode}`) : ""}</p>
          </div>
          <div className="border-t border-border pt-5">
            <Switch
              id="emergency-auto-assign"
              checked={Boolean(cur?.auto_assign_emergency)}
              onCheckedChange={(v) => save.mutate({ auto_assign_emergency: v })}
              disabled={busy}
              label={te("label")}
              description={te("description")}
            />
            {cur?.auto_assign_emergency && (
              <div className="mt-4 max-w-xs">
                <Select
                  id="emergency-team"
                  label={t("teamSize")}
                  hint={t("teamSizeHint")}
                  value={String(cur.emergency_team_size)}
                  disabled={busy}
                  onChange={(e) => save.mutate({ emergency_team_size: Number(e.target.value) })}
                  options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: t("people", { count: n, n: toLocaleDigits(n, locale) }) }))}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export function DepartmentsView({ locations }: { locations: NamedRef[] }) {
  const t = useTranslations("departments");
  const tc = useTranslations("category");
  const locale = useLocale();
  const qc = useQueryClient();
  const sla = useSlaText();
  const [selected, setSelected] = useState<string | null>(null);
  const [deptDialog, setDeptDialog] = useState<{ open: boolean; editing: Department | null; key: number }>({ open: false, editing: null, key: 0 });
  const [confirmDelete, setConfirmDelete] = useState<Department | null>(null);

  const depts = useQuery({
    queryKey: ["departments"],
    queryFn: ({ signal }) => apiFetch<Department[]>("/api/admin/departments", { signal }),
  });
  const remove = useMutation({
    mutationFn: (d: Department) => apiFetch<{ id: string }>(`/api/admin/departments/${d.id}`, { method: "DELETE" }),
    onSuccess: (_r, d) => {
      toast.success(t("toast.deleted"));
      if (selected === d.id) setSelected(null);
      setConfirmDelete(null);
      void qc.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e) => {
      toast.error(isApiError(e, "CONFLICT") ? t("errors.inUse") : t("errors.generic"));
      setConfirmDelete(null);
    },
  });

  const list = depts.data ?? [];
  const current = list.find((d) => d.id === selected) ?? list[0] ?? null;
  const n = (v: number) => toLocaleDigits(v, locale);
  const openDept = (editing: Department | null) => setDeptDialog((d) => ({ open: true, editing, key: d.key + 1 }));

  return (
    <div className="mx-auto max-w-[84rem]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display text-[2.25rem] sm:text-[2.75rem]">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={() => openDept(null)}>
          <Plus aria-hidden />
          {t("new")}
        </Button>
      </header>

      <AssignmentWorkflow />

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
        <section aria-label={t("listLabel")} className="min-w-0">
          {depts.isPending ? (
            <Card><ListSkeleton rows={4} /></Card>
          ) : depts.isError ? (
            <ErrorState onRetry={() => void depts.refetch()} retrying={depts.isFetching} />
          ) : list.length === 0 ? (
            <EmptyState icon={Building2} title={t("emptyTitle")} body={t("emptyBody")} action={<Button onClick={() => openDept(null)}>{t("new")}</Button>} />
          ) : (
            <ul className="space-y-3">
              {list.map((d) => {
                const active = current?.id === d.id;
                return (
                  <li key={d.id}>
                    <div
                      className={cn(
                        "rounded-card border bg-surface p-4 shadow-sm transition-[border-color,box-shadow]",
                        active ? "border-foreground/40 ring-1 ring-foreground/10" : "border-border",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => setSelected(d.id)}
                          aria-pressed={active}
                          className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <LangText tag="p" en={d.name_en} as={d.name_as} className="text-title truncate text-base" />
                          <p className="truncate text-sm text-muted-foreground" lang={locale === "as" ? "en" : "as"}>
                            {locale === "as" ? d.name_en : d.name_as}
                          </p>
                        </button>
                        <div className="flex shrink-0 gap-1">
                          <Button size="icon-sm" variant="ghost" onClick={() => openDept(d)} aria-label={t("editAria", { name: locale === "as" ? d.name_as : d.name_en })}>
                            <Pencil strokeWidth={1.75} aria-hidden />
                          </Button>
                          <Button size="icon-sm" variant="ghost" onClick={() => setConfirmDelete(d)} aria-label={t("deleteAria", { name: locale === "as" ? d.name_as : d.name_en })}>
                            <Trash2 strokeWidth={1.75} aria-hidden />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {d.categories.length ? (
                          d.categories.map((c) => <Chip key={c} tone="accent">{tc(c)}</Chip>)
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("noCategories")}</span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                        <span className="tabular">
                          {(["1", "2", "3", "4"] as const).map((p) => `P${n(Number(p))} ${sla(d.sla_hours[p])}`).join(" · ")}
                        </span>
                        <span className="tabular">
                          {t("counts", { members: d.member_count, m: n(d.member_count), open: d.open_count, o: n(d.open_count) })}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label={t("membersLabel")} className="min-w-0 lg:sticky lg:top-4">
          {current ? (
            <MembersPanel key={current.id} department={current} departments={list} locations={locations} />
          ) : depts.isPending ? (
            <Card><ListSkeleton rows={3} /></Card>
          ) : null}
          <SuperAdminsPanel departments={list} locations={locations} />
        </section>
      </div>

      {deptDialog.open && (
        <DepartmentDialog
          key={deptDialog.key}
          open={deptDialog.open}
          onOpenChange={(o) => setDeptDialog((d) => ({ ...d, open: o }))}
          editing={deptDialog.editing}
        />
      )}

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={t("delete.title")}
        description={t("delete.body")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>{t("delete.cancel")}</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => confirmDelete && remove.mutate(confirmDelete)}>
              {t("delete.confirm")}
            </Button>
          </>
        }
      >
        {confirmDelete && <LangText tag="p" en={confirmDelete.name_en} as={confirmDelete.name_as} className="font-medium" />}
      </Dialog>
    </div>
  );
}
