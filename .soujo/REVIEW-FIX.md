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

## 94c2ce4 のレビュー（Codex 8件・全部直した）
| # | 指摘 | 直し方 |
|---|---|---|
| 1 | `PLAN_FENCE` の `[ \t]*` と情報文字列が空白を取り合い、フェンスでない長い行の判定が二乗時間（空白1.6万で365ms） | `[ \t]*` を外して情報文字列に空白を含ませ、閉じ判定を `FENCE_BLANK` に。空白4万文字の回帰テスト |
| 2 | `hideHome` を先にした結果、ホームパスの**直後**の制御文字が境界にならず `~` に置換されない（`PATH_END` の `\s` は C0・DEL・C1 を含まない） | `PATH_END` に ` --` を足す。`files.test` に制御文字5種の後置とパス内制御文字を追加 |
| 3 | stderr は `oneLine` が `shown` より先に `printable` を呼ぶので、制御文字入りホームが隠れない | `oneLine` から `printable` を外し（`shown` が後で行う）、`shown` を通さない書込み失敗の行だけ自前で `printable` |
| 4 | `next check --hook` は `JSON.stringify` が先にタブを `\t` にするので、生のホーム文字列と一致しない | `homePath` を `files.ts` へ移し、`nextCheck` が JSON に包む前に `printable(hideHome(...))` |
| 5 | 正規化すると空になる層名（NUL だけ・SOH だけ）が `seen` に入り `層「」が重複` が出る | `printable(layer).trim()` が空なら重複集計から外す（空名と同じ扱い） |
| 6 | SPEC の CLI 一覧（`next check` の行）に完了条件の警告と4件の表示制限がない | 英日の該当行に追記（`ほか<N>件` と hook の隠蔽順も） |
| 7 | 4スペース字下げ・HTML コメント内の項目が層である契約に直接テストがない | `parsePlan` / `validatePlan` / `markDone` の3点でテスト |
| 8 | `LOG_HEADER` の `/s` のテストが `parseLog` だけで、`rotateLog`・追記/削除判定・見出し拒否を守っていない | U+2028/2029 の見出しで rotate・`archiveLog`・`appendedEntries`・`removedEntries`・`appendLog` の拒否を1テストに

