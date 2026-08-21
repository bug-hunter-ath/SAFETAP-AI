import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "../api";
import { C } from "../theme";
import { EmptyState, FactorRow, RiskBadge, SectionHeader } from "../ui";

export default function SectionUrlScan({ token }: { token: string }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const scan = async () => {
    if (!url.trim()) {
      setError("Paste the link you want SafeTap to check.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await api<any>("/scan", { method: "POST", body: JSON.stringify({ url, scan_type: "url" }) }, token);
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const danger = result?.risk_score >= 55;

  return (
    <View>
      <SectionHeader icon="link-variant" title="URL Scan" subtitle="Paste a link — get a scored, explainable verdict." />
      <View style={s.card}>
        <TextInput
          testID="scan-url-input"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          placeholder="paste-url-here.com"
          placeholderTextColor={C.muted}
          style={s.input}
        />
        <Pressable testID="scan-button" onPress={scan} disabled={loading} style={s.primary}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="shield-search" size={19} color="#fff" />
              <Text style={s.primaryText}>Scan URL</Text>
            </>
          )}
        </Pressable>
        {error ? <Text style={s.err}>{error}</Text> : null}
      </View>

      {result ? (
        <View testID="scan-result" style={s.result}>
          <View style={s.resultTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>ANALYSIS COMPLETE</Text>
              <Text style={s.domain}>{result.domain}</Text>
              <Text style={s.classification}>{result.classification}</Text>
            </View>
            <RiskBadge score={result.risk_score} />
          </View>

          <View style={[s.feed, { backgroundColor: result.threat_feed.matched ? C.redSoft : C.amberSoft }]}>
            <MaterialCommunityIcons
              name={result.threat_feed.matched ? "alert-octagon-outline" : "information-outline"}
              size={18}
              color={result.threat_feed.matched ? C.red : C.amber}
            />
            <Text style={{ color: result.threat_feed.matched ? C.red : C.amber, fontWeight: "700", flex: 1 }}>
              {result.threat_feed.matched ? "Recently Reported Threat" : "No current-feed match"}
            </Text>
          </View>

          {result.factors?.map((f: any) => (
            <FactorRow key={f.label} label={f.label} impact={f.impact} detail={f.detail} />
          ))}

          {result.ai_explanation ? (
            <View style={s.aiBox}>
              <Text style={s.aiLabel}>AI EXPLANATION</Text>
              <Text style={s.aiText}>{result.ai_explanation}</Text>
            </View>
          ) : null}

          <View style={[s.action, { backgroundColor: danger ? C.redSoft : C.greenSoft }]}>
            <MaterialCommunityIcons
              name={danger ? "hand-back-left-outline" : "check-circle-outline"}
              size={20}
              color={danger ? C.red : C.green}
            />
            <Text style={{ color: danger ? C.red : C.green, flex: 1, fontWeight: "700" }}>
              {danger ? "Do not visit. Do not enter credentials." : "Looks lower risk — still verify sender and domain."}
            </Text>
          </View>
        </View>
      ) : (
        <EmptyState icon="link-variant" title="Nothing scanned yet" hint="SafeTap combines live threat intelligence with independent URL signals." />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16 },
  input: { height: 50, color: C.text, borderBottomWidth: 1, borderColor: C.line, fontSize: 16 },
  primary: {
    backgroundColor: C.amber,
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  primaryText: { color: "#fff", fontWeight: "800" },
  err: { color: C.red, marginTop: 10, fontSize: 13 },
  result: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 18, marginTop: 14 },
  resultTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  eyebrow: { color: C.amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  domain: { color: C.text, fontSize: 18, fontWeight: "800", marginTop: 4 },
  classification: { color: C.muted, fontSize: 13, marginTop: 2, textTransform: "capitalize" },
  feed: { padding: 11, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  aiBox: { marginTop: 16, padding: 12, borderRadius: 10, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.line },
  aiLabel: { color: C.blue, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  aiText: { color: C.text, marginTop: 6, fontSize: 13, lineHeight: 19 },
  action: { flexDirection: "row", gap: 10, alignItems: "center", padding: 12, borderRadius: 10, marginTop: 14 },
});
