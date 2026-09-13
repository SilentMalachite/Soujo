# SPEC — Soujo (層序): a plugin shared by Claude Code and Codex (TypeScript)

**English** | [日本語](SPEC.ja.md)

This English version is canonical. `.soujo/SPEC.md` in this repository is a symlink to this file.

## 0. In one sentence

Take Spec-kit's "spec → plan → implement" and Superpowers' "turn practice into skills", and strip them down to something that **does not rely on working memory, can be resumed after any interruption, and does not get in the way of the model's autonomy**.
The core is a single TypeScript CLI, `soujo`. Claude Code (Opus 5) and Codex (GPT-6 Astra) share the same `skills/` and the same `.soujo/` records; the differences are confined to manifests and instruction files.

Name: in an excavation, strata (層) are removed one at a time in order (序), and every removed layer is recorded in the site journal and drawings. A removed layer cannot be put back, but with the records anyone can continue the dig.

## 1. Problem

| Existing | Good | Doesn't fit |
|---|---|---|
| Spec-kit | Discipline of fixing the spec first | Many long documents; state across phases and files must be tracked in your head |
| Superpowers | Makes plan → verify → execute a routine | Many skills, hard to see which one fired; the verify step duplicates the self-verification Opus 5 / Astra already do |
| Plain Claude Code / Codex | Freedom | Steps and decisions get buried in the conversation; after an interruption you cannot recall where you were |
| Using both hosts | Each model's strengths | Skills, instruction files, and records get duplicated; unclear which copy is current |

## 2. Design principles (trait → principle → implementation)

The design targets a user with the following traits.

| Trait | Principle | Implementation |
|---|---|---|
| Cannot hold many things in mind at once | Put all state in files | Four files in `.soujo/`; conversations are disposable |
| (same) | One screen, one question, one step | One question at a time; `NEXT.md` is at most 5 lines; a layer takes at most 30 minutes |
| Understands through structure, contrast, and analogy | Explain with tables, diagrams, and comparisons first | `soujo map` draws structure; choices are shown as comparison tables |
| High reading comprehension | Don't simplify; be short and dense | Response rules in CLAUDE.md / AGENTS.md |
| Sessions end without warning | Always keep a resumable state | 1 layer = 1 commit; `soujo next check` detects unresumable states |
| Small usage quota | Keep consumption low | No verification/re-check instructions; work that needs no judgment goes to the CLI |
| Uses two hosts | Keep records and logic model-agnostic | Logic lives in the TypeScript CLI; SKILL.md is shared; host differences are limited to manifests and instruction files |

## 3. User stories

1. `/soujo:spec` (`$spec` in Codex) produces `SPEC.md` through a one-question-at-a-time dialogue.
2. `/soujo:plan` produces `PLAN.md`, a list of "layers" of at most 30 minutes each, each with a one-line completion condition.
3. `/soujo:go` implements, tests, and commits the next layer, and updates `LOG.md` and `NEXT.md`.
4. After a few days away, `/soujo:resume` prints a short status and you can continue right away.
5. A repository advanced to L3 in Claude Code is opened in Codex, and `$resume` → `$go` continues with L4. The reverse also works.
6. `/soujo:map` draws the current structure. `/soujo:review` lists every finding.

## 4. Layout (one repository, both hosts)

```
Soujo/
├── .claude-plugin/plugin.json        # Claude Code manifest
├── .claude-plugin/marketplace.json   # Claude Code marketplace (source "./")
├── .codex-plugin/plugin.json         # Codex manifest (no hooks field)
├── .agents/plugins/marketplace.json  # Codex marketplace (source.path "./")
├── skills/                           # shared by both hosts; commands/ is not used
│   ├── spec/  plan/  go/  resume/  map/  review/  close/   (SKILL.md each)
├── agents/reviewer.md                # Claude Code subagent
├── hooks/hooks.json                  # Claude Code (SessionStart / Stop); Codex runs it only once trusted
├── src/
│   ├── cli.ts        argument parsing and output
│   ├── state.ts      parsing, formatting, validation of .soujo/ (pure functions)
│   ├── files.ts      finding .soujo/ and reading/writing it (thin I/O layer)
│   ├── git.ts        git calls (thin layer)
│   ├── map.ts        ASCII / Mermaid diagram generation (pure functions)
│   └── commands/     one file per command; shared.ts holds checks and messages used by several
├── test/                             # node:test (no dependencies)
├── dist/                             # tsc output; committed because hooks call it directly
├── templates/                        # copied into target projects by `soujo init`
│   ├── CLAUDE.md (Opus 5)  AGENTS.md (Astra)
│   └── SPEC.md  PLAN.md  LOG.md  NEXT.md
├── CLAUDE.md  AGENTS.md              # instructions for this repository (identical to templates)
├── README.md  SPEC.md  CHANGELOG.md  LICENSE  (+ .ja.md translations)
└── package.json  tsconfig.json  tsconfig.test.json
```

