import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full border-0 border-b-2 border-foreground bg-background px-0 py-2 font-mono text-sm ring-offset-background",
          "placeholder:text-muted-foreground italic",
          "focus-visible:outline-none focus-visible:border-b-4",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-all duration-100",
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