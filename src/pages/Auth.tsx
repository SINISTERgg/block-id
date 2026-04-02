import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Fingerprint, ArrowLeft, KeyRound, Shield, User, Building2,
  Lock, Globe, Zap, Link2, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import ParticleBackground from "@/components/ui/ParticleBackground";

type AuthView = "login" | "signup" | "forgot" | "check-email";

const roleConfig = {
  issuer: {
    icon: Shield,
    label: "Issuer",
    description: "Issue credentials",
    color: "hsl(var(--issuer))",
    muted: "hsla(var(--issuer-muted))",
    glow: "badge-glow-issuer",
  },
  holder: {
    icon: User,
    label: "Holder",
    description: "Manage wallet",
    color: "hsl(var(--holder))",
    muted: "hsla(var(--holder-muted))",
    glow: "badge-glow-holder",
  },
  verifier: {
    icon: Building2,
    label: "Verifier",
    description: "Verify credentials",
    color: "hsl(var(--verifier))",
    muted: "hsla(var(--verifier-muted))",
    glow: "badge-glow-verifier",
  },
};

const brandFeatures = [
  { icon: Lock, text: "Tamper-proof cryptographic credentials" },
  { icon: Globe, text: "W3C Verifiable Credentials Standard" },
  { icon: Zap, text: "Real-time blockchain verification" },
  { icon: Link2, text: "Decentralized identifier anchoring" },
];

