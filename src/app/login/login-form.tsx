"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, Loader2, Mail, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Props = { next: string | null; callbackError: boolean };
type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function callbackUrl(next: string | null) {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || window.location.origin;
  const url = new URL("/auth/callback", base);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

function GoogleMark() {
  // Monochrome "G" (currentColor) so it follows the theme tokens.
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="currentColor"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.3 0-6-2.74-6-6.2s2.7-6.2 6-6.2c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.8 3.17 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12S6.6 21.8 12 21.8c5.65 0 9.4-3.97 9.4-9.57 0-.64-.07-1.13-.16-1.62H12z"
      />
    </svg>
  );
}

export function LoginForm({ next, callbackError }: Props) {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>(callbackError ? { kind: "error", message: t("errorCallback") } : { kind: "idle" });
  const [googlePending, setGooglePending] = useState(false);

  const errorMessage = (status?: number) => (status === 429 ? t("rateLimited") : t("errorGeneric"));

  async function signInWithGoogle() {
    setGooglePending(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(next) },
    });
    // On success the browser navigates away; only errors come back here.
    if (error) {
      setGooglePending(false);
      toast.error(errorMessage(error.status));
    }
  }

  async function sendMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setState({ kind: "error", message: t("invalidEmail") });
      return;
    }
    setState({ kind: "sending" });
    const { error } = await createClient().auth.signInWithOtp({
      email: value,
      options: { emailRedirectTo: callbackUrl(next), shouldCreateUser: true },
    });
    if (error) {
      const message = errorMessage(error.status);
      setState({ kind: "error", message });
      toast.error(message);
      return;
    }
    setState({ kind: "sent", email: value });
  }

  if (state.kind === "sent") {
    return (
      <div className="text-center" role="status" aria-live="polite">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <h2 className="mt-3 font-semibold">{t("sentTitle")}</h2>
        <p className="mt-2 break-words text-sm text-muted-foreground">{t("sentBody", { email: state.email })}</p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
        >
          <ArrowLeft className="size-4" aria-hidden /> {t("useAnother")}
        </button>
      </div>
    );
  }

  const sending = state.kind === "sending";
  const busy = sending || googlePending;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:bg-surface-muted disabled:opacity-60"
      >
        {googlePending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <GoogleMark />}
        {googlePending ? t("redirecting") : t("google")}
      </button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={sendMagicLink} noValidate className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="login-email">
          {t("emailLabel")}
        </label>
        <input
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state.kind === "error") setState({ kind: "idle" });
          }}
          placeholder={t("emailPlaceholder")}
          aria-invalid={state.kind === "error"}
          aria-describedby={state.kind === "error" ? "login-error" : undefined}
          className="w-full rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        />
        {state.kind === "error" && (
          <p id="login-error" role="alert" className="flex items-start gap-2 text-sm text-p1">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
        >
          {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Mail className="size-4" aria-hidden />}
          {sending ? t("sending") : t("sendLink")}
        </button>
      </form>
    </div>
  );
}
