import { ReactNode, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, LogOut, Menu, X, Link2, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/NotificationBell";
import { motion, AnimatePresence } from "framer-motion";
import ParticleBackground from "@/components/ui/ParticleBackground";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { isOrgAdmin } from "@/lib/permissions";

interface PortalLayoutProps {
  children: ReactNode;
  title: string;
  portalType: "issuer" | "holder" | "verifier";
  icon: ReactNode;
  navItems: { label: string; path: string }[];
}

const PORTAL_LABELS: Record<string, string> = {
  issuer: "Issuer Portal",
  holder: "Holder Wallet",
  verifier: "Verifier Portal",
};

const PORTAL_BADGE_CLASS: Record<string, string> = {
  issuer: "bg-[hsl(var(--issuer-muted))] text-[hsl(var(--issuer))] border-[hsl(var(--issuer))]/20",
  holder: "bg-[hsl(var(--holder-muted))] text-[hsl(var(--holder))] border-[hsl(var(--holder))]/20",
  verifier: "bg-[hsl(var(--verifier-muted))] text-[hsl(var(--verifier))] border-[hsl(var(--verifier))]/20",
};

const PortalLayout = ({ children, title, portalType, icon, navItems }: PortalLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, role, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const adminUser = isOrgAdmin(role);

  // Initials avatar
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "U";

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
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
            <div className="flex items-center gap-2.5">
              <div className="relative">
                {icon}
                <div
                  className="absolute -inset-1 rounded-full blur-md -z-10 animate-glow-pulse"
                  style={{ backgroundColor: `hsla(var(--${portalType}), 0.2)` }}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-display text-base sm:text-lg font-semibold tracking-tight leading-none">
                  {title}
                </span>
                {/* Portal type pill */}
                <Badge
                  variant="outline"
                  className={`text-[10px] leading-3 px-1.5 py-0.5 w-fit border font-medium ${PORTAL_BADGE_CLASS[portalType]}`}
                >
                  {PORTAL_LABELS[portalType]}
                </Badge>
              </div>
            </div>
          </motion.div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Desktop nav */}
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

            {/* Blockchain Explorer */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/explorer")}
              className="shrink-0 rounded-xl"
              title="Blockchain Explorer"
            >
              <Link2 className="h-4 w-4" />
            </Button>

            {/* Admin button — gold gradient */}
            {adminUser && (
              <motion.button
                onClick={() => navigate("/admin")}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                title="Organization Admin"
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 border ${
                  location.pathname.startsWith("/admin")
                    ? "bg-gradient-to-r from-amber-500/20 to-amber-400/10 text-amber-600 border-amber-500/30 shadow-sm"
                    : "bg-amber-500/8 text-amber-600/70 border-amber-500/15 hover:bg-amber-500/15 hover:text-amber-600 hover:border-amber-500/25"
                }`}
              >
                <Crown className="h-3.5 w-3.5" />
                <span className="hidden sm:block">Admin</span>
              </motion.button>
            )}

            <NotificationBell />
            <ThemeToggle className="shrink-0 rounded-xl" />

            {/* User info + avatar */}
            <div className="hidden sm:flex items-center gap-2.5 border-l border-border/50 pl-3">
              {/* Initials circle */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-semibold text-xs"
                style={{
                  backgroundColor: `hsla(var(--${portalType}-muted))`,
                  color: `hsl(var(--${portalType}))`,
                  border: `1.5px solid hsl(var(--${portalType}) / 0.25)`,
                }}
              >
                {initials}
              </div>
              <div className="flex flex-col">
                {profile?.organization && (
                  <span className="text-[10px] text-muted-foreground leading-none truncate max-w-[100px]">
                    {profile.organization}
                  </span>
                )}
                <span className="text-xs font-medium text-foreground leading-tight truncate max-w-[100px]">
                  {profile?.full_name}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => signOut().then(() => navigate("/"))}
                className="rounded-xl h-8 w-8"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden rounded-xl"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
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
                    style={
                      isActive
                        ? { color: `hsl(var(--${portalType}))`, backgroundColor: `hsla(var(--${portalType}-muted))` }
                        : { color: "hsl(var(--muted-foreground))" }
                    }
                  >
                    {item.label}
                  </button>
                );
              })}
              <div className="flex items-center justify-between px-3 py-2 border-t border-border/30 mt-2 pt-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{
                      backgroundColor: `hsla(var(--${portalType}-muted))`,
                      color: `hsl(var(--${portalType}))`,
                    }}
                  >
                    {initials}
                  </div>
                  <span className="text-xs text-muted-foreground">{profile?.full_name}</span>
                </div>
                <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => signOut().then(() => navigate("/"))}>
                  <LogOut className="h-4 w-4 mr-1" /> Sign Out
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10">
        {children}
      </main>
    </div>
  );
};

export default PortalLayout;
