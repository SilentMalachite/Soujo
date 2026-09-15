---
name: plan
description: "Soujo の .soujo/SPEC.md を30分以内の層に分け、.soujo/PLAN.md を書くときに使う。"
---

## 読むもの
- `soujo`（PATH 上のコマンド）・git・`.soujo/` は作業中のプロジェクトのもの。スキルの置き場所へ cd したり、そこの `.soujo/`・`dist/` を使ったりしない。`soujo` が見つからなければ止めて1行で伝える。
- `.soujo/SPEC.md` と既存の `.soujo/PLAN.md`（完了済みの層はそのまま残す）。

## やること
- SPEC の未実装を、中断なしで30分以内に終わる層に分けて依存順に並べる。未完了の層は最大12。未実装が残っていなければ層を足さず、そう1文で伝えて終える。
- `PLAN.md` に1層1行 `- [ ] <層名> — <完了条件>` で書く。完了条件は、満たしたかを判定できる1文にする。
- 層名は英数字の短い名前（例：`L3 auth`）。` — `・` - ` のような区切りや引用符を含めず、PLAN の中とも過去の `layer:` コミットとも重複させず、`spec` / `plan` にも、LOG の節目と紛れる `節目` にもしない（CLI が拒否する）。

## soujo に頼むこと
- 層を足したら節目を残す：`soujo log add '節目' --line 'PLAN.md に <N>層: <最初の層>〜<最後の層>' --line '外したもの: <SPEC から外したこと。なければ なし>'`（1行目は `soujo brief` に出る。後のコマンドが失敗しても繰り返さない）。
- 未完了の層があり、`次:` がその最初の層でなければ `soujo next set --layer '<その層名>' --premise 'PLAN.md 作成・更新' --check '<その層の完了条件>' --effort <low|medium|high|xhigh>`（effort はその層の難しさで選ぶ）。
- `soujo map plan`

## 出力の形
- `soujo map plan` の図をそのまま示す。補足は1文まで。
