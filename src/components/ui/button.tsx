import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-mono text-sm font-semibold tracking-wider uppercase ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 min-h-[44px]",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-primary-foreground border-none shadow-[0_0_20px_-5px_rgba(234,88,12,0.5)] hover:scale-[1.03] hover:shadow-[0_0_30px_-5px_rgba(247,147,26,0.6)]",
        destructive:
          "bg-destructive text-destructive-foreground border-none hover:bg-destructive/90",
        outline:
          "border-2 border-border bg-transparent text-foreground hover:border-foreground/70 hover:bg-foreground/5",
        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost:
          "bg-transparent border-none text-foreground hover:bg-foreground/10 hover:text-[#F7931A]",
        link: "text-[#F7931A] underline-offset-4 hover:underline border-none bg-transparent",
        issuer:
          "bg-gradient-to-r from-[#9A3412] to-[#EA580C] text-white border-none shadow-[0_0_20px_-5px_rgba(234,88,12,0.5)] hover:scale-[1.03]",
        holder:
          "bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-white border-none shadow-[0_0_20px_-5px_rgba(234,88,12,0.5)] hover:scale-[1.03]",
        verifier:
          "bg-gradient-to-r from-[#F7931A] to-[#FFD600] text-[#030304] border-none shadow-[0_0_20px_-5px_rgba(247,147,26,0.5)] hover:scale-[1.03]",
      },
      size: {
        default: "h-11 px-7",
        sm: "h-9 px-5 text-xs",
        lg: "h-14 px-10 text-base",
        xl: "h-16 px-12 text-lg",
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
