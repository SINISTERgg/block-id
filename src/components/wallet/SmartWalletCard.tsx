import { Sparkles, Loader2, Wallet, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import GuardianManager from "./GuardianManager";
import { useSmartWallet } from "@/hooks/useSmartWallet";

interface SmartWalletCardProps {
  eoaAddress: string | undefined;
}

/**
 * Smart wallet onboarding (Phase 2 — Account Abstraction):
 * upgrade the connected EOA to a gasless-capable ERC-4337 smart account
 * with guardian-based social recovery.
 */
const SmartWalletCard = ({ eoaAddress }: SmartWalletCardProps) => {
  const {
    predictedAddress,
    accountAddress,
    guardians,
    threshold,
    isCreating,
    isConfigured,
    rotateSalt,
    createOrGetAccount,
    refreshGuardians,
  } = useSmartWallet(eoaAddress);

  if (!isConfigured) return null;

  const display = accountAddress ?? predictedAddress;
  const short = display ? `${display.slice(0, 10)}…${display.slice(-6)}` : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" />
            Smart Wallet
          </CardTitle>
          <Badge variant={accountAddress ? "default" : "secondary"}>
            {accountAddress ? "Deployed" : "Not deployed"}
          </Badge>
        </div>
        <CardDescription>
          {accountAddress
            ? "Your account abstraction wallet supports gasless credential anchoring and social recovery."
            : "Upgrade to a smart account for sponsored transactions and key-loss recovery."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {short && (
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="font-mono text-xs text-muted-foreground">{short}</span>
            {!accountAddress && (
              <Button variant="ghost" size="sm" onClick={rotateSalt} title="Regenerate deterministic address">
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {!accountAddress && (
            <Button onClick={createOrGetAccount} disabled={isCreating || !eoaAddress}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deploying…
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4 mr-2" /> Create Smart Wallet
                </>
              )}
            </Button>
          )}
          <GuardianManager
            accountAddress={accountAddress}
            guardians={guardians}
            threshold={threshold}
            onUpdated={() => refreshGuardians()}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default SmartWalletCard;
