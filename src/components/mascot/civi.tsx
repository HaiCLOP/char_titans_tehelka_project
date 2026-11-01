"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";

export type CiviState =
  | "idle"
  | "greeting"
  | "thinking"
  | "listening"
  | "speaking"
  | "success"
  | "warning"
  | "error"
  | "tutorial";

export interface CiviProps {
  state?: CiviState;
  message?: string;
  messageAs?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  dismissible?: boolean;
  interactive?: boolean;
  onDismiss?: () => void;
  onClick?: () => void;
}

export function Civi({
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

  const currentMessage = locale === "as" ? messageAs || message : message;

  const sizeClasses = {
    sm: "size-12",
    md: "size-16",
    lg: "size-24",
  };

  const visorTones: Record<CiviState, { border: string; glow: string; fill: string }> = {
    idle: { border: "border-primary/30", glow: "rgba(0, 0, 0, 0.05)", fill: "text-foreground" },
    greeting: { border: "border-primary/50", glow: "rgba(0, 0, 0, 0.08)", fill: "text-primary" },
    thinking: { border: "border-primary/40", glow: "rgba(0, 0, 0, 0.1)", fill: "text-primary" },
    listening: { border: "border-emerald-500/50", glow: "rgba(16, 185, 129, 0.15)", fill: "text-emerald-500" },
    speaking: { border: "border-primary/60", glow: "rgba(0, 0, 0, 0.12)", fill: "text-primary" },
    success: { border: "border-emerald-500/60", glow: "rgba(16, 185, 129, 0.2)", fill: "text-emerald-600 dark:text-emerald-400" },
    warning: { border: "border-amber-500/60", glow: "rgba(245, 158, 11, 0.2)", fill: "text-amber-500" },
    error: { border: "border-rose-500/60", glow: "rgba(244, 63, 94, 0.2)", fill: "text-rose-500" },
    tutorial: { border: "border-primary/50", glow: "rgba(0, 0, 0, 0.08)", fill: "text-primary" },
  };

  const tone = visorTones[state] || visorTones.idle;

  return (
    <div className={cn("relative inline-flex items-center gap-3", className)}>
      {/* Civi Mascot Body */}
      <button
        type="button"
        disabled={!interactive && !onClick}
        onClick={onClick}
        aria-label={`Civi Assistant (${state})`}
        className={cn(
          "relative grid place-items-center rounded-2xl bg-surface border shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0",
          sizeClasses[size],
          tone.border,
          interactive && "hover:scale-105 active:scale-95 cursor-pointer"
        )}
        style={{
          boxShadow: `0 4px 20px ${tone.glow}`,
        }}
      >
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="size-4/5 select-none"
          aria-hidden="true"
        >
          {/* Subtle Outer Halo Ring */}
          <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" className="text-border opacity-60" />

          {/* Minimalist Geometric Helmet/Head */}
          <rect x="12" y="14" width="40" height="36" rx="14" fill="currentColor" className="text-surface-muted/80 dark:text-surface-sunken" stroke="currentColor" strokeWidth="2" />
          
          {/* Audio Antenna / Node */}
          <line x1="32" y1="8" x2="32" y2="14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-foreground" />
          <circle cx="32" cy="7" r="3" fill="currentColor" className={cn("transition-colors", tone.fill)} />

          {/* Visor Area */}
          <rect x="17" y="21" width="30" height="20" rx="8" fill="currentColor" className="text-foreground dark:text-black" />

          {/* State-specific Visor Display */}
          {state === "idle" && (
            <g className="text-background dark:text-white">
              {/* Calm Digital Eyes */}
              <circle cx="26" cy="31" r="2.5" fill="currentColor" />
              <circle cx="38" cy="31" r="2.5" fill="currentColor" />
            </g>
          )}

          {state === "greeting" && (
            <g className="text-primary-foreground dark:text-white">
              {/* Happy Arched Eyes */}
              <path d="M23 32 Q26 28 29 32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M35 32 Q38 28 41 32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            </g>
          )}

          {state === "thinking" && (
            <g className="text-primary-foreground dark:text-white">
              <circle cx="24" cy="31" r="2" fill="currentColor" opacity="0.4" />
              <circle cx="32" cy="31" r="2.5" fill="currentColor" opacity="0.8" />
              <circle cx="40" cy="31" r="2" fill="currentColor" opacity="0.4" />
            </g>
          )}

          {state === "listening" && (
            <g className="text-emerald-400">
              <rect x="22" y="29" width="2" height="4" rx="1" fill="currentColor" />
              <rect x="27" y="26" width="2" height="10" rx="1" fill="currentColor" />
              <rect x="32" y="24" width="2" height="14" rx="1" fill="currentColor" />
              <rect x="37" y="27" width="2" height="8" rx="1" fill="currentColor" />
              <rect x="42" y="30" width="2" height="2" rx="1" fill="currentColor" />
            </g>
          )}

          {state === "speaking" && (
            <g className="text-primary-foreground dark:text-white">
              <circle cx="26" cy="29" r="2" fill="currentColor" />
              <circle cx="38" cy="29" r="2" fill="currentColor" />
              {/* Vocal smile waveform */}
              <path d="M27 34 Q32 37 37 34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            </g>
          )}

          {state === "success" && (
            <g className="text-emerald-400">
              <path d="M26 31 L30 35 L38 27" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </g>
          )}

          {state === "warning" && (
            <g className="text-amber-400">
              <line x1="32" y1="26" x2="32" y2="33" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="32" cy="37" r="1.5" fill="currentColor" />
            </g>
          )}

          {state === "error" && (
            <g className="text-rose-400">
              <line x1="26" y1="27" x2="38" y2="35" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="38" y1="27" x2="26" y2="35" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </g>
          )}

          {state === "tutorial" && (
            <g className="text-primary-foreground dark:text-white">
              <circle cx="29" cy="30" r="4.5" stroke="currentColor" strokeWidth="2" fill="none" />
              <line x1="32.5" y1="33.5" x2="37" y2="38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </g>
          )}
        </svg>

        {/* Small Live Status Badge */}
        {state === "listening" && (
          <span className="absolute -top-1 -right-1 flex size-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-3.5 bg-emerald-500 border-2 border-surface" />
          </span>
        )}
        {state === "thinking" && (
          <span className="absolute -top-1 -right-1 flex size-3.5">
            <span className="relative inline-flex rounded-full size-3.5 bg-primary border-2 border-surface" />
          </span>
        )}
      </button>

      {/* Speech Bubble */}
      <AnimatePresence>
        {currentMessage && (
          <motion.div
            initial={{ opacity: 0, x: -6, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="relative flex items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 py-2.5 text-xs text-foreground shadow-xs max-w-xs sm:max-w-md"
          >
            {/* Speech bubble pointer arrow */}
            <span className="absolute -left-1.5 top-1/2 -translate-y-1/2 size-3 rotate-45 border-l border-b border-border bg-surface" />

            <div className="relative min-w-0 flex-1 leading-relaxed">
              <span className="font-semibold text-primary block text-[10px] uppercase tracking-wider mb-0.5">
                Civi
              </span>
              <p className="text-muted-foreground">{currentMessage}</p>
            </div>

            {dismissible && (
              <button
                type="button"
                onClick={() => {
                  setDismissed(true);
                  onDismiss?.();
                }}
                className="grid size-5 shrink-0 place-items-center rounded-full text-subtle-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
                aria-label="Dismiss message"
              >
                <X className="size-3" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
