# 🛡️ AI Code Verifier

**Verify AI-generated code before you merge it.** Copilot, Claude Code, Cline and Codex all write code — nobody checks whether that code is *actually correct*. AI Code Verifier closes that gap.

![banner](media/banner.png)

## What it actually does

| Feature | Description |
|---|---|
| **Static logic verification** | 25+ rules that catch the classic AI bugs: placeholders (`TODO`/`FIXME`), empty `catch` blocks, hardcoded secrets, SQL injection by string concat, `eval/exec`, division by zero, infinite loops, loose equality, off-by-one, floating promises (no `await`), broad `except`, `innerHTML` XSS, `any` types, `@ts-ignore`, shallow-copy traps, magic numbers… |
| **Spec ↔ Implementation comparison** | Paste what you *asked* the AI to do; the extension extracts your requirements, matches them against implemented identifiers, and reports unimplemented requirements with a coverage percentage. |
| **Critical test generation** | One command scans the file, finds every function, and generates the *critical* test cases — null/undefined input rejection and empty-collection handling — as a ready-to-edit test file. |
| **Merge confidence score** | Every verification returns a 0–100 score and an A–F grade. Below your threshold (default 60), the extension shows a **merge blocker** warning. |
| **Problems integration** | Findings are published to the VS Code Problems view with severity, line numbers, and fix suggestions. |
| **Verify on save** | Re-verifies automatically every time you save a supported file. |

## Commands

| Command | Keybinding |
|---|---|
| `AI Code Verifier: Verify Current File` | `Ctrl+Shift+V` / `Cmd+Shift+V` |
| `AI Code Verifier: Verify Selection` | — |
| `AI Code Verifier: Verify Workspace` | — |
| `AI Code Verifier: Compare Spec ↔ Implementation` | — |
| `AI Code Verifier: Generate Critical Tests` | — |
| `AI Code Verifier: Open Verification Dashboard` | — |

## Configuration

- `aiCodeVerifier.verifyOnSave` (default `true`) — re-verify on save.
- `aiCodeVerifier.languages` — languages to analyze.
- `aiCodeVerifier.severityThreshold` — minimum severity pushed to Problems.
- `aiCodeVerifier.blockMergeBelowScore` (default `60`) — score under which a merge-blocker warning appears.

## Build the VSIX

```bash
npm ci
npm run compile
npm run package   # produces ai-code-verifier.vsix
```

Then install: `code --install-extension ai-code-verifier.vsix`

## Publishing via GitHub Actions

The included workflow (`.github/workflows/build.yml`) compiles, lints, packages and uploads the VSIX on every push, and **creates a GitHub Release + publishes to the Visual Studio Marketplace automatically when you push a `v*` tag**:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

For Marketplace publishing, add a `VSCE_PAT` secret in your repository settings.

## License
MIT
