# OPEN-FIX — SPEC §14 Open 13件の見直し（2026-09-25・soujo CLI を使わずに進める）

| # | Open の項目 | 処置 | 担当 |
|---|---|---|---|
| O1 | Codex で hooks の `${CLAUDE_PLUGIN_ROOT}` 展開・`systemMessage` 表示が未検証 | 実機確認（push が要る）→ 保留・確認 | 利用者 |
| O2 | spec が SPEC を最後にまとめて書く | spec: 次の問いを出す前に書く | B skills |
| O3 | spec/plan/converge がコミットしない | 設計判断（層でないコミットが増える）→ 保留・確認 | 利用者 |
| O4 | converge の文脈量 | 計測が要る → 受け入れた費用として Decided へ | 本体 |
| O5 | converge の判定が揺れる | converge: 原則は利用者の起動経路で判定（テストが抑えた挙動を met の根拠にしない）+ SPEC に限界を明記 | B skills |
| O6 | unrequested に init の CLAUDE.md | converge: init が置いたファイルと `.soujo/` は対象外 | B skills |
| O7 | Codex が拒否後に順序を崩した | CLI: `next set --layer plan/converge` は最後の層の後に節目がなければ拒否 + converge: `--line` は2つだけ | A CLI / B skills |
| O8 | Codex の $go の文脈量 | グローバル文脈が主因で範囲外 → 記録のみ | 本体 |
| O9 | review が表を加工して出す | review: 加工の中身（前置き・パス短縮・言い換え）を具体的に禁止 | B skills |
| O10 | reviewer の絶対パス | 対処済み → Decided へ | 本体 |
| O11 | 許可リストでつないだコマンドが拒否 | 全スキル+reviewer: コマンドは1つずつ | B skills |
| O12 | go が範囲外の CHANGELOG.ja.md を直した | 報告済みで正しい挙動 → Decided へ | 本体 |
| K | このリポジトリの SPEC にキーがない | soujo で自身を開発しないので見送り | — |

## 手順
1. ✓ A（CLI）と B（skills）をサブエージェントで並行 → main に取り込み（da08c18・d047fd7）。
2. ✓ SPEC(+ja) §14・CHANGELOG(+ja) Unreleased（f22cfca・4a69e00）。`npm test` 435 通過。
3. ✓ reviewer 指摘23件：21件を直した。見送り2件 — #14 1回1コマンドの規則は「読むもの」1行目（どのプロジェクトの soujo・git かを述べる共通行）に置くまま、#15 reviewer はプロジェクトを cwd に動くので `git -C` の案内は足さない。#4・#6・#22 は実装を広げず SPEC に限界として書いた。`npm test` 437 通過。
4. O3 → 決定（2026-09-25）: 専用コマンド `soujo phase done '<spec|plan|converge>'`。
   - 4つの記録（SPEC・PLAN・LOG・NEXT とその symlink 先）だけを `phase: <フェーズ>` でコミット。ほかの変更は残す（フェーズ名で他人の変更をコミットしない）。
   - 拒否: フェーズ名でない・コミットできない状態（途中の merge 等・記録が ignore 等）・NEXT.md が無効か `次:` がまだそのフェーズ（先に next set）。記録に変更なしは「なし」で終了0（再実行できる）。
   - スキル: spec・plan（層を足したとき）・converge は next set の後に phase done。
   - 担当: 実装・スキル・テスト = サブエージェント / SPEC・README・CHANGELOG = 本体。
5. O1（Codex フックの実地確認）は push が要る → 利用者の判断待ち。
