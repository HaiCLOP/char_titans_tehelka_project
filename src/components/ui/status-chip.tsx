"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useAnimate, useReducedMotion } from "framer-motion";
import type { Status } from "@/lib/domain";
import { Chip, STATUS_TONE } from "./chip";

/** Status chip (PRD 6 colour groups); pulses once whenever `status` changes, not on first render. */
export function StatusChip({ status, size, className }: { status: Status; size?: "sm" | "md"; className?: string }) {
  const t = useTranslations("status");
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  const prev = useRef(status);

  useEffect(() => {
    if (prev.current === status) return;
    prev.current = status;
    if (!reduce && scope.current) animate(scope.current, { scale: [1, 1.12, 1] }, { duration: 0.45, ease: "easeOut" });
  }, [status, reduce, animate, scope]);

  return (
    <span ref={scope} className="inline-flex max-w-full">
      <Chip
        size={size}
        tone={STATUS_TONE[status]}
        dot={status === "resolved" || status === "closed" ? "bg-p4" : undefined}
        className={className}
      >
        {t(status)}
      </Chip>
    </span>
  );
}
