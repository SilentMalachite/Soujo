---
name: plan
description: "Soujo の .soujo/SPEC.md を30分以内の層に分け、.soujo/PLAN.md を書くときに使う。"
---

## 読むもの
- `.soujo/`・`soujo`・git は作業中のプロジェクトのもの。このスキルの置き場所へ cd したり、そこのファイルを読んだりしない。
- `.soujo/SPEC.md`。既存の `.soujo/PLAN.md` があれば、完了済みの層はそのまま残す。

## やること
- SPEC を1層30分以内に分け、依存順に並べる。最大12層。
- `PLAN.md` に1層1行 `- [ ] <層名> — <完了条件>` で書く。完了条件は、満たしたかを判定できる1文にする。
- 層名は短く重複させない（コミットメッセージ `layer: <層名>` になる）。

## soujo に頼むこと
- `soujo next set --layer "<最初の未完了の層>" --premise "PLAN.md 作成" --check "<その層の完了条件>" --effort <low|medium|high|xhigh>`（effort はその層の難しさで選ぶ）。
- `soujo map plan`。

## 出力の形
- `soujo map plan` の図をそのまま示す。補足は1文まで。
