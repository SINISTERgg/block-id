import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Shield, LogOut, RefreshCw, Fingerprint, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";

const getRolePath = (r: string) => r === "org_admin" ? "/admin" : `/${r}`;

const PendingApproval = () => {
  const { user, role, accountStatus, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [countdown, setCountdown] = useState(30);

  // Auto-check every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleRefresh();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Redirect if already approved
  useEffect(() => {
    if (accountStatus === "approved" && role) {
      navigate(getRolePath(role), { replace: true });
    }
    if (accountStatus === "rejected") {
      navigate("/account-rejected", { replace: true });
    }
  }, [accountStatus, role, navigate]);

  const handleRefresh = async () => {
    setChecking(true);
    await refreshProfile();
    setChecking(false);
    setCountdown(30);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden px-6">
      {/* Background pattern */}
      <div className="absolute inset-0 pattern-dots opacity-30" />

      {/* Animated gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Brand */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
            <Fingerprint className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">BlockID</span>
        </div>

        {/* Main card */}
        <div className="solid-card p-8 text-center space-y-6">
          {/* Animated clock icon */}
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="mx-auto w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center"
          >
            <Clock className="h-10 w-10 text-amber-500" />
          </motion.div>

          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold text-foreground">
              Pending Approval
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your <span className="font-semibold capitalize text-foreground">{role}</span> account has been created successfully.
              An administrator needs to approve your account before you can access the portal.
            </p>
          </div>

          {/* Status indicator */}
          <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-center gap-2">
              <span className="relative flex items-center justify-center w-2.5 h-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-amber-500" />
                <span className="relative inline-flex rounded-full w-2 h-2 bg-amber-500" />
              </span>
              <span className="text-sm font-medium text-amber-600">Awaiting admin review</span>
            </div>

            <p className="text-xs text-muted-foreground">
              {user?.email}
            </p>
          </div>

          {/* Auto-refresh info */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} />
            <span>Auto-checking in {countdown}s</span>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={checking}
              className="w-full rounded-xl gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Checking status..." : "Check Now"}
            </Button>

            <Button
              variant="ghost"
              onClick={handleSignOut}
              className="w-full rounded-xl gap-2 text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* What happens next */}
        <div className="mt-6 space-y-3">
          <p className="text-xs font-medium text-muted-foreground text-center uppercase tracking-wider">
            What happens next?
          </p>
          <div className="space-y-2">
            {[
              { icon: Shield, text: "Admin reviews your registration" },
              { icon: CheckCircle2, text: "Your account gets approved" },
              { icon: Fingerprint, text: "Full portal access is unlocked" },
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
                className="flex items-center gap-3 bg-card/50 border border-border/50 rounded-lg px-4 py-2.5"
              >
                <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <step.icon className="h-3 w-3 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground">{step.text}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PendingApproval;
