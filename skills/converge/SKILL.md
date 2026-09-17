---
name: converge
description: "Soujo の最後の層の後に、コードを .soujo/SPEC.md の受け入れ基準と原則に照らし、足りない分を .soujo/PLAN.md に層として足すときに使う。"
---

## 読むもの
- `soujo`（PATH 上のコマンド）・git・`.soujo/` は作業中のプロジェクトのもの。スキルの置き場所へ cd したり、そこの `.soujo/`・`dist/` を使ったりしない。`soujo` が見つからなければ止めて1行で伝える。
- `.soujo/SPEC.md` の `A<n>`・`P<n>` の行（キーがなければ受け入れ基準と原則を持つ節）と `.soujo/PLAN.md`。
- コードは作業中のプロジェクトのうち、`layer:` コミットが変えたファイルと、基準の語で検索して見つかる箇所だけ。それより先は読まない。

## やること
- 基準と原則を1つずつ `met`・`missing`・`partial`・`contradicts` に分け、根拠を `path:line` で示す。SPEC も PLAN も求めていないコードは `unrequested`。SPEC とコードは変えない。
- `met` 以外の差のうち、完了条件の末尾に同じキーを持つ未完了の層がないものを、既存の行はそのままに PLAN の末尾へ1差1層で足す：`- [ ] <層名> — <完了条件>（<キー> <種類>）`。原則の違反を先に並べ、未完了の層は最大12。層名は英数字の短い名前で、PLAN の中とも過去の `layer:` コミットとも重複させず、`spec` / `plan` / `converge` / `節目` にしない（CLI が拒否する）。
- `unrequested` と上限を超えた差は層にせず、節目の未決の行に書く（残すか消すかは利用者が決める）。

## soujo に頼むこと
- 差が残れば（未完了の層が扱っていて足さなかった分も含む）：`soujo log add '節目' --line 'converge: 差 <キー>・PLAN.md に <N>層を追加' --line '未決: <unrequested と上限を超えた差。なければ なし>'` → `soujo next check`。その警告が `次:` か `確認:` を指したら `soujo next set --layer '<最初の未完了層>' --premise 'converge で層を追加' --check '<その層の完了条件を PLAN の行から写す>' --effort <low|medium|high|xhigh>`（effort はその層の難しさで選ぶ）→ `soujo map plan`。
- 差がなければ：`soujo log add '節目' --line 'converge: 収束（<照らしたキー>）' --line '未決: <unrequested。なければ なし>'` → `soujo next set --layer 'plan' --premise 'converge で収束' --check 'SPEC に未実装が残っていない'`（plan の effort は CLI が high にするので `--effort` は付けない）。
- 節目は1回だけ残す（1行目は `soujo brief` に出る）。後のコマンドが失敗したら、そのコマンドから再実行する。

## 出力の形
- 差の表 `キー / 種類 / 根拠 / 残り`（`met` 以外を全部。`unrequested` のキーは `—`）。
- 続けて、差が残れば `soujo map plan` の図をそのまま、収束なら `収束: <照らしたキー>` の1行。
