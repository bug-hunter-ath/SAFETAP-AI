import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api } from "../api";
import { C } from "../theme";
import { EmptyState, SectionHeader } from "../ui";

function fmt(d: string): string {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

export default function SectionReports({ token }: { token: string }) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<any>("/reports/mine", undefined, token);
      setReports(data.reports || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const download = async (caseId: string) => {
    setBusy(caseId);
    setStatus("");
    try {
      const evidence = await api<any>(`/reports/${caseId}`, undefined, token);
      const json = JSON.stringify(evidence, null, 2);

      if (Platform.OS === "web") {
        // Web: trigger a browser download
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `safetap-${caseId}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setStatus("Report downloaded.");
      } else {
        const path = `${FileSystem.cacheDirectory}safetap-${caseId}.json`;
        await FileSystem.writeAsStringAsync(path, json);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "SafeTap evidence report" });
          setStatus("Shared evidence JSON.");
        } else {
          setStatus(`Saved to ${path}`);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <View>
      <SectionHeader icon="file-download-outline" title="My Reports" subtitle="Every scan you run is saved — download evidence JSON any time." />

      <View style={s.card}>
        <Pressable testID="refresh-reports" onPress={refresh} style={s.refresh}>
          <MaterialCommunityIcons name="refresh" size={16} color={C.text} />
          <Text style={s.refreshText}>{loading ? "Loading…" : "Refresh"}</Text>
        </Pressable>
        {status ? <Text style={s.ok}>{status}</Text> : null}
        {error ? <Text style={s.err}>{error}</Text> : null}
      </View>

      {loading && !reports.length ? (
        <View style={s.center}>
          <ActivityIndicator color={C.amber} />
        </View>
      ) : reports.length === 0 ? (
        <EmptyState icon="folder-open-outline" title="No reports yet" hint="Run a URL, screenshot, or social post scan to build your evidence history." />
      ) : (
        reports.map((r) => (
          <View key={r.id} testID={`report-${r.id}`} style={s.item}>
            <View style={{ flex: 1 }}>
              <View style={s.rowTop}>
                <MaterialCommunityIcons name={r.type === "screenshot" ? "image-outline" : r.type === "social" ? "account-network-outline" : "link-variant"} size={18} color={C.amber} />
                <Text style={s.itemTitle}>{r.domain || r.filename || r.platform || r.type}</Text>
              </View>
              <Text style={s.muted}>{r.classification} · risk {r.risk_score}</Text>
              <Text style={s.date}>{fmt(r.created_at)}</Text>
            </View>
            <Pressable testID={`download-${r.id}`} onPress={() => download(r.id)} disabled={busy === r.id} style={s.dlBtn}>
              {busy === r.id ? <ActivityIndicator color={C.text} /> : <MaterialCommunityIcons name="download" size={18} color={C.text} />}
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16 },
  refresh: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  refreshText: { color: C.text, fontWeight: "700" },
  ok: { color: C.green, marginTop: 10, fontSize: 13 },
  err: { color: C.red, marginTop: 10, fontSize: 13 },
  center: { padding: 30, alignItems: "center" },
  item: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowTop: { flexDirection: "row", gap: 8, alignItems: "center" },
  itemTitle: { color: C.text, fontWeight: "800", fontSize: 15 },
  muted: { color: C.muted, fontSize: 12, marginTop: 4, textTransform: "capitalize" },
  date: { color: C.mutedSoft, fontSize: 11, marginTop: 4 },
  dlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
});
