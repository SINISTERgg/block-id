import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Fingerprint, ArrowLeft, KeyRound, Shield, User, Building2,
  Lock, Globe, CheckCircle2, Eye, EyeOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type AuthView = "login" | "signup" | "forgot" | "check-email";

const roleConfig = {
  issuer: {
    icon: Shield,
    label: "Issuer",
    description: "Issue credentials",
  },
  holder: {
    icon: User,
    label: "Holder",
    description: "Manage wallet",
  },
  verifier: {
    icon: Building2,
    label: "Verifier",
    description: "Verify credentials",
  },
};

const brandFeatures = [
  { icon: Lock, text: "Tamper-proof cryptographic credentials" },
  { icon: Globe, text: "W3C Verifiable Credentials Standard" },
  { icon: CheckCircle2, text: "Real-time blockchain verification" },
  { icon: Lock, text: "Decentralized identifier anchoring" },
];

const Auth = () => {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState<"issuer" | "holder" | "verifier">("holder");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen bg-background flex">
      <div className="hidden lg:flex lg:w-[45%] bg-card border-r border-border flex-col relative">
        <div className="absolute inset-0 pattern-dots opacity-50" />
        
        <div className="relative z-10 flex flex-col justify-center h-full px-12 xl:px-16 py-12">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Fingerprint className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-2xl font-bold tracking-tight">BlockID</span>
          </div>

          <h1 className="font-display text-4xl xl:text-5xl font-bold leading-tight mb-6">
            <span className="text-foreground">Blockchain Based</span>
            <br />
            <span className="text-primary">Identity</span>
          </h1>
          
          <p className="text-muted-foreground text-base leading-relaxed mb-10 max-w-sm">
            Issue, hold, and verify academic credentials secured by cryptography and blockchain anchoring.
          </p>

          <div className="space-y-4">
            {brandFeatures.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                <span className="text-sm text-foreground/80">{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="absolute top-4 left-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground">
            <ArrowLeft className="h-4 w-4 mr-2" /> Home
          </Button>
        </div>

        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
            <Fingerprint className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">BlockID</span>
        </div>

        <div className="w-full max-w-sm">
          {view === "check-email" ? (
            <Card className="solid-card">
              <CardHeader className="text-center pb-4">
                <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Fingerprint className="h-7 w-7 text-primary" />
                </div>
                <CardTitle className="font-display">Check your email</CardTitle>
                <CardDescription>
                  We've sent a link to <span className="font-medium text-foreground">{email}</span>. Follow the instructions to continue.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" onClick={() => setView("login")}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back to Sign In
                </Button>
              </CardContent>
            </Card>
          ) : view === "forgot" ? (
            <Card className="solid-card">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" /> Reset Password
                </CardTitle>
                <CardDescription>Enter your email to receive a password reset link.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input 
                      id="reset-email" 
                      type="email" 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      required 
                      className="input-solid h-11" 
                    />
                  </div>
                  <Button type="submit" className="w-full btn-primary" disabled={loading}>
                    {loading ? "Sending..." : "Send Reset Link"}
                  </Button>
                  <p className="text-center text-sm">
                    <button type="button" className="text-primary hover:underline font-medium" onClick={() => setView("login")}>
                      Back to Sign In
                    </button>
                  </p>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="solid-card">
              <CardHeader className="pb-4">
                <div className="w-12 h-1 bg-primary rounded-full mb-4" />
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
                  {view === "signup" && (
                    <div className="space-y-4 pb-4 border-b border-border">
                      <div className="space-y-2">
                        <Label htmlFor="fullName">Full Name</Label>
                        <Input
                          id="fullName"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          required
                          placeholder="Your full name"
                          className="input-solid"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="organization">Organization</Label>
                        <Input
                          id="organization"
                          value={organization}
                          onChange={(e) => setOrganization(e.target.value)}
                          placeholder="University / Company"
                          className="input-solid"
                        />
                      </div>

                      <div className="space-y-3">
                        <Label>Select your role</Label>
                        <div className="grid grid-cols-3 gap-3">
                          {(Object.entries(roleConfig) as [keyof typeof roleConfig, typeof roleConfig["issuer"]][]).map(([key, cfg]) => {
                            const Icon = cfg.icon;
                            const isSelected = role === key;
                            const colorClass = key === "issuer" ? "issuer" : key === "holder" ? "holder" : "verifier";
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setRole(key)}
                                className={`p-4 rounded-lg border-2 transition-all text-center ${
                                  isSelected
                                    ? `border-primary bg-primary/5`
                                    : "border-border hover:border-primary/30"
                                }`}
                              >
                                <div className={`w-10 h-10 rounded-lg mx-auto mb-2 flex items-center justify-center ${
                                  isSelected 
                                    ? `bg-${colorClass}` 
                                    : "bg-muted"
                                }`}>
                                  <Icon className={`h-5 w-5 ${isSelected ? "text-white" : "text-muted-foreground"}`} />
                                </div>
                                <span className={`text-sm font-semibold block ${isSelected ? "text-primary" : ""}`}>
                                  {cfg.label}
                                </span>
                                <span className="text-xs text-muted-foreground block mt-0.5">
                                  {cfg.description}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                      className="input-solid"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {view === "login" && (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline font-medium"
                          onClick={() => setView("forgot")}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="••••••••"
                        className="input-solid pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full btn-primary h-11 mt-2"
                    disabled={loading}
                  >
                    {loading ? "Please wait..." : view === "login" ? "Sign In" : "Create Account"}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground pt-2">
                    {view === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                    <button
                      type="button"
                      className="text-primary hover:underline font-semibold"
                      onClick={() => setView(view === "login" ? "signup" : "login")}
                    >
                      {view === "login" ? "Sign Up" : "Sign In"}
                    </button>
                  </p>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        <p className="mt-6 text-xs text-muted-foreground/60 flex items-center gap-2">
          <Lock className="h-3 w-3" />
          Secured by cryptography · W3C Verifiable Credentials
        </p>
      </div>
    </div>
  );
};

export default Auth;
