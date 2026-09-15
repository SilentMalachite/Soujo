# PLAN

- [x] L1 scaffold — git init・package.json(bin soujo・依存ゼロ)・tsconfig×2・.gitignore・LICENSE(0BSD)・cli.ts 骨組みが揃い、npm run build と npm test が通る
- [x] L2 state — state.ts の公開9関数(parseNext〜formatDate)が揃い、各関数に通るテストが1本以上ある
- [x] L3 io — files.ts(.soujo/ 上方探索・読み書き)と git.ts(toplevel/status/add/commit/log -1)が一時ディレクトリのテストで通る
- [x] L4 init-plan-log — templates/ が揃い、init(git トップレベル・上書きしない)・plan list/next・log add がテストで通る
- [x] L5 next — next show/set/check が --hook を含めテストで通り、check は常に終了0・Soujo 外では無音
- [x] L6 layer-done — layer done が PLAN→LOG→commit を行い、不正入力で無書込・コミットだけ再試行・コミット済み拒否がテストで通る
- [x] L7 resume-close — resume が4行を出し、close が NEXT 無効で終了1・中断ログ・wip コミットを行うことがテストで通る
- [x] L8 map — map plan の縦 ASCII 図と map code の Mermaid(TS/JS)・未対応言語のディレクトリ木がテストで通る
- [x] L9 skills — skills/ 7本(frontmatter は name/description のみ・4節×各3行以内)と agents/reviewer.md が揃う
- [x] L10 hosts — 両マニフェスト・両マーケットプレイス・hooks.json が揃い、claude plugin validate . と validate_plugin.py が通る
- [x] L11 docs — README/CHANGELOG(+.ja.md)が揃い、npm link 後に soujo が PATH から呼べる
- [x] L12 accept — 既存 Python プロジェクトの複製で Claude Code→Codex→Claude Code を通し、受け入れ基準1〜10を LOG に記録
- [x] L13 help — SPEC §6 の --help 行（全コマンド・1コマンド・2語コマンドの1語目・-h・-- の後と --x=--help は対象外・--hook 付きでも使い方・書き込みコマンドでも何も書かない・エラーの案内）がテストで通り、README・CHANGELOG(+.ja) に載る
- [x] L14 effort — next set --layer spec/plan（前後の空白付きを含む）が effort 省略で high を書き、ほかの effort を何も書かずに拒否することがテストで通り、spec・go スキルの plan 行きの next set が --effort を付けない（go の節は3行のまま）
- [x] L15 log-rotate — log rotate が当月より前（--before 指定可）のエントリを日付の月ごとに LOG-YYYY-MM.md へ移して先頭部分と最後のエントリを残し log: rotate でコミットし、汚れたツリー・不正な --before で無書込・移動なしで終了0、next check が rotate で2か月分以上移せるとき警告することがテストで通り、README・CHANGELOG(+.ja) に載る
- [x] L16 brief — soujo brief が SPEC §6 の5行（進捗・以後・節目・空白・次）を記録から導出し、git なし・LOG なし・NEXT 無効でその行だけ縮退することがテストで通り、resume の 再開: が最終コミットから3日以上で `・N日ぶり: 先に soujo brief` を付け、README(+.ja)・CHANGELOG(+.ja) に載る
- [ ] L17 milestones — spec・plan・go スキルがフェーズの区切りに `soujo log add 節目` を書き（各節は3行以内のまま）、plan スキルが層名を 節目 にしないと言い、templates/CLAUDE.md・AGENTS.md と README(+.ja) が節目と brief に触れ、skills テストが通る

