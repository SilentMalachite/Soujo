次: L14 effort
前提: soujo --help を実装（使い方はコマンド表の usage 1か所から出し、コマンドなし・不明なコマンドのエラーは soujo --help を案内）
確認: next set --layer spec/plan（前後の空白付きを含む）が effort 省略で high を書き、ほかの effort を何も書かずに拒否することがテストで通り、spec・go スキルの plan 行きの next set が --effort を付けない（go の節は3行のまま）
注意: nextSet は formatNext（層を見ずに既定 medium）→ validate → trim した層で PLAN 照合 → writeState の順。spec/plan の判定は trim 後の層で writeState より前に。skills.test は1節3行を検査
effort: medium