## L27 追加レビュー（reviewer 25件・layer コミットの前に直した分）
| # | 指摘 | 直し方 |
|---|---|---|
| 8 | `scanRegex` が `\` の次を無条件に飛ばし、`\` + 行終端で行をまたぐ | 行終端の判定を `\` の分岐より先に置き、`\` の次が行終端なら進めない |
| 5, 6 | `opensBlock` と `regexAllowed` が同じ `}` を別の基準で読む。対応する `{` のない `}` がオブジェクトリテラル扱い | `opensBlock` の `}` も `previous.block` を見る。`blocks.pop() ?? true`（未対応の `}` はブロックの閉じ） |
| 7 | `depth` と `blocks.length` の二重管理が `}` 過多で乖離する | `depth` を消して `blocks.length` を使う |
| 9, 10 | 文字列の行終端規則が `LINE_ENDS` と直書きに分かれ、`scanQuoted` の説明が古い | `QUOTE_ENDS` を足して `LINE_ENDS = [...QUOTE_ENDS, ...SEPARATORS]` に。説明を CR 込みに |
| 1〜4 | `opensBlock` の既知の誤判定（ラベル・`case` の後のブロック、`as` / `satisfies` / 型位置の `=>` / `export default` の後のオブジェクト） | 直さず、`opensBlock` の doc コメントに既知の誤判定として列挙（実害は `} /` が隣接するときだけ） |
| 13, 15 | `isWordChar` がコード単位で判定することと `BLOCK_AFTER` の規則がコメントから読めない | コメントを規則の側から書き直す |
| 17〜23 | テストの抜け（入れ子の波括弧・壊れた波括弧・U+2029 の正規表現・LF と `"…"` の閉じ忘れ・CR 区切りの複数行・BOM が RED でない・性能） | 8件を追加し、BOM を `import` と指定の間へ移し、性能テストに長い行コメント・CR 区切りのコメント・非 ASCII の語を足す |
| 24 | CHANGELOG の英日で行終端の数え方が違う | 英を「all four」に、日に「直前に `\` があっても」を足す |
- 残り（この層では直さない）: #11（`lineEnd` の定数倍。性能テストを足して 2 秒以内を確認済み）・#12（`\s` に U+200B がない。不正な JS でしか起きない）・#14（テンプレートリテラルの CR を LF に正規化しない）・#16（`blocks` に上限がない。読込みバイト数の上限は L29 の #30）・#25（波括弧のヒューリスティックの限界を SPEC に書くか。完了条件はテストのみを求めている）

## L27 の Codex レビュー（28件・`5198e9a` の後の fix コミット）
`5198e9a` で再現を確認してから直した（9件）。
| # | 指摘 | 直し方 |
|---|---|---|
| I1 | 回帰: 関数式・クラス式の本体の `}` をブロックとみなし、後の除算を正規表現にする（`const f = function () {} / 2`） | `BODY_BEFORE`（`function` / `class`）を見つけたら `opensBlock` の結果を `bodies` に積み、次にブロックを開く `{` がそれを消費する。式の本体の `}` は operand を終える |
| I2, I3 | 回帰: `export default {}`・`as {}`・`satisfies {}` をブロックとみなす | `VALUE_AFTER = {as, satisfies, default}` を足し、`opensBlock` の語の分岐で先に弾く |
| I5 | 既存: `class C<T> {}`・`function f(): T[] {}` の本体をオブジェクトリテラルとみなし、後の正規表現の中身を字句化する | `opensBlock` の文開始の記号に `]` と `>` を足す（`=>` もこれで賄えるので専用の分岐を外した） |
| I7 | 既存: `${` の直後が式の先頭にならず、`` `${/import('./x')/}` `` の正規表現をコードとして読む | テンプレートの途中の部分で `{kind:'punct', value:'$'}` を積む（`$` は語の字なので記号トークンとは衝突しない） |
| I8 | 回帰を含む: テンプレートの最後の部分がトークンを積まず、補間の中の `}` や `require` が外側の直前トークンとして漏れる | 最後の部分で必ずトークンを積む（`` ` `` で始まった補間なしのものだけ固定値、ほかは `other`） |
| T1 | アロー関数のテスト行 `() => {} /re/` が構文エラーで、境界を固定していない | 宣言の本体（正規表現側）と式・型・オブジェクト（除算側）の2群に分け、合法な形だけを並べた |
| T2〜T6 | I1〜I8 の対になる例、CRLF・`\`＋LS・文字クラス内の行終端、非 ASCII 空白5種と `from` の両側、長文の末尾の import が未固定 | 4テストに追加（`import　{ a }　from　'./x'`、U+1680・U+2003 を含む表、30000行のコメントの後の import を assert） |
| D1 | CHANGELOG がブロック／オブジェクトの判別範囲を広く書きすぎている | 宣言の本体に限定し、ラベル・`case` の後が今も誤判定であることを英日に明記 |
- 残り（既存・この層の範囲外。多くは L28〜L30 か、近似字句解析の限界）: I4（ラベル・`case` の後のブロック）・I6（改行を捨てるので ASI の文境界を失う）・I9（`obj.return / 2` などキーワードと同綴りのプロパティ）・I10（`1. / 2`）・I11（TS の後置 `!`）・I12（識別子内の Unicode escape）・I13（テンプレートの生 CR を LF に正規化しない）・I14（`\u{00000061}` のような先頭ゼロ付き）・I15（`this.#import('./x')`）・I16（`` from`./x` `` のタグ付きテンプレート）・I17（JSX 本文 → L28）・I18（閉じていないリテラルを固定文字列として返す）・I19（U+200B。不正入力のみ）・I20（正規表現のフラグを独立した語として読む）・I21（`.cjs` の非 strict な legacy octal escape）

