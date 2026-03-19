import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface GlassCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  className?: string;
  glowColor?: "primary" | "issuer" | "holder" | "verifier";
  interactive?: boolean;
  delay?: number;
}

const GlassCard = ({
  children,
  className,
  glowColor,
  interactive = true,
  delay = 0,
  ...props
}: GlassCardProps) => {
  const glowClass = glowColor ? `glow-${glowColor}` : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={interactive ? { y: -4, transition: { duration: 0.25 } } : undefined}
      className={cn(
        "glass-card rounded-2xl p-6",
        glowColor && `hover:${glowClass}`,
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default GlassCard;
