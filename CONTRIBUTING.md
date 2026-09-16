# Contributing

**English** | [日本語](CONTRIBUTING.ja.md)

Issues and pull requests are welcome in English or Japanese. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening an issue. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

Node.js 20+ and git are needed.

```sh
git clone https://github.com/SilentMalachite/Soujo.git
cd Soujo
npm install
npm run build   # dist/ is committed because hooks call dist/cli.js
npm test        # node:test; also fails when dist/ is stale
claude --plugin-dir .   # try the plugin from the working tree without installing
```

[README.md](README.md#development) shows how to use the working tree as the installed plugin in both hosts.

## Rules

[SPEC.md](SPEC.md) is the specification. A change in behavior updates it in the same pull request, together with [SPEC.ja.md](SPEC.ja.md).

- **No runtime dependencies.** The CLI uses `node:*` only; devDependencies stay `typescript` and `@types/node`.
- **Logic lives in `src/`.** `state.ts` and `map.ts` are pure functions; file and git access stay in the thin `files.ts` and `git.ts`. `skills/*/SKILL.md` only says when to call `soujo` (`test/skills.test.ts` checks the format).
- **Tests use `node:test`.** Run `npm run build` and commit `dist/` with the source change.
- **Documentation is English first.** User documentation (README, SPEC, CHANGELOG, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT) is English with a Japanese translation of the same blocks (`test/docs.test.ts` compares them). Text read at run time — CLI output, skills, templates, CLAUDE.md, AGENTS.md — is Japanese.
- **CLAUDE.md and AGENTS.md differ on purpose.** A rule change edits both, and their copies in `templates/`, which lack only the last section on this repository.
- **Commit messages** are English: `<type>: <description>` with `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, or `ci`.
- **No private data.** Credentials, session links, home directory paths, and personal email addresses never enter files, commit messages, or tag messages (`test/privacy.test.ts` checks the tracked files, and every version of a file and every commit and tag message that a ref reaches).

`.soujo/` holds the maintainer's own Soujo records for this repository; leave it unchanged unless you work with Soujo here.

## Pull requests

Keep one topic per pull request, describe the behavior before and after, and list how you tested it. CI runs `npm test` on Node 20, 22, 24, and 26 on Ubuntu and on Node 24 on macOS for every pull request and every push to `main`; it has to pass. Dependabot proposes monthly updates of the pinned actions and the devDependencies; a TypeScript update passes CI only after `npm run build` and a commit of `dist/` on its branch. The maintainer adds user-visible changes to [CHANGELOG.md](CHANGELOG.md) when releasing; changes listed before that wait under `## Unreleased`, and the version in `package.json` stays that of the last release until then.
