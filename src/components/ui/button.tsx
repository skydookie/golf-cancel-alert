import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-accent-contrast hover:brightness-110 disabled:opacity-50",
  secondary:
    "bg-surface-elevated text-text-primary border border-border hover:brightness-95 dark:hover:brightness-125 disabled:opacity-50",
  danger: "bg-danger text-white hover:brightness-110 disabled:opacity-50",
  ghost: "text-text-secondary hover:text-text-primary disabled:opacity-50",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:active:scale-100",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
});