Policies:
- **All logic lives in `src/`.** SKILL.md only says when to ask `soujo` for what; no judgment or formatting logic in SKILL.md.
- CLAUDE.md / AGENTS.md at the plugin root are not loaded as context by either host. `soujo init` copies them from `templates/` into the target project.
- SKILL.md frontmatter has only `name` and `description`. `disable-model-invocation` is not used, because Codex's `validate_plugin.py` rejects `true`.
- Runtime-facing text (CLI output, skills, templates, CLAUDE.md / AGENTS.md) is Japanese. User documentation is English with Japanese translations.

## 5. State files `.soujo/`

| File | Role | Limit | Written by |
|---|---|---|---|
| `SPEC.md` | What to build: goals, non-goals, acceptance criteria, technical decisions | ~100 lines | `spec` skill |
| `PLAN.md` | List of layers: `- [ ] <layer> — <completion condition>` | 1 line per layer | `plan` skill; checked by `soujo layer done` |
| `LOG.md` | Append-only journal: `## YYYY-MM-DD <layer>` followed by up to 3 lines | 3 lines per entry | `soujo log add` / `layer done` / `close --note` |
| `NEXT.md` | The next step. **This is all you need to read to resume** | 5 lines | `soujo next set` |

Format of `NEXT.md` (validated by the CLI; keys are literal Japanese, `:` or `：` accepted):

```
次: <layer>
前提: <what just finished / dependencies>
確認: <how to tell this layer is done>
注意: <open issues or pitfalls; "なし" if none>
effort: <low|medium|high|xhigh>
```

## 6. CLI `soujo`

- Node 20+, ESM, **zero runtime dependencies** (`node:*` only). devDependencies are only `typescript` and `@types/node`.
- Output is short and in Japanese; normally at most 5 lines on stdout. Errors are one line on stderr with exit code 1.
- Behaves the same on any host. No host detection; only `--hook` switches to a Claude Code hook-friendly output.
- `.soujo/` is searched upward from the current directory, stopping at the git top level (a directory containing `.git`).

