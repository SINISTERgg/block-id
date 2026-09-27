/**
 * Threat Intelligence Center — behavioural signal review for a verifier.
 *
 * Three lenses over the verifier's own history:
 *   1. Aggregate anomaly report (all 5 detectors, organisation-wide).
 *   2. Impossible-travel hops — the one finding that usually warrants a
 *      conversation with a holder, so it gets its own table.
 *   3. The blocklist — per-verifier, advisory. It records a decision and a
 *      reason; it is not a credential revocation and never affects other
 *      verifiers.
 *
 * Nothing here auto-blocks. An anomaly is evidence for a human decision, and a
 * dashboard that silently denylists holders produces both false positives and
 * a compliance problem.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Radar, ShieldAlert, MapPin, Ban, Plus, Trash2, Loader2, Info, Users, Gauge,
} from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import AnomalyPanel from "@/components/verifier/AnomalyPanel";
import {
  addToBlocklist,
  fetchBlocklist,
  fetchLatestVerificationRecords,
  removeFromBlocklist,
  type BlocklistEntry,
} from "@/services/api/verifier.service";
import {
  analyzeRecords,
  buildGeoHops,
  buildHolderWatchlist,
  riskLevel,
  RISK_LEVEL_CLASS,
  RISK_LEVEL_LABEL,
  type IntelligenceRecord,
} from "@/lib/verifier/intelligence";

/** A jet's cruise speed — anything above this cannot be a real human journey. */
const IMPLAUSIBLE_KMH = 900;

interface ThreatIntelViewProps {
  verifierId: string;
  history: IntelligenceRecord[];
}

