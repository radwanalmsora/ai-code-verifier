export type Severity = "error" | "warning" | "info";

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  line: number;          // 1-based
  suggestion: string;
  file?: string;
}

export interface AnalysisResult {
  file: string;
  language: string;
  findings: Finding[];
  confidence: number;     // 0..100
  grade: "A" | "B" | "C" | "D" | "F";
  counts: { error: number; warning: number; info: number };
  metrics: { lines: number; functions: number; branches: number };
}

export interface SpecResult {
  requirements: { text: string; implemented: boolean; evidence: string | null }[];
  coverage: number;       // 0..100
  missing: string[];
  extra: string[];
}
