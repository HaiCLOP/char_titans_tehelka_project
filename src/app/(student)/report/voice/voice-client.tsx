"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Keyboard,
  Mic,
  RotateCcw,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui";
import { Civi, type CiviState } from "@/components/mascot/civi";
import { type Category, type Visibility } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { useRecorder, useSpeaker } from "@/components/voice/use-voice";

type ConversationStep = "issue" | "location" | "duration" | "review";

interface CollectedData {
  issue: string;
  location: string;
  duration: string;
  category: Category;
  visibility: Visibility;
  anonymous: boolean;
}

export function VoiceClient({ locale }: { locale: string }) {
  const t = useTranslations("voice");
  const tc = useTranslations("category");
  const router = useRouter();

  const [step, setStep] = useState<ConversationStep>("issue");
  const [currentTranscript, setCurrentTranscript] = useState<string>("");
  const [audioFeedback, setAudioFeedback] = useState<boolean>(true);
  const [data, setData] = useState<CollectedData>({
    issue: "",
    location: "",
    duration: "",
    category: "infrastructure",
    visibility: "public",
    anonymous: false,
  });
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Speech goes through the Go engine (Gemini, free tier), which understands Assamese; the browser's own
  // recognition rarely does. Civi's prompts are spoken with the engine's TTS, falling back to the browser.
  const lang = locale === "as" ? "as" : "en";
  const recorder = useRecorder(lang, (text) => setCurrentTranscript((cur) => (cur.trim() ? `${cur.trim()} ${text}` : text)));
  const speaker = useSpeaker(lang);
  const isListening = recorder.state === "recording";
  const transcribing = recorder.state === "transcribing";
  const speechSupported = recorder.supported;
  const tv = useTranslations("voiceEngine");
  const recorderError = recorder.error ? tv(`errors.${recorder.error}`) : null;

  const speak = (text: string) => {
    if (audioFeedback) void speaker.speak(text);
  };

  const getStepPrompt = (s: ConversationStep) => {
    switch (s) {
      case "issue":
        return {
          en: "Hello! What issue or problem did you notice on campus today?",
          as: "নমস্কাৰ! আজি আপুনি কেম্পাছত কি সমস্যা বা অসুবিধা দেখা পাইছে?",
        };
      case "location":
        return {
          en: "Got it. Where is this located? Please mention the building, room, or hostel block.",
          as: "বুজি পালোঁ। এইটো ক'ত অৱস্থিত? অনুগ্ৰহ কৰি ভৱনৰ নাম বা হোষ্টেল ব্ল'ক উল্লেখ কৰক।",
        };
      case "duration":
        return {
          en: "Thanks. How long has this problem persisted, and is it causing any urgent safety hazards?",
          as: "ধন্যবাদ। এই সমস্যাটো কেতিয়াৰ পৰা হৈছে, আৰু ই কোনো জৰুৰী বিপদৰ সৃষ্টি কৰিছে নেকি?",
        };
      case "review":
        return {
          en: "Here is your structured report. Please review the details below before we submit it to maintenance.",
          as: "আপোনাৰ অভিযোগ প্ৰস্তুত হৈছে। ৰক্ষণাবেক্ষণ বিভাগলৈ প্ৰেৰণ কৰাৰ আগতে তলৰ তথ্যসমূহ পৰীক্ষা কৰক।",
        };
    }
  };

  const currentPrompt = getStepPrompt(step);

  const startListening = () => {
    setErrorMsg(null);
    speaker.cancel();
    void recorder.start();
  };

  const stopListening = () => recorder.stop();

  const handleStepProceed = () => {
    const text = currentTranscript.trim();
    if (!text && step !== "review") {
      setErrorMsg(locale === "as" ? "অনুগ্ৰহ কৰি কিবা এটা কওক বা লিখক।" : "Please speak or type a response first.");
      return;
    }

    if (step === "issue") {
      setData((prev) => ({ ...prev, issue: text }));
      setStep("location");
      setCurrentTranscript("");
      speak(getStepPrompt("location")[locale === "as" ? "as" : "en"]);
    } else if (step === "location") {
      setData((prev) => ({ ...prev, location: text }));
      setStep("duration");
      setCurrentTranscript("");
      speak(getStepPrompt("duration")[locale === "as" ? "as" : "en"]);
    } else if (step === "duration") {
      setData((prev) => {
        // Simple heuristic for category from issue text
        const lower = (prev.issue + " " + text).toLowerCase();
        let cat: Category = "infrastructure";
        if (lower.includes("water") || lower.includes("পানী") || lower.includes("pipe") || lower.includes("leak")) cat = "water_supply";
        else if (lower.includes("light") || lower.includes("fan") || lower.includes("বিজুলী") || lower.includes("electric")) cat = "electrical";
        else if (lower.includes("clean") || lower.includes("garbage") || lower.includes("শৌচাগাৰ") || lower.includes("ডাষ্টবিন")) cat = "sanitation";
        else if (lower.includes("dog") || lower.includes("dark") || lower.includes("বিপদ") || lower.includes("safety")) cat = "safety_security";
        return { ...prev, duration: text, category: cat };
      });
      setStep("review");
      setCurrentTranscript("");
      speak(getStepPrompt("review")[locale === "as" ? "as" : "en"]);
    }
  };

  const getCiviState = (): CiviState => {
    if (submitting) return "thinking";
    if (isListening) return "listening";
    if (transcribing) return "thinking";
    if (step === "review") return "success";
    return "speaking";
  };

  const handleFinalSubmit = async () => {
    setSubmitting(true);
    setErrorMsg(null);

    const fullDescription = `${data.issue.trim()}\n\nLocation context: ${data.location.trim()}\nDuration: ${data.duration.trim()}`;

    // Store in sessionStorage and navigate to /report for final standard confirmation
    try {
      sessionStorage.setItem("cs_report_draft", fullDescription);
      router.push("/report");
    } catch {
      setSubmitting(false);
      setErrorMsg("Could not initiate submission. Please try standard form.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="space-y-2 border-b border-border pb-5">
        <div className="flex items-center justify-between">
          <Link
            href="/report"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>{locale === "as" ? "সাধাৰণ ফৰ্মলৈ উভতি যাওক" : "Back to standard form"}</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAudioFeedback(!audioFeedback)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Toggle voice feedback"
            >
              {audioFeedback ? <Volume2 className="size-3.5 text-primary" /> : <VolumeX className="size-3.5" />}
              <span className="text-[11px]">{audioFeedback ? "Voice On" : "Voice Off"}</span>
            </button>
          </div>
        </div>

        <h1 className="text-display text-2xl sm:text-3xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {/* Mascot Conversational Stage */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-surface via-surface to-surface-muted/30 p-6 sm:p-8 shadow-sm space-y-6 text-center">
        {/* Animated Civi Agent */}
        <div className="flex justify-center">
          <Civi
            state={getCiviState()}
            size="lg"
            message={currentPrompt[locale === "as" ? "as" : "en"]}
          />
        </div>

        {/* Step Progress Pills */}
        <div className="flex items-center justify-center gap-2">
          {(["issue", "location", "duration", "review"] as const).map((s, idx) => (
            <span
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                step === s ? "w-8 bg-primary" : idx < (["issue", "location", "duration", "review"].indexOf(step)) ? "w-4 bg-emerald-500" : "w-3 bg-border"
              )}
            />
          ))}
        </div>

        {/* Interactive Speech Action Area (Steps 1 to 3) */}
        {step !== "review" && (
          <div className="space-y-4 max-w-lg mx-auto">
            {/* Live Audio Input Button */}
            {speechSupported ? (
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  disabled={transcribing}
                  className={cn(
                    "relative grid size-20 place-items-center rounded-full border shadow-md transition-all",
                    isListening
                      ? "border-emerald-500 bg-emerald-500 text-white scale-110 shadow-emerald-500/30"
                      : "border-border bg-surface text-foreground hover:border-primary/50 hover:scale-105"
                  )}
                  aria-label={isListening ? "Stop listening" : "Start speaking"}
                >
                  {isListening && (
                    <span className="absolute inset-0 rounded-full animate-ping bg-emerald-400 opacity-40" />
                  )}
                  {isListening ? <Mic className="size-8" /> : <Mic className="size-8 text-primary" />}
                </button>

                <p className="text-xs font-semibold text-muted-foreground">
                  {isListening ? tv("listening") : transcribing ? tv("transcribing") : tv("tapToSpeak")}
                </p>
                {recorderError && <p role="alert" className="text-xs font-medium text-danger">{recorderError}</p>}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface-muted/50 p-3 text-xs text-muted-foreground flex items-center gap-2 justify-center">
                <Keyboard className="size-4" />
                <span>
                  {tv("errors.unsupported")}
                </span>
              </div>
            )}

            {/* Editable Transcript / Text Box */}
            <div className="relative text-left">
              <label htmlFor="voice-transcript" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                {locale === "as" ? "আপোনাৰ উত্তৰ (প্ৰয়োজন অনুসৰি সম্পাদনা কৰক):" : "Your Answer (Editable):"}
              </label>
              <textarea
                id="voice-transcript"
                rows={3}
                value={currentTranscript}
                onChange={(e) => setCurrentTranscript(e.target.value)}
                placeholder={
                  step === "issue"
                    ? locale === "as" ? "যেনে: কেন্টিনৰ সমুখত লাইট জ্বলা নাই..." : "e.g. Ceiling fan in Room 204 is sparking..."
                    : step === "location"
                    ? locale === "as" ? "যেনে: নতুন বিজ্ঞান ভৱন, ২য় মহলা..." : "e.g. New Academic Block, 2nd floor corridor..."
                    : locale === "as" ? "যেনে: বিগত ২ দিন ধৰি..." : "e.g. Started 2 days ago..."
                }
                className="w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>

            {errorMsg && (
              <p className="text-xs text-danger font-medium animate-in fade-in">{errorMsg}</p>
            )}

            {/* Next Step Button */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={handleStepProceed}
                variant="primary"
                className="rounded-full shadow-xs gap-1.5"
              >
                <span>{locale === "as" ? "পৰৱৰ্তী পদক্ষেপ" : "Continue"}</span>
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: Review and Confirm Report */}
        {step === "review" && (
          <div className="space-y-5 max-w-xl mx-auto text-left">
            <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-border/80 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <span>{locale === "as" ? "সংগৃহীত তথ্যসমূহ পৰীক্ষা কৰক" : "Structured Report Summary"}</span>
                </span>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {tc(data.category)}
                </span>
              </div>

              {/* Editable Summary Fields */}
              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-bold text-muted-foreground block text-[11px] uppercase">
                    {locale === "as" ? "মূল সমস্যা:" : "Reported Problem:"}
                  </span>
                  <input
                    type="text"
                    value={data.issue}
                    onChange={(e) => setData({ ...data, issue: e.target.value })}
                    className="w-full mt-1 rounded-lg border border-border bg-surface-muted/30 px-3 py-2 text-foreground font-medium outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <span className="font-bold text-muted-foreground block text-[11px] uppercase">
                    {locale === "as" ? "স্থান:" : "Location Details:"}
                  </span>
                  <input
                    type="text"
                    value={data.location}
                    onChange={(e) => setData({ ...data, location: e.target.value })}
                    className="w-full mt-1 rounded-lg border border-border bg-surface-muted/30 px-3 py-2 text-foreground font-medium outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <span className="font-bold text-muted-foreground block text-[11px] uppercase">
                    {locale === "as" ? "সময়সীমা / স্থায়িত্ব:" : "Duration & Urgency:"}
                  </span>
                  <input
                    type="text"
                    value={data.duration}
                    onChange={(e) => setData({ ...data, duration: e.target.value })}
                    className="w-full mt-1 rounded-lg border border-border bg-surface-muted/30 px-3 py-2 text-foreground font-medium outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Privacy selector */}
              <div className="border-t border-border/80 pt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {locale === "as" ? "গোপনীয়তা:" : "Privacy:"}
                </span>
                <div className="flex gap-1.5">
                  {(["public", "private"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setData({ ...data, visibility: p })}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] font-medium border capitalize transition-colors",
                        data.visibility === p
                          ? "bg-foreground text-background border-foreground"
                          : "bg-surface text-muted-foreground border-border hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {errorMsg && (
              <p className="text-xs text-danger font-medium">{errorMsg}</p>
            )}

            {/* Final Action Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setStep("issue");
                  setCurrentTranscript("");
                }}
                className="rounded-full gap-1.5"
              >
                <RotateCcw className="size-3.5" />
                <span>{locale === "as" ? "নতুনকৈ আৰম্ভ কৰক" : "Start Over"}</span>
              </Button>

              <Button
                variant="primary"
                onClick={handleFinalSubmit}
                loading={submitting}
                className="rounded-full shadow-xs gap-1.5"
              >
                <Send className="size-3.5" />
                <span>{locale === "as" ? "অনুমোদন আৰু দাখিল কৰক" : "Confirm & Submit Report"}</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
