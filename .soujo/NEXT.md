次: L22 state-targets
前提: L21 git-scope 完了（履歴のパス限定・HEAD のエントリで状態を読む・symlink 自身の staging 検証・gitCommitAll 削除）
確認: 大小文字違いの .git を実体とする状態ファイルを拒否し、状態ファイルや書庫が同じ実体を指すとき書込み前に拒否することがテストで通る（#1 #2）
注意: 指摘の詳細と判断は .soujo/REVIEW-FIX.md。各指摘は失敗するテストを先に書く
effort: high