## L28 追加レビュー（reviewer 20件・layer コミットの前に直した分）
| # | 指摘 | 直し方 |
|---|---|---|
| 1 | 2つ目以降の JSX の `{ }` の先頭が式の位置と判定されず、`<Box x={y} p={/from './a.js'/} />` の正規表現をコードとして読む | `{ }` を開くとき `{kind:'punct', value:'('}` を積む（`regexAllowed` は true、`opensBlock` と `endsOperand` は false になる） |
| 4 | `export default <div/>` が要素として検出されない（`default` は REGEX_AFTER にない） | `jsxAllowed = regexAllowed(...) \|\| isWord(tokens.at(-1), 'default')` を足し、検出をこちらに切り替え |
| 5 | タグでないと分かった要素の属性の `{ }` を二重に読み、specifier が2回返る | `JsxElement.tokens`（push 時の `tokens.length`）へ切り詰めてから読み直す |
| 2, 3 | CHANGELOG の「TypeScript も `.tsx` ではそう読む」が事実と違う。閉じない要素が残りを飲み込む帰結が書かれていない | 例を `type X = <T>(a: T) => T` に替え、「その後の `{ }` の外の import は全部消える」を英日に明記。修正（最外要素まで巻き戻して読み直す）は `'<p>'.repeat(n)` で O(n²) になるので見送る |
| 6, 7, 8 | 既定を `.tsx` にしたので JSX オフの `<` を固定するテストが消えた。`${` と `{` の順序テストが RED でない。本文のアポストロフィ・`return <div>`・`export default`・operand・拡張子の配線が未固定 | 152行を `.ts` でも回し、同じ深さで交互に入れ子にする1行を足し、8件を2テストに追加し、`map code` に `.tsx` と `.ts` を並べるテストを新設 |
| 11, 12, 13 | `elements.at(-1) as JsxElement` のキャスト。戻り値の `open?: true` が `scanTemplate` の形と違い `JsxElement.open` と紛らわしい。名前の先頭文字の規則が2か所 | `tokens` を渡して `scanJsx` の中で積み、戻り値を `{next, brace}` に。`element === undefined` は早期 return。`startsJsxName` に括り出す |
| 15 | 開始タグの中のコメントと `<br / >` が名前判定で落ちて要素が壊れる | attr モードに `/*…*/` のスキップと、`/` と `>` の間の空白を足す |
| 17 | `NO_JSX` が拒否リストなので、未知の拡張子が「残りを飲み込む」側に倒れる | `JSX_EXTENSIONS`（`.tsx`/`.jsx`/`.js`/`.mjs`/`.cjs`）の許可リストに |
| 9, 10, 14, 16, 19 | `regexAllowed` の `before` の説明が `/` だけ。`scriptTokens` の `jsx` が doc にない。`NO_JSX` の置き場。名前の `-`。閉じタグの名前を照合しない。壊れた波括弧で `closing()` がずれる | コメントを5か所直し、定数を字句解析の定数群へ移した |
- 残り: #3 の本体（O(n²) を避けられないので既知の限界として文書化）・#18（SPEC は L27 と同じく CHANGELOG のみに留める）・#20（差分を取り直してから渡す運用）→ L29 の後の fix コミットで3件とも直した（末尾の節）

## L28 の Codex レビュー（11件・`5aeb81a` の後の fix コミット・全部直した）
| # | 指摘 | 直し方 |
|---|---|---|
| 1 | タグでないと分かった要素の読み直しが入れ子で指数時間（`'<T a={'.repeat(20)` の161文字で889ms） | `JsxScan` を足し、`rejected` で `<` ごとの判定を1回にし、読み直した総量が本文の長さを超えたら `off` にして残りを要素なしで読む。40000段でも52ms |
| 2 | 型引数付きのタグ（`<Box<T>>`）を要素と認めず、本文から偽の import を作る | `skipTypeArguments` を足し、属性モードの `<` を型引数として飛ばす |
| 3 | 属性の値に直接書いた要素（`icon=<Icon/>`）で外側の要素を見失う | `JsxElement.value` で `=` の直後かを覚え、値の位置の `<` は入れ子の要素として積む |
| 4 | 開始タグの中の行コメント（`//`）で要素の判定が解ける | 属性モードで `lineEnd` まで飛ばす（`/*…*/` と同じ扱い） |
| 5 | JSX の `{ }` が積む疑似 `(` で、`{require}{'./x',1}` が呼び出しとして読まれる | 目印を `EXPRESSION`（`$`）に。語の字なので字句解析が記号トークンにすることはなく、`(` と違って呼び出しにならない。テンプレートの `${` と同じ定数を使う |
| 6〜10 | テストが修正なしでも通る（`<br / >`・タグ内コメント・拡張子の許可リスト・`jsxAllowed` の否定側・`startsJsxName` の数字除外） | 5件を RED になる形で追加（`a<b>c`、`<3>v`、`a.foo` / `a`、`<br / > / 2`、`<Box /* x */>`） |
| 11 | CHANGELOG が JSX の範囲を「`.ts`/`.mts`/`.cts` 以外」と書いている（実装は5拡張子の許可リスト） | 英日とも5拡張子を列挙し、#1〜#5 の挙動も書き足した |

