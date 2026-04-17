import { Wallet, Unplug, ExternalLink, PenTool, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useWeb3Wallet } from "@/hooks/useWeb3Wallet";
import { AMOY_EXPLORER } from "@/services/blockchain/config";

interface Web3WalletCardProps {
  userId: string | undefined;
  onConnected?: () => void;
}

const Web3WalletCard = ({ userId, onConnected }: Web3WalletCardProps) => {
  const {
    walletAddress,
    isConnecting,
    isMetaMaskInstalled,
    isPolygonNetwork,
    isAutoGeneratingDid,
    connectWallet,
    disconnectWallet,
    signMessage,
    switchToPolygon,
  } = useWeb3Wallet(userId, { onConnected });

  const handleTestSign = async () => {
    const sig = await signMessage("DecentraID identity verification");
    if (sig) {
      console.log("Signature:", sig);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-holder-muted flex items-center justify-center">
            <Wallet className="h-5 w-5" style={{ color: "hsl(var(--holder))" }} />
          </div>
          <div>
            <h3 className="font-display font-semibold text-foreground">Web3 Wallet</h3>
            <p className="text-xs text-muted-foreground">Ethereum Sepolia Testnet</p>
          </div>
        </div>

        {walletAddress ? (
          <div className="space-y-3">
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Connected Address</p>
              <p className="font-mono text-sm text-foreground break-all">{walletAddress}</p>
            </div>

            {!isPolygonNetwork && (
              <button
                onClick={switchToPolygon}
                className="w-full flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-2"
              >
                <AlertTriangle className="h-3 w-3" />
                Wrong network — click to switch to Sepolia
              </button>
            )}

            <a
              href={`${AMOY_EXPLORER}/address/${walletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> View on Etherscan
            </a>

            <div className="flex gap-2">
              <Button variant="holder" size="sm" className="flex-1" onClick={handleTestSign}>
                <PenTool className="h-3 w-3 mr-1" /> Sign Message
              </Button>
              <Button variant="outline" size="sm" onClick={disconnectWallet}>
                <Unplug className="h-3 w-3 mr-1" /> Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Link your wallet to sign credentials and verify your on-chain identity.
            </p>
            {!isMetaMaskInstalled && (
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Install MetaMask
              </a>
            )}
            <Button
              variant="holder"
              size="sm"
              className="w-full"
              onClick={connectWallet}
              disabled={isConnecting || isAutoGeneratingDid}
            >
              {isConnecting ? "Connecting..." : isAutoGeneratingDid ? "Generating DID..." : "Connect Wallet"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default Web3WalletCard;