| Command | Behavior | Output |
|---|---|---|
| `soujo init` | Creates `.soujo/` from templates, plus CLAUDE.md / AGENTS.md if missing. Uses the git top level when inside a repository. Never overwrites existing files | Created files, then one line listing skipped ones, and a line saying `git init` is needed outside a repository |
| `soujo next show [--hook]` | Prints `NEXT.md`, or `NEXT.md なし`. With `--hook`, prints nothing when `NEXT.md` is missing | 5 lines |
| `soujo next set --layer --premise --check [--caution] [--effort]` | Rewrites `NEXT.md`. Defaults: caution `なし`, effort `medium`. Values must be one line. When PLAN has layers, a layer not in PLAN (other than `spec` / `plan`) is refused and nothing is written | 1 line |
| `soujo next check [--hook]` | Warns when `NEXT.md` is missing, invalid, points to a layer already `[x]` in PLAN or past an unchecked one, or there are uncommitted changes in the project. Silent outside Soujo projects. `--hook` returns `{"systemMessage": "..."}`. **Exit code is always 0** | 0–1 line |
| `soujo plan list` | Layers and their state | 1 line per layer |
| `soujo plan next` | First unfinished layer and its completion condition | 2 lines |
| `soujo log add <layer> --line ...` | Appends to `LOG.md` (1–3 lines) | 1 line |
| `soujo layer done <layer> [--note ...]` | Checks PLAN → appends LOG → `git add -A -- .` and `git commit -m "layer: <layer>" -- .` in the project directory (a project in a subdirectory commits only that subdirectory). Refuses and writes nothing when: the layer is not in PLAN or the note breaks LOG limits; `NEXT.md` is missing, invalid, or `次:` is still this layer; not a repository, `.soujo/` is a symlink, a merge/rebase/cherry-pick/revert is unfinished, files are unmerged, or `.soujo/` files are git-ignored; the layer is already committed (a `layer: <layer>` commit exists, or it is checked in PLAN at HEAD). When the check exists only in the working tree (a previous run stopped), appends LOG if its last entry is not this layer and commits. A failure after writing says what is recorded; fixing the cause and re-running resumes | 1 line, with up to 5 added files |
| `soujo resume` | `次: <layer>（effort: <e>）確認: <check>` (`NEXT.md`) / `前回: <date> <layer> — <first line>` (last `LOG.md` entry) / `コミット: <hash> <subject>（未コミット N件）` / `再開: /soujo:go（Codex は $go）`. Values are cut at 60 characters with `…`. When `NEXT.md` is missing, unreadable, invalid, or points to a checked layer: `次:` is PLAN's next layer and `再開:` gives the reason and `soujo next set`; with no layer left, `/soujo:spec` (SPEC.md missing or still the template) or `/soujo:plan`. When `NEXT.md` points past an unchecked layer: `次:` is that layer and `再開:` suggests `soujo layer done`. A PLAN check not committed yet (a stopped `layer done`) makes `再開:` say to re-run it. Unreadable files and git failures degrade only their line | 4 lines |
| `soujo close [--note ...]` | Logs `--note` as `中断: ...` → commits the project as `wip: <layer>` → prints how to resume. Refuses (exit 1) and writes nothing when: the same uncommittable states as `layer done`; `NEXT.md` is missing, invalid, or points to a checked layer; a PLAN check is not committed yet (re-run `layer done` instead); the note is blank or breaks LOG limits. The layer is `次:`, or PLAN's first unchecked layer when `次:` already points past it (stopped between `next set` and `layer done`). An uncommitted `中断` entry of that layer at the end of LOG is kept instead of adding another, so re-running after a failed commit retries only the commit | 2 lines |
| `soujo map plan` | Vertical ASCII diagram of `PLAN.md` (`[x]` done, `←次` next, completion condition on the `\|` rail); `全層完了` follows when every layer is done | 2 lines per layer |
| `soujo map code [dir]` | Mermaid `graph LR` of the relative imports in the main language (most files) under `dir` (default: the project root, or cwd outside Soujo projects). Languages are one row each in `LANGUAGES` in `src/map.ts`; only rows with import rules (TS/JS initially) are drawn, and other main languages or no recognized file give an ASCII directory tree. Package and path-alias imports are not drawn. Skips `node_modules`, `dist`, `build`, `target`, `vendor`, `deps`, `_build`, `__pycache__`, `venv`, `coverage`, dot-entries, and symlinks; unreadable subdirectories and files are skipped and counted. Capped at 5000 scanned entries, 100 files (most connected kept), 300 edges, and 200 tree lines, with a note | Mermaid or tree |

Public pure functions of `state.ts` (each has tests):
`parseNext` / `formatNext` / `validateNext` / `parsePlan` / `formatItem` / `nextLayer` / `nextStatus` / `newlyDone` / `markDone` / `printable` / `logLines` / `appendLog` / `parseLog` / `lastLog` / `formatDate`.

## 7. Skills (`skills/`, shared by both hosts)

Common rules: `description` is one sentence with a narrow trigger (Astra truncates descriptions when there are many skills). The body has four sections — "what to read → what to do → what to ask `soujo` → output shape" — with at most 3 lines each. The first "what to read" line says that `soujo` (the command on PATH), git, and `.soujo/` belong to the current project, and that the skill's install location is never `cd`-ed into nor its `.soujo/` or `dist/` used. No "always read X", "run the tests", or "double-check" instructions (both models do that on their own). Values in command examples are single-quoted. `test/skills.test.ts` checks the format and every `soujo` command and option in the skills.

