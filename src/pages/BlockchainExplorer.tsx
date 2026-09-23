import { useState, useEffect, useMemo, useCallback } from "react";
import { Link2, Home, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import DashboardSkeleton from "@/components/ui/DashboardSkeleton";
import { AMOY_EXPLORER, IS_CONTRACT_DEPLOYED } from "@/services/blockchain/config";

// ── Extracted panels ──────────────────────────────────────────────────────────
import { TransactionFeed } from "./explorer/TransactionFeed";
import { CredentialLookupPanel, type BlockCredential } from "./explorer/CredentialLookupPanel";

const BlockchainExplorer = () => {
  const [credentials, setCredentials] = useState<BlockCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBlock, setSelectedBlock] = useState<BlockCredential | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchChain = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("credentials")
      .select("id, credential_hash, prev_hash, blockchain_anchor, credential_data, status, issued_at, holder_did, credential_schemas(name, credential_type)")
      .order("issued_at", { ascending: true })
      .limit(200);
    if (data) setCredentials(data as BlockCredential[]);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) { setIsLoading(false); return; }
    fetchChain();
  }, [user, fetchChain]);

  const filteredCredentials = useMemo(() => {
    if (!searchQuery.trim()) return credentials;
    const q = searchQuery.toLowerCase();
    return credentials.filter((c) =>
      c.credential_hash.toLowerCase().includes(q) ||
      c.blockchain_anchor?.toLowerCase().includes(q) ||
      c.holder_did.toLowerCase().includes(q) ||
      c.credential_schemas?.name.toLowerCase().includes(q) ||
      c.credential_data?.blockchain?.txHash?.toLowerCase().includes(q)
    );
  }, [credentials, searchQuery]);

  const totalBlocks = credentials.length;
  const activeBlocks = credentials.filter((c) => c.status === "active").length;
  const onChainAnchored = credentials.filter((c) => c.credential_data?.blockchain?.txHash).length;
  const chainIntegrity = totalBlocks > 0 ? Math.round((activeBlocks / totalBlocks) * 100) : 100;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern bg-grid-pattern-fade opacity-40 pointer-events-none" />
        <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10">
          <DashboardSkeleton stats={4} showCharts={false} listItems={6} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern bg-grid-pattern-fade opacity-40 pointer-events-none" />

      <header className="glass-header px-4 sm:px-6 py-3 sticky top-0 z-50 relative">
        <div className="container mx-auto flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigate("/")}
                  className="border-border hover:border-primary hover:text-primary transition-colors"
                >
                  <Home className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to Home</TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center">
                <Link2 className="h-4 w-4" />
              </div>
              <span className="font-heading text-lg font-semibold uppercase tracking-tight">Blockchain Explorer</span>
            </div>
          </motion.div>

          {IS_CONTRACT_DEPLOYED && (
            <motion.a
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              href={`${AMOY_EXPLORER}/address/${import.meta.env.VITE_CREDENTIAL_REGISTRY_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <ExternalLink className="h-3 w-3" /> View Contract on Etherscan
            </motion.a>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 relative z-10">
        <TransactionFeed
          totalBlocks={totalBlocks}
          activeBlocks={activeBlocks}
          onChainAnchored={onChainAnchored}
          chainIntegrity={chainIntegrity}
        />

        <CredentialLookupPanel
          credentials={filteredCredentials}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedBlock={selectedBlock}
          onSelectBlock={setSelectedBlock}
        />
      </main>
    </div>
  );
};

export default BlockchainExplorer;
