次: L14 effort
前提: soujo --help を実装（使い方はコマンド表の usage 1か所から出し、コマンドなし・不明なコマンドのエラーは soujo --help を案内）
確認: next set --layer spec/plan（前後の空白付きを含む）が effort 省略で high を書き、ほかの effort を何も書かずに拒否することがテストで通り、spec・go スキルの plan 行きの next set が --effort を付けない（go の節は3行のまま）
注意: skills.test は1節3行を検査。nextSet は層名を trim して照合するが formatNext の既定 effort は trim 前に入る。拒否エラーは --effort を外すよう示す
effort: medium
