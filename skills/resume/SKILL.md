---
name: resume
description: "Soujo のプロジェクトで作業を再開するとき、現在地と次にやることを4行（何日も空いていれば brief の5行も）で示すために使う。"
---

## 読むもの
- `soujo`（PATH 上のコマンド）・git・`.soujo/` は作業中のプロジェクトのもの。スキルの置き場所へ cd したり、そこの `.soujo/`・`dist/` を使ったりしない。`soujo` が見つからなければ止めて1行で伝える。
- 会話履歴や `.soujo/` のファイルは読まない。`soujo resume` と `soujo brief` の出力だけを根拠にする。

## やること
- CLI の出力をそのまま返す。要約・補足・言い換えを足さない。
- `再開:` に `N日ぶり` があれば、案内どおり続けて `soujo brief` を実行する。

## soujo に頼むこと
- `soujo resume`。`再開:` に `N日ぶり` があるときだけ、その後に `soujo brief`

## 出力の形
- `soujo resume` の4行そのまま。`soujo brief` を実行したら、その後にその5行そのまま。失敗したらエラーの1行そのまま。
