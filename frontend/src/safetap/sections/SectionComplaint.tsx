import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { C } from "../theme";
import { SectionHeader } from "../ui";

const CYBERCRIME_URL = "https://cybercrime.gov.in/Webform/Accept.aspx";
const HELPLINE = "1930";

export default function SectionComplaint() {
  const openPortal = () => Linking.openURL(CYBERCRIME_URL).catch(() => {});
  const callHelpline = () => Linking.openURL(`tel:${HELPLINE}`).catch(() => {});

  return (
    <View>
      <SectionHeader icon="lifebuoy" title="Report a Cybercrime" subtitle="Official Government of India helplines. If in doubt, act fast." />

      <View style={s.card}>
        <Pressable testID="call-1930" onPress={callHelpline} style={s.rowLive}>
          <View style={[s.iconWrap, { backgroundColor: C.redSoft, borderColor: C.red }]}>
            <MaterialCommunityIcons name="phone-in-talk" size={22} color={C.red} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>TOLL-FREE HELPLINE</Text>
            <Text style={s.big}>1930</Text>
            <Text style={s.muted}>National Cyber Crime Reporting · Tap to call</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={C.muted} />
        </Pressable>

        <View style={s.divider} />

        <Pressable testID="open-cybercrime-portal" onPress={openPortal} style={s.rowLive}>
          <View style={[s.iconWrap, { backgroundColor: C.blueSoft, borderColor: C.blue }]}>
            <MaterialCommunityIcons name="web" size={22} color={C.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>OFFICIAL PORTAL</Text>
            <Text style={s.link}>cybercrime.gov.in</Text>
            <Text style={s.muted}>File a written complaint · Attach evidence</Text>
          </View>
          <MaterialCommunityIcons name="open-in-new" size={20} color={C.muted} />
        </Pressable>
      </View>

      <View style={s.tips}>
        <Text style={s.tipTitle}>What to include</Text>
        <Tip icon="link-variant" text="Suspicious URLs, screenshots, and post links" />
        <Tip icon="bank-outline" text="Transaction IDs, amount, and bank/UPI details" />
        <Tip icon="clock-outline" text="Date, time, and how you were contacted" />
        <Tip icon="download-outline" text="Download evidence JSON from “My Reports” to attach" />
      </View>
    </View>
  );
}

function Tip({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  return (
    <View style={s.tip}>
      <MaterialCommunityIcons name={icon} size={17} color={C.amber} />
      <Text style={s.tipText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16 },
  rowLive: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: C.amber, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  big: { color: C.text, fontSize: 26, fontWeight: "900", marginTop: 2 },
  link: { color: C.blue, fontSize: 17, fontWeight: "800", marginTop: 4 },
  muted: { color: C.muted, fontSize: 12, marginTop: 4 },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 8 },
  tips: { marginTop: 14, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, gap: 10 },
  tipTitle: { color: C.text, fontWeight: "800", marginBottom: 4 },
  tip: { flexDirection: "row", gap: 10, alignItems: "center" },
  tipText: { color: C.text, fontSize: 13, flex: 1 },
});