| Skill | Reads | Does | CLI | Output | effort |
|---|---|---|---|---|---|
| `spec` | `SPEC.md` after `soujo init`; config files when proposing technical options | One question at a time (the next only after an answer), at most 7, each with numbered candidates, written down after each answer. The stack comes from config files when they settle it, otherwise from a question; no defaults | `soujo init` → `soujo next set` (next: plan) | One `SPEC.md` skeleton table and the files init created | high |
| `plan` | `SPEC.md` and an existing `PLAN.md` | Split what is not implemented into layers of ≤30 minutes, in dependency order, at most 12 unfinished. Adds nothing when nothing is left | `soujo next set` (only when `次:` is not the first unfinished layer) → `soujo map plan` | `PLAN.md` and the diagram | high |
| `go` | `soujo resume` → `NEXT.md` → `SPEC.md` → the layer in PLAN | Follows `再開:` when it is not go. Implement until the completion condition holds. **Write the next `NEXT.md` first (`次: plan` after the last layer), then `layer done`.** Switches to spec/plan when NEXT points there | `soujo resume` → `soujo next set` → `soujo layer done` | One-sentence result + changed files | from `NEXT.md` |
| `resume` | — | Return the CLI output as is | `soujo resume` | 4 lines | low |
| `map` | Only for `diff`: the latest layer's diff and its surroundings | `plan` / `code [dir]` show the CLI diagram verbatim; `diff` is drawn as Before/After by the model | `soujo map` | Diagram + ≤5 lines | medium |
| `review` | The given range, or the diff from the latest `layer:` commit's parent to the working tree (untracked files included) | **Report every finding** as `# / location / what / why / fix`; starts one `soujo:reviewer` when it can and shows its table unedited | — | Table | medium |
| `close` | — | Pass the one-line note to `--note`, or a line on progress when none is given | `soujo close` | 2 lines | low |

The effort column is a guide for the human or host setting (§8); SKILL.md frontmatter has no place for it.

`go` writes `NEXT.md` before `layer done` so that the commit includes the next `NEXT.md`. This keeps `next check` passing with "clean tree + valid NEXT".

## 8. Host differences

| Item | Claude Code (Opus 5) | Codex (GPT-6 Astra) |
|---|---|---|
| Manifest | `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json` |
| Marketplace | `.claude-plugin/marketplace.json` | `.agents/plugins/marketplace.json` |
| Invocation | `/soujo:go` | `$go` |
| Instruction file | `CLAUDE.md` (Opus 5 version) | `AGENTS.md` (Astra version, **separate wording, not a copy**) |
| Hooks | `hooks/hooks.json`: SessionStart runs `next show --hook`, Stop runs `next check --hook` | `validate_plugin.py` rejects a `hooks` field, but Codex 0.154 discovers `hooks/hooks.json` and runs it only after the user trusts it (untrusted, `codex exec` ran nothing). The `close` skill and "run `soujo close` before stopping" in AGENTS.md stand in |
| Subagent | `review` starts `agents/reviewer.md` once | Not used; `review` is done by the main agent |
| Concurrency | `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=2` documented in README | n/a |
| Effort | Given in conversation per layer from `NEXT.md` | `codex -c model_reasoning_effort=<v>` or `model_reasoning_effort` in `~/.codex/config.toml` |
| Where skills are read | A local directory marketplace is read in place: sessions list the plugin at that directory, load skills from it, and see a skill added there without reinstalling. Installing still copies the working tree (untracked and git-ignored files included, `.git` not) into `~/.claude/plugins/cache/soujo/`, and `claude plugin update` skips an unchanged version. `claude --plugin-dir <path>` also reads in place | From the install cache `~/.codex/plugins/cache/soujo/`, a copy of the whole repository (`.git`, `node_modules`, `.soujo/` included); run `codex plugin add soujo@soujo` again to refresh |
| Commits | Allowed by normal permissions | The `workspace-write` sandbox cannot write `.git`; `layer done` / `close` need an approval (`codex exec`: `--add-dir "$PWD/.git"`). Re-running retries only the commit |
| Validation | `claude plugin validate .` (marketplace) and `claude plugin validate .claude-plugin/plugin.json` (plugin, agents, hooks) | `validate_plugin.py` from the built-in `$plugin-creator` |

## 9. Fitting Opus 5 (CLAUDE.md)

| Tendency | Handling |
|---|---|
| Completes without stopping when the spec is complete | Fix the spec first with `spec`; `go` runs without confirmations |
| Default responses are long | Brevity rules; the CLI enforces line limits of `NEXT.md` / `LOG.md` |
| Narrates a lot | Specify frequency and shape of reports (one sentence first, only on changes, one sentence at the end) |
| Verifies and corrects itself | No verification or re-check instructions |
| Tends to widen scope | "Finish within the requested scope"; completion conditions fix the scope of a layer |
| Starts subagents readily | None except for review |
| Keeps accuracy at low effort | resume/close are low; go uses the per-layer value |
| Really reduces output when told "only the important ones" | Reviews report everything; the human filters |

