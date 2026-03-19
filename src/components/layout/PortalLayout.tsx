import { ReactNode, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, LogOut, Menu, X, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/NotificationBell";
import { motion, AnimatePresence } from "framer-motion";
import ParticleBackground from "@/components/ui/ParticleBackground";
import ThemeToggle from "@/components/ui/ThemeToggle";

interface PortalLayoutProps {
  children: ReactNode;
  title: string;
  portalType: "issuer" | "holder" | "verifier";
  icon: ReactNode;
  navItems: { label: string; path: string }[];
}

const PortalLayout = ({ children, title, portalType, icon, navItems }: PortalLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Subtle particle background */}
      <ParticleBackground particleCount={25} className="opacity-30" />
      <div className="absolute inset-0 mesh-gradient pointer-events-none" />

      <header className="glass-header px-4 sm:px-6 py-3 sticky top-0 z-50 relative">
        <div className="container mx-auto flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 sm:gap-3"
          >
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="shrink-0 rounded-xl">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="relative">
                {icon}
                <div
                  className="absolute -inset-1 rounded-full blur-md -z-10 animate-glow-pulse"
                  style={{ backgroundColor: `hsla(var(--${portalType}), 0.2)` }}
                />
              </div>
              <span className="font-display text-base sm:text-lg font-semibold tracking-tight">{title}</span>
            </div>
          </motion.div>
          <div className="flex items-center gap-2 sm:gap-3">
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <motion.button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    className="relative px-4 py-2 text-sm font-medium rounded-xl transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {isActive && (
                      <motion.div
                        layoutId={`nav-${portalType}`}
                        className="absolute inset-0 rounded-xl"
                        style={{ backgroundColor: `hsla(var(--${portalType}-muted))` }}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                      />
                    )}
                    <span className="relative z-10" style={isActive ? { color: `hsl(var(--${portalType}))` } : {}}>
                      {item.label}
                    </span>
                  </motion.button>
                );
              })}
            </nav>
            <Button variant="ghost" size="icon" onClick={() => navigate("/explorer")} className="shrink-0 rounded-xl" title="Blockchain Explorer">
              <Link2 className="h-4 w-4" />
            </Button>
            <NotificationBell />
            <ThemeToggle className="shrink-0 rounded-xl" />
            <div className="hidden sm:flex items-center gap-2 border-l border-border/50 pl-3">
              <span className="text-xs text-muted-foreground">{profile?.full_name}</span>
              <Button variant="ghost" size="icon" onClick={() => signOut().then(() => navigate("/"))} className="rounded-xl">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="md:hidden rounded-xl" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-border/30 mt-3 pt-3 pb-2 space-y-1 overflow-hidden"
            >
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setMobileMenuOpen(false); }}
                    className="block w-full text-left px-3 py-2.5 text-sm font-medium rounded-xl transition-colors"
                    style={isActive ? { color: `hsl(var(--${portalType}))`, backgroundColor: `hsla(var(--${portalType}-muted))` } : { color: "hsl(var(--muted-foreground))" }}
                  >
                    {item.label}
                  </button>
                );
              })}
              <div className="flex items-center justify-between px-3 py-2 border-t border-border/30 mt-2 pt-2">
                <span className="text-xs text-muted-foreground">{profile?.full_name}</span>
                <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => signOut().then(() => navigate("/"))}>
                  <LogOut className="h-4 w-4 mr-1" /> Sign Out
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
      <main className="flex-1 container mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10">{children}</main>
    </div>
  );
};

export default PortalLayout;