## L29 追加レビュー（reviewer 19件・layer コミットの前に全部直した）
| # | 指摘 | 直し方 |
|---|---|---|
| 1, 2, 3, 19 | 新設の `ignoresCase` が `files.ts` の `foldsCase`/`ignoresCase` の作り直し。number の ino 比較。own の stat 失敗で打ち切り。コメントの主語が実装より広い | 自前の判定を捨て、`foldsCase(join(root, 走査した最初のファイル))` を使う（bigint 比較・判定不能はプラットフォーム既定も込みで解決） |
| 4 | %エスケープを常に復号するので、実在する `d%2Ee.js` への線が消える | 復号した綴りの次に元の字面も候補にする |
| 5 | 「fragment を先に切る」が観測できない違い（4文書に同じ誤説明） | `split(/[?#]/, 1)` にし、「最初の `?` か `#` の早い方で切る」にコメント・SPEC英日・CHANGELOG英日を統一 |
| 6 | CHANGELOG の「ディレクトリに1回問い合わせる」が実装と違う | 「走査したファイル1つに1回・測れないときはプラットフォーム既定」に訂正 |
| 7 | `toLowerCase()` だけなので、macOS の NFD 保存名が NFC の指定から見つからない | `pathKey`（NFC＋大小文字）を key として渡す。NFC/NFD のテストを追加 |
| 8 | コメントの英文を `assert.match` する文面テスト | 削除（挙動テストで完了条件を満たす） |
| 9 | `map code` の大小文字テストがホスト FS で分岐し、片方しか走らない | 同一ホストで必ず走る側（同じ綴りの線）も検証し、`mapCode(dir, 'src')` にして `findStateDir` から独立させた |
| 10, 11, 12 | 上限の境界・マルチバイトの切れ目・`..#y`/`%2F`/`%3F`・注記の併記が未固定 | ちょうど N / N+1、切れ目、指定の形、注記2本の併記をテストに追加 |
| 13 | `fileBytes` を検証せず `RangeError` が素通り | 丸めたうえ、`fstat` のサイズでバッファを伸ばす方式にして上限だけでは確保しない |
| 14 | `readHead` の説明が大半のファイルで偽 | 「収まれば全部・超えれば先頭 limit バイト」に直し、U+FFFD になることを明記 |
| 15 | `importGraph` 第5引数の位置引数 boolean。純粋関数に FS の事情が漏れる | `fileIndex` を export し、key 関数を受ける形に（FS の判断は `commands/map.ts` だけ） |
| 16 | `scanNotes` の `partial` だけ省略可 | 必須にし、木の経路は `{ ...scan, partial: 0 }` |
| 17 | SPEC 英日の同期が `docs.test.ts` の対象外 | L30（#35）で対応 |
| 18 | 注記が生の数値で 512 KiB と結びつかない | 注記は正確な数値のまま（テストで固定できる）、SPEC・CHANGELOG に `(512 KiB)` を併記 |

## L29 の Codex レビュー（12件・layer コミットの前に直した分）
| # | 指摘 | 直し方 |
|---|---|---|
| 1 | 切断で `import './dep` が未閉鎖文字列として拾われ、存在しない線ができる | 切れたファイルは最後の完全な行までしか解析しない（`completeLines`）。回帰テストを追加 |
| 2 | 拡張子を小文字化して読み替えるので、`./dep.TS` が `dep.ts` に当たり、実在する `dep.TS` は見つからない | `SCRIPT_SWAPS` を書かれたとおりに引く。`.TS` は読み替えなしの枝へ回り、当たり外れは index（＝FS の流儀）が決める |
| 5 | `Infinity` がそのまま残り、巨大ファイルのサイズで確保を試みる。`doesNotThrow` だけのテストは弱い | 有限でない上限は既定値に倒す。テストをノード・線・注記の検証に変えた |
| 6 | 読み込み中に増えたファイルの注記が実量と違う | `partial` を「上限が大きさを決めたときだけ」に絞り、増えたファイルは取得時サイズで読み切った扱いに |
| 7 | マルチバイト境界のテストがその境界に達していない（接頭辞11バイト） | 上限を 32 にして2文字目の途中で切れるようにし、完全な行の import が残ることを検証 |
| 8, 9, 10 | `fileIndex` の選択順がコメントと違う。ID の安定性の断定が強い。`directoryTree` のコメントが未訂正 | 3か所のコメントを実装に合わせた |
| 11, 12 | 「FS が変わっても線が増減しない」が実装と矛盾。「最大 N バイト読む」が1バイト違う | SPEC 英日を「そのファイルシステムが解決するとおりになる」「解析は最大 N バイト、超過判定にもう1バイト読む」に直した |
| 3 | `pathKey(path, false)` も NFC 化するので、NFC/NFD を区別する FS でも同一視する | **直さない**（D9）。正規化を畳むかも測るには新たな FS 探査が要る一方、畳まないと macOS の NFD 保存名を取り逃す。常に NFC で比べることを SPEC 英日に明記した |
| 4 | `foldsCase(root)` は親ディレクトリでの検索を測っている | 走査したファイルを渡す形にした（#1 の対応に含む） |
- 判断 D9: 正規化は常に NFC で畳む。NFC と NFD の同名が1つの木に並ぶことは実質なく、畳まないと macOS で線が落ちる方が痛い。
- 判断 D10: 拡張子の読み替えは書かれた綴りのときだけ。大小文字を畳む FS で `./a.JS` から `a.ts` への線は落ちるが、区別する FS に偽の線を作らない方を採る。

