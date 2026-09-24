import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, User, Building2, ArrowRight, LogOut, Fingerprint,
  Lock, Globe, CheckCircle2, Link2, FileCheck, Eye, Zap, Bitcoin, Boxes, Activity
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
    accentIcon: "text-issuer",
    accentCard: "hover:border-issuer/60 hover:shadow-[0_0_40px_-10px_rgba(234,88,12,0.35)]",
    nodeBg: "bg-issuer/15 border-issuer/40",
    nodeGlow: "shadow-[0_0_22px_-4px_rgba(234,88,12,0.6)]",
  },
  {
    id: "holder",
    title: "Holder",
    description: "Store, manage and present your verifiable credentials securely",
    icon: User,
    path: "/holder",
    role: "holder",
    accentIcon: "text-holder",
    accentCard: "hover:border-holder/60 hover:shadow-[0_0_40px_-10px_rgba(255,214,0,0.35)]",
    nodeBg: "bg-holder/15 border-holder/40",
    nodeGlow: "shadow-[0_0_22px_-4px_rgba(255,214,0,0.6)]",
  },
  {
    id: "verifier",
    title: "Verifier",
    description: "Request and verify credential presentations from holders",
    icon: Building2,
    path: "/verifier",
    role: "verifier",
    accentIcon: "text-verifier",
    accentCard: "hover:border-verifier/60 hover:shadow-[0_0_40px_-10px_rgba(247,147,26,0.35)]",
    nodeBg: "bg-verifier/15 border-verifier/40",
    nodeGlow: "shadow-[0_0_22px_-4px_rgba(247,147,26,0.6)]",
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

const heroStats = [
  {
    label: "Verification",
    value: "< 2s",
    className: "top-[4%] -left-2 md:-left-8",
  },
  {
    label: "SHA-256",
    value: "Anchored",
    className: "top-[30%] -right-2 md:-right-6",
  },
  {
    label: "Trust",
    value: "On-Chain",
    className: "bottom-[6%] left-[6%]",
  },
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
      {/* Neon scene lights */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[900px] max-w-full">
        <div className="absolute inset-0 bg-[#F7931A]/8 blur-[140px] rounded-full" />
        <div className="absolute inset-10 bg-[#FFD600]/5 blur-[120px] rounded-full" />
      </div>

      {/* Header — glass */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#EA580C] to-[#F7931A] flex items-center justify-center shadow-[0_0_20px_-4px_rgba(247,147,26,0.6)]">
                <Fingerprint className="h-5 w-5 text-white" strokeWidth={1.75} />
              </div>
              <span className="font-heading text-lg font-bold tracking-tight">BlockID</span>
            </div>

            {/* Nav — mono, uppercase, glow hover */}
            <nav className="hidden md:flex items-center gap-8 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <button onClick={() => scrollTo("portals")} className="underline-brand hover:text-[#F7931A] transition-colors duration-200">Portals</button>
              <button onClick={() => scrollTo("how-it-works")} className="underline-brand hover:text-[#F7931A] transition-colors duration-200">How it works</button>
              <button onClick={() => scrollTo("features")} className="underline-brand hover:text-[#F7931A] transition-colors duration-200">Features</button>
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
                <Button size="sm" onClick={() => navigate("/auth")}>Sign In</Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* ============ HERO ============ */}
        <section className="relative">
          <div className="absolute inset-0 bg-grid-pattern bg-grid-pattern-fade pointer-events-none" />
          <div className="absolute top-24 -left-32 w-96 h-96 rounded-full bg-[#EA580C]/10 blur-[130px] pointer-events-none" />
          <div className="absolute bottom-0 -right-32 w-96 h-96 rounded-full bg-[#FFD600]/10 blur-[130px] pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-16 md:pt-28 md:pb-24 grid lg:grid-cols-[7fr_5fr] gap-16 items-center">
            {/* Copy */}
            <FadeIn>
              <div className="inline-flex items-center gap-2.5 rounded-full border border-[#F7931A]/30 bg-[#F7931A]/5 px-4 py-2 mb-10 shadow-[0_0_20px_-8px_rgba(247,147,26,0.5)]">
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#F7931A] opacity-60 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F7931A]" />
                </span>
                <span className="text-xs font-mono font-semibold uppercase tracking-[0.15em] text-[#F7931A]">
                  W3C Verifiable Credentials
                </span>
              </div>

              <h1 className="font-heading font-bold tracking-tight text-5xl sm:text-6xl md:text-7xl leading-[1.02] mb-10">
                Blockchain
                <br />Based
                <br />
                <span className="text-gradient-bitcoin">Decentralized</span>
                <br />Identity
              </h1>

              <p className="text-base md:text-lg text-muted-foreground max-w-xl mb-12 leading-relaxed">
                Issue, hold, and verify academic credentials on a blockchain-based trust
                framework. Secured by cryptography, anchored on-chain, and compliant with global standards.
              </p>

              {/* CTAs — gradient pills */}
              <div className="flex flex-wrap gap-6">
                <Button
                  size="lg"
                  className="font-mono uppercase tracking-widest"
                  onClick={() => navigate(user ? getRolePath(role || "holder") : "/auth")}
                >
                  Get Started <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="font-mono uppercase tracking-widest"
                  onClick={() => scrollTo("portals")}
                >
                  Learn More
                </Button>
              </div>
            </FadeIn>

            {/* Orbital orb — spinning rings + floating stat cards */}
            <FadeIn delay={MOTION.STAGGER} className="hidden md:block">
              <div className="relative h-[420px] lg:h-[460px]">
                <div className="absolute inset-0 flex items-center justify-center animate-float">
                  {/* Glowing core */}
                  <div className="relative w-44 h-44 rounded-full bg-[conic-gradient(from_0deg,#EA580C,#F7931A,#FFD600,#F7931A,#EA580C)] opacity-95 blur-[1px] shadow-glow-orange-lg flex items-center justify-center">
                    <div className="absolute inset-2 rounded-full bg-[#030304]/40 backdrop-blur-sm flex items-center justify-center">
                      <Bitcoin className="h-16 w-16 text-[#F7931A] animate-glow-pulse" strokeWidth={1.5} />
                    </div>
                    {/* Dotted data stream */}
                    <div className="absolute -inset-6 rounded-full border border-dashed border-[#FFD600]/25 animate-orbit-slow" />
                  </div>

                  {/* Orbital ring — outer */}
                  <div className="absolute w-[340px] h-[340px] rounded-full border border-[#F7931A]/20 animate-orbit-slow">
                    <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-[#F7931A] shadow-[0_0_12px_rgba(247,147,26,0.9)]" />
                  </div>

                  {/* Orbital ring — inner, reverse */}
                  <div className="absolute w-[250px] h-[250px] rounded-full border border-white/10 animate-orbit-reverse">
                    <span className="absolute top-1/2 -right-1 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-[#FFD600] shadow-[0_0_12px_rgba(255,214,0,0.9)]" />
                  </div>

                  {/* Floating stat cards */}
                  {heroStats.map((s) => (
                    <div
                      key={s.label}
                      className={`absolute ${s.className} glass-card rounded-2xl px-4 py-3 shadow-glow-card`}
                    >
                      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                        {s.label}
                      </p>
                      <p className="text-lg font-heading font-semibold text-gradient-bitcoin tabular-nums mt-0.5">
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>

          {/* Stats strip */}
          <div className="relative border-y border-white/10">
            <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none" />
            <div className="relative max-w-7xl mx-auto px-6 py-10">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {stats.map((stat) => (
                  <div key={stat.label} className="text-center md:text-left">
                    <p className="text-gradient-bitcoin font-heading text-4xl font-bold tracking-tight">
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
          <div className="max-w-7xl mx-auto px-6">
            <div className="mb-16 max-w-2xl">
              <div className="flex items-center gap-3 mb-6">
                <Boxes className="h-4 w-4 text-[#F7931A]" />
                <span className="text-label text-[#F7931A]">The Trust Triangle</span>
              </div>
              <h2 className="font-heading text-4xl md:text-5xl font-bold tracking-tight leading-none mb-6">
                Three Roles,<br />One <span className="text-gradient-bitcoin">Ecosystem</span>
              </h2>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                Choose your role in the trust triangle — each portal is purpose-built for its workflow.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {portals.map((portal, i) => {
                const isUserPortal = role === portal.role;
                return (
                  <button
                    key={portal.id}
                    onClick={() => (user ? navigate(portal.path) : navigate("/auth"))}
                    className={`group relative text-left rounded-2xl border border-white/10 bg-[#0F1115] p-8 transition-all duration-300 hover:-translate-y-1 ${portal.accentCard}`}
                  >
                    {/* Watermark icon */}
                    <portal.icon
                      className={`absolute right-4 top-4 h-16 w-16 ${portal.accentIcon} opacity-20 transition-opacity duration-300 group-hover:opacity-100`}
                      strokeWidth={1}
                    />

                    {/* Holographic node */}
                    <div className={`w-12 h-12 rounded-lg ${portal.nodeBg} border flex items-center justify-center mb-10 ${portal.nodeGlow}`}>
                      <portal.icon className={`h-5 w-5 ${portal.accentIcon}`} strokeWidth={1.75} />
                    </div>

                    {i === 1 && (
                      <>
                        <span className="absolute -top-px -left-px h-6 w-6 rounded-tl-2xl border-t-2 border-l-2 border-[#FFD600]" />
                        <span className="absolute -bottom-px -right-px h-6 w-6 rounded-br-2xl border-b-2 border-r-2 border-[#FFD600]" />
                      </>
                    )}

                    <h3 className="font-heading text-2xl font-bold tracking-tight mb-4">{portal.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-8">{portal.description}</p>

                    <span className={`inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] ${portal.accentIcon} underline-brand`}>
                      {isUserPortal ? "Go to portal" : "Enter portal"}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============ HOW IT WORKS — the ledger ============ */}
        <section id="how-it-works" className="relative py-24 md:py-32 bg-[#0F1115]">
          <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />
          <div className="relative max-w-7xl mx-auto px-6">
            <div className="mb-16 max-w-2xl">
              <div className="flex items-center gap-3 mb-6">
                <Link2 className="h-4 w-4 text-[#F7931A]" />
                <span className="text-label text-[#F7931A]">The Protocol</span>
              </div>
              <h2 className="font-heading text-4xl md:text-5xl font-bold tracking-tight leading-none mb-6">
                Trust, <span className="text-gradient-bitcoin">Block by Block</span>
              </h2>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                Every credential flows through a cryptographic ledger — each step immutably linked to the last.
              </p>
            </div>

            <div className="relative">
              {/* Ledger line — orange → transparent */}
              <div className="absolute hidden md:block top-[52px] left-[10%] right-[10%] h-px bg-gradient-to-r from-[#EA580C] via-[#F7931A] to-[#F7931A]/0" />

              <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {steps.map((s) => (
                  <StaggerItem
                    key={s.step}
                    className="group relative rounded-2xl border border-white/10 bg-background p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[#F7931A]/50 hover:shadow-glow-card overflow-hidden"
                  >
                    <s.icon
                      className="absolute -right-4 -bottom-4 h-24 w-24 text-[#F7931A]/5 transition-all duration-500 group-hover:opacity-100 group-hover:text-[#F7931A]/10"
                      strokeWidth={1}
                    />
                    {/* Numbered node */}
                    <div className="relative z-10 inline-flex items-center justify-center w-11 h-11 rounded-full border border-[#F7931A]/40 bg-[#F7931A]/10 mb-8 shadow-[0_0_20px_-6px_rgba(247,147,26,0.7)]">
                      <span className="font-mono text-xs font-semibold text-[#F7931A]">{s.step}</span>
                    </div>
                    <h3 className="relative z-10 font-heading text-2xl font-bold tracking-tight mb-4 flex items-center gap-3">
                      <s.icon className="h-5 w-5 text-[#F7931A]" strokeWidth={1.5} />
                      {s.title}
                    </h3>
                    <p className="relative z-10 text-sm text-muted-foreground leading-relaxed">{s.description}</p>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </div>
        </section>

        {/* ============ FEATURES ============ */}
        <section id="features" className="relative py-24 md:py-32">
          <div className="absolute inset-0 bg-grid-pattern bg-grid-pattern-fade opacity-60 pointer-events-none" />
          <div className="absolute top-1/3 right-0 w-96 h-96 rounded-full bg-[#F7931A]/8 blur-[130px] pointer-events-none" />
          <div className="relative max-w-7xl mx-auto px-6">
            <div className="mb-16 max-w-2xl">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="h-4 w-4 text-[#F7931A]" />
                <span className="text-label text-[#F7931A]">Engineered Precision</span>
              </div>
              <h2 className="font-heading text-4xl md:text-5xl font-bold tracking-tight leading-none mb-6">
                Built for <span className="text-gradient-bitcoin">Trust & Privacy</span>
              </h2>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                Every layer is designed around cryptographic integrity, selective disclosure, and decentralized control.
              </p>
            </div>

            <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature) => (
                <StaggerItem
                  key={feature.title}
                  className="group relative rounded-2xl border border-white/10 bg-[#0F1115] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[#F7931A]/50 hover:shadow-glow-card overflow-hidden"
                >
                  <feature.icon
                    className="absolute -right-3 -bottom-3 h-24 w-24 text-[#F7931A] opacity-[0.05] transition-opacity duration-500 group-hover:opacity-15"
                    strokeWidth={1}
                  />

                  {/* Holographic node badge */}
                  <div className="w-11 h-11 rounded-lg bg-[#EA580C]/20 border border-[#EA580C]/50 flex items-center justify-center mb-6 transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(234,88,12,0.4)]">
                    <feature.icon className="h-5 w-5 text-[#EA580C]" strokeWidth={1.75} />
                  </div>

                  <h3 className="font-heading text-xl font-bold tracking-tight mb-3">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ============ CTA ============ */}
        <section className="relative py-24 md:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[600px] h-[300px] rounded-full bg-[#F7931A]/10 blur-[120px] pointer-events-none" />
          <div className="relative max-w-7xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-[#F7931A]/30 bg-[#F7931A]/5 px-4 py-2 mb-10">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#F7931A] opacity-60 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F7931A]" />
              </span>
              <span className="text-xs font-mono font-semibold uppercase tracking-[0.15em] text-[#F7931A]">
                Network Live
              </span>
            </div>

            <h2 className="font-heading text-4xl md:text-6xl font-bold tracking-tight leading-none mb-8">
              Ready to bring
              <br />
              <span className="text-gradient-bitcoin">trust on-chain?</span>
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-lg mx-auto mb-12 leading-relaxed">
              Join the ecosystem — issue your first credential, store it in your wallet, or verify one in seconds.
            </p>
            <Button
              size="lg"
              className="font-mono uppercase tracking-widest"
              onClick={() => navigate(user ? getRolePath(role || "holder") : "/auth")}
            >
              {user ? "Go to Dashboard" : "Create Account"} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#EA580C] to-[#F7931A] flex items-center justify-center shadow-[0_0_16px_-4px_rgba(247,147,26,0.6)]">
              <Fingerprint className="h-3.5 w-3.5 text-white" strokeWidth={1.75} />
            </div>
            <span className="font-heading text-sm font-bold tracking-tight">BlockID</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-[#F7931A]" />
              Anchored on Polygon
            </span>
            <p className="text-sm font-mono text-muted-foreground">
              Built on W3C Verifiable Credentials & blockchain-based identifiers
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;