"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BadgeId, MyBadges } from "@/lib/domain";
import { apiFetch } from "@/components/api-client";

export const BADGES_QUERY_KEY = ["my-badges"] as const;

export function useMyBadges(enabled = true) {
  return useQuery({
    queryKey: BADGES_QUERY_KEY,
    queryFn: ({ signal }) => apiFetch<MyBadges>("/api/me/badges", { signal }),
    staleTime: 60_000,
    enabled,
  });
}

/** localStorage is a per-viewer convenience: it can be missing or throw (private mode, blocked storage). */
export function readSeen<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeSeen(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: the celebration may show again next time, which is harmless
  }
}

/**
 * Badges earned since this viewer last looked (per user, per browser). The very first look only records the
 * current set, so existing badges are not all celebrated at once.
 */
export function useNewBadges(userId: string, data: MyBadges | undefined) {
  const [fresh, setFresh] = useState<BadgeId[]>([]);
  useEffect(() => {
    if (!data) return;
    const key = `cs_badges_seen:${userId}`;
    const earned = data.badges.filter((b) => b.earned).map((b) => b.id);
    const seen = readSeen<string[]>(key);
    writeSeen(key, earned);
    if (!seen) return;
    const added = earned.filter((id) => !seen.includes(id));
    // Syncing with an external store (localStorage) after the query resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (added.length) setFresh(added);
  }, [data, userId]);
  return { fresh, clear: () => setFresh([]) };
}
