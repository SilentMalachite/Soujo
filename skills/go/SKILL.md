---
name: go
description: "Soujo の .soujo/NEXT.md が指す層を実装し、次の NEXT.md を書いてコミットまで締めるときに使う。"
---

## 読むもの
- `soujo`（PATH 上のコマンド）・git・`.soujo/` は作業中のプロジェクトのもの。スキルの置き場所へ cd したり、そこの `.soujo/`・`dist/` を使ったりしない。`soujo` が見つからなければ止めて1行で伝える。
- `soujo resume` の4行 → `.soujo/NEXT.md` → `.soujo/SPEC.md` → `.soujo/PLAN.md` の該当層の行。

## やること
- `再開:` が go 以外（layer done の再実行・next set）ならその通りにする。`次:` が `spec` / `plan` ならそのスキルに切り替える。
- PLAN の完了条件までが実装してよい範囲。確認を挟まず、満たすまで続ける（テストが落ちたまま締めない）。途中で止まるなら close スキルへ。
- 満たしたら**先に**次の層の NEXT.md を書き、その後に層を締める。拒否はエラーの1行に従って直し、git に書けなければ権限を求めて、同じコマンドを再実行する。

## soujo に頼むこと
- `soujo resume`
- 最後の層なら `soujo next set --layer 'plan' --premise '<この層で済んだこと>' --check 'SPEC に未実装が残っていない'`（plan の effort は CLI が high にするので `--effort` は付けない）。ほかは `soujo next set --layer '<次の層名>' --premise '<この層で済んだこと>' --check '<次の層の完了条件>' --effort <low|medium|high|xhigh> [--caution '<注意>']`（層名と完了条件は PLAN の行から写し、effort は次の層の難しさで選ぶ）
- `soujo layer done '<この層名>' --note '<1〜3行。改行は引数の中の実際の改行>'`

## 出力の形
- 結果1文＋変更ファイル一覧。
