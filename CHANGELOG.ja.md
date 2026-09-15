# 変更履歴

[English](CHANGELOG.md) | **日本語**

英語版が正本で、このページはその翻訳。版の付け方は[セマンティック バージョニング](https://semver.org/lang/ja/)に従う。

## 0.2.0 — unreleased

### 追加

- `soujo log rotate [--before YYYY-MM]` は、今月（か `--before`）より前の日付の `LOG.md` のエントリを月ごとに `.soujo/LOG-YYYY-MM.md` へ移す。最初のエントリより前の文と最後のエントリは残すので、`soujo resume` の `前回:` はそのまま出る。`log: rotate <月>` でコミットし、ほかの変更が未コミットの間は拒否する。書き込みかコミットに失敗した後の再実行は、エントリを二重に移さずに同じ移動を仕上げる。
- `soujo next check` は `LOG.md` が3か月分以上にわたると警告する。

## 0.1.3 — 2026-09-15

リリース：[v0.1.3](https://github.com/SilentMalachite/Soujo/releases/tag/v0.1.3)。

### 修正

- `.soujo/` のファイルは、書いてよい場所にあるものだけを読む：プロジェクトの外か `.git` の中のファイルへの symlink（ファイルのものも `.soujo/` のものも）を通すとき、または通常のファイルでないときは読まない。これまでは、取得したリポジトリに仕込まれた symlink で、別のファイルが `soujo next show --hook` からセッションの文脈に載ったり `soujo next check` の警告に載ったりし、`/dev/zero` への symlink でフックが固まりえた。
- `soujo init` は、状態ファイルの実体がプロジェクトの外か `.git` の中なら、何も作らずに拒否する。これまでは、symlink の `.soujo/` の先にテンプレートを作った。
- `soujo init` は各ファイルを一時ファイルに書いてから置き先へリンクする。これまでは中断で空や書きかけのファイルが残り、再実行は既存として飛ばした。
- `soujo next set` と `soujo layer done` は、層名が重複するか `spec` / `plan` という層がある `PLAN.md` を拒否し、`soujo next check` はそれを警告する。これまでは同名の2つの層の最初しか締められず、`plan` という層は最後の層の後の手順と取り違えられた。

### 変更

- `soujo init` がどのスタックのプロジェクトにも複製する `templates/CLAUDE.md` と `templates/AGENTS.md` から、Soujo 本体のスタック（TypeScript、コミットする `dist/`）の記述を外した。このリポジトリの写しは末尾の節に残す。以前に導入したプロジェクトの写しはそのままなので、`CLAUDE.md` §6 の「このリポジトリ（Soujo 本体）」の部分と `AGENTS.md` の「本体：」の行は手で消してよい。
- `CLAUDE.md` に `soujo next set` の `--effort` は PLAN の層にだけ付けると書き、`plan` スキルに層名を `spec` / `plan` にしないと書いた。

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
