import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "../api";
import { C } from "../theme";
import { EmptyState, FactorRow, RiskBadge, SectionHeader } from "../ui";

async function toBase64FromDataUrl(dataUrl: string): Promise<string> {
  // Accept both raw data URL and https URL (fetch → base64)
  if (dataUrl.startsWith("data:")) return dataUrl.split(",")[1] || "";
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      resolve(r.split(",")[1] || "");
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

export default function SectionScreenshot({ token }: { token: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [imageB64, setImageB64] = useState<string>("");
  const [pasteUrl, setPasteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"" | "gallery" | "url" | "scan">("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const pickFromGallery = async () => {
    setError("");
    setBusy("gallery");
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError("Photo library permission was declined. Enable it in Settings to upload screenshots.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setPreview(a.uri);
      setImageB64(a.base64 || "");
    } finally {
      setBusy("");
    }
  };

  const loadFromUrl = async () => {
    if (!pasteUrl.trim()) {
      setError("Paste an image URL or data URL first.");
      return;
    }
    setError("");
    setBusy("url");
    try {
      const b64 = await toBase64FromDataUrl(pasteUrl.trim());
      if (!b64) throw new Error("Could not read image data");
      setPreview(pasteUrl.trim());
      setImageB64(b64);
    } catch (e: any) {
      setError(e.message || "Could not fetch image");
    } finally {
      setBusy("");
    }
  };

  const scan = async () => {
    if (!imageB64) {
      setError("Add a screenshot first.");
      return;
    }
    setError("");
    setBusy("scan");
    setLoading(true);
    try {
      const data = await api<any>(
        "/scan/screenshot",
        { method: "POST", body: JSON.stringify({ image_base64: imageB64, filename: "victim-upload.png" }) },
        token,
      );
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setBusy("");
    }
  };

  return (
    <View>
      <SectionHeader icon="image-search-outline" title="Screenshot & OCR" subtitle="Upload from gallery or paste an image / data URL. Vision + OCR + clone hints." />

      <View style={s.card}>
        <View style={s.row}>
          <Pressable testID="pick-gallery" onPress={pickFromGallery} disabled={!!busy} style={[s.btn, { flex: 1 }]}>
            {busy === "gallery" ? <ActivityIndicator color={C.text} /> : <MaterialCommunityIcons name="image-multiple-outline" size={18} color={C.text} />}
            <Text style={s.btnText}>Gallery</Text>
          </Pressable>
          <Pressable testID="load-url" onPress={loadFromUrl} disabled={!!busy || !pasteUrl.trim()} style={[s.btn, { flex: 1 }]}>
            {busy === "url" ? <ActivityIndicator color={C.text} /> : <MaterialCommunityIcons name="link" size={18} color={C.text} />}
            <Text style={s.btnText}>Load URL</Text>
          </Pressable>
        </View>
        <TextInput
          testID="paste-url-input"
          value={pasteUrl}
          onChangeText={setPasteUrl}
          autoCapitalize="none"
          placeholder="paste image URL or data:image/…"
          placeholderTextColor={C.muted}
          style={s.input}
        />

        {preview ? (
          <View style={s.previewWrap}>
            <Image source={{ uri: preview.startsWith("data:") ? preview : preview }} style={s.preview} />
          </View>
        ) : null}

        <Pressable testID="scan-screenshot-button" onPress={scan} disabled={!imageB64 || loading} style={[s.primary, (!imageB64 || loading) && { opacity: 0.6 }]}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="shield-search" size={19} color="#fff" />
              <Text style={s.primaryText}>Analyse screenshot</Text>
            </>
          )}
        </Pressable>
        {error ? <Text style={s.err}>{error}</Text> : null}
      </View>

      {result ? (
        <View style={s.result}>
          <View style={s.resultTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>SCREENSHOT ANALYSIS</Text>
              <Text style={s.classification}>{result.case.classification}</Text>
              {result.reupload ? <Text style={s.reupload}>⚠ Re-upload detected</Text> : null}
            </View>
            <RiskBadge score={result.case.risk_score} />
          </View>

          {result.case.detected_brands?.length ? (
            <View style={s.chipRow}>
              {result.case.detected_brands.slice(0, 5).map((b: any, i: number) => (
                <View key={i} style={s.chip}>
                  <Text style={s.chipText}>{b.name || String(b)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {result.case.ocr_text ? (
            <View style={s.ocrBox}>
              <Text style={s.ocrLabel}>OCR EXTRACT</Text>
              <Text style={s.ocrText}>{result.case.ocr_text.slice(0, 400)}</Text>
            </View>
          ) : null}

          {result.case.factors?.map((f: any, i: number) => (
            <FactorRow key={i} label={f.label} impact={f.impact} detail={f.detail} />
          ))}

          {result.case.ai_explanation ? (
            <View style={s.aiBox}>
              <Text style={s.aiLabel}>AI NOTES</Text>
              <Text style={s.aiText}>{result.case.ai_explanation}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <EmptyState icon="camera-outline" title="No screenshot yet" hint="Add a screenshot to run OCR + brand look-alike detection." />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16 },
  row: { flexDirection: "row", gap: 10 },
  btn: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
  },
  btnText: { color: C.text, fontWeight: "700" },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: C.text,
    marginTop: 12,
    fontSize: 13,
  },
  previewWrap: { marginTop: 14, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: C.line },
  preview: { width: "100%", height: 200, backgroundColor: "#000", resizeMode: "contain" },
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
  reupload: { color: C.red, marginTop: 6, fontWeight: "700", fontSize: 13 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  chip: { paddingHorizontal: 11, height: 30, borderRadius: 15, backgroundColor: C.violetSoft, borderWidth: 1, borderColor: C.violet, alignItems: "center", justifyContent: "center" },
  chipText: { color: C.violet, fontWeight: "700", fontSize: 12 },
  ocrBox: { marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.line },
  ocrLabel: { color: C.green, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  ocrText: { color: C.text, marginTop: 6, fontSize: 12, lineHeight: 18 },
  aiBox: { marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.line },
  aiLabel: { color: C.blue, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  aiText: { color: C.text, marginTop: 6, fontSize: 13, lineHeight: 19 },
});
