/**
 * ZkpProofPanel — verifier-side Groth16 proof inspector.
 *
 * The verifier never sees a private witness: it receives a proof + its public
 * signals and re-runs the pairing check itself, in two independent places:
 *
 *   1. Locally, in WebAssembly, against the circuit's verification key
 *      (`verifyRawProofLocally`). Free and instant, but trusts whatever
 *      verification key the page served.
 *   2. On-chain, against the deployed `ZKPVerifier.checkProof`, which uses the
 *      verifying key the contract owner registered. Also free (an `eth_call`)
 *      and therefore the authoritative answer.
 *
 * When the contract is not configured the local check is the only verdict and
 * the panel says so explicitly instead of implying on-chain assurance.
 */
import { useMemo, useState } from "react";
import {
  CheckCircle2, XCircle, Loader2, ShieldCheck, Cpu, Link2, AlertTriangle, Copy,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { verifyRawProofLocally } from "@/services/zkp/zkp.service";
import {
  checkProofOnChain,
  fingerprintFromSignals,
  isZkpVerifierConfigured,
  type OnChainCheckResult,
} from "@/services/blockchain/zkpVerifier.service";
import {
  PUBLIC_SIGNAL_LAYOUT,
  isExpectedSignalCount,
  publicSignalCount,
  type CircuitName,
  type Groth16ProofJson,
} from "@/lib/zkp";
import { CIRCUIT_META } from "@/data/zkpCircuits";

type Verdict = "valid" | "invalid" | "unknown";

interface ParsedProof {
  circuit: CircuitName;
  publicSignals: string[];
  proof: Groth16ProofJson;
}

const VERDICT_STYLE: Record<Verdict, { label: string; cls: string }> = {
  valid: { label: "Valid", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" },
  invalid: { label: "Invalid", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  unknown: { label: "Not checked", cls: "border-border bg-muted/40 text-muted-foreground" },
};

function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const s = VERDICT_STYLE[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${s.cls} ${className ?? ""}`}
    >
      {verdict === "valid" ? <CheckCircle2 className="h-3 w-3" /> : null}
      {verdict === "invalid" ? <XCircle className="h-3 w-3" /> : null}
      {verdict === "unknown" ? <AlertTriangle className="h-3 w-3" /> : null}
      {s.label}
    </span>
  );
}

/** Decode a field element as a unix timestamp when it is in a sane range. */
function asTimestamp(value: string): string | null {
  try {
    const n = BigInt(value);
    // 2001-09-09 .. 2286-11-20 — anything outside is not a plausible timestamp.
    if (n < 1_000_000_000n || n > 9_999_999_999n) return null;
    return new Date(Number(n) * 1000).toISOString().replace("T", " ").slice(0, 19) + "Z";
  } catch {
    return null;
  }
}

/** Parse either a full `{proof, publicSignals}` envelope or a raw proof object. */
export function parseProofEnvelope(
  raw: unknown,
  circuit: CircuitName
): ParsedProof {
  const signalsRaw =
    (raw as { publicSignals?: unknown })?.publicSignals ??
    (raw as { public_signals?: unknown })?.public_signals;
  if (!Array.isArray(signalsRaw)) {
    throw new Error("Expected a `publicSignals` array alongside the proof");
  }
  const proof = (raw as { proof?: unknown }).proof ?? raw;
  if (!proof || typeof proof !== "object" || !("pi_a" in proof)) {
    throw new Error("Expected a Groth16 proof with pi_a / pi_b / pi_c");
  }
  const publicSignals = signalsRaw.map((s) => String(s));
  if (!isExpectedSignalCount(circuit, publicSignals)) {
    throw new Error(
      `${circuit} expects ${publicSignalCount(circuit)} public signals, received ${publicSignals.length}`
    );
  }
  return { circuit, publicSignals, proof: proof as Groth16ProofJson };
}

interface ZkpProofPanelProps {
  /** Optional pre-parsed proof (e.g. decoded from a QR payload upstream). */
  initial?: ParsedProof;
  onVerified?: (result: {
    circuit: CircuitName;
    localValid: boolean | null;
    onChainValid: boolean | null;
    nullifier: string;
    onChain: OnChainCheckResult | null;
  }) => void;
}

const ZkpProofPanel = ({ initial, onVerified }: ZkpProofPanelProps) => {
  const { toast } = useToast();
  const [circuit, setCircuit] = useState<CircuitName>(initial?.circuit ?? "age-verify");
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedProof | null>(initial ?? null);
  const [localVerdict, setLocalVerdict] = useState<Verdict>("unknown");
  const [localError, setLocalError] = useState<string | null>(null);
  const [onChainVerdict, setOnChainVerdict] = useState<Verdict>("unknown");
  const [onChain, setOnChain] = useState<OnChainCheckResult | null>(null);
  const [busy, setBusy] = useState<"local" | "onchain" | null>(null);

  const contractConfigured = useMemo(() => isZkpVerifierConfigured(), []);

  const signals = useMemo(() => {
    if (!parsed) return [];
    return PUBLIC_SIGNAL_LAYOUT[parsed.circuit].map((name, i) => {
      const value = parsed.publicSignals[i] ?? "";
      const entry: { name: string; value: string; rendered: string; hint: string | null } = {
        name,
        value,
        rendered: value.length > 26 ? `${value.slice(0, 14)}…${value.slice(-10)}` : value,
        hint: null,
      };
      if (name === "referenceTimestamp") entry.hint = asTimestamp(value);
      if (name === "minAgeSeconds") {
        try {
          entry.hint = `${(Number(BigInt(value)) / 31_557_600).toFixed(1)} years`;
        } catch { /* keep raw */ }
      }
      if (name === "vcCommitment" || name === "nullifier" || name === "holderCommitment") {
        try { entry.hint = `0x${BigInt(value).toString(16).slice(0, 16)}…`; } catch { /* keep raw */ }
      }
      return entry;
    });
  }, [parsed]);

  const fingerprint = useMemo(() => {
    if (!parsed) return null;
    try {
      return fingerprintFromSignals(parsed.circuit, parsed.publicSignals);
    } catch {
      return null;
    }
  }, [parsed]);

  const runLocal = async () => {
    if (!parsed) return;
    setBusy("local");
    setLocalError(null);
    try {
      const ok = await verifyRawProofLocally(parsed.circuit, parsed.publicSignals, parsed.proof);
      setLocalVerdict(ok ? "valid" : "invalid");
      toast({
        title: ok ? "Local pairing check passed" : "Local pairing check failed",
        description: ok
          ? "Groth16 proof is valid against the served verification key"
          : "The proof does not match the circuit's verification key",
        variant: ok ? "default" : "destructive",
      });
      onVerified?.({
        circuit: parsed.circuit,
        localValid: ok,
        onChainValid: null,
        nullifier: parsed.publicSignals[1] ?? "",
        onChain: null,
      });
    } catch (err) {
      setLocalVerdict("invalid");
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const runOnChain = async () => {
    if (!parsed) return;
    if (!contractConfigured) {
      toast({
        title: "Verifier contract not configured",
        description: "Set VITE_ZKP_VERIFIER_ADDRESS to enable on-chain verification",
        variant: "destructive",
      });
      return;
    }
    setBusy("onchain");
    try {
      const result = await checkProofOnChain(parsed.circuit, parsed.proof, parsed.publicSignals);
      setOnChain(result);
      setOnChainVerdict(result.valid ? "valid" : "invalid");
      toast({
        title: result.valid ? "On-chain proof valid" : "On-chain proof rejected",
        description: result.nullifierUsed
          ? "Nullifier already burned — this proof has been replayed"
          : result.circuitRegistered
            ? `Checked at block ${result.blockNumber}`
            : "Circuit verifying key is not registered on this deployment",
        variant: result.valid ? "default" : "destructive",
      });
      onVerified?.({
        circuit: parsed.circuit,
        localValid: localVerdict === "unknown" ? null : localVerdict === "valid",
        onChainValid: result.valid,
        nullifier: result.nullifier,
        onChain: result,
      });
    } catch (err) {
      setOnChainVerdict("unknown");
      toast({
        title: "On-chain check failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const load = () => {
    try {
      const next = parseProofEnvelope(JSON.parse(text), circuit);
      setParsed(next);
      setLocalVerdict("unknown");
      setOnChainVerdict("unknown");
      setOnChain(null);
      setLocalError(null);
      toast({ title: "Proof loaded", description: `${next.circuit} · ${next.publicSignals.length} public signals` });
    } catch (err) {
      toast({
        title: "Could not parse proof",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const switchCircuit = (next: CircuitName) => {
    setCircuit(next);
    setParsed(null);
    setLocalVerdict("unknown");
    setOnChainVerdict("unknown");
    setOnChain(null);
    setLocalError(null);
  };

  return (
    <Card className="solid-card">
      <CardContent className="pt-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-verifier flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-[#030304]" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-foreground">Proof Inspector</h3>
              <p className="text-xs text-muted-foreground">
                Re-run the Groth16 pairing check locally and against ZKPVerifier.sol
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <VerdictBadge verdict={localVerdict} />
            <VerdictBadge verdict={onChainVerdict} />
          </div>
        </div>

        {!parsed ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Circuit</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(Object.keys(CIRCUIT_META) as CircuitName[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => switchCircuit(c)}
                    className={`rounded-lg border p-2.5 text-left transition-colors ${
                      circuit === c
                        ? "border-verifier/50 bg-verifier/10"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="font-mono text-[11px] font-semibold text-foreground">{c}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {CIRCUIT_META[c].claim}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Proof JSON</Label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                className="font-mono text-xs input-solid"
                placeholder={'{ "publicSignals": ["…"], "proof": { "pi_a": […], "pi_b": […], "pi_c": […] } }'}
              />
            </div>

            <Button className="btn-primary" onClick={load} disabled={!text.trim()}>
              Load Proof
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" size="sm">{parsed.circuit}</Badge>
              <span className="text-[11px] text-muted-foreground">
                {parsed.publicSignals.length} public signals
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => { setParsed(null); setText(""); }}
              >
                Load another
              </Button>
            </div>

            {/* Decoded signals */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Decoded public signals</Label>
                <span className="text-[10px] text-muted-foreground">outputs first, then public inputs</span>
              </div>
              <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
                {signals.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30">
                    <span className="font-mono text-[10px] text-muted-foreground w-6 shrink-0">{i}</span>
                    <span className="font-mono text-[11px] font-semibold text-foreground w-40 shrink-0">
                      {s.name}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground truncate flex-1">
                      {s.rendered}
                    </span>
                    {s.hint ? (
                      <span className="font-mono text-[10px] text-verifier shrink-0">{s.hint}</span>
                    ) : null}
                    <button
                      onClick={() => { navigator.clipboard.writeText(s.value); toast({ title: "Signal copied" }); }}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      aria-label={`Copy ${s.name}`}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {fingerprint ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <Link2 className="h-3.5 w-3.5 text-verifier shrink-0" />
                <span className="text-[11px] text-muted-foreground">Reconstructed VC fingerprint</span>
                <span className="font-mono text-[11px] text-foreground truncate">{fingerprint}</span>
              </div>
            ) : null}

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="gap-2"
                onClick={runLocal}
                disabled={busy !== null}
              >
                {busy === "local" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
                Verify locally (WASM)
              </Button>
              <Button
                className="btn-primary gap-2"
                onClick={runOnChain}
                disabled={busy !== null || !contractConfigured}
                title={contractConfigured ? undefined : "Set VITE_ZKP_VERIFIER_ADDRESS"}
              >
                {busy === "onchain" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verify on-chain
              </Button>
            </div>

            {!contractConfigured ? (
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                On-chain verification is unavailable — <code className="font-mono">VITE_ZKP_VERIFIER_ADDRESS</code>{" "}
                is not set. The local check validates against the key served by this page only.
              </p>
            ) : null}

            <AnimatePresence>
              {localError ? (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-[11px] text-destructive font-mono"
                >
                  {localError}
                </motion.p>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {onChain ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-lg border border-border divide-y divide-border/60"
                >
                  {[
                    { k: "Pairing check", v: onChain.valid ? "valid" : "invalid", ok: onChain.valid },
                    { k: "Circuit registered", v: onChain.circuitRegistered ? "yes" : "no", ok: onChain.circuitRegistered },
                    { k: "Nullifier burned", v: onChain.nullifierUsed ? "yes (replayed)" : "no", ok: !onChain.nullifierUsed },
                    { k: "Block", v: String(onChain.blockNumber), ok: true },
                  ].map((row) => (
                    <div key={row.k} className="flex items-center justify-between px-3 py-2 text-[11px]">
                      <span className="text-muted-foreground">{row.k}</span>
                      <span className={`font-mono font-semibold ${row.ok ? "text-emerald-500" : "text-destructive"}`}>
                        {row.v}
                      </span>
                    </div>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ZkpProofPanel;
