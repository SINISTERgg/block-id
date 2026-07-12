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
  issuer: { bg: "bg-foreground", text: "text-foreground", muted: "bg-muted" },
  holder: { bg: "bg-foreground", text: "text-foreground", muted: "bg-muted" },
  verifier: { bg: "bg-foreground", text: "text-foreground", muted: "bg-muted" },
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
      {/* Header - Sharp, bordered */}
      <header className="sticky top-0 z-50 bg-background border-b border-foreground">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="secondary" 
                    size="icon" 
                    onClick={() => navigate("/")} 
                    className="shrink-0"
                  >
                    <Home className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Back to Home</TooltipContent>
              </Tooltip>
              <div className="flex items-center gap-4">
                {/* Icon - Bordered square */}
                <div className={`w-10 h-10 border-2 border-foreground flex items-center justify-center ${colors.text}`}>
                  <span className="text-lg">{icon}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-display text-lg font-bold tracking-tight leading-none">
                    {title}
                  </span>
                  {/* Status - Uppercase monospace */}
                  <span className={`text-xs font-mono uppercase tracking-widest ${colors.text}`}>
                    {portalType}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Navigation - Minimal bordered */}
              <nav className="hidden md:flex items-center border border-foreground">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className={`px-5 py-3 text-sm font-mono font-semibold uppercase tracking-wider transition-all duration-100 ${
                        isActive 
                          ? "bg-foreground text-background" 
                          : "hover:bg-foreground hover:text-background"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </nav>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/explorer")}
                className="shrink-0"
                title="Blockchain Explorer"
              >
                <Link2 className="h-4 w-4" />
              </Button>

              {adminUser && (
                <button
                  onClick={() => navigate("/admin")}
                  title="Organization Admin"
                  className={`shrink-0 flex items-center gap-2 px-3 py-2 text-xs font-mono font-semibold uppercase tracking-wider transition-all border border-foreground ${
                    location.pathname.startsWith("/admin")
                      ? "bg-foreground text-background"
                      : "hover:bg-foreground hover:text-background"
                  }`}
                >
                  <Crown className="h-3.5 w-3.5" />
                  <span className="hidden sm:block">Admin</span>
                </button>
              )}

              <NotificationBell />
              <ThemeToggle />

              {/* User Profile - Minimal */}
              <div className="hidden sm:flex items-center gap-3 border-l border-foreground pl-4">
                {/* Avatar - Bordered square */}
                <div className="w-9 h-9 border border-foreground flex items-center justify-center font-mono font-bold text-xs">
                  {initials}
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
                variant="secondary"
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
            <div className="md:hidden border-t border-foreground mt-4 pt-4">
              <nav className="flex flex-col border border-foreground">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => { navigate(item.path); setMobileMenuOpen(false); }}
                      className={`px-4 py-4 text-left text-sm font-mono font-semibold uppercase tracking-wider transition-all duration-100 ${
                        isActive
                          ? "bg-foreground text-background"
                          : "hover:bg-foreground hover:text-background"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </nav>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-foreground">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 border border-foreground flex items-center justify-center font-mono font-bold text-xs">
                    {initials}
                  </div>
                  <span className="text-sm font-semibold">{profile?.full_name}</span>
                </div>
                <Button variant="secondary" size="sm" onClick={() => signOut().then(() => navigate("/"))}>
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </Button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
};

export default PortalLayout;