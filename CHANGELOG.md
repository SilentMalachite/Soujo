# Changelog

**English** | [日本語](CHANGELOG.ja.md)

## 0.1.0 — unreleased

First version.

- `soujo` CLI (Node 20+, no runtime dependencies): `init`, `next show` / `set` / `check`, `plan list` / `next`, `log add`, `layer done`, `resume`, `close`, `map plan` / `code`.
- Seven skills shared by Claude Code and Codex — `spec`, `plan`, `go`, `resume`, `map`, `review`, `close` — and the Claude Code subagent `soujo:reviewer`.
- Claude Code hooks: SessionStart adds `NEXT.md` to the context; Stop warns when the project is not resumable.
- Plugin manifests and marketplaces for both hosts, and `templates/` for `soujo init` (CLAUDE.md for Opus 5, AGENTS.md for GPT-6 Astra).
