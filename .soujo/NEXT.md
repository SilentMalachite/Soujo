次: L3 io
前提: L2 state 完了（state.ts 公開9関数とテスト。不正は問題の配列か throw で返す）
確認: files.ts(.soujo/ 上方探索・読み書き)と git.ts(toplevel/status/add/commit/log -1)が一時ディレクトリのテストで通る
注意: L6 まで PLAN/LOG/NEXT は手更新・手コミット。git は execFileSync、テスト用 repo は mkdtemp に作る
effort: medium
