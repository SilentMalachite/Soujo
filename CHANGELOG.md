# Changelog

**English** | [日本語](CHANGELOG.ja.md)

The English version is canonical; the Japanese page is a translation. Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- `soujo brief` prints five lines for returning after days away, derived from the records without writing anything: PLAN progress with the last `layer:` commit, the commits after it, the last `節目` entry of `LOG.md`, the days since the last commit, and the next step as `soujo resume` shows it. An unreadable file or a git failure degrades only its line.
- `soujo resume` ends `再開:` with `・N日ぶり: 先に soujo brief` when the last commit is 3 or more days old.

### Changed

- The `spec` skill, the `plan` skill when it adds layers, and the `go` skill that finishes the last layer (before its `next set`) write a `節目` entry to `LOG.md` (what ended, what is open), which `soujo brief` shows.
- `soujo next set` and `soujo layer done` refuse, and `soujo next check` warns about, a PLAN layer named `節目`, as for `spec` / `plan`.
- `soujo log rotate` keeps the last `節目` entry in `LOG.md`, so `soujo brief` still shows it after a rotate.
- `soujo log add` appends nothing when `LOG.md` already ends with the same entry that HEAD lacks, so re-running `log add 節目` with a refused `next set` leaves one milestone.
- The CLAUDE.md and AGENTS.md that `soujo init` creates put the `節目` entry of the last layer first in the fixed closing steps, describe the other `節目` entries, and point to `soujo brief` after days away.

## 0.2.0 — 2026-09-15

Release: [v0.2.0](https://github.com/SilentMalachite/Soujo/releases/tag/v0.2.0).

### Added

- `soujo log rotate [--before YYYY-MM]` moves the entries of `LOG.md` dated before the current month (or `--before`) into `.soujo/LOG-YYYY-MM.md`, one archive per month, as `LOG.md` has them. It keeps the text before the first entry and the last entry, so that `soujo resume` still shows `前回:`, and commits `log: rotate <months>`. It refuses while other changes are uncommitted; a re-run after a failed write or commit finishes the same rotation without moving an entry twice.
- `soujo next check` warns when `soujo log rotate` would move entries of two or more months.

### Changed

- `soujo next check` reads `LOG.md`, and warns when it cannot be read (e.g. a symlink leaving the project) along with the other warnings.
- `soujo init`, `soujo next set`, `soujo log add`, `soujo layer done`, and `soujo close` also remove temporary files left by a killed write of an archive.
- A date in a new `LOG.md` entry must name a real month and day (`2026-13-01` is refused).

## 0.1.3 — 2026-09-15

Release: [v0.1.3](https://github.com/SilentMalachite/Soujo/releases/tag/v0.1.3).

### Fixed

- `.soujo/` files are read only where they may be written: through a symlink (of a file or of `.soujo/`) to a file outside the project or inside `.git`, or when not a regular file, reading is refused. Before, a symlink planted in a cloned repository could put another file into the session context through `soujo next show --hook` or into a `soujo next check` warning, and a symlink to `/dev/zero` could hang a hook.
- `soujo init` refuses and creates nothing when a state file's real path is outside the project or inside `.git`. Before, a symlinked `.soujo/` made it create the templates wherever the symlink pointed.
- `soujo init` writes each file to a temporary file and links it into place. Before, an interruption could leave an empty or half-written file, which a re-run skipped as existing.
- `soujo next set` and `soujo layer done` refuse a `PLAN.md` that repeats a layer name or has a layer named `spec` / `plan`, and `soujo next check` warns about it. Before, only the first of two layers with the same name could be closed, and a layer named `plan` was taken for the step after the last layer.

### Changed

- `templates/CLAUDE.md` and `templates/AGENTS.md`, which `soujo init` copies into projects of any stack, no longer describe Soujo's own stack (TypeScript, a committed `dist/`); this repository's copies keep it in a last section. Projects set up earlier keep their copies: the `このリポジトリ（Soujo 本体）` part of §6 in `CLAUDE.md` and the `本体：` line in `AGENTS.md` can be deleted by hand.
- `CLAUDE.md` says `--effort` of `soujo next set` is only for PLAN layers, and the `plan` skill says not to name a layer `spec` or `plan`.

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
