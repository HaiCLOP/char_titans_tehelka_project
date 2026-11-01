"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  PlusCircle,
  Mic,
  Building2,
  Compass,
  X,
  ChevronUp,
  ClipboardList,
  MessagesSquare,
  Map,
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
  "/admin": {
    pose: "hero",
    tipEn: "Welcome to Ops! Keep an eye on overdue SLA tickets and assign unassigned P1/P2 emergencies.",
    tipAs: "কাৰ্য কেন্দ্ৰলৈ স্বাগতম! সময়সীমা পাৰ হোৱা অভিযোগ আৰু দায়িত্বহীন জৰুৰী কামবোৰ আগতীয়াকৈ দায়িত্ব দিয়ক।",
  },
  "/admin/queue": {
    pose: "helping",
    tipEn: "Triage Queue: Filter by status, assign field staff, and inspect duplicate reports.",
    tipAs: "কাৰ্য তালিকা: অৱস্থা অনুসৰি বাছক আৰু ক্ষেত্ৰ মেৰামতি কৰ্মীক দ্ৰুত দায়িত্ব দিয়ক।",
  },
  "/admin/agent": {
    pose: "learning",
    tipEn: "Ask CivicSense AI Agent about recurring hostel complaints, SLA bottlenecks, and workloads.",
    tipAs: "হোষ্টেল বা বিভাগৰ সমস্যাৰ আৰ্হি আৰু কৰ্মচাৰীৰ কাৰ্যভাৰ জানিবলৈ এআই এজেন্টক সোধক।",
  },
  "/admin/map": {
    pose: "thinking",
    tipEn: "Geographic incident clustering: zoom into specific campus zones to spot maintenance hotspots.",
    tipAs: "স্থানিক সমস্যা নিৰীক্ষণ: বিশেষ ভৱন বা হোষ্টেলত জুম কৰি সমস্যাৰ কেন্দ্ৰবিন্দু চাওক।",
  },
};

export function CiviCompanion() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("mascot");
  const rootRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ right: 16, bottom: 16 });
  const positionRef = useRef(position);
  const dragRef = useRef<{ x: number; y: number; right: number; bottom: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const place = (right: number, bottom: number) => {
    const size = rootRef.current?.getBoundingClientRect();
    const next = { right: Math.max(12, Math.min(right, window.innerWidth - (size?.width ?? 72) - 12)), bottom: Math.max(12, Math.min(bottom, window.innerHeight - (size?.height ?? 72) - 12)) };
    positionRef.current = next;
    setPosition(next);
  };
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem("cs_civi_position") ?? "null"); if (saved && Number.isFinite(saved.right) && Number.isFinite(saved.bottom)) place(saved.right, saved.bottom); } catch {}
    const resize = () => place(positionRef.current.right, positionRef.current.bottom);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => { place(positionRef.current.right, positionRef.current.bottom); }, [expanded, minimized]);
  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    suppressClick.current = false;
    setBubbleVisible(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, ...positionRef.current, moved: false };
  };
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    if (drag.moved) place(drag.right - dx, drag.bottom - dy);
  };
  const endDrag = () => {
    suppressClick.current = dragRef.current?.moved ?? false;
    dragRef.current = null;
    try { localStorage.setItem("cs_civi_position", JSON.stringify(positionRef.current)); } catch {}
  };

  const isAdmin = pathname.startsWith("/admin");

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
      : pathname.startsWith("/admin/t/")
      ? {
          pose: "helping" as CiviPose,
          tipEn: "Review complaint details, attach internal work notes, update status, and track SLA countdown.",
          tipAs: "অভিযোগৰ সবিশেষ চাওক, আভ্যন্তৰীণ মন্তব্য যোগ কৰক, স্থিতি সলনি কৰক আৰু এছএলএ সময় নিৰীক্ষণ কৰক।",
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
    if (isAdmin) {
      window.dispatchEvent(new CustomEvent("civicsense:open-admin-tour"));
    } else if (pathname === "/") {
      window.dispatchEvent(new CustomEvent("civicsense:open-civi-tour"));
    } else {
      router.push("/?tour=true");
    }
    setExpanded(false);
  };

  const tipText = locale === "as" ? advice.tipAs : advice.tipEn;


  return (
    <aside
      ref={rootRef}
      style={position}
      aria-label={t("assistant")}
      className="fixed z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end pointer-events-none"
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
              className="mb-2 max-h-[calc(100dvh-2rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-3xl border border-border bg-surface p-4 shadow-xl dark:shadow-black/50"
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
                    <span>
                      {isAdmin
                        ? locale === "as"
                          ? "পৰিচালনা ভ্ৰমণ চাওক"
                          : "Take Ops Tour"
                        : locale === "as"
                        ? "কেম্পাছ পৰিচিতি ভ্ৰমণ চাওক"
                        : "Take App Tour"}
                    </span>
                  </span>
                  <span className="text-[10px] font-semibold text-primary">Start</span>
                </button>

                {isAdmin ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setExpanded(false);
                        router.push("/admin/queue");
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors text-left"
                    >
                      <span className="flex items-center gap-2">
                        <ClipboardList className="size-3.5 text-primary" />
                        <span>{locale === "as" ? "কাৰ্য তালিকা (Triage)" : "Triage Queue"}</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setExpanded(false);
                        router.push("/admin/agent");
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors text-left"
                    >
                      <span className="flex items-center gap-2">
                        <MessagesSquare className="size-3.5 text-primary" />
                        <span>{locale === "as" ? "এআই এজেন্টক সোধক" : "Ask AI Agent"}</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setExpanded(false);
                        router.push("/admin/map");
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors text-left"
                    >
                      <span className="flex items-center gap-2">
                        <Map className="size-3.5 text-primary" />
                        <span>{locale === "as" ? "চৌহদ মানচিত্ৰ" : "Campus Map"}</span>
                      </span>
                    </button>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </motion.div>
          ) : (
            /* Minimized/Collapsed Floating Pill with Brief Speech Bubble */
            <div className="flex items-end gap-2">
              <AnimatePresence>
                {bubbleVisible && !minimized && (
                  <motion.div
                    initial={{ opacity: 0, x: 10, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.18 }}
                    onClick={() => setExpanded(true)}
                    className="max-w-[220px] sm:max-w-xs cursor-pointer rounded-2xl border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground shadow-lg dark:shadow-black/40 hover:bg-surface-muted transition-colors"
                  >
                    <p className="line-clamp-2 leading-relaxed">{tipText}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="button"
                onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setMinimized(false); setExpanded(true); }}
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="relative flex min-h-12 min-w-12 touch-none select-none items-center justify-center bg-transparent p-1 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={t("dragHint")}
                aria-label={t("dragHint")}
              >
                <Civi pose={advice.pose} size={minimized ? "sm" : "md"} interactive={false} />

              </button>
            </div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}
