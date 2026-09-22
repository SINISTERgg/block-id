/**
 * useAuthActions — sign-up, sign-in, and sign-out actions.
 * Pure side-effect functions with no state. Decoupled from auth state
 * management so they can be tested independently.
 */
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "issuer" | "holder" | "verifier" | "org_admin";

export interface AuthActions {
  signUp: (
    email: string,
    password: string,
    fullName: string,
    organization: string,
    role: UserRole
  ) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export function useAuthActions(): AuthActions {
  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    organization: string,
    role: UserRole
  ): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) return { error: error.message };

    if (!data.session) {
      if (data.user) {
        return { error: "_confirmation_required" };
      }
      return { error: "Signup failed. Please try again." };
    }

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

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut();
  };

  return { signUp, signIn, signOut };
}
