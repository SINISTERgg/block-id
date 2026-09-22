/**
 * useAuthState — raw Supabase auth listener.
 * Manages session and user state, delegating profile/role loading
 * to a callback to keep this hook free of database concerns.
 */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export interface AuthStateResult {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

/**
 * Subscribe to Supabase auth state changes.
 * Calls `onUserChange` when the active user changes so callers can
 * load profile/role data separately.
 */
export function useAuthState(
  onUserChange: (userId: string | null) => void
): AuthStateResult {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "INITIAL_SESSION") {
        setSession(session);
        setUser(session?.user ?? null);
        onUserChange(session?.user?.id ?? null);
        setLoading(false);
      } else if (event === "TOKEN_REFRESHED" && session) {
        setSession(session);
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
    // onUserChange intentionally excluded — stable ref expected from caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, session, loading };
}
