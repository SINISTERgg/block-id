import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-mono text-xs font-semibold uppercase tracking-[0.15em] ring-offset-background transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 min-h-[44px]",
  {
    variants: {
      variant: {
        default:
          "bg-transparent text-foreground hover:text-primary underline-brand",
        solid:
          "bg-foreground text-background hover:bg-primary hover:text-background",
        destructive:
          "bg-transparent text-destructive hover:bg-destructive hover:text-background",
        outline:
          "border border-border bg-transparent text-foreground hover:border-primary hover:text-primary",
        secondary:
          "bg-transparent text-muted-foreground hover:text-foreground underline-brand",
        ghost:
          "bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        link: "bg-transparent text-primary underline-brand-solid",
        issuer:
          "bg-transparent text-issuer hover:bg-issuer hover:text-issuer-foreground",
        holder:
          "bg-transparent text-holder hover:bg-holder hover:text-holder-foreground",
        verifier:
          "bg-transparent text-verifier hover:bg-verifier hover:text-verifier-foreground",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-9 px-4 text-[0.6875rem]",
        lg: "h-14 px-9 text-sm",
        xl: "h-16 px-12 text-base",
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