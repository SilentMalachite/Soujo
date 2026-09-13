---
name: map
description: "Soujo の計画・コードの依存・直近の差分を図で示すときに使う。"
---

## 読むもの
- `soujo`（PATH 上のコマンド）・git・`.soujo/` は作業中のプロジェクトのもの。スキルの置き場所へ cd したり、そこの `.soujo/`・`dist/` を使ったりしない。`soujo` が見つからなければ止めて1行で伝える。
- `diff` のときだけ：引数の範囲、なければ最新の `layer:` コミットの親から作業ツリーまでの差分（未追跡のファイルも含む。親がなければ最初から）と、それが触るファイルの周辺。

## やること
- 引数は `plan`（省略時）/ `code [dir]` / `diff [範囲]`。`plan` と `code` は CLI の図をそのまま示し、書き換えない。
- `diff` は変わった部分の構造を Before/After の ASCII 図で自分で描く。色に意味を持たせない。
- Mermaid は `mermaid` のコードブロックで囲む。図が画面1枚を超えるなら、`code <dir>` で絞れると1文添える。

## soujo に頼むこと
- `plan`：`soujo map plan`
- `code`：`soujo map code [dir]`
- `diff`：`soujo` は呼ばない。

## 出力の形
- 図＋説明5行以内。
