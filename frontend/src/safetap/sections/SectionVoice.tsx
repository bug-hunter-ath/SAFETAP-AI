import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RecordingPresets, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "../api";
import { C } from "../theme";
import { SectionHeader } from "../ui";

type Lang = { code: string; name: string };

const DEFAULT_LANGS: Lang[] = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "bn", name: "Bengali" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "mr", name: "Marathi" },
  { code: "kn", name: "Kannada" },
  { code: "ml", name: "Malayalam" },
  { code: "gu", name: "Gujarati" },
  { code: "pa", name: "Punjabi" },
];

// ── Web MediaRecorder helpers ────────────────────────────────
async function webRecordStart(): Promise<{ stop: () => Promise<{ base64: string; format: string }> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks: BlobPart[] = [];
  const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  mr.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  mr.start();
  return {
    stop: () =>
      new Promise((resolve, reject) => {
        mr.onstop = async () => {
          try {
            const type = mr.mimeType || "audio/webm";
            const blob = new Blob(chunks, { type });
            const b64 = await new Promise<string>((res, rej) => {
              const r = new FileReader();
              r.onload = () => res((r.result as string).split(",")[1] || "");
              r.onerror = () => rej(new Error("read failed"));
              r.readAsDataURL(blob);
            });
            stream.getTracks().forEach((t) => t.stop());
            resolve({ base64: b64, format: type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm" });
          } catch (e) {
            reject(e);
          }
        };
        mr.stop();
      }),
  };
}

export default function SectionVoice({ token }: { token: string }) {
  const [langs] = useState<Lang[]>(DEFAULT_LANGS);
  const [lang, setLang] = useState<string>("en");
  const [question, setQuestion] = useState("Is this link safe: paypa1-verify-account.com ?");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [phase, setPhase] = useState<"" | "recording" | "transcribing" | "thinking" | "speaking">("");
  const [error, setError] = useState("");

  const player = useAudioPlayer(audioUri || undefined);
  const playerStatus = useAudioPlayerStatus(player);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const webStopRef = useRef<null | (() => Promise<{ base64: string; format: string }>)>(null);

  const isPlaying = !!playerStatus?.playing;
  const currentTime = playerStatus?.currentTime ?? 0;
  const duration = playerStatus?.duration ?? 0;
  const hasStarted = currentTime > 0 || isPlaying;

  // Autoplay a new reply as soon as we have audio.
  useEffect(() => {
    if (audioUri) {
      try {
        player.play();
      } catch {}
    }
  }, [audioUri, player]);

  // Stop playback if the user leaves the section so audio does not linger.
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  const togglePlayback = () => {
    if (!audioUri) return;
    try {
      if (isPlaying) {
        player.pause();
      } else {
        // If it ended, restart from the beginning.
        if (playerStatus?.didJustFinish || (duration > 0 && currentTime >= duration - 0.1)) {
          player.seekTo(0);
        }
        player.play();
      }
    } catch {}
  };

  const stopPlayback = () => {
    if (!audioUri) return;
    try {
      player.pause();
      player.seekTo(0);
    } catch {}
  };

  const askText = async (text: string) => {
    setError("");
    if (!text.trim()) {
      setError("Type a question or record one first.");
      return;
    }
    // Stop any existing playback before starting a new turn.
    try {
      player.pause();
    } catch {}
    setPhase("thinking");
    setReply("");
    setAudioUri(null);
    try {
      const data = await api<any>(
        "/assistant/reply",
        { method: "POST", body: JSON.stringify({ text, language: lang, voice: "nova" }) },
        token,
      );
      setReply(data.reply_text);
      if (data.audio_base64) {
        setPhase("speaking");
        setAudioUri(`data:audio/mp3;base64,${data.audio_base64}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTimeout(() => setPhase(""), 200);
    }
  };

  const startRecording = async () => {
    setError("");
    setTranscript("");
    setPhase("recording");
    try {
      if (Platform.OS === "web") {
        const handle = await webRecordStart();
        webStopRef.current = handle.stop;
      } else {
        await recorder.prepareToRecordAsync();
        recorder.record();
      }
    } catch (e: any) {
      setError(e.message || "Could not start recording");
      setPhase("");
    }
  };

  const stopAndTranscribe = async () => {
    try {
      let base64 = "";
      let format = "m4a";
      if (Platform.OS === "web") {
        if (!webStopRef.current) throw new Error("Recorder not running");
        const out = await webStopRef.current();
        webStopRef.current = null;
        base64 = out.base64;
        format = out.format;
      } else {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error("No audio captured");
        base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        format = uri.toLowerCase().endsWith(".m4a") ? "m4a" : uri.split(".").pop() || "m4a";
      }
      setPhase("transcribing");
      const stt = await api<any>(
        "/assistant/transcribe",
        { method: "POST", body: JSON.stringify({ audio_base64: base64, audio_format: format, language: lang }) },
        token,
      );
      const text = stt.text || "";
      setTranscript(text);
      if (text) {
        await askText(text);
      } else {
        setError("No speech was detected.");
        setPhase("");
      }
    } catch (e: any) {
      setError(e.message || "Voice capture failed");
      setPhase("");
    }
  };

  return (
    <View>
      <SectionHeader icon="microphone-outline" title="Voice Safety Assistant" subtitle="Speak or type in your language. Hear back whether a link is safe to visit." />

      <View style={s.card}>
        <Text style={s.lbl}>Language</Text>
        <View style={s.chipRow}>
          {langs.map((l) => (
            <Pressable key={l.code} testID={`lang-${l.code}`} onPress={() => setLang(l.code)} style={[s.chip, lang === l.code && s.chipActive]}>
              <Text style={[s.chipText, lang === l.code && { color: C.text }]}>{l.name}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          testID="voice-question"
          value={question}
          onChangeText={setQuestion}
          multiline
          numberOfLines={3}
          placeholder="Ask: 'Is this link safe?' or paste a URL"
          placeholderTextColor={C.muted}
          style={s.input}
        />

        <View style={s.row}>
          <Pressable testID="voice-ask" onPress={() => askText(question)} disabled={phase === "thinking" || phase === "transcribing"} style={[s.primary, { flex: 1 }]}>
            {phase === "thinking" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="send" size={18} color="#fff" />
                <Text style={s.primaryText}>Ask</Text>
              </>
            )}
          </Pressable>
          <Pressable
            testID="voice-record"
            onPress={phase === "recording" ? stopAndTranscribe : startRecording}
            style={[s.recBtn, phase === "recording" && { backgroundColor: C.red, borderColor: C.red }]}
          >
            {phase === "transcribing" ? (
              <ActivityIndicator color={C.text} />
            ) : (
              <MaterialCommunityIcons name={phase === "recording" ? "stop-circle" : "microphone"} size={22} color={phase === "recording" ? "#fff" : C.amber} />
            )}
          </Pressable>
        </View>
        {phase === "recording" ? <Text style={s.rec}>● Recording — tap the mic again to stop.</Text> : null}
        {error ? <Text style={s.err}>{error}</Text> : null}
      </View>

      {transcript ? (
        <View style={s.bubbleUser}>
          <Text style={s.bubbleLabel}>YOU (VOICE)</Text>
          <Text style={s.bubbleText}>{transcript}</Text>
        </View>
      ) : null}

      {reply ? (
        <View style={s.bubbleAi}>
          <View style={s.bubbleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.bubbleLabel}>SAFETAP · {langs.find((l) => l.code === lang)?.name}</Text>
              <Text style={s.bubbleText}>{reply}</Text>
            </View>
            {audioUri ? (
              <View style={s.audioCtrls}>
                <Pressable
                  testID="voice-play-pause"
                  onPress={togglePlayback}
                  style={[s.playBtn, isPlaying && { backgroundColor: C.amber, borderColor: C.amber }]}
                >
                  <MaterialCommunityIcons
                    name={isPlaying ? "pause" : "play"}
                    size={20}
                    color={isPlaying ? "#fff" : C.amber}
                  />
                </Pressable>
                <Pressable
                  testID="voice-stop"
                  onPress={stopPlayback}
                  disabled={!hasStarted}
                  style={[s.stopBtn, !hasStarted && { opacity: 0.4 }]}
                >
                  <MaterialCommunityIcons name="stop" size={18} color={C.red} />
                </Pressable>
              </View>
            ) : null}
          </View>
          {audioUri ? (
            <Text style={s.playbackHint}>
              {isPlaying
                ? "▶ Speaking… tap pause to hold, stop to end."
                : hasStarted
                ? "Paused — tap play to resume, stop to reset."
                : "Tap play to hear the reply again."}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16 },
  lbl: { color: C.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 11, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: C.amberSoft, borderColor: C.amber },
  chipText: { color: C.muted, fontWeight: "700", fontSize: 12 },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    padding: 12,
    color: C.text,
    fontSize: 14,
    textAlignVertical: "top",
  },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
  primary: {
    backgroundColor: C.amber,
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryText: { color: "#fff", fontWeight: "800" },
  recBtn: {
    width: 56,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.amber,
    backgroundColor: C.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  rec: { color: C.red, marginTop: 10, fontWeight: "700", fontSize: 13 },
  err: { color: C.red, marginTop: 10, fontSize: 13 },
  bubbleUser: {
    backgroundColor: "rgba(59,130,246,.14)",
    borderWidth: 1,
    borderColor: C.blue,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  bubbleAi: {
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  bubbleRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  bubbleLabel: { color: C.amber, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  bubbleText: { color: C.text, marginTop: 6, fontSize: 14, lineHeight: 20 },
  audioCtrls: { flexDirection: "row", gap: 8 },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.amberSoft,
    borderWidth: 1,
    borderColor: C.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  stopBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(239,68,68,.14)",
    borderWidth: 1,
    borderColor: C.red,
    alignItems: "center",
    justifyContent: "center",
  },
  playbackHint: { color: C.muted, fontSize: 11, marginTop: 10, fontStyle: "italic" },
});
