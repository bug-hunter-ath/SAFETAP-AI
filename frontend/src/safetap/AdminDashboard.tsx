import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "./api";
import { C } from "./theme";
import { SectionHeader } from "./ui";

export default function AdminDashboard({ token }: { token: string }) {
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setOverview(await api<any>("/admin/overview", undefined, token));
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.amber} />
      </View>
    );
  }

  const rows = [
    { l: "Demo role accounts", v: overview?.users || 0 },
    { l: "Verified brands", v: overview?.brands || 0 },
    { l: "Campaign clusters", v: overview?.campaigns || 0 },
  ];

  return (
    <View>
      <SectionHeader icon="view-dashboard-outline" title="Platform Control" subtitle="Users, brands, sources, and system analytics." />

      <View style={s.card}>
        <Text style={s.eyebrow}>SYSTEM SNAPSHOT</Text>
        <Text style={s.big}>
          {overview?.cases || 0} <Text style={s.muted}>cases in workspace</Text>
        </Text>
        {rows.map((r) => (
          <View key={r.l} style={s.row}>
            <Text style={s.muted}>{r.l}</Text>
            <Text style={s.value}>{r.v}</Text>
          </View>
        ))}
      </View>

      <Text style={s.section}>Data sources</Text>
      <SourceRow
        icon="database-outline"
        color={C.green}
        title="Kaggle phishing features"
        subtitle="Historical training signals"
      />
      <SourceRow
        icon="rss"
        color={C.amber}
        title="OpenPhish / PhishTank"
        subtitle="Current threat adapter + fallback"
      />

      <Text style={s.section}>AI languages online</Text>
      <View style={s.chips}>
        {(overview?.languages_supported || []).map((n: string) => (
          <View key={n} style={s.chip}>
            <Text style={s.chipText}>{n}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SourceRow({ icon, color, title, subtitle }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string; title: string; subtitle: string }) {
  return (
    <View style={s.source}>
      <View style={[s.sIcon, { borderColor: color }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.sTitle}>{title}</Text>
        <Text style={s.muted}>{subtitle}</Text>
      </View>
      <Text style={s.live}>READY</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: { padding: 40, alignItems: "center" },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 18 },
  eyebrow: { color: C.amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  big: { color: C.text, fontSize: 30, fontWeight: "900", marginVertical: 18 },
  muted: { color: C.muted, fontSize: 13 },
  row: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: C.line, paddingVertical: 13 },
  value: { color: C.text, fontWeight: "800" },
  section: { color: C.text, fontSize: 16, fontWeight: "800", marginTop: 24, marginBottom: 10 },
  source: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  sIcon: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sTitle: { color: C.text, fontWeight: "800" },
  live: { color: C.green, fontSize: 11, fontWeight: "900" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: C.blueSoft, borderWidth: 1, borderColor: C.blue, alignItems: "center", justifyContent: "center" },
  chipText: { color: C.blue, fontWeight: "700", fontSize: 12 },
});
