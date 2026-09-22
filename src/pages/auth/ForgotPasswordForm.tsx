/**
 * ForgotPasswordForm — Password reset request form.
 * Extracted from Auth.tsx.
 */
import React from "react";
import { KeyRound, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface ForgotPasswordFormProps {
  email: string;
  setEmail: (v: string) => void;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onBackToSignIn: () => void;
}

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({
  email, setEmail, loading, onSubmit, onBackToSignIn,
}) => (
  <Card className="solid-card">
    <CardHeader>
      <CardTitle className="font-display flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-primary" /> Reset Password
      </CardTitle>
      <CardDescription>Enter your email to receive a password reset link.</CardDescription>
    </CardHeader>
    <CardContent>
      <form onSubmit={onSubmit} className="space-y-4">
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
          {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</> : "Send Reset Link"}
        </Button>
        <p className="text-center text-sm">
          <button type="button" className="text-primary hover:underline font-medium" onClick={onBackToSignIn}>
            <ArrowLeft className="h-3 w-3 inline mr-1" />Back to Sign In
          </button>
        </p>
      </form>
    </CardContent>
  </Card>
);

/**
 * CheckEmailCard — confirmation card shown after email submission.
 * Extracted from Auth.tsx.
 */
import { Fingerprint } from "lucide-react";

interface CheckEmailCardProps {
  email: string;
  onBackToSignIn: () => void;
}

export const CheckEmailCard: React.FC<CheckEmailCardProps> = ({ email, onBackToSignIn }) => (
  <Card className="solid-card">
    <CardHeader className="text-center pb-4">
      <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
        <Fingerprint className="h-7 w-7 text-primary" />
      </div>
      <CardTitle className="font-display">Check your email</CardTitle>
      <CardDescription>
        We&apos;ve sent a link to <span className="font-medium text-foreground">{email}</span>. Follow the instructions to continue.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Button variant="outline" className="w-full" onClick={onBackToSignIn}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Sign In
      </Button>
    </CardContent>
  </Card>
);
