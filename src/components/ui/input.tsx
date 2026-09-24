import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-lg border-b-2 border-white/15 bg-black/40 px-4 py-2 font-mono text-sm text-foreground ring-offset-background",
          "placeholder:text-white/30",
          "focus-visible:outline-none focus-visible:border-[#F7931A] focus-visible:shadow-glow-input",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-all duration-200",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };