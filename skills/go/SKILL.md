---
name: go
description: "Soujo の .soujo/NEXT.md が指す層を実装し、次の NEXT.md を書いてコミットまで締めるときに使う。"
---

## 読むもの
- `soujo`（PATH 上のコマンド）・git・`.soujo/` は作業中のプロジェクトのもの。スキルの置き場所へ cd したり、そこの `.soujo/`・`dist/` を使ったりしない。`soujo` が見つからなければ止めて1行で伝える。
- `soujo resume` の4行 → `.soujo/NEXT.md` → `.soujo/SPEC.md` → `.soujo/PLAN.md` の該当層の行。

## やること
- `再開:` が go 以外（layer done の再実行・next set）ならその通りにする。`再開:` の行末の `日ぶり: 先に soujo brief` には従わない（brief は resume スキルが出す）。`次:` が `spec` / `plan` / `converge` ならそのスキルに切り替える。
- PLAN の完了条件までが実装してよい範囲。確認を挟まず、満たすまで続ける（テストが落ちたまま締めない）。途中で止まるなら close スキルへ。SPEC の原則は完了条件と既存のコードより優先する：原則に反さずには完了条件を満たせないときだけ、どの原則とどう食い違うかを番号付きの候補で1問聞く。
- 満たしたら締める。順は、最後の層なら 節目 → NEXT.md（`次: converge`）→ layer done で、締めたら converge スキルに切り替える。ほかは NEXT.md → layer done。拒否はエラーの1行に従って直し、git に書けなければ権限を求めて、失敗したコマンドから再実行する（成功した log add は繰り返さない）。

## soujo に頼むこと
- `soujo resume`。最後の層の節目は `soujo log add '節目' --line 'PLAN の全層完了: <層で何ができたか>' --line '未決: <残ったこと。なければ なし>'`
- NEXT.md は `soujo next set --layer '<次の層名>' --premise '<この層で済んだこと>' --check '<次の層の完了条件>' --effort <low|medium|high|xhigh> [--caution '<注意>']`（層名と完了条件は PLAN の行から写し、effort は次の層の難しさで選ぶ）。最後の層は `soujo next set --layer 'converge' --premise '<この層で済んだこと>' --check 'SPEC の基準と原則に照らした差が PLAN の層か節目に残る'`（converge の effort は CLI が high にするので `--effort` は付けない）
- `soujo layer done '<この層名>' --note '<1〜3行。改行は引数の中の実際の改行>'`

## 出力の形
- 結果1文＋変更ファイル一覧。
