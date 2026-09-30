import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, Search, ShieldCheck, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface HolderLookupInputProps {
  /** The resolved holder DID. Always what gets sent to the issuance API. */
  value: string;
  onChange: (did: string) => void;
  placeholder?: string;
  className?: string;
}

interface HolderProfile {
  user_id: string;
  full_name: string | null;
  did: string | null;
  wallet_address: string | null;
  organization: string | null;
  account_status: string | null;
  biometric_registered: boolean | null;
}

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const DID_RE = /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._-]$/;

/** Network the platform mints holder DIDs on (see the `generate_did` RPC). */
export const HOLDER_DID_METHOD = "did:ethr:sepolia";

/**
 * Normalize whatever the issuer typed into a DID the issuance API will accept:
 * a bare `0x…` wallet address is promoted to an `ethr` DID, anything else that
 * already parses as a DID is passed through untouched.
 */
export function normalizeHolderDid(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (ETH_ADDRESS_RE.test(trimmed)) return `${HOLDER_DID_METHOD}:${trimmed}`;
  return trimmed;
}

function initialsOf(name: string | null, fallback: string): string {
  const source = (name || fallback || "?").trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Combobox for targeting a holder: type a name, a wallet address or a DID and
 * either pick a registered profile or let it be normalized into a DID.
 *
 * Note: `profiles` carries no email column, so lookup is scoped to the columns
 * that exist (name, DID, wallet). An email typed here is kept verbatim rather
 * than silently dropped, and the issuer sees an "unresolved" warning.
 */
const HolderLookupInput = ({ value, onChange, placeholder = "Search holder by name, 0x address, or DID…", className }: HolderLookupInputProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HolderProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // An address or DID is self-resolving — no profile search needed.
  const isSelfResolving = useMemo(() => ETH_ADDRESS_RE.test(query.trim()) || DID_RE.test(query.trim()), [query]);

  useEffect(() => {
    if (isSelfResolving) {
      setResults([]);
      setSearching(false);
      return;
    }
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, full_name, did, wallet_address, organization, account_status, biometric_registered")
          .or(`full_name.ilike.%${term}%,did.ilike.%${term}%,wallet_address.ilike.%${term}%`)
          .not("did", "is", null)
          .limit(8);
        if (error) throw error;
        setResults((data ?? []) as HolderProfile[]);
        setActiveIndex(0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query, isSelfResolving]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const selectProfile = (profile: HolderProfile) => {
    if (!profile.did) return;
    onChange(profile.did);
    setQuery(profile.did);
    setOpen(false);
    setResults([]);
  };

  const commitFreeText = () => {
    if (!query.trim()) {
      onChange("");
      return;
    }
    onChange(normalizeHolderDid(query));
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = results[activeIndex];
      if (open && picked) selectProfile(picked);
      else commitFreeText();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const normalizedPreview = query.trim() && !isSelfResolving ? normalizeHolderDid(query) : "";
  const showUnresolvedWarning =
    !!query.trim() && !isSelfResolving && !searching && results.length === 0 && !query.includes("@");

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={commitFreeText}
          placeholder={placeholder}
          className={className}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && !isSelfResolving}
          aria-controls="holder-lookup-listbox"
        />
        {searching && (
          <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); onChange(""); setResults([]); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded transition-colors"
            aria-label="Clear holder"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {open && !isSelfResolving && (query.trim().length >= 2 || results.length > 0) && (
        <div
          id="holder-lookup-listbox"
          role="listbox"
          className="absolute z-50 mt-1 w-full border border-border bg-popover shadow-lg max-h-64 overflow-y-auto"
        >
          {results.length === 0 ? (
            <div className="px-3 py-4 text-center">
              {searching ? (
                <p className="text-xs text-muted-foreground">Searching holders…</p>
              ) : (
                <>
                  <Search className="h-4 w-4 text-muted-foreground mx-auto mb-1.5" />
                  <p className="text-xs text-muted-foreground">No registered holder matches this.</p>
                  {normalizedPreview && (
                    <p className="text-[10px] font-mono text-muted-foreground/70 mt-1 break-all">
                      Press Enter to use as-is
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (
            results.map((profile, i) => {
              const verified = profile.account_status === "approved" && !!profile.did;
              return (
                <button
                  key={profile.user_id}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectProfile(profile)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    i === activeIndex ? "bg-muted" : "hover:bg-muted/60"
                  }`}
                >
                  <span className="w-8 h-8 shrink-0 bg-issuer text-white flex items-center justify-center font-mono text-[10px] font-bold">
                    {initialsOf(profile.full_name, profile.wallet_address || "?")}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground truncate">
                        {profile.full_name || "Unnamed holder"}
                      </span>
                      {verified && (
                        <span title="Verified holder" className="shrink-0">
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        </span>
                      )}
                      {profile.biometric_registered && (
                        <span title="Passkey protected" className="shrink-0">
                          <ShieldCheck className="h-3.5 w-3.5 text-holder" />
                        </span>
                      )}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground truncate">
                      {profile.did}
                    </span>
                    {profile.organization && (
                      <span className="block text-[10px] text-muted-foreground/70 truncate">{profile.organization}</span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Resolved-target confirmation strip */}
      {value && (
        <div className="mt-1.5 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.12em]">
          <User className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground truncate">Target DID</span>
          <span className="text-holder truncate">{value}</span>
        </div>
      )}
      {showUnresolvedWarning && (
        <p className="mt-1.5 text-[10px] text-warning font-mono uppercase tracking-[0.12em]">
          Unresolved — this will be used verbatim as the holder DID
        </p>
      )}
    </div>
  );
};

export default HolderLookupInput;
