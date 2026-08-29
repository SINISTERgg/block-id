import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import CredentialCard from "../components/CredentialCard";
import { fetchHolderCredentials, signOut } from "../lib/api";
import type { HolderCredential, SessionInfo } from "../lib/types";

interface Props {
  session: SessionInfo;
  onSignedOut: () => void;
}

const WalletScreen = ({ session, onSignedOut }: Props) => {
  const [credentials, setCredentials] = useState<HolderCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      try {
        setCredentials(await fetchHolderCredentials(session.userId));
        setError(null);
      } catch (e: any) {
        setError(e.message ?? "Failed to load credentials");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session.userId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleSignOut = async () => {
    await signOut();
    onSignedOut();
  };

  if (loading) return <ActivityIndicator style={styles.center} color="#6366f1" />;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>My Wallet</Text>
          <Text style={styles.subtitle}>{session.email}</Text>
        </View>
        <Pressable onPress={handleSignOut} hitSlop={8}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={credentials}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CredentialCard credential={item} />}
        ListEmptyComponent={<Text style={styles.empty}>No credentials yet.</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#6366f1" />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b1120", paddingTop: 60, paddingHorizontal: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { color: "#f8fafc", fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#94a3b8", fontSize: 13, marginTop: 2 },
  signOut: { color: "#f87171", fontWeight: "600" },
  error: { color: "#ef4444", fontSize: 13, marginBottom: 8 },
  empty: { color: "#64748b", textAlign: "center", marginTop: 40 },
  center: { flex: 1, backgroundColor: "#0b1120" },
});

export default WalletScreen;
