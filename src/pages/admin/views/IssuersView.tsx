/**
 * IssuersView — Trusted Issuer Registry management tab.
 * Extracted from AdminDashboard.tsx.
 */
import React from "react";
import { Search, RefreshCw, ThumbsUp, ThumbsDown, ShieldCheck, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { TrustedIssuer } from "./StatsView";

interface IssuersViewProps {
  issuers: TrustedIssuer[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  filter: "all" | "verified" | "pending" | "rejected";
  setFilter: (v: "all" | "verified" | "pending" | "rejected") => void;
  onRefresh: () => void;
  onAction: (issuer: TrustedIssuer, type: "accept" | "reject") => void;
}

export const IssuersView: React.FC<IssuersViewProps> = ({
  issuers, loading, search, setSearch, filter, setFilter, onRefresh, onAction,
}) => {
  const filteredIssuers = issuers.filter((i) => {
    const matchesSearch =
      !search ||
      i.organization_name?.toLowerCase().includes(search.toLowerCase()) ||
      i.issuer_did?.toLowerCase().includes(search.toLowerCase()) ||
      i.domain?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "pending"  && i.verification_status === "pending") ||
      (filter === "verified" && i.verification_status === "verified") ||
      (filter === "rejected" && i.verification_status === "rejected");
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Trusted Issuer Registry
              </CardTitle>
              <CardDescription>Manage trusted issuer registrations</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, DID, or domain..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              {(["all", "verified", "pending", "rejected"] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(f)}
                  className="capitalize"
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-8 text-center">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground mt-2">Loading issuers...</p>
            </div>
          ) : filteredIssuers.length === 0 ? (
            <div className="py-8 text-center">
              <ShieldCheck className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground mt-2">No issuers found</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredIssuers.map((issuer) => (
                <div key={issuer.id} className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      issuer.verification_status === "verified"
                        ? "bg-emerald-500/10"
                        : issuer.verification_status === "rejected"
                        ? "bg-red-500/10"
                        : "bg-amber-500/10"
                    }`}>
                      {issuer.verification_status === "verified" ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : issuer.verification_status === "rejected" ? (
                        <XCircle className="h-5 w-5 text-red-500" />
                      ) : (
                        <Clock className="h-5 w-5 text-amber-500" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{issuer.organization_name}</p>
                      <p className="text-sm text-muted-foreground font-mono">{issuer.issuer_did}</p>
                      {issuer.domain && (
                        <p className="text-xs text-muted-foreground">{issuer.domain}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="capitalize">{issuer.verification_status}</Badge>
                    {issuer.verification_status === "pending" && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => onAction(issuer, "accept")}>
                          <ThumbsUp className="h-4 w-4 mr-1" /> Verify
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => onAction(issuer, "reject")}>
                          <ThumbsDown className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
