---
name: go
description: "Soujo の .soujo/NEXT.md が指す層を実装し、次の NEXT.md を書いてコミットまで締めるときに使う。"
---

## 読むもの
- `.soujo/`・`soujo`・git は作業中のプロジェクトのもの。このスキルの置き場所へ cd したり、そこのファイルを読んだりしない。
- `.soujo/NEXT.md` → `.soujo/SPEC.md` → `.soujo/PLAN.md` の該当層の行。
- `次:` が `spec` / `plan` なら、ここで spec / plan スキルに切り替える。

## やること
- `effort:` の深さで、PLAN の完了条件を満たすまで確認を挟まずに実装する。層の範囲を広げない。
- 満たしたら、**先に**次の層の `NEXT.md` を書き、その後に層を締める。次の層は PLAN の次の未完了の層、なければ `plan`。
- 途中で止まるなら `close` スキルに切り替える。

## soujo に頼むこと
- `soujo next set --layer "<次の層>" --premise "<この層で済んだこと>" --check "<次の層の完了条件>" [--caution "<注意>"] [--effort <low|medium|high|xhigh>]`
- `soujo layer done "<この層>" --note "<1〜3行>"`
- 拒否やエラーはその1行に従って原因を直し、同じコマンドを再実行する（記録は重複しない）。

## 出力の形
- 結果1文＋変更ファイル一覧。
