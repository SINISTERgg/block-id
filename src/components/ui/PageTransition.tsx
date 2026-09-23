import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";
import { MOTION } from "@/lib/motion";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

const pageVariants = {
  initial: {
    opacity: 0,
    y: MOTION.DISTANCE,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION.DURATION,
      ease: MOTION.EASE,
      staggerChildren: MOTION.STAGGER,
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.2 },
  },
};

const itemVariants = {
  initial: { opacity: 0, y: MOTION.DISTANCE },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION.DURATION,
      ease: MOTION.EASE,
    },
  },
};

const PageTransition = ({ children, className = "" }: PageTransitionProps) => (
  <motion.div
    variants={pageVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    className={className}
  >
    {children}
  </motion.div>
);

export const PageItem = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <motion.div variants={itemVariants} className={className}>
    {children}
  </motion.div>
);

export default PageTransition;