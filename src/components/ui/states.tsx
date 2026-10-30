import Link from "next/link";
import { useTranslations } from "next-intl";
import { Inbox, ShieldOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: React.ReactNode;
  body?: React.ReactNode;
  /** Usually a Button or a Link styled with buttonVariants. */
  action?: React.ReactNode;
  className?: string;
  /** Drop the card frame (when already inside a Card). */
  bare?: boolean;
};

export function EmptyState({ icon: Icon = Inbox, title, body, action, className, bare = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-4 py-10 text-center",
        !bare && "rounded-card border border-border bg-surface shadow-sm",
        className,
      )}
    >
      <Icon className="size-7 text-subtle-foreground" strokeWidth={1.5} aria-hidden />
      <h3 className="text-title mt-4 text-lg">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ForbiddenState({ title, body, className }: { title?: React.ReactNode; body?: React.ReactNode; className?: string }) {
  const t = useTranslations("ui");
  return (
    <EmptyState
      icon={ShieldOff}
      title={title ?? t("forbidden.title")}
      body={body ?? t("forbidden.body")}
      className={className}
      action={
        <Link href="/" className={buttonVariants({ variant: "secondary" })}>
          {t("goHome")}
        </Link>
      }
    />
  );
}
