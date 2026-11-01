"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  PlusCircle,
  Mic,
  Building2,
  Compass,
  X,
  ChevronUp,
  HelpCircle,
} from "lucide-react";
import { Civi, type CiviPose } from "./civi";

interface PageAdvice {
  pose: CiviPose;
  tipEn: string;
  tipAs: string;
}

const PAGE_ADVICE: Record<string, PageAdvice> = {
  "/": {
    pose: "hero",
    tipEn: "Spotted a problem on campus? Snap a photo or write a quick note to get it fixed!",
    tipAs: "কেম্পাছত সমস্যা দেখিলে ফটো তোলক বা চমু বিৱৰণ লিখি দাখিল কৰক!",
  },
  "/report": {
    pose: "helping",
    tipEn: "Need privacy? Toggle Anonymous mode. Adding room or building names helps staff fix it faster!",
    tipAs: "গোপনীয়তা লাগে? বেনামী বিকল্প বাছক। কোঠা বা ভৱনৰ নাম দিলে কৰ্মচাৰীয়ে ক্ষিপ্ৰ সমাধান কৰিব পাৰে!",
  },
  "/report/voice": {
    pose: "learning",
    tipEn: "Speak naturally in Assamese or English — I'm listening and converting it to your report!",
    tipAs: "অসমীয়া বা ইংৰাজীত স্পষ্টকৈ কওক — মই শুনি আছোঁ আৰু আপোনাৰ অভিযোগ প্ৰস্তুত কৰিছোঁ!",
  },
  "/map": {
    pose: "thinking",
    tipEn: "Here are verified campus reports across Dibrugarh University. Click any marker for details.",
    tipAs: "ডিব্ৰুগড় বিশ্ববিদ্যালয় চৌহদৰ সক্ৰিয় কামসমূহ ইয়াত পাব। তথ্য চাবলৈ মাৰ্কাৰত টিপক।",
  },
  "/pulse": {
    pose: "learning",
    tipEn: "Campus Pulse shows university-wide average fix times and department resolution rates live.",
    tipAs: "কেম্পাছ পালছত বিশ্ববিদ্যালয়ৰ সমাধানৰ গড় সময় আৰু বিভাগৰ কাৰ্যক্ষমতা লাইভ প্ৰদৰ্শিত হৈছে।",
  },
  "/departments": {
    pose: "helping",
    tipEn: "Inspect each department's transparent score, office hours, and emergency response contacts.",
    tipAs: "প্ৰতিটো বিভাগৰ স্বচ্ছ স্ক'ৰ, কাৰ্যালয়ৰ সময়, আৰু জৰুৰীকালীন যোগাযোগ নম্বৰ ইয়াত চাওক।",
  },
  "/my": {
    pose: "hero",
    tipEn: "Track all your submitted complaints here. You'll receive live status alerts when staff act on them.",
    tipAs: "আপোনাৰ সকলো অভিযোগ ইয়াত অনুসৰণ কৰক। স্থিতি সলনি হ'লে আপুনি জাননী পাব।",
  },
};

