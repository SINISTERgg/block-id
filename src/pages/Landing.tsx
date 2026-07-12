import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, User, Building2, ArrowRight, Fingerprint, LogOut,
  Lock, Globe, CheckCircle2, Link2, FileCheck, Eye
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

// Map role to route path — org_admin needs special handling
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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
              <Fingerprint className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight">BlockID</span>
          </div>
          
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground hidden sm:block">
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
      </header>

      <main>
        <section className="py-24 md:py-32 pattern-dots">
          <div className="container mx-auto px-6">
            <div className="max-w-3xl">
              <div className="badge-solid bg-primary/10 text-primary mb-6 inline-flex">
                W3C Verifiable Credentials
              </div>
              
              <h1 className="text-display mb-6">
                Blockchain Based<br />
                <span className="text-primary">Decentralized Identity</span><br />
                for Education
              </h1>

              <p className="text-lg text-muted-foreground max-w-xl mb-10 leading-relaxed">
                Issue, hold, and verify academic credentials on a blockchain-based trust
                framework. Secured by cryptography, anchored on-chain, and compliant with global standards.
              </p>

              <div className="flex flex-wrap gap-4">
                <Button size="lg" onClick={() => navigate(user ? getRolePath(role || "holder") : "/auth")} className="btn-primary">
                  Get Started <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button size="lg" variant="outline" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>
                  Learn More
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20 pt-12 border-t border-border">
              <div>
                <p className="stat-number text-foreground">100%</p>
                <p className="text-sm text-muted-foreground mt-1">W3C Compliant</p>
              </div>
              <div>
                <p className="stat-number text-foreground">256</p>
                <p className="text-sm text-muted-foreground mt-1">Bit SHA Hashing</p>
              </div>
              <div>
                <p className="stat-number text-foreground">&lt;2s</p>
                <p className="text-sm text-muted-foreground mt-1">Verification</p>
              </div>
              <div>
                <p className="stat-number text-foreground">E2E</p>
                <p className="text-sm text-muted-foreground mt-1">Encrypted</p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-card border-y border-border">
          <div className="container mx-auto px-6">
            <h2 className="text-headline mb-3 line-accent">Three Roles, One Ecosystem</h2>
            <p className="text-muted-foreground mb-12 max-w-lg">
              Choose your role in the trust triangle — each portal is purpose-built for its workflow.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {portals.map((portal) => {
                const isUserPortal = role === portal.role;
                return (
                  <button
                    key={portal.id}
                    onClick={() => (user ? navigate(portal.path) : navigate("/auth"))}
                    className={`solid-card p-8 text-left group ${isUserPortal ? 'ring-2 ring-primary' : ''}`}
                  >
                    <div className="flex items-start justify-between mb-6">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        portal.id === "issuer" ? 'bg-issuer' : 
                        portal.id === "holder" ? 'bg-holder' : 'bg-verifier'
                      }`}>
                        <portal.icon className="h-6 w-6 text-white" />
                      </div>
                      <span className={`portal-indicator ${portal.id}`} />
                    </div>
                    
                    <h3 className="text-title text-foreground mb-2">{portal.title} Portal</h3>
                    <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{portal.description}</p>
                    
                    <span className={`text-sm font-medium flex items-center gap-1 ${
                      portal.id === "issuer" ? 'text-issuer' : 
                      portal.id === "holder" ? 'text-holder' : 'text-verifier'
                    }`}>
                      {isUserPortal ? "Go to portal" : "Enter portal"} <ArrowRight className="h-4 w-4" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section id="features" className="py-20">
          <div className="container mx-auto px-6">
            <h2 className="text-headline mb-3 line-accent">Built for Trust & Privacy</h2>
            <p className="text-muted-foreground mb-12 max-w-lg">
              Every layer is designed around cryptographic integrity, selective disclosure, and decentralized control.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature) => (
                <div key={feature.title} className="solid-card p-6 hover-lift">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-title text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-card border-y border-border">
          <div className="container mx-auto px-6 text-center max-w-2xl">
            <h2 className="text-headline mb-4">Ready to bring trust on-chain?</h2>
            <p className="text-muted-foreground mb-8">
              Join the ecosystem — issue your first credential, store it in your wallet, or verify one in seconds.
            </p>
            <Button size="lg" onClick={() => navigate(user ? getRolePath(role || "holder") : "/auth")} className="btn-primary">
              {user ? "Go to Dashboard" : "Create Account"} <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">BlockID</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Built on W3C Verifiable Credentials & blockchain-based identifiers
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
