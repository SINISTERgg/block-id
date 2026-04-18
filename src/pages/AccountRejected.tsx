import { useNavigate } from "react-router-dom";
import { XCircle, LogOut, Fingerprint, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";

const AccountRejected = () => {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden px-6">
      <div className="absolute inset-0 pattern-dots opacity-30" />

      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-red-500/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-red-400/5 rounded-full blur-3xl" />

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
          <motion.div
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="mx-auto w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center"
          >
            <XCircle className="h-10 w-10 text-red-500" />
          </motion.div>

          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold text-foreground">
              Account Not Approved
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your <span className="font-semibold capitalize text-foreground">{role}</span> registration
              was not approved by the platform administrator. If you believe this is an error,
              please contact the admin.
            </p>
          </div>

          {/* Status */}
          <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-sm font-medium text-red-600">Registration rejected</span>
            </div>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>

          {/* Contact */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Mail className="h-3 w-3" />
            <span>Contact admin@blockid.dev for support</span>
          </div>

          {/* Actions */}
          <div className="pt-2">
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
      </motion.div>
    </div>
  );
};

export default AccountRejected;
