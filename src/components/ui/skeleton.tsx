import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-border/40 bg-muted/70 before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-[linear-gradient(90deg,transparent_0%,hsl(var(--background)/0.45)_50%,transparent_100%)]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
