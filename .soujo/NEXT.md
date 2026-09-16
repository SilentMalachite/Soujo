次: L27 map-lexer
前提: L26 next-log 完了（新しい書庫の前文を rotate が検証・確認と完了条件の違いを next check が警告・無効な NEXT を next show が診断・NEXT/PLAN を読めなくても他の警告が出る・#40 を SPEC に記載）
確認: ブロックの後の正規表現、CR・U+2028・U+2029 で終わる行コメント、全角空白や NBSP の後の import を map code が正しく扱うことがテストで通る
注意: L24 の追加レビュー18件は .soujo/REVIEW-FIX.md に未対応で残っている
effort: high
