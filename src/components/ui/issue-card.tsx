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
  thumb?: string | null;
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
  const imgUrl = issue.photo_url ?? issue.thumb ?? null;
  return (
    <div className={cn("relative overflow-hidden bg-surface-muted", className)}>
      {imgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs expire; skip the optimiser
        <img src={imgUrl} alt={t("photoAlt")} loading="lazy" className="size-full object-cover" />
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

  const hasPhoto = Boolean(issue.photo_url || issue.thumb);
  const body = compact ? (
    <div className="flex items-start gap-3 p-3 sm:p-3.5">
      <Photo
        issue={issue}
        className={cn(
          "size-20 sm:size-24 shrink-0 rounded-xl border border-border/60 object-cover",
          !hasPhoto && "bg-surface-muted/60",
        )}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <PriorityChip priority={issue.priority} />
          {showStatus && <StatusChip status={issue.status} />}
          {showCategory && <CategoryChip category={issue.category} />}
        </div>
        <h3 className="line-clamp-2 text-sm sm:text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
          {title}
        </h3>
        {meta}
        {footer && <div className="pt-1">{footer}</div>}
      </div>
    </div>
  ) : (
    <>
      <div className="relative p-2.5 pb-0">
        <Photo
          issue={issue}
          className={cn("aspect-[2.2/1] rounded-xl object-cover", !hasPhoto && "bg-gradient-to-br from-surface-muted to-surface-muted/30 border border-border/40")}
        />
      </div>
      <div className="space-y-2 p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <PriorityChip priority={issue.priority} />
          {showStatus && <StatusChip status={issue.status} />}
          {showCategory && <CategoryChip category={issue.category} />}
        </div>
        <h3 className="line-clamp-2 text-base leading-snug font-semibold tracking-[-0.015em] text-foreground">{title}</h3>
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
