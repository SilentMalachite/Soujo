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

## L22 追加レビュー（reviewer・189a71f・20件・全部 fix コミットで直した）
| # | 指摘 | 直し方 |
|---|---|---|
| 1, 2 | 壊れた symlink の先を字句の `..` で解き、1段しか辿らない | `pathLeadsTo` が headState と同じく1要素ずつ・最大40回辿り、通った全パスを持つ |
| 3 | `.git` 判定が小文字化だけ | `isDotGit` が NTFS の末尾ドット・空白・ストリーム・8.3、HFS+ の無視コードポイントも `.git` とする |
| 4, 5 | パス比較が `toLowerCase` のみ、同一性が dev+ino のみ | `pathKey` は NFC＋大小文字無視はファイルシステムが無視するときだけ。`sameFile` は inode 一致をパスか size+作成時刻で裏づける |
| 6 | stateTarget ごとに全ファイルの identity を計算 | `stateIdentities` を1回作って渡す（leftoverTemps・requireSafeTargets） |
| 7 | エラーが symlink でない側を名指し | `sameText` が symlink・壊れた symlink・hard link を区別して名指す |
| 8, 13 | 読み込みと init まで拒否 | 壊れた symlink の先は書き込みだけ拒否（`whenWritten`）。init は既存同士の重複では拒否しない |
| 9, 10, 11, 14 | SPEC・CHANGELOG・コメントと実装の食い違い | 文面を実装に合わせ、`requireInProject` を `requireSafeTargets` に改名 |
| 12 | 同じ実体の一時ファイルを消さなくなった | `elsewhere`（プロジェクト外・`.git` の中）のときだけ消さない |
| 15〜20 | テストの抜け | hard link・大小文字・`..`・多段・ループ・rotate がこれから作る書庫・init・close・resume・next check を追加。`isDotGit` / `pathKey` / `sameFile` は純粋関数として全プラットフォームで検証 |
- 判断: 「同じ実体」は読み書きとも拒否し（一方を読むともう一方が返るため）SPEC に明記。「壊れた symlink の先」は書く前だけ拒否する。

## L23 追加レビュー（reviewer 19件・Codex 3件・47d27c9 の後の fix コミットで直した）
| # | 指摘 | 直し方 |
|---|---|---|
| R2, 3 | 生存中 pid の temp を残すようにしたら、除外リストから外れて log rotate が DIRTY で落ちる | `stateTemps`（生存中も含む全 temp）を足し、コミット検査はそれを使う |
| R4, C1 | copy の失敗で書きかけが残る／宛先を開く前の失敗で他プロセスのファイルを消す | `openSync(path, 'wx')` で自分が作ったと確定してから書き、その失敗のときだけ消す |
| R5, 6, 7, 9, C2 | 固定 pid が実在し得る・`deadPid` が 0 に退化・生きた pid が `process.ppid`・作成時と検証時で pid を取り直す | 8箇所を `deadPid()` に、起動失敗で throw、`livePid(t)` を足し、パスを変数に持つ |
| R11, 16 | copy 側の EEXIST 分岐と、読取り専用で1ファイル欠けたときのテストがない | 競合を再現する link を渡すテストと、欠けた init のテストを足す |
| R12 | 巨大 pid・先頭ゼロの temp が消えなくなった（`git add -A` が拾う） | pid の綴りでないものは NaN にして消す側に倒す |
| R13, 14, 15, 18, C3 | SPEC・doc の不正確（`.soujo/` 前提、FS の列挙、pid の限界、掃除の責務、copy 経路の例外） | 文面を実装に合わせる |
- 見送り: R8（`deadPid` の使い回し）は取得時の生存確認で足りる。R10（`place` の `link` 引数）は `symlinkTargetParts` の `separator` と同じ既存の流儀。

