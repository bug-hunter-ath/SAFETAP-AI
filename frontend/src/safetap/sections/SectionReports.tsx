import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api } from "../api";
import { C } from "../theme";
import { EmptyState, SectionHeader } from "../ui";

function fmt(d: string): string {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function riskBand(score: number): { label: string; color: string } {
  if (score >= 55) return { label: "HIGH RISK", color: "#EF4444" };
  if (score >= 30) return { label: "MEDIUM RISK", color: "#D97706" };
  return { label: "LOW RISK", color: "#10B981" };
}

function reportHtml(evidence: any): string {
  const c = evidence.case || {};
  const generatedAt = evidence.generated_at || new Date().toISOString();
  const band = riskBand(c.risk_score || 0);
  const factorRows = (c.factors || [])
    .map(
      (f: any) => `
        <tr>
          <td class="factor-label">${esc(f.label)}</td>
          <td class="factor-impact">+${esc(f.impact)}</td>
          <td>${esc(f.detail)}</td>
        </tr>`,
    )
    .join("");

  const meta = [
    ["Case ID", c.id],
    ["Type", c.type],
    ["Domain", c.domain || "—"],
    ["URL", c.url || c.post_url || "—"],
    ["Platform", c.platform || "—"],
    ["File", c.filename || "—"],
    ["Fingerprint", c.image_fingerprint || "—"],
    ["Classification", c.classification],
    ["Status", c.status],
    ["Created", fmt(c.created_at || "")],
  ]
    .filter(([, v]) => v && v !== "—")
    .map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`)
    .join("");

  const brands = (c.detected_brands || [])
    .map((b: any) => `<li>${esc(b.name || b)}</li>`)
    .join("");
  const suspicious = (c.suspicious_elements || [])
    .map((v: string) => `<li>${esc(v)}</li>`)
    .join("");
  const urlsFound = (c.urls_found || [])
    .map((v: string) => `<li>${esc(v)}</li>`)
    .join("");

  const threat = c.threat_feed
    ? `<div class="threat ${c.threat_feed.matched ? "matched" : "safe"}">
        <strong>${c.threat_feed.matched ? "Recently Reported Threat" : "No current-feed match"}</strong>
        <div class="muted">${esc(c.threat_feed.source || "")}${c.threat_feed.reported_at ? " · " + esc(c.threat_feed.reported_at) : ""}</div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 32px; color: #0F172A; }
  .brand { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #D97706; padding-bottom: 14px; }
  .brand-name { font-size: 22px; font-weight: 800; letter-spacing: .5px; color: #D97706; }
  .brand-sub { font-size: 11px; color: #64748B; margin-top: 4px; letter-spacing: 1.4px; text-transform: uppercase; }
  .generated { text-align: right; font-size: 10px; color: #64748B; }
  h1 { font-size: 24px; margin: 24px 0 4px; }
  .classification { font-size: 14px; color: #475569; margin-bottom: 20px; text-transform: capitalize; }
  .risk { display: inline-block; padding: 6px 12px; border-radius: 999px; color: white; font-weight: 800; font-size: 11px; letter-spacing: 1px; }
  .card { border: 1px solid #E2E8F0; border-radius: 10px; padding: 16px; margin-top: 18px; page-break-inside: avoid; }
  .card h2 { margin: 0 0 10px; font-size: 13px; color: #D97706; letter-spacing: 1.2px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 6px 0; vertical-align: top; }
  .k { color: #64748B; width: 130px; }
  .v { color: #0F172A; font-weight: 600; word-break: break-all; }
  .factor-label { font-weight: 700; width: 200px; }
  .factor-impact { color: #EF4444; width: 60px; font-weight: 800; }
  ul { margin: 0; padding-left: 20px; font-size: 12px; }
  li { margin: 3px 0; }
  .threat { padding: 12px; border-radius: 8px; margin-top: 10px; font-size: 12px; }
  .threat.matched { background: #FEE2E2; color: #991B1B; }
  .threat.safe { background: #FEF3C7; color: #92400E; }
  .muted { color: #64748B; margin-top: 4px; font-size: 11px; }
  .ai { background: #F1F5F9; padding: 12px; border-radius: 8px; font-size: 12px; line-height: 1.6; color: #1E293B; }
  .ocr { background: #F8FAFC; border: 1px dashed #CBD5E1; padding: 10px; border-radius: 6px; font-family: "SFMono-Regular", Menlo, monospace; font-size: 11px; white-space: pre-wrap; word-break: break-word; }
  .foot { margin-top: 30px; padding-top: 12px; border-top: 1px solid #E2E8F0; font-size: 10px; color: #64748B; text-align: center; line-height: 1.5; }
</style>
</head>
<body>
  <div class="brand">
    <div>
      <div class="brand-name">SafeTap AI</div>
      <div class="brand-sub">Detect · Verify · Protect</div>
    </div>
    <div class="generated">
      <div>Evidence Report</div>
      <div>${esc(fmt(generatedAt))}</div>
    </div>
  </div>

  <h1>${esc(c.domain || c.filename || c.platform || "Case " + (c.id || ""))}</h1>
  <div class="classification">${esc(c.classification || "")}</div>
  <span class="risk" style="background:${band.color}">${band.label} · SCORE ${esc(c.risk_score ?? 0)}/100</span>

  ${threat}

  <div class="card">
    <h2>Case metadata</h2>
    <table>${meta}</table>
  </div>

  ${
    factorRows
      ? `<div class="card"><h2>Contributing factors</h2><table>${factorRows}</table></div>`
      : ""
  }

  ${
    brands
      ? `<div class="card"><h2>Detected brand look-alikes</h2><ul>${brands}</ul></div>`
      : ""
  }

  ${
    suspicious
      ? `<div class="card"><h2>Suspicious elements</h2><ul>${suspicious}</ul></div>`
      : ""
  }

  ${
    urlsFound
      ? `<div class="card"><h2>URLs extracted</h2><ul>${urlsFound}</ul></div>`
      : ""
  }

  ${
    c.ocr_text
      ? `<div class="card"><h2>OCR extract</h2><div class="ocr">${esc(c.ocr_text)}</div></div>`
      : ""
  }

  ${
    c.post_text
      ? `<div class="card"><h2>Post text</h2><div class="ocr">${esc(c.post_text)}</div></div>`
      : ""
  }

  ${
    c.ai_explanation
      ? `<div class="card"><h2>AI explanation</h2><div class="ai">${esc(c.ai_explanation)}</div></div>`
      : ""
  }

  <div class="foot">
    ${esc(evidence.notes || "Relationships are correlations, not proof of identity.")}<br/>
    Report schema: ${esc(evidence.schema || "safetap.evidence.v1")} · Generated by SafeTap AI
  </div>
</body>
</html>`;
}

export default function SectionReports({ token }: { token: string }) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<any>("/reports/mine", undefined, token);
      setReports(data.reports || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const download = async (caseId: string) => {
    setBusy(caseId);
    setStatus("");
    setError("");
    try {
      const evidence = await api<any>(`/reports/${caseId}`, undefined, token);
      const html = reportHtml(evidence);

      if (Platform.OS === "web") {
        // Web: open the report in a print-preview window so the browser saves as PDF.
        const w = window.open("", "_blank");
        if (!w) throw new Error("Popup blocked — allow popups to save the PDF.");
        w.document.open();
        w.document.write(html);
        w.document.close();
        setTimeout(() => {
          try {
            w.focus();
            w.print();
          } catch {}
        }, 400);
        setStatus("PDF preview opened — use Print → Save as PDF.");
      } else {
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "SafeTap evidence report", UTI: "com.adobe.pdf" });
          setStatus("PDF report shared.");
        } else {
          setStatus(`PDF saved to ${uri}`);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <View>
      <SectionHeader icon="file-pdf-box" title="My Reports" subtitle="Every scan you run is saved — download a shareable PDF any time." />

      <View style={s.card}>
        <Pressable testID="refresh-reports" onPress={refresh} style={s.refresh}>
          <MaterialCommunityIcons name="refresh" size={16} color={C.text} />
          <Text style={s.refreshText}>{loading ? "Loading…" : "Refresh"}</Text>
        </Pressable>
        {status ? <Text style={s.ok}>{status}</Text> : null}
        {error ? <Text style={s.err}>{error}</Text> : null}
      </View>

      {loading && !reports.length ? (
        <View style={s.center}>
          <ActivityIndicator color={C.amber} />
        </View>
      ) : reports.length === 0 ? (
        <EmptyState icon="folder-open-outline" title="No reports yet" hint="Run a URL, screenshot, or social post scan to build your evidence history." />
      ) : (
        reports.map((r) => (
          <View key={r.id} testID={`report-${r.id}`} style={s.item}>
            <View style={{ flex: 1 }}>
              <View style={s.rowTop}>
                <MaterialCommunityIcons name={r.type === "screenshot" ? "image-outline" : r.type === "social" ? "account-network-outline" : "link-variant"} size={18} color={C.amber} />
                <Text style={s.itemTitle}>{r.domain || r.filename || r.platform || r.type}</Text>
              </View>
              <Text style={s.muted}>{r.classification} · risk {r.risk_score}</Text>
              <Text style={s.date}>{fmt(r.created_at)}</Text>
            </View>
            <Pressable testID={`download-${r.id}`} onPress={() => download(r.id)} disabled={busy === r.id} style={s.dlBtn}>
              {busy === r.id ? (
                <ActivityIndicator color={C.text} />
              ) : (
                <>
                  <MaterialCommunityIcons name="file-pdf-box" size={16} color={C.text} />
                  <Text style={s.dlText}>PDF</Text>
                </>
              )}
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16 },
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
  ok: { color: C.green, marginTop: 10, fontSize: 13 },
  err: { color: C.red, marginTop: 10, fontSize: 13 },
  center: { padding: 30, alignItems: "center" },
  item: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowTop: { flexDirection: "row", gap: 8, alignItems: "center" },
  itemTitle: { color: C.text, fontWeight: "800", fontSize: 15 },
  muted: { color: C.muted, fontSize: 12, marginTop: 4, textTransform: "capitalize" },
  date: { color: C.mutedSoft, fontSize: 11, marginTop: 4 },
  dlBtn: {
    minWidth: 72,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.amber,
    backgroundColor: C.amberSoft,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  dlText: { color: C.text, fontWeight: "800", fontSize: 12 },
});