## L28 の残り3件（`c255929` の後の fix コミット・全部直した）
| # | 指摘 | 直し方 |
|---|---|---|
| 3 | 閉じない要素（`type X = <T>(a: T) => T`）がファイルの残りを飲み込み、後ろの import が消える | 末尾で開いたままの要素のうち最も内側の組（コードの位置で開いた1つと、その子・属性値）を捨て、その `<` まで状態を戻してコードとして読み直す。外側の要素は残すので、組が奪った閉じタグで閉じられる。読み直しは L28 Codex #1 の予算に数えるので線形のまま（O(n²) の懸念は予算で解消） |
| 3（併せて） | 戻す状態を長さだけで表せない（`{ }` の中の `)`・`{` が外の `(`・`function` を消費する） | `${ }`・JSX `{ }` が開いた時点の conditions・bodies の長さを持ち、中のコードはそれより下を消費せず、閉じたら中で開いたものを捨てる |
| 18 | SPEC に JSX の読み方がない | SPEC 英日の `map code` の行に、拡張子・本文と属性値・閉じない要素の扱いを足した |
| 20 | reviewer に渡した diff の写しが作業ツリーより古かった | review スキルは範囲だけを渡し、reviewer は始めるときに自分で `git diff` を取る。SPEC 英日・CHANGELOG 英日・skills.test に反映 |
- Codex レビュー（1件）: レビュー中にコメントを直したため `dist/map.js` が src とずれた → 再ビルドで解消。

## L30 実装計画（privacy-ci）
| 指摘 | 作るもの | RED で書くテスト |
|---|---|---|
| Codex の URL | `SECRETS` に `chatgpt.com/codex/…tasks/…` と ChatGPT の会話・共有リンク（`/c/` `/s/` `/share/`） | 3形が `Codex のセッション URL` になる |
| 自身の除外 | `SELF` の丸ごと除外をやめ、`test/privacy.test.ts` の中で一致した字面が `SYNTHETIC`（架空の値）のときだけ除く | 同じ値は他のファイルでは捕まり、`SELF` でも実行時に組んだ本物らしい鍵は捕まる |
| 履歴の blob | 全 ref から届く blob（`rev-list --objects --all` → `cat-file --batch`）を検査 | 一時リポジトリで消したファイルの漏えいを見つける |
| 全 ref のメッセージ | `git log --all` | 一時リポジトリの HEAD 以外のブランチ・タグのメッセージを見つける |
| docs の SPEC | `DOCS` に `SPEC`。英日の差分を直す。CONTRIBUTING(+ja) の列挙にも | 既存の docs テストが SPEC で通る |
| npm test の glob | `test/run.ts` が `.test-dist/test/*.test.js` を列挙して `node --test` に渡す（引数は前に転送）。列挙は `helpers.ts` の `testFiles` | test スクリプトに `*` `?` がなく、`testFiles` が test/ の全 `*.test.ts` に対応する |
- D11: Codex の URL の形は公式文書で確認できなかった。既知の `chatgpt.com/codex/tasks/` に途中の段（`cloud/` など）を許し、会話・共有リンクも捕まえる。
- D12: `SYNTHETIC` は過去版の fixture も通すための字面の許可リストで、`SELF` のパスにだけ効く。新しい fixture も架空の値を足して書く。本物らしい値のテストだけ実行時に組む。
- D13: 履歴の検査は到達できる blob だけ（`--batch-all-objects` は手元の到達不能なゴミまで読む）。現時点の漏えいは過去版 `privacy.test.ts` の fixture だけ（D8 の停止条件に当たらない）。
- D14: `run.ts` は main 判定をしない（symlink 越しの起動で判定が外れると0件で成功するため）。列挙は `helpers.ts` に置く。

