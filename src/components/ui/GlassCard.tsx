import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import { MOTION } from "@/lib/motion";

interface GlassCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  className?: string;
  glowColor?: "primary" | "issuer" | "holder" | "verifier";
  interactive?: boolean;
  delay?: number;
}

const GLOW_BORDER: Record<string, string> = {
  primary: "border-primary",
  issuer: "border-issuer",
  holder: "border-holder",
  verifier: "border-verifier",
};

const GlassCard = ({
  children,
  className,
  glowColor,
  interactive = true,
  delay = 0,
  ...props
}: GlassCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: MOTION.DISTANCE }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: MOTION.DURATION, delay, ease: MOTION.EASE }}
      whileHover={interactive ? { y: -3, transition: { duration: 0.25 } } : undefined}
      className={cn(
        "glass-card p-6 border-l-2",
        glowColor && GLOW_BORDER[glowColor],
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default GlassCard;