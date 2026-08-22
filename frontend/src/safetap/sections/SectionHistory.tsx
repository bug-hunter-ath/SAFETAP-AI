import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "../api";
import { C } from "../theme";
import { EmptyState, FactorRow, SectionHeader } from "../ui";

type CaseRow = {
  id: string;
  type: "url" | "screenshot" | "social";
  domain?: string;
  filename?: string;
  platform?: string;
  post_url?: string;
  post_text?: string;
  url?: string;
  classification: string;
  risk_score: number;
  created_at: string;
  factors?: any[];
  threat_feed?: { matched?: boolean; source?: string; reported_at?: string };
  detected_brands?: any[];
  ocr_text?: string;
  ai_explanation?: string;
  urls_found?: string[];
};

const FILTERS: { key: "all" | "url" | "screenshot" | "social" | "high"; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: "all", label: "All", icon: "history" },
  { key: "url", label: "URLs", icon: "link-variant" },
  { key: "screenshot", label: "Screenshots", icon: "image-outline" },
  { key: "social", label: "Social", icon: "account-network-outline" },
  { key: "high", label: "High risk", icon: "alert-octagon-outline" },
];

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

function relative(d: string): string {
  try {
    const now = Date.now();
    const t = new Date(d).getTime();
    const diff = Math.max(0, now - t) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(d).toLocaleDateString();
  } catch {
    return "";
  }
}

function titleFor(c: CaseRow): string {
  if (c.type === "url") return c.domain || c.url || "URL scan";
  if (c.type === "screenshot") return c.filename || "Screenshot";
  return c.platform || "Social post";
}

function iconFor(t: CaseRow["type"]): keyof typeof MaterialCommunityIcons.glyphMap {
  if (t === "url") return "link-variant";
  if (t === "screenshot") return "image-outline";
  return "account-network-outline";
}

