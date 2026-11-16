import * as vscode from "vscode";
import { AnalysisResult, SpecResult } from "./types";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function gauge(score: number): string {
  const color = score >= 75 ? "#22c55e" : score >= 60 ? "#eab308" : "#ef4444";
  const deg = (score / 100) * 360;
  return `<div class="gauge" style="--c:${color};--p:${deg}deg">
    <div class="gauge-inner"><span class="score">${score}</span><span class="label">confidence</span></div>
  </div>`;
}

function findingsHtml(results: AnalysisResult[]): string {
  const rows = results.flatMap(r =>
    r.findings.map(f => `<tr class="${f.severity}">
      <td>${r.file.split("/").pop()}</td>
      <td><span class="sev ${f.severity}">${f.severity}</span></td>
      <td>${f.line}</td>
      <td>${esc(f.message)}<div class="sug">→ ${esc(f.suggestion)}</div></td>
    </tr>`)
  ).join("");
  return rows
    ? `<table><thead><tr><th>File</th><th>Severity</th><th>Line</th><th>Finding</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="ok">✅ No findings — the code passed every static rule.</p>`;
}

function specHtml(spec: SpecResult | null): string {
  if (!spec) return "";
  const rows = spec.requirements.map(r => `<tr class="${r.implemented ? "ok-row" : "miss-row"}">
    <td>${r.implemented ? "✅" : "❌"}</td><td>${esc(r.text)}</td><td>${esc(r.evidence ?? "—")}</td>
  </tr>`).join("");
  return `<h2>Spec ↔ Implementation coverage: <b>${spec.coverage}%</b></h2>
    ${spec.missing.length ? `<div class="warn">⚠️ Unimplemented requirements: ${spec.missing.length} — do not merge until resolved.</div>` : `<div class="ok">All extracted requirements appear implemented.</div>`}
    <table><thead><tr><th></th><th>Requirement</th><th>Matched identifier</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function showDashboard(results: AnalysisResult[], spec: SpecResult | null): void {
  const panel = vscode.window.createWebviewPanel(
    "aicv.dashboard", "AI Code Verifier — Dashboard",
    vscode.ViewColumn.Beside, { enableScripts: false }
  );

  const worst = results.reduce((a, b) => (a.confidence < b.confidence ? a : b), results[0]);
  const agg = {
    error: results.reduce((n, r) => n + r.counts.error, 0),
    warning: results.reduce((n, r) => n + r.counts.warning, 0),
    info: results.reduce((n, r) => n + r.counts.info, 0),
  };
  const mergeBlocked = worst && worst.confidence < 60;

  panel.webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); padding: 24px; }
    h1 { font-size: 20px; } h2 { font-size: 15px; margin-top: 28px; }
    .gauge { width: 140px; height: 140px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
      background: conic-gradient(var(--c) var(--p), #333 0); margin-right: 32px; }
    .gauge-inner { width: 100px; height: 100px; border-radius: 50%; background: var(--vscode-editor-background); display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .score { font-size: 30px; font-weight: 700; } .label { font-size: 11px; opacity: .7; }
    .grade { font-size: 34px; font-weight: 800; } .meta { display: flex; align-items: center; gap: 24px; margin: 12px 0; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; } td, th { border: 1px solid #444; padding: 6px 8px; text-align: left; }
    .sev.error { color: #ef4444; } .sev.warning { color: #eab308; } .sev.info { color: #60a5fa; }
    .sug { opacity: .65; font-size: 11px; } .ok { color: #22c55e; } .warn { color: #eab308; padding: 10px; border: 1px solid #eab308; border-radius: 6px; }
    .block { color: #ef4444; font-weight: 700; padding: 10px; border: 1px solid #ef4444; border-radius: 6px; }
    .miss-row { background: rgba(239,68,68,.08); }
  </style></head><body>
  <h1>🛡️ AI Code Verifier — Verification Report</h1>
  ${mergeBlocked ? `<div class="block">⛔ Merge blocked: confidence ${worst.confidence}/100 is below the 60 threshold.</div>` : ""}
  <div class="meta">
    ${gauge(worst.confidence)}
    <div>
      <div class="grade">Grade ${worst.grade}</div>
      <div>Files analyzed: <b>${results.length}</b></div>
      <div>Errors: <b style="color:#ef4444">${agg.error}</b> · Warnings: <b style="color:#eab308">${agg.warning}</b> · Info: <b style="color:#60a5fa">${agg.info}</b></div>
    </div>
  </div>
  ${specHtml(spec)}
  <h2>Static findings</h2>
  ${findingsHtml(results)}
  </body></html>`;
}
