"use client";
import { useEffect, useRef } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type RealtimeSub = {
  table: "complaints" | "complaint_events" | "notifications" | "messages";
  /** PostgREST-style filter, e.g. `user_id=eq.<uuid>`. */
  filter?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
};

let client: ReturnType<typeof createClient> | null = null;
const browserClient = () => (client ??= createClient());

/**
 * Subscribes to Supabase `postgres_changes` (RLS applies) while mounted. `onChange` may change between
 * renders without resubscribing. Pass `enabled=false` (e.g. signed out) to skip.
 */
export function useRealtime(
  name: string,
  subs: RealtimeSub[],
  onChange: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
  enabled = true,
) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  }, [onChange]);
  const key = JSON.stringify(subs);

  useEffect(() => {
    if (!enabled) return;
    const supabase = browserClient();
    const list = JSON.parse(key) as RealtimeSub[];
    let channel = supabase.channel(`${name}:${Math.random().toString(36).slice(2)}`);
    for (const s of list) {
      channel = channel.on(
        "postgres_changes",
        { event: s.event ?? "*", schema: "public", table: s.table, ...(s.filter ? { filter: s.filter } : {}) },
        (payload) => cb.current(payload as RealtimePostgresChangesPayload<Record<string, unknown>>),
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [name, key, enabled]);
}
