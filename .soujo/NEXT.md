次: L30 privacy-ci
前提: L29 map-resolve 完了（reviewer 19件・Codex 12件を同じ層で直した。判断 D9 常に NFC・D10 拡張子は書かれた綴りだけ）。L28 のレビュー残り3件も fix コミットで直した
確認: privacy テストが Codex の URL・履歴の blob・全 ref のメッセージを検査し、自身の除外が合成 fixture に限られ、docs テストが SPEC を含み、npm test がシェルの glob に頼らないことがテストで通る（#20 #21 #33 #34 #35 #36）
注意: SPEC の docs 同期は L29 #17 の宿題でもある（SPEC 英日の map code・review の行は今回の fix で揃えた）
effort: high