## 10. Fitting GPT-6 Astra (AGENTS.md)

Follows OpenAI's "Rethinking skills and prompts for GPT-6 Astra" (2026-09-11).

| Tendency | Handling |
|---|---|
| Truncates descriptions and picks the wrong skill when there are many | Seven skills, one-sentence descriptions; don't mix with other skill collections |
| "Always read X" wastes context | No "always read" in AGENTS.md; reading is conditional inside each skill |
| Tests and verifies on its own | No test/verification instructions |
| Returns after the first implementation and stops early | **Define done first**: the completion condition is where stopping is allowed; "continue until it holds" is explicit |
| Takes strong boundary wording literally and stops too often | Phrase as permissions: "implementation, tests, and commits in this repository are allowed" |
| Asks asynchronously while continuing when a decision matters | Only the response rule: one question with numbered options |
| Effort is `model_reasoning_effort` | A human copies `effort:` from `NEXT.md` into config or `-c` |

## 11. Non-goals

- Parallel development by multiple people or agents.
- Full Spec-kit compatibility (constitution, research documents, etc.).
- Searching or summarizing conversation history. Records live only in `.soujo/`.
- Choosing the target project's language or framework. The plugin has no default stack and reads `SPEC.md` and repository config.
- A third host such as Gemini CLI or Cursor (possible later through shared SKILL.md, out of scope now).
- An interactive CLI UI. `soujo` takes arguments and exits.

## 12. Acceptance criteria

All ten were verified on 2026-09-13 in layer L12, with `soujo` from `npm link` and the plugin installed in both hosts (`claude plugin install`, `codex plugin add`). The target was a clone of an existing Python project (AgentReview 0.4.0, tested with `unittest`) that already had its own `AGENTS.md`, so `soujo init` added only `CLAUDE.md` and Codex worked under the project's `AGENTS.md`. `spec`, `plan`, and L1 ran in Claude Code, L2 in Codex, and L3 in Claude Code. Summary in `.soujo/LOG.md`.

- Claude Code: `claude -p` with `--permission-mode acceptEdits` and an allowlist for `soujo`, `git`, `python3`, and the file tools. `spec` was one session continued with `--resume` for 4 turns; `plan`, L1, `resume`, L3, `review`, and the Stop hook checks each ran in a new session.
- Codex: `codex exec` (`workspace-write`, `--add-dir .git`) ran `$resume` and L2's `$go` in separate sessions; the Soujo hooks stayed untrusted.
- Criteria 5, 7, 9, and 10 were checked by running `soujo close` / `soujo next check`, `validate_plugin.py`, `npm test`, and `readlink "$(command -v soujo)"` directly.

| # | Criterion | Status |
|---|---|---|
| 1 | `resume` → `go` works with only the four `.soujo/` files and no conversation history | ✓ every `resume` and `go` ran in a new session (Codex searched its memory file: no match) |
| 2 | **Switching Claude Code → Codex → Claude Code in the same repository keeps the `.soujo/` records continuous** | ✓ `layer:` commits and LOG entries of L1 (Claude Code), L2 (Codex), and L3 (Claude Code) in order |
| 3 | `spec` always asks one question at a time and produces `SPEC.md` within 7 questions | ✓ 3 questions, `SPEC.md` written after each answer |
| 4 | One `go` implements and commits one layer and updates `PLAN.md` / `LOG.md` / `NEXT.md` | ✓ in both hosts |
| 5 | When `NEXT.md` exceeds 5 lines, `soujo close` refuses and `soujo next check` warns | ✓ `close` exits 1 and writes nothing; `next check` warns and exits 0 |
| 6 | Claude Code: ending without updating `NEXT.md` triggers a Stop hook warning (not a block) | ✓ with uncommitted changes, and with a clean tree whose `次:` is already checked; `systemMessage` only, the session ended normally |
| 7 | Codex: `validate_plugin.py` from `$plugin-creator` passes | ✓ |
| 8 | `review` output is a table and findings are not filtered | ✓ Claude Code only: all 8 findings of `soujo:reviewer` in order, but edited (§14) |
| 9 | `npm test` passes; each public function of `state.ts` has at least one test | ✓ 171 tests |
| 10 | The CLI has zero runtime dependencies and `soujo` is on PATH after `npm i -g` or `npm link` | ✓ `soujo` resolves to this repository's `dist/cli.js` |