const ThreatIntelView = ({ verifierId, history }: ThreatIntelViewProps) => {
  const { toast } = useToast();
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>([]);
  const [newDid, setNewDid] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingBlocklist, setLoadingBlocklist] = useState(true);

  const loadBlocklist = useCallback(async () => {
    setLoadingBlocklist(true);
    try {
      setBlocklist(await fetchBlocklist(verifierId));
    } catch {
      // leave the list empty; the section reports nothing found
    } finally {
      setLoadingBlocklist(false);
    }
  }, [verifierId]);

  useEffect(() => {
    loadBlocklist();
  }, [loadBlocklist]);

  const report = useMemo(() => (history.length >= 2 ? analyzeRecords(history) : null), [history]);
  const hops = useMemo(() => buildGeoHops(history), [history]);
  const implausible = useMemo(
    () => hops.filter((h) => h.speedKmh > IMPLAUSIBLE_KMH).sort((a, b) => b.speedKmh - a.speedKmh).slice(0, 8),
    [hops]
  );
  const watchlist = useMemo(() => buildHolderWatchlist(history, 6), [history]);

  const risk = report?.riskScore ?? null;
  const level = riskLevel(risk);

  const add = async () => {
    const did = newDid.trim();
    if (!did) return;
    if (blocklist.some((b) => b.holder_did === did)) {
      toast({ title: "Already blocklisted", description: did });
      return;
    }
    setSaving(true);
    try {
      await addToBlocklist(verifierId, did, reason.trim() || undefined);
      setNewDid("");
      setReason("");
      toast({ title: "Holder blocklisted", description: did });
      await loadBlocklist();
    } catch (err) {
      toast({
        title: "Could not block holder",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entry: BlocklistEntry) => {
    try {
      await removeFromBlocklist(entry.id);
      toast({ title: "Holder unblocked", description: entry.holder_did });
      await loadBlocklist();
    } catch (err) {
      toast({
        title: "Could not unblock holder",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-headline mb-1">Threat Intelligence</h2>
            <p className="text-muted-foreground">
              Behavioural anomalies, impossible travel, and your blocklist
            </p>
          </div>
          {risk !== null ? (
            <span
              className={`rounded-full border px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider ${RISK_LEVEL_CLASS[level]}`}
            >
              {RISK_LEVEL_LABEL[level]} risk · {Math.round(risk)}/100
            </span>
          ) : null}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Aggregate detectors ── */}
        <Card className="solid-card">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-verifier flex items-center justify-center">
                <Radar className="h-4 w-4 text-[#030304]" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-foreground">Aggregate signals</h3>
                <p className="text-xs text-muted-foreground">
                  All 5 detectors across your verification traffic
                </p>
              </div>
            </div>

            <AnomalyPanel
              report={report}
              sampleSize={history.length}
              scope="your whole account"
            />
          </CardContent>
        </Card>

        {/* ── Impossible travel ── */}
        <Card className="solid-card">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-holder flex items-center justify-center">
                <MapPin className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-foreground">Impossible travel</h3>
                <p className="text-xs text-muted-foreground">
                  Consecutive located verifications implying a speed above {IMPLAUSIBLE_KMH} km/h
                </p>
              </div>
            </div>

            {implausible.length === 0 ? (
              <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-[11px] text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0" />
                {hops.length === 0
                  ? "No verifications carried geolocation data, so travel cannot be checked."
                  : `${hops.length} located transitions analysed — none exceed plausible human travel speed.`}
              </p>
            ) : (
              <div className="rounded-lg border border-destructive/30 divide-y divide-destructive/20 overflow-hidden">
                {implausible.map((h, i) => (
                  <div key={i} className="px-3 py-2.5 bg-destructive/5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold text-destructive">
                        {Math.round(h.speedKmh).toLocaleString()} km/h
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {h.distanceKm.toFixed(0)} km in {h.hours.toFixed(1)}h
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground break-all">
                      {h.from.lat.toFixed(3)},{h.from.lon.toFixed(3)} →{" "}
                      {h.to.lat.toFixed(3)},{h.to.lon.toFixed(3)}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {new Date(h.from.at).toISOString().slice(0, 16).replace("T", " ")} →{" "}
                      {new Date(h.to.at).toISOString().slice(0, 16).replace("T", " ")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Watchlist ── */}
      {watchlist.length > 0 ? (
        <Card className="solid-card">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-verifier" />
              <span className="text-sm font-semibold text-foreground">Holders to look at</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                ranked by rejections, then low trust
              </span>
            </div>

            <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
              {watchlist.map((row) => (
                <div key={row.holder} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
                  <span className="font-mono text-[10px] text-foreground flex-1 truncate">{row.holder}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{row.total} req</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {row.rejected} rej
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${
                      row.avgTrust >= 60
                        ? "border-emerald-500/30 text-emerald-500"
                        : row.avgTrust >= 40
                          ? "border-amber-500/30 text-amber-500"
                          : "border-destructive/30 text-destructive"
                    }`}
                  >
                    trust {Math.round(row.avgTrust)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Blocklist ── */}
      <Card className="solid-card">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-destructive/80 flex items-center justify-center">
              <ShieldAlert className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-foreground">Blocklist</h3>
              <p className="text-xs text-muted-foreground">
                Private to your organisation — never visible to other verifiers or the holder
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Holder DID</Label>
              <Input
                value={newDid}
                onChange={(e) => setNewDid(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                placeholder="did:ethr:sepolia:0x…"
                className="font-mono text-xs input-solid"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. suspected fraud"
                className="input-solid text-xs"
              />
            </div>
          </div>

          <Button className="btn-primary gap-2" onClick={add} disabled={saving || !newDid.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add to blocklist
          </Button>

          <Separator />

          {loadingBlocklist ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : blocklist.length === 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-[11px] text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Your blocklist is empty. Blocklisting does not revoke a credential or affect other
              verifiers — it is a local record that this holder&apos;s presentations should be
              handled with extra scrutiny.
            </p>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
              {blocklist.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Ban className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] text-foreground truncate">{entry.holder_did}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {entry.reason ?? "No reason recorded"} ·{" "}
                      {new Date(entry.blocked_at).toISOString().slice(0, 10)}
                    </p>
                  </div>
                  <Badge variant="destructive" size="sm">
                    blocked
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => remove(entry)}
                    title="Remove from blocklist"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground leading-relaxed">
            <Gauge className="h-3 w-3 shrink-0" />
            This centre reports evidence; it never blocks a holder automatically. Every anomaly
            here is a signal for a human decision, and a wrong auto-denylist is a compliance
            incident in its own right.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ThreatIntelView;
