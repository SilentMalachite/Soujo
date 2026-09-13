次: L4 init-plan-log
前提: L3 io 完了（files.ts: findStateDir/readState/writeState、git.ts: toplevel/status/addAll/commit/lastCommit）
確認: templates/ が揃い、init(git トップレベル・上書きしない)・plan list/next・log add がテストで通る
注意: L6 まで手更新・手コミット。templates の CLAUDE.md/AGENTS.md はルートと同一。log add は1行以上を検査
effort: medium
