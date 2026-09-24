import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-body font-medium text-sm ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 min-h-[44px] rounded-full",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-white shadow-glow-orange hover:from-[#F7931A] hover:to-[#FFD600] hover:shadow-glow-orange-lg hover:scale-[1.03]",
        solid:
          "bg-primary text-primary-foreground shadow-glow-orange hover:bg-primary/90 hover:shadow-glow-orange-lg hover:scale-[1.03]",
        destructive:
          "bg-transparent text-destructive border border-destructive/40 hover:bg-destructive hover:text-destructive-foreground",
        outline:
          "border-2 border-white/20 bg-transparent text-foreground hover:border-white hover:bg-white/10",
        secondary:
          "bg-white/5 border border-white/10 text-foreground hover:bg-white/10 hover:border-white/25",
        ghost:
          "bg-transparent text-muted-foreground hover:bg-white/10 hover:text-[#F7931A]",
        link: "bg-transparent text-primary underline underline-offset-4 hover:brightness-125",
        issuer:
          "bg-issuer/10 border border-issuer/50 text-issuer hover:bg-issuer hover:text-issuer-foreground hover:shadow-[0_0_24px_-6px_rgba(234,88,12,0.6)]",
        holder:
          "bg-holder/10 border border-holder/50 text-holder hover:bg-holder hover:text-holder-foreground hover:shadow-[0_0_24px_-6px_rgba(255,214,0,0.6)]",
        verifier:
          "bg-verifier/10 border border-verifier/50 text-verifier hover:bg-verifier hover:text-verifier-foreground hover:shadow-[0_0_24px_-6px_rgba(247,147,26,0.6)]",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        xl: "h-14 px-10 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };