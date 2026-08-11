import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full font-mono text-xs font-semibold uppercase tracking-wider transition-all duration-200",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-white",
        secondary: "border border-border bg-secondary text-secondary-foreground",
        destructive: "border border-destructive/20 bg-destructive/10 text-destructive",
        outline: "border border-border bg-transparent text-foreground",
        success: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        warning: "border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
        error: "border border-destructive/20 bg-destructive/10 text-destructive",
        info: "border border-primary/20 bg-primary/10 text-primary",

        /* Role badges */
        issuer: "bg-issuer text-issuer-foreground",
        issuer_muted: "border border-issuer/30 bg-issuer-muted text-issuer",
        holder: "bg-holder text-holder-foreground",
        holder_muted: "border border-holder/30 bg-holder-muted text-holder",
        verifier: "bg-verifier text-verifier-foreground",
        verifier_muted: "border border-verifier/30 bg-verifier-muted text-verifier",
      },
      size: {
        default: "px-3 py-1",
        sm: "px-2 py-0.5 text-[10px]",
        lg: "px-4 py-1.5 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div 
      className={cn(badgeVariants({ variant, size, className }))} 
      {...props} 
    />
  );
}

export { Badge, badgeVariants };
