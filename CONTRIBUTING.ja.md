# コントリビュート

[English](CONTRIBUTING.md) | **日本語**

Issue とプルリクエストは英語でも日本語でも歓迎する。セキュリティの問題は Issue を開かず [SECURITY.ja.md](SECURITY.ja.md) に従う。参加する人は全員[行動規範](CODE_OF_CONDUCT.ja.md)に従う。

## 準備

Node.js 20 以上と git が要る。

```sh
git clone https://github.com/SilentMalachite/Soujo.git
cd Soujo
npm install
npm run build   # フックが dist/cli.js を呼ぶので dist/ はコミットする
npm test        # node:test。dist/ が古いときも落ちる
claude --plugin-dir .   # 導入せずに作業ツリーのプラグインを試す
```

作業ツリーを両ホストの導入済みプラグインとして使う方法は [README.ja.md](README.ja.md#開発) にある。

## 規約

仕様は [SPEC.md](SPEC.md)。動作を変えるときは、同じプルリクエストで [SPEC.ja.md](SPEC.ja.md) とともに更新する。

- **実行時依存を持たない。** CLI は `node:*` だけを使い、devDependencies は `typescript` と `@types/node` のまま。
- **ロジックは `src/` に置く。** `state.ts` と `map.ts` は純粋関数、ファイルと git へのアクセスは薄い `files.ts` と `git.ts` に留める。`skills/*/SKILL.md` には `soujo` をいつ呼ぶかだけを書く（形式は `test/skills.test.ts` が検査する）。
- **テストは `node:test`。** `npm run build` を実行し、ソースの変更と一緒に `dist/` をコミットする。
- **文書は英語が先。** 利用者向けの文書（README・CHANGELOG・CONTRIBUTING・SECURITY・CODE_OF_CONDUCT）は英語で、同じブロック構成の日本語訳を付ける（`test/docs.test.ts` が比べる）。実行時に読まれる文面（CLI の出力・スキル・templates・CLAUDE.md・AGENTS.md）は日本語。
- **CLAUDE.md と AGENTS.md は意図して文面が違う。** 規約を変えるときは両方と、`templates/` の写しを直す。
- **コミットメッセージ**は英語で `<type>: <description>`。type は `feat`・`fix`・`refactor`・`docs`・`test`・`chore`・`perf`・`ci`。
- **私的な情報を入れない。** 認証情報・セッションのリンク・ホームディレクトリのパス・個人のメールアドレスは、ファイルにもコミットメッセージにも入れない（追跡ファイルは `test/privacy.test.ts` が検査する）。

`.soujo/` はこのリポジトリでメンテナーが使う Soujo の記録。ここで Soujo を使って作業するのでなければ変えない。

## プルリクエスト

1つのプルリクエストに1つの話題。変更前後の動作と、どう確かめたかを書く。利用者に見える変更は、リリース時にメンテナーが [CHANGELOG.ja.md](CHANGELOG.ja.md) に載せる。
