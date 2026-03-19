import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, User, Building2, ArrowRight, Fingerprint, LogOut,
  Lock, Globe, Zap, CheckCircle2, Link2, FileCheck, Eye, Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import ParticleBackground from "@/components/ui/ParticleBackground";
import AnimatedCounter from "@/components/ui/AnimatedCounter";
import ThemeToggle from "@/components/ui/ThemeToggle";

const portals = [
  {
    id: "issuer",
    title: "Issuer Portal",
    description: "Issue and manage verifiable credentials for educational institutions",
    icon: Shield,
    path: "/issuer",
    role: "issuer",
  },
  {
    id: "holder",
    title: "Holder Wallet",
    description: "Store, manage and present your verifiable credentials securely",
    icon: User,
    path: "/holder",
    role: "holder",
  },
  {
    id: "verifier",
    title: "Verifier Portal",
    description: "Request and verify credential presentations from holders",
    icon: Building2,
    path: "/verifier",
    role: "verifier",
  },
];

const features = [
  { icon: Lock, title: "Tamper-Proof Credentials", description: "Cryptographic hashing ensures credential integrity from issuance through verification." },
  { icon: Globe, title: "W3C Standards", description: "Built on W3C Verifiable Credentials and blockchain-based identifiers for global interoperability." },
  { icon: Zap, title: "Instant Verification", description: "AI-powered analysis verifies credentials in seconds with confidence scoring." },
  { icon: Link2, title: "Blockchain Anchored", description: "Optional on-chain anchoring for immutable proof of credential existence." },
  { icon: Eye, title: "Selective Disclosure", description: "Share only the fields you choose — maintain privacy while proving qualifications." },
  { icon: FileCheck, title: "Revocation Support", description: "Real-time revocation status checks ensure only valid credentials are accepted." },
];

const stats = [
  { value: "W3C", label: "Standards Compliant" },
  { value: "256", label: "Bit SHA Hashing", suffix: "-bit" },
  { value: "Real-time", label: "Verification" },
  { value: "E2E", label: "Encrypted" },
];

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: "blur(4px)" },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      delay: i * 0.1,
      duration: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  }),
};

