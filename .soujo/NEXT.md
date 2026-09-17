次: L33 spec-check
前提: L32 済: converge が PHASES に入り、全層完了時の resume は /soujo:converge を示す
確認: validateSpec が原則の7行超・形の違う行・キーのない受け入れ基準・重複キーを行番号付きで返し、next check がそれと SPEC.md を読めないことを警告することがテストで通り、CHANGELOG(+ja) に載る
注意: validateSpec は state.ts の純粋関数に。見出しのない SPEC（この repo の英語 SPEC）は検査しない。dist は npm run build で更新
effort: high