const Auth = () => {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState<"issuer" | "holder" | "verifier">("holder");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, user, role: userRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && userRole) {
      navigate(`/${userRole}`, { replace: true });
    }
  }, [user, userRole, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast({ title: "Sign in failed", description: error, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signUp(email, password, fullName, organization, role);
    if (error) {
      toast({ title: "Sign up failed", description: error, variant: "destructive" });
    } else {
      setView("check-email");
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setView("check-email");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex overflow-hidden">
      {/* ── Left branding panel (hidden on mobile) ── */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-[42%] flex-col relative overflow-hidden bg-gradient-to-br from-background via-background to-background">
        {/* Layered mesh + orbs */}
        <div className="absolute inset-0 mesh-gradient" />
        <ParticleBackground particleCount={35} className="opacity-40" />
        <motion.div
          animate={{ y: [-12, 12, -12], x: [-6, 6, -6] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/3 left-1/4 w-[280px] h-[280px] bg-primary/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ y: [10, -10, 10] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-1/4 right-1/4 w-[220px] h-[220px] bg-verifier/8 rounded-full blur-3xl"
        />
        {/* Decorative rotating ring */}
        <div className="absolute top-[18%] right-[15%] w-48 h-48 rounded-full border border-primary/10 animate-spin-slow pointer-events-none" />
        <div className="absolute top-[20%] right-[17%] w-36 h-36 rounded-full border border-primary/8 pointer-events-none" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center h-full px-12 xl:px-16 py-12">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-3 mb-14"
          >
            <div className="relative">
              <Fingerprint className="h-9 w-9 text-primary" />
              <div className="absolute -inset-2 bg-primary/20 rounded-full blur-lg -z-10 animate-glow-pulse" />
            </div>
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">BlockID</span>
          </motion.div>

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h1 className="font-display text-4xl xl:text-5xl font-bold leading-tight text-foreground mb-4">
              Blockchain Based{" "}
              <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/50 bg-clip-text text-transparent">
                Identity
              </span>
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed mb-10 max-w-xs">
              Issue, hold, and verify academic credentials secured by cryptography and blockchain anchoring.
            </p>
          </motion.div>

          {/* Feature pills */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="space-y-3"
          >
            {brandFeatures.map((f, i) => (
              <motion.div
                key={i}
                variants={{ hidden: { opacity: 0, x: -16 }, visible: { opacity: 1, x: 0 } }}
                className="flex items-center gap-3 glass rounded-xl px-4 py-2.5 w-fit"
              >
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm text-foreground/80 font-medium">{f.text}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* Bottom decorative chain dots */}
          <div className="mt-auto pt-12 flex items-center gap-2">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-1.5 rounded-full bg-primary/30"
                style={{ width: i === 0 ? "2.5rem" : "0.5rem", opacity: 1 - i * 0.18 }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-8 py-10 relative overflow-hidden">
        {/* Mobile background */}
        <div className="lg:hidden absolute inset-0 mesh-gradient pointer-events-none" />
        <div className="lg:hidden">
          <ParticleBackground particleCount={25} className="opacity-30" />
        </div>

        {/* Back to landing */}
        <div className="absolute top-4 left-4 z-10">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="rounded-xl gap-1.5 text-muted-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Home
          </Button>
        </div>

        {/* Mobile logo */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:hidden flex items-center gap-2 mb-8 relative z-10"
        >
          <div className="relative">
            <Fingerprint className="h-7 w-7 text-primary" />
            <div className="absolute -inset-2 bg-primary/20 rounded-full blur-lg -z-10 animate-glow-pulse" />
          </div>
          <span className="font-display text-xl font-bold text-foreground tracking-tight">BlockID</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-md relative z-10"
        >
          <Card className="glass-card border-0 rounded-2xl overflow-hidden shadow-2xl">
            <AnimatePresence mode="wait">
              {view === "check-email" ? (
                <motion.div
                  key="check-email"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                >
                  <CardHeader className="text-center pb-2">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                      className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4"
                    >
                      <Fingerprint className="h-8 w-8 text-primary" />
                    </motion.div>
                    <CardTitle className="font-display">Check your email</CardTitle>
                    <CardDescription>
                      We've sent a link to <span className="font-medium text-foreground">{email}</span>. Follow the instructions to continue.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full rounded-xl" onClick={() => setView("login")}>
                      <ArrowLeft className="h-4 w-4 mr-2" /> Back to Sign In
                    </Button>
                  </CardContent>
                </motion.div>
              ) : view === "forgot" ? (
                <motion.div
                  key="forgot"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                >
                  <CardHeader>
                    <CardTitle className="font-display flex items-center gap-2">
                      <KeyRound className="h-5 w-5 text-primary" /> Reset Password
                    </CardTitle>
                    <CardDescription>Enter your email to receive a password reset link.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="reset-email">Email</Label>
                        <Input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-xl focus-visible:ring-primary/40" />
                      </div>
                      <Button type="submit" className="w-full rounded-xl glow-primary" disabled={loading}>
                        {loading ? "Sending..." : "Send Reset Link"}
                      </Button>
                      <p className="text-center text-sm">
                        <button type="button" className="text-primary hover:underline font-medium" onClick={() => setView("login")}>
                          Back to Sign In
                        </button>
                      </p>
                    </form>
                  </CardContent>
                </motion.div>
              ) : (
                <motion.div
                  key={view}
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                >
                  <CardHeader className="pb-4">
                    {/* Gradient accent strip */}
                    <div className="h-1 w-16 rounded-full bg-gradient-to-r from-primary to-primary/40 mb-5" />
                    <CardTitle className="font-display text-2xl">
                      {view === "login" ? "Welcome back" : "Join BlockID"}
                    </CardTitle>
                    <CardDescription>
                      {view === "login"
                        ? "Sign in to your blockchain based identity"
                        : "Create your blockchain based identity account"}
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    <form onSubmit={view === "login" ? handleLogin : handleSignup} className="space-y-4">
                      <AnimatePresence>
                        {view === "signup" && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            className="space-y-4 overflow-hidden"
                          >
                            <div className="space-y-1.5">
                              <Label htmlFor="fullName">Full Name</Label>
                              <Input
                                id="fullName"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                required
                                placeholder="Your full name"
                                className="rounded-xl focus-visible:ring-primary/40"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="organization">Organization</Label>
                              <Input
                                id="organization"
                                value={organization}
                                onChange={(e) => setOrganization(e.target.value)}
                                placeholder="University / Company"
                                className="rounded-xl focus-visible:ring-primary/40"
                              />
                            </div>

                            {/* Role picker */}
                            <div className="space-y-2">
                              <Label>Select your role</Label>
                              <div className="grid grid-cols-3 gap-2 mt-1">
                                {(Object.entries(roleConfig) as [keyof typeof roleConfig, typeof roleConfig["issuer"]][]).map(([key, cfg]) => {
                                  const Icon = cfg.icon;
                                  const isSelected = role === key;
                                  return (
                                    <motion.button
                                      key={key}
                                      type="button"
                                      onClick={() => setRole(key)}
                                      whileHover={{ scale: 1.04 }}
                                      whileTap={{ scale: 0.97 }}
                                      className={`relative flex flex-col items-center gap-1.5 p-3.5 rounded-xl border-2 transition-all duration-200 ${
                                        isSelected
                                          ? "border-primary/60 bg-primary/5"
                                          : "border-border hover:border-primary/25 bg-transparent"
                                      }`}
                                    >
                                      {isSelected && (
                                        <motion.div
                                          layoutId="role-selection"
                                          className="absolute inset-0 rounded-xl pointer-events-none"
                                          style={{ backgroundColor: cfg.muted }}
                                          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                                        />
                                      )}
                                      <div
                                        className="relative z-10 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                                        style={{ backgroundColor: isSelected ? cfg.muted : "transparent" }}
                                      >
                                        <Icon
                                          className="h-4.5 w-4.5 transition-colors"
                                          style={{ color: isSelected ? cfg.color : "hsl(var(--muted-foreground))" }}
                                        />
                                      </div>
                                      <span
                                        className="relative z-10 text-xs font-semibold capitalize transition-colors"
                                        style={{ color: isSelected ? cfg.color : "hsl(var(--muted-foreground))" }}
                                      >
                                        {cfg.label}
                                      </span>
                                      <span
                                        className="relative z-10 text-[10px] text-muted-foreground leading-tight text-center"
                                      >
                                        {cfg.description}
                                      </span>
                                    </motion.button>
                                  );
                                })}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          placeholder="you@example.com"
                          className="rounded-xl focus-visible:ring-primary/40"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password">Password</Label>
                          {view === "login" && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-primary transition-colors"
                              onClick={() => setView("forgot")}
                            >
                              Forgot password?
                            </button>
                          )}
                        </div>
                        <Input
                          id="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          placeholder="••••••••"
                          className="rounded-xl focus-visible:ring-primary/40"
                        />
                      </div>

                      <Button
                        type="submit"
                        className="w-full rounded-xl glow-primary mt-2"
                        disabled={loading}
                        size="lg"
                      >
                        {loading ? "Please wait..." : view === "login" ? "Sign In" : "Create Account"}
                      </Button>

                      <p className="text-center text-sm text-muted-foreground pt-1">
                        {view === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                        <button
                          type="button"
                          className="text-primary hover:underline font-medium"
                          onClick={() => setView(view === "login" ? "signup" : "login")}
                        >
                          {view === "login" ? "Sign Up" : "Sign In"}
                        </button>
                      </p>
                    </form>
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>

        {/* Footer note */}
        <p className="mt-6 text-xs text-muted-foreground/60 relative z-10">
          Secured by cryptography · W3C Verifiable Credentials
        </p>
      </div>
    </div>
  );
};

export default Auth;
