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
- [ ] L11 docs — README/CHANGELOG(+.ja.md)が揃い、npm link 後に soujo が PATH から呼べる
- [ ] L12 accept — 既存 Python プロジェクトの複製で Claude Code→Codex→Claude Code を通し、受け入れ基準1〜10を LOG に記録
