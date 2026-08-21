import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "./api";
import { C } from "./theme";
import { SectionHeader } from "./ui";
import SectionGraph from "./sections/SectionGraph";

export default function InvestigatorDashboard({ token }: { token: string }) {
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setOverview(await api<any>("/investigator/overview", undefined, token));
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

  const m = overview?.metrics || {};
  const metrics = [
    { n: m.open_cases || 0, l: "Open cases" },
    { n: m.high_risk || 0, l: "High risk" },
    { n: m.feed_matches || 0, l: "Feed matches" },
    { n: m.screenshot_cases || 0, l: "Screenshots" },
    { n: m.social_cases || 0, l: "Social posts" },
    { n: m.brands_monitored || 0, l: "Brands" },
  ];

  return (
    <View>
      <SectionHeader icon="magnify-scan" title="Investigation Command Center" subtitle="Cases across all victims — evidence, scores, and correlations." />

      <View style={s.metrics}>
        {metrics.map((mm) => (
          <View key={mm.l} style={s.metric}>
            <Text style={s.metricNum}>{mm.n}</Text>
            <Text style={s.muted}>{mm.l}</Text>
          </View>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.eyebrow}>WORKFLOW</Text>
        <View style={s.flow}>
          {"SCAN · DETECT · VERIFY · CLASSIFY · SCORE · LINK · REPORT".split(" · ").map((step, i) => (
            <View key={i} style={s.step}>
              <View style={s.stepDot}>
                <MaterialCommunityIcons name="check" size={12} color={C.amber} />
              </View>
              <Text style={s.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ marginTop: 20 }}>
        <SectionGraph token={token} />
      </View>

      <View style={[s.card, { marginTop: 20 }]}>
        <Text style={s.eyebrow}>INTELLIGENCE STATUS</Text>
        <Text style={s.cardTitle}>{overview?.feed_status || "Adapter ready · fallback available"}</Text>
        <Text style={s.muted}>
          Historical Kaggle features remain separate from current OpenPhish / PhishTank signals. Dataset or feed presence
          is treated as one signal, never proof.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { padding: 40, alignItems: "center" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: {
    flexGrow: 1,
    minWidth: "30%",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 12,
  },
  metricNum: { color: C.text, fontSize: 22, fontWeight: "900" },
  muted: { color: C.muted, fontSize: 12, marginTop: 4, lineHeight: 18 },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16, marginTop: 16 },
  eyebrow: { color: C.amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: "800", marginTop: 6, marginBottom: 8 },
  flow: { marginTop: 12, gap: 10 },
  step: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.amberSoft,
    borderWidth: 1,
    borderColor: C.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { color: C.text, fontWeight: "700" },
});
