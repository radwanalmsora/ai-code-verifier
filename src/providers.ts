import * as vscode from "vscode";
import { AnalysisResult, Finding } from "./types";

export class FindingsProvider implements vscode.TreeDataProvider<Finding> {
  private emitter = new vscode.EventEmitter<Finding | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private results: AnalysisResult[] = [];

  refresh(results: AnalysisResult[]): void {
    this.results = results;
    this.emitter.fire(undefined);
  }

  clear(): void { this.results = []; this.emitter.fire(undefined); }

  getChildren(): Finding[] {
    return this.results.flatMap(r => r.findings);
  }

  getTreeItem(f: Finding): vscode.TreeItem {
    const icon = f.severity === "error" ? "$(error)" : f.severity === "warning" ? "$(warning)" : "$(info)";
    const item = new vscode.TreeItem(`${icon} ${f.line}: ${f.message}`, vscode.TreeItemCollapsibleState.None);
    item.tooltip = `${f.rule}\n${f.suggestion}`;
    item.command = { command: "aicv.revealFinding", title: "Reveal", arguments: [f] };
    item.contextValue = f.severity;
    return item;
  }
}

export class SummaryProvider implements vscode.TreeDataProvider<string> {
  private emitter = new vscode.EventEmitter<string | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private lines: string[] = ["Run “Verify Current File” to get a confidence score."];

  refresh(results: AnalysisResult[]): void {
    if (!results.length) { this.lines = ["Run “Verify Current File” to get a confidence score."]; }
    else {
      const worst = results.reduce((a, b) => (a.confidence < b.confidence ? a : b));
      this.lines = [
        `Confidence: ${worst.confidence}/100 (Grade ${worst.grade})`,
        `Errors: ${results.reduce((n, r) => n + r.counts.error, 0)}`,
        `Warnings: ${results.reduce((n, r) => n + r.counts.warning, 0)}`,
        `Functions scanned: ${results.reduce((n, r) => n + r.metrics.functions, 0)}`,
        `Branches scanned: ${results.reduce((n, r) => n + r.metrics.branches, 0)}`,
        worst.confidence < 60 ? "⛔ Below merge threshold (60)" : "✅ Above merge threshold (60)",
      ];
    }
    this.emitter.fire(undefined);
  }

  getChildren(): string[] { return this.lines; }
  getTreeItem(s: string): vscode.TreeItem {
    return new vscode.TreeItem(s, vscode.TreeItemCollapsibleState.None);
  }
}
