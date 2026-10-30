import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-card border border-border bg-surface p-5 shadow-sm sm:p-6", className)} {...props} />;
}

type CardHeaderProps = Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Right-aligned slot (e.g. "View all" link). */
  action?: React.ReactNode;
  as?: "h2" | "h3";
};

export function CardHeader({ title, description, icon, action, as: H = "h2", className, ...props }: CardHeaderProps) {
  return (
    <div className={cn("mb-5 flex items-start justify-between gap-3", className)} {...props}>
      <div className="min-w-0">
        <H className="text-title flex items-center gap-2 text-[1.0625rem]">
          {icon}
          {title}
        </H>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
