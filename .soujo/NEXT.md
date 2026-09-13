次: L13 help
前提: PLAN.md 作成・更新（SPEC §6/§13/§14 に --help と spec/plan の effort を追記）
確認: SPEC §6 の --help 行（全コマンド・1コマンド・2語コマンドの1語目・-h・-- の後と --x=--help は対象外・--hook 付きでも使い方・書き込みコマンドでも何も書かない・エラーの案内）がテストで通り、README・CHANGELOG(+.ja) に載る
注意: test/cli.test.ts はエラー文言を完全一致で検査。next check は strict:false。README に soujo <command> --help と書くと docs.test が実行して落ちるので実在のコマンドで例示
effort: medium
