import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "../api";
import { C } from "../theme";
import { EmptyState, SectionHeader } from "../ui";

type Graph = { nodes: { id: string; label: string; kind: string }[]; edges: { source: string; target: string; label: string }[]; case_count: number };

const KIND_COLOR: Record<string, string> = {
  case: C.amber,
  domain: C.blue,
  brand: C.violet,
  fingerprint: C.green,
};

export default function SectionGraph({ token }: { token: string }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<Graph>("/graph", undefined, token);
      setGraph(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedEdges = selected ? graph?.edges.filter((e) => e.source === selected || e.target === selected) || [] : [];
  const neighbors = new Set<string>();
  selectedEdges.forEach((e) => {
    neighbors.add(e.source);
    neighbors.add(e.target);
  });

  return (
    <View>
      <SectionHeader icon="graph-outline" title="Threat Relationship Graph" subtitle="Correlations across your cases — domains, brands, fingerprints, links." />

      <View style={s.card}>
        <View style={s.legend}>
          {Object.entries(KIND_COLOR).map(([k, c]) => (
            <View key={k} style={s.legendRow}>
              <View style={[s.dot, { backgroundColor: c }]} />
              <Text style={s.legendText}>{k}</Text>
            </View>
          ))}
        </View>
        <Pressable onPress={load} style={s.refresh}>
          <MaterialCommunityIcons name="refresh" size={16} color={C.text} />
          <Text style={s.refreshText}>{loading ? "Loading…" : "Refresh graph"}</Text>
        </Pressable>
        {error ? <Text style={s.err}>{error}</Text> : null}
      </View>

      {loading && !graph ? (
        <View style={s.center}>
          <ActivityIndicator color={C.amber} />
        </View>
      ) : !graph || graph.nodes.length === 0 ? (
        <EmptyState icon="graph-outline" title="Graph empty" hint="Run URL, screenshot, or social scans to build correlations." />
      ) : (
        <>
          <Text style={s.stat}>
            {graph.nodes.length} nodes · {graph.edges.length} edges · {graph.case_count} cases
          </Text>
          <View style={s.nodeGrid}>
            {graph.nodes.map((n) => {
              const isSel = selected === n.id;
              const inNeigh = selected && neighbors.has(n.id);
              return (
                <Pressable
                  key={n.id}
                  testID={`graph-node-${n.id}`}
                  onPress={() => setSelected(isSel ? null : n.id)}
                  style={[
                    s.node,
                    { borderColor: KIND_COLOR[n.kind] || C.line },
                    isSel && { backgroundColor: KIND_COLOR[n.kind] || C.line },
                    !isSel && selected && !inNeigh && { opacity: 0.35 },
                  ]}
                >
                  <View style={[s.dot, { backgroundColor: KIND_COLOR[n.kind] || C.line, marginRight: 6 }]} />
                  <Text style={[s.nodeText, isSel && { color: "#0B0D11" }]} numberOfLines={1}>
                    {n.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selected && selectedEdges.length ? (
            <View style={s.detailCard}>
              <Text style={s.detailTitle}>Connections</Text>
              {selectedEdges.map((e, i) => (
                <View key={i} style={s.edgeRow}>
                  <MaterialCommunityIcons name="arrow-right" size={14} color={C.amber} />
                  <Text style={s.edgeText}>
                    {e.source === selected ? "→ " : "← "}
                    {(e.source === selected ? e.target : e.source)} <Text style={s.edgeLabel}>({e.label})</Text>
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={s.note}>
            Relationships are correlations, not proof of identity. Tap a node to reveal its edges.
          </Text>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 12 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { color: C.muted, fontSize: 12, textTransform: "uppercase", fontWeight: "700" },
  dot: { width: 10, height: 10, borderRadius: 5 },
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
  err: { color: C.red, marginTop: 10, fontSize: 13 },
  center: { padding: 30, alignItems: "center" },
  stat: { color: C.muted, marginTop: 14, marginBottom: 8, fontSize: 12, fontWeight: "700" },
  nodeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  node: {
    paddingHorizontal: 11,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: C.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    maxWidth: "100%",
  },
  nodeText: { color: C.text, fontWeight: "700", fontSize: 12 },
  detailCard: { marginTop: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14 },
  detailTitle: { color: C.text, fontWeight: "800", marginBottom: 8 },
  edgeRow: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 6 },
  edgeText: { color: C.text, fontSize: 13, flex: 1 },
  edgeLabel: { color: C.muted, fontSize: 11 },
  note: { color: C.mutedSoft, fontSize: 11, marginTop: 14, lineHeight: 16 },
});
