import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import type { Role } from "./theme";
import { C } from "./theme";

const roles: { key: Role; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; detail: string }[] = [
  { key: "victim", label: "Victim / User", icon: "shield-check-outline", detail: "Scan a suspicious link and get clear next steps." },
  { key: "investigator", label: "Investigator", icon: "magnify-scan", detail: "Review cases, evidence, scores, and threat links." },
  { key: "admin", label: "Admin", icon: "view-dashboard-outline", detail: "Manage platform sources, users, and analytics." },
];

type Props = {
  role: Role;
  setRole: (r: Role) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  loading: boolean;
  login: () => void;
};

export default function LoginScreen(p: Props) {
  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <KeyboardAwareScrollView contentContainerStyle={s.container} bottomOffset={24}>
        <View style={s.brandMark}>
          <MaterialCommunityIcons name="shield-lock-outline" size={34} color={C.amber} />
        </View>
        <Text style={s.eyebrow}>SAFETAP AI</Text>
        <Text style={s.hero}>Detect. Verify.{"\n"}Protect.</Text>
        <Text style={s.muted}>
          A focused security desk for suspicious links, brand impersonation, screenshots, social posts, and phishing threats.
        </Text>

        <Text style={s.section}>Choose your workspace</Text>
        <View style={s.roleRow}>
          {roles.map((r) => (
            <Pressable
              testID={`role-${r.key}`}
              key={r.key}
              onPress={() => {
                p.setRole(r.key);
                p.setEmail(`${r.key}@safetap.demo`);
              }}
              style={[s.role, p.role === r.key && s.roleActive]}
            >
              <MaterialCommunityIcons name={r.icon} size={23} color={p.role === r.key ? C.amber : C.muted} />
              <Text style={[s.roleText, p.role === r.key && { color: C.text }]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>{roles.find((r) => r.key === p.role)?.detail}</Text>
          <TextInput
            testID="email-input"
            value={p.email}
            onChangeText={p.setEmail}
            autoCapitalize="none"
            placeholder="Email"
            placeholderTextColor={C.muted}
            style={s.input}
          />
          <TextInput
            testID="password-input"
            value={p.password}
            onChangeText={p.setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={C.muted}
            style={s.input}
          />
          <Pressable
            testID="login-button"
            onPress={p.login}
            disabled={p.loading}
            style={({ pressed }) => [s.primary, pressed && { opacity: 0.75 }]}
          >
            {p.loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={s.primaryText}>Enter secure workspace</Text>
                <MaterialCommunityIcons name="arrow-right" size={19} color="#fff" />
              </>
            )}
          </Pressable>
          <Text style={s.demo}>Demo access · SafeTap123!</Text>
        </View>
        <Text style={s.footer}>
          Access is role-restricted. Victim accounts cannot view investigation or admin data.
        </Text>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: { padding: 24, paddingBottom: 60 },
  brandMark: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: C.amberSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  eyebrow: { color: C.amber, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  hero: { color: C.text, fontSize: 38, lineHeight: 42, fontWeight: "800", marginTop: 10 },
  muted: { color: C.muted, fontSize: 14, lineHeight: 20, marginTop: 12 },
  section: { color: C.text, fontSize: 17, fontWeight: "800", marginTop: 30, marginBottom: 13 },
  roleRow: { gap: 8 },
  role: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  roleActive: { borderColor: C.amber, backgroundColor: C.amberSoft },
  roleText: { color: C.muted, fontWeight: "700" },
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 18,
    marginTop: 14,
  },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: "700", lineHeight: 22 },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    color: C.text,
    marginTop: 12,
  },
  primary: {
    backgroundColor: C.amber,
    minHeight: 50,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 18,
  },
  primaryText: { color: "#fff", fontWeight: "800" },
  demo: { color: C.muted, textAlign: "center", fontSize: 12, marginTop: 13 },
  footer: { color: C.muted, textAlign: "center", fontSize: 12, marginTop: 26, lineHeight: 18 },
});
