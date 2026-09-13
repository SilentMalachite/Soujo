次: L5 next
前提: L4 init-plan-log 完了（init・plan list/next・log add。引数は cli.ts の parseArgs、コマンドは (args, cwd) 関数）
確認: next show/set/check が --hook を含めテストで通り、check は常に終了0・Soujo 外では無音
注意: L6 まで PLAN と NEXT は手更新・手コミット（LOG は node dist/cli.js log add で可）。--hook は {"systemMessage": "..."}
effort: medium
