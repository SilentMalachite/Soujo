# Changelog

**English** | [日本語](CHANGELOG.ja.md)

The English version is canonical; the Japanese page is a translation. Versions follow [Semantic Versioning](https://semver.org/).

## 0.1.2 — 2026-09-15

Release: [v0.1.2](https://github.com/SilentMalachite/Soujo/releases/tag/v0.1.2).

### Fixed

- `soujo layer done` and `soujo close` find the LOG entry of a failed run wherever it is in `LOG.md`. Before, an entry added after it (e.g. by `soujo log add`) or an edited older entry made a re-run log the layer a second time.
- `soujo layer done` refuses a `--note` starting with `中断:`, the form only `close` writes. Before, a re-run took such a completion entry for an interruption and logged the layer again.
- `soujo init` removes temporary files left by a killed write, as the other commands that write `.soujo/` do.
- `soujo map code` reads a regular expression after a `<` that does not form `</`, and after the condition of `for await (...)`. Before, an `import(...)` inside such a regular expression could be drawn as an edge.

### Changed

- `test/privacy.test.ts` allows only specific `git@` and `noreply@` addresses such as `git@github.com`, and `.gitignore` also ignores `.netrc`, `_netrc`, `.git-credentials`, and FIDO SSH keys (`id_ed25519_sk`, `id_ecdsa_sk`).
- The README shows how to return Claude Code, as well as Codex, to the GitHub install.
- SPEC: `next set` for `spec` / `plan` refuses an `--effort` other than `high` (wording only), and acceptance criterion 9 records its test count as of L12.

## 0.1.1 — 2026-09-14

Release: [v0.1.1](https://github.com/SilentMalachite/Soujo/releases/tag/v0.1.1).

### Fixed

- `soujo close` commits nothing while `PLAN.md`, `LOG.md`, or `NEXT.md` is not staged as written (e.g. skip-worktree), as `layer done` already did. Before, it could leave a `wip:` commit without its `中断` entry or with an old `NEXT.md`.
- `soujo next set` and `soujo log add` remove temporary files left by a killed write, which stayed untracked until `layer done` or `close` and could block a later write.
- The `go` skill shows the `次: plan` case first, so that its `next set` is not copied with an `--effort` the CLI refuses.

### Changed

- `test/privacy.test.ts` also checks commit messages (CI now fetches the whole history), home paths without a trailing separator, and SSH key files, which `.gitignore` now ignores; SSH remotes such as `git@github.com` and `.env.example` are no longer flagged or ignored.

## 0.1.0 — 2026-09-14

First release: [v0.1.0](https://github.com/SilentMalachite/Soujo/releases/tag/v0.1.0).

### Added

- `soujo` CLI (Node 20+, no runtime dependencies): `init`, `next show` / `set` / `check`, `plan list` / `next`, `log add`, `layer done`, `resume`, `close`, `map plan` / `code`, and `--help` for all of them, one, or those starting with a first word; errors for a missing or unknown command point to `soujo --help`.
- Seven skills shared by Claude Code and Codex — `spec`, `plan`, `go`, `resume`, `map`, `review`, `close` — and the Claude Code subagent `soujo:reviewer`.
- Claude Code hooks: SessionStart adds `NEXT.md` to the context; Stop warns when the project is not resumable.
- Records that survive interruptions: `layer done` and `close` refuse to commit during an unfinished merge, rebase, cherry-pick, or revert, with unmerged files, or when git would leave the records out; a re-run after a failure continues where it stopped; writes to `.soujo/` never leave the project.
- Plugin manifests and marketplaces for both hosts, installable straight from GitHub together with the CLI, and `templates/` for `soujo init` (CLAUDE.md for Opus 5, AGENTS.md for GPT-6 Astra).
- Project files: CONTRIBUTING, SECURITY, and CODE_OF_CONDUCT in English (canonical) and Japanese, issue forms, a pull request template, CI running `npm test` on Node 20, 22, 24, and 26, and Dependabot for the pinned actions and devDependencies.
