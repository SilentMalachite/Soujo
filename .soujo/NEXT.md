次: L37 converge-verify
前提: L36 済: spec が原則を1問で決めキー付きで書き、go は原則に反するときだけ1問聞き、review・reviewer は原則違反を先に出し、CLAUDE/AGENTS とテンプレートが原則の優先を述べる
確認: 既存プロジェクトの複製で両ホストが go → converge（差を層に）→ go → converge（収束）を回し、$converge が組み込みと衝突せず、SPEC(+ja) §12 の基準11・12 が ✓ になる
注意: L12 の手順に倣う。両ホストのプラグインは L35 より前の版なので入れ直してから回す。Codex の layer done は .git の書き込み許可が要る
effort: high
