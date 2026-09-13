# Security policy

**English** | [日本語](SECURITY.ja.md)

## Supported versions

| Version | Supported |
|---|---|
| Latest release and `main` | Yes |
| Older releases | No; update first |

## Reporting a vulnerability

Report privately through GitHub: [Report a vulnerability](https://github.com/SilentMalachite/Soujo/security/advisories/new). Do not open a public issue or pull request for it.

Include the affected version or commit, the host (Claude Code or Codex) and its version, the steps to reproduce, and what an attacker gains. Leave out credentials and private project content.

Soujo is maintained by one person, so there is no fixed response time. Reports are acknowledged as soon as possible, and a fix is released with credit unless you ask otherwise.

## Scope

Soujo runs git and writes files in the project it is used in. Reports about these are in scope:

- writing outside the project, for example through symlinks in a cloned repository;
- committing files the user did not mean to commit (`layer done` and `close` stage every change in the project);
- the Claude Code hooks, which run `node dist/cli.js` from the plugin at every session start and stop.