## L24 追加レビュー（reviewer 18件・3ed8283 の後の fix コミットで全部直した）
| # | 指摘 | 直し方 |
|---|---|---|
| 1 | `write` が EPIPE 以外の書込み失敗も握り潰して終了0 | `code` を見て `EPIPE` / `ERR_STREAM_DESTROYED` / `EBADF` だけ黙り、ほかは stderr に1行出して1 |
| 2 | `hideHome` が stderr だけ。`next check` の警告（stdout・systemMessage）に絶対パスが残る | stdout の行にも通す（cli.ts の1箇所）。SPEC の文言も広げる |
| 3, 4 | `PATH_END` に `:;<>：；` がない。Windows の `/` 綴りと UNC ルートが未対応 | 文字クラスを足し、`spellings` に区切り違いを足し、UNC をルート除外に |
| 5 | `FOLD_CASE` がプラットフォーム判定（既存は実測の `ignoresCase`） | 実測できない理由をコメントに。可能なら `ignoresCase(home)` を先に試す |
| 6, 7, 18 | CLI テストの穴：EPIPE が通る側に競合、cwd 消滅に `next show --hook` と `--help` がない、ホームパスが1形だけ | 読み側を先に閉じる形にし、2件と darwin 限定の大小文字違いを足す |
| 8, 9 | `commandArg` が文字列比較だけ。`--` を CLI が受けるか、close 側の引用が未検証 | `-` 始まりの層名で `layer done` が締まるテストと close の1件 |
| 10 | usage 2本と `templates/CLAUDE.md` / `AGENTS.md` が二重引用符のまま（D7 と不一致） | `log add` / `layer done` の usage と CLAUDE.md・AGENTS.md（テンプレートと本体）を単一引用符に |
| 11, 12, 13 | CHANGELOG の英日で新項目の位置が違う。SPEC.ja の非文。「作業ディレクトリ」と「現在のディレクトリ」が不統一 | 並べ替え、「が要る」、語をどちらかに揃える（テストの正規表現も） |
| 14, 15 | `currentDir` が失敗理由を捨てる。`findStateDir` / `requireStateDir` の既定値 `process.cwd()` が残る | `ENOENT` 以外は `code` を添える。既定値を外すか必ず渡す旨のコメント |
| 16, 17 | 同じ行の `soujo next set` は `-` 始まりの層名で実行できない。空・制御文字の層名は貼っても一致しない | `optionArg('--layer', 層名)` で `--layer='…'` を示す。17 は前提を `quoted` のコメントに書く（検証は L25） |
- 判断: `commandArg` の `--` は位置引数の前に置くので、`--note` を足すときは `--` より前に書く（`soujo layer done --note x -- '-L1'`）。案内の行に `--note` は無いので、出たまま貼れば通る。

## L25 追加レビュー（reviewer 28件・15f841e の後の fix コミット）
| # | 指摘 | 直し方 |
|---|---|---|
| 1, 2, 15 | 閉じ忘れたフェンスが以降の層を無言で消す。`PLAN_FENCE` に `s` がない。`startsWith(fence[0] ?? '')` が危険側の既定値 | `planItems` が `{ items, unclosed }` を返し、`validatePlan` が先頭で `<N>行目のコードフェンスが閉じていない` を出す。`PLAN_FENCE` に `/s`、判定を `marker[0] === fence[0]` に |
| 9 | 完了条件の検査がコミット済み判定より前 | コミット済み・HEAD チェック済みの後ろへ移す |
| 10 | `- [ ] L2 state —`（区切りだけ）で層名が `L2 state —` になる | `splitItem` の走査上限を `parts.length` にし、後ろに語がない区切りでも分けて `condition: ''` にする |
| 28（併せて） | 行番号の指摘に「PLAN.md の層名を直してから」が続き、フェンスに合わない | ヒントを `（PLAN.md を直してから）` に（`next set` と `layer done`） |

