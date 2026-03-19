import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Fingerprint, ArrowLeft, KeyRound, Shield, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import ParticleBackground from "@/components/ui/ParticleBackground";

type AuthView = "login" | "signup" | "forgot" | "check-email";

const roleIcons = {
  issuer: Shield,
  holder: User,
  verifier: Building2,
};

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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background effects */}
      <ParticleBackground particleCount={40} />
      <div className="absolute inset-0 mesh-gradient pointer-events-none" />
      
      {/* Floating orbs */}
      <motion.div
        animate={{ y: [-15, 15, -15], x: [-8, 8, -8] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 w-[250px] h-[250px] bg-primary/8 rounded-full blur-3xl"
      />
      <motion.div
        animate={{ y: [12, -12, 12] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-verifier/6 rounded-full blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-3 mb-8 relative z-10"
      >
        <div className="relative">
          <Fingerprint className="h-8 w-8 text-primary" />
          <div className="absolute -inset-2 bg-primary/20 rounded-full blur-lg -z-10 animate-glow-pulse" />
        </div>
        <span className="font-display text-2xl font-bold text-foreground tracking-tight">BlockID</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="glass-card border-0 rounded-2xl overflow-hidden">
          {view === "check-email" ? (
            <>
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
                <CardDescription>We've sent a link to <span className="font-medium text-foreground">{email}</span>. Follow the instructions to continue.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full rounded-xl" onClick={() => setView("login")}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back to Sign In
                </Button>
              </CardContent>
            </>
          ) : view === "forgot" ? (
            <>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> Reset Password</CardTitle>
                <CardDescription>Enter your email to receive a password reset link.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <Label htmlFor="reset-email">Email</Label>
                    <Input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-xl" />
                  </div>
                  <Button type="submit" className="w-full rounded-xl glow-primary" disabled={loading}>{loading ? "Sending..." : "Send Reset Link"}</Button>
                  <p className="text-center text-sm">
                    <button type="button" className="text-primary hover:underline font-medium" onClick={() => setView("login")}>
                      Back to Sign In
                    </button>
                  </p>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-center text-2xl">{view === "login" ? "Welcome Back" : "Join BlockID"}</CardTitle>
                <CardDescription className="text-center">
                  {view === "login" ? "Sign in to your blockchain based identity" : "Create your blockchain based identity account"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={view === "login" ? handleLogin : handleSignup} className="space-y-4">
                  {view === "signup" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.3 }}
                      className="space-y-4"
                    >
                      <div>
                        <Label htmlFor="fullName">Full Name</Label>
                        <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="rounded-xl" />
                      </div>
                      <div>
                        <Label htmlFor="organization">Organization</Label>
                        <Input id="organization" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="University / Company" className="rounded-xl" />
                      </div>
                      <div>
                        <Label>Role</Label>
                        <div className="grid grid-cols-3 gap-2 mt-1.5">
                          {(["issuer", "holder", "verifier"] as const).map((r) => {
                            const Icon = roleIcons[r];
                            const isSelected = role === r;
                            return (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setRole(r)}
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                                  isSelected
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/30"
                                }`}
                              >
                                <Icon className={`h-5 w-5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                                <span className={`text-xs font-medium capitalize ${isSelected ? "text-primary" : "text-muted-foreground"}`}>{r}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-xl" />
                  </div>
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="rounded-xl" />
                  </div>
                  {view === "login" && (
                    <div className="text-right">
                      <button type="button" className="text-xs text-muted-foreground hover:text-primary transition-colors" onClick={() => setView("forgot")}>
                        Forgot password?
                      </button>
                    </div>
                  )}
                  <Button type="submit" className="w-full rounded-xl glow-primary" disabled={loading}>
                    {loading ? "Please wait..." : view === "login" ? "Sign In" : "Create Account"}
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    {view === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                    <button type="button" className="text-primary hover:underline font-medium" onClick={() => setView(view === "login" ? "signup" : "login")}>
                      {view === "login" ? "Sign Up" : "Sign In"}
                    </button>
                  </p>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  );
};

export default Auth;
