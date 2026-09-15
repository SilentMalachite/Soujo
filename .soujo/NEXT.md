次: L21 git-scope
前提: L20 git-env 完了（git の環境変数の除去・toplevel の失敗の区別・テストの git 隔離）
確認: layer コミットの検索と brief の履歴がプロジェクトのパスに限られ、HEAD の状態を HEAD のエントリ（symlink ならその時点のリンク先）で読み、symlink 自身の staging も検証し、gitCommitAll がないことがテストで通る（#5 #6 #7 #42）
注意: 指摘の詳細と判断は .soujo/REVIEW-FIX.md。各指摘は失敗するテストを先に書く
effort: high
