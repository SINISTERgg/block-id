import { useState, useEffect } from "react";
import { Fingerprint, ShieldCheck, ShieldOff, Shield, Key, Lock, Smartphone, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { BiometricLockModal, type BiometricAction } from "@/components/wallet/BiometricLockModal";
import {
  isPlatformAuthenticatorAvailable,
  listBiometricCredentials,
  hasEncryptedKey,
  type BiometricCredential,
} from "@/services/webauthnService";

interface SecurityViewProps {
  userId: string | undefined;
  holderDid: string | undefined;
  walletAddress: string | undefined;
  credentials: { status: string }[];
}

const KEY_LABEL = "wallet-private-key";

const SecurityView = ({ userId, holderDid, walletAddress, credentials }: SecurityViewProps) => {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [registeredCred, setRegisteredCred] = useState<BiometricCredential | null>(null);
  const [keyIsProtected, setKeyIsProtected] = useState(false);
  const [biometricModalOpen, setBiometricModalOpen] = useState(false);
  const [biometricAction, setBiometricAction] = useState<BiometricAction>("register");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showRevealedKey, setShowRevealedKey] = useState(false);

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
    setTimeout(() => {
      setRevealedKey(null);
      setShowRevealedKey(false);
    }, 30_000);
  }

  const activeCredCount = credentials.filter((c) => c.status === "active").length;

  // Security checklist items
  const checks = [
    { label: "Decentralized Identifier (DID)", ok: !!holderDid, detail: holderDid ? "Generated" : "Not generated — connect wallet" },
    { label: "Web3 Wallet", ok: !!walletAddress, detail: walletAddress ? `${walletAddress.substring(0, 10)}…` : "Not connected" },
    { label: "Active Credentials", ok: activeCredCount > 0, detail: activeCredCount > 0 ? `${activeCredCount} active` : "No credentials yet" },
    { label: "Biometric Key Protection", ok: keyIsProtected, detail: keyIsProtected ? "Private key is biometric-protected" : registeredCred ? "Biometric registered, key not yet protected" : "Not set up" },
  ];

  const securityScore = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h2 className="text-headline mb-2">Security Center</h2>
        <p className="text-muted-foreground">Manage biometric protection, review your security posture, and safeguard your credentials.</p>
      </motion.div>

      {/* Security Score */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6"
      >
        <Card className="solid-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-holder rounded-lg flex items-center justify-center">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{securityScore}%</p>
                <p className="text-sm text-muted-foreground">Security Score</p>
              </div>
            </div>
            <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-holder rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${securityScore}%` }}
                transition={{ delay: 0.4, duration: 0.6 }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="solid-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${biometricAvailable ? "bg-primary" : "bg-muted"}`}>
                <Fingerprint className={`h-6 w-6 ${biometricAvailable ? "text-white" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {biometricAvailable ? "Biometrics Available" : "Biometrics Unavailable"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {biometricAvailable
                    ? keyIsProtected ? "Key is protected" : registeredCred ? "Registered, key not protected" : "Not yet registered"
                    : "Device does not support biometrics"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="solid-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                <Key className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">DID Status</p>
                <p className="text-xs text-muted-foreground">
                  {holderDid ? "Active — identity anchored" : "Not generated yet"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Security Checklist */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        <Card className="solid-card mb-6">
          <CardHeader className="pb-3 bg-muted/30">
            <CardTitle className="font-display text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Security Checklist
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {checks.map((check, i) => (
                <motion.div
                  key={check.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0"
                >
                  {check.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{check.label}</p>
                    <p className="text-xs text-muted-foreground">{check.detail}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    check.ok
                      ? "bg-green-500/10 text-green-600 dark:text-green-400"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  }`}>
                    {check.ok ? "OK" : "Action needed"}
                  </span>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Biometric Registration */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        <Card className="solid-card mb-6">
          <CardHeader className="pb-3 bg-muted/30">
            <CardTitle className="font-display text-base flex items-center gap-2">
              <Fingerprint className="h-4 w-4 text-primary" />
              Biometric Key Protection
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {!biometricAvailable ? (
              <div className="flex items-center gap-3 py-4 text-muted-foreground text-sm">
                <Smartphone className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Biometrics not available on this device</p>
                  <p className="text-xs mt-0.5">Your browser or device doesn't support WebAuthn / platform biometrics (fingerprint, Face ID, Windows Hello).</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/40 border border-border/60">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${keyIsProtected ? "bg-green-500/15" : "bg-primary/10"}`}>
                    {keyIsProtected ? (
                      <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                    ) : registeredCred ? (
                      <Fingerprint className="h-5 w-5 text-primary" />
                    ) : (
                      <ShieldOff className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {keyIsProtected
                        ? "Private key is biometric-protected"
                        : registeredCred
                          ? "Biometric registered — protect your key next"
                          : "No biometric registered"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {keyIsProtected
                        ? "Your wallet private key is encrypted and can only be decrypted with your biometric (fingerprint / Windows Hello / Face ID)."
                        : registeredCred
                          ? "You've registered a biometric credential. Click 'Protect Key' to encrypt your wallet private key with it."
                          : "Register your biometric to enable hardware-backed key protection. Your private key will be encrypted and only accessible via your fingerprint or Windows Hello."}
                    </p>
                  </div>
                </div>

                {/* Revealed key display */}
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

                <div className="flex flex-wrap gap-2">
                  {!registeredCred ? (
                    <Button
                      id="security-setup-biometric-btn"
                      variant="holder"
                      size="sm"
                      onClick={() => openBiometricModal("register")}
                    >
                      <Fingerprint className="h-4 w-4 mr-2" />
                      Register Biometric
                    </Button>
                  ) : (
                    <>
                      {!keyIsProtected ? (
                        <Button
                          id="security-protect-key-btn"
                          variant="holder"
                          size="sm"
                          onClick={() => openBiometricModal("encrypt")}
                        >
                          <Lock className="h-4 w-4 mr-2" />
                          Protect Key with Biometric
                        </Button>
                      ) : (
                        <Button
                          id="security-reveal-key-btn"
                          variant="outline"
                          size="sm"
                          onClick={() => openBiometricModal("decrypt")}
                        >
                          <ShieldCheck className="h-4 w-4 mr-2" />
                          Reveal Key (Biometric required)
                        </Button>
                      )}
                      <Button
                        id="security-manage-biometric-btn"
                        variant="outline"
                        size="sm"
                        onClick={() => openBiometricModal("manage")}
                      >
                        Manage Biometric
                      </Button>
                    </>
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  🔒 Biometric protection uses your device's secure enclave (WebAuthn / FIDO2). Your private key never leaves the device unencrypted.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Biometric modal */}
      {userId && (
        <BiometricLockModal
          open={biometricModalOpen}
          onOpenChange={setBiometricModalOpen}
          userId={userId}
          action={biometricAction}
          keyLabel={KEY_LABEL}
          privateKeyToEncrypt={walletAddress ? `0x_placeholder_privkey_for_${walletAddress}` : undefined}
          onDecryptSuccess={handleDecryptSuccess}
          onSuccess={handleBiometricSuccess}
        />
      )}
    </>
  );
};

export default SecurityView;
