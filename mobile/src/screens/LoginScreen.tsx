import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { isConfigured, signInWithPassword } from "../lib/api";
import type { SessionInfo } from "../lib/types";

interface Props {
  onSignedIn: (session: SessionInfo) => void;
}

const LoginScreen = ({ onSignedIn }: Props) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    if (!isConfigured()) {
      setError("Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY");
      return;
    }
    setBusy(true);
    try {
      const session = await signInWithPassword(email.trim(), password);
      onSignedIn(session);
    } catch (e: any) {
      setError(e.message ?? "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.title}>BlockID</Text>
      <Text style={styles.subtitle}>Self-sovereign identity wallet</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#64748b"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#64748b"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={handleSignIn} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>

      <Text style={styles.hint}>
        Wallet sign-in (SIWE) lands with the deep-link flow — same challenge/verify contract as the web app.
      </Text>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b1120", justifyContent: "center", padding: 24 },
  title: { color: "#f8fafc", fontSize: 32, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "#94a3b8", fontSize: 14, textAlign: "center", marginBottom: 32 },
  input: {
    backgroundColor: "#111827",
    borderColor: "#1f2937",
    borderWidth: 1,
    borderRadius: 10,
    color: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  error: { color: "#ef4444", fontSize: 13, marginBottom: 8 },
  button: {
    backgroundColor: "#6366f1",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  hint: { color: "#475569", fontSize: 11, textAlign: "center", marginTop: 24 },
});

export default LoginScreen;