## 13. Implementation

Implemented in 12 layers of at most 30 minutes each, in dependency order; the list and completion conditions are in `.soujo/PLAN.md`. Compared with the original 10 phases, next and resume/close were split, skill authoring and host verification were split, and `map` was moved before the skills (the `plan` skill calls `soujo map plan`).

## 14. Decisions and open issues

Decided:
- License: 0BSD, so that files created by `soujo init` need no copyright notice.
- `dist/` is committed, because hooks call `dist/cli.js` directly.
- No renames for Codex skill names: `$go` / `$plan` did not collide on Codex 0.154.
- Both hosts list the skills as `soujo:<skill>` and Claude Code lists the agent as `soujo:reviewer`, so no name is shared with built-ins such as `/review` or `/resume`. Only `resume` was run: `/soujo:resume` runs the skill, not the built-in `/resume`, and Codex resolves `$resume` to `soujo:resume`.
- `claude plugin validate .` checks only the marketplace; `claude plugin validate .claude-plugin/plugin.json` checks the plugin with its agents and hooks and runs without `--strict`, because the root CLAUDE.md warning is intended (§4).
- Both marketplaces point at the repository root (`"./"`); both work.
- `disable-model-invocation` is not written in SKILL.md (Codex's validator rejects `true`; criterion 7 takes precedence).
- `soujo next check` also warns when `次:` points to a layer already `[x]` in PLAN, so criterion 6 holds even with a clean tree.
- `soujo close` refuses while a PLAN check is uncommitted, so a stopped `layer done` still ends in its own `layer:` commit instead of a `wip:` one.
- Staging, commits, and the uncommitted count are limited to the project directory (`-- .`); output lines never carry control characters.
- `soujo next show --hook` stays silent without `NEXT.md`, so projects that don't use Soujo get no extra context.
- `soujo layer done` refuses when `NEXT.md` is missing, invalid, or still points to the layer being closed, so every layer commit carries the next step.
- Codex 0.154 has no `--reasoning-effort` flag; effort is passed with `-c model_reasoning_effort=<v>`.
- Layer names in this repository are ASCII so that `layer: <layer>` commit messages stay English.
- After the last layer `NEXT.md` says `次: plan`; `plan` ends without adding layers when nothing in SPEC is left.
- `soujo next set` refuses layers missing from PLAN (other than `spec` / `plan`), so a mistyped layer name is not noticed only at `layer done`.

Open:
- Rotating `LOG.md` when it grows (`soujo log rotate` moving months into `LOG-YYYY-MM.md`).
- Codex 0.154 runs `hooks/hooks.json` once the user trusts it (`[hooks.state]` in `~/.codex/config.toml`); whether `${CLAUDE_PLUGIN_ROOT}` expands there and `systemMessage` is shown is unverified.
- `soujo --help`: both hosts tried it and got an error.
- Models sometimes try to `cd` into the skill's install location or read its `.soujo/`. Host protections blocked it, and skills now warn against it; a CLI-side guard is still open.
- The `spec` skill tends to write `SPEC.md` only at the end instead of after each answer (not reproduced in L12).
- `NEXT.md` for "all layers done" still carries an `effort:` value.
- `spec` / `plan` do not commit. Until the first `layer done`, `.soujo/` changes stay uncommitted and the Stop hook warns every time.
- Codex context size: one `$go` used ~295K–690K input tokens (mostly cached), largely from global Codex context; in L12 it also read an unrelated global skill and searched the Codex memory file.
- `review` in Claude Code kept every finding of `soujo:reviewer` in order but did not show the returned table unedited (§7): it shortened paths, reworded cells, dropped a few phrases, and added a leading sentence.
- `soujo:reviewer` writes absolute paths in the location column; `agents/reviewer.md` asks only for `path:line`.
- Under a Bash allowlist, the first command of `spec` (`command -v soujo && soujo init; ls; …`) was denied once; the model retried with single commands.
- `go` (L3) also edited `CHANGELOG.ja.md`, outside the target SPEC's scope, because an existing test required it; it reported this but left the SPEC unchanged.
