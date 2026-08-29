/**
 * BlockID mobile — app shell.
 * Bootstraps the persisted Supabase session and switches between
 * the login flow and the credential wallet.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import LoginScreen from "./src/screens/LoginScreen";
import WalletScreen from "./src/screens/WalletScreen";
import { supabase } from "./src/lib/api";
import type { SessionInfo } from "./src/lib/types";

const App = () => {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session?.user) {
          setSession({
            userId: data.session.user.id,
            email: data.session.user.email ?? "",
          });
        }
      })
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6366f1" size="large" />
      </View>
    );
  }

  return session ? (
    <WalletScreen session={session} onSignedOut={() => setSession(null)} />
  ) : (
    <LoginScreen onSignedIn={setSession} />
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: "#0b1120", justifyContent: "center", alignItems: "center" },
});

export default App;
