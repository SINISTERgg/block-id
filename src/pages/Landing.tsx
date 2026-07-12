import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, User, Building2, ArrowRight, Fingerprint, LogOut,
  Lock, Globe, CheckCircle2, Link2, FileCheck, Eye, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import ThemeToggle from "@/components/ui/ThemeToggle";

const portals = [
  {
    id: "issuer",
    title: "Issuer",
    description: "Issue and manage verifiable credentials for educational institutions",
    icon: Shield,
    path: "/issuer",
    role: "issuer",
  },
  {
    id: "holder",
    title: "Holder",
    description: "Store, manage and present your verifiable credentials securely",
    icon: User,
    path: "/holder",
    role: "holder",
  },
  {
    id: "verifier",
    title: "Verifier",
    description: "Request and verify credential presentations from holders",
    icon: Building2,
    path: "/verifier",
    role: "verifier",
  },
];

const features = [
  { 
    icon: Lock, 
    title: "Tamper-Proof", 
    description: "Cryptographic hashing ensures credential integrity from issuance through verification." 
  },
  { 
    icon: Globe, 
    title: "W3C Standards", 
    description: "Built on W3C Verifiable Credentials and blockchain-based identifiers for global interoperability." 
  },
  { 
    icon: CheckCircle2, 
    title: "Instant Verification", 
    description: "AI-powered analysis verifies credentials in seconds with confidence scoring." 
  },
  { 
    icon: Link2, 
    title: "Blockchain Anchored", 
    description: "Optional on-chain anchoring for immutable proof of credential existence." 
  },
  { 
    icon: Eye, 
    title: "Selective Disclosure", 
    description: "Share only the fields you choose — maintain privacy while proving qualifications." 
  },
  { 
    icon: FileCheck, 
    title: "Revocation Support", 
    description: "Real-time revocation status checks ensure only valid credentials are accepted." 
  },
];

const getRolePath = (r: string) => r === "org_admin" ? "/admin" : `/${r}`;

