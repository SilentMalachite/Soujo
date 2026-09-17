# Changelog

**English** | [日本語](CHANGELOG.ja.md)

The English version is canonical; the Japanese page is a translation. Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- `converge` is a phase, like `spec` and `plan`: `soujo next set --layer converge` writes `effort: high` and refuses any other effort, and `next check`, `resume`, and `close` put `次: converge` after every layer, as they do `次: plan`. A PLAN layer named `converge` is refused by `next set`, `layer done`, and `close`, and warned about by `next check`.
- `soujo next check` warns about the keyed sections of `SPEC.md`: more than 7 lines under `## 原則`, a line there that is not `- P<n> <name> — <sentence>`, an item without indentation under `## 受け入れ基準` that does not start with an `A<n>` key, and a key repeated within its section. Blank lines, one-line HTML comments, and code fences are not lines of these sections, every problem but the count is named by its line, and a SPEC without these headings is not checked. A `SPEC.md` that cannot be read is warned about with the other warnings.
- The `converge` skill (`/soujo:converge`, `$converge`) runs after the last layer. It reads the keyed lines of `SPEC.md`, `PLAN.md`, and only the code the `layer:` and `wip:` commits changed or a search for a criterion's words finds; classifies each acceptance criterion and principle as `met`, `missing` (also when no code is found), `partial`, or `contradicts` with `path:line` evidence, and code nothing asks for as `unrequested`; and appends each gap that no unfinished layer's completion condition closes to `PLAN.md` as a layer whose completion condition ends with its key and kind (`（A3 partial）`), principle violations first and at most 12 unfinished, leaving every existing line as it is. A SPEC without keys has its own names for them stand in. With a gap or an unfinished layer left, `NEXT.md` is set to the first unfinished layer unless it already points there; with neither, `unrequested` code alone included, it records that the code has converged and points `NEXT.md` to `plan`. It stops without adding anything when `soujo next check` warns about `PLAN.md`, changes neither SPEC nor code, leaves a `節目` entry either way, and puts `unrequested` code, gaps past the limit, and missing keys on that entry's open line.

### Changed

- `templates/SPEC.md` starts with a `## 原則` section, and it and `## 受け入れ基準` show their key forms (`- P1 <名前> — <判定できる1文>`, `- A1 <判定できる1文>`) in one-line HTML comments. The `確認:` of `templates/NEXT.md` names the principles too. `soujo init` still leaves existing files as they are.
- `soujo resume` takes a `SPEC.md` holding nothing but `#` headings, blank lines, and HTML comments for unwritten and points to `/soujo:spec`, whichever template version it was copied from. Blocks are told apart as CommonMark does: a comment indented by four spaces or a tab is code, and text beside a comment is text. A byte order mark is skipped and a lone CR breaks a line; an unreadable SPEC counts as written. Before, only a SPEC equal to the current template was, so a project made before this template would have been sent to `/soujo:plan`.
- The `go` skill closes the last layer with a `節目` entry, `soujo next set --layer 'converge'`, and `layer done`, then goes on with `converge`, and switches to it when `次:` is `converge`. Before, it pointed `NEXT.md` to `plan`. The `plan` skill names `converge` among the layer names the CLI refuses, keeps every existing line of `PLAN.md` (unfinished ones included) and only appends, and sets `NEXT.md` when there is an unfinished layer and `NEXT.md` is missing or invalid, does not point to the first one, or `soujo next check` names `確認:`, not only when the warning names `次:`.
- The READMEs, the Codex manifest, and CLAUDE.md / AGENTS.md with their templates name `converge` with the other skills and phases: the flow, the skill table, who writes `節目` entries, which phases get effort `high`, and that `converge` leaves its records uncommitted like `spec` and `plan`.
- With every layer done and `NEXT.md` missing, unreadable, invalid, or pointing to a finished layer, `soujo resume` points to `/soujo:converge` instead of `/soujo:plan`.
- `test/cli.test.ts` tests an unreadable current directory made by locking its parent only where that makes it unreadable: Linux answers `getcwd` without checking permissions, which failed CI on Ubuntu since 0.3.1.

## 0.3.2 — 2026-09-16

