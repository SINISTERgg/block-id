/**
 * SelectiveDisclosureInspector — what the holder actually shared.
 *
 * The point of a selective-disclosure credential is that the holder reveals a
 * subset. This component makes that subset legible: it distinguishes fields the
 * holder *did* disclose from fields the credential schema defines but the
 * holder *did not* send. Showing the missing ones as "withheld" (not as
 * "invalid") is the difference between an honest disclosure log and a UI that
 * implies a failed presentation.
 */
import { useMemo, useState } from "react";
import { Eye, EyeOff, ChevronRight, Fingerprint } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export interface DisclosedField {
  path: string;
  value: unknown;
  /** Set when the schema defines the field but the holder withheld it. */
  withheld?: boolean;
  /** Set for the OID4VP path when a ZKP covered the field instead. */
  provenWithoutDisclosure?: boolean;
}

interface SelectiveDisclosureInspectorProps {
  /** The exact object the holder sent. */
  disclosed: Record<string, unknown> | null;
  /** Schema-defined field paths, used to detect what was withheld. */
  schemaFields?: string[];
  /** Public signals from a ZKP, when the presentation included one. */
  zkpCoveredFields?: string[];
  /** SHA-256 fingerprint of the full credential, when known. */
  credentialFingerprint?: string | null;
}

/** Flatten nested objects to dotted paths; arrays are kept as JSON values. */
function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, path));
    } else {
      out[path] = v;
    }
  }
  return out;
}

export default function SelectiveDisclosureInspector({
  disclosed,
  schemaFields = [],
  zkpCoveredFields = [],
  credentialFingerprint,
}: SelectiveDisclosureInspectorProps) {
  const { toast } = useToast();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const { rows, disclosedCount, withheldCount, zkpCount } = useMemo(() => {
    const flat = disclosed ? flatten(disclosed) : {};
    const zkp = new Set(zkpCoveredFields);
    const built: DisclosedField[] = Object.entries(flat).map(([path, value]) => ({
      path,
      value,
      ...(zkp.has(path) ? { provenWithoutDisclosure: true } : {}),
    }));
    // Schema fields the holder never sent. Reported separately so an empty
    // `disclosed` object does not read as "nothing was withheld".
    for (const path of schemaFields) {
      if (!(path in flat)) {
        built.push({ path, value: null, withheld: true, ...(zkp.has(path) ? { provenWithoutDisclosure: true } : {}) });
      }
    }
    built.sort((a, b) => {
      if (!!a.withheld !== !!b.withheld) return a.withheld ? 1 : -1;
      return a.path.localeCompare(b.path);
    });
    return {
      rows: built,
      disclosedCount: built.filter((r) => !r.withheld).length,
      withheldCount: built.filter((r) => r.withheld).length,
      zkpCount: built.filter((r) => r.provenWithoutDisclosure).length,
    };
  }, [disclosed, schemaFields, zkpCoveredFields]);

  const toggle = (path: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (rows.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-[11px] text-muted-foreground">
        <Fingerprint className="h-4 w-4 shrink-0" />
        This presentation disclosed no individual fields.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" size="sm">{disclosedCount} shared</Badge>
        {withheldCount > 0 ? (
          <Badge variant="outline" size="sm" className="border-muted-foreground/30 text-muted-foreground">
            {withheldCount} withheld
          </Badge>
        ) : null}
        {zkpCount > 0 ? (
          <Badge variant="secondary" size="sm" className="border-emerald-500/30 text-emerald-500">
            {zkpCount} proven via ZKP
          </Badge>
        ) : null}
      </div>

      <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
        {rows.map((r) => {
          const isHidden = hidden.has(r.path);
          return (
            <div key={r.path} className="flex items-start gap-3 px-3 py-2 hover:bg-muted/30">
              {r.withheld ? (
                <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 mt-0.5" />
              ) : (
                <Eye className="h-3.5 w-3.5 shrink-0 text-verifier mt-0.5" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] font-semibold text-foreground">{r.path}</span>
                  {r.provenWithoutDisclosure ? (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/5 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-emerald-500">
                      proven, not shown
                    </span>
                  ) : null}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground mt-0.5 break-all">
                  {r.withheld ? (
                    <span className="italic">
                      {r.provenWithoutDisclosure
                        ? "Not disclosed — verified inside the ZKP"
                        : "Not disclosed by the holder"}
                    </span>
                  ) : isHidden ? (
                    <button
                      onClick={() => toggle(r.path)}
                      className="inline-flex items-center gap-1 text-muted-foreground/70 hover:text-foreground"
                    >
                      hidden — click to reveal <ChevronRight className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      onClick={() => { toggle(r.path); navigator.clipboard.writeText(String(r.value)); toast({ title: "Value copied" }); }}
                      className="text-left hover:text-foreground"
                      title="Click to hide · value copied"
                    >
                      {typeof r.value === "object" ? JSON.stringify(r.value) : String(r.value)}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {credentialFingerprint ? (
        <div className="flex items-start gap-2 text-[10px] text-muted-foreground">
          <Fingerprint className="h-3.5 w-3.5 shrink-0" />
          <span>
            Fields are bound to credential{" "}
            <span className="font-mono text-foreground break-all">{credentialFingerprint}</span> via
            SHA-256, so a field cannot be lifted into a different credential.
          </span>
        </div>
      ) : null}

      <AnimatePresence>
        {withheldCount > 0 ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-[10px] text-muted-foreground leading-relaxed"
          >
            Withheld fields are not failures. A holder proving age over 18 with a ZKP sends
            no date of birth at all — the constraint is satisfied inside the proof instead.
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
