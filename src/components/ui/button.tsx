import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em] whitespace-nowrap transition-[background-color,box-shadow,transform,opacity] duration-200 ease-out-expo select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/85",
        secondary: "border border-border bg-surface text-foreground shadow-sm hover:border-border-strong hover:bg-surface-muted",
        ghost: "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
        soft: "bg-surface-muted text-foreground hover:bg-surface-sunken",
        danger: "bg-danger text-white shadow-sm hover:bg-danger/90",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-[1.125rem] text-sm",
        lg: "h-12 px-6 text-[0.9375rem]",
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
