import { Pressable, StyleSheet, Text, View } from "react-native";
import type { HolderCredential } from "../lib/types";

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  revoked: "#ef4444",
  expired: "#f59e0b",
};

interface Props {
  credential: HolderCredential;
}

const CredentialCard = ({ credential }: Props) => {
  const name = credential.credential_schemas?.name ?? "Credential";
  const type = credential.credential_schemas?.credential_type ?? "unknown";
  const statusColor = STATUS_COLORS[credential.status] ?? "#94a3b8";

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.name}>{name}</Text>
        <Text style={[styles.badge, { color: statusColor, borderColor: statusColor }]}>
          {credential.status.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.meta}>Type: {type}</Text>
      <Text style={styles.meta} numberOfLines={1}>
        Hash: {credential.credential_hash.slice(0, 18)}…
      </Text>
      <Text style={styles.meta}>Issued: {credential.issued_at.slice(0, 10)}</Text>
      {!!credential.blockchain_anchor && <Text style={styles.anchor}>⛓ Anchored on-chain</Text>}
    </View>
  );
};

export const CredentialCardActions = ({ onShare }: { onShare: () => void }) => (
  <Pressable onPress={onShare} hitSlop={8}>
    <Text style={{ color: "#6366f1", fontWeight: "600" }}>Present</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: "#f8fafc", fontSize: 16, fontWeight: "700", flexShrink: 1 },
  badge: { fontSize: 11, fontWeight: "700", borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  meta: { color: "#94a3b8", fontSize: 12, marginTop: 4 },
  anchor: { color: "#38bdf8", fontSize: 12, marginTop: 6 },
});

export default CredentialCard;
