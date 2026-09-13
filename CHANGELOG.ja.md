# 変更履歴

[English](CHANGELOG.md) | **日本語**

英語版が正本で、このページはその翻訳。版の付け方は[セマンティック バージョニング](https://semver.org/lang/ja/)に従う。

## 0.1.0 — 2026-09-14

最初のリリース：[v0.1.0](https://github.com/SilentMalachite/Soujo/releases/tag/v0.1.0)。

### 追加

- `soujo` CLI（Node 20 以上、実行時依存なし）：`init`、`next show` / `set` / `check`、`plan list` / `next`、`log add`、`layer done`、`resume`、`close`、`map plan` / `code`、全体・1コマンド・1語目で始まるコマンドの `--help`。コマンドなし・不明なコマンドのエラーは `soujo --help` を案内する。
- Claude Code と Codex で共有する7スキル（`spec`・`plan`・`go`・`resume`・`map`・`review`・`close`）と、Claude Code のサブエージェント `soujo:reviewer`。
- Claude Code のフック：SessionStart で `NEXT.md` を文脈に入れ、Stop で再開できない状態を警告する。
- 中断に耐える記録：`layer done` と `close` は、merge・rebase・cherry-pick・revert の途中、競合が未解決、または git が記録を取りこぼすときにコミットを拒否する。失敗後の再実行は止まったところから続き、`.soujo/` への書き込みはプロジェクトの外に出ない。
- 両ホストのプラグインマニフェストとマーケットプレイス（CLI とともに GitHub から直接入れられる）、`soujo init` 用の `templates/`（Opus 5 向け CLAUDE.md、GPT-6 Astra 向け AGENTS.md）。
