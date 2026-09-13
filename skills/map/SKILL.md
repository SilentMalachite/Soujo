---
name: map
description: "Soujo の計画・コードの依存・直近の差分を図で示すときに使う。"
---

## 読むもの
- `.soujo/`・`soujo`・git は作業中のプロジェクトのもの。このスキルの置き場所へ cd したり、そこのファイルを読んだりしない。
- `diff` のときだけ `git diff HEAD`（空なら `git diff HEAD~1 HEAD`）。

## やること
- 引数は `plan`（省略時）/ `code [dir]` / `diff`。
- `plan` と `code` は CLI の図をそのまま示し、書き換えない。
- `diff` は変わった部分の構造を Before/After の ASCII 図で自分で描く。色に意味を持たせない。

## soujo に頼むこと
- `plan`：`soujo map plan`
- `code`：`soujo map code [dir]`（`diff` では呼ばない）

## 出力の形
- 図＋説明5行以内。
