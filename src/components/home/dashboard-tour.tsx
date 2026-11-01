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
    pose: "hero",
    titleEn: "1. Quick Grievance Composer",
    titleAs: "১. দ্ৰুত অভিযোগ দাখিল",
    badgeEn: "Start Here",
    badgeAs: "ইয়াত আৰম্ভ কৰক",
    textEn: "Report any problem right here! Write in English or Assamese, or tap quick starters like Water or Power. Our AI automatically classifies the issue and routes it directly to the responsible university department.",
    textAs: "হোষ্টেল বা বিভাগৰ যিকোনো সমস্যা ইয়াত লিখক! পানী বা বিজুলীৰ দৰে শ্ৰেণী বাছক। আমাৰ এআই-য়ে সমস্যা চিনাক্ত কৰি নিমিষতে বিশ্ববিদ্যালয়ৰ সঠিক বিভাগলৈ প্ৰেৰণ কৰিব।",
  },
  {
    targetId: "tour-photo-btn",
    pose: "helping",
    titleEn: "2. Attach Visual Evidence",
    titleAs: "২. ফটো সংলগ্ন কৰক",
    badgeEn: "Evidence Proof",
    badgeAs: "প্ৰমাণ সংলগ্ন",
    textEn: "A photo is worth a thousand words! Click here to attach a picture of the damaged bench, leaking pipe, or dark street. Visual proof helps maintenance staff diagnose and fix it much faster.",
    textAs: "ফটো দিলে কাম ক্ষিপ্ৰ হয়! ভঙা ডেস্ক, পানী ওলোৱা নল বা আন্ধাৰ পথৰ ফটো তুলি দিয়ক। কৰ্মচাৰীসকলে সমস্যাটো সহজে বুজি সোনকালে মেৰামতি কৰিব পাৰিব।",
  },
  {
    targetId: "tour-kpis",
    pose: "thinking",
    titleEn: "3. Live University Numbers",
    titleAs: "৩. লাইভ কেম্পাছ সংখ্যা",
    badgeEn: "Live Metrics",
    badgeAs: "লাইভ সংখ্যা",
    textEn: "Real numbers, completely transparent! Check how many issues are Open, Being Fixed, and Resolved this week, plus the university's average fix time in real-time.",
    textAs: "সম্পূৰ্ণ স্বচ্ছ বিশ্ববিদ্যালয়ৰ পৰিসংখ্যা! কিমান অভিযোগ মুকলি আছে, কিমানত কাম চলি আছে আৰু গড় সমাধানৰ সময় কিমান — সকলো লাইভ সংখ্যা ইয়াত চাওক।",
  },
  {
    targetId: "tour-ai-brief",
    pose: "learning",
    titleEn: "4. AI Campus Daily Brief",
    titleAs: "৪. দৈনিক এআই কেম্পাছ ব্ৰিফ",
    badgeEn: "AI Summary",
    badgeAs: "এআই সাৰাংশ",
    textEn: "Every morning, our AI engine synthesizes urgent maintenance priorities and progress across Dibrugarh University into actionable daily briefs for students and administration.",
    textAs: "প্ৰতিদিনে পুৱা আমাৰ এআই ইঞ্জিনে বিশ্ববিদ্যালয়ৰ সকলো গুৰুত্বপূৰ্ণ সমস্যা আৰু সমাধানৰ অগ্ৰগতি বিশ্লেষণ কৰি এই সাৰাংশ প্ৰস্তুত কৰে।",
  },
  {
    targetId: "tour-issue-feed",
    pose: "happy",
    titleEn: "5. All Issues & 'Me Too' Upvotes",
    titleAs: "৫. সকলো অভিযোগ আৰু সমৰ্থন",
    badgeEn: "Community Feed",
    badgeAs: "ৰাজহুৱা তালিকা",
    textEn: "Browse all reported grievances across campus. If someone already reported your problem, click 'Me too' to add your support instead of creating duplicate clutter!",
    textAs: "কেম্পাছৰ সকলো অভিযোগ ইয়াত চাওক। কোনোবাই ইতিমধ্যে একে সমস্যা দিছে যদি 'মোৰো একে সমস্যা' বুটামত টিপি সমৰ্থন জনাওক, পুনৰ নকৈ অভিযোগ দিয়াৰ প্ৰয়োজন নাই!",
  },
  {
    targetId: "tour-sidebar",
    pose: "celebrating",
    titleEn: "6. Campus Map, Pulse & Departments",
    titleAs: "৬. কেম্পাছ মেপ, পালছ আৰু বিভাগসমূহ",
    badgeEn: "Explore All",
    badgeAs: "চৌহদ অন্বেষণ",
    textEn: "Use the floating menu to explore the live Campus Map, track department fix rates on Pulse, or check emergency numbers in Departments. I'm always floating nearby if you need help!",
    textAs: "কেম্পাছৰ লাইভ মানচিত্ৰ, বিভাগৰ কাৰ্যক্ষমতা আৰু জৰুৰীকালীন যোগাযোগ নম্বৰ চাবলৈ এই মেনু ব্যৱহাৰ কৰক। যিকোনো সহায়ৰ বাবে মই সদায় আপোনাৰ কাষতেই আছোঁ!",
  },
];