## L30 の Codex レビュー（`283be8b`・0件）
- 指摘なし。Codex は読み取り専用で型検査と16件を実行し、書き込みを伴うテストと Windows は未検証と明記。書き込みを伴う全380件は手元で通過済み。Windows は D5 のとおり CI に足さない。

## L31 実装計画（skills-docs）
| 指摘 | 直すもの | RED で書くテスト（skills.test） |
|---|---|---|
| #19 soujo 必須条件 | review は「`soujo` は呼ばないので止めない」、map は「`plan`・`code` のときだけ止める」。他の5つは今のまま | 各スキルの止める条件が、そのスキルの `soujo` コマンドの有無（map はモードごと）から組んだ文と一致する |
| #31 差分基準 | review と map の既定の diff を同じ1文に：最新 `layer: <層>` の層の最も古い `wip:`/`layer:` の親から。`layer:` がなければ最も古い `wip:` の親、なければ HEAD。数えるのはプロジェクトを変えたコミットだけ。SPEC §7 英日も | review と map が同じ基準の文を含み、`layer:` コミットがない場合を書く |
| #32 規約の文言 | 「機械的に決まる判断・整形・検証は `src/`、対話・モデルが描く図・レビュー（対象の diff の決め方を含む）は SKILL.md」を SPEC §2・§4（英日）・CLAUDE.md §8・AGENTS.md・CONTRIBUTING（英日）に | 日本語の同じ文が SPEC.ja・CLAUDE.md・AGENTS.md・CONTRIBUTING.ja に、英語の文が SPEC・CONTRIBUTING にあり、旧文言（ロジックは全部・呼び方だけ）がない |
- D15: 既定の差分は「層が始まる前」から。`soujo close` の `wip:` コミットも層の一部なので、`layer:` の親からだと層の前半を見落とす。`layer:` がない既存リポジトリで「最初から」にするとリポジトリ全体になるため、最も古い `wip:` か HEAD にする。
- D16: 規約は templates/ に入れない（導入先にはスキルがない）。CLAUDE.md §8 と AGENTS.md の本体節だけを直す。

## L31 の Codex レビュー（`c634956`・0件）
- 指摘なし。Codex は読み取り専用で型検査と11件を実行し（追加3件は変更前で落ちることも確認）、`npm test` 全体と実リポジトリを作るテストは未検証と明記。全383件（382通過・1件スキップ）は手元で通過済み。

## Grok 全件調査の修正の Codex レビュー（2件・`ccbdb99` の後の fix コミット `45dd001`・全部直した）
| # | 指摘 | 直し方 |
|---|---|---|
| 1 | 認証ファイル名の判定が大小文字を区別し、大小文字を区別しないファイルシステム（macOS・Windows）で `.NPMRC`・`ID_RSA` が通る（P2） | `isCredential`：字面で一致しなければ小文字で比べ、そのときだけ `foldsCase` でファイルシステムに聞く。テストは実行環境の側だけを確かめる |
| 2 | `map code` の外部判定が字面のパスで、プロジェクト内の外向き symlink（`external` → 外）に注記が出ない（P2） | `isOutside`：プロジェクトと走査先を実体のパスにし、`pathKey`（NFC・大小文字はファイルシステムの流儀）で比べる。外から中へ向かう symlink は中 |
- 対象は `ccbdb99` になる前の作業ツリー。Codex は読み取り専用で型検査と純粋関数の52件を実行し、書き込みを伴うテストは未実行と明記。全398件（397通過・1件スキップ）は手元で通過済み。

## CI の Ubuntu 失敗（1件・`fee7d51` の test コミットで直した）
| # | 何が | 直し方 |
|---|---|---|
| 1 | `test/cli.test.ts` の「現在のディレクトリを読めない」の lock ケースが Ubuntu の全 Node 版で落ちる（`EACCES` を期待して空）。L24（`50d0c5f`）で足したテストで、CI は `94c1329` の push から失敗し、0.3.2 の `2f7ad21` も同じ | Linux はカーネルが権限を見ずに `getcwd` に答えるので、親を `chmod 000` にしても読める。lock で `code` が空かつ Linux なら `t.diagnostic` を出して飛ばす。macOS（CI の Node 24 を含む）は引き続き試す |
- テストの環境依存だけで `src`・`dist` には関係しないので、v0.3.2 のタグは付け直さない。CHANGELOG(+ja) の未リリース節に記載。手元（macOS）で全398件（397通過・1件スキップ）、CI `35097722752` で全5ジョブ通過。
