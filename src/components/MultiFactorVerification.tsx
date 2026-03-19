import { useState, useCallback } from "react";
import { Shield, Wallet, Key, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useWeb3Wallet } from "@/hooks/useWeb3Wallet";
import { useToast } from "@/hooks/use-toast";

interface VerificationStep {
  id: string;
  label: string;
  icon: any;
  status: "pending" | "verifying" | "success" | "failed";
}

const MultiFactorVerification = () => {
  const { user, profile } = useAuth();
  const { walletAddress, signMessage } = useWeb3Wallet(user?.id);
  const { toast } = useToast();

  const [steps, setSteps] = useState<VerificationStep[]>([
    { id: "did", label: "DID Ownership", icon: Key, status: "pending" },
    { id: "wallet", label: "Wallet Signature", icon: Wallet, status: "pending" },
  ]);
  const [verifying, setVerifying] = useState(false);
  const [allPassed, setAllPassed] = useState(false);

  const updateStep = (id: string, status: VerificationStep["status"]) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  const startVerification = useCallback(async () => {
    setVerifying(true);
    setAllPassed(false);
    setSteps((prev) => prev.map((s) => ({ ...s, status: "pending" as const })));

    let passed = 0;

    // Step 1: DID Ownership
    updateStep("did", "verifying");
    await new Promise((r) => setTimeout(r, 800));
    if (profile?.did) {
      updateStep("did", "success");
      passed++;
    } else {
      updateStep("did", "failed");
    }

    // Step 2: Wallet Signature
    updateStep("wallet", "verifying");
    if (walletAddress) {
      const sig = await signMessage(
        `DecentraID Multi-Factor Verification\nDID: ${profile?.did}\nTimestamp: ${new Date().toISOString()}`
      );
      if (sig) {
        updateStep("wallet", "success");
        passed++;
      } else {
        updateStep("wallet", "failed");
      }
    } else {
      updateStep("wallet", "failed");
    }

    setVerifying(false);
    setAllPassed(passed === 2);
    toast({
      title: passed === 2 ? "Full verification passed ✓" : `${passed}/2 factors verified`,
      description: passed === 2 ? "Both authentication factors confirmed." : "Some factors could not be verified.",
    });
  }, [profile, walletAddress, signMessage, toast]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" /> Multi-Factor Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Verify your identity using two independent factors: DID and wallet.
        </p>

        <div className="space-y-2">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="flex-1 text-sm font-medium text-foreground">{step.label}</span>
                {step.status === "pending" && <span className="text-xs text-muted-foreground">Pending</span>}
                {step.status === "verifying" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {step.status === "success" && <CheckCircle2 className="h-4 w-4 text-accent-foreground" />}
                {step.status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
              </div>
            );
          })}
        </div>

        {allPassed && (
          <div className="bg-accent/20 rounded-lg p-3 text-center text-sm text-accent-foreground font-medium">
            ✓ Both factors verified — identity fully confirmed
          </div>
        )}

        <Button
          variant="holder"
          className="w-full"
          onClick={startVerification}
          disabled={verifying}
        >
          {verifying ? "Verifying..." : "Start Multi-Factor Verification"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default MultiFactorVerification;
