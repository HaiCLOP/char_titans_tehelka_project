"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useLocale } from "next-intl";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  X,
} from "lucide-react";
import { CiviSvg, type CiviPose } from "@/components/mascot/civi-svg";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const ADMIN_TOUR_STORAGE_KEY = "civicsense_admin_tour_seen_v1";

interface AdminTourStep {
  targetId: string;
  pose: CiviPose;
  titleEn: string;
  titleAs: string;
  textEn: string;
  textAs: string;
  badgeEn: string;
  badgeAs: string;
}

const ADMIN_STEPS: AdminTourStep[] = [
  {
    targetId: "admin-tour-header",
    pose: "hero",
    titleEn: "1. Campus Operations Command",
    titleAs: "১. চৌহদ কাৰ্য পৰিচালনা কেন্দ্ৰ",
    badgeEn: "Operations Hub",
    badgeAs: "কাৰ্য কেন্দ্ৰ",
    textEn: "Welcome to Campus Operations! This is your real-time command deck for monitoring grievances, field dispatch, and department SLA compliance across Dibrugarh University.",
    textAs: "চৌহদ কাৰ্য পৰিচালনা কেন্দ্ৰলৈ স্বাগতম! ডিব্ৰুগড় বিশ্ববিদ্যালয়ৰ অভিযোগ নিৰীক্ষণ, ক্ষেত্ৰ কৰ্মী নিয়োগ আৰু বিভাগীয় সময়সীমা অনুসৰণ কৰাৰ এইটো আপোনাৰ মূল কেন্দ্ৰ।",
  },
  {
    targetId: "admin-tour-attention",
    pose: "concerned",
    titleEn: "2. Urgent Action Banners",
    titleAs: "২. জৰুৰী সতৰ্কতা বেনাৰ",
    badgeEn: "Needs Attention",
    badgeAs: "পদক্ষেপ প্ৰয়োজন",
    textEn: "Immediate action required! Keep an eye on overdue complaints, tickets nearing deadline within 6 hours, and unassigned high-priority emergencies.",
    textAs: "ক্ষিপ্ৰ পদক্ষেপ লওক! সময়সীমা পাৰ হোৱা অভিযোগ, ৬ ঘণ্টাৰ ভিতৰত ম্যাদ শেষ হ'বলগীয়া সমস্যা আৰু দায়িত্বহীন গুৰুত্বপূৰ্ণ জৰুৰী বিষয়বোৰ ইয়াত সতৰ্ক কৰা হয়।",
  },
  {
    targetId: "admin-tour-kpis",
    pose: "thinking",
    titleEn: "3. Live Performance KPIs",
    titleAs: "৩. লাইভ কাৰ্যক্ষমতা সংখ্যা",
    badgeEn: "Live KPIs",
    badgeAs: "লাইভ পৰিসংখ্যা",
    textEn: "Track your department's vital signs: live counts of Open vs Overdue tickets, newly fixed resolutions, and your average turnaround time in hours.",
    textAs: "বিভাগৰ মূল সূচকসমূহ চাওক: সক্ৰিয় অভিযোগ, সময়সীমা পাৰ হোৱা সংখ্যা, এই সময়ছোৱাত সমাধান হোৱা কাম আৰু সমাধানৰ গড় সময়।",
  },
  {
    targetId: "admin-tour-high",
    pose: "helping",
    titleEn: "4. High-Priority Dispatch (P1/P2)",
    titleAs: "৪. উচ্চ অগ্ৰাধিকাৰ অগ্ৰাধিকাৰ (P1/P2)",
    badgeEn: "Triage Dispatch",
    badgeAs: "দ্ৰুত দায়িত্ব",
    textEn: "Critical campus infrastructure emergencies appear here first. Assign field technicians directly or open the ticket workspace to inspect evidence.",
    textAs: "গুৰুত্বপূৰ্ণ জৰুৰী সমস্যা ইয়াত প্ৰথম প্ৰদৰ্শিত হয়। ক্ষেত্ৰ কৰ্মচাৰীক এতিয়াই দায়িত্ব দিয়ক বা ফটো প্ৰমাণ পৰীক্ষা কৰিবলৈ টিকেট খোলক।",
  },
  {
    targetId: "admin-tour-map",
    pose: "learning",
    titleEn: "5. Spatial Campus Atlas",
    titleAs: "৫. চৌহদৰ স্থানিক মানচিত্ৰ",
    badgeEn: "Geographic View",
    badgeAs: "স্থানিক অৱস্থান",
    textEn: "Spot issue clusters visually! The live schematic map highlights problem density across campus departments, hostels, and academic blocks.",
    textAs: "স্থান অনুসৰি সমস্যা নিৰীক্ষণ কৰক! কেম্পাছৰ হোষ্টেল আৰু বিভাগসমূহত অভিযোগৰ ঘনত্ব আৰু অৱস্থান লাইভ মানচিত্ৰত স্পষ্টকৈ দেখিব।",
  },
  {
    targetId: "admin-tour-recent",
    pose: "celebrating",
    titleEn: "6. Operational Triage Feed",
    titleAs: "৬. সাম্প্ৰতিক পৰিচালনা তালিকা",
    badgeEn: "Triage Queue",
    badgeAs: "কাৰ্য তালিকা",
    textEn: "Filter complaints by status (Open, In Progress, Resolved). Click any row to transition status, attach work notes, or upload completion photos.",
    textAs: "সকলো অভিযোগ অৱস্থা অনুসৰি বাছক। কামৰ স্থিতি সলনি কৰিবলৈ, মন্তব্য যোগ কৰিবলৈ বা সমাধানৰ ফটো আপলোড কৰিবলৈ যিকোনো শাৰীত টিপক।",
  },
];

