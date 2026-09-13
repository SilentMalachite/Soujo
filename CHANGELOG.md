# Changelog

**English** | [日本語](CHANGELOG.ja.md)

The English version is canonical; the Japanese page is a translation. Versions follow [Semantic Versioning](https://semver.org/).

## 0.1.0 — 2026-09-14

First release: [v0.1.0](https://github.com/SilentMalachite/Soujo/releases/tag/v0.1.0).

### Added

- `soujo` CLI (Node 20+, no runtime dependencies): `init`, `next show` / `set` / `check`, `plan list` / `next`, `log add`, `layer done`, `resume`, `close`, `map plan` / `code`, and `--help` for all of them, one, or those starting with a first word; errors for a missing or unknown command point to `soujo --help`.
- Seven skills shared by Claude Code and Codex — `spec`, `plan`, `go`, `resume`, `map`, `review`, `close` — and the Claude Code subagent `soujo:reviewer`.
- Claude Code hooks: SessionStart adds `NEXT.md` to the context; Stop warns when the project is not resumable.
- Records that survive interruptions: `layer done` and `close` refuse to commit during an unfinished merge, rebase, cherry-pick, or revert, with unmerged files, or when git would leave the records out; a re-run after a failure continues where it stopped; writes to `.soujo/` never leave the project.
- Plugin manifests and marketplaces for both hosts, installable straight from GitHub together with the CLI, and `templates/` for `soujo init` (CLAUDE.md for Opus 5, AGENTS.md for GPT-6 Astra).
- Project files: CONTRIBUTING, SECURITY, and CODE_OF_CONDUCT in English (canonical) and Japanese, issue forms, a pull request template, CI running `npm test` on Node 20, 22, 24, and 26, and Dependabot for the pinned actions and devDependencies.
