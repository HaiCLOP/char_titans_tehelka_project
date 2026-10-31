"use client";
import { SegmentError } from "@/components/segment-states";

// Keeps the shell (rail / bottom nav) on a page error; the root error.tsx covers everything else.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <SegmentError error={error} retry={retry} />;
}
