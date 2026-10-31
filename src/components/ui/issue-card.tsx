import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { MapPin, ThumbsUp } from "lucide-react";
import type { Category, Status } from "@/lib/domain";
import { cn, toLocaleDigits } from "@/lib/utils";
import { CATEGORY_ICON } from "./category-icon";
import { CategoryChip, PriorityChip } from "./chip";
import { LangText } from "./lang-text";
import { RelativeTime } from "./relative-time";
import { StatusChip } from "./status-chip";

export type IssueCardData = {
  id: string;
  code: string;
  title_en: string | null;
  title_as: string | null;
  category: Category;
  priority: number;
  status: Status;
  metoo_count: number;
  created_at: string;
  /** Signed URL of the first photo, or null. */
  photo_url?: string | null;
  location?: { name_en: string; name_as: string } | null;
};

type IssueCardProps = {
  issue: IssueCardData;
  /** Default `/c/<id>`; pass null for a non-link card. */
  href?: string | null;
  showStatus?: boolean;
  showCategory?: boolean;
  /** Horizontal compact row (lists on mobile, drawers). */
  compact?: boolean;
  className?: string;
  /** Extra content under the meta row (e.g. SLA countdown, actions). */
  footer?: React.ReactNode;
};

function Photo({ issue, className }: { issue: IssueCardData; className?: string }) {
  const t = useTranslations("ui");
  const Icon = CATEGORY_ICON[issue.category];
  return (
    <div className={cn("relative overflow-hidden bg-surface-muted", className)}>
      {issue.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs expire; skip the optimiser
        <img src={issue.photo_url} alt={t("photoAlt")} loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center text-muted-foreground/70">
          <Icon className="size-8" aria-hidden />
        </div>
      )}
    </div>
  );
}

export function IssueCard({ issue, href, showStatus = true, showCategory = false, compact = false, className, footer }: IssueCardProps) {
  const t = useTranslations("ui");
  const locale = useLocale();
  const link = href === undefined ? `/c/${issue.id}` : href;
  const title = <LangText en={issue.title_en} as={issue.title_as} fallback={issue.code} />;

  const meta = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1">
        <MapPin className="size-3.5 shrink-0" aria-hidden />
        {issue.location ? (
          <LangText en={issue.location.name_en} as={issue.location.name_as} className="truncate" />
        ) : (
          <span>{t("noLocation")}</span>
        )}
      </span>
      <span className="inline-flex items-center gap-1">
        <ThumbsUp className="size-3.5" aria-hidden />
        {t("supports", { count: issue.metoo_count, n: toLocaleDigits(issue.metoo_count, locale) })}
      </span>
      <RelativeTime date={issue.created_at} />
    </div>
  );

  const hasPhoto = Boolean(issue.photo_url);
  const body = compact ? (
    <div className="flex gap-3 p-3">
      {hasPhoto && <Photo issue={issue} className="size-20 shrink-0 rounded-2xl" />}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          <PriorityChip priority={issue.priority} />
          {showStatus && <StatusChip status={issue.status} />}
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold tracking-[-0.01em]">{title}</h3>
        {meta}
        {footer}
      </div>
    </div>
  ) : (
    <>
      {hasPhoto && (
        <div className="relative p-2 pb-0">
          <Photo issue={issue} className="aspect-[16/9] rounded-[1.1rem]" />
        </div>
      )}
      <div className="space-y-2.5 p-5">
        <div className="flex flex-wrap gap-1.5">
          <PriorityChip priority={issue.priority} />
          {showStatus && <StatusChip status={issue.status} />}
          {showCategory && <CategoryChip category={issue.category} />}
        </div>
        <h3 className="line-clamp-2 text-[1.0625rem] leading-snug font-semibold tracking-[-0.015em]">{title}</h3>
        {meta}
        {footer}
      </div>
    </>
  );

  const frame = cn(
    "block h-full overflow-hidden rounded-card border border-border bg-surface shadow-sm transition-[border-color,box-shadow,transform] duration-300 ease-out-expo",
    link && "hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );
  return link ? (
    <Link href={link} className={frame}>
      {body}
    </Link>
  ) : (
    <article className={frame}>{body}</article>
  );
}
