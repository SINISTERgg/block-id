import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, User, Building2, ArrowRight, Fingerprint, LogOut,
  Lock, Globe, CheckCircle2, Link2, FileCheck, Eye, Zap, Bitcoin, Boxes
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { FadeIn, Stagger, StaggerItem } from "@/components/ui/motion";
import { MOTION } from "@/lib/motion";

const portals = [
  {
    id: "issuer",
    title: "Issuer",
    description: "Issue and manage verifiable credentials for educational institutions",
    icon: Shield,
    path: "/issuer",
    role: "issuer",
    accent: "text-issuer border-issuer",
  },
  {
    id: "holder",
    title: "Holder",
    description: "Store, manage and present your verifiable credentials securely",
    icon: User,
    path: "/holder",
    role: "holder",
    accent: "text-holder border-holder",
  },
  {
    id: "verifier",
    title: "Verifier",
    description: "Request and verify credential presentations from holders",
    icon: Building2,
    path: "/verifier",
    role: "verifier",
    accent: "text-verifier border-verifier",
  },
];

const features = [
  {
    icon: Lock,
    title: "Tamper-Proof",
    description: "Cryptographic hashing ensures credential integrity from issuance through verification.",
  },
  {
    icon: Globe,
    title: "W3C Standards",
    description: "Built on W3C Verifiable Credentials and blockchain-based identifiers for global interoperability.",
  },
  {
    icon: CheckCircle2,
    title: "Instant Verification",
    description: "AI-powered analysis verifies credentials in seconds with confidence scoring.",
  },
  {
    icon: Link2,
    title: "Blockchain Anchored",
    description: "Optional on-chain anchoring for immutable proof of credential existence.",
  },
  {
    icon: Eye,
    title: "Selective Disclosure",
    description: "Share only the fields you choose — maintain privacy while proving qualifications.",
  },
  {
    icon: FileCheck,
    title: "Revocation Support",
    description: "Real-time revocation status checks ensure only valid credentials are accepted.",
  },
];

const steps = [
  {
    step: "01",
    title: "Issue",
    description: "An issuer mints a credential — cryptographically hashed and anchored to the chain.",
    icon: Zap,
  },
  {
    step: "02",
    title: "Hold",
    description: "The holder stores it in a self-sovereign wallet with full control over disclosure.",
    icon: Bitcoin,
  },
  {
    step: "03",
    title: "Verify",
    description: "A verifier validates the presentation against the on-chain anchor in seconds.",
    icon: CheckCircle2,
  },
];

const stats = [
  { value: "100%", label: "W3C Compliant" },
  { value: "256", label: "Bit SHA Hashing" },
  { value: "<2s", label: "Verification" },
  { value: "E2E", label: "Encrypted" },
];

const getRolePath = (r: string) => (r === "org_admin" ? "/admin" : `/${r}`);

