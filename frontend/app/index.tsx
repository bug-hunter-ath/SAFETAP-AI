import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/safetap/api";
import AdminDashboard from "@/src/safetap/AdminDashboard";
import InvestigatorDashboard from "@/src/safetap/InvestigatorDashboard";
import LoginScreen from "@/src/safetap/LoginScreen";
import VictimSections from "@/src/safetap/sections/VictimSections";
import { C, type Role } from "@/src/safetap/theme";

type SafeTapUser = { email: string; role: Role; name: string };

export default function Index() {
  const [role, setRole] = useState<Role>("victim");
  const [email, setEmail] = useState("victim@safetap.demo");
  const [password, setPassword] = useState("SafeTap123!");
  const [user, setUser] = useState<SafeTapUser | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = async () => {
    setError("");
    setLoading(true);
    try {
      const data = await api<{ token: string; user: SafeTapUser }>(
        "/auth/login",
        { method: "POST", body: JSON.stringify({ email, password, role }) },
      );
      setUser(data.user);
      setToken(data.token);
    } catch (e: any) {
      setError(e.message);
      // Surface error via login screen (kept simple — Login re-renders on next login)
      alert(`Access denied: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <LoginScreen
        role={role}
        setRole={setRole}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        loading={loading}
        login={login}
      />
    );
  }

  const heroTitle =
    user.role === "victim" ? "Stay one step ahead." : user.role === "investigator" ? "Threat command center." : "Platform control.";

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.top}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>SAFETAP AI · {user.role.toUpperCase()}</Text>
            <Text style={s.title}>{heroTitle}</Text>
            <Text style={s.who}>{user.name} · {user.email}</Text>
          </View>
          <Pressable
            testID="logout-button"
            onPress={() => {
              setUser(null);
              setToken("");
            }}
            style={s.iconBtn}
          >
            <MaterialCommunityIcons name="logout" size={21} color={C.muted} />
          </Pressable>
        </View>

        {user.role === "victim" ? (
          <VictimSections token={token} />
        ) : user.role === "investigator" ? (
          <InvestigatorDashboard token={token} />
        ) : (
          <AdminDashboard token={token} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 24, paddingBottom: 60 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  eyebrow: { color: C.amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: C.text, fontSize: 26, fontWeight: "800", marginTop: 6, lineHeight: 32 },
  who: { color: C.muted, fontSize: 12, marginTop: 6 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
});
