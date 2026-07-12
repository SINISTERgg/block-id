import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center font-mono text-xs font-semibold uppercase tracking-wider transition-all duration-100",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background",
        secondary: "border border-foreground text-foreground bg-transparent",
        destructive: "bg-foreground text-background",
        outline: "border border-foreground text-foreground bg-transparent",
        success: "bg-foreground text-background",
        warning: "border-2 border-foreground text-foreground bg-transparent",
        error: "bg-foreground text-background",
        info: "bg-foreground text-background",
        
        /* Role badges */
        issuer: "bg-foreground text-background",
        issuer_muted: "border border-foreground text-foreground bg-transparent",
        holder: "bg-foreground text-background",
        holder_muted: "border border-foreground text-foreground bg-transparent",
        verifier: "bg-foreground text-background",
        verifier_muted: "border border-foreground text-foreground bg-transparent",
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