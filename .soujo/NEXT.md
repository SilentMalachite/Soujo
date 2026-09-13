次: L6 layer-done
前提: L5 next 完了（next show/set/check。check は常に終了0、問題は「soujo 警告: a / b」の1行）
確認: layer done が PLAN→LOG→commit を行い、不正入力で無書込・コミットだけ再試行・コミット済み拒否がテストで通る
注意: この層は手で締める最後の層（PLAN チェックと commit）。NEXT は next set、LOG は log add を使う
effort: medium
