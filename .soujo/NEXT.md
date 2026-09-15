次: L20 git-env
前提: PLAN に L20〜L31 を追加（Codex 全体レビューの修正、.soujo/REVIEW-FIX.md）
確認: git 呼び出しがリポジトリの位置を変える環境変数を落とし、「リポジトリ外」のときだけ toplevel が undefined になり、git の返すパスは改行だけ除かれ、テストの git がユーザー設定から隔離されることがテストで通る（REVIEW-FIX #4 #9 #23 #39）
注意: なし
effort: medium
