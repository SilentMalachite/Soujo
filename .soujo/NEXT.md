次: L11 docs
前提: L10 hosts 完了（両マニフェスト・両マーケットプレイス・hooks.json・test/hosts.test.ts）
確認: README/CHANGELOG(+.ja.md)が揃い、npm link 後に soujo が PATH から呼べる
注意: dist/cli.js に実行ビットがない（npm link で付くか確認）。Codex は導入時にリポジトリ全体（.git・node_modules・.soujo/）をキャッシュへ複製する
effort: medium
