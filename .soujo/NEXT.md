次: L23 file-create
前提: L22 state-targets 完了（.git を大小文字問わず拒否・状態ファイルと書庫の実体の重複を stateTarget で拒否）
確認: hardlink を張れない FS でも既存を置き換えず、生存中の pid の一時ファイルを消さず、必要なファイルが揃った読取り専用ディレクトリで init が成功することがテストで通る（#8 #22 #41）
注意: 判断 D1 と指摘の詳細は .soujo/REVIEW-FIX.md。各指摘は失敗するテストを先に書く
effort: high