const Landing = () => {
  const navigate = useNavigate();
  const { user, role, profile, signOut, loading } = useAuth();

  useEffect(() => {
    if (!loading && user && role) {
      navigate(getRolePath(role), { replace: true });
    }
  }, [loading, user, role, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden">
      {/* Noise texture overlay */}
      <div className="fixed inset-0 pointer-events-none mix-blend-multiply opacity-[0.02]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      />

      {/* Header - Sharp, minimal */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-foreground">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Icon - Simple bordered square */}
              <div className="w-10 h-10 border-2 border-foreground flex items-center justify-center">
                <Fingerprint className="h-5 w-5" />
              </div>
              <span className="font-display text-xl font-bold tracking-tight">BlockID</span>
            </div>
            
            <div className="flex items-center gap-6">
              <ThemeToggle />
              {user ? (
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-muted-foreground hidden sm:block">
                    {profile?.full_name || user.email}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => signOut()}>
                    <LogOut className="h-4 w-4 mr-2" /> Sign Out
                  </Button>
                </div>
              ) : (
                <Button onClick={() => navigate("/auth")}>Sign In</Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section - Editorial typography */}
        <section className="py-24 md:py-32 relative">
          <div className="max-w-7xl mx-auto px-6">
            {/* Decorative thick rule */}
            <div className="w-24 h-1 bg-foreground mb-12" />
            
            {/* Status - Monospace uppercase */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-2 h-2 bg-foreground" />
              <span className="text-xs font-mono font-semibold uppercase tracking-widest text-muted-foreground">
                W3C Verifiable Credentials
              </span>
            </div>
            
            {/* Display headline - Serif, dramatic */}
            <h1 className="text-6xl md:text-8xl font-display font-bold tracking-tighter leading-[0.95] mb-8">
              Blockchain<br />
              Based<br />
              <span className="relative">
                Decentralized
                {/* Decorative underline */}
                <span className="absolute -bottom-2 left-0 w-full h-1 bg-foreground" />
              </span><br />
              Identity
            </h1>

            {/* Lead paragraph - Serif body */}
            <p className="text-lg md:text-xl font-body text-muted-foreground max-w-2xl mb-12 leading-relaxed">
              Issue, hold, and verify academic credentials on a blockchain-based trust
              framework. Secured by cryptography, anchored on-chain, and compliant with global standards.
            </p>

            {/* CTA Buttons - Sharp, uppercase */}
            <div className="flex flex-wrap gap-0">
              <Button size="xl" onClick={() => navigate(user ? getRolePath(role || "holder") : "/auth")}>
                Get Started <span className="ml-2">→</span>
              </Button>
              <Button size="xl" variant="outline" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>
                Learn More
              </Button>
            </div>
          </div>

          {/* Stats Strip - Horizontal line texture */}
          <div className="max-w-7xl mx-auto px-6 mt-20 pt-8 border-t border-foreground">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground">
              {[
                { value: "100%", label: "W3C Compliant" },
                { value: "256", label: "Bit SHA Hashing" },
                { value: "<2s", label: "Verification" },
                { value: "E2E", label: "Encrypted" },
              ].map((stat, i) => (
                <div key={i} className="bg-background p-6">
                  <p className="text-3xl md:text-4xl font-display font-bold tracking-tight">{stat.value}</p>
                  <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mt-2">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Thick horizontal rule */}
        <div className="h-1 bg-foreground" />

        {/* Portals Section - Line-based cards */}
        <section className="py-24 md:py-32 bg-background">
          <div className="max-w-7xl mx-auto px-6">
            <div className="mb-16">
              {/* Decorative square */}
              <div className="w-4 h-4 bg-foreground mb-6" />
              <h2 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-4">Three Roles,<br />One Ecosystem</h2>
              <p className="text-lg font-body text-muted-foreground max-w-lg">
                Choose your role in the trust triangle — each portal is purpose-built for its workflow.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-foreground">
              {portals.map((portal) => {
                const isUserPortal = role === portal.role;

                return (
                  <button
                    key={portal.id}
                    onClick={() => (user ? navigate(portal.path) : navigate("/auth"))}
                    className="group bg-background p-8 text-left transition-all duration-100 hover:bg-foreground hover:text-background"
                  >
                    <div className="flex items-start justify-between mb-8">
                      {/* Icon - Bordered */}
                      <div className="w-14 h-14 border-2 border-foreground flex items-center justify-center transition-all duration-100 group-hover:bg-background group-hover:text-foreground">
                        <portal.icon className="h-6 w-6" />
                      </div>
                      {/* Arrow - Shows on hover */}
                      <ArrowRight className="h-5 w-5 opacity-0 transition-all duration-100 group-hover:opacity-100" />
                    </div>
                    
                    <h3 className="text-2xl font-display font-semibold mb-3">{portal.title} Portal</h3>
                    <p className="text-sm font-body text-muted-foreground mb-6 leading-relaxed group-hover:text-background/80">
                      {portal.description}
                    </p>
                    
                    {/* Underline on hover */}
                    <span className={`text-sm font-mono uppercase tracking-widest ${isUserPortal ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                      {isUserPortal ? "Go to portal" : "Enter portal"} <span className="ml-2">→</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Thick horizontal rule */}
        <div className="h-1 bg-foreground" />

        {/* Features Section - Grid texture */}
        <section id="features" className="py-24 md:py-32 relative">
          {/* Subtle grid texture */}
          <div className="absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`,
              backgroundSize: "40px 40px"
            }}
          />
          
          <div className="max-w-7xl mx-auto px-6 relative">
            <div className="mb-16">
              <div className="w-4 h-4 bg-foreground mb-6" />
              <h2 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-4">
                Built for<br />Trust & Privacy
              </h2>
              <p className="text-lg font-body text-muted-foreground max-w-lg">
                Every layer is designed around cryptographic integrity, selective disclosure, and decentralized control.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-foreground">
              {features.map((feature) => (
                <div 
                  key={feature.title} 
                  className="group bg-background p-8 transition-all duration-100 hover:bg-foreground hover:text-background"
                >
                  {/* Icon */}
                  <div className="w-12 h-12 border border-foreground flex items-center justify-center mb-6 transition-all duration-100 group-hover:bg-background group-hover:text-foreground">
                    <feature.icon className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-display font-semibold mb-3">{feature.title}</h3>
                  <p className="text-sm font-body text-muted-foreground leading-relaxed group-hover:text-background/70">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Thick horizontal rule */}
        <div className="h-1 bg-foreground" />

        {/* CTA Section - Inverted (black background) */}
        <section className="py-24 md:py-32 bg-foreground text-background relative">
          {/* Vertical line texture */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 1px, #fff 1px, #fff 2px)`,
              backgroundSize: "4px 100%"
            }}
          />
          
          <div className="max-w-7xl mx-auto px-6 text-center relative">
            <div className="inline-block">
              <div className="w-4 h-4 border-2 border-background mx-auto mb-8" />
              <h2 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-6">
                Ready to bring<br />trust on-chain?
              </h2>
              <p className="text-lg font-body text-muted-foreground max-w-lg mx-auto mb-10">
                Join the ecosystem — issue your first credential, store it in your wallet, or verify one in seconds.
              </p>
              <Button 
                size="xl" 
                className="bg-background text-foreground hover:bg-transparent hover:text-background hover:outline hover:outline-2 hover:outline-background"
                onClick={() => navigate(user ? getRolePath(role || "holder") : "/auth")}
              >
                {user ? "Go to Dashboard" : "Create Account"} <span className="ml-2">→</span>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer - Minimal */}
      <footer className="border-t border-foreground py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border border-foreground flex items-center justify-center">
              <Fingerprint className="h-3 w-3" />
            </div>
            <span className="text-sm font-display font-semibold">BlockID</span>
          </div>
          <p className="text-sm font-mono text-muted-foreground">
            Built on W3C Verifiable Credentials & blockchain-based identifiers
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;