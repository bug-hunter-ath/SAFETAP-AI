import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { C } from "./theme";

export function RiskBadge({ score }: { score: number }) {
  const danger = score >= 55;
  const warn = score >= 30;
  const color = danger ? C.red : warn ? C.amber : C.green;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.num, { color }]}>{score}</Text>
      <Text style={styles.label}>RISK</Text>
    </View>
  );
}

export function FactorRow({ label, impact, detail }: { label: string; impact: number; detail: string }) {
  return (
    <View style={styles.factor}>
      <View style={styles.dot} />
      <View style={{ flex: 1 }}>
        <Text style={styles.factorLabel}>
          {label} <Text style={{ color: C.red }}>+{impact}</Text>
        </Text>
        <Text style={styles.factorDetail}>{detail}</Text>
      </View>
    </View>
  );
}

export function SectionHeader({ icon, title, subtitle }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name={icon} size={22} color={C.amber} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function EmptyState({ icon, title, hint }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; hint: string }) {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon} size={34} color={C.muted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  num: { fontSize: 20, fontWeight: "900" },
  label: { color: C.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  factor: { flexDirection: "row", gap: 10, marginTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red, marginTop: 6 },
  factorLabel: { color: C.text, fontWeight: "700" },
  factorDetail: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.amberSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: C.text, fontSize: 18, fontWeight: "800" },
  subtitle: { color: C.muted, fontSize: 13, marginTop: 2 },
  empty: {
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.line,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 24,
    marginTop: 12,
    gap: 8,
    backgroundColor: C.cardAlt,
  },
  emptyTitle: { color: C.text, fontWeight: "800", fontSize: 15 },
  emptyHint: { color: C.muted, fontSize: 13, textAlign: "center", lineHeight: 18 },
});
