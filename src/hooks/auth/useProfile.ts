/**
 * useProfile — profile and role fetching with realtime subscription.
 * Handles DB queries for profiles/user_roles and the Supabase realtime
 * channel that keeps account_status current.
 */
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProfileData {
  full_name: string;
  organization: string;
  did: string | null;
  biometric_registered: boolean;
  face_registered: boolean;
}

export interface UseProfileResult {
  profile: ProfileData | null;
  role: string | null;
  accountStatus: string | null;
  profileLoading: boolean;
  fetchProfileAndRole: (userId: string) => Promise<string | null>;
}

export function useProfile(userId: string | null): UseProfileResult {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchProfile = async (uid: string): Promise<string | null> => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, organization, did, biometric_registered, face_registered, account_status")
      .eq("user_id", uid)
      .single();
    if (data) {
      setProfile(data as ProfileData);
      const status = (data as any).account_status ?? null;
      setAccountStatus(status);
      return status;
    }
    return null;
  };

  const fetchRole = async (uid: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .single();
    if (data) setRole(data.role);
  };

  const fetchProfileAndRole = async (uid: string): Promise<string | null> => {
    setProfileLoading(true);
    const [status] = await Promise.all([fetchProfile(uid), fetchRole(uid)]);
    setProfileLoading(false);
    return status ?? null;
  };

  // Realtime subscription — keyed by user ID so it's only created ONCE per session
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setRole(null);
      setAccountStatus(null);
      setProfileLoading(false);
      return;
    }

    fetchProfileAndRole(userId);

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`profile-status-${userId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "profiles",
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        const newRow = payload.new as any;
        if (newRow?.account_status) {
          setAccountStatus(newRow.account_status);
          setProfile((prev) => prev ? { ...prev, ...newRow } : newRow);
        } else {
          // payload.new is empty (REPLICA IDENTITY not FULL) — fall back to DB fetch
          fetchProfileAndRole(userId);
        }
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[useProfile] Realtime channel error — polling fallback will handle it");
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { profile, role, accountStatus, profileLoading, fetchProfileAndRole };
}
