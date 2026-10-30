"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Clock, MessageSquare, Plus, Star, Wrench } from "lucide-react";
import {
  ActivityItem, Avatar, Button, Card, CardHeader, CategoryChip, Chip, Combobox, Dialog, Drawer, EmptyState, ErrorState,
  ForbiddenState, Input, IssueCard, IssueCardSkeleton, KpiCard, KpiCardSkeleton, LangText, ListSkeleton, PhotoDropzone,
  PriorityChip, RelativeTime, Select, Skeleton, SkeletonText, StatusChip, Switch, Tabs, Textarea, Timeline,
  type PhotoItem, type TimelineItem,
} from "@/components/ui";
import { CATEGORIES, STATUSES, type Status } from "@/lib/domain";
import { pickLang } from "@/lib/lang";
import { matchesQuery } from "@/lib/search";
import {
  MOCK_BRIEF, MOCK_COMPLAINTS, MOCK_EVENTS, MOCK_LOCATIONS, MOCK_NOTIFICATIONS, MOCK_STATS, MOCK_TREND, mockFetch, type Location,
} from "@/lib/mock";

function Section({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{name}</h2>
      {children}
    </section>
  );
}

const locSearch = (l: Location) => `${l.name_en} ${l.name_as}`;

export function Gallery() {
  const t = useTranslations();
  const locale = useLocale();
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [tab, setTab] = useState("active");
  const [text, setText] = useState("হোষ্টেলৰ বাথৰুমত তিনিদিন ধৰি পানী নাই");
  const [sw, setSw] = useState(true);
  const [sensitive, setSensitive] = useState(false);
  const [loc, setLoc] = useState<Location | null>(null);
  const [asyncLoc, setAsyncLoc] = useState<Location | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [status, setStatus] = useState<Status>("submitted");
  const [loading, setLoading] = useState(false);
  const [now] = useState(() => Date.now());

  const timeline: TimelineItem[] = MOCK_EVENTS.filter((e) => e.complaint_id === MOCK_COMPLAINTS[0].id).map((e, i, all) => ({
    id: e.id,
    type: e.type,
    title: e.to_status ? t(`status.${e.to_status}`) : pickLang(e, "note", locale),
    body: e.to_status ? pickLang(e, "note", locale) || undefined : undefined,
    actor: e.actor_name ?? undefined,
    at: e.created_at,
    highlight: i === all.length - 1,
  }));

  const cycleStatus = () => setStatus((s) => STATUSES[(STATUSES.indexOf(s) + 1) % STATUSES.length]);

  return (
    <div className="space-y-10">
      <Section name="Button">
        <div className="flex flex-wrap gap-2">
          <Button>{t("hero.cta")}</Button>
          <Button variant="secondary">{t("ui.retry")}</Button>
          <Button variant="soft"><Plus aria-hidden />{t("nav.reportShort")}</Button>
          <Button variant="ghost">{t("ui.close")}</Button>
          <Button variant="danger"><AlertTriangle aria-hidden />{t("priority.1")}</Button>
          <Button loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500); }}>{t("common.loading")}</Button>
          <Button disabled>{t("ui.close")}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">sm</Button><Button size="md">md</Button><Button size="lg">lg</Button>
          <Button size="icon" variant="secondary" aria-label={t("nav.reportShort")}><Plus aria-hidden /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={t("nav.reportShort")}><Plus aria-hidden /></Button>
        </div>
      </Section>

      <Section name="Chip / PriorityChip / StatusChip / CategoryChip">
        <div className="flex flex-wrap gap-2">{[1, 2, 3, 4].map((p) => <PriorityChip key={p} priority={p} />)}{[1, 2, 3, 4].map((p) => <PriorityChip key={`c${p}`} priority={p} showCode size="md" />)}</div>
        <div className="flex flex-wrap gap-2">{STATUSES.map((s) => <StatusChip key={s} status={s} />)}</div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={status} size="md" />
          <Button size="sm" variant="secondary" onClick={cycleStatus}>StatusChip pulse →</Button>
        </div>
        <div className="flex flex-wrap gap-2">{CATEGORIES.map((c) => <CategoryChip key={c} category={c} />)}</div>
        <div className="flex flex-wrap gap-2">
          {(["neutral", "primary", "success", "muted", "danger", "warning", "accent"] as const).map((tone) => <Chip key={tone} tone={tone}>{tone}</Chip>)}
        </div>
      </Section>

      <Section name="Card / KpiCard">
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4">
          <KpiCard label={t("stats.open")} value={MOCK_STATS.open} icon={Wrench} series={MOCK_TREND.map((d) => d.created)} />
          <KpiCard label={t("stats.progress")} value={MOCK_STATS.overdue} icon={Clock} tone="danger" series={MOCK_TREND.map((d) => d.created - d.resolved)} />
          <KpiCard label={t("stats.resolved")} value={MOCK_STATS.resolved_this_week} icon={CheckCircle2} tone="success" hint="+12%" />
          <KpiCard label={t("stats.contributors")} value="4.3" unit="/5" icon={Star} tone="accent" />
          <KpiCardSkeleton />
        </div>
        <Card>
          <CardHeader title={t("home.insights")} description={new Date(MOCK_BRIEF.generated_at).toISOString()} action={<Button size="sm" variant="ghost">{t("home.viewAll")}</Button>} />
          <ul className="list-disc space-y-1 pl-5 text-sm">{(locale === "as" ? MOCK_BRIEF.as : MOCK_BRIEF.en).map((b) => <li key={b}>{b}</li>)}</ul>
        </Card>
      </Section>

      <Section name="IssueCard (grid / compact / skeleton)">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {MOCK_COMPLAINTS.slice(0, 3).map((c) => <IssueCard key={c.id} issue={c} href={null} />)}
          <IssueCardSkeleton />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {MOCK_COMPLAINTS.slice(3, 7).map((c) => <IssueCard key={c.id} issue={c} href={null} compact showCategory />)}
        </div>
      </Section>

      <Section name="Timeline / ActivityItem / Avatar / RelativeTime / LangText">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><Timeline items={timeline} /><Timeline items={[]} className="mt-6" /></Card>
          <Card>
            <ul>
              {MOCK_NOTIFICATIONS.map((n, i) => (
                <ActivityItem key={n.id} at={n.created_at} icon={i % 2 ? MessageSquare : CheckCircle2} tone={i % 2 ? "primary" : "success"}>
                  <LangText en={n.title_en} as={n.title_as} />
                </ActivityItem>
              ))}
              <ActivityItem at={MOCK_COMPLAINTS[0].created_at} leading={<Avatar name="Priya Gogoi" size="sm" />}>Priya Gogoi</ActivityItem>
            </ul>
            <div className="mt-4 flex items-center gap-2">
              <Avatar name="Priya Gogoi" size="xs" /><Avatar name="Bikash Saikia" size="sm" /><Avatar name="অসমীয়া নাম" /><Avatar name="R Dutta" size="lg" />
            </div>
            <p className="mt-4 flex flex-wrap gap-3 text-sm">
              <RelativeTime date={now - 20_000} /> · <RelativeTime date={now - 3 * 60_000} /> · <RelativeTime date={now - 5 * 3_600_000} /> ·
              <RelativeTime date={now - 3 * 86_400_000} /> · <RelativeTime date={now + 2 * 3_600_000} />
            </p>
          </Card>
        </div>
      </Section>

      <Section name="Tabs">
        <Tabs
          label={t("nav.myReports")}
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "active", label: t("status.in_progress"), count: 4, content: <p className="text-sm">{t("status.in_progress")}</p> },
            { value: "resolved", label: t("status.resolved"), count: 12, content: <p className="text-sm">{t("status.resolved")}</p> },
            { value: "all", label: t("home.viewAll"), content: <p className="text-sm">{t("home.viewAll")}</p> },
          ]}
        />
        <Tabs label="EN/AS" fill className="max-w-xs" items={[{ value: "en", label: "EN" }, { value: "as", label: "অস" }]} />
      </Section>

      <Section name="Input / Textarea / Select / Switch">
        <Card className="grid gap-5 md:grid-cols-2">
          <Textarea label={t("nav.report")} hint={t("header.search")} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} showCount required />
          <div className="space-y-5">
            <Input label={t("auth.emailLabel")} placeholder={t("auth.emailPlaceholder")} type="email" />
            <Input label={t("auth.emailLabel")} defaultValue="not-an-email" error={t("auth.invalidEmail")} />
            <Select label={t("category.other")} placeholder={t("ui.combobox.placeholder")} options={CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))} />
          </div>
          <Switch checked={sw} onCheckedChange={setSw} label={t("status.assigned")} description={t("header.search")} />
          <Switch checked={sensitive} onCheckedChange={setSensitive} label={t("category.safety_security")} description={t("ui.forbidden.body")} />
          <Switch checked={false} onCheckedChange={() => {}} label={t("ui.close")} disabled />
        </Card>
      </Section>

      <Section name="Combobox (static bilingual / async)">
        <Card className="grid gap-5 md:grid-cols-2">
          <Combobox
            label={t("nav.buildings")}
            hint="Try: hostel · হোষ্টেল · ছোৱালী · library"
            value={loc}
            onChange={setLoc}
            options={MOCK_LOCATIONS}
            getKey={(l) => l.id}
            getLabel={(l) => pickLang(l, "name", locale)}
            getSearchText={locSearch}
            renderOption={(l) => (
              <span className="flex flex-col">
                <span>{pickLang(l, "name", locale)}</span>
                <span className="text-xs text-muted-foreground">{locale === "as" ? l.name_en : l.name_as}</span>
              </span>
            )}
          />
          <Combobox
            label={`${t("nav.buildings")} (async)`}
            value={asyncLoc}
            onChange={setAsyncLoc}
            loadOptions={(q) => mockFetch(MOCK_LOCATIONS.filter((l) => matchesQuery(locSearch(l), q)), { ms: 600 })}
            getKey={(l) => l.id}
            getLabel={(l) => pickLang(l, "name", locale)}
            error={asyncLoc ? undefined : t("ui.combobox.noResults")}
          />
        </Card>
      </Section>

      <Section name="PhotoDropzone">
        <Card className="max-w-md"><PhotoDropzone label={t("ui.photo.add")} value={photos} onChange={setPhotos} /></Card>
      </Section>

      <Section name="Dialog / Drawer">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setDialog(true)}>Dialog</Button>
          <Button variant="secondary" onClick={() => setDrawer(true)}>Drawer (right)</Button>
          <Button variant="secondary" onClick={() => setSheet(true)}>Drawer (center)</Button>
        </div>
        <Dialog open={dialog} onOpenChange={setDialog} title={t("auth.sentTitle")} description={t("auth.privacy")}
          footer={<><Button variant="ghost" onClick={() => setDialog(false)}>{t("ui.close")}</Button><Button onClick={() => setDialog(false)}>{t("hero.cta")}</Button></>}>
          <Input label={t("auth.emailLabel")} />
        </Dialog>
        <Drawer open={drawer} onOpenChange={setDrawer} title={t("home.ongoing")}>
          <div className="space-y-3">{MOCK_COMPLAINTS.slice(0, 4).map((c) => <IssueCard key={c.id} issue={c} compact href={null} />)}</div>
        </Drawer>
        <Drawer open={sheet} onOpenChange={setSheet} side="center" title={t("home.ongoing")} footer={<Button block onClick={() => setSheet(false)}>{t("ui.close")}</Button>}>
          <SkeletonText lines={4} />
        </Drawer>
      </Section>

      <Section name="Skeleton / EmptyState / ErrorState / ForbiddenState">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-4"><Skeleton className="h-6 w-1/3" /><SkeletonText /><ListSkeleton rows={3} /></Card>
          <EmptyState title={t("common.empty")} body={t("hero.subtitle")} action={<Button><Plus aria-hidden />{t("hero.cta")}</Button>} />
          <ErrorState onRetry={() => setLoading((l) => !l)} />
          <ForbiddenState />
        </div>
      </Section>
    </div>
  );
}
