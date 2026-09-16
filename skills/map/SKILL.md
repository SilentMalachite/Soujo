---
name: map
description: "Soujo の計画・コードの依存・直近の差分を図で示すときに使う。"
---

## 読むもの
- `soujo`（PATH 上のコマンド）・git・`.soujo/` は作業中のプロジェクトのもの。スキルの置き場所へ cd したり、そこの `.soujo/`・`dist/` を使ったりしない。`soujo` が見つからなければ、`plan`・`code` のときだけ止めて1行で伝える。
- `diff` のときだけ：引数の範囲。なければ直近の層の diff（未追跡のファイルも含む）：最新の `layer: <層>` コミットの層の、最も古い `wip: <層>` か `layer: <層>` コミットの親から作業ツリーまで。`layer:` コミットがなければ最も古い `wip:` コミットの親から、それもなければ HEAD から。親や HEAD がなければ最初から。コミットは作業中のプロジェクトを変えたものだけ数える。
- `diff` のときだけ：その diff が触るファイルの周辺。

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
