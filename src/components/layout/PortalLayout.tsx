import { ReactNode, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, LogOut, Menu, X, Link2, Crown, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/NotificationBell";
import { isOrgAdmin } from "@/lib/permissions";

interface PortalLayoutProps {
  children: ReactNode;
  title: string;
  portalType: "issuer" | "holder" | "verifier";
  icon: ReactNode;
  navItems: { label: string; path: string }[];
}

const PORTAL_COLORS = {
  issuer: {
    accent: "text-issuer",
    border: "border-issuer",
    bg: "bg-issuer",
    text: "text-issuer-foreground",
    soft: "bg-issuer/10",
  },
  holder: {
    accent: "text-holder",
    border: "border-holder",
    bg: "bg-holder",
    text: "text-holder-foreground",
    soft: "bg-holder/10",
  },
  verifier: {
    accent: "text-verifier",
    border: "border-verifier",
    bg: "bg-verifier",
    text: "text-verifier-foreground",
    soft: "bg-verifier/10",
  },
};

const PortalLayout = ({ children, title, portalType, icon, navItems }: PortalLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, role, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const adminUser = isOrgAdmin(role);
  const colors = PORTAL_COLORS[portalType];

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "U";

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = clock.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const date = clock.toLocaleDateString("en-US", { month: "short", day: "2-digit" });

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header — telemetry strip */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="shrink-0">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Back to Home</TooltipContent>
              </Tooltip>

              <div className="flex items-center gap-3">
                {/* Brand node — glowing liquidity node */}
                <div className={`relative w-9 h-9 ${colors.bg} rounded-xl flex items-center justify-center shadow-[0_0_18px_-4px_rgba(247,147,26,0.5)]`}>
                  <span className="text-base leading-none">{icon}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-heading text-base font-bold uppercase tracking-tight leading-none">
                    {title}
                  </span>
                  <span className={`font-mono text-[9px] uppercase tracking-[0.22em] ${colors.accent}`}>
                    {portalType}
                  </span>
                </div>
              </div>
            </div>

            {/* Right cluster — status + nav on desktop */}
            <div className="flex items-center gap-3">
              {/* Status telemetry (desktop) */}
              <div className="hidden lg:flex items-center gap-4 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  <span className="relative inline-flex h-1.5 w-1.5">
                    <span className={`absolute inline-flex h-full w-full rounded-full ${colors.bg} opacity-60 animate-ping`} />
                    <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${colors.bg}`} />
                  </span>
                  Live Session
                </span>
                <span className="h-3 w-px bg-border" />
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{time}</span>
                <span className="h-3 w-px bg-border" />
                <span className="font-mono text-[10px] text-muted-foreground uppercase">{date}</span>
              </div>

              <div className="hidden lg:flex items-center gap-1">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className={`px-3 py-2 rounded-full font-mono text-[10px] font-semibold uppercase tracking-[0.16em] transition-all duration-200 ${
                        isActive
                          ? `${colors.accent} bg-white/5`
                          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                      }`}
                    >
                      {isActive && <span className={`mr-1.5 ${colors.accent}`}>/</span>}
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {portalType !== "verifier" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => navigate("/explorer")} className="shrink-0">
                      <Link2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Blockchain Explorer</TooltipContent>
                </Tooltip>
              )}

              {adminUser && (
                <button
                  onClick={() => navigate("/admin")}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors duration-200 ${
                    location.pathname.startsWith("/admin")
                      ? colors.accent
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Crown className="h-3.5 w-3.5" />
                  <span className="hidden sm:block">Admin</span>
                </button>
              )}

              <NotificationBell />

              {/* User node */}
              <div className="hidden md:flex items-center gap-2.5 border-l border-border pl-3">
                <div className={`w-8 h-8 rounded-full border ${colors.border} flex items-center justify-center font-mono font-bold text-[11px] ${colors.accent} shadow-[0_0_14px_-4px_rgba(247,147,26,0.4)]`}>
                  {initials}
                </div>
                <div className="hidden xl:block">
                  <p className="text-xs font-semibold leading-tight">{profile?.full_name}</p>
                  {profile?.organization && (
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground leading-tight truncate max-w-[110px]">
                      {profile.organization}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => signOut().then(() => navigate("/"))} className="h-8 w-8">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>

              {/* Mobile Menu Toggle */}
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-border mt-3 pt-3 pb-4 space-y-3">
              <nav className="flex flex-col gap-2">
                {navItems.map((item, i) => {
                  const isActive = location.pathname === item.path;
                  return (
<button
                  key={item.path}
                  onClick={() => { navigate(item.path); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                    isActive ? `border-l-2 ${colors.border} bg-white/5` : "border border-white/10"
                  }`}
                >
                      <span className={`font-mono text-[10px] ${isActive ? colors.accent : "text-muted-foreground"}`}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-mono text-sm font-semibold uppercase tracking-[0.12em]">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </nav>
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full border ${colors.border} flex items-center justify-center font-mono font-bold text-xs ${colors.accent}`}>
                    {initials}
                  </div>
                  <span className="text-sm font-semibold">{profile?.full_name}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => signOut().then(() => navigate("/"))}>
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </Button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex w-full max-w-[1400px] mx-auto">
        {/* Index rail — editorial numbered nav (desktop) */}
        <aside className="hidden lg:flex flex-col justify-between w-56 shrink-0 border-r border-border px-0 py-8">
          <nav className="space-y-1">
            <p className="px-6 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground mb-4">
              {title} / Index
            </p>
            {navItems.map((item, i) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`group w-full flex items-center gap-4 px-6 py-3 border-l-2 text-left transition-all duration-200 ${
                    isActive
                      ? `${colors.border} bg-white/5 shadow-[inset_0_0_20px_-12px_rgba(247,147,26,0.5)]`
                      : "border-transparent hover:border-white/15 hover:bg-white/[0.03]"
                  }`}
                >
                  <span className={`font-mono text-xs tabular-nums transition-colors ${
                    isActive ? colors.accent : "text-muted-foreground/60 group-hover:text-muted-foreground"
                  }`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={`font-mono text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
                    isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                  }`}>
                    {item.label}
                  </span>
                  {isActive && <span className={`ml-auto h-1.5 w-1.5 ${colors.bg}`} />}
                </button>
              );
            })}
          </nav>

          {/* Rail footer — role module */}
          <div className="px-6">
            <div className={`rounded-xl border border-white/10 ${colors.soft}`}>
              <div className={`flex items-center justify-between rounded-t-xl border-b border-white/10 px-3 py-2 bg-black/30`}>
                <span className={`font-mono text-[9px] font-semibold uppercase tracking-[0.18em] ${colors.accent}`}>
                  {portalType}
                </span>
                <span className={`relative inline-flex h-1.5 w-1.5`}>
                  <span className={`absolute inline-flex h-full w-full rounded-full ${colors.bg} opacity-60 animate-ping`} />
                  <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${colors.bg}`} />
                </span>
              </div>
              <div className="px-3 py-3">
                <p className="text-xs font-semibold truncate">{profile?.full_name || "User"}</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground truncate mt-0.5">
                  {profile?.organization || "Independent"}
                </p>
                <div className="mt-3 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  <Terminal className="h-3 w-3" />
                  BlockID · v2
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 px-4 sm:px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default PortalLayout;