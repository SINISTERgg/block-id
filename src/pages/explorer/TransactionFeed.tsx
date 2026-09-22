/**
 * TransactionFeed — stats cards and anchoring info banner.
 * Extracted from BlockchainExplorer.tsx.
 */
import React from "react";
import { Hash, Shield, Link2, DatabaseZap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import AnimatedCounter from "@/components/ui/AnimatedCounter";

interface TransactionFeedProps {
  totalBlocks: number;
  activeBlocks: number;
  onChainAnchored: number;
  chainIntegrity: number;
}

export const TransactionFeed: React.FC<TransactionFeedProps> = ({
  totalBlocks,
  activeBlocks,
  onChainAnchored,
  chainIntegrity,
}) => (
  <>
    {/* Anchoring Methods Info */}
    <Card className="glass-card border-0 rounded-2xl">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <DatabaseZap className="h-4 w-4 text-primary" />
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-foreground text-sm">How Anchoring Works</p>
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-start gap-2">
                <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 font-medium shrink-0">Contract</span>
                <span className="text-muted-foreground">
                  Credential hash stored as bytes32 in the CredentialRegistry smart contract on Ethereum Sepolia.
                  Provides immutable, cryptographically verifiable proof of existence.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium shrink-0">Legacy</span>
                <span className="text-muted-foreground">
                  Hash embedded in transaction calldata. Legacy method for credentials anchored before contract deployment or via external systems.
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Stats */}
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="grid grid-cols-2 md:grid-cols-4 gap-4"
    >
      <Card className="glass-card border-0 rounded-2xl">
        <CardContent className="pt-6">
          <AnimatedCounter
            value={totalBlocks}
            label="Total Blocks"
            icon={<Hash className="h-5 w-5 text-primary" />}
          />
        </CardContent>
      </Card>
      <Card className="glass-card border-0 rounded-2xl">
        <CardContent className="pt-6">
          <AnimatedCounter
            value={activeBlocks}
            label="Active"
            icon={<Shield className="h-5 w-5 text-accent-foreground" />}
          />
        </CardContent>
      </Card>
      <Card className="glass-card border-0 rounded-2xl">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl glass flex items-center justify-center">
              <DatabaseZap className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-foreground">{onChainAnchored}</p>
              <p className="text-sm text-muted-foreground">On-Chain Anchored</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="glass-card border-0 rounded-2xl">
        <CardContent className="pt-6">
          <AnimatedCounter
            value={chainIntegrity}
            label="Chain Integrity"
            suffix="%"
            icon={<Link2 className="h-5 w-5 text-primary" />}
          />
        </CardContent>
      </Card>
    </motion.div>
  </>
);
