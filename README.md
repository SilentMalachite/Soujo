# Soujo (層序)

**English** | [日本語](README.ja.md)

[![CI](https://github.com/SilentMalachite/Soujo/actions/workflows/ci.yml/badge.svg)](https://github.com/SilentMalachite/Soujo/actions/workflows/ci.yml) [![TypeScript](https://img.shields.io/github/package-json/dependency-version/SilentMalachite/Soujo/dev/typescript?logo=typescript&logoColor=white&color=3178C6)](https://www.typescriptlang.org/) [![License](https://img.shields.io/github/license/SilentMalachite/Soujo)](LICENSE)

**Interruptible development, resumable AI coding, low-context development** — a spec → plan → layer workflow for Claude Code and Codex.

AI coding sessions end mid-task: a usage limit, a compacted context, a meeting, the end of the day, a move to the other host, weeks on other things. When the plan and the decisions live only in the conversation, the next session starts by reconstructing them. Soujo keeps them in four short files under `.soujo/` and commits each finished layer, so the next session — in either host — continues from the files alone.

| | What it means | How Soujo does it |
|---|---|---|
| Interruptible development | Stopping at any moment loses no work and no decision | Layers of ≤30 minutes, one commit each; `close` commits unfinished work as `wip:` |
| Resumable AI coding | A new session needs no conversation history, in either host, even weeks later | `NEXT.md` (≤5 lines) names the next step; `resume` prints a four-line status; after days away, `brief` adds progress, the last `節目` (milestone) entry, and the gap |
| Low-context development | Neither you nor the model has to keep much in mind | Each file has a line limit; one question at a time; the CLI updates the records |

The name: in an excavation, strata (層) are removed one at a time in order (序), and each removed layer is recorded. With the records, anyone can continue the dig.

Design and decisions: [SPEC.md](SPEC.md).

## How it works

```
/soujo:spec → /soujo:plan → /soujo:go → /soujo:go → … → /soujo:plan (when layers run out)
                                 ↑ /soujo:resume after a break (soujo brief after days or weeks away) · /soujo:close before stopping
```

| Skill | Claude Code | Codex | Result |
|---|---|---|---|
| spec | `/soujo:spec` | `$spec` | One question at a time (at most 7) → `.soujo/SPEC.md`, then a `節目` entry in `LOG.md` |
| plan | `/soujo:plan` | `$plan` | Layers of ≤30 minutes, each with a one-line completion condition → `.soujo/PLAN.md`, then a `節目` entry when layers were added |
| go | `/soujo:go` | `$go` | Implements the next layer, writes the next `NEXT.md` (after a `節目` entry on the last layer), commits `layer: <layer>` |
| resume | `/soujo:resume` | `$resume` | Four lines: next layer, last log entry, last commit, how to resume |
| close | `/soujo:close` | `$close` | Logs `中断: …` and commits `wip: <layer>` |
| map | `/soujo:map` | `$map` | Plan diagram, import graph, or Before/After of the latest layer |
| review | `/soujo:review` | `$review` | Every finding on the given range (default: the latest layer, uncommitted changes included) in one table, unfiltered |

| File | Holds | Limit |
|---|---|---|
| `SPEC.md` | Goals, non-goals, acceptance criteria, technical decisions | ~100 lines |
| `PLAN.md` | `- [ ] <layer> — <completion condition>` | 1 line per layer |
| `LOG.md` | Journal that commands append to; only `soujo log rotate` moves entries out. `節目` entries, written by spec / plan / go at phase boundaries, say what ended and what is open, and `soujo brief` shows the last one | 3 lines per entry |
| `LOG-YYYY-MM.md` | Past months of `LOG.md`, moved by `soujo log rotate` | — (entries as `LOG.md` had them) |
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

If `codex plugin marketplace upgrade soujo` fails with `` marketplace `soujo` is not configured as a Git marketplace ``, the marketplace was added from a local path ([Development](#development)); switch it to GitHub once with `codex plugin marketplace remove soujo && codex plugin marketplace add SilentMalachite/Soujo && codex plugin add soujo@soujo`, and the update above works from then on.

## Start

In a git repository, run `/soujo:spec` (Codex: `$spec`). It runs `soujo init`, which creates `.soujo/` and, when missing, `CLAUDE.md` and `AGENTS.md`. Existing files are never overwritten.

`spec` and `plan` do not commit, so the Claude Code Stop hook warns about uncommitted changes until the first `/soujo:go` commits.

## Host notes

| | Claude Code | Codex |
|---|---|---|
| Hooks | SessionStart adds `NEXT.md` to the context; Stop warns (never blocks) when `NEXT.md` is missing, invalid, or out of step with PLAN, changes are uncommitted, or `soujo log rotate` would move entries of two or more months | Not relied on: use `$close` before stopping. Codex runs `hooks/hooks.json` only after you trust it; that is unverified, so leave it untrusted |
| Effort | Set it yourself in the conversation before `/soujo:go`, from `effort:` in `NEXT.md` | `codex -c model_reasoning_effort=<low\|medium\|high\|xhigh>` or `model_reasoning_effort` in `~/.codex/config.toml` |
| Commits | Normal permissions | The `workspace-write` sandbox cannot write `.git`: approve the escalation for `soujo layer done` / `soujo close` (`codex exec`: `--add-dir "$PWD/.git"`). Re-running retries only the commit |
| Subagents | `review` starts one `soujo:reviewer`. `export CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=2` caps parallel subagents | Not used |

## CLI

`soujo` takes arguments and exits. Output is usually a few Japanese lines (`map` prints diagrams, `--help` one usage line per command); errors are one line on stderr with exit code 1. Inside a host's plugin directory (`.claude/plugins` or `.codex/plugins`, in any letter case, in the real path of the current directory, where installed copies of Soujo live), `soujo next check` and `soujo next show --hook` behave as outside a Soujo project and print nothing, and every other command but `--help`, `soujo next show` without `--hook` included, exits 1 without reading or writing anything: run `soujo` in the project you are working on. Any directory there is refused, a copy of Soujo or not; a checkout that a host reads in place (`claude --plugin-dir`, a local directory marketplace) is not. Full behavior: [SPEC.md §6](SPEC.md#6-cli-soujo).

| Command | Does |
|---|---|
| `soujo --help` / `soujo next set --help` | Usage lines of every command / of one command, or of the commands starting with `next`, `plan`, `log`, `layer`, or `map` when given only that word; runs nothing else |
| `soujo init` | Creates `.soujo/` (and CLAUDE.md / AGENTS.md) without overwriting |
| `soujo next show [--hook]` | Prints `NEXT.md`; `--hook` is for the SessionStart hook |
| `soujo next set --layer '<layer>' --premise '<premise>' --check '<check>' [--caution '<caution>'] [--effort <low\|medium\|high\|xhigh>]` | Rewrites `NEXT.md`; `spec` / `plan` always get effort `high` |
| `soujo next check [--hook]` | Warns when the project is not resumable; always exits 0; `--hook` is for the Stop hook |
| `soujo plan list` / `soujo plan next` | Layers with their state / the next layer |
| `soujo log add '<layer>' --line '<line>' [--line '<line>']` | Appends 1–3 lines to `LOG.md`; nothing when `LOG.md` already ends with the same uncommitted entry |
| `soujo log rotate [--before <YYYY-MM>]` | Moves entries of months before the current one (or `--before`) into `LOG-YYYY-MM.md` as they are, keeping the last entry and the last `節目` entry, and commits `log: rotate <months>`; refuses other uncommitted changes, and a re-run after a failure finishes the same rotation |
| `soujo layer done '<layer>' [--note '<note>']` | Checks the layer in PLAN → appends LOG → commits `layer: <layer>` |
| `soujo resume` | Four-line status; from 3 days after the last commit, `再開:` points to `soujo brief` |
| `soujo brief` | Five lines for returning after days or weeks away: PLAN progress and the last layer, commits since it, the last `節目` entry, days since the last commit, the next step; writes nothing |
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

To use the working tree instead of the GitHub install, run in it `npm link`, `claude plugin marketplace add ./`, and `codex plugin marketplace add ./`, then install the plugins as above (remove the GitHub marketplaces first: both are named `soujo`). Write `./`, not `.`: Claude Code rejects `.`. Both hosts save the clone's absolute path. Claude Code sessions read the plugin from the clone in place; Codex needs `codex plugin add soujo@soujo` again after each change. To return to the GitHub install, run `claude plugin marketplace remove soujo && claude plugin marketplace add SilentMalachite/Soujo && claude plugin install soujo@soujo` for Claude Code and `codex plugin marketplace remove soujo && codex plugin marketplace add SilentMalachite/Soujo && codex plugin add soujo@soujo` for Codex: `codex plugin marketplace upgrade` works only for a marketplace added from GitHub.

How to contribute is in [CONTRIBUTING.md](CONTRIBUTING.md), and the rules for agents in [CLAUDE.md](CLAUDE.md) (Claude Code) and [AGENTS.md](AGENTS.md) (Codex); their wording differs on purpose. Changes are listed in [CHANGELOG.md](CHANGELOG.md). Report security problems as [SECURITY.md](SECURITY.md) describes.

## License

[0BSD](LICENSE)
