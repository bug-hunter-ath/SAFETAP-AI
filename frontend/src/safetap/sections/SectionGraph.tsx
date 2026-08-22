import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle, Line, Text as SvgText } from "react-native-svg";
import { api } from "../api";
import { C } from "../theme";
import { EmptyState, SectionHeader } from "../ui";

type Node = { id: string; label: string; kind: string };
type Edge = { source: string; target: string; label: string };
type Graph = { nodes: Node[]; edges: Edge[]; case_count: number };

const KIND_COLOR: Record<string, string> = {
  case: C.amber,
  domain: C.blue,
  brand: C.violet,
  fingerprint: C.green,
};

const CANVAS_W = 340;
const CANVAS_H = 340;
const R_INNER = 40; // radius for case nodes cluster
const R_OUTER = 130; // radius for entity nodes

// ── Simple radial layout: cases in an inner ring, other entities in outer ring
function layoutNodes(nodes: Node[]): Record<string, { x: number; y: number }> {
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  const cases = nodes.filter((n) => n.kind === "case");
  const others = nodes.filter((n) => n.kind !== "case");

  const positions: Record<string, { x: number; y: number }> = {};
  cases.forEach((n, i) => {
    if (cases.length === 1) {
      positions[n.id] = { x: cx, y: cy };
    } else {
      const a = (2 * Math.PI * i) / cases.length - Math.PI / 2;
      positions[n.id] = { x: cx + R_INNER * Math.cos(a), y: cy + R_INNER * Math.sin(a) };
    }
  });
  others.forEach((n, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, others.length) - Math.PI / 2;
    positions[n.id] = { x: cx + R_OUTER * Math.cos(a), y: cy + R_OUTER * Math.sin(a) };
  });
  return positions;
}

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

  const positions = useMemo(() => (graph ? layoutNodes(graph.nodes) : {}), [graph]);

  const selectedEdges = selected && graph ? graph.edges.filter((e) => e.source === selected || e.target === selected) : [];
  const neighborIds = new Set<string>();
  selectedEdges.forEach((e) => {
    neighborIds.add(e.source);
    neighborIds.add(e.target);
  });

  const selectedNode = selected && graph ? graph.nodes.find((n) => n.id === selected) : null;

  return (
    <View>
      <SectionHeader icon="graph-outline" title="Threat Relationship Graph" subtitle="Interactive map of your cases — cases, domains, brands, fingerprints." />

      <View style={s.legendCard}>
        <View style={s.legend}>
          {Object.entries(KIND_COLOR).map(([k, c]) => (
            <View key={k} style={s.legendRow}>
              <View style={[s.dot, { backgroundColor: c }]} />
              <Text style={s.legendText}>{k}</Text>
            </View>
          ))}
        </View>
        <Pressable testID="refresh-graph" onPress={load} style={s.refresh}>
          <MaterialCommunityIcons name="refresh" size={16} color={C.text} />
          <Text style={s.refreshText}>{loading ? "Loading…" : "Refresh"}</Text>
        </Pressable>
        {error ? <Text style={s.err}>{error}</Text> : null}
      </View>

      {loading && !graph ? (
        <View style={s.center}>
          <ActivityIndicator color={C.amber} />
        </View>
      ) : !graph || graph.nodes.length === 0 ? (
        <EmptyState icon="graph-outline" title="Graph is empty" hint="Run a URL, screenshot, or social scan to build the correlation graph." />
      ) : (
        <>
          <Text style={s.stat}>
            {graph.nodes.length} nodes · {graph.edges.length} edges · {graph.case_count} cases
          </Text>

          <View style={s.canvasWrap}>
            <Svg width={CANVAS_W} height={CANVAS_H}>
              {/* Edges */}
              {graph.edges.map((e, i) => {
                const s0 = positions[e.source];
                const s1 = positions[e.target];
                if (!s0 || !s1) return null;
                const highlight = selected && (e.source === selected || e.target === selected);
                return (
                  <Line
                    key={`e-${i}`}
                    x1={s0.x}
                    y1={s0.y}
                    x2={s1.x}
                    y2={s1.y}
                    stroke={highlight ? C.amber : C.line}
                    strokeWidth={highlight ? 2 : 1}
                    opacity={selected && !highlight ? 0.15 : 0.9}
                  />
                );
              })}
              {/* Nodes */}
              {graph.nodes.map((n) => {
                const p = positions[n.id];
                if (!p) return null;
                const isSel = selected === n.id;
                const inNeigh = selected && neighborIds.has(n.id);
                const dim = selected && !inNeigh;
                const color = KIND_COLOR[n.kind] || C.line;
                return (
                  <Circle
                    key={`n-${n.id}`}
                    cx={p.x}
                    cy={p.y}
                    r={isSel ? 12 : n.kind === "case" ? 9 : 7}
                    fill={color}
                    opacity={dim ? 0.25 : 1}
                    onPress={() => setSelected(isSel ? null : n.id)}
                  />
                );
              })}
              {/* Labels */}
              {graph.nodes.map((n) => {
                const p = positions[n.id];
                if (!p) return null;
                const dim = selected && !neighborIds.has(n.id);
                const label = n.label.length > 16 ? n.label.slice(0, 15) + "…" : n.label;
                return (
                  <SvgText
                    key={`t-${n.id}`}
                    x={p.x}
                    y={p.y + 18}
                    fill={C.text}
                    fontSize="9"
                    fontWeight="600"
                    textAnchor="middle"
                    opacity={dim ? 0.35 : 0.9}
                  >
                    {label}
                  </SvgText>
                );
              })}
            </Svg>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow} style={{ marginTop: 6 }}>
            {graph.nodes.map((n) => {
              const isSel = selected === n.id;
              return (
                <Pressable
                  key={n.id}
                  testID={`graph-node-${n.id}`}
                  onPress={() => setSelected(isSel ? null : n.id)}
                  style={[s.chip, { borderColor: KIND_COLOR[n.kind] || C.line }, isSel && { backgroundColor: KIND_COLOR[n.kind] || C.line }]}
                >
                  <View style={[s.dot, { backgroundColor: KIND_COLOR[n.kind] || C.line, marginRight: 6 }]} />
                  <Text style={[s.chipText, isSel && { color: "#0B0D11" }]} numberOfLines={1}>
                    {n.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedNode ? (
            <View style={s.detailCard}>
              <View style={s.detailHeader}>
                <View style={[s.dotBig, { backgroundColor: KIND_COLOR[selectedNode.kind] || C.line }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.detailTitle}>{selectedNode.label}</Text>
                  <Text style={s.muted}>{selectedNode.kind.toUpperCase()}</Text>
                </View>
                <Pressable onPress={() => setSelected(null)} style={s.closeBtn}>
                  <MaterialCommunityIcons name="close" size={16} color={C.text} />
                </Pressable>
              </View>
              <Text style={s.subhead}>{selectedEdges.length} connection{selectedEdges.length === 1 ? "" : "s"}</Text>
              {selectedEdges.map((e, i) => {
                const otherId = e.source === selected ? e.target : e.source;
                const other = graph.nodes.find((nn) => nn.id === otherId);
                return (
                  <View key={i} style={s.edgeRow}>
                    <MaterialCommunityIcons name="arrow-right" size={14} color={C.amber} />
                    <Text style={s.edgeText}>
                      {other?.label || otherId} <Text style={s.edgeLabel}>({e.label})</Text>
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          <Text style={s.note}>Relationships are correlations, not proof of identity. Tap any node to focus its edges.</Text>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  legendCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 12 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { color: C.muted, fontSize: 12, textTransform: "uppercase", fontWeight: "700" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotBig: { width: 14, height: 14, borderRadius: 7 },
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
  canvasWrap: {
    width: CANVAS_W,
    height: CANVAS_H,
    alignSelf: "center",
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
  },
  chipRow: { gap: 8, paddingVertical: 6, paddingRight: 24 },
  chip: {
    flexShrink: 0,
    paddingHorizontal: 11,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: C.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    maxWidth: 220,
  },
  chipText: { color: C.text, fontWeight: "700", fontSize: 12 },
  detailCard: { marginTop: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  detailTitle: { color: C.text, fontWeight: "800", fontSize: 15 },
  muted: { color: C.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  subhead: { color: C.amber, fontWeight: "800", marginBottom: 6, fontSize: 11, letterSpacing: 1 },
  edgeRow: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 6 },
  edgeText: { color: C.text, fontSize: 13, flex: 1 },
  edgeLabel: { color: C.muted, fontSize: 11 },
  note: { color: C.mutedSoft, fontSize: 11, marginTop: 14, lineHeight: 16 },
});
