import { useState } from "react";
import { BrowserProvider } from "ethers";
import { Wallet, ShieldCheck, Loader2, Users, Vote, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { setGuardians, voteForRecovery, finalizeRecovery } from "@/services/blockchain/smartWallet.service";

interface GuardianManagerProps {
  accountAddress: string | null;
  guardians: string[];
  threshold: number;
  onUpdated: () => void;
}

/**
 * Guardian-based social recovery management (Phase 2):
 * configure guardians/threshold, cast recovery votes, execute rotation.
 */
const GuardianManager = ({ accountAddress, guardians, threshold, onUpdated }: GuardianManagerProps) => {
  const [open, setOpen] = useState(false);
  const [guardianInputs, setGuardianInputs] = useState<string[]>(["", ""]);
  const [thresholdInput, setThresholdInput] = useState("2");
  const [newOwnerInput, setNewOwnerInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();

  async function requireProvider(): Promise<BrowserProvider | null> {
    if (!window.ethereum) return null;
    return new BrowserProvider(window.ethereum as any);
  }

  async function handleSaveGuardians() {
    if (!accountAddress) return;
    const cleaned = guardianInputs.map((g) => g.trim()).filter(Boolean);
    const t = Number(thresholdInput);
    if (cleaned.length === 0 || t < 1 || t > cleaned.length) {
      toast({ title: "Invalid configuration", description: "Threshold must be between 1 and the number of guardians", variant: "destructive" });
      return;
    }
    setBusy("save");
    try {
      const provider = await requireProvider();
      if (!provider) throw new Error("No wallet connected");
      await setGuardians(provider, accountAddress, cleaned, t);
      toast({ title: "Guardians updated", description: `${cleaned.length} guardians, ${t}-of-N approval` });
      setOpen(false);
      onUpdated();
    } catch (err: any) {
      toast({ title: "Failed to update guardians", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function handleVote() {
    if (!accountAddress || !newOwnerInput) return;
    setBusy("vote");
    try {
      const provider = await requireProvider();
      if (!provider) throw new Error("No wallet connected");
      await voteForRecovery(provider, accountAddress, newOwnerInput.trim());
      toast({ title: "Recovery vote recorded" });
    } catch (err: any) {
      toast({ title: "Vote failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function handleFinalize() {
    if (!accountAddress || !newOwnerInput) return;
    setBusy("finalize");
    try {
      const provider = await requireProvider();
      if (!provider) throw new Error("No wallet connected");
      await finalizeRecovery(provider, accountAddress, newOwnerInput.trim());
      toast({ title: "Ownership recovered", description: `Account now owned by ${newOwnerInput.slice(0, 8)}…` });
      onUpdated();
    } catch (err: any) {
      toast({ title: "Recovery failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!accountAddress}>
          <Users className="h-4 w-4 mr-2" />
          Guardians
          {guardians.length > 0 && (
            <Badge variant="secondary" className="ml-2">{guardians.length}/{threshold}</Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Social Recovery
          </DialogTitle>
          <DialogDescription>
            Appoint trusted wallets as guardians. If you lose your key,{" "}
            {"threshold"}-of-N guardian approval can rotate ownership to a new wallet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {guardians.length > 0 && (
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs font-medium">Current guardians</p>
              {guardians.map((g) => (
                <p key={g} className="text-xs font-mono text-muted-foreground truncate">{g}</p>
              ))}
              <p className="text-xs pt-1 flex items-center gap-1 text-primary">
                <CheckCircle2 className="h-3 w-3" /> {threshold}-of-{guardians.length} approval required
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Guardian addresses</Label>
            {guardianInputs.map((value, i) => (
              <Input
                key={i}
                placeholder={`Guardian ${i + 1} (0x…)`}
                value={value}
                onChange={(e) =>
                  setGuardianInputs((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                }
                className="font-mono text-xs"
              />
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGuardianInputs((p) => [...p, ""])}
              className="text-xs"
            >
              + Add guardian
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recovery-threshold">Approval threshold</Label>
            <Input id="recovery-threshold" type="number" min={1} value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)} />
          </div>

          <div className="space-y-2 border-t pt-3">
            <Label htmlFor="new-owner">Recover to new owner</Label>
            <Input id="new-owner" placeholder="New owner address (0x…)" value={newOwnerInput} onChange={(e) => setNewOwnerInput(e.target.value)} className="font-mono text-xs" />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleVote} disabled={!!busy || !newOwnerInput}>
                {busy === "vote" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Vote className="h-4 w-4 mr-1" />}
                Vote
              </Button>
              <Button size="sm" onClick={handleFinalize} disabled={!!busy || !newOwnerInput}>
                {busy === "finalize" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
                Execute Recovery
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSaveGuardians} disabled={!!busy}>
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wallet className="h-4 w-4 mr-2" />}
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GuardianManager;
