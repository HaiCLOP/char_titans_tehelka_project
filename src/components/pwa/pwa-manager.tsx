"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import { WifiOff, Wifi } from "lucide-react";

function subscribeOnline(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getSnapshot() {
  return !navigator.onLine;
}

function getServerSnapshot() {
  return false;
}

export function PwaManager() {
  const locale = useLocale();
  const isOffline = useSyncExternalStore(subscribeOnline, getSnapshot, getServerSnapshot);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    // Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => console.log("[PWA] Service Worker registered"))
        .catch((err) => console.warn("[PWA] Service Worker registration failed:", err));
    }

    let timer: NodeJS.Timeout;
    const handleOnline = () => {
      setShowRestored(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShowRestored(false), 4000);
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      clearTimeout(timer);
    };
  }, []);

  if (!isOffline && !showRestored) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      {isOffline ? (
        <>
          <span className="grid size-5 place-items-center rounded-full bg-danger-soft text-danger">
            <WifiOff className="size-3" strokeWidth={2} />
          </span>
          <span>
            {locale === "as"
              ? "ইণ্টাৰনেট সংযোগ বিচ্ছিন্ন। আপোনাৰ খচৰা সুৰক্ষিত আছে।"
              : "No connection. Working offline — drafts saved locally."}
          </span>
        </>
      ) : (
        <>
          <span className="grid size-5 place-items-center rounded-full bg-success/20 text-success">
            <Wifi className="size-3" strokeWidth={2} />
          </span>
          <span>
            {locale === "as"
              ? "ইণ্টাৰনেট সংযোগ পুনৰুদ্ধাৰ হ'ল।"
              : "Connection restored."}
          </span>
        </>
      )}
    </div>
  );
}
