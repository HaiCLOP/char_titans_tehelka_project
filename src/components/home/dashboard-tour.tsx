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

const TOUR_STORAGE_KEY = "civicsense_dash_tour_seen_v3";

interface TourStep {
  targetId: string;
  mobileTargetId?: string;
  pose: CiviPose;
  titleEn: string;
  titleAs: string;
  textEn: string;
  textAs: string;
  badgeEn: string;
  badgeAs: string;
}

const STEPS: TourStep[] = [
  {
    targetId: "tour-composer",
    mobileTargetId: "tour-composer",
    pose: "hero",
    titleEn: "1. Campus Grievance Composer",
    titleAs: "১. কেম্পাছ অভিযোগ দাখিল",
    badgeEn: "Start Here",
    badgeAs: "ইয়াত আৰম্ভ কৰক",
    textEn: "Report any campus problem in seconds! Type in English or Assamese, or pick quick categories like Water or Electrical. CivicSense AI classifies and routes your complaint directly to the responsible university department.",
    textAs: "হোষ্টেল বা বিভাগৰ যিকোনো সমস্যা নিমিষতে দাখিল কৰক! ইংৰাজী বা অসমীয়াত লিখক। এআই-য়ে সমস্যা চিনাক্ত কৰি নিমিষতে বিশ্ববিদ্যালয়ৰ সঠিক বিভাগলৈ প্ৰেৰণ কৰিব।",
  },
  {
    targetId: "tour-photo-btn",
    mobileTargetId: "tour-photo-btn",
    pose: "helping",
    titleEn: "2. Visual Evidence & AI Duplicate Detection",
    titleAs: "২. ফটো সংলগ্ন আৰু এআই ডুপ্লিকেট পৰীক্ষা",
    badgeEn: "Evidence Proof",
    badgeAs: "প্ৰমাণ সংলগ্ন",
    textEn: "A photo speeds up resolution! Attach photos of damaged lights, leaking pipes, or potholes. CivicSense AI automatically compares visual features against existing reports to prevent duplicate clutter.",
    textAs: "ফটো দিলে কাম ক্ষিপ্ৰ হয়! ভঙা লাইট বা পানী ওলোৱা নলৰ ফটো তোলক। এআই ইঞ্জিনে পুৰণি অভিযোগৰ লগত ফটো মিলাই পুনৰাবৃত্তি ৰোধ কৰে।",
  },
  {
    targetId: "tour-kpis",
    mobileTargetId: "tour-mobile-kpis",
    pose: "thinking",
    titleEn: "3. Live University Resolution Stats",
    titleAs: "৩. লাইভ চৌহদ সমাধান স্থিতি",
    badgeEn: "Live Metrics",
    badgeAs: "লাইভ সংখ্যা",
    textEn: "100% transparent campus metrics! Track real-time counts of Open, Working, and Resolved tickets, plus Dibrugarh University's official average turnaround time.",
    textAs: "সম্পূৰ্ণ স্বচ্ছ বিশ্ববিদ্যালয়ৰ পৰিসংখ্যা! কিমান অভিযোগ মুকলি আছে, কিমানত কাম চলি আছে আৰু গড় সমাধানৰ সময় কিমান — সকলো লাইভ সংখ্যা ইয়াত চাওক।",
  },
  {
    targetId: "tour-ai-brief",
    mobileTargetId: "tour-composer",
    pose: "learning",
    titleEn: "4. AI Campus Daily Brief",
    titleAs: "৪. দৈনিক এআই কেম্পাছ ব্ৰিফ",
    badgeEn: "AI Summary",
    badgeAs: "এআই সাৰাংশ",
    textEn: "Every morning, our Go AI engine analyzes high-priority tickets, patterns, and resolution progress across Dibrugarh University into a concise briefing for students and administration.",
    textAs: "প্ৰতিদিনে পুৱা আমাৰ এআই ইঞ্জিনে বিশ্ববিদ্যালয়ৰ সকলো গুৰুত্বপূৰ্ণ সমস্যা আৰু সমাধানৰ অগ্ৰগতি বিশ্লেষণ কৰি এই সাৰাংশ প্ৰস্তুত কৰে।",
  },
  {
    targetId: "tour-issue-feed",
    mobileTargetId: "tour-issue-feed",
    pose: "happy",
    titleEn: "5. Campus Issue Feed & 'Me Too' Upvotes",
    titleAs: "৫. চৌহদৰ অভিযোগ আৰু সমৰ্থন",
    badgeEn: "Community Feed",
    badgeAs: "ৰাজহুৱা তালিকা",
    textEn: "Browse open and resolved issues across campus. If someone already reported your problem, tap 'Me too' to boost urgency instead of filing a duplicate!",
    textAs: "কেম্পাছৰ সকলো অভিযোগ ইয়াত চাওক। কোনোবাই ইতিমধ্যে একে সমস্যা দিছে যদি 'মোৰো একে সমস্যা' বুটামত টিপি সমৰ্থন জনাওক, পুনৰ নকৈ অভিযোগ দিয়াৰ প্ৰয়োজন নাই!",
  },
  {
    targetId: "tour-sidebar",
    mobileTargetId: "tour-sidebar",
    pose: "celebrating",
    titleEn: "6. Map, Pulse & Department Directory",
    titleAs: "৬. কেম্পাছ মেপ, পালছ আৰু বিভাগসমূহ",
    badgeEn: "Explore All",
    badgeAs: "চৌহদ অন্বেষণ",
    textEn: "Explore the live GIS Campus Map, department transparency scores on Pulse, and direct emergency contacts. I'm always floating nearby if you need help!",
    textAs: "কেম্পাছৰ লাইভ মানচিত্ৰ, বিভাগৰ কাৰ্যক্ষমতা আৰু জৰুৰীকালীন যোগাযোগ নম্বৰ চাবলৈ এই মেনু ব্যৱহাৰ কৰক। যিকোনো সহায়ৰ বাবে মই সদায় আপোনাৰ কাষতেই আছোঁ!",
  },
];

