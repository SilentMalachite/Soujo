# セキュリティポリシー

[English](SECURITY.md) | **日本語**

## 対応する版

| 版 | 対応 |
|---|---|
| 最新のリリースと `main` | する |
| それより古いリリース | しない。先に更新する |

## 脆弱性の報告

GitHub で非公開に報告する：[Report a vulnerability](https://github.com/SilentMalachite/Soujo/security/advisories/new)。公開の Issue やプルリクエストは開かない。

影響を受ける版かコミット、ホスト（Claude Code か Codex）とその版、再現手順、攻撃者が得るものを書く。認証情報や非公開のプロジェクトの内容は含めない。

Soujo はひとりで保守しているので、返答までの期限は決めていない。報告にはできるだけ早く返答し、希望がなければ報告者の名前を添えて修正をリリースする。

## 対象

Soujo は、使われるプロジェクトの中で git を実行し、ファイルを書く。次に関する報告が対象：

- プロジェクトの外への書き込み（例：複製したリポジトリの symlink を通じたもの）
- 利用者が意図しないファイルのコミット（`layer done`・`close`・`log rotate` はプロジェクト内の変更をすべてステージし、拒否するのは git に無視されていない認証情報のファイル名の未追跡ファイルだけ。`phase done` は記録と、その symlink の先、`spec` では `soujo init` が置いたまま変わっておらず HEAD にない `CLAUDE.md` / `AGENTS.md` だけをステージし、symlink の先が認証情報のファイル名の未追跡ファイルなら拒否する）
- セッションの開始と終了のたびにプラグインの `node dist/cli.js` を実行する Claude Code のフック