## L25 追加レビューの残り（20・26 は前の fix で済み・2回目の fix コミットで直した）
| # | 指摘 | 直し方 |
|---|---|---|
| 4 | バックティックのフェンスの情報文字列にバックティックを入れられない規則が未実装（インラインコードの行を開きフェンスと誤認） | `PLAN_FENCE` をバックティック（情報文字列は `[^`]*`）とチルダの2択にし、`fenceOf` が marker と info を返す |
| 3, 5, 6 | 全角空白の閉じフェンス・4スペース字下げのコードブロック・複数行 HTML コメントが未対応。フェンス規則の根拠が事実と違う | 3 は #1 の警告で実害なし。5・6 は挙動を変えず「例の入れ物はフェンスだけ」を SPEC(+ja)・`PLAN_ITEM` のコメント・plan スキルに明記 |
| 7 | 完了条件の検査が `layer done` だけ（30分作業した後に初めて拒否される） | `missingConditions` を足し、`next check` が行番号付きで警告する（`next set` は書かせる。警告なので既存 PLAN も再開できる） |
| 8 | 完了条件なしの既存 PLAN が締められなくなる断りがない | CHANGELOG（英日）に「先に `— <完了条件>` を足す」を1文 |
| 11, 12 | `quoted` の「層名に制御文字はない」という前提が resume / close で成り立たない | コメントを「検証するのは `next set` / `next check` / `layer done`。resume / close は未検証の名前を案内し得る（`next check` が同時に警告する）」に直す |
| 13 | 行番号の警告が重複排除されず、`next check` の1行が壊れた行の数だけ伸びる | `SHOWN_PROBLEMS = 4` で先頭4件＋`ほかN件` |
| 14 | 制御文字入りの層名が `seen` に入らず、重複は直した次の実行で初めて出る | `printable(layer).trim()` を `seen` に入れる（空名は従来どおり数えない。フェーズ名・節目は `continue`） |
| 16 | `markDone` が `split('\n')` を2度やり、範囲外を `?? ''` で潰す | `planItems` が `lines` も返し、`markDone` は `map` で該当行だけ書き換える |
| 17 | `LOG_HEADER` に `/s` がなく、手書きの U+2028 入り見出しの配下が前のエントリに吸われる | `LOG_HEADER` にも `/s` |
| 18 | C1 を `CONTROL` に入れた影響（層名の検証も変わる）が CHANGELOG にない。制御文字の範囲が SPEC にない | CHANGELOG（英日）に1文、SPEC(+ja) の決定に範囲（C0・DEL・C1・U+2028/2029）を1行 |
| 19 | `hideHome(printable(line))` の順序で、制御文字入りのホームパスが `~` にならない | `printable(hideHome(line, …))` に |
| 21 | plan スキルの拒否条件の列挙に、空名・制御文字・完了条件なしがない | 12行目に完了条件を、13行目に空名・制御文字・フェンスを追記（節は3行のままに畳む） |
| 23 | テストの NBSP・ソフトハイフンが生バイトで不可視 | `String.fromCharCode(0xa0, 0xad, 0xff)` で書く |
| 24, 25 | フェンスと `layer done` のテストの抜け | 字下げ・閉じフェンスの情報文字列・CRLF・バックティック規則・フェンス内の同名層の `markDone`・空名/制御文字名の `layer done`・`[x]` 済みで完了条件なしの再実行を追加 |
| 27 | 完了条件なしのメッセージだけ行番号がない | `planLayers` で行を取り、`PLAN.md の<N>行目の層「X」に完了条件がない` に揃える |
- 対応しないもの: #22（`.gitignore` の `.serena/`・`graphify-out/` が L25 のコミットに同梱）はコミット済みの履歴なので分けない（D8 と同じく履歴は書き換えない）。#5 の4スペース字下げと #6 の HTML コメントは、挙動を変えず文書で保証する範囲を明示する方を採った（フェンス以外を飛ばすと入れ子のリスト項目まで落ちるため）。
