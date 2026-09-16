次: L31 skills-docs
前提: L30 privacy-ci 完了（privacy が全 ref の blob・コミット・タグのメッセージと Codex のリンクを検査し、自身は架空値だけ通す。docs に SPEC。npm test は test/run.ts。判断 D11〜D14）
確認: review と map の soujo 必須条件と layer コミットがないときの差分基準がスキルに書かれ、SKILL と CLI の境界の規約が SPEC(+ja)・CLAUDE.md・AGENTS.md で揃い、skills テストが通る（#19 #31 #32）
注意: D4: スキルの中身を CLI へ移さず、規約を「機械的に決まる判断・整形・検証は src/、対話・図の描画・レビューはスキル」に書き直す。CLAUDE.md・AGENTS.md は templates/ の写しも直す
effort: medium