export default function SectionHistory({ token }: { token: string }) {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ reports: CaseRow[] }>("/reports/mine", undefined, token);
      setRows(data.reports || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "high") return rows.filter((r) => r.risk_score >= 55);
    return rows.filter((r) => r.type === filter);
  }, [rows, filter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const high = rows.filter((r) => r.risk_score >= 55).length;
    const flagged = rows.filter((r) => r.threat_feed?.matched).length;
    return { total, high, flagged };
  }, [rows]);

  return (
    <View>
      <SectionHeader icon="history" title="Scan History" subtitle="Every scan you have run — filter, browse, and expand for details." />

      <View style={s.summaryRow}>
        <View style={s.summaryCard}>
          <Text style={s.summaryNum}>{stats.total}</Text>
          <Text style={s.summaryLbl}>Total scans</Text>
        </View>
        <View style={[s.summaryCard, { borderColor: C.red }]}>
          <Text style={[s.summaryNum, { color: C.red }]}>{stats.high}</Text>
          <Text style={s.summaryLbl}>High risk</Text>
        </View>
        <View style={[s.summaryCard, { borderColor: C.amber }]}>
          <Text style={[s.summaryNum, { color: C.amber }]}>{stats.flagged}</Text>
          <Text style={s.summaryLbl}>Feed matches</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
        style={s.filterWrap}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            testID={`history-filter-${f.key}`}
            onPress={() => setFilter(f.key)}
            style={[s.filter, filter === f.key && s.filterActive]}
          >
            <MaterialCommunityIcons name={f.icon} size={14} color={filter === f.key ? C.amber : C.muted} />
            <Text style={[s.filterText, filter === f.key && { color: C.text }]}>{f.label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={load} style={[s.filter, { borderColor: C.line }]}>
          <MaterialCommunityIcons name="refresh" size={14} color={C.muted} />
          <Text style={s.filterText}>{loading ? "…" : "Refresh"}</Text>
        </Pressable>
      </ScrollView>

      {error ? <Text style={s.err}>{error}</Text> : null}

      {loading && rows.length === 0 ? (
        <View style={s.center}>
          <ActivityIndicator color={C.amber} />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="history"
          title={filter === "all" ? "No scans yet" : "No matching scans"}
          hint={filter === "all" ? "Run a URL, screenshot, or social post scan and it will show up here." : "Try a different filter."}
        />
      ) : (
        <View style={{ marginTop: 6 }}>
          {filtered.map((r, idx) => {
            const isOpen = expanded === r.id;
            const isLast = idx === filtered.length - 1;
            return (
              <View key={r.id} style={s.timelineItem}>
                {/* Rail */}
                <View style={s.rail}>
                  <View style={[s.railDot, { backgroundColor: r.risk_score >= 55 ? C.red : r.risk_score >= 30 ? C.amber : C.green }]} />
                  {!isLast ? <View style={s.railLine} /> : null}
                </View>
                {/* Body */}
                <Pressable
                  testID={`history-item-${r.id}`}
                  onPress={() => setExpanded(isOpen ? null : r.id)}
                  style={s.itemCard}
                >
                  <View style={s.rowTop}>
                    <MaterialCommunityIcons name={iconFor(r.type)} size={16} color={C.amber} />
                    <Text style={s.title} numberOfLines={1}>{titleFor(r)}</Text>
                    <RiskBadgeMini score={r.risk_score} />
                  </View>
                  <View style={s.metaRow}>
                    <Text style={s.metaClass}>{r.classification}</Text>
                    <Text style={s.metaSep}>·</Text>
                    <Text style={s.metaTime}>{relative(r.created_at)}</Text>
                    {r.threat_feed?.matched ? (
                      <View style={s.badgeFeed}>
                        <MaterialCommunityIcons name="alert-octagon-outline" size={11} color={C.red} />
                        <Text style={s.badgeFeedText}>reported</Text>
                      </View>
                    ) : null}
                  </View>

                  {isOpen ? (
                    <View style={s.expanded}>
                      <Text style={s.timestamp}>{fmtDate(r.created_at)}</Text>
                      {r.url ? <DetailRow label="URL" value={r.url} /> : null}
                      {r.post_url ? <DetailRow label="Post" value={r.post_url} /> : null}
                      {r.urls_found?.length ? <DetailRow label="Links found" value={r.urls_found.join(", ")} /> : null}
                      {r.post_text ? <DetailRow label="Text" value={r.post_text.slice(0, 220)} /> : null}
                      {r.ocr_text ? <DetailRow label="OCR" value={r.ocr_text.slice(0, 220)} /> : null}
                      {r.detected_brands?.length ? (
                        <DetailRow
                          label="Brands"
                          value={r.detected_brands.map((b: any) => b.name || String(b)).join(", ")}
                        />
                      ) : null}

                      {r.factors?.length ? (
                        <View style={{ marginTop: 8 }}>
                          <Text style={s.subhead}>Contributing factors</Text>
                          {r.factors.map((f, i) => (
                            <FactorRow key={i} label={f.label} impact={f.impact} detail={f.detail} />
                          ))}
                        </View>
                      ) : null}

                      {r.ai_explanation ? (
                        <View style={s.ai}>
                          <Text style={s.aiLabel}>AI EXPLANATION</Text>
                          <Text style={s.aiText}>{r.ai_explanation}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function RiskBadgeMini({ score }: { score: number }) {
  const danger = score >= 55;
  const warn = score >= 30;
  const color = danger ? C.red : warn ? C.amber : C.green;
  return (
    <View style={[sMini.wrap, { borderColor: color }]}>
      <Text style={[sMini.num, { color }]}>{score}</Text>
    </View>
  );
}

const sMini = StyleSheet.create({
  wrap: { minWidth: 34, height: 22, paddingHorizontal: 6, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  num: { fontSize: 12, fontWeight: "900" },
});

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  summaryCard: {
    flex: 1,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 12,
  },
  summaryNum: { color: C.text, fontSize: 22, fontWeight: "900" },
  summaryLbl: { color: C.muted, fontSize: 11, marginTop: 2, fontWeight: "700" },
  filterWrap: { marginHorizontal: -24 },
  filterRow: { gap: 8, paddingHorizontal: 24, paddingVertical: 4 },
  filter: {
    flexShrink: 0,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterActive: { backgroundColor: C.amberSoft, borderColor: C.amber },
  filterText: { color: C.muted, fontWeight: "700", fontSize: 12 },
  err: { color: C.red, marginTop: 10, fontSize: 13 },
  center: { padding: 30, alignItems: "center" },

  timelineItem: { flexDirection: "row", gap: 12 },
  rail: { width: 22, alignItems: "center" },
  railDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 18,
    borderWidth: 2,
    borderColor: C.bg,
  },
  railLine: { flex: 1, width: 2, backgroundColor: C.line, marginTop: 4, marginBottom: -6 },
  itemCard: {
    flex: 1,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: C.text, fontWeight: "800", fontSize: 14, flex: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6, flexWrap: "wrap" },
  metaClass: { color: C.muted, fontSize: 12, textTransform: "capitalize" },
  metaSep: { color: C.mutedSoft, fontSize: 12 },
  metaTime: { color: C.muted, fontSize: 12 },
  badgeFeed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(239,68,68,.15)",
    borderWidth: 1,
    borderColor: C.red,
  },
  badgeFeedText: { color: C.red, fontSize: 10, fontWeight: "800" },

  expanded: { marginTop: 12, borderTopWidth: 1, borderColor: C.line, paddingTop: 12 },
  timestamp: { color: C.mutedSoft, fontSize: 11, marginBottom: 8 },
  detailRow: { flexDirection: "row", marginTop: 6, gap: 8 },
  detailLabel: { color: C.muted, fontSize: 12, width: 74, fontWeight: "700" },
  detailValue: { color: C.text, fontSize: 12, flex: 1, lineHeight: 18 },
  subhead: { color: C.amber, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 2 },
  ai: { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.line },
  aiLabel: { color: C.blue, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  aiText: { color: C.text, marginTop: 6, fontSize: 12, lineHeight: 18 },
});
