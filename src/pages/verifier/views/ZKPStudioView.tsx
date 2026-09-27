/**
 * ZKP Studio — the verifier's window into the zero-knowledge layer.
 *
 * Three jobs:
 *   1. Deployment health: are the circuit artifacts actually served, and does
 *      the on-chain verifier have their verifying keys registered? A proof
 *      pipeline that silently 404s is worse than one that is visibly broken.
 *   2. Circuit reference: what each circuit asserts, signal by signal.
 *   3. Proof inspection: hand the pairing check to `ZkpProofPanel`.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck, Cpu, CircleCheck, CircleX, CircleAlert, Loader2, ExternalLink,
  Blocks, BookOpen,
} from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import ZkpProofPanel from "@/components/verifier/ZkpProofPanel";
import { useToast } from "@/hooks/use-toast";
import {
  getArtifactAvailability,
  getArtifactPaths,
  type ArtifactAvailability,
} from "@/services/zkp/zkp.service";
import {
  CIRCUIT_ID_BYTES,
  getRegisteredCircuits,
  isZkpVerifierConfigured,
} from "@/services/blockchain/zkpVerifier.service";
import { CREDENTIAL_REGISTRY_ADDRESS } from "@/services/blockchain/config";
import { CIRCUIT_META, CIRCUIT_ORDER, circuitSignalSummary } from "@/data/zkpCircuits";
import { publicSignalCount, type CircuitName } from "@/lib/zkp";

type Status = "ok" | "missing" | "error";

function StatusIcon({ status }: { status: Status }) {
  if (status === "ok") return <CircleCheck className="h-4 w-4 text-emerald-500" />;
  if (status === "missing") return <CircleX className="h-4 w-4 text-destructive" />;
  return <CircleAlert className="h-4 w-4 text-amber-500" />;
}

const ZKPStudioView = () => {
  const { toast } = useToast();
  const [artifacts, setArtifacts] = useState<Record<string, ArtifactAvailability> | null>(null);
  const [registered, setRegistered] = useState<Record<CircuitName, boolean> | null>(null);
  const [checking, setChecking] = useState(true);

  const contractConfigured = isZkpVerifierConfigured();

  const probe = useCallback(async () => {
    setChecking(true);
    // Artifact availability is a static HEAD request per file — no rate limit
    // concern, and it keeps the "is it deployed" answer honest.
    const entries = await Promise.all(
      CIRCUIT_ORDER.map(async (c) => [c, await getArtifactAvailability(c)] as const)
    );
    setArtifacts(Object.fromEntries(entries));

    if (contractConfigured) {
      try {
        setRegistered(await getRegisteredCircuits());
      } catch (err) {
        setRegistered(null);
        toast({
          title: "Could not read on-chain circuit registry",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      }
    }
    setChecking(false);
  }, [contractConfigured, toast]);

  useEffect(() => {
    probe();
  }, [probe]);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-headline mb-1">ZKP Studio</h2>
            <p className="text-muted-foreground">
              Circuit artifacts, on-chain verifying keys, and proof verification
            </p>
          </div>
          <ButtonLike onClick={probe} disabled={checking} />
        </div>
      </motion.div>

      {/* ── Deployment health ── */}
      <Card className="solid-card">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-verifier flex items-center justify-center">
              <Blocks className="h-4 w-4 text-[#030304]" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-foreground">Deployment Status</h3>
              <p className="text-xs text-muted-foreground">
                Compiled artifacts must exist before a proof can be produced or checked
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 text-[11px] bg-muted/30">
              <span className="text-muted-foreground">On-chain ZKPVerifier</span>
              <span className="flex items-center gap-2">
                {contractConfigured ? (
                  <Badge variant="secondary" size="sm" className="border-emerald-500/30 text-emerald-500">
                    configured
                  </Badge>
                ) : (
                  <Badge variant="destructive" size="sm">not configured</Badge>
                )}
              </span>
            </div>
            <div className="px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
              {contractConfigured ? (
                <span>
                  Verifying keys are registered per circuit below. Checks run against the
                  owner-registered keys, not the ones this page serves.
                </span>
              ) : (
                <span>
                  Set <code className="font-mono text-foreground">VITE_ZKP_VERIFIER_ADDRESS</code> to
                  enable on-chain verification. Local (WebAssembly) verification still works.
                </span>
              )}
            </div>
            {CREDENTIAL_REGISTRY_ADDRESS ? (
              <div className="flex items-center justify-between px-3 py-2.5 text-[11px]">
                <span className="text-muted-foreground">CredentialRegistry</span>
                <a
                  href={`https://sepolia.etherscan.io/address/${CREDENTIAL_REGISTRY_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[10px] text-verifier hover:underline inline-flex items-center gap-1"
                >
                  {CREDENTIAL_REGISTRY_ADDRESS.slice(0, 12)}…<ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {CIRCUIT_ORDER.map((c) => {
              const art = artifacts?.[c];
              const reg = registered?.[c];
              const ready = art?.wasm && art?.zkey && art?.vkey;
              return (
                <div key={c} className="rounded-lg border border-border p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-semibold text-foreground">{c}</span>
                    {checking ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : (
                      <StatusIcon status={ready ? "ok" : art ? "error" : "missing"} />
                    )}
                  </div>

                  <div className="space-y-1">
                    {(["wasm", "zkey", "vkey"] as const).map((k) => (
                      <div key={k} className="flex items-center justify-between text-[10px]">
                        <span className="font-mono text-muted-foreground">{k}</span>
                        <span className={art?.[k] ? "text-emerald-500" : "text-muted-foreground/60"}>
                          {art?.[k] ? "present" : checking ? "…" : "missing"}
                        </span>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">on-chain key</span>
                    {registered === null ? (
                      <span className="text-muted-foreground/60">
                        {contractConfigured ? (checking ? "…" : "unavailable") : "n/a"}
                      </span>
                    ) : (
                      <span className={reg ? "text-emerald-500" : "text-amber-500"}>
                        {reg ? "registered" : "not registered"}
                      </span>
                    )}
                  </div>

                  <div className="text-[10px] text-muted-foreground">
                    {circuitSignalSummary(c)} ·{" "}
                    <span className="font-mono" title="keccak256(circuit name)">
                      {CIRCUIT_ID_BYTES[c].slice(0, 10)}…
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="verify">
        <TabsList>
          <TabsTrigger value="verify" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Verify Proof
          </TabsTrigger>
          <TabsTrigger value="circuits" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> Circuit Reference
          </TabsTrigger>
        </TabsList>

        <TabsContent value="verify" className="space-y-4 pt-4">
          <ZkpProofPanel />
        </TabsContent>

        <TabsContent value="circuits" className="space-y-4 pt-4">
          {CIRCUIT_ORDER.map((c, idx) => {
            const meta = CIRCUIT_META[c];
            return (
              <motion.div
                key={c}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.3 }}
              >
                <Card className="solid-card">
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-verifier" />
                          <h3 className="font-display font-semibold text-foreground">{meta.label}</h3>
                          <Badge variant="secondary" size="sm">{c}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{meta.claim}</p>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {publicSignalCount(c)} signals
                      </span>
                    </div>

                    <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
                      {meta.signals.map((s, i) => (
                        <div key={s.name} className="flex items-start gap-3 px-3 py-2 hover:bg-muted/30">
                          <span className="font-mono text-[10px] text-muted-foreground w-5 shrink-0 pt-0.5">
                            {i}
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-foreground w-40 shrink-0">
                            {s.name}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{s.role}</span>
                        </div>
                      ))}
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      Artifacts:{" "}
                      <a href={getArtifactPaths(c).vkeyUrl} className="font-mono text-verifier hover:underline">
                        verification_key.json
                      </a>
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
};

/** Small refresh affordance — kept local so the header stays declarative. */
function ButtonLike({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
    >
      {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      Re-check deployment
    </button>
  );
}

export default ZKPStudioView;
