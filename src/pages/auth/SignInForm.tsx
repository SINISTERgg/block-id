/**
 * SignInForm — Email + password sign-in form.
 * Extracted from Auth.tsx.
 */
import React from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SignInFormProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onForgotPassword: () => void;
  onSwitchToSignUp: () => void;
}

export const SignInForm: React.FC<SignInFormProps> = ({
  email, setEmail,
  password, setPassword,
  showPassword, setShowPassword,
  loading, onSubmit, onForgotPassword, onSwitchToSignUp,
}) => (
  <form onSubmit={onSubmit} className="space-y-4">
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
        <button
          type="button"
          className="text-xs text-primary hover:underline font-medium"
          onClick={onForgotPassword}
        >
          Forgot password?
        </button>
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

    <Button type="submit" className="w-full btn-primary h-11 mt-2" disabled={loading}>
      {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Please wait...</> : "Sign In"}
    </Button>

    <p className="text-center text-sm text-muted-foreground pt-2">
      Don&apos;t have an account?{" "}
      <button type="button" className="text-primary hover:underline font-semibold" onClick={onSwitchToSignUp}>
        Sign Up
      </button>
    </p>
  </form>
);
