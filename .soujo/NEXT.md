次: L24 cli-robust
前提: L23 file-create 完了（hardlink 不可の FS では複製し置き換えない・生存中 pid の一時ファイルは残す・揃った読取り専用ディレクトリで init が成功）
確認: 案内するコマンドの層名が単一引用符で安全に囲まれ、cwd を取れなくても next check が終了0、stdout の EPIPE で落ちず、エラーのホームパスが ~ になることがテストで通る（#3 #10 #11 #24）
注意: 判断 D7 と指摘の詳細は .soujo/REVIEW-FIX.md。各指摘は失敗するテストを先に書く
effort: high
