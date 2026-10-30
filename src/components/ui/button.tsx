import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:brightness-95",
        secondary: "border border-border bg-surface text-foreground shadow-sm hover:bg-surface-muted",
        ghost: "text-foreground hover:bg-surface-muted",
        soft: "bg-primary-soft text-primary hover:brightness-95",
        danger: "bg-p1 text-white shadow-sm hover:brightness-110 active:brightness-95",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
        "icon-sm": "size-8",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Shows a spinner, disables the button and sets aria-busy. */
    loading?: boolean;
  };

/** For links styled as buttons use `className={buttonVariants({ variant })}` on `<Link>`. */
export function Button({ className, variant, size, block, loading = false, disabled, children, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
