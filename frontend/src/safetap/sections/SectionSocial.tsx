import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "../api";
import { C } from "../theme";
import { EmptyState, FactorRow, RiskBadge, SectionHeader } from "../ui";

const PLATFORMS = ["Instagram", "X / Twitter", "Facebook", "WhatsApp", "YouTube", "LinkedIn", "Other"];

export default function SectionSocial({ token }: { token: string }) {
  const [postUrl, setPostUrl] = useState("");
  const [postText, setPostText] = useState("");
  const [platform, setPlatform] = useState<string>("Instagram");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const scan = async () => {
    if (!postUrl.trim() && !postText.trim()) {
      setError("Paste a post URL or the post text.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await api<any>(
        "/scan/social",
        { method: "POST", body: JSON.stringify({ post_url: postUrl, post_text: postText, platform }) },
        token,
      );
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <SectionHeader icon="account-network-outline" title="Social Post Check" subtitle="Verify suspicious posts — links extracted, followed, and scored." />

      <View style={s.card}>
        <View style={s.chipRow}>
          {PLATFORMS.map((p) => (
            <Pressable key={p} onPress={() => setPlatform(p)} style={[s.chip, platform === p && s.chipActive]}>
              <Text style={[s.chipText, platform === p && { color: C.text }]}>{p}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          testID="social-url-input"
          value={postUrl}
          onChangeText={setPostUrl}
          autoCapitalize="none"
          placeholder="Paste the post URL"
          placeholderTextColor={C.muted}
          style={s.input}
        />
        <TextInput
          testID="social-text-input"
          value={postText}
          onChangeText={setPostText}
          multiline
          numberOfLines={4}
          placeholder="Or paste the post text/caption here…"
          placeholderTextColor={C.muted}
          style={[s.input, { minHeight: 100, textAlignVertical: "top", paddingTop: 12 }]}
        />

        <Pressable testID="scan-social-button" onPress={scan} disabled={loading} style={s.primary}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="magnify-scan" size={19} color="#fff" />
              <Text style={s.primaryText}>Verify post</Text>
            </>
          )}
        </Pressable>
        {error ? <Text style={s.err}>{error}</Text> : null}
      </View>

      {result ? (
        <View style={s.result}>
          <View style={s.resultTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>POST VERDICT</Text>
              <Text style={s.classification}>{result.case.classification}</Text>
              <Text style={s.muted}>
                {(result.case.urls_found?.length || 0)} link(s) extracted · {result.case.platform}
              </Text>
            </View>
            <RiskBadge score={result.case.risk_score} />
          </View>

          {result.case.factors?.map((f: any, i: number) => (
            <FactorRow key={i} label={f.label} impact={f.impact} detail={f.detail} />
          ))}

          {result.findings?.length ? (
            <View style={{ marginTop: 14 }}>
              <Text style={s.subhead}>Extracted links</Text>
              {result.findings.map((f: any, i: number) => (
                <View key={i} style={s.linkRow}>
                  <MaterialCommunityIcons name="link-variant" size={16} color={C.blue} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.linkDomain}>{f.domain}</Text>
                    <Text style={s.muted}>{f.classification} · risk {f.risk_score}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <EmptyState icon="account-network-outline" title="No post checked" hint="Paste a link or caption to catch impersonation & scam bait." />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 11, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: C.amberSoft, borderColor: C.amber },
  chipText: { color: C.muted, fontWeight: "700", fontSize: 12 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: C.text,
    marginTop: 12,
    fontSize: 14,
  },
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
  classification: { color: C.text, fontSize: 17, fontWeight: "800", marginTop: 4, textTransform: "capitalize" },
  muted: { color: C.muted, fontSize: 12, marginTop: 4 },
  subhead: { color: C.text, fontWeight: "800", marginBottom: 8 },
  linkRow: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderColor: C.line },
  linkDomain: { color: C.text, fontWeight: "700" },
});
