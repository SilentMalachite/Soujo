---
name: converge
description: "Soujo の最後の層の後に、コードを .soujo/SPEC.md の受け入れ基準と原則に照らし、足りない分を .soujo/PLAN.md に層として足すときに使う。"
---

## 読むもの
- `soujo`（PATH 上のコマンド）・git・`.soujo/` は作業中のプロジェクトのもの。スキルの置き場所へ cd したり、そこの `.soujo/`・`dist/` を使ったりしない。コマンドはツール呼び出し1回に1つだけ実行し、`&&`・`;` でつながない（許可リストに拒まれることがある）。`soujo` が見つからなければ止めて1行で伝える。
- `.soujo/SPEC.md` の `A<n>`・`P<n>` の行（キーがなければ受け入れ基準と原則を持つ節）と `.soujo/PLAN.md`。
- コードは作業中のプロジェクトのうち、`layer:`・`wip:` コミットが変えたファイルと、基準の語（識別子にした語も）で検索して見つかる箇所だけ。それより先は読まない。

## やること
- 基準と原則を1つずつ `met`・`missing`・`partial`・`contradicts` に分け、根拠を `path:line` で示す（コードが見つからなければ `missing`）。判定は利用者が実際に動かす経路（コマンド・起動のしかた）で行い、その経路にない環境変数や設定で抑えた振る舞いを `met` の根拠にしない。SPEC も PLAN も求めていないコードは `unrequested`。`soujo init` が置いたファイル（CLAUDE.md / AGENTS.md）と `.soujo/` は `unrequested` に数えない。SPEC とコードは変えない。キーのない SPEC では SPEC での呼び名（節と番号）をキーの代わりにし、節目の未決に「SPEC にキーがない」と書く。
- 差（`missing`・`partial`・`contradicts`）のうち、未完了の層の完了条件では解消しないもの（キーの一致は手がかり）だけを、既存の行は完了・未完了とも書き換えずに PLAN の末尾へ1差1層で足す：`- [ ] <層名> — <完了条件>（<キー> <種類>）`。原則の違反を先に並べ、未完了の層は最大12。層名は英数字の短い名前で、PLAN の中とも過去の `layer:` コミットとも重複させず、`spec` / `plan` / `converge` / `節目` にしない（CLI が拒否する）。
- `unrequested` と上限を超えた差は層にせず、節目の未決の行に書く（残すか消すかは利用者が決める）。

## soujo に頼むこと
- 最初に `soujo next check`。`PLAN.md の`・`PLAN.md を` で始まる警告があれば何も足さず、その警告を伝えて止める。節目は終わり方ごとに1回だけ残し（1行目は `soujo brief` に出る）、後のコマンドが失敗したらそのコマンドから再実行する。節目の `--line` は下に示した2つだけで、キーは行を足さずに1行目の括弧の中へ書く。
- 差か未完了の層が残れば：`soujo log add '節目' --line 'converge: 差（<キー>）・PLAN.md に <N>層を追加' --line '未決: <unrequested と上限を超えた差。なければ なし>'` → `soujo next check`。NEXT.md がない・無効か、`次:` が PLAN の最初の未完了層でないか、警告が `確認:` を指したら `soujo next set --layer '<最初の未完了層>' --premise 'converge で差を確認' --check '<その層の完了条件を PLAN の行から写す>' --effort <low|medium|high|xhigh>`（effort はその層の難しさで選ぶ）→ `soujo map plan`。
- 差も未完了の層もなければ（`unrequested` だけでも）：`soujo log add '節目' --line 'converge: 収束（<照らしたキー>）' --line '未決: <unrequested。なければ なし>'` → `soujo next set --layer 'plan' --premise 'converge で収束' --check 'SPEC に未実装が残っていない'`（plan の effort は CLI が high にするので `--effort` は付けない）。

## 出力の形
- 差の表 `キー / 種類 / 根拠 / 残り`（`met` 以外を全部。`unrequested` のキーは `—`。未完了の層が解消する差は、残りにその層名）。
- 続けて、差か未完了の層が残れば `soujo map plan` の図をそのまま、収束なら `収束: <照らしたキー>` の1行。PLAN.md の問題で止めたら、その警告の1行だけ。
