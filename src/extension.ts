import * as vscode from "vscode";
import { analyze } from "./analyzer";
import { compareSpec } from "./spec";
import { extractFunctions, generateTests } from "./testgen";
import { showDashboard } from "./report";
import { FindingsProvider, SummaryProvider } from "./providers";
import { AnalysisResult, SpecResult } from "./types";

let lastResults: AnalysisResult[] = [];
let lastSpec: SpecResult | null = null;
let findingsProvider: FindingsProvider;
let summaryProvider: SummaryProvider;
let diagnostics: vscode.DiagnosticCollection;

function langId(lang: string): string {
  const map: Record<string, string> = {
    javascript: "javascript", typescript: "typescript", python: "python",
    java: "java", csharp: "csharp", go: "go", rust: "rust", cpp: "cpp", c: "c",
  };
  return map[lang] ?? "javascript";
}

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("aiCodeVerifier");
}

function publishDiagnostics(result: AnalysisResult, doc: vscode.TextDocument): void {
  const threshold = config().get<string>("severityThreshold", "info");
  const rank = { error: 0, warning: 1, info: 2 };
  const sevMap: Record<string, vscode.DiagnosticSeverity> = {
    error: vscode.DiagnosticSeverity.Error,
    warning: vscode.DiagnosticSeverity.Warning,
    info: vscode.DiagnosticSeverity.Information,
  };
  const diags: vscode.Diagnostic[] = result.findings
    .filter(f => rank[f.severity] <= rank[threshold as keyof typeof rank])
    .map(f => {
      const line = Math.max(0, f.line - 1);
      const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
      const d = new vscode.Diagnostic(range, `${f.message}\nSuggestion: ${f.suggestion}`, sevMap[f.severity]);
      d.code = f.rule;
      d.source = "AI Code Verifier";
      return d;
    });
  diagnostics.set(doc.uri, diags);
}

function runAnalysis(code: string, doc: vscode.TextDocument): AnalysisResult {
  const result = analyze(code, langId(doc.languageId), doc.fileName);
  lastResults = [result];
  findingsProvider.refresh(lastResults);
  summaryProvider.refresh(lastResults);
  publishDiagnostics(result, doc);
  const minScore = config().get<number>("blockMergeBelowScore", 60);
  if (result.confidence < minScore) {
    vscode.window.showWarningMessage(
      `⛔ AI Code Verifier: confidence ${result.confidence}/100 (Grade ${result.grade}) — below merge threshold ${minScore}. ${result.counts.error} error(s), ${result.counts.warning} warning(s).`
    );
  }
  return result;
}

export function activate(context: vscode.ExtensionContext): void {
  findingsProvider = new FindingsProvider();
  summaryProvider = new SummaryProvider();
  diagnostics = vscode.languages.createDiagnosticCollection("aiCodeVerifier");

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("aicv.findings", findingsProvider),
    vscode.window.registerTreeDataProvider("aicv.summary", summaryProvider),
    diagnostics,

    vscode.commands.registerCommand("aiCodeVerifier.verifyFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return vscode.window.showInformationMessage("Open a file to verify.");
      const r = runAnalysis(editor.document.getText(), editor.document);
      showDashboard([r], lastSpec);
    }),

    vscode.commands.registerCommand("aiCodeVerifier.verifySelection", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const sel = editor.selection;
      const text = editor.document.getText(sel);
      if (!text.trim()) return vscode.window.showInformationMessage("Select code first.");
      const r = runAnalysis(text, editor.document);
      showDashboard([r], lastSpec);
    }),

    vscode.commands.registerCommand("aiCodeVerifier.verifyWorkspace", async () => {
      const langs = config().get<string[]>("languages", []);
      const uris = await vscode.workspace.findFiles("**/*.{js,ts,jsx,tsx,py,java,cs,go,rs,cpp,c}", "**/node_modules/**");
      const results: AnalysisResult[] = [];
      for (const uri of uris) {
        const doc = await vscode.workspace.openTextDocument(uri);
        if (!langs.includes(doc.languageId)) continue;
        results.push(analyze(doc.getText(), langId(doc.languageId), doc.fileName));
      }
      lastResults = results;
      findingsProvider.refresh(results);
      summaryProvider.refresh(results);
      showDashboard(results, lastSpec);
    }),

    vscode.commands.registerCommand("aiCodeVerifier.compareSpec", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const spec = await vscode.window.showInputBox({
        prompt: "Paste the original requirement the AI was asked to implement",
        placeHolder: "e.g. Add a REST endpoint that returns paginated users sorted by signup date",
        ignoreFocusOut: true,
      });
      if (!spec) return;
      lastSpec = compareSpec(spec, editor.document.getText());
      const msg = lastSpec.coverage >= 80
        ? `✅ Spec coverage ${lastSpec.coverage}% — all key requirements appear implemented.`
        : `⚠️ Spec coverage ${lastSpec.coverage}%. Missing: ${lastSpec.missing.slice(0, 3).join(" | ")}`;
      vscode.window.showInformationMessage(msg);
      showDashboard(lastResults.length ? lastResults : [runAnalysis(editor.document.getText(), editor.document)], lastSpec);
    }),

    vscode.commands.registerCommand("aiCodeVerifier.generateTests", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const doc = editor.document;
      const sigs = extractFunctions(doc.getText(), langId(doc.languageId));
      if (!sigs.length) return vscode.window.showInformationMessage("No functions found to test.");
      const base = doc.fileName.replace(/\.[^.]+$/, "");
      const suffix = doc.languageId === "python" ? ".test.py" : ".test.ts";
      const testUri = vscode.Uri.file(base + suffix);
      await vscode.workspace.fs.writeFile(testUri, Buffer.from(generateTests(sigs, base.split("/").pop() ?? "module", langId(doc.languageId))));
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(testUri));
      vscode.window.showInformationMessage(`Generated critical tests for ${sigs.length} function(s).`);
    }),

    vscode.commands.registerCommand("aiCodeVerifier.showReport", () => {
      showDashboard(lastResults.length ? lastResults : [], lastSpec);
    }),

    vscode.commands.registerCommand("aicv.revealFinding", async (finding: { line: number; file?: string }) => {
      if (!finding.file) return;
      const doc = await vscode.workspace.openTextDocument(finding.file);
      const editor = await vscode.window.showTextDocument(doc);
      const line = Math.max(0, finding.line - 1);
      editor.selection = new vscode.Selection(line, 0, line, 0);
      editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.InCenter);
    }),

    vscode.workspace.onDidSaveTextDocument(doc => {
      if (!config().get<boolean>("verifyOnSave", true)) return;
      const langs = config().get<string[]>("languages", []);
      if (langs.includes(doc.languageId)) runAnalysis(doc.getText(), doc);
    })
  );
}

export function deactivate(): void { diagnostics?.dispose(); }
