import { ReactNode, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, LogOut, Menu, X, Link2, Crown, Home } from "lucide-react";
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
  issuer: { bg: "bg-issuer", text: "text-issuer", muted: "bg-issuer-muted" },
  holder: { bg: "bg-holder", text: "text-holder", muted: "bg-holder-muted" },
  verifier: { bg: "bg-verifier", text: "text-verifier", muted: "bg-verifier-muted" },
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
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => navigate("/")} className="shrink-0 border-border hover:border-primary hover:text-primary transition-colors">
                    <Home className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Back to Home</TooltipContent>
              </Tooltip>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 ${colors.bg} rounded-lg flex items-center justify-center`}>
                  <span className={`${colors.text}`}>{icon}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="font-display text-base sm:text-lg font-bold tracking-tight leading-none">
                    {title}
                  </span>
                  <span className={`badge-solid ${colors.bg} text-white text-[10px]`}>
                    {portalType}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <nav className="hidden md:flex items-center gap-1 bg-muted p-1 rounded-lg">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        isActive 
                          ? `${colors.bg} text-white` 
                          : "text-muted-foreground hover:text-foreground hover:bg-background"
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
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border ${
                    location.pathname.startsWith("/admin")
                      ? "bg-amber-500/20 text-amber-700 border-amber-500/30"
                      : "bg-amber-500/10 text-amber-600/80 border-amber-500/20 hover:bg-amber-500/15"
                  }`}
                >
                  <Crown className="h-3.5 w-3.5" />
                  <span className="hidden sm:block">Admin</span>
                </button>
              )}

              <NotificationBell />
              <ThemeToggle />

              <div className="hidden sm:flex items-center gap-3 border-l border-border pl-3">
                <div className={`w-8 h-8 ${colors.bg} rounded-lg flex items-center justify-center font-semibold text-xs text-white`}>
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
                  className="rounded-lg h-8 w-8"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden border-t border-border mt-3 pt-3 space-y-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setMobileMenuOpen(false); }}
                    className={`block w-full text-left px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? `${colors.bg} text-white`
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border mt-2 pt-2">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 ${colors.bg} rounded-lg flex items-center justify-center text-white text-xs font-bold`}>
                    {initials}
                  </div>
                  <span className="text-sm font-medium">{profile?.full_name}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => signOut().then(() => navigate("/"))}>
                  <LogOut className="h-4 w-4 mr-1" /> Sign Out
                </Button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
};

export default PortalLayout;