export function AdminTour() {
  const locale = useLocale();
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [cardPlacement, setCardPlacement] = useState<"top" | "bottom">("bottom");
  const [highlightRect, setHighlightRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  const prevTargetRef = useRef<HTMLElement | null>(null);

  // Auto-prompt on first admin visit or when ?tour=true is in URL
  useEffect(() => {
    try {
      const seen = localStorage.getItem(ADMIN_TOUR_STORAGE_KEY);
      const urlHasTour = new URLSearchParams(window.location.search).get("tour") === "true";
      if (!seen || urlHasTour) {
        const timer = setTimeout(() => {
          setActive(true);
          setStepIdx(0);
        }, 800);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, []);

  // Listen for manual launch events from Admin Header
  useEffect(() => {
    const handleManual = () => {
      setActive(true);
      setStepIdx(0);
    };
    window.addEventListener("civicsense:open-admin-tour", handleManual);
    return () => window.removeEventListener("civicsense:open-admin-tour", handleManual);
  }, []);

  // Update highlight position and smart card placement
  const updateHighlight = useCallback(() => {
    if (!active) return;
    const step = ADMIN_STEPS[stepIdx];
    if (!step) return;

    if (prevTargetRef.current) {
      prevTargetRef.current.classList.remove("tour-active-highlight");
    }

    const el = document.getElementById(step.targetId);
    if (el) {
      if (el instanceof HTMLDetailsElement) el.open = true;
      prevTargetRef.current = el;
      el.classList.add("tour-active-highlight");
      el.scrollIntoView({ behavior: "smooth", block: "center" });

      const rect = el.getBoundingClientRect();
      setHighlightRect({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });

      // Space Management: If target is in bottom half, dock at top!
      const viewportMid = window.innerHeight / 2;
      if (rect.top + rect.height / 2 > viewportMid) {
        setCardPlacement("top");
      } else {
        setCardPlacement("bottom");
      }
    } else {
      setHighlightRect(null);
    }
  }, [active, stepIdx]);

  useEffect(() => {
    if (!active) return;
    const animId = requestAnimationFrame(updateHighlight);
    window.addEventListener("resize", updateHighlight);
    window.addEventListener("scroll", updateHighlight);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", updateHighlight);
      window.removeEventListener("scroll", updateHighlight);
      if (prevTargetRef.current) {
        prevTargetRef.current.classList.remove("tour-active-highlight");
      }
    };
  }, [active, updateHighlight]);

  const finishTour = useCallback(() => {
    if (prevTargetRef.current) {
      prevTargetRef.current.classList.remove("tour-active-highlight");
    }
    try {
      localStorage.setItem(ADMIN_TOUR_STORAGE_KEY, "true");
    } catch {}
    setActive(false);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        finishTour();
      } else if (e.key === "ArrowRight") {
        if (stepIdx < ADMIN_STEPS.length - 1) setStepIdx((i) => i + 1);
        else finishTour();
      } else if (e.key === "ArrowLeft") {
        if (stepIdx > 0) setStepIdx((i) => i - 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, stepIdx, finishTour]);

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (stepIdx < ADMIN_STEPS.length - 1) {
      setStepIdx((prev) => prev + 1);
    } else {
      finishTour();
    }
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (stepIdx > 0) {
      setStepIdx((prev) => prev - 1);
    }
  };

  if (!active) return null;

  const current = ADMIN_STEPS[stepIdx];
  const isLast = stepIdx === ADMIN_STEPS.length - 1;
  const isFirst = stepIdx === 0;
  const title = locale === "as" ? current.titleAs : current.titleEn;
  const text = locale === "as" ? current.textAs : current.textEn;
  const badge = locale === "as" ? current.badgeAs : current.badgeEn;
  const progressPercent = ((stepIdx + 1) / ADMIN_STEPS.length) * 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-hidden pointer-events-auto"
    >
      {/* Dimmed backdrop - closes only when backdrop itself is clicked */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            finishTour();
          }
        }}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px] transition-opacity duration-300"
      />

      {/* Spotlight Ring */}
      {highlightRect && (
        <motion.div
          layout
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          style={{
            top: `${highlightRect.top - window.scrollY - 6}px`,
            left: `${highlightRect.left - window.scrollX - 6}px`,
            width: `${highlightRect.width + 12}px`,
            height: `${highlightRect.height + 12}px`,
          }}
          className="fixed rounded-2xl pointer-events-none ring-4 ring-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.60)] transition-all duration-300 z-30"
        />
      )}

      {/* Adaptive Space-Managed Admin Tour Card */}
      <div
        className={cn(
          "fixed inset-x-4 z-40 flex justify-center pointer-events-none transition-all duration-300",
          cardPlacement === "top" ? "top-4 sm:top-6" : "bottom-4 sm:bottom-6"
        )}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden ring-1 ring-border/60"
        >
          {/* Progress Bar Header */}
          <div className="h-1 w-full bg-surface-muted overflow-hidden">
            <motion.div
              initial={false}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="h-full bg-primary"
            />
          </div>

          <div className="p-3.5 sm:p-4 space-y-2.5">
            {/* Header with Compact Mascot Avatar */}
            <div className="flex items-start gap-3">
              <div className="shrink-0 p-1 rounded-xl border border-border/80 bg-surface-muted/60 shadow-2xs">
                <CiviSvg pose={current.pose} size={50} />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <Sparkles className="size-2.5" />
                    <span>{badge}</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-semibold text-muted-foreground">
                      {stepIdx + 1} / {ADMIN_STEPS.length}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        finishTour();
                      }}
                      className="rounded-full p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
                      aria-label="Skip tour"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-xs sm:text-sm text-foreground tracking-tight line-clamp-1">
                  {title}
                </h3>

                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {text}
                </p>
              </div>
            </div>

            {/* Bottom Controls with Step Dots */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
              {/* Step Indicator Dots */}
              <div className="flex items-center gap-1">
                {ADMIN_STEPS.map((step, idx) => (
                  <button
                    key={step.targetId}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setStepIdx(idx);
                    }}
                    className={cn(
                      "h-1 rounded-full transition-all duration-200",
                      idx === stepIdx
                        ? "w-4 bg-primary"
                        : "w-1 bg-surface-muted hover:bg-muted-foreground/50"
                    )}
                    aria-label={`Go to step ${idx + 1}`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    finishTour();
                  }}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                >
                  {locale === "as" ? "বাদ দিয়ক" : "Skip"}
                </button>

                {!isFirst && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handlePrev}
                    className="gap-1 text-[11px] h-7 px-2.5 rounded-full"
                  >
                    <ArrowLeft className="size-3" />
                    <span>{locale === "as" ? "পূৰ্বৱৰ্তী" : "Back"}</span>
                  </Button>
                )}

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleNext}
                  className="gap-1 text-[11px] h-7 px-3 rounded-full font-semibold"
                >
                  {isLast ? (
                    <>
                      <span>{locale === "as" ? "বুজিলোঁ!" : "Got it!"}</span>
                      <Check className="size-3" />
                    </>
                  ) : (
                    <>
                      <span>{locale === "as" ? "পৰৱৰ্তী" : "Next"}</span>
                      <ArrowRight className="size-3" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
