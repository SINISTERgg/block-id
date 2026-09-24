/**
 * SignUpForm — Full registration form with name, org, role picker, email, and password.
 * Extracted from Auth.tsx.
 */
import React from "react";
import { Shield, User, Building2, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const roleConfig = {
  issuer:   { icon: Shield,    label: "Issuer",   description: "Issue credentials" },
  holder:   { icon: User,      label: "Holder",   description: "Manage wallet" },
  verifier: { icon: Building2, label: "Verifier", description: "Verify credentials" },
};

interface SignUpFormProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  fullName: string;
  setFullName: (v: string) => void;
  organization: string;
  setOrganization: (v: string) => void;
  role: "issuer" | "holder" | "verifier";
  setRole: (v: "issuer" | "holder" | "verifier") => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onSwitchToSignIn: () => void;
}

export const SignUpForm: React.FC<SignUpFormProps> = ({
  email, setEmail,
  password, setPassword,
  fullName, setFullName,
  organization, setOrganization,
  role, setRole,
  showPassword, setShowPassword,
  loading, onSubmit, onSwitchToSignIn,
}) => (
  <form onSubmit={onSubmit} className="space-y-4">
    {/* Extra signup fields */}
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
            const colorClass =
              key === "issuer"
                ? "border-issuer text-issuer bg-issuer/10"
                : key === "holder"
                  ? "border-holder text-holder bg-holder/10"
                  : "border-verifier text-verifier bg-verifier/10";
            const iconBg =
              key === "issuer" ? "bg-issuer text-issuer-foreground"
                : key === "holder" ? "bg-holder text-holder-foreground"
                : "bg-verifier text-verifier-foreground";
            return (
              <button
                key={key}
                type="button"
                onClick={() => setRole(key)}
                className={`p-4 border-2 transition-all rounded-xl text-center ${
                  isSelected ? colorClass : "border-white/10 hover:border-primary/40"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg mx-auto mb-2 flex items-center justify-center ${
                  isSelected ? `${iconBg} shadow-[0_0_18px_-5px_rgba(247,147,26,0.6)]` : "bg-muted"
                }`}>
                  <Icon className={`h-5 w-5 ${isSelected ? "" : "text-muted-foreground"}`} />
                </div>
                <span className={`text-sm font-semibold block ${isSelected ? "" : ""}`}>
                  {cfg.label}
                </span>
                <span className="text-xs text-muted-foreground block mt-0.5">{cfg.description}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>

    {/* Shared email + password */}
    <div className="space-y-2">
      <Label htmlFor="email-signup">Email</Label>
      <Input
        id="email-signup"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        placeholder="you@example.com"
        className="input-solid"
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor="password-signup">Password</Label>
      <div className="relative">
        <Input
          id="password-signup"
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

    <Button type="submit" className="w-full btn-primary h-11 mt-2" disabled={loading}>
      {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Please wait...</> : "Create Account"}
    </Button>

    <p className="text-center text-sm text-muted-foreground pt-2">
      Already have an account?{" "}
      <button type="button" className="text-primary hover:underline font-semibold" onClick={onSwitchToSignIn}>
        Sign In
      </button>
    </p>
  </form>
);
