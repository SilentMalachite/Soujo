# SPEC — Soujo (層序): interruptible, resumable, low-context AI coding for Claude Code and Codex (TypeScript)

**English** | [日本語](SPEC.ja.md)

This English version is canonical. `.soujo/SPEC.md` in this repository is a symlink to this file.

## 0. In one sentence

Soujo makes AI coding **interruptible, resumable, and low-context**: work proceeds in layers of at most 30 minutes, each ending in a commit, and all state lives in four short files, so a session can stop at any moment and the next one — in Claude Code or Codex — continues from those files alone.

| Property | Requirement | Met by |
|---|---|---|
| Interruptible development | Stopping at any point loses no work and no decision | 1 layer = 1 commit; `soujo close` commits unfinished work as `wip:`; `soujo next check` warns when the state is not resumable (§6) |
| Resumable AI coding | The next session needs no conversation history, may run in the other host, and may come days or weeks later | `NEXT.md` of at most 5 lines (§5); `soujo resume`; `soujo brief` and the `節目` entries for a return after days away (§5, §6); `skills/` and `.soujo/` shared by both hosts (§4) |
| Low-context development | Neither the user nor the model has to hold more than one screen of state | Line limits on the four files (§5); one question at a time (§7); record updates that need no judgment go to the CLI (§6) |

It takes Spec-kit's "spec → plan → implement" and Superpowers' "turn practice into skills", strips them down to these three properties, and stays out of the way of the model's autonomy.
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
4. After days or weeks away, `/soujo:resume` prints a short status (with the five lines of `soujo brief` from 3 days on) and you can continue right away.
5. A repository advanced to L3 in Claude Code is opened in Codex, and `$resume` → `$go` continues with L4. The reverse also works.
6. `/soujo:map` draws the current structure. `/soujo:review` lists every finding.

## 4. Layout (one repository, both hosts)

```
Soujo/
├── .claude-plugin/plugin.json        # Claude Code manifest (no version: the commit is the version)
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
├── CLAUDE.md  AGENTS.md              # instructions for this repository (the templates plus a section on this repository)
├── README.md  SPEC.md  CHANGELOG.md  CONTRIBUTING.md  SECURITY.md  CODE_OF_CONDUCT.md  LICENSE  (+ .ja.md translations)
├── .github/                          # issue forms, the pull request template, CI (npm test), and Dependabot
└── package.json  tsconfig.json  tsconfig.test.json
```

Policies:
- **All logic lives in `src/`.** SKILL.md only says when to ask `soujo` for what; no judgment or formatting logic in SKILL.md.
- CLAUDE.md / AGENTS.md at the plugin root are not loaded as context by either host. `soujo init` copies them from `templates/` into the target project.
- SKILL.md frontmatter has only `name` and `description`. `disable-model-invocation` is not used, because Codex's `validate_plugin.py` rejects `true`.
- Runtime-facing text (CLI output, skills, templates, CLAUDE.md / AGENTS.md) is Japanese. User documentation is English, which is canonical, with Japanese translations.

## 5. State files `.soujo/`

