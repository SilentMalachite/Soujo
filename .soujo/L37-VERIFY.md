# L37 converge-verify — 手順と進み具合

完了条件（PLAN L37）: 既存プロジェクトの複製で両ホストが go → converge（差を層に）→ go → converge（収束）を回し、`$converge` が組み込みと衝突せず、SPEC(+ja) §12 の基準11・12 が ✓。
中断したら、チェックのない最初の手順から再開する。作業場所 `$W` はセッションのスクラッチ領域の `l37/`（消えていたら手順1から作り直す）。

## 調べて分かったこと（graphify・Serena）

- 基準11の CLI 側は `validateSpec`（`src/state.ts`）→ `specProblems`（`src/commands/next.ts`）。原則 >7 行・形の崩れ・キーなしの基準・キー重複を警告し、拒否しない。
- converge の書き先は PLAN・LOG・NEXT だけ（`skills/converge/SKILL.md`）。go は最後の層で 節目 → `next set --layer converge` → `layer done` → converge へ切り替え（`skills/go/SKILL.md`）。
- 両ホストの soujo は GitHub（`SilentMalachite/Soujo`）から入っており、origin/main は `9d64e73`（L35 より前）。ローカルの main は14コミット先。
- Codex の組み込みスキル（`~/.codex/skills/.system`）は imagegen / openai-docs / plugin-creator / review-agent / skill-creator / skill-installer で、`converge` はない。

## 流れ

```
base(AgentReview 0.4.0 の複製)
  init → spec(Claude) → plan(Claude, 2層) → go L1(Claude) → SPEC に基準を1つ手で足す（差の種）
  ├─ cp → claude/ : resume → go(L2→converge: 差を層L3に) → go(L3→converge: 収束, 次: plan)
  ├─ cp → codex/  : $resume → $go(同上) → $go(同上)
  └─ cp(codex の最後) → codex-x/ : $converge を明示して soujo:converge に解決されるか
```

## 手順

- [x] 1. 前提: `npm test` 通過・`dist/` 最新・`soujo` が本リポジトリの `dist/cli.js`
- [x] 2. 両ホストのプラグインを L36 の版に入れ直す（方法はユーザーの選択）。Claude で `soujo:converge` が見える
- [x] 3. base: `git clone` → `soujo init` → spec（`claude -p` + `--resume`）→ 基準11の形を確認（原則 ≤7・`P<n>`/`A<n>`・`next check` 警告なし）
- [x] 4. base: plan → go L1 → SPEC に `A<n>` を1つ足してコミット → claude/・codex/ に複製
- [x] 5. claude/: resume → go → go。各回の後に PLAN 末尾の層（キー付き）・LOG の節目・NEXT・`layer:` コミットを確認。入力トークンを記録
- [x] 6. codex/: `codex exec -s workspace-write --add-dir <.git>` で $resume → $go → $go。同じ確認。go が converge へ切り替えなければ `$converge` を別に走らせ、その旨を記録
- [x] 7. codex-x/: `$converge` がどのスキルを読んだか（トランスクリプト）と出力を確認
- [x] 8. 基準11の警告: 複製に崩れた SPEC（原則8行・キーなし基準・重複キー）を置き `soujo next check` が警告して終了0
- [x] 9. SPEC(+ja) §12 の冒頭文・基準11・12 を ✓ に、§14 の「L37 で確かめる」を結果で置き換え → `npm test`
- [x] 10. 締め: 節目 → `next set --layer converge` → `layer done 'L37 converge-verify'`

## 結果

