# 変更履歴

[English](CHANGELOG.md) | **日本語**

英語版が正本で、このページはその翻訳。版の付け方は[セマンティック バージョニング](https://semver.org/lang/ja/)に従う。

## 0.1.2 — 2026-09-15

リリース：[v0.1.2](https://github.com/SilentMalachite/Soujo/releases/tag/v0.1.2)。

### 修正

- `soujo layer done` と `soujo close` は、失敗した実行の LOG エントリを `LOG.md` のどこにあっても見つける。これまでは、その後ろに（`soujo log add` などで）エントリが足されたり古いエントリが直されたりすると、再実行で層を二重に記録した。
- `soujo layer done` は `中断:` で始まる `--note` を拒否する（`close` だけが書く形）。これまでは再実行でその完了エントリを中断の記録とみなし、層を再び記録した。
- `soujo init` も、中断された書き込みが残した一時ファイルを消す（`.soujo/` に書くほかのコマンドと同じ）。
- `soujo map code` は、`</` の形でない `<` の後と、`for await (...)` の条件の後を正規表現として読む。これまではその正規表現の中の `import(...)` を線にすることがあった。

### 変更

- `test/privacy.test.ts` が許す `git@`・`noreply@` のアドレスを `git@github.com` など特定のものに限り、`.gitignore` は `.netrc`・`_netrc`・`.git-credentials`・FIDO の SSH 鍵（`id_ed25519_sk`・`id_ecdsa_sk`）も無視する。
- README に、Codex と同じく Claude Code を GitHub からのインストールへ戻す方法を載せた。
- SPEC：`spec` / `plan` の `next set` が拒否するのは `high` 以外の `--effort` だと明記し（表現のみ）、受け入れ基準9のテスト数を L12 時点の記録とした。

## 0.1.1 — 2026-09-14

リリース：[v0.1.1](https://github.com/SilentMalachite/Soujo/releases/tag/v0.1.1)。

### 修正

- `soujo close` は、`PLAN.md`・`LOG.md`・`NEXT.md` が書いたとおりにステージされていない（skip-worktree など）間は何もコミットしない（`layer done` と同じ）。これまでは「中断」エントリのない、または古い `NEXT.md` の `wip:` コミットを残すことがあった。
- `soujo next set` と `soujo log add` は、中断された書き込みが残した一時ファイルを消す。これまでは `layer done` か `close` まで未追跡のまま残り、後の書き込みを妨げることがあった。
- `go` スキルは `次: plan` の場合を先に示す。`next set` が CLI に拒否される `--effort` 付きで写されないため。

### 変更

- `test/privacy.test.ts` はコミットメッセージ（CI は全履歴を取得する）、末尾に区切りのないホームパス、SSH 鍵のファイルも検査し、`.gitignore` は SSH 鍵を無視する。`git@github.com` のような SSH のリモートと `.env.example` は検出・無視の対象から外した。

## 0.1.0 — 2026-09-14

最初のリリース：[v0.1.0](https://github.com/SilentMalachite/Soujo/releases/tag/v0.1.0)。

### 追加

- `soujo` CLI（Node 20 以上、実行時依存なし）：`init`、`next show` / `set` / `check`、`plan list` / `next`、`log add`、`layer done`、`resume`、`close`、`map plan` / `code`、全体・1コマンド・1語目で始まるコマンドの `--help`。コマンドなし・不明なコマンドのエラーは `soujo --help` を案内する。
- Claude Code と Codex で共有する7スキル（`spec`・`plan`・`go`・`resume`・`map`・`review`・`close`）と、Claude Code のサブエージェント `soujo:reviewer`。
- Claude Code のフック：SessionStart で `NEXT.md` を文脈に入れ、Stop で再開できない状態を警告する。
- 中断に耐える記録：`layer done` と `close` は、merge・rebase・cherry-pick・revert の途中、競合が未解決、または git が記録を取りこぼすときにコミットを拒否する。失敗後の再実行は止まったところから続き、`.soujo/` への書き込みはプロジェクトの外に出ない。
- 両ホストのプラグインマニフェストとマーケットプレイス（CLI とともに GitHub から直接入れられる）、`soujo init` 用の `templates/`（Opus 5 向け CLAUDE.md、GPT-6 Astra 向け AGENTS.md）。
- プロジェクトの文書と設定：英語（正本）と日本語の CONTRIBUTING・SECURITY・CODE_OF_CONDUCT、Issue フォーム、プルリクエストのテンプレート、Node 20・22・24・26 で `npm test` を実行する CI、固定したアクションと devDependencies を更新する Dependabot。
