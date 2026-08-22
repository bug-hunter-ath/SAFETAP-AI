import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { C } from "../theme";
import SectionUrlScan from "./SectionUrlScan";
import SectionScreenshot from "./SectionScreenshot";
import SectionSocial from "./SectionSocial";
import SectionReports from "./SectionReports";
import SectionVoice from "./SectionVoice";
import SectionGraph from "./SectionGraph";
import SectionHistory from "./SectionHistory";
import SectionComplaint from "./SectionComplaint";

type SectionKey = "url" | "screenshot" | "social" | "voice" | "graph" | "history" | "reports" | "complaint";

const SECTIONS: { key: SectionKey; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: "url", label: "URL", icon: "link-variant" },
  { key: "screenshot", label: "Screenshot", icon: "image-search-outline" },
  { key: "social", label: "Social", icon: "account-network-outline" },
  { key: "voice", label: "Voice AI", icon: "microphone-outline" },
  { key: "graph", label: "Graph", icon: "graph-outline" },
  { key: "history", label: "History", icon: "history" },
  { key: "reports", label: "Reports", icon: "file-pdf-box" },
  { key: "complaint", label: "Complaint", icon: "lifebuoy" },
];

export default function VictimSections({ token }: { token: string }) {
  const [active, setActive] = useState<SectionKey>("url");

  const body = useMemo(() => {
    switch (active) {
      case "url":
        return <SectionUrlScan token={token} />;
      case "screenshot":
        return <SectionScreenshot token={token} />;
      case "social":
        return <SectionSocial token={token} />;
      case "voice":
        return <SectionVoice token={token} />;
      case "graph":
        return <SectionGraph token={token} />;
      case "history":
        return <SectionHistory token={token} />;
      case "reports":
        return <SectionReports token={token} />;
      case "complaint":
        return <SectionComplaint />;
    }
  }, [active, token]);

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabRow}
        style={s.tabWrap}
      >
        {SECTIONS.map((sec) => (
          <Pressable
            key={sec.key}
            testID={`tab-${sec.key}`}
            onPress={() => setActive(sec.key)}
            style={[s.tab, active === sec.key && s.tabActive]}
          >
            <MaterialCommunityIcons name={sec.icon} size={16} color={active === sec.key ? C.amber : C.muted} />
            <Text style={[s.tabText, active === sec.key && { color: C.text }]}>{sec.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={{ marginTop: 20 }}>{body}</View>
    </View>
  );
}

const s = StyleSheet.create({
  tabWrap: { marginTop: 20, marginHorizontal: -24 },
  tabRow: { gap: 8, paddingHorizontal: 24, paddingVertical: 4 },
  tab: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabActive: { backgroundColor: C.amberSoft, borderColor: C.amber },
  tabText: { color: C.muted, fontWeight: "700", fontSize: 12 },
});
