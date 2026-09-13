# LOG

## 2026-09-13 plan
SPEC.md から12層に分割し PLAN.md に記録。md 4本のみの状態から作り直す。
L6 完成までは PLAN/LOG/NEXT を手で更新・コミットし、以降は soujo CLI で締める。

## 2026-09-13 L1 scaffold
TypeScript 7.0.2 / @types/node 20。build は dist/、テストは .test-dist/ に出力。
npm test は shell 展開の .test-dist/test/*.test.js を node --test に渡す（Node 20/22 両対応）。
cli.ts はコマンド表を2語→1語の順に引き、例外は stderr 1行・終了1にする。

## 2026-09-13 L2 state
validateNext は問題の配列、parseNext は無効なら undefined、formatNext/markDone/appendLog は不正で throw。
appendLog は 0〜3 行を許す（log add の「1行以上」は L4 で検査）。PLAN は最初の「 — 」で層名と完了条件に分ける。
CRLF の PLAN/NEXT も読め、markDone は改行コードを保つ。

## 2026-09-13 L3 io
writeState は一時ファイル→rename で書き、symlink を保つ。読み書きの失敗は1行の日本語エラーに包む。
git の失敗は stderr 先頭行（なければ stdout 末尾行）で「git <cmd> に失敗: …」。コミットなし・repo 外は undefined。
テスト用 repo は user と commit.gpgsign=false をローカル設定する。

## 2026-09-13 L4 init-plan-log
templates/NEXT.md は「次: spec」の有効な NEXT。templates の CLAUDE.md/AGENTS.md はルートとの一致をテストで守る。
packageDir は package.json を上へ探す（dist/ と .test-dist/src/ のどちらからも templates に届く）。
コマンドは (args, cwd) を取る関数。parseArgs の英語エラーは cli.ts で1行の日本語に訳す。

## 2026-09-13 L5 next
next check は問題を「 / 」で1行に連結し、--hook では {"systemMessage"} にする。予期しない失敗も警告に変えて終了0。
未コミット検査は git 管理下のときだけ。next check は未知の引数を無視する（hook から常に終了0）。
next show --hook はプロジェクト外・NEXT.md なし・読めないときに無音。

## 2026-09-13 review-fix
レビュー #1〜#6 を修正: コマンド表は自身のキーだけ引く / .soujo/ 探索は .git のある階層で止める（SPEC §6 も更新）。
build・test は出力先を消してから tsc / git 呼び出しの maxBuffer を 256MB に。
PLAN の区切りは — に加え – -- - の独立トークンも認める / 末尾空白と区切り判定を線形時間に（trimEnd・トークン分割）。

## 2026-09-13 L6 layer-done
状態は書く前に決める: 件名完全一致でコミット済み→拒否 / PLAN 未チェック→PLAN・LOG・commit / チェック済み未コミット→LOG は最後が同じ層なら足さず commit。
add/commit 失敗は「PLAN と LOG は記録済み。再実行でコミットだけやり直す」を付けて投げる。
この層から soujo CLI 自身で締める。

## 2026-09-13 review-fix-l6
L6 レビュー #1〜#4 を修正: HEAD の PLAN でチェック済みなら別件名でコミット済みとして拒否（やり直しは作業ツリーだけチェック済みのとき）。
merge/rebase/cherry-pick/revert の途中・競合未解決なら拒否。コミット有無は rev-parse --verify で判定し git 失敗は投げる（spawnSync 化）。
layer done の出力に追加ファイルを最大5件添える（ほかN件）。
