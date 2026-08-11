import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, User, Building2, ArrowRight, Fingerprint, LogOut,
  Lock, Globe, CheckCircle2, Link2, FileCheck, Eye, Zap, Bitcoin, Boxes
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

/* ── Signature hero graphic: orbital rings + floating stat cards ── */
const HeroOrb = () => (
  <div className="relative flex items-center justify-center h-[320px] md:h-[420px] lg:h-[460px] select-none">
    {/* Ambient energy field */}
    <div className="absolute w-72 h-72 md:w-96 md:h-96 rounded-full bg-[#F7931A] opacity-[0.12] blur-[110px]" />
    <div className="absolute w-40 h-40 md:w-52 md:h-52 rounded-full bg-[#FFD600] opacity-[0.08] blur-[90px] translate-x-24 translate-y-16" />

    {/* Outer orbital ring */}
    <div className="absolute w-[300px] h-[300px] md:w-[380px] md:h-[380px] rounded-full animate-orbit-slow">
      <div className="absolute inset-3 rounded-full border border-dashed border-[#F7931A]/30" />
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#FFD600] shadow-[0_0_14px_rgba(255,214,0,0.9)]" />
      <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#F7931A] shadow-[0_0_14px_rgba(247,147,26,0.9)]" />
    </div>

    {/* Inner orbital ring (reverse) */}
    <div className="absolute w-[190px] h-[190px] md:w-[240px] md:h-[240px] rounded-full border border-border/70 animate-orbit-reverse">
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#F7931A] shadow-[0_0_14px_rgba(247,147,26,0.9)]" />
      <div className="absolute top-0 -left-1 w-2 h-2 rounded-full bg-white/60" />
    </div>

    {/* Center orb — digital gold core */}
    <div className="relative w-28 h-28 md:w-36 md:h-36 rounded-full bg-gradient-to-br from-[#FFD600] via-[#F7931A] to-[#EA580C] shadow-[0_0_70px_-8px_rgba(247,147,26,0.75)] animate-float flex items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-gradient-to-tl from-transparent to-white/30" />
      <Fingerprint className="h-12 w-12 md:h-14 md:w-14 text-[#030304]" strokeWidth={1.5} />
    </div>

    {/* Floating stat cards */}
    <div className="absolute -left-2 md:left-0 top-6 md:top-10 glass rounded-xl px-4 py-3 border border-[#F7931A]/20 animate-[float_6s_ease-in-out_infinite] [animation-delay:0.5s]">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Verification</p>
      <p className="font-heading text-xl font-bold text-[#FFD600]">&lt; 2s</p>
    </div>
    <div className="absolute right-0 md:-right-2 top-1/3 glass rounded-xl px-4 py-3 border border-border/60 animate-[float_7s_ease-in-out_infinite] [animation-delay:1.5s]">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Anchored</p>
      <p className="font-heading text-xl font-bold text-[#F7931A]">On-Chain</p>
    </div>
    <div className="absolute -bottom-2 md:bottom-8 left-8 md:left-16 glass rounded-xl px-4 py-3 border border-border/60 animate-[float_8s_ease-in-out_infinite] [animation-delay:2.5s]">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Integrity</p>
      <p className="font-heading text-xl font-bold text-white">SHA-256</p>
    </div>
  </div>
);

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
      {/* Texture overlay — cosmic noise */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Header — glass with glowing brand node */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Brand node — glowing gradient mark */}
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#EA580C] to-[#F7931A] flex items-center justify-center shadow-[0_0_20px_-5px_rgba(234,88,12,0.7)]">
                  <Fingerprint className="h-5 w-5 text-white" strokeWidth={1.75} />
                </div>
                <div className="absolute -inset-1 rounded-xl bg-[#F7931A]/20 blur-md -z-10 animate-glow-pulse" />
              </div>
              <span className="font-heading text-xl font-bold tracking-tight">BlockID</span>
            </div>

            {/* Nav — mono, uppercase, precision */}
            <nav className="hidden md:flex items-center gap-8 font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <button onClick={() => scrollTo("portals")} className="hover:text-[#F7931A] transition-colors duration-200">Portals</button>
              <button onClick={() => scrollTo("how-it-works")} className="hover:text-[#F7931A] transition-colors duration-200">How it works</button>
              <button onClick={() => scrollTo("features")} className="hover:text-[#F7931A] transition-colors duration-200">Features</button>
            </nav>

            <div className="flex items-center gap-3">
              <ThemeToggle />
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
                <Button size="sm" onClick={() => navigate("/auth")}>Sign In</Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* ============ HERO — the void awakens ============ */}
        <section className="relative">
          {/* Fading network grid */}
          <div className="absolute inset-0 bg-grid-pattern pointer-events-none" />
          {/* Ambient radial blurs */}
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#EA580C] opacity-10 blur-[130px] pointer-events-none" />
          <div className="absolute top-1/3 -right-40 w-[400px] h-[400px] rounded-full bg-[#F7931A] opacity-10 blur-[140px] pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-6 pt-16 pb-20 md:pt-24 md:pb-24 grid lg:grid-cols-2 gap-12 items-center">
            {/* Copy */}
            <div>
              {/* Live status badge */}
              <div className="inline-flex items-center gap-2.5 rounded-full border border-[#F7931A]/30 bg-[#F7931A]/10 px-4 py-1.5 mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F7931A] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F7931A]" />
                </span>
                <span className="text-xs font-mono font-semibold uppercase tracking-widest text-[#F7931A]">
                  W3C Verifiable Credentials
                </span>
              </div>

              {/* Display headline — dramatic, gold-clipped ending */}
              <h1 className="text-5xl sm:text-6xl md:text-7xl font-heading font-bold tracking-tight leading-[1.02] mb-8">
                Blockchain
                <br />
                Based
                <br />
                <span className="bg-gradient-to-r from-[#F7931A] to-[#FFD600] bg-clip-text text-transparent">
                  Decentralized
                </span>
                <br />
                <span className="bg-gradient-to-r from-[#F7931A] to-[#FFD600] bg-clip-text text-transparent">
                  Identity
                </span>
              </h1>

              <p className="text-base md:text-lg text-muted-foreground max-w-xl mb-10 leading-relaxed">
                Issue, hold, and verify academic credentials on a blockchain-based trust
                framework. Secured by cryptography, anchored on-chain, and compliant with global standards.
              </p>

              {/* CTAs — glowing pills */}
              <div className="flex flex-wrap gap-4">
                <Button size="xl" onClick={() => navigate(user ? getRolePath(role || "holder") : "/auth")}>
                  Get Started <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  size="xl"
                  variant="outline"
                  onClick={() => scrollTo("portals")}
                >
                  Learn More
                </Button>
              </div>
            </div>

            {/* Orbital graphic */}
            <HeroOrb />
          </div>

          {/* Stats strip — bordered ticker */}
          <div className="relative border-y border-border">
            <div className="max-w-7xl mx-auto px-6 py-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <p className="text-3xl md:text-4xl font-heading font-bold tracking-tight">
                      <span className="bg-gradient-to-r from-[#F7931A] to-[#FFD600] bg-clip-text text-transparent">
                        {stat.value}
                      </span>
                    </p>
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mt-2">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============ PORTALS — three roles, one ecosystem ============ */}
        <section id="portals" className="relative py-24 md:py-28">
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />
          <div className="relative max-w-7xl mx-auto px-6">
            <div className="mb-14 md:mb-16 max-w-2xl">
              <div className="flex items-center gap-3 mb-5">
                <Boxes className="h-4 w-4 text-[#F7931A]" />
                <span className="text-xs font-mono font-semibold uppercase tracking-widest text-[#F7931A]">
                  The Trust Triangle
                </span>
              </div>
              <h2 className="text-3xl md:text-5xl font-heading font-bold tracking-tight mb-4">
                Three Roles,<br />One{" "}
                <span className="bg-gradient-to-r from-[#F7931A] to-[#FFD600] bg-clip-text text-transparent">
                  Ecosystem
                </span>
              </h2>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                Choose your role in the trust triangle — each portal is purpose-built for its workflow.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
              {portals.map((portal, i) => {
                const isUserPortal = role === portal.role;
                return (
                  <button
                    key={portal.id}
                    onClick={() => (user ? navigate(portal.path) : navigate("/auth"))}
                    className={`group relative text-left rounded-2xl border border-border/70 bg-card/80 p-8 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#F7931A]/50 hover:shadow-[0_0_30px_-10px_rgba(247,147,26,0.25)] ${
                      i === 1 ? "corner-accent" : ""
                    }`}
                  >
                    {/* Watermark icon */}
                    <portal.icon
                      className="absolute right-4 top-4 h-20 w-20 text-[#F7931A] opacity-[0.06] transition-all duration-300 group-hover:opacity-20 group-hover:rotate-6"
                      strokeWidth={1}
                    />

                    {/* Holographic node */}
                    <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-[#EA580C]/25 to-[#F7931A]/20 border border-[#EA580C]/40 flex items-center justify-center mb-8 group-hover:shadow-[0_0_20px_rgba(234,88,12,0.4)] transition-all duration-300">
                      <portal.icon className="h-6 w-6 text-[#F7931A]" strokeWidth={1.5} />
                    </div>

                    <h3 className="font-heading text-2xl font-semibold mb-3">{portal.title} Portal</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                      {portal.description}
                    </p>

                    <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-[#F7931A]">
                      {isUserPortal ? "Go to portal" : "Enter portal"}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============ HOW IT WORKS — the blockchain ledger ============ */}
        <section id="how-it-works" className="relative py-24 md:py-28 bg-card/40">
          <div className="max-w-7xl mx-auto px-6">
            <div className="mb-14 md:mb-16 max-w-2xl">
              <div className="flex items-center gap-3 mb-5">
                <Link2 className="h-4 w-4 text-[#FFD600]" />
                <span className="text-xs font-mono font-semibold uppercase tracking-widest text-[#FFD600]">
                  The Protocol
                </span>
              </div>
              <h2 className="text-3xl md:text-5xl font-heading font-bold tracking-tight mb-4">
                Trust,{" "}
                <span className="bg-gradient-to-r from-[#F7931A] to-[#FFD600] bg-clip-text text-transparent">
                  Block by Block
                </span>
              </h2>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                Every credential flows through a cryptographic ledger — each step immutably linked to the last.
              </p>
            </div>

            <div className="relative">
              {/* Desktop chain: horizontal gradient ledger between the node centers */}
              <div className="absolute hidden md:block top-[60px] left-[calc(16.66%+28px)] w-[calc(33.33%-56px)] h-0.5 bg-gradient-to-r from-[#F7931A] to-[#F7931A]/70" />
              <div className="absolute hidden md:block top-[60px] left-[calc(50%+28px)] w-[calc(33.33%-56px)] h-0.5 bg-gradient-to-r from-[#F7931A]/70 to-[#F7931A]/10" />

              {/* Mobile chain: vertical ledger rail through the node centers */}
              <div className="absolute md:hidden left-[84px] top-8 bottom-8 w-0.5 bg-gradient-to-b from-[#F7931A] via-[#F7931A]/40 to-transparent" />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                {steps.map((s) => (
                  <div
                    key={s.step}
                    className="group relative rounded-2xl border border-border/70 bg-background/60 backdrop-blur-sm p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[#F7931A]/50 flex gap-6 md:block"
                  >
                    {/* Chain node — top-center on desktop, left rail on mobile */}
                    <div className="hidden md:flex md:justify-center md:mb-8">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#EA580C] to-[#F7931A] text-white flex items-center justify-center font-mono font-bold text-lg shadow-[0_0_25px_-6px_rgba(247,147,26,0.6)]">
                        {s.step}
                      </div>
                    </div>
                    <div className="flex md:hidden shrink-0 flex-col items-center">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#EA580C] to-[#F7931A] text-white flex items-center justify-center font-mono font-bold text-lg shadow-[0_0_25px_-6px_rgba(247,147,26,0.6)]">
                        {s.step}
                      </div>
                    </div>

                    <div className="flex-1">
                      <h3 className="font-heading text-xl font-semibold mb-3 flex items-center gap-2">
                        <s.icon className="h-5 w-5 text-[#F7931A]" strokeWidth={1.5} />
                        {s.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{s.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============ FEATURES — built for trust ============ */}
        <section id="features" className="relative py-24 md:py-28">
          <div className="absolute inset-0 bg-grid-pattern opacity-60 pointer-events-none" />
          <div className="relative max-w-7xl mx-auto px-6">
            <div className="mb-14 md:mb-16 max-w-2xl">
              <div className="flex items-center gap-3 mb-5">
                <Lock className="h-4 w-4 text-[#F7931A]" />
                <span className="text-xs font-mono font-semibold uppercase tracking-widest text-[#F7931A]">
                  Engineered Precision
                </span>
              </div>
              <h2 className="text-3xl md:text-5xl font-heading font-bold tracking-tight mb-4">
                Built for{" "}
                <span className="bg-gradient-to-r from-[#F7931A] to-[#FFD600] bg-clip-text text-transparent">
                  Trust & Privacy
                </span>
              </h2>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                Every layer is designed around cryptographic integrity, selective disclosure, and decentralized control.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[#F7931A]/50 hover:shadow-[0_0_30px_-10px_rgba(247,147,26,0.25)]"
                >
                  {/* Watermark icon */}
                  <feature.icon
                    className="absolute -right-4 -bottom-4 h-28 w-28 text-[#F7931A] opacity-[0.05] rotate-12 transition-all duration-500 group-hover:opacity-20 group-hover:rotate-0"
                    strokeWidth={1}
                  />

                  {/* Holographic icon node */}
                  <div className="relative w-12 h-12 rounded-xl bg-[#EA580C]/15 border border-[#EA580C]/40 flex items-center justify-center mb-6 transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(234,88,12,0.4)]">
                    <feature.icon className="h-5 w-5 text-[#F7931A]" strokeWidth={1.5} />
                  </div>

                  <h3 className="font-heading text-xl font-semibold mb-3">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ CTA — the golden call ============ */}
        <section className="relative py-24 md:py-28 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#EA580C] to-[#F7931A] opacity-[0.06]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-[#FFD600] opacity-[0.06] blur-[120px]" />
          <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-[#F7931A]/30 bg-[#F7931A]/10 px-4 py-1.5 mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F7931A] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F7931A]" />
              </span>
              <span className="text-xs font-mono font-semibold uppercase tracking-widest text-[#F7931A]">
                Network Live
              </span>
            </div>

            <h2 className="text-4xl md:text-6xl font-heading font-bold tracking-tight mb-6">
              Ready to bring
              <br />
              <span className="bg-gradient-to-r from-[#F7931A] to-[#FFD600] bg-clip-text text-transparent">
                trust on-chain?
              </span>
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-lg mx-auto mb-10 leading-relaxed">
              Join the ecosystem — issue your first credential, store it in your wallet, or verify one in seconds.
            </p>
            <Button
              size="xl"
              onClick={() => navigate(user ? getRolePath(role || "holder") : "/auth")}
            >
              {user ? "Go to Dashboard" : "Create Account"} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </main>

      {/* Footer — precision minimal */}
      <footer className="border-t border-border py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#EA580C] to-[#F7931A] flex items-center justify-center">
              <Fingerprint className="h-3.5 w-3.5 text-white" strokeWidth={1.75} />
            </div>
            <span className="text-sm font-heading font-semibold">BlockID</span>
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
