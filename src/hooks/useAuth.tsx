import { useCallback, createContext, useContext, ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { useAuthState } from "./auth/useAuthState";
import { useProfile, ProfileData } from "./auth/useProfile";
import { useAuthActions, UserRole } from "./auth/useAuthActions";

// ── Public interface — identical to the original ─────────────────────────────

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profileLoading: boolean;
  profile: ProfileData | null;
  role: string | null;
  accountStatus: string | null;
  signUp: (email: string, password: string, fullName: string, organization: string, role: UserRole) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Profile hook is driven by userId from auth state
  const {
    profile,
    role,
    accountStatus,
    profileLoading,
    fetchProfileAndRole,
  } = useProfile(null /* will be updated via onUserChange */);

  // Auth state listener — drives the profile hook via the stable callback
  const onUserChange = useCallback((userId: string | null) => {
    if (userId) {
      fetchProfileAndRole(userId);
    }
    // profile hook's own useEffect also handles userId=null reset
  }, [fetchProfileAndRole]);

  const { user, session, loading } = useAuthState(onUserChange);

  const { signUp, signIn, signOut: supabaseSignOut } = useAuthActions();

  const signOut = async () => {
    await supabaseSignOut();
    // profile state will reset via the useProfile useEffect triggered by userId→null
  };

  const refreshProfile = async (): Promise<string | null> => {
    if (!user) return null;
    return fetchProfileAndRole(user.id);
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      profileLoading,
      profile,
      role,
      accountStatus,
      signUp,
      signIn,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// ── Consumer hook ─────────────────────────────────────────────────────────────

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
