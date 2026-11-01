"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useLocale } from "next-intl";
import { CiviSvg, type CiviPose } from "./civi-svg";
import { cn } from "@/lib/utils";

export type { CiviPose } from "./civi-svg";

export type CiviState =
  | "idle"
  | "greeting"
  | "thinking"
  | "listening"
  | "speaking"
  | "success"
  | "warning"
  | "error"
  | "tutorial"
  | "happy"
  | "concerned"
  | "celebrating"
  | "learning";

export interface CiviProps {
  pose?: CiviPose;
  state?: CiviState;
  message?: string;
  messageAs?: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  dismissible?: boolean;
  interactive?: boolean;
  onDismiss?: () => void;
  onClick?: () => void;
}

const STATE_TO_POSE: Record<CiviState, CiviPose> = {
  idle: "hero",
  greeting: "hero",
  happy: "happy",
  thinking: "thinking",
  listening: "learning",
  speaking: "helping",
  success: "celebrating",
  celebrating: "celebrating",
  warning: "concerned",
  error: "concerned",
  concerned: "concerned",
  tutorial: "helping",
  learning: "learning",
};

const SIZE_CONFIG = {
  sm: 44,
  md: 64,
  lg: 96,
  xl: 128,
  hero: 180,
};

export function Civi({
  pose,
  state = "idle",
  message,
  messageAs,
  className,
  size = "md",
  dismissible = false,
  interactive = true,
  onDismiss,
  onClick,
}: CiviProps) {
  const locale = useLocale();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const currentPose: CiviPose = pose || STATE_TO_POSE[state] || "hero";
  const currentMessage = locale === "as" ? messageAs || message : message;
  const pxSize = SIZE_CONFIG[size] || SIZE_CONFIG.md;

  return (
    <div
      className={cn(
        "relative inline-flex items-center gap-3",
        interactive && "cursor-pointer select-none",
        className
      )}
      onClick={onClick}
    >
      {/* Speech Bubble (if message provided) */}
      <AnimatePresence>
        {currentMessage && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="relative z-10 max-w-xs rounded-2xl border border-border bg-surface px-3.5 py-2.5 text-xs text-foreground shadow-md dark:shadow-black/40 leading-relaxed"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-foreground text-xs leading-snug">
                {currentMessage}
              </span>
              {dismissible && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDismissed(true);
                    onDismiss?.();
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
                  aria-label="Dismiss message"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {/* Bubble Tail */}
            <div
              className="absolute -bottom-1.5 left-6 size-3 rotate-45 border-b border-r border-border bg-surface"
              aria-hidden
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pure Vector SVG Mascot Avatar */}
      <motion.div
        animate={interactive ? { y: [0, -4, 0] } : undefined}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        className="relative shrink-0 filter drop-shadow-sm"
      >
        <CiviSvg
          pose={currentPose}
          size={pxSize}
        />
      </motion.div>
    </div>
  );
}
