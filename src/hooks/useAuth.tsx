import { useState, useEffect, useRef, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profileLoading: boolean;
  profile: { full_name: string; organization: string; did: string | null; biometric_registered: boolean; face_registered: boolean } | null;
  role: string | null;
  accountStatus: string | null;
  signUp: (email: string, password: string, fullName: string, organization: string, role: "issuer" | "holder" | "verifier" | "org_admin") => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [role, setRole] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchProfile = async (userId: string): Promise<string | null> => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, organization, did, biometric_registered, face_registered, account_status")
      .eq("user_id", userId)
      .single();
    if (data) {
      setProfile(data);
      const status = (data as any).account_status ?? null;
      setAccountStatus(status);
      return status;
    }
    return null;
  };

  const fetchRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();
    if (data) setRole(data.role);
  };

  const fetchProfileAndRole = async (userId: string): Promise<string | null> => {
    setProfileLoading(true);
    const [status] = await Promise.all([fetchProfile(userId), fetchRole(userId)]);
    setProfileLoading(false);
    return status ?? null;
  };

  // Real-time subscription — keyed by user ID so it's only created ONCE per session
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;

    // Tear down any existing channel before creating a new one
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
          // payload.new is empty (REPLICA IDENTITY not FULL yet) — fall back to DB fetch
          fetchProfileAndRole(userId);
        }
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[useAuth] Realtime channel error — polling fallback will handle it");
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId]); // Stable dep — only re-runs when user changes

  const refreshProfile = async (): Promise<string | null> => {
    if (!user) return null;
    return fetchProfileAndRole(user.id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "INITIAL_SESSION") {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfileAndRole(session.user.id);
        } else {
          setProfile(null);
          setRole(null);
          setAccountStatus(null);
          setProfileLoading(false);
        }
        setLoading(false);
      } else if (event === "TOKEN_REFRESHED" && session) {
        setSession(session);
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string, organization: string, role: "issuer" | "holder" | "verifier" | "org_admin") => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) return { error: error.message };
    
    // Check if email confirmation is required
    if (!data.session) {
      // Email confirmation may be required - trigger still creates profile and role
      if (data.user) {
        // The user will need to confirm email to complete signup
        return { error: "_confirmation_required" };
      }
      return { error: "Signup failed. Please try again." };
    }
    
    // Email confirmed - update profile and insert role.
    // Issuers and verifiers must be approved by an admin before accessing the portal.
    const needsApproval = role === "issuer" || role === "verifier";
    await supabase.from("profiles").update({ 
      organization, 
      full_name: fullName,
      account_status: needsApproval ? "pending" : "approved"
    }).eq("user_id", data.user.id);
    
    await supabase.from("user_roles").insert({
      user_id: data.user.id,
      role: role,
    });
    
    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setProfileLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, profileLoading, profile, role, accountStatus, signUp, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
