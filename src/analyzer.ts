import { Finding, AnalysisResult, Severity } from "./types";

interface Rule {
  id: string;
  severity: Severity;
  langs: string[] | "*";
  appliesTo: RegExp | ((line: string, code: string, lang: string) => boolean);
  message: (m: RegExpMatchArray | null, line: string) => string;
  suggestion: string;
}

const RE = {
  todo: /\b(TODO|FIXME|HACK|XXX|PLACEHOLDER|implement me|not implemented|to be implemented)\b/i,
  emptyCatch: /catch\s*\(\s*\w*\s*\)\s*\{\s*(\/\/[^\n]*)?\}/,
  looseEq: /(^|[^=!<>])\s*[^=\s]\s*==\s*[^=]|[^=!]\s*!=\s*[^=]/,
  hardSecret: /(api[_-]?key|secret|password|passwd|token|auth)\s*[:=]\s*["'][^"']{6,}["']/i,
  divZero: /\/\s*0(?!\d)/,
  whileTrue: /while\s*\(\s*true\s*\)|while\s+True\s*:/,
  consoleLog: /(^|[^\w])console\.(log|debug)\s*\(/,
  printPy: /(^|\s)print\s*\([^)]*\)\s*$/,
  debuggerStmt: /(^|\s)debugger\s*;/,
  varUsage: /\bvar\s+\w+/,
  mutableGlobal: /^(let|var)\s+\w+\s*=.*(api|config|state)/i,
  fetchNoCatch: /\bfetch\s*\(/,
  offByOne: /<=\s*[\w.]*length\b|<\s*[\w.]*length\s*\+\s*1/,
  unsafeEval: /\b(eval|exec)\s*\(/,
  syncSleep: /\bsetTimeout\s*\([^,]+,\s*(3000|5000|10000)\)/,
  unboundLoopVar: /for\s*\(\s*(?:let|var|int)?\s*(\w+)\s*=/,
  anyType: /:\s*any\b|<any>|as\s+any\b/,
  tsIgnore: /@ts-(ignore|nocheck)/,
  eslintDisable: /eslint-disable/,
  shallowCopy: /=\s*\[?\.\.\.\w+\]?\s*$/,
  floatEq: /===?\s*[^\n]*\d+\.\d+[^\n]*===?/,
  missingAwait: /[^\w.](\w+)\s*\([^)]*\)(?!\s*[,;)}]|\s*await)/,
  broadExcept: /except\s*:\s*$|except\s+Exception\s*:/,
  bareReturnNone: /return\s+\w+\s*[+\-*/]\s*None\b/,
  sqlConcat: /(SELECT|INSERT|UPDATE|DELETE)[^"']*["']\s*\+\s*\w+/i,
  domInnerHtml: /innerHTML\s*\+=|innerHTML\s*=/,
  magicNumber: /return\s+[^\n]*\b(\.\d+|\d{2,})\b/,
};

function perLineCheck(re: RegExp): (line: string) => boolean {
  return (line) => re.test(line);
}

export const RULES: Rule[] = [
  { id: "placeholder", severity: "error", langs: "*", appliesTo: perLineCheck(RE.todo),
    message: () => "AI left a placeholder / unfinished idea (TODO/FIXME/PLACEHOLDER).",
    suggestion: "Complete or remove the unfinished part before merging." },
  { id: "empty-catch", severity: "error", langs: ["javascript","typescript","java","csharp","go"],
    appliesTo: perLineCheck(RE.emptyCatch),
    message: () => "Empty catch block swallows errors silently.",
    suggestion: "Log the error and rethrow, or handle it explicitly." },
  { id: "hardcoded-secret", severity: "error", langs: "*",
    appliesTo: perLineCheck(RE.hardSecret),
    message: () => "Hardcoded credential/API key detected.",
    suggestion: "Move to environment variables or a secrets manager." },
  { id: "sql-injection", severity: "error", langs: ["javascript","typescript","python","java","csharp","go","cpp","c"],
    appliesTo: perLineCheck(RE.sqlConcat),
    message: () => "SQL built by string concatenation — likely injection point.",
    suggestion: "Use parameterized queries / prepared statements." },
  { id: "unsafe-eval", severity: "error", langs: ["javascript","typescript","python"],
    appliesTo: perLineCheck(RE.unsafeEval),
    message: () => "eval/exec executes dynamic strings — classic AI-generated risk.",
    suggestion: "Replace with a safe parser or explicit logic." },
  { id: "div-zero", severity: "error", langs: "*", appliesTo: perLineCheck(RE.divZero),
    message: () => "Potential division by zero.",
    suggestion: "Guard the denominator before dividing." },
  { id: "infinite-loop", severity: "error", langs: ["javascript","typescript","python","java","csharp","go","cpp","c"],
    appliesTo: perLineCheck(RE.whileTrue),
    message: () => "`while(true)` / `while True` loop with no visible break on this line.",
    suggestion: "Ensure a reachable exit condition exists." },
  { id: "loose-equality", severity: "warning", langs: ["javascript","typescript"],
    appliesTo: (l) => RE.looseEq.test(l) && !l.includes("===") && !l.includes("!=="),
    message: () => "Loose equality (== / !=) — type coercion bugs.",
    suggestion: "Use === and !==." },
  { id: "float-equality", severity: "warning", langs: "*",
    appliesTo: perLineCheck(RE.floatEq),
    message: () => "Direct comparison involving a float literal.",
    suggestion: "Compare with an epsilon tolerance." },
  { id: "off-by-one", severity: "warning", langs: ["javascript","typescript","java","csharp","go","cpp","c"],
    appliesTo: perLineCheck(RE.offByOne),
    message: () => "Possible off-by-one: iterating with <= length.",
    suggestion: "Use < length, or length - 1 as the final index." },
  { id: "no-await", severity: "warning", langs: ["javascript","typescript"],
    appliesTo: (l, code) => RE.missingAwait.test(l) && /async\s+/.test(code) && !l.includes("await"),
    message: () => "Promise-returning call without await inside an async context.",
    suggestion: "Add await or .then() — floating promises cause race conditions." },
  { id: "fetch-no-catch", severity: "warning", langs: ["javascript","typescript"],
    appliesTo: perLineCheck(RE.fetchNoCatch),
    message: () => "Network call (fetch) — verify it is wrapped in try/catch or .catch().",
    suggestion: "Handle fetch failures; they reject on HTTP errors only when you check res.ok." },
  { id: "console-log", severity: "info", langs: ["javascript","typescript"],
    appliesTo: perLineCheck(RE.consoleLog),
    message: () => "Debug output (console.log) left in code.",
    suggestion: "Remove or route through a logger." },
  { id: "print-debug", severity: "info", langs: ["python"],
    appliesTo: perLineCheck(RE.printPy),
    message: () => "Debug print() left in code.",
    suggestion: "Use logging module or remove." },
  { id: "debugger-stmt", severity: "warning", langs: ["javascript","typescript"],
    appliesTo: perLineCheck(RE.debuggerStmt),
    message: () => "`debugger` statement shipped in source.",
    suggestion: "Remove before merging." },
  { id: "var-keyword", severity: "warning", langs: ["javascript","typescript"],
    appliesTo: perLineCheck(RE.varUsage),
    message: () => "`var` has function scope and hoisting surprises.",
    suggestion: "Use let/const." },
  { id: "any-type", severity: "warning", langs: ["typescript"],
    appliesTo: perLineCheck(RE.anyType),
    message: () => "`any` disables type safety.",
    suggestion: "Use unknown + narrowing or a concrete type." },
  { id: "ts-ignore", severity: "warning", langs: ["typescript","javascript"],
    appliesTo: perLineCheck(RE.tsIgnore),
    message: () => "@ts-ignore/@ts-nocheck hides type errors.",
    suggestion: "Fix the underlying error instead." },
  { id: "eslint-disable", severity: "info", langs: ["javascript","typescript"],
    appliesTo: perLineCheck(RE.eslintDisable),
    message: () => "eslint-disable suppresses linting.",
    suggestion: "Narrow to a specific rule, or remove." },
  { id: "broad-except", severity: "warning", langs: ["python"],
    appliesTo: perLineCheck(RE.broadExcept),
    message: () => "Bare/broad except hides failures.",
    suggestion: "Catch specific exceptions." },
  { id: "innerhtml", severity: "warning", langs: ["javascript","typescript"],
    appliesTo: perLineCheck(RE.domInnerHtml),
    message: () => "innerHTML assignment — XSS risk if data is not trusted.",
    suggestion: "Use textContent or sanitize with DOMPurify." },
  { id: "shallow-copy", severity: "info", langs: ["javascript","typescript"],
    appliesTo: perLineCheck(RE.shallowCopy),
    message: () => "Shallow copy spreads only one level — nested objects are shared.",
    suggestion: "Use structuredClone() for deep copies." },
  { id: "magic-number", severity: "info", langs: "*",
    appliesTo: perLineCheck(RE.magicNumber),
    message: () => "Magic number in logic.",
    suggestion: "Extract to a named constant." },
];

const SEVERITY_WEIGHT: Record<Severity, number> = { error: 22, warning: 8, info: 2 };


export function analyze(code: string, language: string, file: string): AnalysisResult {
  const lines = code.split(/\r?\n/);
  const findings: Finding[] = [];
  const isAsyncFile = /\basync\b|\bawait\b/.test(code);

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*")) return;
    for (const rule of RULES) {
      if (rule.langs !== "*" && !rule.langs.includes(language)) continue;
      const hit = typeof rule.appliesTo === "function"
        ? rule.appliesTo(line, isAsyncFile ? "async " + code : code, language)
        : rule.appliesTo.test(line);
      if (hit) {
        findings.push({
          rule: rule.id, severity: rule.severity,
          message: rule.message(null, line.trim().slice(0, 120)),
          line: idx + 1, suggestion: rule.suggestion, file,
        });
      }
    }
  });

  // Deduplicate identical (rule,line) hits
  const seen = new Set<string>();
  const unique = findings.filter(f => {
    const k = f.rule + ":" + f.line;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  const counts = {
    error: unique.filter(f => f.severity === "error").length,
    warning: unique.filter(f => f.severity === "warning").length,
    info: unique.filter(f => f.severity === "info").length,
  };

  const penalty = unique.reduce((acc, f) => acc + SEVERITY_WEIGHT[f.severity], 0);
  const sizeBonus = Math.min(10, Math.floor(lines.length / 100)); // larger files get small slack
  const confidence = Math.max(0, Math.min(100, 100 - penalty + sizeBonus));
  const grade = confidence >= 90 ? "A" : confidence >= 75 ? "B" : confidence >= 60 ? "C" : confidence >= 40 ? "D" : "F";

  const functions = (code.match(/\b(function\s+\w+|=>|def\s+\w+|class\s+\w+)\b/g) || []).length;
  const branches = (code.match(/\b(if|else|switch|case|\?|for|while|try|catch)\b/g) || []).length;

  return {
    file, language, findings: unique, confidence, grade: grade as AnalysisResult["grade"],
    counts, metrics: { lines: lines.length, functions, branches },
  };
}
