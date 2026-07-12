import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-mono text-sm font-semibold tracking-widest uppercase ring-offset-background transition-all duration-100 focus-visible:outline focus-visible:outline-3 focus-visible:outline-foreground focus-visible:outline-offset-3 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background border-none hover:bg-background hover:text-foreground hover:outline hover:outline-2 hover:outline-foreground",
        destructive: "bg-foreground text-background hover:bg-background hover:text-foreground",
        outline: "border-2 border-foreground bg-transparent hover:bg-foreground hover:text-background",
        secondary: "border border-border bg-secondary text-foreground hover:bg-foreground hover:text-background",
        ghost: "bg-transparent border-none hover:underline underline-offset-4",
        link: "text-primary underline-offset-4 hover:underline border-none",
        issuer: "bg-foreground text-background border-none hover:bg-background hover:text-foreground",
        holder: "bg-foreground text-background border-none hover:bg-background hover:text-foreground",
        verifier: "bg-foreground text-background border-none hover:bg-background hover:text-foreground",
      },
      size: {
        default: "h-11 px-8 py-4",
        sm: "h-9 px-6 text-xs",
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