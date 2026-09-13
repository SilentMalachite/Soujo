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
