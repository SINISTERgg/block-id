import { ReactNode, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, LogOut, Menu, X, Link2, Crown, Home, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ui/ThemeToggle";
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
    accent: "#EA580C",
    gradient: "from-[#9A3412] to-[#EA580C]",
    activeText: "text-white",
    dot: "bg-[#EA580C]",
  },
  holder: {
    accent: "#F7931A",
    gradient: "from-[#EA580C] to-[#F7931A]",
    activeText: "text-white",
    dot: "bg-[#F7931A]",
  },
  verifier: {
    accent: "#FFD600",
    gradient: "from-[#F7931A] to-[#FFD600]",
    activeText: "text-[#030304]",
    dot: "bg-[#FFD600]",
  },
};

const PortalLayout = ({ children, title, portalType, icon, navItems }: PortalLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, role, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const adminUser = isOrgAdmin(role);
  const colors = PORTAL_COLORS[portalType];

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "U";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header — glass with glowing brand node */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigate("/")}
                    className="shrink-0"
                  >
                    <Home className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Back to Home</TooltipContent>
              </Tooltip>
              <div className="flex items-center gap-3">
                {/* Brand node — role gradient */}
                <div className="relative shrink-0">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-[0_0_20px_-5px_rgba(234,88,12,0.6)]`}>
                    <span className={`text-lg ${colors.activeText}`}>{icon}</span>
                  </div>
                  <div className="absolute -inset-1 rounded-xl bg-[#F7931A]/20 blur-md -z-10 animate-glow-pulse" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="font-heading text-lg font-bold tracking-tight leading-none">
                    {title}
                  </span>
                  <span className="text-xs font-mono uppercase tracking-widest flex items-center gap-1.5" style={{ color: colors.accent }}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${colors.dot} animate-glow-pulse`} />
                    {portalType}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Navigation — glowing pills */}
              <nav className="hidden md:flex items-center gap-1 rounded-full border border-border bg-background/40 p-1">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className={`px-4 py-2 rounded-full text-sm font-mono font-semibold uppercase tracking-wider transition-all duration-300 ${
                        isActive
                          ? `bg-gradient-to-r ${colors.gradient} ${colors.activeText} shadow-[0_0_15px_-5px_rgba(247,147,26,0.6)]`
                          : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </nav>

              {portalType !== "verifier" && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/explorer")}
                  className="shrink-0"
                  title="Blockchain Explorer"
                >
                  <Link2 className="h-4 w-4" />
                </Button>
              )}

              {adminUser && (
                <button
                  onClick={() => navigate("/admin")}
                  title="Organization Admin"
                  className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono font-semibold uppercase tracking-wider transition-all duration-300 ${
                    location.pathname.startsWith("/admin")
                      ? `bg-gradient-to-r ${colors.gradient} ${colors.activeText}`
                      : "border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                  }`}
                >
                  <Crown className="h-3.5 w-3.5" />
                  <span className="hidden sm:block">Admin</span>
                </button>
              )}

              <NotificationBell />
              <ThemeToggle />

              {/* User Profile — glowing avatar */}
              <div className="hidden sm:flex items-center gap-3 border-l border-border pl-4">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#EA580C]/25 to-[#F7931A]/25 border border-[#F7931A]/40 flex items-center justify-center font-mono font-bold text-xs">
                    {initials}
                  </div>
                  <div className="absolute -inset-0.5 rounded-full border border-[#F7931A]/20 blur-[2px] -z-10" />
                </div>
                <div className="flex flex-col">
                  {profile?.organization && (
                    <span className="text-[10px] font-mono uppercase text-muted-foreground leading-none truncate max-w-[100px]">
                      {profile.organization}
                    </span>
                  )}
                  <span className="text-sm font-semibold leading-tight truncate max-w-[100px]">
                    {profile?.full_name}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => signOut().then(() => navigate("/"))}
                  className="h-9 w-9"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>

              {/* Mobile Menu Toggle */}
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-border mt-4 pt-4 space-y-4">
              <nav className="flex flex-col gap-2">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => { navigate(item.path); setMobileMenuOpen(false); }}
                      className={`px-4 py-3 rounded-full text-left text-sm font-mono font-semibold uppercase tracking-wider transition-all duration-300 ${
                        isActive
                          ? `bg-gradient-to-r ${colors.gradient} ${colors.activeText}`
                          : "border border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </nav>
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#EA580C]/25 to-[#F7931A]/25 border border-[#F7931A]/40 flex items-center justify-center font-mono font-bold text-xs">
                    {initials}
                  </div>
                  <span className="text-sm font-semibold">{profile?.full_name}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => signOut().then(() => navigate("/"))}>
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </Button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        {children}
      </main>
    </div>
  );
};

export default PortalLayout;
