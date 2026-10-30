"use client";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { MarkReadRequest, NotificationsPage, UnreadCount } from "@/lib/domain";
import { apiFetch } from "@/components/api-client";
import { useRealtime } from "@/components/use-realtime";

export const NOTIFICATIONS_KEY = ["notifications"] as const;

/** First page only; used by the header bell for the unread count. */
export function useUnreadCount(userId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "unread"],
    queryFn: ({ signal }) => apiFetch<NotificationsPage>("/api/notifications", { signal }).then((p) => p.unread),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
  useRealtime(
    "notifications-bell",
    [{ table: "notifications", filter: `user_id=eq.${userId}` }],
    () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
    Boolean(userId),
  );
  return query;
}

export function useNotificationList() {
  return useInfiniteQuery({
    queryKey: [...NOTIFICATIONS_KEY, "list"],
    queryFn: ({ pageParam, signal }) =>
      apiFetch<NotificationsPage>(`/api/notifications${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`, { signal }),
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Marks some (ids) or all notifications read; updates both caches optimistically. */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MarkReadRequest) => apiFetch<UnreadCount>("/api/notifications/read", { method: "POST", json: body }),
    onMutate: (body) => {
      const ids = body.ids ? new Set(body.ids) : null;
      qc.setQueryData<InfiniteData<NotificationsPage>>([...NOTIFICATIONS_KEY, "list"], (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((p) => ({ ...p, items: p.items.map((i) => (!ids || ids.has(i.id) ? { ...i, read: true } : i)) })),
            }
          : data,
      );
    },
    onSuccess: (r) => qc.setQueryData([...NOTIFICATIONS_KEY, "unread"], r.unread),
    onSettled: () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}
