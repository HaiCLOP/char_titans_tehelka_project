"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Lock,
  Mic,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button, buttonVariants, Card } from "@/components/ui";
import { Civi, type CiviState } from "@/components/mascot/civi";
import { CATEGORIES, type Category } from "@/lib/domain";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, key: "step1" },
  { id: 2, key: "step2" },
  { id: 3, key: "step3" },
  { id: 4, key: "step4" },
  { id: 5, key: "step5" },
] as const;

export function GuideClient({ locale }: { locale: string }) {
  const t = useTranslations("guide");
  const tc = useTranslations("category");
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Simulator state
  const [simCategory, setSimCategory] = useState<Category>("water_supply");
  const [simText, setSimText] = useState(
    locale === "as"
      ? "লৰা ছাত্ৰাৱাসৰ বাথৰুমত যোৱা ২ দিন ধৰি পানীৰ যোগান সম্পূৰ্ণ বন্ধ হৈ আছে।"
      : "No running water in Boys Hostel Block B washrooms since yesterday morning."
  );
  const [simPrivacy, setSimPrivacy] = useState<"public" | "private" | "anonymous">("public");
  const [simulatedResult, setSimulatedResult] = useState<boolean>(false);
  const [simulating, setSimulating] = useState<boolean>(false);

  const getCiviGuidance = (step: number): { state: CiviState; msgEn: string; msgAs: string } => {
    switch (step) {
      case 1:
        return {
          state: "tutorial",
          msgEn: "Picking the most specific category helps the AI route your ticket to the right maintenance engineers in under 5 seconds!",
          msgAs: "নিৰ্দিষ্ট শ্ৰেণী বাছিলে এআইয়ে ৫ ছেকেণ্ডৰ ভিতৰত সঠিক কাৰিকৰী বিভাগলৈ অভিযোগ প্ৰেৰণ কৰে!",
        };
      case 2:
        return {
          state: "thinking",
          msgEn: "Always mention exact room or block numbers. Reports with precise locations get resolved 4× faster by field staff.",
          msgAs: "সঠিক কোঠা বা ব্ল'ক উল্লেখ কৰক। সঠিক স্থান থকা অভিযোগ ৪ গুণ সোনকালে সমাধান হয়।",
        };
      case 3:
        return {
          state: "warning",
          msgEn: "Only take photos of the physical issue (leaks, cracks, broken switchboards). Never photograph faces or ID cards.",
          msgAs: "কেৱল সমস্যাটোৰ ফটো তোলক। কোনো ব্যক্তিৰ মুখ বা পৰিচয় পত্ৰৰ ফটো নিদিব।",
        };
      case 4:
        return {
          state: "speaking",
          msgEn: "Anonymous reports completely separate your identity from the ticket. Even campus administrators cannot see your name.",
          msgAs: "বেনামী অভিযোগত আপোনাৰ নাম কাৰো ওচৰলৈ নাযায়। আনকি প্ৰশাসকেও নাম চাব নোৱাৰে।",
        };
      case 5:
        return {
          state: "success",
          msgEn: "Try the simulator below! You can test our AI triage and duplicate detection safely without submitting a real complaint.",
          msgAs: "তলৰ পৰীক্ষামূলক ছিমুলেটৰত চেষ্টা কৰক! প্ৰকৃত অভিযোগ দাখিল নকৰাকৈ এআই পৰীক্ষা কৰিব পাৰিব।",
        };
      default:
        return {
          state: "idle",
          msgEn: "I'm Civi, your campus grievance guide. Let's make reporting clear and effective!",
          msgAs: "মই চিভি, আপোনাৰ কেম্পাছ সহায়ক। আহক অভিযোগ জনোৱাৰ সঠিক পদ্ধতি শিকোঁ!",
        };
    }
  };

  const guidance = getCiviGuidance(currentStep);

  const runSimulation = () => {
    setSimulating(true);
    setTimeout(() => {
      setSimulating(false);
      setSimulatedResult(true);
    }, 1200);
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <header className="space-y-3 border-b border-border pb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {locale === "as" ? "নিৰ্দেশনা আৰু শিক্ষণ" : "How-to Guide & Interactive Training"}
            </span>
            <h1 className="text-display text-2xl sm:text-4xl mt-1">{t("title")}</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 max-w-2xl">{t("subtitle")}</p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/report"
              className={cn(buttonVariants({ variant: "primary", size: "sm" }), "rounded-full shadow-xs gap-1.5")}
            >
              <span>{locale === "as" ? "পোনপটীয়া অভিযোগ" : "Submit Real Report"}</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* Mascot Greeting Strip */}
        <div className="pt-2">
          <Civi
            state={guidance.state}
            message={guidance.msgEn}
            messageAs={guidance.msgAs}
            size="md"
          />
        </div>
      </header>

      {/* Step Navigation Pill Indicator */}
      <nav aria-label="Tutorial Progress" className="flex items-center justify-between gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
        {STEPS.map((s) => {
          const isActive = currentStep === s.id;
          const isDone = currentStep > s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setCurrentStep(s.id)}
              className={cn(
                "flex-1 min-w-[120px] rounded-xl border p-2.5 text-left transition-all",
                isActive
                  ? "border-primary bg-primary/5 shadow-xs"
                  : isDone
                  ? "border-border/80 bg-surface text-muted-foreground hover:border-border-strong"
                  : "border-border/40 bg-surface-muted/30 text-muted-foreground/60"
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full text-[10px] font-bold",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isDone
                      ? "bg-emerald-500 text-white"
                      : "bg-surface-muted text-muted-foreground"
                  )}
                >
                  {isDone ? <CheckCircle2 className="size-3.5" /> : s.id}
                </span>
                <span className="text-xs font-semibold truncate text-foreground">
                  {t(`${s.key}.title`)}
                </span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Main Step Content Carousel Area */}
      <div className="min-h-[420px]">
        {/* STEP 1: Select the Issue */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-title text-xl">{t("step1.heading")}</h2>
              <p className="text-sm text-muted-foreground">{t("step1.desc")}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {CATEGORIES.map((cat) => (
                <div
                  key={cat}
                  className="rounded-2xl border border-border bg-surface p-4 shadow-xs space-y-2 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-foreground">{tc(cat)}</span>
                    <span className="text-xs font-mono text-muted-foreground">{cat}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t(`step1.examples.${cat}`)}
                  </p>
                </div>
              ))}
            </div>

            <Card className="p-4 bg-surface-muted/40 border-dashed space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                <Sparkles className="size-3.5" />
                <span>{locale === "as" ? "স্বয়ংক্রিয় এআই সাহায্য" : "AI Auto-Classification"}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {locale === "as"
                  ? "যদি আপুনি সঠিক শ্ৰেণীটো নিশ্চিত নহয়, তেন্তে চিন্তা নকৰিব। আমাৰ ইঞ্জিন আপোনাৰ বিৱৰণ পঢ়ি স্বয়ংক্ৰিয়ভাৱে সঠিক বিভাগ নিৰ্ধাৰণ কৰিব পাৰে।"
                  : "If you are unsure of the category, simply describe what you see in plain English or Assamese. Our AI intake router will automatically classify and assign the appropriate department and SLA."}
              </p>
            </Card>
          </div>
        )}

        {/* STEP 2: Describe the Problem */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-title text-xl">{t("step2.heading")}</h2>
              <p className="text-sm text-muted-foreground">{t("step2.desc")}</p>
            </div>

            {/* Side-by-side weak vs strong */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Weak Example */}
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                    <span className="size-2 rounded-full bg-rose-500" />
                    {locale === "as" ? "অস্পষ্ট বিৱৰণ (সমাধানত পলম হয়)" : "Vague Description (Causes Delays)"}
                  </span>
                  <span className="text-xs text-rose-500 font-mono">15% clarity</span>
                </div>

                <div className="rounded-xl border border-rose-200 dark:border-rose-950/40 bg-surface p-3 text-sm italic text-foreground">
                  {locale === "as"
                    ? "“ক্লাছৰূমটো বহুত বেয়া হৈ আছে, অনুগ্ৰহ কৰি ঠিক কৰক।”"
                    : "“The classroom is bad. Please fix it soon.”"}
                </div>

                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                  <li>{locale === "as" ? "কোনটো ভৱন বা কোঠা নম্বৰ উল্লেখ নাই" : "No building name or room number mentioned"}</li>
                  <li>{locale === "as" ? "প্ৰকৃততে কি বিকল (লাইট, ফেন, ডেস্ক) স্পষ্ট নহয়" : "Does not specify what is broken (fan, light, projector?)"}</li>
                  <li>{locale === "as" ? "কৰ্মচাৰীয়ে পৰিদৰ্শন কৰোঁতে বিচাৰি পোৱাত সমস্যা হয়" : "Field staff cannot dispatch parts without prior diagnosis"}</li>
                </ul>
              </div>

              {/* Improved Example */}
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    {locale === "as" ? "আদৰ্শ স্পষ্ট বিৱৰণ (দ্ৰুত সমাধান)" : "Effective Description (Fast Action)"}
                  </span>
                  <span className="text-xs text-emerald-500 font-mono">98% clarity</span>
                </div>

                <div className="rounded-xl border border-emerald-200 dark:border-emerald-950/40 bg-surface p-3 text-sm font-medium text-foreground">
                  {locale === "as"
                    ? "“পদাৰ্থ বিজ্ঞান ভৱনৰ দ্বিতীয় মহলাৰ কোঠা ২০৪ত থকা চিলিং ফেনখন বিগত ৩ দিন ধৰি ঘূৰা নাই আৰু শব্দ কৰি আছে।”"
                    : "“Room 204 on the 2nd floor of the New Academic Block has a damaged ceiling fan that has stopped spinning and hums loudly since Wednesday.”"}
                </div>

                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                  <li>{locale === "as" ? "নিৰ্দিষ্ট ভৱন আৰু কোঠা নম্বৰ অন্তৰ্ভুক্ত" : "Specific building and exact room location provided"}</li>
                  <li>{locale === "as" ? "নিৰ্দিষ্ট সমস্যা আৰু সময়সীমা স্পষ্ট" : "Exact equipment issue and duration clearly stated"}</li>
                  <li>{locale === "as" ? "কাৰিকৰী দল সঠিক সা-সঁজুলি লৈ যাব পাৰে" : "Electrician brings correct replacement capacitor directly"}</li>
                </ul>
              </div>
            </div>

            {/* Checklist Box */}
            <Card className="p-4 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                {locale === "as" ? "লিখাৰ সময়ত ৩টা মূল প্ৰশ্ন মনত ৰাখক:" : "The 3 Critical Details To Include:"}
              </h3>
              <div className="grid gap-2 sm:grid-cols-3 text-xs text-muted-foreground">
                <div className="rounded-xl border border-border p-3 bg-surface-muted/30">
                  <strong className="block text-foreground mb-1">{"1. ক'ত হৈছে? (Where?)"}</strong>
                  {locale === "as" ? "ভৱনৰ নাম, মহলা, আৰু কোঠা নম্বৰ।" : "Building name, floor level, and door/room number."}
                </div>
                <div className="rounded-xl border border-border p-3 bg-surface-muted/30">
                  <strong className="block text-foreground mb-1">2. কি হৈছে? (What?)</strong>
                  {locale === "as" ? "কোনটো যন্ত্ৰ বা স্থান বিকল হৈছে।" : "Which physical item is malfunctioning or hazardous."}
                </div>
                <div className="rounded-xl border border-border p-3 bg-surface-muted/30">
                  <strong className="block text-foreground mb-1">3. কেতিয়াৰ পৰা? (Since when?)</strong>
                  {locale === "as" ? "কেতিয়া সমস্যাটো প্ৰথমে লক্ষ্য কৰিলে।" : "Approximate date or duration the issue has persisted."}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* STEP 3: Add Evidence */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-title text-xl">{t("step3.heading")}</h2>
              <p className="text-sm text-muted-foreground">{t("step3.desc")}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-success uppercase">
                  <CheckCircle2 className="size-4" />
                  <span>{locale === "as" ? "অনুমোদিত প্ৰমাণ" : "Acceptable Evidence"}</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-2 list-disc pl-4">
                  <li>{locale === "as" ? "প্ৰত্যক্ষ পানীৰ পাইপ বা নল চুৰিৰ ফটো" : "Clear, focused photographs of water leaks, cracked plaster, or exposed wiring"}</li>
                  <li>{locale === "as" ? "কেম্পাছৰ পথ বা পথচাৰী পোহৰৰ অৱস্থা" : "Wide-angle photo showing the equipment within its corridor context"}</li>
                  <li>{locale === "as" ? "সৰ্বাধিক ৩খন ফটো (প্ৰতিখন কমপ্ৰেছ কৰা ৱেব-পি)" : "Up to 3 high-resolution photos (auto-compressed on device)"}</li>
                  <li>{locale === "as" ? "কেম্পাছ মানচিত্ৰৰ পিন বা স্থানৰ টোকা" : "Campus map location pin or nearby landmark note"}</li>
                </ul>
              </Card>

              <Card className="p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-danger uppercase">
                  <ShieldAlert className="size-4" />
                  <span>{locale === "as" ? "কঠোৰভাৱে নিষিদ্ধ" : "Privacy & Safety Prohibitions"}</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-2 list-disc pl-4">
                  <li>{locale === "as" ? "ছাত্ৰ-ছাত্ৰী বা কৰ্মচাৰীৰ মুখৰ ফটো নিষিদ্ধ" : "Do not photograph faces of students, workers, or faculty"}</li>
                  <li>{locale === "as" ? "ৰোল নম্বৰ বা ব্যক্তিগত নথি-পত্ৰ নিদিব" : "Do not upload admission slips, ID cards, or personal documents"}</li>
                  <li>{locale === "as" ? "এআই নিৰ্মিত বা ভুৱা ছৱি নল'ব (ছিভিকশ্বিল্ডে নাকচ কৰে)" : "AI-generated or synthetic stock images are blocked by CivicShield"}</li>
                  <li>{locale === "as" ? "অপমানজনক বা আতিশয্যমূলক লেখাৰ প্ৰমাণ নিষিদ্ধ" : "Abusive text or targeted defamatory material will be rejected"}</li>
                </ul>
              </Card>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3 text-xs text-foreground">
              <Camera className="size-5 text-primary shrink-0" />
              <p>
                {locale === "as"
                  ? "আমাৰ প্লেটফৰ্মত আপোনাৰ ডিভাইচৰ ফটো স্বয়ংক্ৰিয়ভাৱে অপ্টিমাইজ কৰা হয় আৰু কোনো ব্যক্তিগত মেটাডাটা বা অৱস্থান বাহিৰলৈ প্ৰকাশ কৰা নহয়।"
                  : "Photos taken through CivicSense are stripped of unnecessary EXIF tracking metadata before upload to protect your privacy."}
              </p>
            </div>
          </div>
        )}

        {/* STEP 4: Privacy Options */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-title text-xl">{t("step4.heading")}</h2>
              <p className="text-sm text-muted-foreground">{t("step4.desc")}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {/* Public */}
              <div className="rounded-2xl border border-border bg-surface p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-lg bg-surface-muted text-foreground">
                    <Eye className="size-4" />
                  </span>
                  <span className="font-bold text-sm text-foreground">
                    {locale === "as" ? "ৰাজহুৱা (Public)" : "Public Report"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {locale === "as"
                    ? "কেম্পাছ মানচিত্ৰ আৰু ডেশ্ববৰ্ডত সকলোৱে দেখিব। আন ছাত্ৰ-ছাত্ৰীয়ে “মইয়ো সমৰ্থন কৰোঁ” (Me too) বুলি সমৰ্থন যোগ কৰিব পাৰে।"
                    : "Visible on the campus feed and live map. Other students can click 'Me too' to boost priority without creating duplicate reports."}
                </p>
                <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  {locale === "as" ? "উপযুক্ত: পানী, পথ, বিজুলী, ছাত্ৰাৱাসৰ সাধাৰণ সমস্যা" : "Best for: Infrastructure, water, streetlights, campus facilities"}
                </div>
              </div>

              {/* Private */}
              <div className="rounded-2xl border border-border bg-surface p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-lg bg-surface-muted text-foreground">
                    <Lock className="size-4" />
                  </span>
                  <span className="font-bold text-sm text-foreground">
                    {locale === "as" ? "ব্যক্তিগত (Private)" : "Private Report"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {locale === "as"
                    ? "কেৱল আপুনি আৰু দায়িত্বপ্ৰাপ্ত বিভাগৰ কৰ্মচাৰীসকলেহে দেখিব। ৰাজহুৱা মানচিত্ৰ বা ফিডত প্ৰকাশ নাপায়।"
                    : "Visible strictly to you and the assigned department officers. Never displayed on the public dashboard or open campus map."}
                </p>
                <div className="text-[11px] font-medium text-primary">
                  {locale === "as" ? "উপযুক্ত: ব্যক্তিগত কোঠাৰ সমস্যা, মাচুল বা প্ৰশাসনিক নথি" : "Best for: Hostel room repairs, administrative matters"}
                </div>
              </div>

              {/* Anonymous */}
              <div className="rounded-2xl border border-border bg-surface p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-lg bg-surface-muted text-foreground">
                    <EyeOff className="size-4" />
                  </span>
                  <span className="font-bold text-sm text-foreground">
                    {locale === "as" ? "বেনামী (Anonymous)" : "Anonymous Report"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {locale === "as"
                    ? "আপোনাৰ নাম আৰু পৰিচয় সম্পূৰ্ণ বিচ্ছিন্ন কৰা হয়। প্ৰশাসনিক ডাটাবেচতো কোনো চিন নাথাকে।"
                    : "Your identity is cryptographically stored in a private ownership table. Even department admins cannot see your name or email."}
                </p>
                <div className="text-[11px] font-medium text-warning">
                  {locale === "as" ? "উপযুক্ত: সুৰক্ষা, ৰেগিং প্ৰতিৰোধ, স্পর্শকাতৰ অভিযোগ" : "Best for: Safety hazards, harassment, sensitive disclosures"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Interactive Simulator */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-title text-xl">{t("step5.heading")}</h2>
              <p className="text-sm text-muted-foreground">{t("step5.desc")}</p>
            </div>

            {/* Interactive Playground Sandbox */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-border/80 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Sparkles className="size-3.5" />
                  <span>{locale === "as" ? "অনুশীলন ছিমুলেটৰ (বাস্তৱ ডাটাবেচত জমা নহয়)" : "Interactive Simulation Sandbox"}</span>
                </span>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                  Sandbox v1.0
                </span>
              </div>

              {/* Category picker in sandbox */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">
                  {locale === "as" ? "১. সমস্যাৰ শ্ৰেণী বাছক:" : "1. Select Category Preset:"}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(["water", "electricity", "infrastructure", "sanitation", "safety"] as Category[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setSimCategory(c);
                        setSimulatedResult(false);
                      }}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                        simCategory === c
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-surface text-muted-foreground border-border hover:text-foreground"
                      )}
                    >
                      {tc(c)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sample text input in sandbox */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">
                  {locale === "as" ? "২. সমস্যাৰ বিৱৰণ লিখক বা পৰীক্ষা কৰক:" : "2. Enter Test Grievance Text:"}
                </label>
                <textarea
                  value={simText}
                  onChange={(e) => {
                    setSimText(e.target.value);
                    setSimulatedResult(false);
                  }}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                />
              </div>

              {/* Privacy option in sandbox */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">
                  {locale === "as" ? "৩. গোপনীয়তা বিকল্প বাছক:" : "3. Choose Privacy Mode:"}
                </label>
                <div className="flex gap-2">
                  {(["public", "private", "anonymous"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSimPrivacy(p)}
                      className={cn(
                        "rounded-xl px-3 py-1.5 text-xs font-medium border capitalize transition-colors",
                        simPrivacy === p
                          ? "bg-foreground text-background border-foreground"
                          : "bg-surface text-muted-foreground border-border hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Simulation Trigger Button */}
              <div className="pt-2 flex items-center gap-3">
                <Button
                  onClick={runSimulation}
                  loading={simulating}
                  variant="primary"
                  className="rounded-full shadow-xs"
                >
                  <Zap aria-hidden />
                  <span>{locale === "as" ? "এআই পৰীক্ষা কৰক" : "Simulate AI Intake & Triage"}</span>
                </Button>
                {simulatedResult && (
                  <Button
                    onClick={() => setSimulatedResult(false)}
                    variant="ghost"
                    size="sm"
                  >
                    <RotateCcw aria-hidden />
                    <span>{locale === "as" ? "পুনৰ চেষ্টা" : "Reset"}</span>
                  </Button>
                )}
              </div>

              {/* Simulated Output Card */}
              {simulatedResult && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" />
                      <span>{locale === "as" ? "এআই নিৰ্ণয় সাজু হৈছে" : "Simulated AI Triage Result"}</span>
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">Confidence: 96%</span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3 text-xs">
                    <div className="rounded-xl border border-border bg-surface p-2.5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                        {locale === "as" ? "অগ্ৰাধিকাৰ" : "Assigned Priority"}
                      </span>
                      <span className="font-bold text-warning text-sm mt-0.5 block">P2 · High</span>
                    </div>

                    <div className="rounded-xl border border-border bg-surface p-2.5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                        {locale === "as" ? "ৰুট কৰা বিভাগ" : "Routed Department"}
                      </span>
                      <span className="font-bold text-foreground text-sm mt-0.5 block">
                        Estate & Water Supply Branch
                      </span>
                    </div>

                    <div className="rounded-xl border border-border bg-surface p-2.5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                        {locale === "as" ? "নিৰ্ধাৰিত সময়সীমা" : "Target SLA"}
                      </span>
                      <span className="font-bold text-foreground text-sm mt-0.5 block">24 Hours</span>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                    {locale === "as"
                      ? "পৰীক্ষা সম্পূৰ্ণ হ'ল! প্ৰকৃত অভিযোগ দাখিল কৰিলে এই তথ্যসমূহ সংশ্লিষ্ট বিভাগৰ কৰ্মচাৰীৰ পৰ্দাত লগে লগে উপস্থিত হ'ব।"
                      : "Simulation complete! In a real report, this ticket would immediately trigger SMS/email notifications to the on-duty engineer."}
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Final Call to Action */}
            <div className="rounded-2xl border border-border bg-surface p-6 text-center space-y-3 shadow-xs">
              <h3 className="text-title text-lg">
                {locale === "as" ? "প্ৰকৃত অভিযোগ দাখিল কৰিবলৈ সাজু?" : "Ready to Report an Issue on Campus?"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {locale === "as"
                  ? "আপোনাৰ সুবিধামতে লিখি বা কণ্ঠধ্বনিৰ (Voice) সহায়ত কেম্পাছৰ সমস্যা কৰ্তৃপক্ষক জনাওক।"
                  : "Help make Dibrugarh University cleaner, safer, and better for everyone. Use standard text or our conversational voice agent."}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <Link
                  href="/report"
                  className={cn(buttonVariants({ variant: "primary" }), "rounded-full shadow-xs gap-1.5")}
                >
                  <FileText className="size-4" />
                  <span>{locale === "as" ? "অভিযোগ ফৰ্ম খোলক" : "Open Report Form"}</span>
                </Link>
                <Link
                  href="/report/voice"
                  className={cn(buttonVariants({ variant: "secondary" }), "rounded-full shadow-xs gap-1.5")}
                >
                  <Mic className="size-4 text-primary" />
                  <span>{locale === "as" ? "ভইচ এজেণ্ট ব্যৱহাৰ কৰক" : "Try Voice Agent"}</span>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step Navigation Controls (Back / Next) */}
      <footer className="flex items-center justify-between border-t border-border pt-4">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={currentStep === 1}
          onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
          className="rounded-full gap-1.5"
        >
          <ArrowLeft className="size-3.5" />
          <span>{locale === "as" ? "পূৰ্বৱৰ্তী" : "Back"}</span>
        </Button>

        <span className="text-xs font-mono text-muted-foreground">
          Step {currentStep} of {STEPS.length}
        </span>

        {currentStep < STEPS.length ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setCurrentStep((prev) => Math.min(STEPS.length, prev + 1))}
            className="rounded-full gap-1.5 shadow-xs"
          >
            <span>{locale === "as" ? "পৰৱৰ্তী" : "Next Step"}</span>
            <ArrowRight className="size-3.5" />
          </Button>
        ) : (
          <Link
            href="/report"
            className={cn(buttonVariants({ variant: "primary", size: "sm" }), "rounded-full gap-1.5 shadow-xs")}
          >
            <span>{locale === "as" ? "অভিযোগ আৰম্ভ কৰক" : "Start Reporting"}</span>
            <ChevronRight className="size-3.5" />
          </Link>
        )}
      </footer>
    </div>
  );
}