const Landing = () => {
  const navigate = useNavigate();
  const { user, role, profile, signOut, loading } = useAuth();

  useEffect(() => {
    if (!loading && user && role) {
      navigate(`/${role}`, { replace: true });
    }
  }, [loading, user, role, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="glass-header px-6 py-4 sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3"
          >
            <div className="relative">
              <Fingerprint className="h-7 w-7 text-primary" />
              <div className="absolute -inset-2 bg-primary/20 rounded-full blur-lg -z-10 animate-glow-pulse" />
            </div>
            <span className="font-display text-xl font-semibold text-foreground tracking-tight">
              BlockID
            </span>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-2"
          >
            <ThemeToggle className="rounded-xl" />
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground hidden sm:block">
                  {profile?.full_name || user.email}
                </span>
                <Button variant="ghost" size="sm" onClick={() => signOut()} className="rounded-xl">
                  <LogOut className="h-4 w-4 mr-1" /> Sign Out
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => navigate("/auth")} className="rounded-xl glass">
                Sign In
              </Button>
            )}
          </motion.div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative px-6 pt-20 pb-24 md:pt-32 md:pb-32">
          <ParticleBackground particleCount={60} />
          
          {/* Mesh gradient overlay */}
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />
          
          {/* Floating orbs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <motion.div
              animate={{ y: [-10, 10, -10], x: [-5, 5, -5] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-primary/8 rounded-full blur-3xl"
            />
            <motion.div
              animate={{ y: [10, -10, 10], x: [5, -5, 5] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-1/3 right-1/4 w-[250px] h-[250px] bg-issuer/6 rounded-full blur-3xl"
            />
            <motion.div
              animate={{ y: [-8, 12, -8] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
              className="absolute bottom-1/4 left-1/2 w-[350px] h-[350px] bg-verifier/5 rounded-full blur-3xl"
            />
          </div>

          <div className="container mx-auto max-w-5xl relative z-10">
            <motion.div
              className="text-center"
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
            >
              <motion.div variants={fadeUp} custom={0} className="mb-6">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-primary text-sm font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  W3C Verifiable Credentials Standard
                </span>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                custom={1}
                className="text-5xl md:text-7xl font-display font-bold text-foreground tracking-tight leading-[1.08] mb-6"
              >
                Blockchain Based Identity
                <br />
                <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/50 bg-clip-text text-transparent">
                  for Education
                </span>
              </motion.h1>

              <motion.p
                variants={fadeUp}
                custom={2}
                className="text-lg md:text-xl text-muted-foreground font-body leading-relaxed max-w-2xl mx-auto mb-10"
              >
                Issue, hold, and verify academic credentials on a blockchain-based trust
                framework — secured by cryptography and blockchain anchoring.
              </motion.p>

              <motion.div variants={fadeUp} custom={3} className="flex flex-wrap justify-center gap-4">
                <Button
                  size="lg"
                  onClick={() => navigate(user ? `/${role || "holder"}` : "/auth")}
                  className="group rounded-xl glow-primary"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
                  className="rounded-xl glass"
                >
                  Learn More
                </Button>
              </motion.div>
            </motion.div>

            {/* Stats bar */}
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.6 }}
              className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-0 md:divide-x divide-border/50 glass-card rounded-2xl p-6 md:p-0"
            >
              {stats.map((stat) => (
                <div key={stat.label} className="text-center md:py-6">
                  <div className="text-2xl font-display font-bold text-foreground">{stat.value}</div>
                  <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Portal Cards */}
        <section className="px-6 py-20 relative">
          <div className="absolute inset-0 mesh-gradient opacity-50 pointer-events-none" />
          <div className="container mx-auto max-w-5xl relative z-10">
            <motion.div
              className="text-center mb-14"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground tracking-tight mb-4">
                Three Roles, One Ecosystem
              </h2>
              <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                Choose your role in the trust triangle — each portal is purpose-built for its workflow.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {portals.map((portal, index) => {
                const isUserPortal = role === portal.role;
                return (
                  <motion.button
                    key={portal.id}
                    onClick={() => (user ? navigate(portal.path) : navigate("/auth"))}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ delay: index * 0.12, duration: 0.5 }}
                    whileHover={{ y: -8, scale: 1.02, transition: { duration: 0.25 } }}
                    className={`group text-left glass-card rounded-2xl p-7 ${
                      isUserPortal ? `ring-2 ring-${portal.id}/40` : ""
                    }`}
                  >
                    <motion.div
                      className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
                      style={{ backgroundColor: `hsla(var(--${portal.id}-muted))` }}
                      whileHover={{ rotate: [0, -5, 5, 0], transition: { duration: 0.4 } }}
                    >
                      <portal.icon className="h-7 w-7" style={{ color: `hsl(var(--${portal.id}))` }} />
                    </motion.div>
                    <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                      {portal.title}
                    </h3>
                    <p className="text-sm text-muted-foreground font-body leading-relaxed mb-5">
                      {portal.description}
                    </p>
                    <div
                      className="flex items-center gap-1 text-sm font-medium transition-colors"
                      style={{ color: `hsl(var(--${portal.id}))` }}
                    >
                      {isUserPortal ? "Go to portal" : "Enter portal"}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="px-6 py-20 md:py-28 relative">
          <div className="container mx-auto max-w-5xl relative z-10">
            <motion.div
              className="text-center mb-14"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground tracking-tight mb-4">
                Built for Trust & Privacy
              </h2>
              <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                Every layer is designed around cryptographic integrity, selective disclosure, and decentralized control.
              </p>
            </motion.div>

            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={staggerContainer}
            >
              {features.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  variants={fadeUp}
                  custom={i}
                  whileHover={{ y: -6, transition: { duration: 0.25 } }}
                  className="group glass-card rounded-2xl p-6"
                >
                  <motion.div
                    className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ type: "spring", stiffness: 400 }}
                  >
                    <feature.icon className="h-5 w-5" />
                  </motion.div>
                  <h3 className="font-display text-base font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground font-body leading-relaxed">
                    {feature.description}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 py-20 relative">
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="container mx-auto max-w-3xl text-center glass-card rounded-3xl p-12 md:p-16 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-verifier/6 pointer-events-none" />
            <ParticleBackground particleCount={20} className="opacity-40" />
            <div className="relative z-10">
              <motion.div
                animate={{ y: [-4, 4, -4] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Layers className="h-12 w-12 text-primary mx-auto mb-6" />
              </motion.div>
              <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground tracking-tight mb-4">
                Ready to bring trust on-chain?
              </h2>
              <p className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto">
                Join the ecosystem — issue your first credential, store it in your wallet, or verify one in seconds.
              </p>
              <Button
                size="lg"
                onClick={() => navigate(user ? `/${role || "holder"}` : "/auth")}
                className="group rounded-xl glow-primary"
              >
                {user ? "Go to Dashboard" : "Create Account"}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="glass-header px-6 py-6">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-display text-muted-foreground">BlockID</span>
          </div>
          <p className="text-xs text-muted-foreground font-body">
            Built on W3C Verifiable Credentials & blockchain-based identifiers
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
