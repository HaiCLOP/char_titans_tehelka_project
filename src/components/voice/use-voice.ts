"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/components/api-client";

/**
 * Civi's ears and voice. Recording uses MediaRecorder and is transcribed by the Go engine (Gemini, free tier),
 * which handles Assamese, unlike most browsers' built-in recognition. Speech plays the engine's WAV and falls
 * back to the browser's speechSynthesis when the engine is unavailable.
 */

export type RecorderState = "idle" | "recording" | "transcribing";
export type RecorderError = "denied" | "unsupported" | "failed" | "empty" | "rate_limited";

const MAX_RECORD_MS = 60_000;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

const toDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export function useRecorder(lang: "en" | "as", onText: (text: string) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<RecorderError | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => { onTextRef.current = onText; }, [onText]);

  const supported = typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && pickMime() !== null;

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (rec.current?.state === "recording") rec.current.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const mime = pickMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) {
      setError("unsupported");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("denied");
      return;
    }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: (r.mimeType || "audio/webm").split(";")[0] });
      if (blob.size < 1500) {
        setState("idle");
        setError("empty");
        return;
      }
      setState("transcribing");
      try {
        const res = await apiFetch<{ text: string; lang: "en" | "as" }>("/api/voice/stt", {
          method: "POST",
          json: { audio: await toDataURL(blob), lang },
        });
        if (res.text.trim()) onTextRef.current(res.text.trim());
        else setError("empty");
      } catch (e) {
        setError(e instanceof ApiError && e.code === "RATE_LIMITED" ? "rate_limited" : "failed");
      } finally {
        setState("idle");
      }
    };
    rec.current = r;
    r.start();
    setState("recording");
    timer.current = setTimeout(stop, MAX_RECORD_MS);
  }, [lang, stop]);

  useEffect(() => () => stop(), [stop]);

  return { state, error, supported, start, stop };
}

/** Plays Civi's line. Returns a stop function. */
export function useSpeaker(lang: "en" | "as") {
  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<string, string>());
  const [speaking, setSpeaking] = useState(false);

  const cancel = useCallback(() => {
    audio.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const browserSpeak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "as" ? "as-IN" : "en-IN";
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }, [lang]);

  const speak = useCallback(async (text: string) => {
    cancel();
    const line = text.trim().slice(0, 600);
    if (!line) return;
    try {
      let url = urls.current.get(line);
      if (!url) {
        const res = await fetch("/api/voice/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: line }) });
        if (!res.ok) throw new Error(String(res.status));
        url = URL.createObjectURL(await res.blob());
        urls.current.set(line, url);
      }
      audio.current?.pause();
      const a = new Audio(url);
      a.addEventListener("ended", () => setSpeaking(false));
      audio.current = a;
      setSpeaking(true);
      await a.play();
    } catch {
      browserSpeak(line);
    }
  }, [browserSpeak, cancel]);

  useEffect(() => {
    const map = urls.current;
    return () => {
      audio.current?.pause();
      map.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  return { speak, cancel, speaking };
}
