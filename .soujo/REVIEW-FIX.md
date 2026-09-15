# REVIEW-FIX — Codex 全体レビュー（HEAD bc403af・44件）の TDD 修正計画

## 各層の手順（共通）
1. RED: 指摘ごとに失敗するテストを先に書き、`npm test` で落ちることを確かめる。落ちなければ「再現せず」として直さず、層のメモに残す。
2. GREEN: 最小の修正で通す → REFACTOR → `npm run build`（dist 同期）→ `npm test` 全通過。
3. 挙動が変わるものは SPEC(+ja)・README(+ja)・CHANGELOG(+ja) の Unreleased に反映。1層1コミット。

## 層（依存順・12層）
| 層 | 指摘 | RED で書くテスト（要旨） |
|---|---|---|
| L20 git-env | 4, 9, 23, 39 | 環境変数 GIT_DIR / GIT_INDEX_FILE を別リポジトリに向けても cwd のリポジトリへコミットする / git の起動失敗で gitToplevel が throw し、init が状態領域を作らない / 末尾が空白のディレクトリ名でも toplevel が一致する / テストの git がグローバル設定を読まない |
| L21 git-scope | 5, 6, 7, 42 | 同じリポジトリの別プロジェクトにある同名の `layer:` コミットで拒否されず、brief にも混ざらない / PLAN を移して symlink にしても、過去の完了層を未コミット扱いしない / skip-worktree 付き symlink の付け替えを検出する / gitCommitAll を削除する |
| L22 state-targets | 1, 2 | `.GIT` への symlink を拒否する / 書庫→LOG.md など、状態ファイル同士が同じ実体を指すとき書込み前に拒否する |
| L23 file-create | 8, 22, 41 | hardlink を張れない FS で既存ファイルを置き換えない / 生存中の pid の一時ファイルを消さない / 既存ファイルだけの読取り専用ディレクトリで init が成功する |
| L24 cli-robust | 3, 10, 11, 24 | 層名 `L1 $(x)`・`'`・先頭 `-` を安全に引用する / cwd 削除後の next check が終了0 / stdout が閉じていても EPIPE で落ちない / エラー中のホームパスを `~` にする |
| L25 plan-parse | 25, 26, 27, 28 | 空の層名を行番号付きで拒否する / 完了条件のない層は layer done が拒否する / コードフェンス内のチェック項目を無視する（parsePlan・markDone） / C1 制御文字を空白にする |
| L26 next-log | 12, 18, 37, 38, 40 | 新しい書庫の前文が `# LOG YYYY-MM` 以外なら rotate が拒否する / NEXT の `確認:` と PLAN の完了条件が違えば警告する（plan スキルも同期条件に） / 無効な NEXT は next show が1行の診断を出す / PLAN を読めなくても NEXT の警告が出る / #40 は D3 |
| L27 map-lexer | 14, 15, 16 | ブロックの後の正規表現内の import を拾わない / 行コメントが CR・U+2028・U+2029 で終わる / 全角スペースや NBSP の後の import を拾う |
| L28 map-jsx | 13 | JSX 本文・属性の文字列を import にしない（.ts / .mts / .cts 以外） |
| L29 map-resolve | 17, 29, 30, 43, 44 | `?query`・`#frag`・`%xx` 付きの specifier を解決する / 大小文字を区別する FS では大小文字違いを補完しない / 読込みバイト数の上限と注記 / 実装と違うコメント2件を訂正 |
| L30 privacy-ci | 20, 21, 33, 34, 35, 36 | Codex の URL を検出する / 履歴の blob も検査する / 自分自身の除外を合成 fixture に限る / 全 ref のコミットメッセージを検査する / SPEC を docs 同期の対象に加える / test スクリプトがシェルの glob に頼らない |
| L31 skills-docs | 19, 31, 32 | skills.test: review は soujo を必須にせず、map は plan / code のときだけ / `layer:` コミットがないときの差分基準 / 規約の文言を SPEC §4・CLAUDE.md §8・AGENTS.md で揃える |

## 判断（2026-09-16 承認・soujo の層で進める）
- D1 #8: hardlink を張れない FS では `copyFileSync(COPYFILE_EXCL)` を使い、「置き換えない」を優先する。中断時の書きかけは FAT/exFAT でだけ残り得ると SPEC に書く。
- D2 #9: `LC_ALL=C` で「not a git repository」のときだけリポジトリ外とする。git の起動失敗・設定破損はエラーにし、resume / brief / next check ではその行（警告）だけ縮退する。
- D3 #40: 挙動は変えず、SPEC に制約として書く。Codex 案（未コミットの写しだけ重複排除）は、SPEC が約束する「書庫を手でコミットした後の再実行」を壊すため。
- D4 #19: スキルの中身を CLI へ移さない。規約を「機械的に決まる判断・整形・検証は src/、対話・図の描画・レビューはスキル」に書き直す。
- D5 #20: test スクリプトだけシェル非依存にし、Windows の CI ジョブは足さない（手元で検証できない）。
- D6 #43: ノード ID の生成は変えずにコメントを直す（Mermaid の出力を変えない）。
- D7 #3: 案内するコマンドは単一引用符で囲む（`soujo layer done 'L3 io'`）。スキルの表記に揃える。
- D8 #33: 過去の履歴に実際の漏えいが見つかったら、履歴は書き換えず報告して止める。

## L21 追加レビュー（Codex・d208e5a・2件・L22 の前に fix コミットで直す）
| # | 指摘 | RED で書くテスト（要旨） |
|---|---|---|
| L21-1 | headState が HEAD のパス途中のディレクトリ symlink を辿らない | `.soujo/PLAN.md → ../alias/PLAN.md`・`alias → docs` の PLAN を読む / `deep → docs/sub` の後の `..` を字句でなく辿った先で解く |
| L21-2 | Windows の相対リンク `..\docs\PLAN.md` を `\` で区切らない | 区切り文字が `\` のとき `\` でも分け、`/` のときは分けない |
- 判断: HEAD の上で realpath と同じく1要素ずつ解く（symlink は最大40回、超えたら undefined）。
