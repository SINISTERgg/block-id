import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

/**
 * Hook that listens for realtime credential changes and shows toast notifications.
 * Use in HolderWallet to notify when credentials are issued or revoked.
 */
export const useCredentialNotifications = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSubscribed = useRef(false);

  useEffect(() => {
    if (!user || isSubscribed.current) return;
    isSubscribed.current = true;

    const channel = supabase
      .channel("credential-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "credentials" },
        (payload) => {
          const cred = payload.new as any;
          if (cred.holder_id === user.id) {
            toast({
              title: "🎓 New Credential Received",
              description: "A new verifiable credential has been issued to your DID.",
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "credentials" },
        (payload) => {
          const cred = payload.new as any;
          if (cred.holder_id === user.id && cred.status === "revoked") {
            toast({
              title: "⚠️ Credential Revoked",
              description: "One of your credentials has been revoked by the issuer.",
              variant: "destructive",
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "verification_requests" },
        (payload) => {
          const req = payload.new as any;
          // Notify holder when a verifier requests their credentials
          if (req.holder_did) {
            toast({
              title: "🔍 Verification Request Received",
              description: `A verifier has requested your ${req.credential_type || "credential"} for: ${req.purpose || "verification"}.`,
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "verification_requests" },
        (payload) => {
          const req = payload.new as any;
          if (req.status === "verified") {
            toast({
              title: "✅ Verification Request Accepted",
              description: `Your ${req.credential_type || "credential"} has been successfully verified.`,
            });
          } else if (req.status === "rejected") {
            toast({
              title: "❌ Verification Request Rejected",
              description: `Your ${req.credential_type || "credential"} verification was rejected.`,
              variant: "destructive",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      isSubscribed.current = false;
    };
  }, [user, toast]);
};