（手順ごとに1行ずつ追記）
- 1: npm test 414件（pass 413・skip 1）。PATH の soujo は 9/16 に `npm i -g` した古いコピー（converge を知らない）だったので `npm link` し直し、本リポジトリの dist/cli.js に解決。
- 2: ユーザーの選択で main を push（9d64e73..d582448）。Claude は marketplace update → plugin update で d58244824a95、Codex は marketplace upgrade → plugin add で 0.3.2（marketplace は d582448）。両キャッシュに skills/converge がある。
- 3: spec は1セッション8往復（`--resume`）で7問、毎回1問。原則 P1〜P4（形どおり）・基準 A1〜A5、`next check` は SPEC の警告なし（未コミットの警告だけ）。Q5 で P2 と要件の食い違いを番号付きで1問聞いた。
- 4: plan は4層（L1 version source / L2 version flag / L3 readme / L4 changelog、A1〜A5 を網羅）。base で L1〜L3 を各新セッションの go で締め（全テスト通過）、`.soujo/SPEC.md` に A6（`-V`）を手で足して `docs:` コミット → claude/・codex/ に複製。最後の層は L4。
- 5a claude/ 1巡目: resume（新セッション）は `次: L4 changelog`・`再開: /soujo:go`。go（新セッション, 35ターン）が L4 を締め（節目 → next set converge → layer done、`layer: L4 changelog`）、converge に切り替わって A6 missing → `L5 short flag …（A6 missing）` を末尾に追加、節目 `converge: 差 A6・PLAN.md に 1層を追加`、NEXT は L5。未決に A6 と P2 の食い違い・unrequested（CLAUDE.md の同梱）。入力 cache_read 1.23M / cache_create 50K / out 12.7K（go+converge 合計）。
- 6a codex/ 1巡目: $resume は同じ4行（soujo:resume の SKILL.md を読んだ）。$go（go と converge の SKILL.md を読んだ）が L4 を締めて converge に切り替わり、A6 missing → `L5-version-alias …（A6 missing）`、節目は3行目に met の一覧。NEXT は L5、注意に P2 との整合。入力 691K（cached 641K）/ out 4.6K。
- 5b claude/ 2巡目: go（新セッション）は L5 の前に P2（と P4）との食い違いを番号付き2案で1問聞いて止まり、`--resume` で「1」→ SPEC の P2・P4 に `-V` を足し、L5 を締め（`layer: L5 short flag`）、converge で収束: 節目 `converge: 収束（A1–A6・P1–P4）`、NEXT は `次: plan`（effort high）、PLAN は変更なし。未決に unrequested として soujo init の CLAUDE.md（L1 コミットに同梱）。2回分で cache_read 2.15M / out 24.5K。
- 6b codex/ 2巡目: $go が同じく P2 との食い違いを1問聞いて止まり、`codex exec … resume <id> '1'`（exec 側の -s・--add-dir を付けて）で続行 → SPEC の P2 に `-V` の例外、L5 を締め（`layer: L5-version-alias`）、converge で収束: 節目 `converge: 収束（A1 … P4）`、NEXT は `次: plan`（effort high）、PLAN は変更なし、未コミットは LOG・NEXT だけ。resume 後の入力 1.02M（cached 965K）/ out 5.1K。Codex は ~/.codex/skills/graphify も読んだ（利用者の全体設定。soujo と無関係）。
- 7 codex-x/: `$converge` は `cache/soujo/soujo/0.3.2/skills/converge/SKILL.md` を読んだ（Codex の組み込みに converge はない）。収束済みの状態から、新しい差 P4 contradicts（コピー設置の `--version` 起動で `.pyc` が12個書かれる。テストは環境変数で抑えていて気づけない）を再現して `L6-version-no-write …（P4 contradicts）` を追加。前回の converge は P4 met としていた = 判定は回ごとに揺れる。入力 488K（cached 443K）/ out 4.2K。
- 8 spec-bad/: 原則9行（うち1行は形の崩れ）・A6 の重複・キーのない基準で `soujo next check` が「原則が7行を超えている（9行）/ 14行目が原則の形でない / 35行目の A6 が重複 / 36行目にキーがない / ほか1件」と警告して終了0。`soujo resume` はそのまま動く。
- 9: SPEC(+ja) §12 の冒頭文・L37 の箇条・基準11・12 を ✓、§14 に `$converge` の決定と、文脈量・判定の揺れ・unrequested の CLAUDE.md を未決として追加。
- 10: 節目 → `next set --layer converge` → `layer done`。
