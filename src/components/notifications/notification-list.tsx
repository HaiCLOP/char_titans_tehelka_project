"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BellOff, CheckCheck } from "lucide-react";
import type { NotificationItem } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Button, Card, EmptyState, ErrorState, LangText, ListSkeleton, RelativeTime } from "@/components/ui";
import { useMarkRead, useNotificationList, useUnreadCount } from "./use-notifications";

export function NotificationList({ userId }: { userId: string }) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const list = useNotificationList();
  const { data: unread = 0 } = useUnreadCount(userId);
  const markRead = useMarkRead();
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  const openItem = (n: NotificationItem) => {
    if (!n.read) markRead.mutate({ ids: [n.id] });
    if (n.complaint_id) router.push(`/c/${encodeURIComponent(n.complaint_id)}`);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button variant="secondary" onClick={() => markRead.mutate({})} disabled={unread === 0} loading={markRead.isPending && !markRead.variables?.ids}>
          <CheckCheck aria-hidden />
          {t("markAll")}
        </Button>
      </div>

      {list.isPending ? (
        <Card aria-busy>
          <span className="sr-only">{t("loading")}</span>
          <ListSkeleton rows={6} />
        </Card>
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} retrying={list.isRefetching} />
      ) : items.length === 0 ? (
        <EmptyState icon={BellOff} title={t("empty.title")} body={t("empty.body")} />
      ) : (
        <>
          <Card className="p-2">
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      !n.read && "bg-primary-soft/40",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")}
                    />
                    <span className="min-w-0 flex-1">
                      <LangText tag="span" en={n.title_en} as={n.title_as} className={cn("block text-sm", !n.read && "font-semibold")} />
                      <RelativeTime date={n.created_at} className="text-xs text-muted-foreground" />
                    </span>
                    {!n.read && <span className="sr-only">{t("unread")}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {list.hasNextPage && (
            <div className="mt-5 flex justify-center">
              <Button variant="secondary" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
                {t("loadMore")}
              </Button>
            </div>
          )}
          {list.isFetchNextPageError && <p className="mt-3 text-center text-xs text-danger">{t("loadMoreFailed")}</p>}
        </>
      )}
    </div>
  );
}
