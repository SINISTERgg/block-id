export const MOTION = {
  EASE: [0.25, 0, 0, 1] as [number, number, number, number],
  DURATION: 0.5,
  STAGGER: 0.08,
  DISTANCE: 20,
} as const;

export const fadeSlide = {
  hidden: { opacity: 0, y: MOTION.DISTANCE },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION.DURATION,
      ease: MOTION.EASE,
    },
  },
} as const;

export const stagger = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: MOTION.STAGGER,
    },
  },
} as const;

export const staggerItem = {
  hidden: { opacity: 0, y: MOTION.DISTANCE },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION.DURATION,
      ease: MOTION.EASE,
    },
  },
} as const;