const Landing = () => {
  const navigate = useNavigate();
  const { user, role, profile, signOut, loading } = useAuth();

  useEffect(() => {
    if (!loading && user && role) {
      navigate(getRolePath(role), { replace: true });
    }
  }, [loading, user, role, navigate]);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden">
      {/* Header — hairline, sharp */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 border-2 border-primary flex items-center justify-center">
                <Fingerprint className="h-5 w-5 text-primary" strokeWidth={1.5} />
              </div>
              <span className="font-heading text-lg font-bold uppercase tracking-tight">BlockID</span>
            </div>

            {/* Nav — mono, uppercase, underline hover */}
            <nav className="hidden md:flex items-center gap-8 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <button onClick={() => scrollTo("portals")} className="underline-brand hover:text-primary transition-colors duration-200">Portals</button>
              <button onClick={() => scrollTo("how-it-works")} className="underline-brand hover:text-primary transition-colors duration-200">How it works</button>
              <button onClick={() => scrollTo("features")} className="underline-brand hover:text-primary transition-colors duration-200">Features</button>
            </nav>

            <div className="flex items-center gap-3">
              {user ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-muted-foreground hidden sm:block">
                    {profile?.full_name || user.email}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => signOut()}>
                    <LogOut className="h-4 w-4 mr-2" /> Sign Out
                  </Button>
                </div>
              ) : (
                <Button variant="solid" size="sm" onClick={() => navigate("/auth")}>Sign In</Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* ============ HERO ============ */}
        <section className="relative">
          <div className="absolute inset-0 bg-grid-pattern bg-grid-pattern-fade pointer-events-none" />

          <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-16 md:pt-28 md:pb-20 grid lg:grid-cols-[7fr_5fr] gap-12 items-center">
            {/* Copy */}
            <FadeIn>
              <div className="inline-flex items-center gap-2.5 border border-border px-4 py-1.5 mb-10">
                <span className="inline-block h-2 w-2 bg-primary" />
                <span className="text-xs font-mono font-semibold uppercase tracking-[0.15em] text-primary">
                  W3C Verifiable Credentials
                </span>
              </div>

              <h1 className="font-heading font-bold uppercase tracking-tight text-[clamp(2.75rem,7vw,6rem)] leading-[0.95] mb-10">
                Blockchain<br />Based<br />
                <span className="text-primary">Decentralized</span><br />
                <span className="font-display lowercase italic text-foreground">Identity</span>
              </h1>

              <p className="text-lg text-muted-foreground max-w-xl mb-12 leading-relaxed">
                Issue, hold, and verify academic credentials on a blockchain-based trust
                framework. Secured by cryptography, anchored on-chain, and compliant with global standards.
              </p>

              {/* CTAs — sharp, type-led */}
              <div className="flex flex-wrap gap-6">
                <Button size="lg" variant="solid" onClick={() => navigate(user ? getRolePath(role || "holder") : "/auth")}>
                  Get Started <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="default"
                  onClick={() => scrollTo("portals")}
                >
                  Learn More
                </Button>
              </div>
            </FadeIn>

            {/* Type sculpture graphic — replaced orbital orb with typography panel */}
            <FadeIn delay={MOTION.STAGGER} className="hidden lg:block">
              <div className="glass p-10 relative">
                <p className="text-label text-primary mb-12">01 · Issue</p>
                <p className="font-display italic text-5xl leading-none mb-3">Credential</p>
                <p className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground mb-10">
                  SHA-256 anchored on-chain
                </p>
                <p className="text-label text-primary mb-10">02 · Verify</p>
                <p className="font-display italic text-6xl leading-none mb-3">&lt; 2s</p>
                <p className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
                  Instant verification
                </p>
                <div className="absolute -top-px -left-px h-6 w-6 border-t-2 border-l-2 border-primary" />
                <div className="absolute -bottom-px -right-px h-6 w-6 border-b-2 border-r-2 border-primary" />
              </div>
            </FadeIn>
          </div>

          {/* Stats strip */}
          <div className="relative border-y border-border">
            <div className="max-w-6xl mx-auto px-6 py-10">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <p className="font-heading text-4xl font-bold uppercase tracking-tight">
                      {stat.value}
                    </p>
                    <p className="text-xs font-mono uppercase tracking-[0.12em] text-muted-foreground mt-3">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============ PORTALS ============ */}
        <section id="portals" className="relative py-24 md:py-32">
          <div className="max-w-6xl mx-auto px-6">
            <div className="mb-16 max-w-2xl">
              <div className="flex items-center gap-3 mb-6">
                <Boxes className="h-4 w-4 text-primary" />
                <span className="text-label text-primary">The Trust Triangle</span>
              </div>
              <h2 className="font-heading text-4xl md:text-6xl font-bold uppercase tracking-tight leading-none mb-6">
                Three Roles,<br />One <span className="text-primary">Ecosystem</span>
              </h2>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                Choose your role in the trust triangle — each portal is purpose-built for its workflow.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {portals.map((portal, i) => {
                const isUserPortal = role === portal.role;
                return (
                  <button
                    key={portal.id}
                    onClick={() => (user ? navigate(portal.path) : navigate("/auth"))}
                    className={`group relative text-left border border-border bg-card p-8 transition-colors duration-300 hover:bg-muted/40 ${i === 1 ? "corner-accent" : ""}`}
                  >
                    <portal.icon
                      className={`absolute right-4 top-4 h-16 w-16 ${portal.accent} opacity-10 transition-opacity duration-300 group-hover:opacity-25`}
                      strokeWidth={1}
                    />

                    <div className={`w-12 h-12 border-2 ${portal.accent} flex items-center justify-center mb-10`}>
                      <portal.icon className={`h-5 w-5 ${portal.accent}`} strokeWidth={1.5} />
                    </div>

                    <h3 className="font-heading text-2xl font-bold uppercase tracking-tight mb-4">
                      {portal.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-8">
                      {portal.description}
                    </p>

                    <span className={`inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] ${portal.accent} underline-brand`}>
                      {isUserPortal ? "Go to portal" : "Enter portal"}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section id="how-it-works" className="relative py-24 md:py-32 bg-card">
          <div className="max-w-6xl mx-auto px-6">
            <div className="mb-16 max-w-2xl">
              <div className="flex items-center gap-3 mb-6">
                <Link2 className="h-4 w-4 text-primary" />
                <span className="text-label text-primary">The Protocol</span>
              </div>
              <h2 className="font-heading text-4xl md:text-6xl font-bold uppercase tracking-tight leading-none mb-6">
                Trust, <span className="text-primary">Block by Block</span>
              </h2>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                Every credential flows through a cryptographic ledger — each step immutably linked to the last.
              </p>
            </div>

            <div className="relative">
              <div className="absolute hidden md:block top-[36px] left-[12%] right-[12%] h-px bg-border" />

              <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {steps.map((s) => (
                  <StaggerItem key={s.step} className="group relative border border-border bg-background p-8 transition-colors duration-300 hover:bg-muted/40">
                    <p className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground mb-6">{s.step}</p>
                    <h3 className="font-heading text-2xl font-bold uppercase tracking-tight mb-4 flex items-center gap-3">
                      <s.icon className="h-5 w-5 text-primary" strokeWidth={1.5} />
                      {s.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.description}</p>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </div>
        </section>

        {/* ============ FEATURES ============ */}
        <section id="features" className="relative py-24 md:py-32">
          <div className="absolute inset-0 bg-grid-pattern bg-grid-pattern-fade opacity-60 pointer-events-none" />
          <div className="relative max-w-6xl mx-auto px-6">
            <div className="mb-16 max-w-2xl">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="h-4 w-4 text-primary" />
                <span className="text-label text-primary">Engineered Precision</span>
              </div>
              <h2 className="font-heading text-4xl md:text-6xl font-bold uppercase tracking-tight leading-none mb-6">
                Built for <span className="text-primary">Trust & Privacy</span>
              </h2>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                Every layer is designed around cryptographic integrity, selective disclosure, and decentralized control.
              </p>
            </div>

            <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature) => (
                <StaggerItem
                  key={feature.title}
                  className="group relative border border-border bg-card p-8 transition-colors duration-300 hover:bg-muted/40"
                >
                  <feature.icon
                    className="absolute -right-3 -bottom-3 h-24 w-24 text-primary opacity-[0.05] transition-opacity duration-500 group-hover:opacity-15"
                    strokeWidth={1}
                  />

                  <div className="w-11 h-11 border border-border flex items-center justify-center mb-6 transition-colors duration-300 group-hover:border-primary">
                    <feature.icon className="h-5 w-5 text-primary" strokeWidth={1.5} />
                  </div>

                  <h3 className="font-heading text-xl font-bold uppercase tracking-tight mb-3">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ============ CTA ============ */}
        <section className="relative py-24 md:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-primary/[0.03]" />
          <div className="relative max-w-6xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2.5 border border-primary/30 px-4 py-1.5 mb-10">
              <span className="inline-block h-2 w-2 bg-primary" />
              <span className="text-xs font-mono font-semibold uppercase tracking-[0.15em] text-primary">
                Network Live
              </span>
            </div>

            <h2 className="font-heading text-4xl md:text-6xl font-bold uppercase tracking-tight leading-none mb-8">
              Ready to bring<br />
              <span className="font-display lowercase italic text-primary">trust on-chain?</span>
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-lg mx-auto mb-12 leading-relaxed">
              Join the ecosystem — issue your first credential, store it in your wallet, or verify one in seconds.
            </p>
            <Button
              size="lg"
              variant="solid"
              onClick={() => navigate(user ? getRolePath(role || "holder") : "/auth")}
            >
              {user ? "Go to Dashboard" : "Create Account"} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 border-2 border-primary flex items-center justify-center">
              <Fingerprint className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
            </div>
            <span className="font-heading text-sm font-bold uppercase tracking-tight">BlockID</span>
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