import { motion, type HTMLMotionProps } from "framer-motion";
import { ReactNode } from "react";
import { MOTION, fadeSlide, stagger, staggerItem } from "@/lib/motion";

interface FadeInProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  delay?: number;
  className?: string;
}

const FadeIn = ({ children, delay = 0, className, ...props }: FadeInProps) => (
  <motion.div
    initial={{ opacity: 0, y: MOTION.DISTANCE }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: MOTION.DURATION, delay, ease: MOTION.EASE }}
    className={className}
    {...props}
  >
    {children}
  </motion.div>
);

interface StaggerProps {
  children: ReactNode;
  className?: string;
}

const Stagger = ({ children, className }: StaggerProps) => (
  <motion.div
    variants={stagger}
    initial="hidden"
    animate="visible"
    className={className}
  >
    {children}
  </motion.div>
);

const StaggerItem = ({ children, className }: StaggerProps) => (
  <motion.div variants={staggerItem} className={className}>
    {children}
  </motion.div>
);

export { FadeIn, Stagger, StaggerItem, fadeSlide, stagger };