| File | Role | Limit | Written by |
|---|---|---|---|
| `SPEC.md` | What to build: goals, non-goals, acceptance criteria, technical decisions | ~100 lines | `spec` skill |
| `PLAN.md` | List of layers: `- [ ] <layer> — <completion condition>` | 1 line per layer | `plan` skill; checked by `soujo layer done` |
| `LOG.md` | Journal: `## YYYY-MM-DD <layer>` (a calendar date) followed by up to 3 lines. Commands only append, except `soujo log rotate`, which moves past months into archives. An entry whose layer is `節目` is a milestone: what phase ended and what is open, written by the `spec` / `plan` / `go` skills at phase boundaries, shown by `soujo brief` | 3 lines per entry | `soujo log add` / `layer done` / `close --note`; `soujo log rotate` removes |
| `NEXT.md` | The next step. **This is all you need to read to resume** | 5 lines | `soujo next set` |
| `LOG-YYYY-MM.md` | Archive of `LOG.md`: the entries of one month as `LOG.md` had them, under `# LOG YYYY-MM`. Only `soujo log rotate` reads them | — (not checked) | `soujo log rotate` |

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
- Output is short and in Japanese; normally at most 5 lines on stdout (`--help` and `map` print more). Errors are one line on stderr with exit code 1, with a path under the home directory shown as `~` (in either normalization, and in either letter case on macOS and Windows), so that a copied line carries no user name. A stream closed before the write (`soujo resume` piped into `head -1`) ends the run quietly instead of with an `EPIPE` stack trace. A layer name inside a command a message suggests is a single-quoted argument, as the skills spell it, with `--` before one starting with `-`.
- Every command needs the current directory, since `.soujo/` is searched from there. When it cannot be read — removed while a shell stayed in it — `next check` (with or without `--hook`) and `next show --hook` print nothing and exit 0, as they do outside a project, and every other command says so in one line and exits 1. `--help` is unaffected.
- Behaves the same on any host. No host detection; only `--hook` switches to a Claude Code hook-friendly output.
- `.soujo/` is searched upward from the current directory, stopping at the git top level (a directory containing `.git`).
- git runs without the variables that point it at another repository (those `git rev-parse --local-env-vars` lists: `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, …), so a `soujo` started from a git hook works on the repository of the current directory. Only git's "not a git repository" means outside a repository; any other git failure (git missing, a broken config) is an error, which `resume` and `brief` show on their git lines, `next check` as one warning with the others, and `log add` as an unknown HEAD, as outside a repository.
- git history is read the way changes are staged and committed: only the commits that change the project directory (`git log -- .` there). A `layer: <layer>` commit of another project in the same repository does not count for `layer done`, and `brief` counts neither those nor empty commits, for its last commit too. What HEAD holds of a state file is read from HEAD's entries: each symlink on its path, a directory's included, is followed to its target at HEAD (link text split at `\` too on Windows), whatever the working tree has now, so moving `PLAN.md` behind a symlink does not make committed checks look uncommitted. The check that the records are staged as written covers a symlinked state file's symlink as well as its target.
- `.soujo/` files are replaced through a temporary file created exclusively next to the real file, keeping its permissions. `init` writes nothing where a file already is, so a directory that has `.soujo/` and all of them already may be read-only, and creates the rest, CLAUDE.md / AGENTS.md included, by linking such a temporary file into place, so no file is left half-written and nothing existing is replaced; where hard links cannot be made (FAT, exFAT, and some FUSE and SMB mounts), it copies into a file created exclusively rather than renaming over the place, which is the one case in which an interruption can leave a half-written file there. Commands that write or commit them first remove temporary files left by a killed write, except those named after a process still running, which may be writing one — a pid says that only within the machine and the pid namespace that wrote it, so across a shared mount one is kept for as long as any process holds that number, and a commit made meanwhile takes it along. Symlinks (of a file or of `.soujo/`) are followed only to files inside the project and outside `.git`, part by part so that a `..` after a symlink is taken from where that points, and `.git` is `.git` under every name a file system may hand it: any letter case, a trailing dot or space, an NTFS stream, the 8.3 short name, or code points HFS+ leaves out. Any other read or write is refused, and only regular files are read. A state file or archive that is the same file as another one in `.soujo/` — through a symlink, a differently cased path (where the file system ignores case), or a hard link — is refused for reading as well as writing, since reading one returns the other's contents and writing one writes over them; one whose dangling symlink leads to where another is created is refused for writing, before anything is written, so that a command writing several of them (`layer done`, `log rotate`) never writes through what it has just written.
- Inside a host's plugin directory — the real path of the current directory has a segment `.claude` or `.codex` followed by `plugins`, in any letter case, where the install caches and the marketplace clones of §8 live — `soujo` sees no project, whether the directory holds a copy of Soujo or not: `next check` (with or without `--hook`) and `next show --hook` behave as outside a Soujo project and print nothing, and every other command, `next show` without `--hook` included, exits 1 with one line saying to run it in the project being worked on, before reading or writing anything. `--help` is unaffected. When the real path cannot be found, the real path of the nearest ancestor that can be is checked with the rest of the path.

| Command | Behavior | Output |
|---|---|---|
| `soujo --help` / `soujo <command> --help` | Prints usage lines on stdout and exits 0: as the first argument, every command; after a command, that command's line; after the first word of two-word commands (`next`, `plan`, `log`, `layer`, `map`), the commands starting with it, even when an unknown word follows. `-h` is the same. Only an argument of its own before `--` counts (`--note=--help` and arguments after `--` are ordinary), and it is checked before any other argument, so nothing is validated or run, even for `next show` / `next check` with `--hook`. Each line is the `soujo …` text that the command's usage error shows (`next check` has none). An unknown command stays an error naming what was typed; the errors for a missing or unknown command point to `soujo --help` | 1 line per command |
| `soujo init` | Creates `.soujo/` from templates, plus CLAUDE.md / AGENTS.md if missing. Uses the git top level when inside a repository. Never overwrites existing files. Refuses and creates nothing when a state file's real path (through a symlink of the file or of `.soujo/`) is outside the project, inside `.git`, or where another state file's dangling symlink leads. Two that are already one file are left to the commands that write them, since nothing existing is replaced | Created files, then one line listing skipped ones, and a line saying `git init` is needed outside a repository |
| `soujo next show [--hook]` | Prints `NEXT.md`, or `NEXT.md なし`. With `--hook`, prints nothing when `NEXT.md` is missing | 5 lines |
| `soujo next set --layer --premise --check [--caution] [--effort]` | Rewrites `NEXT.md`. Defaults: caution `なし`, effort `medium`. For the layers `spec` / `plan` (compared exactly after trimming) the effort is `high` (§7): an `--effort` other than `high` is refused, nothing is written, and the error says to omit `--effort`. Values must be one line. When PLAN has layers, a layer not in PLAN (other than `spec` / `plan`) is refused and nothing is written. While PLAN repeats a layer name or has a layer named `spec` / `plan` / `節目`, any layer is refused and nothing is written | 1 line |
| `soujo next check [--hook]` | Warns when `NEXT.md` is missing, invalid, points to a layer already `[x]` in PLAN or past an unchecked one (`plan` comes after every layer), PLAN repeats a layer name or has a layer named `spec` / `plan` / `節目`, there are uncommitted changes in the project (an untracked directory counts once, whatever `status.showUntrackedFiles` says), `soujo log rotate` would move entries of two or more months, or `LOG.md` cannot be read (reported with the other warnings). Silent outside Soujo projects. `--hook` returns `{"systemMessage": "..."}`. **Exit code is always 0** | 0–1 line |
| `soujo plan list` | Layers and their state | 1 line per layer |
| `soujo plan next` | First unfinished layer and its completion condition | 2 lines |
| `soujo log add <layer> --line ...` | Appends to `LOG.md` (1–3 lines). When `LOG.md` already ends with the same entry (date, layer, and lines) and HEAD lacks that copy (or there is no repository), appends nothing and says so, so re-running a line of commands whose later command failed does not repeat it | 1 line |
| `soujo log rotate [--before YYYY-MM]` | Moves the entries of `LOG.md` dated in a month before the current one (or `--before`; `YYYY-MM`, month 01–12) into `.soujo/LOG-YYYY-MM.md`, one archive per month by the entry's date, appended to a new or existing archive with their lines as `LOG.md` has them. Kept in `LOG.md` whatever the date: the text before the first entry, the last entry (so `resume` still shows `前回:`), the last `節目` entry (so `brief` still shows `節目:`), and entries whose date names no month. An entry the archive of its month already has is not appended again. Archives are written first and `LOG.md` last, then the project is committed as `log: rotate <month>` or `log: rotate <first>..<last>`, the months of the entries `LOG.md` loses in the commit. Refuses and writes (or deletes) nothing when: `--before` is not a month; the same uncommittable states as `layer done`; an archive's real path is outside the project, inside `.git`, or another state file's or archive's, or an archive to write or commit is git-ignored; there are uncommitted changes other than a stopped rotate's: changes outside `LOG.md` and existing archives (leftover temporary files aside), a `LOG.md` that is not HEAD's with whole entries removed, a changed archive that is not HEAD's with at least one whole entry of its month appended, a removed or appended entry that no rotate of HEAD's `LOG.md` moves (the last entry or the last `節目` entry, a date naming no month, an entry `LOG.md` never had), or a removed entry not in the archive of its month; or a stopped rotate's entries are not all moved with this `--before` (`前回と同じ --before で再実行する`). So re-running after a failed write or commit finishes the same rotation, also when the archives were committed by hand in between. With nothing to move or commit it only removes leftover temporary files and prints `移動なし` | 2 lines: `LOG.md から N件を M書庫へ移動（<months>）` and the commit |
| `soujo layer done <layer> [--note ...]` | Checks PLAN → appends LOG → `git add -A -- .` and `git commit -m "layer: <layer>" -- .` in the project directory (a project in a subdirectory commits only that subdirectory). Refuses and writes nothing when: the layer is not in PLAN, PLAN repeats a layer name or has a layer named `spec` / `plan` / `節目`, or the note breaks LOG limits or starts with `中断:` (reserved for `close`); `NEXT.md` is missing, invalid, or `次:` is still this layer; not a repository, `.soujo/` is a symlink, a state file's real path (a symlink's target) is outside the project, inside `.git`, or another state file's or archive's, a merge/rebase/cherry-pick/revert is unfinished (a leftover `sequencer/` included), files are unmerged, or `.soujo/` files or their symlink targets are git-ignored; the layer is already committed (a `layer: <layer>` commit changing the project exists, or it is checked in PLAN at HEAD). When the check exists only in the working tree (a previous run stopped), appends LOG unless LOG has this layer's completion entry not in HEAD yet, wherever it is (a `中断` entry of `close` does not count), and commits. Nothing is committed while PLAN, LOG, or NEXT is not staged as written (e.g. skip-worktree). A failure after writing says what is recorded; fixing the cause and re-running resumes | 1 line, with up to 5 added files |
| `soujo resume` | `次: <layer>（effort: <e>）確認: <check>` (`NEXT.md`) / `前回: <date> <layer> — <first line>` (last `LOG.md` entry) / `コミット: <hash> <subject>（未コミット N件）` / `再開: /soujo:go（Codex は $go）`. Values, layer names included, are cut at 60 characters with `…`; a layer name inside a command stays whole and single-quoted. When `NEXT.md` is missing, unreadable, invalid, or points to a checked layer: `次:` is PLAN's next layer and `再開:` gives the reason and `soujo next set`; with no layer left, `/soujo:spec` (SPEC.md missing or still the template) or `/soujo:plan`. When `NEXT.md` points past an unchecked layer (`次: plan` included): `次:` is that layer and `再開:` suggests `soujo layer done`. A PLAN check not committed yet (a stopped `layer done`) makes `再開:` say to re-run it. Unreadable files and git failures degrade only their line. When the last commit is 3 or more days old, `再開:` ends with `・N日ぶり: 先に soujo brief` | 4 lines |
| `soujo brief` | Where the project stands, for a return after days or weeks away, derived from the records (nothing is written): `進捗: PLAN <done>/<all> 層完了・最終 layer: <date> <layer>` (the latest `layer:` commit changing the project; `なし` before the first) / `以後: layer 後のコミット N件: <subjects>` (up to 3 subjects, oldest first, clipped as in `resume`, then `…` when there are more; `なし` when the last commit is the layer commit; every commit as `最初からのコミット N件` before the first layer commit) / `節目: <date> — <first line>` (the last `節目` entry of `LOG.md`, or `なし`) / `空白: 最終コミットから N日（<date>）` / `次: <layer>（effort: <e>）確認: <check>` as `resume` prints it. Unreadable files and git failures degrade only their line, as in `resume` | 5 lines |
| `soujo close [--note ...]` | Logs `--note` as `中断: ...` → commits the project as `wip: <layer>` → prints how to resume. Refuses (exit 1) and writes nothing when: the same uncommittable states as `layer done`; `NEXT.md` is missing, invalid, or points to a checked layer; a PLAN check is not committed yet (re-run `layer done` instead); the note is blank or breaks LOG limits. Nothing is committed while PLAN, LOG, or NEXT is not staged as written (e.g. skip-worktree). The layer is `次:`, or PLAN's first unchecked layer when `次:` already points past it (stopped between `next set` and `layer done`). A `中断` entry of that layer not in HEAD yet, wherever it is in LOG, is kept instead of adding another, so re-running after a failed commit retries only the commit | 2 lines |
| `soujo map plan` | Vertical ASCII diagram of `PLAN.md` (`[x]` done, `←次` next, completion condition on the `\|` rail); `全層完了` follows when every layer is done | 2 lines per layer |
| `soujo map code [dir]` | Mermaid `graph LR` of the relative imports in the main language (most files) under `dir` (default: the project root, or cwd outside Soujo projects). Languages are one row each in `LANGUAGES` in `src/map.ts`; only rows with import rules (TS/JS initially) are drawn, and other main languages or no recognized file give an ASCII directory tree. Package and path-alias imports, and specifiers that are not one fixed string (`'./a' + b`), are not drawn; escapes in a specifier are decoded. Skips `node_modules`, `dist`, `build`, `target`, `vendor`, `deps`, `_build`, `__pycache__`, `venv`, `coverage`, dot-entries, and symlinks; unreadable subdirectories and files are skipped and counted. Capped at 5000 scanned entries, 100 files (most connected kept), 300 edges, and 200 tree lines, with a note | Mermaid or tree |

Public pure functions of `state.ts` (each has tests):
`parseNext` / `formatNext` / `validateNext` / `parsePlan` / `validatePlan` / `formatItem` / `nextLayer` / `nextStatus` / `newlyDone` / `markDone` / `printable` / `logLines` / `appendLog` / `parseLog` / `lastLog` / `isMonth` / `requireMonth` / `logMonth` / `logMonths` / `rotateLog` / `archiveLog` / `appendedEntries` / `removedEntries` / `lastMilestone` / `daysBetween` / `formatDate`.

## 7. Skills (`skills/`, shared by both hosts)

Common rules: `description` is one sentence with a narrow trigger (Astra truncates descriptions when there are many skills). The body has four sections — "what to read → what to do → what to ask `soujo` → output shape" — with at most 3 lines each. The first "what to read" line says that `soujo` (the command on PATH), git, and `.soujo/` belong to the current project, and that the skill's install location is never `cd`-ed into nor its `.soujo/` or `dist/` used. No "always read X", "run the tests", or "double-check" instructions (both models do that on their own). Values in command examples are single-quoted. `test/skills.test.ts` checks the format and every `soujo` command and option in the skills.

| Skill | Reads | Does | CLI | Output | effort |
|---|---|---|---|---|---|
| `spec` | `SPEC.md` after `soujo init`; config files when proposing technical options | One question at a time (the next only after an answer), at most 7, each with numbered candidates, written down after each answer. The stack comes from config files when they settle it, otherwise from a question; no defaults | `soujo init` → `soujo log add 節目` (SPEC written; what is open) → `soujo next set` (next: plan) | One `SPEC.md` skeleton table and the files init created | high |
| `plan` | `SPEC.md` and an existing `PLAN.md` | Split what is not implemented into layers of ≤30 minutes, in dependency order, at most 12 unfinished. Adds nothing when nothing is left | `soujo log add 節目` (only when layers were added: how many, what was left out) → `soujo next set` (only when `次:` is not the first unfinished layer) → `soujo map plan` | `PLAN.md` and the diagram | high |
| `go` | `soujo resume` → `NEXT.md` → `SPEC.md` → the layer in PLAN | Follows `再開:` when it is not go, but not its pointer to `soujo brief`. Implement until the completion condition holds. **Write the next `NEXT.md` first (`次: plan` after the last layer), then `layer done`; on the last layer, write the `節目` entry to LOG before `NEXT.md`.** A refused command is re-run from where it failed. Switches to spec/plan when NEXT points there | `soujo resume` → `soujo log add 節目` (last layer only: what the layers delivered, what is open) → `soujo next set` → `soujo layer done` | One-sentence result + changed files | from `NEXT.md` |
| `resume` | — | Return the CLI output as is; when the `再開:` line ends with `・N日ぶり: 先に soujo brief`, run `soujo brief` after the 4 lines | `soujo resume` → `soujo brief` (only when the `再開:` line ends that way) | 4 lines, then the 5 lines of `brief` when it ran. A failed `resume` returns its one error line and runs no `brief`; a failed `brief` adds its error line after the 4 lines | low |
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
| Install from GitHub | `claude plugin marketplace add SilentMalachite/Soujo` clones the repository. `plugin.json` has no `version`, so the commit is the version, and `claude plugin marketplace update soujo` with `claude plugin update soujo@soujo` bring in new commits | `codex plugin marketplace add SilentMalachite/Soujo` keeps a Git snapshot; `codex plugin marketplace upgrade soujo` refreshes it and `codex plugin add soujo@soujo` copies it into the cache again. For a marketplace added from a local path, `upgrade` fails (`` marketplace `soujo` is not configured as a Git marketplace ``, exit 1); `codex plugin marketplace remove soujo && codex plugin marketplace add SilentMalachite/Soujo && codex plugin add soujo@soujo` switches it to GitHub |
| Where skills are read | A local directory marketplace is read in place: sessions list the plugin at that directory, load skills from it, and see a skill added there without reinstalling. Installing still copies the working tree (untracked and git-ignored files included, `.git` not) into `~/.claude/plugins/cache/soujo/`, and `claude plugin update` skips an unchanged version (commit). `claude --plugin-dir <path>` also reads in place | From the install cache `~/.codex/plugins/cache/soujo/`, a copy of the whole repository (`.git`, `node_modules`, `.soujo/` included); run `codex plugin add soujo@soujo` again to refresh |
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
| 9 | `npm test` passes; each public function of `state.ts` has at least one test | ✓ 171 tests at L12 |
| 10 | The CLI has zero runtime dependencies and `soujo` is on PATH after `npm i -g` or `npm link` | ✓ `soujo` resolves to this repository's `dist/cli.js` |

## 13. Implementation

Implemented in 12 layers of at most 30 minutes each, in dependency order; the list and completion conditions are in `.soujo/PLAN.md`. Compared with the original 10 phases, next and resume/close were split, skill authoring and host verification were split, and `map` was moved before the skills (the `plan` skill calls `soujo map plan`). After acceptance, L13–L15 implement former open issues of §14, now decided: `soujo --help`, the effort of `次: spec` / `次: plan`, and `soujo log rotate`. L16–L17 add `soujo brief` and the `節目` entries for returning after days away. L18 makes `soujo` refuse to run inside a host's plugin directory. L19 makes the `resume` skill run `soujo brief` when `soujo resume` points to it.

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
- `soujo --help` and `soujo <command> --help` print usage lines and run nothing else (L13): both hosts tried `soujo --help` and got an error, and write commands given `--help` must keep writing nothing, as they do now by rejecting it as an unknown option.
- `soujo next set` writes `effort: high` for `次: spec` / `次: plan`, the effort of those skills in §7, and refuses other values (L14), so `NEXT.md` after the last layer no longer carries an arbitrary effort. `NEXT.md` written by other means is not checked for it.
- `soujo log rotate` moves the entries of past months of `LOG.md` into `LOG-YYYY-MM.md` by entry date, not position, as `LOG.md` has them, and always keeps the last entry and the last `節目` entry (L15, L17 review), because `resume` reads `前回:` and `brief` reads `節目:` from `LOG.md` and no status command reads the archives. It is manual, not part of `layer done`, and refuses other uncommitted changes because `commitRecords` stages the whole project. A stopped rotate's changes are the one exception, because the Codex sandbox cannot commit without approval and a re-run must finish rather than be refused; the exception accepts only what a rotate writes (entries removed from `LOG.md`, entries appended to archives), so a hand edit or a deleted archive is never committed as `log: rotate`. `uncommittedLogs` compares entries by content, so a rotated `LOG.md` does not look like uncommitted entries to `layer done` / `close`. Archive names are `LOG-<month>.md` with a month checked by `state.ts`, and every state file name is checked before a path is built from it, so archives are read and written through the same in-project checks as the four state files.
- Returning after days or weeks away needs a few lines between `NEXT.md` (the next step) and `LOG.md` (every step): `soujo brief` derives the facts (progress, commits after the last layer, the gap, the next step) from the records so that nothing new has to be kept up to date, and the reasons live in `節目` entries the skills write at phase boundaries (when `spec` has written SPEC, when `plan` has added layers, and in the `go` that finishes the last layer, before its `next set`) and in the decisions of this section (L16–L17). No fifth state file and no change to the 4 lines of `resume`, which only points to `brief` after 3 days; the `resume` skill follows that pointer and returns the 5 lines of `brief` after the 4 lines, so that a return after weeks takes one skill, while `go` keeps reading only the 4 lines (L19). A PLAN layer named `節目` is refused like `spec` / `plan` (below), because its completion entry would read as a milestone. `soujo log add` does not append the last entry again while HEAD lacks it, because the skills run `log add 節目` right before `next set`, and re-running both after a refused `next set` would otherwise leave two milestones.
- `次: plan` counts as past every layer, so an unchecked layer left by stopping between `next set --layer plan` and the last `layer done` is warned about, shown by `resume`, and named by `close`. A `plan` run stopped before its `next set` is reported the same way; `soujo next set` to the first layer fixes it.
- `layer done` and `close` check that PLAN, LOG, and NEXT are staged as written before committing, because after a commit without them a re-run of `layer done` is refused as already committed, and `close` would leave a `wip:` commit without its `中断` entry or with an old `NEXT.md`.
- Git state is read the same under any user configuration: untracked files regardless of `status.showUntrackedFiles`, and a leftover `sequencer/` counts as an unfinished cherry-pick or revert, as `git status` reports it.
- Both the plugin and the CLI install straight from GitHub (§8). The CLI comes from the archive URL `https://github.com/SilentMalachite/Soujo/archive/refs/heads/main.tar.gz`: npm 10 installs `github:SilentMalachite/Soujo` as a link to a temporary clone it deletes, and prepares that git dependency again on reinstall, which fails. `.claude-plugin/plugin.json` has no `version` so that each commit reaches `claude plugin update`; the Codex manifest keeps the version of `package.json`.
- Reads and writes never leave the project (§6), because a cloned repository can carry symlinks planted to overwrite the user's files through ordinary record keeping, or to put them into hook output and warnings that reach the model.
- A layer name appears once in PLAN and is never `spec` / `plan` / `節目`: `next set` and `layer done` refuse otherwise and `next check` warns, because a repeated layer cannot get its own `layer:` commit, `次: plan` cannot tell the phase from a layer of that name, and `brief` would take a `節目` layer's completion entry for a milestone. Phases are never matched to PLAN's layers.
- `templates/CLAUDE.md` / `templates/AGENTS.md` hold only what fits any project, and this repository's copies add a last section on Soujo itself, because `soujo init` copies the templates into projects of any stack.
- `soujo` refuses to run inside a host's plugin directory (L18, §6). The install caches and marketplace clones under `~/.claude/plugins/` and `~/.codex/plugins/` hold a copy of this repository with its `.soujo/` (with `.git` in Codex's cache and Claude Code's marketplace clone), and models sometimes tried to `cd` there or read that `.soujo/`, stopped only by host protections and the warning in the skills; `resume` there would show this repository's records, and `init` or a commit would land in the copy. The check is on the real path of the current directory, so a symlink into the copy is caught; letter case is ignored because macOS and Windows file systems usually ignore it; reads of the copy with other tools are out of the CLI's reach. `next show --hook` / `next check` stay silent as outside a Soujo project so that a session opened there gets no hook error; `next show` without `--hook` refuses instead of pointing to `soujo init`, which is refused there. A checkout that a host reads in place (a local directory marketplace, `claude --plugin-dir`) is an ordinary project and is not refused.

Open:
- Codex 0.154 runs `hooks/hooks.json` once the user trusts it (`[hooks.state]` in `~/.codex/config.toml`); whether `${CLAUDE_PLUGIN_ROOT}` expands there and `systemMessage` is shown is unverified.
- The `spec` skill tends to write `SPEC.md` only at the end instead of after each answer (not reproduced in L12).
- `spec` / `plan` do not commit. Until the first `layer done`, `.soujo/` changes stay uncommitted and the Stop hook warns every time.
- Codex context size: one `$go` used ~295K–690K input tokens (mostly cached), largely from global Codex context; in L12 it also read an unrelated global skill and searched the Codex memory file.
- `review` in Claude Code kept every finding of `soujo:reviewer` in order but did not show the returned table unedited (§7): it shortened paths, reworded cells, dropped a few phrases, and added a leading sentence.
- `soujo:reviewer` writes absolute paths in the location column; `agents/reviewer.md` asks only for `path:line`.
- Under a Bash allowlist, the first command of `spec` (`command -v soujo && soujo init; ls; …`) was denied once; the model retried with single commands.
- `go` (L3) also edited `CHANGELOG.ja.md`, outside the target SPEC's scope, because an existing test required it; it reported this but left the SPEC unchanged.
