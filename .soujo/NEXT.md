次: L7 resume-close
前提: L6 layer-done 完了（以降は soujo next set → soujo layer done で締める）
確認: resume が4行を出し、close が NEXT 無効で終了1・中断ログ・wip コミットを行うことがテストで通る
注意: close の中断ログは「中断: …」。resume は NEXT が無い／無効なら PLAN の次の層へフォールバック
effort: medium
