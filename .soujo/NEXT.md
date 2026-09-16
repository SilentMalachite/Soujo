次: L26 next-log
前提: L25 plan-parse 完了（空・制御文字の層名を行番号で拒否・完了条件のない層を layer done が拒否・コードフェンス内の項目を無視・C1 制御文字を空白に）
確認: 新しい書庫の前文を rotate が検証し、NEXT の確認と PLAN の完了条件の違いを next check が警告し、無効な NEXT を next show が1行で診断し、PLAN を読めなくても他の警告が出ることがテストで通り、#40 の制約が SPEC に載る（#12 #18 #37 #38 #40）
注意: L24 の追加レビュー18件は .soujo/REVIEW-FIX.md に未対応で残っている
effort: high
