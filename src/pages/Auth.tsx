import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Fingerprint, Lock, Globe, CheckCircle2, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// ── Extracted form components ────────────────────────────────────────────────
import { SignInForm } from "./auth/SignInForm";
import { SignUpForm } from "./auth/SignUpForm";
import { ForgotPasswordForm, CheckEmailCard } from "./auth/ForgotPasswordForm";

type AuthView = "login" | "signup" | "forgot" | "check-email";

const brandFeatures = [
  { icon: Lock,         text: "Tamper-proof cryptographic credentials" },
  { icon: Globe,        text: "W3C Verifiable Credentials Standard" },
  { icon: CheckCircle2, text: "Real-time blockchain verification" },
  { icon: Lock,         text: "Decentralized identifier anchoring" },
];

const getRolePath = (r: string) => r === "org_admin" ? "/admin" : `/${r}`;

const Auth = () => {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState<"issuer" | "holder" | "verifier">("holder");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { signIn, signUp, user, role: userRole, accountStatus } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && userRole) {
      if ((userRole === "issuer" || userRole === "verifier") && accountStatus !== "approved") {
        navigate(accountStatus === "rejected" ? "/account-rejected" : "/pending-approval", { replace: true });
        return;
      }
      navigate(getRolePath(userRole), { replace: true });
    }
  }, [user, userRole, accountStatus, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) toast({ title: "Sign in failed", description: error, variant: "destructive" });
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signUp(email, password, fullName, organization, role);
    if (error === "_confirmation_required") {
      toast({ title: "Check your email", description: "A confirmation link has been sent. Click it to complete signup." });
      setView("check-email");
    } else if (error) {
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
    <div className="min-h-screen bg-background flex relative">
      {/* Home button — always on top at top-left */}
      <div className="absolute top-4 left-4 z-50">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="border border-border hover:border-primary hover:text-primary transition-colors"
            >
              <Home className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back to Home</TooltipContent>
        </Tooltip>
      </div>

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#EA580C] to-[#F7931A] flex items-center justify-center shadow-[0_0_16px_-4px_rgba(247,147,26,0.6)]">
            <Fingerprint className="h-5 w-5 text-white" />
          </div>
          <span className="font-heading text-xl font-bold tracking-tight">BlockID</span>
        </div>

        <div className="w-full max-w-sm">
          {view === "check-email" ? (
            <CheckEmailCard email={email} onBackToSignIn={() => setView("login")} />
          ) : view === "forgot" ? (
            <ForgotPasswordForm
              email={email}
              setEmail={setEmail}
              loading={loading}
              onSubmit={handleForgotPassword}
              onBackToSignIn={() => setView("login")}
            />
          ) : (
            <Card className="solid-card">
              <CardHeader className="pb-6">
                <div className="w-10 h-1 bg-gradient-to-r from-[#EA580C] to-[#F7931A] rounded-full mb-5 shadow-[0_0_12px_-2px_rgba(247,147,26,0.6)]" />
                <CardTitle className="font-heading text-3xl tracking-tight">
                  {view === "login" ? "Welcome Back" : "Join BlockID"}
                </CardTitle>
                <CardDescription>
                  {view === "login"
                    ? "Sign in to your blockchain based identity"
                    : "Create your blockchain based identity account"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {view === "login" ? (
                  <SignInForm
                    email={email} setEmail={setEmail}
                    password={password} setPassword={setPassword}
                    showPassword={showPassword} setShowPassword={setShowPassword}
                    loading={loading}
                    onSubmit={handleLogin}
                    onForgotPassword={() => setView("forgot")}
                    onSwitchToSignUp={() => setView("signup")}
                  />
                ) : (
                  <SignUpForm
                    email={email} setEmail={setEmail}
                    password={password} setPassword={setPassword}
                    fullName={fullName} setFullName={setFullName}
                    organization={organization} setOrganization={setOrganization}
                    role={role} setRole={setRole}
                    showPassword={showPassword} setShowPassword={setShowPassword}
                    loading={loading}
                    onSubmit={handleSignup}
                    onSwitchToSignIn={() => setView("login")}
                  />
                )}
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
