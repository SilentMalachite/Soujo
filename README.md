# Soujo (層序)

**English** | [日本語](README.ja.md)

[![CI](https://github.com/SilentMalachite/Soujo/actions/workflows/ci.yml/badge.svg)](https://github.com/SilentMalachite/Soujo/actions/workflows/ci.yml) [![TypeScript](https://img.shields.io/github/package-json/dependency-version/SilentMalachite/Soujo/dev/typescript?logo=typescript&logoColor=white&color=3178C6)](https://www.typescriptlang.org/)

A spec → plan → layer workflow for Claude Code and Codex that survives any interruption. All state lives in four files under `.soujo/`, so work continues without conversation history — in the same host or the other one.

In an excavation, strata (層) are removed one at a time in order (序), and each removed layer is recorded. With the records, anyone can continue the dig.

Design and decisions: [SPEC.md](SPEC.md).

## How it works

```
/soujo:spec → /soujo:plan → /soujo:go → /soujo:go → … → /soujo:plan (when layers run out)
                                 ↑ /soujo:resume after a break · /soujo:close before stopping
```

| Skill | Claude Code | Codex | Result |
|---|---|---|---|
| spec | `/soujo:spec` | `$spec` | One question at a time (at most 7) → `.soujo/SPEC.md` |
| plan | `/soujo:plan` | `$plan` | Layers of ≤30 minutes, each with a one-line completion condition → `.soujo/PLAN.md` |
| go | `/soujo:go` | `$go` | Implements the next layer, writes the next `NEXT.md`, commits `layer: <layer>` |
| resume | `/soujo:resume` | `$resume` | Four lines: next layer, last log entry, last commit, how to resume |
| close | `/soujo:close` | `$close` | Logs `中断: …` and commits `wip: <layer>` |
| map | `/soujo:map` | `$map` | Plan diagram, import graph, or Before/After of the latest layer |
| review | `/soujo:review` | `$review` | Every finding on the given range (default: the latest layer, uncommitted changes included) in one table, unfiltered |

| File | Holds | Limit |
|---|---|---|
| `SPEC.md` | Goals, non-goals, acceptance criteria, technical decisions | ~100 lines |
| `PLAN.md` | `- [ ] <layer> — <completion condition>` | 1 line per layer |
| `LOG.md` | Append-only journal | 3 lines per entry |
| `NEXT.md` | The next step — all you need to resume | 5 lines |

Runtime text (CLI output, skills, templates) is Japanese.

## Requirements

- Node.js 20+ and git
- Claude Code (checked with 2.1.270) and/or Codex CLI (checked with 0.154)

## Install

Everything installs straight from GitHub; no clone is needed.

1. The `soujo` CLI, required by both hosts: skills call `soujo` from PATH (only the hooks use the plugin's own `dist/cli.js`). It has no runtime dependencies and `dist/` is committed, so there is no build step:

   ```sh
   npm install -g https://github.com/SilentMalachite/Soujo/archive/refs/heads/main.tar.gz
   command -v soujo
   ```

   Use this archive URL, not `github:SilentMalachite/Soujo`: npm 10 installs that form as a link to a temporary clone it then deletes, and fails when installing it again.

2. Claude Code:

   ```sh
   claude plugin marketplace add SilentMalachite/Soujo
   claude plugin install soujo@soujo
   ```

3. Codex:

   ```sh
   codex plugin marketplace add SilentMalachite/Soujo
   codex plugin add soujo@soujo
   ```

To update, run these and start a new session. Update the CLI and the plugin together, since skills rely on the CLI of the same commit:

```sh
npm install -g https://github.com/SilentMalachite/Soujo/archive/refs/heads/main.tar.gz
claude plugin marketplace update soujo && claude plugin update soujo@soujo
codex plugin marketplace upgrade soujo && codex plugin add soujo@soujo
```

The Claude Code plugin declares no `version`, so each new commit counts as an update. Codex copies the plugin into its install cache again on every `codex plugin add`.

## Start

In a git repository, run `/soujo:spec` (Codex: `$spec`). It runs `soujo init`, which creates `.soujo/` and, when missing, `CLAUDE.md` and `AGENTS.md`. Existing files are never overwritten.

`spec` and `plan` do not commit, so the Claude Code Stop hook warns about uncommitted changes until the first `/soujo:go` commits.

## Host notes

| | Claude Code | Codex |
|---|---|---|
| Hooks | SessionStart adds `NEXT.md` to the context; Stop warns (never blocks) when `NEXT.md` is missing, invalid, or out of step with PLAN, or changes are uncommitted | Not relied on: use `$close` before stopping. Codex runs `hooks/hooks.json` only after you trust it; that is unverified, so leave it untrusted |
| Effort | Set it yourself in the conversation before `/soujo:go`, from `effort:` in `NEXT.md` | `codex -c model_reasoning_effort=<low\|medium\|high\|xhigh>` or `model_reasoning_effort` in `~/.codex/config.toml` |
| Commits | Normal permissions | The `workspace-write` sandbox cannot write `.git`: approve the escalation for `soujo layer done` / `soujo close` (`codex exec`: `--add-dir "$PWD/.git"`). Re-running retries only the commit |
| Subagents | `review` starts one `soujo:reviewer`. `export CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=2` caps parallel subagents | Not used |

## CLI

`soujo` takes arguments and exits. Output is usually a few Japanese lines (`map` prints diagrams, `--help` one usage line per command); errors are one line on stderr with exit code 1. Full behavior: [SPEC.md §6](SPEC.md#6-cli-soujo).

| Command | Does |
|---|---|
| `soujo --help` / `soujo next set --help` | Usage lines of every command / of one command, or of the commands starting with `next`, `plan`, `log`, `layer`, or `map` when given only that word; runs nothing else |
| `soujo init` | Creates `.soujo/` (and CLAUDE.md / AGENTS.md) without overwriting |
| `soujo next show [--hook]` | Prints `NEXT.md`; `--hook` is for the SessionStart hook |
| `soujo next set --layer '<layer>' --premise '<premise>' --check '<check>' [--caution '<caution>'] [--effort <low\|medium\|high\|xhigh>]` | Rewrites `NEXT.md`; `spec` / `plan` always get effort `high` |
| `soujo next check [--hook]` | Warns when the project is not resumable; always exits 0; `--hook` is for the Stop hook |
| `soujo plan list` / `soujo plan next` | Layers with their state / the next layer |
| `soujo log add '<layer>' --line '<line>' [--line '<line>']` | Appends 1–3 lines to `LOG.md` |
| `soujo layer done '<layer>' [--note '<note>']` | Checks the layer in PLAN → appends LOG → commits `layer: <layer>` |
| `soujo resume` | Four-line status |
| `soujo close [--note '<note>']` | Logs the interruption → commits `wip: <layer>` |
| `soujo map plan` / `soujo map code [<dir>]` | ASCII plan diagram / Mermaid import graph or directory tree |

## Development

```sh
git clone https://github.com/SilentMalachite/Soujo.git
cd Soujo
npm install
npm run build   # dist/ is committed because hooks call dist/cli.js
npm test        # node:test; also fails when dist/ is stale
claude --plugin-dir .   # try the plugin from the working tree without installing
```

To use the working tree instead of the GitHub install, run in it `npm link`, `claude plugin marketplace add ./`, and `codex plugin marketplace add ./`, then install the plugins as above (remove the GitHub marketplaces first: both are named `soujo`). Write `./`, not `.`: Claude Code rejects `.`. Both hosts save the clone's absolute path. Claude Code sessions read the plugin from the clone in place; Codex needs `codex plugin add soujo@soujo` again after each change.

How to contribute is in [CONTRIBUTING.md](CONTRIBUTING.md), and the rules for agents in [CLAUDE.md](CLAUDE.md) (Claude Code) and [AGENTS.md](AGENTS.md) (Codex); their wording differs on purpose. Changes are listed in [CHANGELOG.md](CHANGELOG.md). Report security problems as [SECURITY.md](SECURITY.md) describes.

## License

[0BSD](LICENSE)
