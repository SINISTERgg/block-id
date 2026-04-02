import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "blockid-theme";

interface ThemeToggleProps {
  className?: string;
}

const ThemeToggle = ({ className }: ThemeToggleProps) => {
  const [isDark, setIsDark] = useState(() => {
    // Task #15: Read persisted preference, fall back to system/class check
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark") return true;
    if (stored === "light") return false;
    return document.documentElement.classList.contains("dark");
  });

  // Sync initial state on mount (in case stored value differs from class)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" && !document.documentElement.classList.contains("dark")) {
      document.documentElement.classList.add("dark");
    } else if (stored === "light" && document.documentElement.classList.contains("dark")) {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const applyTheme = () => {
    document.documentElement.classList.toggle("dark");
    const newIsDark = document.documentElement.classList.contains("dark");
    setIsDark(newIsDark);
    // Task #15: Persist to localStorage
    localStorage.setItem(STORAGE_KEY, newIsDark ? "dark" : "light");
  };

  const toggleTheme = async () => {
    document.documentElement.classList.add("theme-switching");

    if (document.startViewTransition) {
      const transition = document.startViewTransition(() => {
        applyTheme();
      });
      await transition.finished.catch(() => undefined);
    } else {
      applyTheme();
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }

    document.documentElement.classList.remove("theme-switching");
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={className ?? "rounded-xl"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className="relative flex h-4 w-4 items-center justify-center overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isDark ? "sun" : "moon"}
            initial={{ opacity: 0, rotate: -90, scale: 0.6, y: 6 }}
            animate={{ opacity: 1, rotate: 0, scale: 1, y: 0 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.6, y: -6 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="absolute"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </motion.span>
        </AnimatePresence>
      </span>
    </Button>
  );
};

export default ThemeToggle;