export function DashboardTour() {
  const locale = useLocale();
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const prevTargetRef = useRef<HTMLElement | null>(null);

  // Auto-launch on first visit
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

  // Update highlight position and scroll target into view
  const updateHighlight = useCallback(() => {
    if (!active) return;
    const step = STEPS[stepIdx];
    if (!step) return;

    // Remove highlight class from previous target
    if (prevTargetRef.current) {
      prevTargetRef.current.classList.remove("tour-active-highlight");
    }

    const el = document.getElementById(step.targetId);
    if (el) {
      prevTargetRef.current = el;
      el.classList.add("tour-active-highlight");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const rect = el.getBoundingClientRect();
      setHighlightRect(rect);
    } else {
      setHighlightRect(null);
    }
  }, [active, stepIdx]);

  useEffect(() => {
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
  }, [updateHighlight]);

  const finishTour = () => {
    if (prevTargetRef.current) {
      prevTargetRef.current.classList.remove("tour-active-highlight");
    }
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "true");
    } catch {}
    setActive(false);
  };

  if (!active) return null;

  const current = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;
  const title = locale === "as" ? current.titleAs : current.titleEn;
  const text = locale === "as" ? current.textAs : current.textEn;
  const badge = locale === "as" ? current.badgeAs : current.badgeEn;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-hidden pointer-events-auto"
    >
      {/* Dimmed backdrop */}
      <div
        onClick={finishTour}
        className="absolute inset-0 bg-black/60 backdrop-blur-2xs transition-opacity duration-300"
      />

      {/* Spotlight cutout / glow ring over active element */}
      {highlightRect && (
        <div
          style={{
            top: `${highlightRect.top - 6}px`,
            left: `${highlightRect.left - 6}px`,
            width: `${highlightRect.width + 12}px`,
            height: `${highlightRect.height + 12}px`,
          }}
          className="absolute rounded-2xl pointer-events-none ring-4 ring-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] transition-all duration-300 z-30"
        />
      )}

      {/* Civi Mascot Onboarding Card (Positioned centered or near element) */}
      <div className="fixed inset-x-4 bottom-6 sm:bottom-10 z-40 flex justify-center pointer-events-none">
        <motion.div
          key={stepIdx}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="pointer-events-auto w-full max-w-lg rounded-3xl border border-border bg-surface p-4 sm:p-5 shadow-2xl"
        >
          {/* Card Header with Civi Mascot */}
          <div className="flex items-start gap-3.5">
            {/* Pure Vector SVG Mascot Avatar */}
            <div className="shrink-0 p-1 rounded-2xl border border-border/80 bg-surface-muted/50 shadow-2xs">
              <CiviSvg pose={current.pose} size={74} />
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <Sparkles className="size-2.5" />
                  <span>{badge}</span>
                </span>

                <span className="text-[11px] font-mono text-muted-foreground">
                  {stepIdx + 1} / {STEPS.length}
                </span>

                <button
                  type="button"
                  onClick={finishTour}
                  className="rounded-full p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors ml-auto"
                  aria-label="Skip tour"
                >
                  <X className="size-4" />
                </button>
              </div>

              <h3 className="font-bold text-sm sm:text-base text-foreground tracking-tight">
                {title}
              </h3>

              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                {text}
              </p>
            </div>
          </div>

          {/* Step Progress Dots & Navigation Controls */}
          <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setStepIdx(idx)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-200",
                    idx === stepIdx
                      ? "w-6 bg-foreground"
                      : "w-2 bg-border-strong hover:bg-muted-foreground"
                  )}
                  aria-label={`Jump to tour step ${idx + 1}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={finishTour}
                className="text-xs text-muted-foreground hover:text-foreground h-8 px-2.5"
              >
                {locale === "as" ? "প্ৰস্থান" : "Skip"}
              </Button>

              {stepIdx > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setStepIdx((s) => s - 1)}
                  className="gap-1 text-xs h-8 px-2.5"
                >
                  <ArrowLeft className="size-3" />
                  <span>{locale === "as" ? "পিছলৈ" : "Back"}</span>
                </Button>
              )}

              {isLast ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={finishTour}
                  className="gap-1.5 text-xs font-bold h-8 px-3 shadow-xs"
                >
                  <span>{locale === "as" ? "বুজিলোঁ, আৰম্ভ কৰক" : "Got it, let's go!"}</span>
                  <Check className="size-3.5" />
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setStepIdx((s) => s + 1)}
                  className="gap-1.5 text-xs font-bold h-8 px-3 shadow-xs"
                >
                  <span>{locale === "as" ? "পৰৱৰ্তী" : "Next"}</span>
                  <ArrowRight className="size-3" />
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