export function CiviCompanion() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();

  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // Pick contextual advice based on route
  const advice =
    PAGE_ADVICE[pathname] ||
    (pathname.startsWith("/departments/")
      ? {
          pose: "helping" as CiviPose,
          tipEn: "Check this department's 4-factor transparent score: SLA compliance, volume, and ratings.",
          tipAs: "এই বিভাগৰ ৪টা মূল সূচক চাওক: এছ.এল.এ. গতি, সমাধানৰ পৰিমাণ, আৰু ৰেটিং।",
        }
      : pathname.startsWith("/c/")
      ? {
          pose: "thinking" as CiviPose,
          tipEn: "Live tracking active! University staff must provide resolution photo proof before closing.",
          tipAs: "লাইভ অনুসৰণ সক্ৰিয়! সমস্যা সমাধান হ'লে কৰ্মচাৰীয়ে ফটো প্ৰমাণ আপলোড কৰিব লাগিব।",
        }
      : {
          pose: "hero" as CiviPose,
          tipEn: "I'm Civi, your campus assistant! Tap me anytime you need guidance around CivicSense.",
          tipAs: "মই চিভি, কেম্পাছ সহচৰ! চিভিকচেন্স ব্যৱহাৰৰ বাবে যিকোনো সময়তে মোক টিপক।",
        });

  const [prevPath, setPrevPath] = useState(pathname);
  const [bubbleVisible, setBubbleVisible] = useState(true);

  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setBubbleVisible(true);
  }

  // Auto-hide brief speech bubble after 7 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setBubbleVisible(false);
    }, 7000);
    return () => clearTimeout(timer);
  }, [pathname]);

  const triggerTour = () => {
    window.dispatchEvent(new CustomEvent("civicsense:open-civi-tour"));
    setExpanded(false);
  };

  const tipText = locale === "as" ? advice.tipAs : advice.tipEn;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-40 grid size-12 place-items-center rounded-full border border-border bg-surface text-foreground shadow-lg hover:scale-105 active:scale-95 transition-all"
        title="Open Civi Assistant"
        aria-label="Open Civi Assistant"
      >
        <Civi pose="hero" size="sm" interactive={false} />
      </button>
    );
  }

  return (
    <aside
      aria-label="Civi Campus Assistant"
      className="fixed bottom-4 right-4 z-40 flex flex-col items-end pointer-events-none"
    >
      <div className="pointer-events-auto">
        <AnimatePresence>
          {expanded ? (
            /* Expanded Companion Panel */
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-3xl border border-border bg-surface p-4 shadow-xl dark:shadow-black/50"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Civi pose={advice.pose} size="sm" interactive={false} />
                  <div>
                    <h3 className="text-xs font-bold text-foreground">
                      {locale === "as" ? "চিভি — কেম্পাছ সহচৰ" : "Civi — Campus Assistant"}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                      <span className="text-[10px] text-muted-foreground">
                        {locale === "as" ? "সহায়ৰ বাবে প্ৰস্তুত" : "Always here to help"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMinimized(true)}
                    className="rounded-full p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
                    title="Minimize"
                    aria-label="Minimize"
                  >
                    <ChevronUp className="size-3.5 rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="rounded-full p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
                    title="Close"
                    aria-label="Close"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Current Context Tip */}
              <div className="my-3 rounded-2xl border border-border/80 bg-surface-muted/50 p-3 text-xs leading-relaxed text-foreground">
                <div className="flex items-start gap-2">
                  <Sparkles className="size-3.5 shrink-0 text-primary mt-0.5" />
                  <p className="text-xs text-muted-foreground font-medium">{tipText}</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="space-y-1.5 pt-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                  {locale === "as" ? "দ্ৰুত সহায়:" : "Quick actions:"}
                </span>

                <button
                  type="button"
                  onClick={triggerTour}
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors text-left"
                >
                  <span className="flex items-center gap-2">
                    <Compass className="size-3.5 text-primary" />
                    <span>{locale === "as" ? "কেম্পাছ পৰিচিতি ভ্ৰমণ চাওক" : "Take App Tour"}</span>
                  </span>
                  <span className="text-[10px] font-semibold text-primary">Start</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExpanded(false);
                    router.push("/report");
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors text-left"
                >
                  <span className="flex items-center gap-2">
                    <PlusCircle className="size-3.5 text-primary" />
                    <span>{locale === "as" ? "নতুন অভিযোগ দাখিল কৰক" : "Report an Issue"}</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExpanded(false);
                    router.push("/report/voice");
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors text-left"
                >
                  <span className="flex items-center gap-2">
                    <Mic className="size-3.5 text-primary" />
                    <span>{locale === "as" ? "ভয়েচ এছিষ্টেণ্টৰে কওক" : "Voice Reporting"}</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExpanded(false);
                    router.push("/departments");
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors text-left"
                >
                  <span className="flex items-center gap-2">
                    <Building2 className="size-3.5 text-primary" />
                    <span>{locale === "as" ? "বিভাগসমূহৰ ডাইৰেক্টৰি" : "Department Directory"}</span>
                  </span>
                </button>
              </div>
            </motion.div>
          ) : (
            /* Floating Mascot Badge with Speech Bubble */
            <div className="flex items-end gap-2.5">
              {bubbleVisible && (
                <motion.div
                  initial={{ opacity: 0, x: 8, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="relative max-w-[240px] rounded-2xl border border-border bg-surface p-2.5 text-xs text-foreground shadow-lg leading-snug"
                >
                  <p className="line-clamp-2 text-[11px] font-medium text-muted-foreground">{tipText}</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBubbleVisible(false);
                    }}
                    className="absolute -top-1.5 -left-1.5 grid size-4 place-items-center rounded-full bg-surface-muted border border-border text-muted-foreground hover:text-foreground"
                    aria-label="Dismiss tip"
                  >
                    <X className="size-2.5" />
                  </button>
                </motion.div>
              )}

              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="group relative grid size-14 place-items-center rounded-full border border-border bg-surface shadow-xl hover:scale-105 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Chat with Civi, your campus assistant"
                title="Tap to talk with Civi"
              >
                <Civi
                  pose={advice.pose}
                  size="md"
                  interactive={false}
                  className="drop-shadow-xs"
                />
                <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold shadow-xs">
                  <HelpCircle className="size-2.5" />
                </span>
              </button>
            </div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}
