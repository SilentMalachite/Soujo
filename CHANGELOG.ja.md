# 変更履歴

[English](CHANGELOG.md) | **日本語**

## 0.1.0 — unreleased

最初の版。

- `soujo` CLI（Node 20 以上、実行時依存なし）：`init`、`next show` / `set` / `check`、`plan list` / `next`、`log add`、`layer done`、`resume`、`close`、`map plan` / `code`、全体・1コマンド・1語目で始まるコマンドの `--help`。コマンドなし・不明なコマンドのエラーは `soujo --help` を案内する。
- Claude Code と Codex で共有する7スキル（`spec`・`plan`・`go`・`resume`・`map`・`review`・`close`）と、Claude Code のサブエージェント `soujo:reviewer`。
- Claude Code のフック：SessionStart で `NEXT.md` を文脈に入れ、Stop で再開できない状態を警告する。
- 両ホストのプラグインマニフェストとマーケットプレイス（CLI とともに GitHub から直接入れられる）、`soujo init` 用の `templates/`（Opus 5 向け CLAUDE.md、GPT-6 Astra 向け AGENTS.md）。
