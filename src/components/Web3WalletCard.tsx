import { useState, useEffect } from "react";
import {
  Wallet,
  Unplug,
  ExternalLink,
  PenTool,
  AlertTriangle,
  Fingerprint,
  ShieldCheck,
  ShieldOff,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useWeb3Wallet } from "@/hooks/useWeb3Wallet";
import { AMOY_EXPLORER } from "@/services/blockchain/config";
import { BiometricLockModal, type BiometricAction } from "@/components/wallet/BiometricLockModal";
import {
  isPlatformAuthenticatorAvailable,
  listBiometricCredentials,
  hasEncryptedKey,
  type BiometricCredential,
} from "@/services/webauthnService";

interface Web3WalletCardProps {
  userId: string | undefined;
  onConnected?: () => void;
}

const KEY_LABEL = "wallet-private-key";

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

  // ── Biometric state ────────────────────────────────────────────────────────
  const [biometricModalOpen, setBiometricModalOpen] = useState(false);
  const [biometricAction, setBiometricAction] = useState<BiometricAction>("manage");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [registeredCred, setRegisteredCred] = useState<BiometricCredential | null>(null);
  const [keyIsProtected, setKeyIsProtected] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showRevealedKey, setShowRevealedKey] = useState(false);

  // Detect biometric support and load credential state
  useEffect(() => {
    isPlatformAuthenticatorAvailable().then(setBiometricAvailable);
  }, []);

  useEffect(() => {
    if (!userId) return;
    refreshBiometricState();
  }, [userId]);

  async function refreshBiometricState() {
    if (!userId) return;
    const creds = await listBiometricCredentials(userId);
    const first = creds[0] ?? null;
    setRegisteredCred(first);
    if (first) {
      const exists = await hasEncryptedKey(first.credentialId, KEY_LABEL);
      setKeyIsProtected(exists);
    } else {
      setKeyIsProtected(false);
    }
  }

  // ── Biometric actions ──────────────────────────────────────────────────────
  function openBiometricModal(action: BiometricAction) {
    setBiometricAction(action);
    setBiometricModalOpen(true);
  }

  function handleBiometricSuccess() {
    refreshBiometricState();
  }

  function handleDecryptSuccess(privateKey: string) {
    setRevealedKey(privateKey);
    setShowRevealedKey(true);
    // Auto-hide after 30 seconds
    setTimeout(() => {
      setRevealedKey(null);
      setShowRevealedKey(false);
    }, 30_000);
  }

  // ── Sign test ──────────────────────────────────────────────────────────────
  const handleTestSign = async () => {
    const sig = await signMessage("DecentraID identity verification");
    if (sig) {
      console.log("Signature:", sig);
    }
  };

  // ─── Biometric status badge ────────────────────────────────────────────────
  function BiometricStatusBadge() {
    if (!biometricAvailable) return null;

    if (keyIsProtected) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-[10px] text-green-600 dark:text-green-400 font-medium">
          <ShieldCheck className="h-3 w-3" />
          Biometric protected
        </div>
      );
    }

    if (registeredCred) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 border border-primary/30 text-[10px] text-primary font-medium">
          <Fingerprint className="h-3 w-3" />
          Biometric ready
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted border border-border/40 text-[10px] text-muted-foreground font-medium">
        <ShieldOff className="h-3 w-3" />
        No biometric
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-holder-muted flex items-center justify-center">
              <Wallet className="h-5 w-5" style={{ color: "hsl(var(--holder))" }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-semibold text-foreground">Web3 Wallet</h3>
              <p className="text-xs text-muted-foreground">Ethereum Sepolia Testnet</p>
            </div>
            <BiometricStatusBadge />
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

              {/* Revealed private key (ephemeral) */}
              {showRevealedKey && revealedKey && (
                <div className="relative bg-destructive/5 border border-destructive/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-destructive" />
                    <p className="text-xs font-medium text-destructive">Private Key — visible for 30s</p>
                  </div>
                  <p className="font-mono text-xs text-foreground break-all leading-relaxed">{revealedKey}</p>
                  <button
                    className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                    onClick={() => { setRevealedKey(null); setShowRevealedKey(false); }}
                    aria-label="Hide private key"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="holder" size="sm" className="flex-1" onClick={handleTestSign}>
                  <PenTool className="h-3 w-3 mr-1" /> Sign Message
                </Button>
                <Button variant="outline" size="sm" onClick={disconnectWallet}>
                  <Unplug className="h-3 w-3 mr-1" /> Disconnect
                </Button>
              </div>

              {/* Biometric controls (only when biometric is available) */}
              {biometricAvailable && (
                <div className="border-t border-border/40 pt-3 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <Fingerprint className="h-3 w-3" />
                    Biometric Key Protection
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {!registeredCred ? (
                      <Button
                        id="setup-biometric-btn"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => openBiometricModal("register")}
                      >
                        <Fingerprint className="h-3 w-3 mr-1" />
                        Set Up Biometric
                      </Button>
                    ) : (
                      <>
                        {!keyIsProtected ? (
                          <Button
                            id="protect-key-btn"
                            variant="outline"
                            size="sm"
                            className="text-xs border-primary/40 text-primary hover:bg-primary/5"
                            onClick={() => openBiometricModal("encrypt")}
                          >
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Protect Key
                          </Button>
                        ) : (
                          <Button
                            id="reveal-key-btn"
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => openBiometricModal("decrypt")}
                          >
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Reveal Key
                          </Button>
                        )}
                        <Button
                          id="manage-biometric-btn"
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground"
                          onClick={() => openBiometricModal("manage")}
                        >
                          <Settings2 className="h-3 w-3 mr-1" />
                          Manage
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
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

      {/* Biometric modal */}
      {userId && (
        <BiometricLockModal
          open={biometricModalOpen}
          onOpenChange={setBiometricModalOpen}
          userId={userId}
          action={biometricAction}
          keyLabel={KEY_LABEL}
          /* Pass a dummy private key placeholder for encrypt — in production
             replace with the actual wallet private key from your secure store. */
          privateKeyToEncrypt={walletAddress ? `0x_placeholder_privkey_for_${walletAddress}` : undefined}
          onDecryptSuccess={handleDecryptSuccess}
          onSuccess={handleBiometricSuccess}
        />
      )}
    </>
  );
};

export default Web3WalletCard;