Release: [v0.3.2](https://github.com/SilentMalachite/Soujo/releases/tag/v0.3.2).

### Fixed

- git runs without `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, and the other variables that point it at another repository, so a `soujo` started from a git hook no longer reads or commits a repository other than the current directory's.
- A git failure other than "not a git repository" (git missing, a broken config) is no longer taken for a directory outside a repository: `soujo init` refuses instead of creating `.soujo/` in the current directory, `resume` and `brief` say `git の状態を読めない`, and `next check` warns with the other warnings.
- Paths that git prints keep spaces at the start or end of a directory name.
- `layer done` and `brief` read only the commits that change the project: a `layer: <layer>` commit of another project in the same repository no longer refuses `layer done`, and `brief` no longer shows other projects' commits or empty commits.
- A state file at HEAD is read through HEAD's own entries, following each symlink on its path, a directory's included: moving `PLAN.md` behind a symlink no longer makes `resume` and `close` take committed checks for a stopped `layer done`, and a symlink at HEAD later replaced by a file is no longer read as its link text.
- `layer done`, `close`, and `log rotate` refuse to commit when a symlinked state file's symlink itself is left unstaged (skip-worktree), not only its target.
- A symlink of a state file or of `.soujo/` into `.git` under another of the names a file system may hand it — another letter case (`.GIT`), a trailing dot or space, an NTFS stream, the 8.3 short name, code points HFS+ leaves out — is refused like one into `.git`. Before, on a file system ignoring case, `soujo init`, reads (`next show --hook` output) and writes went into `.git` through it.
- A state file or archive that is the same file as another one in `.soujo/` (through a symlink, a differently cased path, or a hard link) is refused for reading and writing, since reading one returns the other's contents and writing one writes over them: `LOG.md` symlinked to `PLAN.md` made `layer done` append the log to PLAN. One whose dangling symlink leads to where another is created is refused for writing, before anything is written: an archive symlinked to an archive the rotation was about to write made `log rotate` write over what it had just moved.
- A symlink is followed part by part, through further symlinks, so that a `..` after one is taken from where it points, as the operating system does.
- `soujo init` writes nothing where a file already is, so it succeeds in a directory that has every file and is read-only. Before, it wrote a temporary file next to each one and failed with `EACCES`.
- Where hard links cannot be made (FAT, exFAT, some FUSE and SMB mounts), `soujo init` copies the new file into a place nothing holds instead of renaming over it, so a file created in between is never replaced. On those file systems only, an interruption can leave a half-written file there.
- A layer name inside a command that `resume` or `close` suggests is a single-quoted argument, as the skills, the usage lines, and the CLAUDE.md / AGENTS.md templates now spell it, with `--` before a name starting with `-` and `--layer=<name>` for an option value: copying the line runs the layer of that name instead of a `$(…)` in it, and takes its spaces and quotes as one argument.
- `soujo next check` and `soujo next show --hook` print nothing and exit 0 when the current directory cannot be read — removed while the shell stayed in it, or no longer permitted — so a Stop hook no longer fails there. Every other command says so in one line, naming the reason's code when it is not `ENOENT`, instead of showing `uv_cwd`.
- A stream closed before `soujo` writes to it (`soujo resume` piped into `head -1`) ends the run quietly, instead of an `EPIPE` stack trace with exit code 1. Any other failed write (a full disk) is reported on stderr in one line and fails the run.
- Output and errors show a path under the home directory as `~`, the warnings of `soujo next check` included, so that a line copied out of a terminal carries no user name. The path is recognized in either normalization, with either separator, and in another letter case only where the file system ignores case.
- Temporary files named after a process that is still running are kept: one `soujo` no longer deletes the file another one is writing. A commit made while one is there takes it along, and `log rotate` no longer counts it as an uncommitted change.
- A `PLAN.md` item with an empty layer name or a layer name carrying control characters is refused by `next set` and `layer done` and warned about by `next check`, naming the line to fix. Before, an empty name went through and no command could name it back, and a name with a line separator in it was dropped from the plan without a word.
- `soujo layer done` refuses a layer whose `PLAN.md` item has no completion condition, naming its line, instead of closing it and leaving the `確認:` line of the next `NEXT.md` to be written from nothing. `soujo next check` warns about such a layer, so it is named before the work of the layer rather than after it. An existing `PLAN.md` whose layers have no `— <完了条件>` needs one added before those layers can be closed.
- Checklist items inside a code fence in `PLAN.md` are examples, not layers: a format example written into the plan is no longer counted as a layer, checked by `layer done`, or reported by `next check`. A fence left open, which swallows every layer after it, is refused by `next set` and `layer done` and warned about by `next check`, naming its line, instead of those layers going missing without a word. The hint after a `PLAN.md` problem now says `PLAN.md を直してから`, since not every problem is a layer name.
- A `PLAN.md` layer whose separator has nothing after it (`- [ ] L2 state —`, the usual way a completion condition is forgotten) is read as that layer with no condition, so `layer done` says the condition is missing. Before, the separator became part of the layer name and the command said the layer was not in PLAN.
- `soujo layer done` reports a layer already committed as committed even when its completion condition has since been removed from `PLAN.md`, so that re-running it still points at the commit.
- Characters in the C1 range (U+0080–U+009F), which a terminal decoding Latin-1 takes for escape sequences, are flattened to a space in output and in `LOG.md` lines, as C0 controls and U+2028/2029 already were. The layer names `soujo log add` and `soujo layer done` accept are held to the same range, so one carrying a C1 character is refused rather than written into `LOG.md`.
- A line of inline code (`` ``` `x` ``` ``) no longer opens a code fence in `PLAN.md`, so the layers after it are read as layers: a backtick fence's info string cannot hold a backtick.
- `soujo next check` names a layer name repeated through control characters in the same run as the control characters themselves, instead of only after those are fixed, and its one warning line names the first four problems and counts the rest, instead of growing with every broken line of `PLAN.md`.
- A `## YYYY-MM-DD <layer>` heading written into `LOG.md` by hand with a line separator in its layer name is read as a heading, instead of its lines being taken for the entry before it.
- A path under the home directory is shown as `~` even when a control character is inside it or right after it, on stderr and in the `--hook` line as well as on stdout. Before, the line was flattened (a home directory holding a tab kept its full path) or encoded as JSON (the `--hook` warning of `next check`) before the path was looked for.
- `soujo next show` adds one line naming the problems of an invalid `NEXT.md` after the file's lines, with `--hook` as well. Before, the SessionStart hook put an invalid `NEXT.md` into the session as if it could be resumed from, and only `soujo resume` or `soujo close` said otherwise. It also prints the lines the 5-line limit counts, so a blank line at the end is shown as the line the warning names, and a `NEXT.md` that is there but empty gives that warning instead of `NEXT.md なし`, which now means only a missing file.
- `soujo next check` warns when the `確認:` of `NEXT.md` is not the completion condition `PLAN.md` gives that layer, so a condition changed in the plan after `soujo next set` is seen before the layer is closed against the old one. Whitespace runs compare equal, and nothing is compared for a phase, a layer missing from or repeated in PLAN, a layer with no condition, or a layer already done or reached too early, whose own warning is the one to act on. The `plan` skill now runs `soujo next check` after rewriting `PLAN.md`.
- A `NEXT.md` or `PLAN.md` that cannot be read is one warning of `soujo next check` among the others, as an unreadable `LOG.md` already was, instead of replacing every other warning with `確認できない: …`.
- `soujo log rotate` refuses an archive new since HEAD whose text before its entries is not the `# LOG YYYY-MM` heading it writes, instead of taking a file written by hand for a stopped rotate's work and committing it as `log: rotate`.
- `soujo map code` reads a `/` after a block — a function or class declaration's body, an `if` or loop body — as a regular expression, so an `import` or `from` written inside one is no longer drawn as an edge, and keeps it a division after an object literal, a type, or a function or class expression. Which one a `{` opens is judged from the token before it, so a block after a label or a `case` is still read as an object literal.
- A line comment in `soujo map code` ends at a carriage return, U+2028, or U+2029 as well as a line feed, so a file whose lines end with CR no longer loses every import after its first `//`. A regular expression literal ends at all four as well, a backslash before one included, and a `'…'` or `"…"` left unterminated ends at a carriage return.
- White space above ASCII (a no-break space, an ideographic space) separates words in `soujo map code` instead of joining what follows, so `import` and `from` are found when one stands between them. Letters above ASCII still hold a name together, so `モジュール.import('./a.js')` is still skipped as a member call.
- `soujo map code` reads a JSX element as an element in `.tsx`, `.jsx`, `.js`, `.mjs`, and `.cjs`; in every other extension `<x>` is a type. Its text and its quoted attribute values hold no code, so `<p>from './a.js'</p>` is no longer drawn as an edge and an apostrophe in the text (`<p>don't</p>`) no longer starts a string that swallows what follows. What a `{ }` inside an element holds is still read as code, and two of them are kept apart, so `<p>{require}{'./a.js'}</p>` is no edge either. A tag is read on through its type arguments (`<Box<T>>`), a comment, and an element written straight as an attribute's value (`icon=<Icon/>`). Value and type positions are not told apart, so a generic function type where a value can start (`type X = <T>(a: T) => T`) is read as an element; since nothing closes it, once the file ends it is read again as code from its `<`, with the elements left open inside it, while an element in whose `{ }` it stands is kept and may still close. What cannot be in a tag (`<T,>(x) => x`) is read again as code too. Each `<` is read again only once, and a file that would need more of it read twice than it is long is read to its end without elements. A `(` or a `function` outside a template's `${ }` or an element's `{ }` is no longer closed, or given its body, by the code inside it.
- `soujo map code` resolves a specifier written as a URL: it is cut at its first `?` or `#`, whichever comes first, and the percent escapes of what is left are decoded, so `./a.js?raw`, `./a.js#frag`, and `./caf%C3%A9.ts` are drawn as edges to the files they name. The text as written is tried after the decoded one, so a file really named `d%2Ee.js` is found as well as one named `d.e.js`.
- Paths are compared as the file system holding the scanned files compares them, asked once per run of a file that was scanned: always in NFC, since a file system may hand back either normal form for one name, and in one letter case only where it folds case (where that cannot be measured, the platform decides). An extension is swapped for another only where it is written as TypeScript writes it, so `./dep.TS` no longer names `dep.ts`. Before, every path was compared in lower case: `./State.js` was drawn as an edge to `state.ts` everywhere, so a graph drawn on macOS held edges the same checkout does not have on Linux, and a name macOS stores decomposed was never found by a specifier written composed.
- `soujo map code` scans at most 524288 bytes (512 KiB) of a file, reading one more to tell a file at the limit from one beyond it, and counts the files it had to cut, instead of holding whole files in memory: a generated bundle or a large data file no longer decides how much memory the command takes. A cut file is scanned only to its last complete line, since the cut lands where the byte count falls — inside a character (which then reads as U+FFFD) or inside a token, where half of an `import './dependency.js';` would otherwise be drawn as an edge to `dep.ts`.
- The `review` skill hands `soujo:reviewer` the range to review instead of a copy of its diff, and the reviewer takes the diff itself when it starts, since the working tree moves on after the hand-over and a copy made then can be older than the files it reads.
- The `review` skill no longer stops when `soujo` is missing, since it runs none, and the `map` skill stops only for `plan` and `code`.
- The `review` and `map` skills say which diff they take when given no range and no `layer:` commit exists: from the parent of the oldest `wip:` commit, or from HEAD when there is none, so a repository that adopted Soujo is not reviewed from its first commit. With a `layer:` commit, the diff now starts before the oldest `wip:` commit of that layer, so the part of a layer that `soujo close` committed is reviewed with the rest. Only commits changing the project count.
- The `コミット:` line of `soujo resume` shows the last commit changing the project, as `brief` counts it, instead of HEAD, which could be another project's commit or an empty one; `まだない` before the project's first. `layer done` lists only the project's added files.
- `soujo close` refuses a `PLAN.md` that `layer done` refuses (a code fence left open, an empty, repeated, or control-character layer name, a layer named like a phase or `節目`), and `soujo resume` shows `次: 不明（PLAN.md が無効: …）` for it, instead of naming a layer picked by position or a stopped `layer done` that would be refused. Before, `close --note` failed on a layer name with control characters while `close` without a note committed it as the `wip:` subject.
- A `NEXT.md` value with a tab or another control character inside is invalid, and `soujo next set` refuses one, even while `PLAN.md` has no layers: `次:` becomes the subject of a `wip:` commit.
- `soujo map code` writes `]` and the backtick in a file name as entity codes, so a file named `a].ts` no longer closes its Mermaid node early.
- `layer done`, `close`, and `log rotate` commit nothing while a changed `SPEC.md` is not staged as written (skip-worktree), as for PLAN, LOG, and NEXT, instead of leaving the change out of the commit without a word.
- An unresolved conflict elsewhere in the repository (after a conflicting `git stash pop` in another project, say) no longer refuses `layer done`, `close`, and `log rotate`, which git itself would commit; conflicts in the project still refuse.
- `N日ぶり` of `resume` and `空白` of `brief` count calendar days in local time, the dates they print, instead of whole 24-hour periods: a commit at 23:00 is 2 days before 01:00 the day after next.

### Changed

- `layer done`, `close`, and `log rotate` refuse, before writing anything, an untracked file that git does not ignore and whose name is a credential file's (`.env` and `.env.*` other than `.env.example`, `.npmrc`, `.netrc`, `.git-credentials`, `auth.json`, SSH keys, `*.pem`, `*.key`, …, in any letter case where the file system ignores case), since they stage the whole project. Add it to `.gitignore`, or `git add` it first to commit it.
- Outside a git repository `.soujo/` is looked for in the current directory only, where `soujo init` creates it, so a `.soujo/` made in the home directory is no longer the project of every directory below it.
- The uncommitted count of `resume` and `next check` reads at most 16 MiB of `git status` output and then says `N件以上`.
- `soujo map code` says in its first note when it read a directory outside the project, judged by real paths so that a symlink leading out counts, and the `map` skill passes one only when the user names it.
- Commits keep running the repository's git hooks; SPEC §14 now records why.
- The `CLAUDE.md` template quotes the note of `soujo close` in single quotes, as `AGENTS.md` and the `close` skill do.
- `test/privacy.test.ts` checks every version of a file and every commit and tag message that a ref reaches (a branch, a tag, a remote-tracking branch, the stash), not only the tracked files and the commit messages on HEAD, and catches links to Codex cloud tasks and to ChatGPT conversations and shared chats. It scans itself too: instead of the whole file, only the made-up values of its own fixtures are let through.
- `test/docs.test.ts` compares `SPEC.md` with `SPEC.ja.md` as well.
- `npm test` hands the test files to `node --test` itself (`test/run.ts`) instead of through a glob, which `cmd.exe`, where npm runs scripts on Windows, does not expand and Node 20 does not take.
- SPEC, CLAUDE.md, AGENTS.md, and CONTRIBUTING state the boundary between `src/` and the skills in the same words, which `test/skills.test.ts` checks: judgment, formatting, and checks that are mechanically determined live in `src/`, while dialogue, diagrams the model draws, and review, choosing its diff included, are written in the skills. Before, they said all logic lives in `src/`, which the `review` and `map` skills did not follow.

## 0.3.1 — 2026-09-15

Release: [v0.3.1](https://github.com/SilentMalachite/Soujo/releases/tag/v0.3.1).

### Changed

- When the `再開:` line of `soujo resume` ends with `・N日ぶり: 先に soujo brief`, the `resume` skill also runs `soujo brief` and returns its five lines after the four lines. Before, it returned only the four lines, and the model or you had to run `soujo brief` as a second step.
- The `go` skill and the `CLAUDE.md` / `AGENTS.md` that `soujo init` writes no longer have the model run `soujo brief` inside `go`; `soujo brief` belongs to the `resume` skill. Before, the templates said to run `soujo brief` first whenever `再開:` pointed to it.

## 0.3.0 — 2026-09-15

Release: [v0.3.0](https://github.com/SilentMalachite/Soujo/releases/tag/v0.3.0).

### Added

- `soujo brief` prints five lines for returning after days or weeks away, derived from the records without writing anything: PLAN progress with the last `layer:` commit, the commits after it, the last `節目` entry of `LOG.md`, the days since the last commit, and the next step as `soujo resume` shows it. An unreadable file or a git failure degrades only its line.
- `soujo resume` ends `再開:` with `・N日ぶり: 先に soujo brief` when the last commit is 3 or more days old.

### Changed

- The `spec` skill, the `plan` skill when it adds layers, and the `go` skill that finishes the last layer (before its `next set`) write a `節目` entry to `LOG.md` (what ended, what is open), which `soujo brief` shows.
- `soujo next set` and `soujo layer done` refuse, and `soujo next check` warns about, a PLAN layer named `節目`, as for `spec` / `plan`.
- `soujo` refuses to run inside a host's plugin directory, where the real path of the current directory has `.claude/plugins` or `.codex/plugins` in any letter case, a copy of Soujo or not: `soujo next check` and `soujo next show --hook` behave as outside a Soujo project and print nothing, and every other command but `--help`, `soujo next show` without `--hook` included, exits 1 with one line before reading or writing anything. Before, a model that moved into the installed copy of Soujo got this repository's records from `soujo resume`, and `soujo init` or a commit landed in the copy.
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