export function DashboardTour() {
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

  // Auto-launch on first visit or query param ?tour=true
  useEffect(() => {
    try {
      const seen = localStorage.getItem(TOUR_STORAGE_KEY);
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

  // Listen for manual launch events from Civi Companion
  useEffect(() => {
    const handleManual = () => {
      setActive(true);
      setStepIdx(0);
    };
    window.addEventListener("civicsense:open-civi-tour", handleManual);
    return () => window.removeEventListener("civicsense:open-civi-tour", handleManual);
  }, []);

  // Find effective target element (handling mobile screen differences)
  const getTargetElement = useCallback((step: TourStep): HTMLElement | null => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
    const targetId = isMobile && step.mobileTargetId ? step.mobileTargetId : step.targetId;
    let el = document.getElementById(targetId);
    
    // Fallback if desktop target is hidden on mobile
    if (!el || (el.offsetWidth === 0 && el.offsetHeight === 0)) {
      if (step.mobileTargetId) {
        el = document.getElementById(step.mobileTargetId);
      }
    }
    return el;
  }, []);

  // Update spotlight coordinates and compute smart card placement
  const updateHighlight = useCallback(() => {
    if (!active) return;
    const step = STEPS[stepIdx];
    if (!step) return;

    if (prevTargetRef.current) {
      prevTargetRef.current.classList.remove("tour-active-highlight");
    }

    const el = getTargetElement(step);
    if (el) {
      prevTargetRef.current = el;
      el.classList.add("tour-active-highlight");
      
      // Gentle scroll with padding
      el.scrollIntoView({ behavior: "smooth", block: "center" });

      const rect = el.getBoundingClientRect();
      setHighlightRect({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });

      // Space Management: If element is in lower half of screen, place card at top to avoid covering it!
      const viewportMid = window.innerHeight / 2;
      if (rect.top + rect.height / 2 > viewportMid) {
        setCardPlacement("top");
      } else {
        setCardPlacement("bottom");
      }
    } else {
      setHighlightRect(null);
    }
  }, [active, stepIdx, getTargetElement]);

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
      localStorage.setItem(TOUR_STORAGE_KEY, "true");
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
        if (stepIdx < STEPS.length - 1) setStepIdx((i) => i + 1);
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
    if (stepIdx < STEPS.length - 1) {
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

  const current = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;
  const isFirst = stepIdx === 0;
  const title = locale === "as" ? current.titleAs : current.titleEn;
  const text = locale === "as" ? current.textAs : current.textEn;
  const badge = locale === "as" ? current.badgeAs : current.badgeEn;
  const progressPercent = ((stepIdx + 1) / STEPS.length) * 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-hidden pointer-events-auto"
    >
      {/* Dimmed backdrop with soft blur - only closes if clicked directly */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            finishTour();
          }
        }}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px] transition-opacity duration-300"
      />

      {/* Dynamic Animated Spotlight Cutout Ring */}
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

      {/* Smart Space-Managed Civi Mascot Onboarding Card */}
      {/* Positions at top-5 if target is in bottom half, or bottom-5 if target is in top half */}
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
                      {stepIdx + 1} / {STEPS.length}
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
                {STEPS.map((step, idx) => (
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
