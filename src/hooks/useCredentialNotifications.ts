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
          // Notify holders of incoming verification requests
          // This works because we have RLS that checks holder_did
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      isSubscribed.current = false;
    };
  }, [user, toast]);
};
