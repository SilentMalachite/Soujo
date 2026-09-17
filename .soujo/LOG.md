# LOG

## 2026-09-13 plan
SPEC.md から12層に分割し PLAN.md に記録。md 4本のみの状態から作り直す。
L6 完成までは PLAN/LOG/NEXT を手で更新・コミットし、以降は soujo CLI で締める。

## 2026-09-13 L1 scaffold
TypeScript 7.0.2 / @types/node 20。build は dist/、テストは .test-dist/ に出力。
npm test は shell 展開の .test-dist/test/*.test.js を node --test に渡す（Node 20/22 両対応）。
cli.ts はコマンド表を2語→1語の順に引き、例外は stderr 1行・終了1にする。

## 2026-09-13 L2 state
validateNext は問題の配列、parseNext は無効なら undefined、formatNext/markDone/appendLog は不正で throw。
appendLog は 0〜3 行を許す（log add の「1行以上」は L4 で検査）。PLAN は最初の「 — 」で層名と完了条件に分ける。
CRLF の PLAN/NEXT も読め、markDone は改行コードを保つ。

## 2026-09-13 L3 io
writeState は一時ファイル→rename で書き、symlink を保つ。読み書きの失敗は1行の日本語エラーに包む。
git の失敗は stderr 先頭行（なければ stdout 末尾行）で「git <cmd> に失敗: …」。コミットなし・repo 外は undefined。
テスト用 repo は user と commit.gpgsign=false をローカル設定する。

## 2026-09-13 L4 init-plan-log
templates/NEXT.md は「次: spec」の有効な NEXT。templates の CLAUDE.md/AGENTS.md はルートとの一致をテストで守る。
packageDir は package.json を上へ探す（dist/ と .test-dist/src/ のどちらからも templates に届く）。
コマンドは (args, cwd) を取る関数。parseArgs の英語エラーは cli.ts で1行の日本語に訳す。

## 2026-09-13 L5 next
next check は問題を「 / 」で1行に連結し、--hook では {"systemMessage"} にする。予期しない失敗も警告に変えて終了0。
未コミット検査は git 管理下のときだけ。next check は未知の引数を無視する（hook から常に終了0）。
next show --hook はプロジェクト外・NEXT.md なし・読めないときに無音。

## 2026-09-13 review-fix
レビュー #1〜#6 を修正: コマンド表は自身のキーだけ引く / .soujo/ 探索は .git のある階層で止める（SPEC §6 も更新）。
build・test は出力先を消してから tsc / git 呼び出しの maxBuffer を 256MB に。
PLAN の区切りは — に加え – -- - の独立トークンも認める / 末尾空白と区切り判定を線形時間に（trimEnd・トークン分割）。

## 2026-09-13 L6 layer-done
状態は書く前に決める: 件名完全一致でコミット済み→拒否 / PLAN 未チェック→PLAN・LOG・commit / チェック済み未コミット→LOG は最後が同じ層なら足さず commit。
add/commit 失敗は「PLAN と LOG は記録済み。再実行でコミットだけやり直す」を付けて投げる。
この層から soujo CLI 自身で締める。

## 2026-09-13 review-fix-l6
L6 レビュー #1〜#4 を修正: HEAD の PLAN でチェック済みなら別件名でコミット済みとして拒否（やり直しは作業ツリーだけチェック済みのとき）。
merge/rebase/cherry-pick/revert の途中・競合未解決なら拒否。コミット有無は rev-parse --verify で判定し git 失敗は投げる（spawnSync 化）。
layer done の出力に追加ファイルを最大5件添える（ほかN件）。

## 2026-09-13 next-guard
L6 レビュー #5 を修正: layer done は NEXT.md がない・無効・次がまだ締める層のとき、何も書かずに拒否する（先に next set を促す）。
SPEC §6 の layer done 行と §14 を更新（未決から決定へ移動）。

## 2026-09-13 pre-l7-fixes
SPEC §6 の layer done 行を実装に合わせた（拒否条件・途中再開・追加ファイル表示）。
gitCommitAll（add→staged 確認→commit、変更なしは false）を追加し L7 close でも使う。.soujo/ が git に無視されていれば拒否。書いた後の失敗は記録済みの範囲と再開方法を添える。
test/dist.test.ts: dist/ が .test-dist/src と一致しなければ npm test が落ちる（build 忘れ検知）。

## 2026-09-13 codex-review-fix
Codex レビュー #2 #10 #11: HEAD の PLAN でチェック済みなら作業ツリーの状態に関係なく拒否 / 再実行でも note を検証 / ignore 検査に SPEC.md を含める。
#12 #13: layer done は書く前に writeState の一時ファイルの残骸を消す / コミット後の一覧取得失敗でも成功を出力。
#9 #21 #24: LOG の見出し禁止を lastLog と同じ規則に / NEXT は末尾の改行1つだけ除いて行数を数える / LOG 追記は既存テキストを接頭辞のまま残す。

## 2026-09-13 L7 resume-close
resume: 次/前回/コミット/再開の4行。NEXT がない・無効なら PLAN の次の層と next set を示し、層が尽きたら plan。
close: NEXT 検証→「中断: …」を NEXT の層で LOG へ→wip コミット。LOG の最後が同じなら追記せず再実行はコミットだけ。
コミット前提の検査を gitRequireCommittable（git.ts）へ移し layer done と共有。

## 2026-09-13 review-fix-l7
L7 レビュー #1〜#37 を修正: close は HEAD に無い末尾の中断エントリだけ再利用 / PLAN チェック未コミット（layer done 途中）は拒否 / next set 後に止まったら未チェックの層で wip。
resume は NEXT 無効・完了済み・層飛ばし・layer done 途中をそれぞれ案内し、読めない行だけ縮退、値は60文字で切る。next check も層飛ばしを警告。
git の add/commit/status は -- . でプロジェクト内に限定、.soujo/ の symlink を拒否、出力の制御文字を空白に、CRLF の LOG は CRLF で追記。共有処理は commands/shared.ts。

## 2026-09-13 L8 map
map.ts（純粋関数）: planDiagram は層ごとに2行・次の層に ←次・完了条件を縦線の横に。importGraph は LANGUAGES（TS/JS 1行）の相対 import を Mermaid graph LR に（.js→.ts 置換・index 解決・外部パッケージ除外）。
未対応言語だけのディレクトリは directoryTree（フォルダ先・コードポイント順）。走査は node_modules・dist・ドットエントリ・symlink を飛ばす。
commands/map.ts が走査と読み込み、cli.ts に map plan / map code [dir] を追加。

## 2026-09-13 review-fix-l8
L8 レビュー #1〜#29 を修正: map code は主言語（ファイル数最多）で図か木を選ぶ。LANGUAGES は1言語1行で import 規則（抽出・解決）を行に持ち、規則のない言語は木。
TS/JS は字句解析でコメント・文字列・正規表現を除いて import を抽出。解決は TS 流の拡張子対応・./.. は index のみ・自己参照除外・大文字小文字無視。ID はパス由来。
既定はプロジェクトルート。出力は ASCII、上限（走査5000・ファイル100・線300・木200行）と読めない件数を注記。formatItem・readPlan を共有、SPEC §6 を更新。

## 2026-09-13 L9 skills
skills/ 7本（spec/plan/go/resume/map/review/close）: frontmatter は name/description のみ、4節×各3行以内、読むもの1行目でプロジェクト側を明示。
agents/reviewer.md: review から1体だけ、diff の指摘を絞らず表で返す。編集・コミットしない。
test/skills.test.ts が7本の構成・frontmatter・節と行数・reviewer を検証。

## 2026-09-13 review-fix-l9
L9 レビュー #1〜#53 を修正: 読むもの1行目は PATH の soujo を使い置き場所の .soujo/・dist/ を使わない旨に。go は soujo resume から入り、最後の層の後は 次: plan、--effort 必須、git に書けなければ権限を求めて再実行。
review/map の範囲は最新 layer: コミットの親から作業ツリー（未追跡含む）で soujo:reviewer の表を加工せず出す。spec は答えるたびに書き1回1問、plan は層名の制約、close は一言がなければ進捗を渡す。
next set は PLAN にない層（spec/plan 除く）を拒否、init は git 外で git init を促す。skills.test は CLI のコマンド・オプション・禁止語も検査。#10 #53 は変更なし、#14 は SPEC 未決へ。

## 2026-09-13 L10 hosts
両マニフェスト（name/version/description/license は package.json と一致）・両マーケットプレイス（"./"）・hooks.json（SessionStart: next show --hook / Stop: next check --hook）。
claude plugin validate . と validate_plugin.py が通る。実機で hooks の発火と、/soujo:resume・$resume が組み込みと衝突せず soujo のスキルに解決されることを確認。
test/hosts.test.ts がマニフェスト・マーケットプレイス・hooks の形とフック実行を検証。SPEC §14 に2行追記。

## 2026-09-13 review-fix-l10
L10 レビュー #1〜#11 を修正: claude plugin validate . はマーケットプレイスだけを見るので、plugin.json（agents・hooks 込み）の検証を SPEC §8/§14 に追加。
Codex 0.154 は hooks/hooks.json を見つけ、信頼後だけ実行（未信頼の exec では無動作）と SPEC §4/§8 に記録、信頼後の動作は未決へ。キャッシュがリポジトリ全体の複製である旨も §8 に。
衝突確認は resume の実行のみと明記。両マニフェストの hooks 不在・marketplace の説明/カテゴリ一致をテスト、repo() で showUntrackedFiles を固定、defaultPrompt は $spec から。#11 は重複なしを確認し変更なし。

## 2026-09-13 L11 docs
README/CHANGELOG（+.ja.md）: 仕組み・導入（npm link、両ホストの marketplace add と install）・始め方・ホスト差・CLI 一覧。
npm link は bin に実行ビットを付けて作業ツリーを変えるので、build が dist/cli.js を 755 にする。隔離 prefix で npm link 後に soujo が PATH から動くことを確認。
Claude Code 2.1.270 も導入時に作業ツリーをキャッシュへ複製し同版の update は無視と判明、SPEC §8 を更新。docs.test が英日の対応・コマンド・リンク・版を検証。

## 2026-09-13 review-fix-l11
L11 レビュー #1〜#21 を修正: 実行ビットの検査は所有者ビットだけ。引数付きの soujo span は使い方エラーも検出。docs.test は英日のブロック構成とリンクのアンカーも照合。
README: review の範囲・effort は会話で設定・map は図・--hook・--line の繰り返し・<dir>・PATH の soujo は必須・Codex の hooks は信頼しない。CHANGELOG は unreleased。
新しい clone で npm link / npm i -g . が node_modules なしで動き、Claude は再インストールだけで更新・git 無視のファイルも複製と確認（SPEC §8）。#18 は NEXT へ、#19 #20 は変更なし。

## 2026-09-13 L12 accept
実環境で npm link・claude plugin install・codex plugin add の後、AgentReview の複製で spec・plan・L1=Claude Code / L2=Codex / L3=Claude Code を各新セッションで通し基準1〜4 ✓（spec 3問）。
基準5 close 終了1・無書込/next check 警告、6 Stop は systemMessage のみ、7 validate_plugin.py、9 npm test 171件、10 soujo が PATH から本リポジトリの dist/cli.js を指す。
基準8 は reviewer の8件を順に全部出したがセルを言い換えた（SPEC §14 未決へ）。SPEC §12 の冒頭文と状態欄を結果で書き直し。

## 2026-09-13 review-fix-l12
L12 レビュー #1〜#25 を修正: Claude Code はローカルのマーケットプレイスをその場で読む（init の path と、足したスキルが入れ直しなしで出ることで確認）ので SPEC §8・README を訂正。
§12 に手順と前提（既存 AGENTS.md・権限指定・spec は --resume で4往復）、基準6のクリーンな木の経路を追記。validate_plugin.py は終了0、soujo は本リポジトリの dist/cli.js を指す。
§14 に review の加工・reviewer の絶対パス・許可リストでの拒否・範囲外の変更を追加。#20 は公開リポジトリなので変更なし、#21 #22 は LOG が追記専用のため本エントリで補う。

## 2026-09-13 plan
§14 の未決からユーザーが CLI の小修正だけを選び、L13 help（soujo --help）と L14 effort（next set が spec/plan に high を書きほかを拒否）を PLAN に追加。ほかの未決は層にしない。
SPEC §6 に --help の行と next set の effort 規則、§13 に L13/L14、§14 は2件を未決から決定へ（英日）。
レビュー #1〜#19 を修正: --help の判定位置・1語目・--hook との優先・stdout と終了0・使い方の出所・拒否時の無書込と案内を明記し、完了条件と NEXT の注意を具体化。#20（plan の effort の理由）は変更なし。

## 2026-09-14 L13 help
soujo --help / -h は全コマンド、<コマンド> --help はその1行、2語コマンドの1語目ならその語のコマンドを stdout に出して終了0。
help はほかの引数より先に判定（-- の後と --x=--help は対象外）し、使い方はコマンド表の usage 1か所から help とエラーの両方に出す。
コマンドなし・不明なコマンドのエラーに（soujo --help で一覧）。書き込みコマンドに付けても何も書かないことをテスト。README・CHANGELOG(+.ja) に追記。

## 2026-09-14 review-fix-l13
L13 レビュー #1〜#19 を修正: help の順を SPEC・README に合わせ log add → layer done に。不明なコマンドは打たれた名前を「」で示し（2語目も含む）、空白入りの1引数はコマンドにしない。
SPEC に next check は使い方エラーなし・1語目の後の不明な語は無視を明記。テストは期待行の完全一致、-- の後の -h、--note=--help、--help=x、空文字、Object.prototype 名＋--help を追加し重複を整理。
README・CHANGELOG(+.ja) に1語目での一覧とエラーの案内。NEXT の注意を nextSet の処理順に。L13 の LOG は「エラーに（soujo --help で一覧）を付けた」の意（#19）。

## 2026-09-14 L14 effort
next set は層 spec/plan（trim 後）に effort high を書き、ほかの --effort は何も書かずに「--effort を外して再実行」で拒否。
判定は formatNext より前で、層以外の既定 medium は変えない。受け入れ・拒否と無書込を next.test に追加。
spec・go スキルの plan 行きの next set から --effort を外した（go の節は3行のまま）。

## 2026-09-14 review-fix-l14
L14 レビュー #1〜#20 を修正: effort の判定を formatNext・validate の後にし、high\n や HIGH は通常の1行・値のエラーで拒否。層名は「」で示し、Effort 型・const・返り値の layer に整理。
spec/plan は trim 後に大文字小文字も含め完全一致（SPEC 英日に明記）。テストは全文比較・改行と大文字・.soujo なしの順・CLI の拒否、skills.test で plan 行きに --effort がないことを検査。
go は plan 行きを完全なコマンドで示し、spec・go は --layer を引用符で、plan スキルは未完了の層がなければ next set しない。README(+.ja) に high 固定。L14 の LOG の「層以外」は「spec/plan 以外の層」（#19）。

## 2026-09-14 privacy-guard
個人情報・認証情報の混入を確認: 追跡ファイル・作者情報（GitHub noreply）・キャッシュに混入なし。公開済みの ac20cbd・23c7ace・1fbe16a のメッセージに Claude のセッション URL の trailer がある（未対応）。
test/privacy.test.ts が追跡ファイルの認証情報・セッション URL・ホームの絶対パス・個人のメールと認証ファイル名を検出。.gitignore に認証ファイルを追加。
CLAUDE.md/AGENTS.md（+templates）の秘匿情報の規則にセッション URL・認証ファイル・ホームのパスを明記。ローカルの .git/hooks/commit-msg が同種のメッセージを拒否。

## 2026-09-14 history-rewrite
ユーザーの判断で main の履歴を書き換え、L7〜L9 レビュー修正の3コミットのメッセージからセッション URL の行を削除（ファイル・作者・日時・件名は同一）。
新しいハッシュは 6d9497f（L7）・a2bde52（L8）・a78d0d8（L9）。privacy-guard エントリの ac20cbd・23c7ace・1fbe16a はこの3件の旧ハッシュ。
L7 以降の全コミットのハッシュが変わったので、GitHub へは --force-with-lease で push する。

## 2026-09-14 codex-review-write-safety
Codex 全体レビュー #1・#5・#6: writeState は実体（symlink の先）がプロジェクト外・.git 内なら書かず、一時ファイルを wx で排他作成して自作分だけ消し、元の権限を保つ。
removeLeftoverTemps は一時ファイル名の symlink も消し、プロジェクト外の実体の隣は触らない。SPEC(+ja) §6・§14 に明記。

## 2026-09-14 codex-review-records
Codex 全体レビュー #2〜4・#7〜9: layer done は PLAN/LOG/NEXT がステージされていなければコミットせず、LOG の再利用は HEAD にない完了エントリだけ（中断は除く）。
requireCommittable は symlink の先の外部・.git・無視と sequencer/ を拒否。次: plan は全層の後ろとみなし、git status は -unormal 固定。
SPEC(+ja) §6・§14 に明記。

## 2026-09-14 codex-review-map
Codex 全体レビュー #10〜12: map code の TS/JS 解析で、JSX の </・後置 ++/-- の後の / を除算、if/while/for/with の条件の ) の後の / を正規表現とみなす。
文字列とテンプレートのエスケープ（\x・\u・\u{}・行継続）を復号し、不正なもの・連結など固定値でない import/require の引数は線にしない。SPEC(+ja) §6 に明記。

## 2026-09-14 codex-review-resume
Codex 全体レビュー #13: resume の 次:・前回:・再開: の層名も60文字で切る（soujo layer done などコマンドの引数は切らない）。SPEC(+ja) §6 に明記。

## 2026-09-14 github-install
GitHub から直接導入: CLI は npm install -g <アーカイブ URL>（github: 形式は npm 10 で一時複製へのリンクになり再導入で失敗）、プラグインは両ホストとも marketplace add SilentMalachite/Soujo。
.claude-plugin/plugin.json から version を外しコミットを版にした（ローカル導入で版が短い SHA になるのを確認）。Codex は version を保つ。
README(+ja) の導入・更新・開発、SPEC(+ja) §4・§8・§14、CHANGELOG(+ja)、hosts.test を更新。

## 2026-09-14 release-0.1.0
0.1.0 をリリース（2026-09-14）: CHANGELOG(+ja) を英語正本の Added 形式にし、日付とリリースへのリンクを付けた。
CONTRIBUTING・SECURITY・CODE_OF_CONDUCT（各 +ja）、.github の Issue フォーム2種・config・PR テンプレートを追加。docs.test で英日の構成を比較。
README(+ja) の開発節と SPEC(+ja) §4 に追記。SECURITY は GitHub の非公開の脆弱性報告を窓口にする。

## 2026-09-14 ci
GitHub Actions の CI を追加: push（main）と PR で npm ci → npm test。Ubuntu の Node 20・22・24・26 と macOS の Node 24。
actions/checkout v7.0.1・setup-node v7.0.0 を SHA で固定、permissions は contents: read。CONTRIBUTING(+ja)・SPEC(+ja) §4 に追記。

## 2026-09-14 dependabot
Dependabot を設定: github-actions と npm（devDependencies）を毎月、それぞれ1つの PR にまとめる。@types/node のメジャー更新は engines の下限に合わせて除外。
リポジトリの Dependabot アラートとセキュリティ更新を有効化。CONTRIBUTING(+ja)・SPEC(+ja) §4 に追記。

## 2026-09-14 readme-badges
README(+ja) の言語切り替えの下に CI と TypeScript のバッジを追加。TypeScript は shields.io が GitHub 上の package.json の devDependency から版を読む（Dependabot の更新に追従）。

## 2026-09-14 readme-badges
README(+ja) に 0BSD のライセンスバッジ（LICENSE へのリンク）を追加。GitHub は LICENSE を 0BSD と判定しない（NOASSERTION）ので、動的ではなく固定のバッジにした。

## 2026-09-14 license-text
LICENSE を choosealicense.com の BSD Zero Clause License の標準の書式に（条項は同一、著作権表示 2026 Silent Malachite を追加）。GitHub が 0BSD と判定した。
README(+ja) のライセンスバッジを、GitHub の判定を読む動的なもの（0BSD 表示を確認）に切り替え。

## 2026-09-14 release-0.1.0
ユーザーの判断で v0.1.0 のタグを最新の main に付け替え（旧 bac8682）、CI・Dependabot・標準の LICENSE・英日の文書をリリースに含めた。
CHANGELOG(+ja) の 0.1.0 に文書と設定の項目を追加し、リリースノートを差し替え。

## 2026-09-14 grok-review
grok レビュー #1〜#12 を調査し、誤検知の #11（npm の group は dependency-type だけで有効）以外を修正。
close も PLAN・LOG・NEXT が書いたとおりステージされるまでコミットしない（commitRecords に共通化）。next set・log add も残った一時ファイルを消す。
privacy テストはコミットメッセージ・拡張子なしの SSH 鍵・末尾区切りなしのホームパスも検査し、SSH の git@ と .env.example を除外。CI は全履歴を取得。

## 2026-09-14 release-0.1.1
0.1.1 をリリース（2026-09-14）: grok レビューの修正（close のステージ確認・一時ファイル掃除・privacy 検査の拡張）。
package.json・package-lock.json・.codex-plugin/plugin.json を 0.1.1 にし、CHANGELOG(+ja) に Fixed / Changed を追加。

## 2026-09-14 codex-upgrade-local
Codex で upgrade が local のマーケットプレイスに失敗する（not configured as a Git marketplace、終了1）ことを隔離した CODEX_HOME で再現。
README(+ja) の更新と開発の節・SPEC(+ja) のホスト表に remove → add SilentMalachite/Soujo → plugin add での GitHub 版への切り替えを追記。
v0.1.1 のリリースノートの Update にも同じ案内を追加。

## 2026-09-14 claude-return-github
Claude Code を remove → add SilentMalachite/Soujo → install で GitHub 版に切り替え、marketplace update と plugin update が通ることを確認。
README(+ja) の開発の節の戻し方に Claude Code のコマンドを追加。

## 2026-09-15 grok-review-2
grok レビュー #1〜#10 を調査し、誤検知の #1（hash-object はパス指定で eol・clean filter を掛ける）以外を修正。
layer done・close は HEAD に無い LOG エントリを位置によらず探し（uncommittedLogs）、layer done は 中断: で始まる note を拒否。init も一時ファイルを消す。
map は </ 以外の < の後と for await ( の後を正規表現に。privacy は git@/noreply@ を特定アドレスに限定、.netrc 等を無視。

## 2026-09-15 release-0.1.2
0.1.2 をリリース（2026-09-15）: grok レビュー2回目の修正（LOG エントリの再利用・map の正規表現判定・privacy 検査）。
package.json・package-lock.json・.codex-plugin/plugin.json を 0.1.2 にし、CHANGELOG(+ja) に Fixed / Changed を追加。

## 2026-09-15 grok-review-3
grok レビュー3回目の #1〜#7 をすべて修正（#6 は任意表記への注記のみ）。
readState と init はプロジェクト外・.git 内への symlink を拒否し、読むのは通常ファイルだけ。init は一時ファイル＋link で作る。
PLAN の層名の重複と spec/plan を next set・layer done が拒否し next check が警告。templates の CLAUDE/AGENTS から本体スタックを外した。

## 2026-09-15 release-0.1.3
0.1.3 をリリース（2026-09-15）: grok レビュー3回目の修正（読み取りと init の symlink 制限・init の原子的作成・層名の重複と spec/plan の拒否）。
package.json・package-lock.json・.codex-plugin/plugin.json を 0.1.3 にし、CHANGELOG(+ja) に Fixed / Changed を追加。

## 2026-09-15 L15 log-rotate
rotateLog/archiveLog は純粋関数。書庫→LOG.md の順に書き、止まった rotate の変更だけは dirty でも許して再実行で仕上げる。
書庫名は StateFile に LOG-YYYY-MM.md を足して同じ in-project 検査を通す。next check は3か月以上で警告。
版は 0.2.0 — unreleased（package.json・Codex マニフェスト・CHANGELOG）。SPEC.ja.md も同期。

## 2026-09-15 review-fix-l15
L15 レビュー #1〜#25 を修正: 止まった rotate の例外を「LOG.md は丸ごとのエントリ削除だけ・書庫は丸ごとの追記だけ・消えたエントリは同じ月の書庫にある」に限定し、symlink の実パスも除外。重複省きは止まった rotate の書庫だけ。
エントリは LOG.md の行の形のまま移す（LogBlock）。月は01〜12を state.ts の1か所で検証し statePath でも名前を検査。拒否時は一時ファイルを消さない。出力は2行、件名は <最初>..<最後>。next check は rotate が2か月分以上移せるとき警告。
版は 0.1.3 に戻し CHANGELOG は Unreleased（Added/Changed）。サブディレクトリ・CRLF・HEAD の書庫・手でコミットした書庫・layer done/close 後続のテストを追加。SPEC(+ja)・README(+ja) を同期。

## 2026-09-15 grok-fix-l15
grok レビュー10件を修正: 止まった rotate は「追記した書庫はその月のエントリを1件以上」「消えた・足されたエントリは HEAD の LOG.md を rotate して移るもの」に限り、この --before で移らなければ前回と同じ --before を案内。
重複省きは書庫の作業ツリーの中身（今回より前に LOG.md から消えた分を除く）と比べ、書庫だけ先に手でコミットしても二重に足さない。移動なしでも拒否判定の後は一時ファイルを消す。LOG の日付は暦日まで検証。
PLAN L15 の完了条件を2か月分に、SPEC(+ja)・README(+ja) の LOG.md を「追記だけ」から直し、CHANGELOG の Unreleased を docs テストと CONTRIBUTING(+ja) で明示。cli の --help 無書込に log rotate を追加。

## 2026-09-15 release-0.2.0
0.2.0 をリリース（2026-09-15）: soujo log rotate（過去の月を LOG-YYYY-MM.md へ移してコミット、止まった rotate は再実行で仕上げる）と next check の rotate 警告。
package.json・package-lock.json・.codex-plugin/plugin.json を 0.2.0 にし、CHANGELOG(+ja) の未リリース節を 0.2.0 — 2026-09-15 にした。

## 2026-09-15 L16 brief
soujo brief（進捗・以後・節目・空白・次の5行、行ごとに縮退）を追加
resume の 再開: に最終コミットから3日以上で ・N日ぶり: 先に soujo brief
Commit に committer date、git に gitFindCommitStarting / gitCommitsAfter

## 2026-09-15 節目
PLAN の全層完了: L16 brief と L17 節目で、数日空いた後の戻り道ができた
未決: SPEC §14 Open の6件（Codex フック・skill 置き場所ガード・spec 途中書き 等）

## 2026-09-15 L17 milestones
spec・plan・go スキルがフェーズの区切りに soujo log add 節目 を書く（plan は層名を 節目 にしない）
CLAUDE.md・AGENTS.md（+templates）に節目と N日ぶり→soujo brief、README(+.ja)・CHANGELOG(+.ja) に記載

## 2026-09-15 grok-fix-l17
grok レビュー L17 の13件を修正: log rotate は最後の 節目 も LOG.md に残し、PLAN の層名 節目 は spec/plan と同じく拒否。log add は HEAD にない同じ最後のエントリを再び足さない
CLAUDE/AGENTS(+templates) の固定手順1番に最後の層の節目、resume と brief を別の行に。go スキルは締めの順と再実行を分け、skills テストで節目を固定。SPEC・README・CHANGELOG(+ja) 同期
訂正: 2026-09-15 節目 の未決は §14 Open の9件（6件は誤り）

## 2026-09-15 節目
PLAN.md に 1層: L18 plugin-guard（SPEC §14 Open のスキル置き場所ガードを決定へ移した）
外したもの: Open の残り8件（Codex フック・spec/plan の未コミット・reviewer の表 等）はそのまま

## 2026-09-15 節目
L18 まで完了: プラグインの置き場所（.claude/plugins・.codex/plugins）で soujo が動かないガードを実装
未決: SPEC §14 Open の各項目（Codex フックの展開、spec の逐次書き込み、review の表の無編集など）

## 2026-09-15 L18 plugin-guard
cwd の実パスに .claude/plugins か .codex/plugins があれば --help とフック以外を読み書き前に拒否
next show/next check は findStateDir が undefined を返しプロジェクト外と同じに振る舞う

## 2026-09-15 grok-fix-l18
grok レビュー L18 の14件を修正: pluginDir は大文字小文字を区別せず、実パスが求まらないとき求まる最も近い祖先の実パスで判定
--hook なしの next show もプラグイン配下で拒否（soujo init への誤誘導をなくす）。SPEC §6/§14・README・CHANGELOG(+ja)・PLAN L18 の文言を next check/next show --hook とそれ以外に分けた
テスト: 判定は全 OS、symlink・EACCES・ELOOP は win32 skip。.git なしキャッシュ、-h・next --help、未知コマンド・空 argv・外の dir への map code を追加

## 2026-09-15 release-0.3.0
0.3.0 をリリース（2026-09-15）: soujo brief と resume の N日ぶり、節目エントリ（spec/plan/go）、プラグインの置き場所での実行拒否
数週間の空白を再現して確認（26日ぶり→brief→rotate 後も節目が残る）。README(+ja)・SPEC(+ja) の再開を「数日〜数週間」に
package.json・package-lock.json・.codex-plugin/plugin.json を 0.3.0 にし、CHANGELOG(+ja) の未リリース節を 0.3.0 — 2026-09-15 にした

## 2026-09-15 節目
PLAN.md に 1層: L19 resume-brief（resume スキルが N日ぶり のとき soujo brief も返す。SPEC §3・§7・§14 に決定を記載）
外したもの: なし

## 2026-09-15 節目
L19 まで完了: resume スキルが 再開: に N日ぶり があるとき soujo brief も実行し、4行の後に5行を返す
未決: SPEC §14 Open の各項目（Codex フックの展開、spec の逐次書き込み、review の表の無編集など）

## 2026-09-15 L19 resume-brief
resume スキルは 再開: に N日ぶり があれば soujo brief も実行し、4行の後にその5行をそのまま返す
skills テストで順序と条件を固定。SPEC(+ja) §3・§7・§14、README(+ja)、CHANGELOG(+ja) の Unreleased に記載

## 2026-09-15 grok-fix-l19
grok レビュー L19 の15件を修正: resume スキルは 再開: で始まる行が 日ぶり: 先に soujo brief で終わるときだけ4行の後に brief、失敗時の出力を resume/brief で分けた
go・CLAUDE/AGENTS(+templates) は go の中で brief を走らせない。skills テストで CLI の実出力・条件・否定・失敗の形・go の非実行を固定。SPEC §7・README・CHANGELOG(+ja) 同期
訂正: L19 の SPEC(+ja) §3・§7・§14 は親の docs: plan L19 で記載（L19 のコミットは README・CHANGELOG・スキル・テスト）

## 2026-09-15 release-0.3.1
0.3.1 をリリース（2026-09-15）: resume スキルが 再開: の brief 案内に従い4行の後に brief の5行を返し、go とテンプレートは go の中で brief を走らせない
package.json・package-lock.json・.codex-plugin/plugin.json を 0.3.1 にし、CHANGELOG(+ja) の未リリース節を 0.3.1 — 2026-09-15 にした

## 2026-09-16 節目
PLAN.md に 12層: L20 git-env〜L31 skills-docs（Codex 全体レビュー44件の TDD 修正、対応表は .soujo/REVIEW-FIX.md）
外したもの: Windows の CI ジョブ、#40 の挙動変更（SPEC に制約として書く）

## 2026-09-16 L20 git-env
git の実行から GIT_DIR など別リポジトリを指す環境変数を外し、toplevel は not a git repository のときだけ undefined（他の失敗は throw、resume/brief/next check は縮退）
git の出すパスは改行だけ除く。テストの git はグローバル・システム設定を読まない（REVIEW-FIX #4 #9 #23 #39）

## 2026-09-16 L21 git-scope
layer コミットの検索と brief の履歴を git log -- . でプロジェクトに限定（空コミットも数えない）
headState は HEAD のエントリで読み symlink を HEAD のリンク先へ辿る。commitRecords は symlink 自身の staging も検証、gitCommitAll 削除
全テストの1回だけ log rotate の既存テストが落ち、以後7回再発せず（要観察）

## 2026-09-16 codex-fix-l21
Codex レビュー L21 の2件を修正: headState は HEAD のパスを realpath と同じく1要素ずつ解き、途中のディレクトリ symlink とその後の .. を辿る（symlink は最大40回）
symlinkTargetPath を symlinkTargetParts にし、Windows では相対リンクを \ でも区切る。SPEC(+ja)・CHANGELOG(+ja) 同期、指摘は REVIEW-FIX.md

## 2026-09-16 L22 state-targets
.git を大小文字問わず拒否し、状態ファイル・書庫の実体の重複（symlink・大小文字違い・hardlink・壊れた symlink の先）を stateTarget で拒否
読み込みも同じ規則で拒否（stateTarget を共有）

## 2026-09-16 L23 file-create
hardlink を張れない FS では copyFileSync(COPYFILE_EXCL) で複製し、rename で既存を置き換えない。生存中 pid の一時ファイルは消さず、stateTemps がコミット検査から除く。createFile は既存があれば何も書かないので、揃った読取り専用ディレクトリで init が成功する。

## 2026-09-16 L24 cli-robust
案内するコマンドの層名を単一引用符で囲み（-- 前置つき）、cwd を取れないとき hook のコマンドは無言で終了0、stdout の EPIPE で落ちず、エラーのホームパスを ~ にした。
reviewer の指摘18件は REVIEW-FIX.md に未対応で記録。

## 2026-09-16 L25 plan-parse
PLAN の層名は空も制御文字も行番号付きで拒否し、完了条件のない層は layer done が締めない。
コードフェンスの中のチェック項目は層として数えない（parsePlan・markDone・validatePlan）。
printable が C1 制御文字（U+0080-U+009F）も空白にする。

## 2026-09-16 L26 next-log
新しい書庫は # LOG <月> の見出しの下だけ rotate の仕事と認める。確認と完了条件の違いを next check が警告し、無効な NEXT を next show が1行で診断する。
NEXT・PLAN・LOG は1つ読めなくても他の警告が残る。#40（同じ内容のエントリは書庫に写しがあると1本になる）を SPEC に記載。
レビュー32件のうち30件を同じ層で修正（#19 パース回数・#28 Fixed 節は見送り）。

## 2026-09-16 L27 map-lexer
ブロックの "}" とオブジェクトリテラルの "}" を Token.block で分け、ブロックの後の "/" を正規表現として読む。
行コメント・正規表現リテラルを LF/CR/U+2028/U+2029 で、閉じ忘れの引用符を LF/CR で終える。
ASCII 超の空白を語の字から外し、reviewer 25件のうち20件を同じ層で直した。

## 2026-09-16 L28 map-jsx
JSX の本文と属性の文字列をコードとして読まなくなり、要素の { } の中だけを import として拾う。
拡張子で JSX の可否を決める（.ts / .mts / .cts は型、それ以外は要素）。
reviewer の20件のうち17件を同じ層で直した（誤検出3件を含む）。

## 2026-09-16 L29 map-resolve
query・fragment・%エンコードを解く。大小文字と正規化は FS の流儀に従う。1ファイル512KiBまで、切れたファイルは最後の完全な行まで。

## 2026-09-16 L30 privacy-ci
privacy テストが全 ref の blob・コミットとタグのメッセージ・Codex と ChatGPT のリンクを検査し、自身は架空値（SYNTHETIC）だけ通す。
docs テストに SPEC を加え、英日の差2か所を直した。npm test は test/run.ts が列挙して node --test に渡す（D11〜D14）。

## 2026-09-16 節目
PLAN の全層完了: Codex 全体レビュー44件の修正（L20〜L31）で git の範囲・状態ファイルの実体・map の字句解析と解決・privacy と CI・スキルの規約を直した
未決: なし

## 2026-09-16 L31 skills-docs
review は soujo を呼ばないので止まらず、map は plan/code だけ止まる（skills.test が頼むことから組んだ文と照合）
既定の diff を review と map で同文に：最新 layer の層の最も古い wip/layer の親から、layer がなければ最古の wip か HEAD（D15）
境界の規約を SPEC(+ja)・CLAUDE.md・AGENTS.md・CONTRIBUTING(+ja) で同じ文言に（D16: templates には入れない）

## 2026-09-16 release-0.3.2
0.3.2 をリリース（2026-09-16）: L20〜L31 と Grok 全件調査・Codex レビューの修正（resume のコミット行・close の PLAN 検査・認証ファイルの拒否・暦日など）
package.json・package-lock.json・.codex-plugin/plugin.json を 0.3.2 にし、CHANGELOG(+ja) を 0.3.2 — 2026-09-16 に。README(+ja)・SECURITY(+ja)・CLAUDE.md(+template) を同期

## 2026-09-17 節目
PLAN.md に 6層: L32 phase-converge〜L37 converge-verify（Spec-kit の constitution を SPEC の原則に、converge を最後の層の後のフェーズに。SPEC(+ja) §3・§5〜§7・§9〜§14 に記載）
外したもの: フェーズの記録をコミットするコマンド（§14 未決に残す）・soujo map spec・原則の版番号と同期レポート

## 2026-09-17 L32 phase-converge
converge を PHASES に追加（全層の後ろ・effort high・層名で拒否）
全層完了で NEXT.md が使えないとき resume は /soujo:converge を示す
state/next/resume/layer テスト追加、CHANGELOG(+ja) 記載

## 2026-09-17 L33 spec-check
validateSpec: 原則7行超・形の違う行・キーのない基準・重複キーを行番号付きで返す
next check が SPEC の問題と読めない SPEC.md を警告（PLAN の後ろ）
コードフェンス走査を eachOutsideFences に共通化、CHANGELOG(+ja) 記載

## 2026-09-17 codex-fix-l33
Codex レビュー L32〜L33 の6件を修正: 原則は字下げなしの - と — だけを認め、本文を挟むコメント行も行に数え、字下げ・別記号の原則のキーも重複検査に入れる
テスト追加: 全層完了で NEXT を読めない resume・converge での close・validateSpec の長大入力。指摘は REVIEW-FIX.md

## 2026-09-17 L34 spec-template
templates/SPEC.md に原則の節とキーの形（1行コメント）、NEXT テンプレートの確認に原則
specUnwritten（state.ts）: 見出し・空行・HTML コメントだけの SPEC を旧テンプレートも含め未作成とみなし resume が使う
テスト追加、CHANGELOG(+ja) 記載

## 2026-09-17 codex-fix-l34
Codex レビュー L34 の8件を修正: specUnwritten を行単位に（コード字下げ・コメント横の文・BOM・CR 改行）、判定は # 見出しに限ると SPEC(+ja)・CHANGELOG に明記
SPEC §5 の節目の書き手に converge を追加。後続層分（plan 予約名・plugin.json・CLAUDE.md effort 行）は NEXT の注意へ。指摘は REVIEW-FIX.md

## 2026-09-17 L35 skill-converge
skills/converge/SKILL.md を追加（SPEC §7。差が残れば層を追加・なければ収束して次: plan）
go は最後の層で 節目 → next set converge → layer done → converge。plan の予約名に converge
skills・hosts テスト、README(+ja)・plugin.json・CLAUDE/AGENTS(+tpl)・SPEC(+ja) §7・CHANGELOG(+ja) 同期

## 2026-09-17 codex-fix-l35
Codex レビュー L35 の11件を修正: converge は差か未完了層が残るかで分岐し、NEXT は状態で直す。キーなし SPEC・wip・PLAN の問題で停止も明記
plan は追記だけ。skills テストに本文の条件と CLI の終わり方を追加、README・SPEC(+ja)・CHANGELOG 同期。L36 分4件は予定どおり

## 2026-09-17 L36 skill-principles
spec は原則を1問で決め P/A キー付きで5節を書き、原則の節は空のままにする。go は原則に反するときだけ1問聞く
review と reviewer は原則を読み、違反を P<n> で始めて先に並べる。CLAUDE/AGENTS とテンプレートは原則の優先だけを述べる
skills・hosts テストに原則の検査を足し、README(+ja)・CHANGELOG(+ja) に載せた

## 2026-09-18 節目
PLAN の全層完了: 原則（キー付き SPEC・next check の警告）と converge を両ホストで実地確認し、SPEC §12 の基準1〜12 が ✓
未決: converge の判定が回ごとに揺れる・unrequested に soujo init の CLAUDE.md・converge の文脈量（SPEC §14）

## 2026-09-18 L37 converge-verify
両ホストで AgentReview の複製を go → converge（A6 missing を層に）→ go → converge（収束・次: plan）と回し、$converge は soujo:converge に解決。
SPEC(+ja) §12 の基準11・12 を ✓、§14 に converge の文脈量・判定の揺れ・unrequested の CLAUDE.md を追加。手順と結果は .soujo/L37-VERIFY.md。
main を push して両ホストのプラグインを d582448 に更新し、PATH の soujo を npm link し直した。

## 2026-09-18 節目
converge: 差 §12-9・PLAN.md に 1層を追加
未決: SPEC にキーがない（§2 の原則を §2-1〜7、§12 の基準を §12-1〜12 と呼んだ）。unrequested なし

## 2026-09-18 節目
PLAN の全層完了: planLayers の直接テストが加わり、state.ts の公開関数すべてが state.test.ts に現れる
未決: なし

## 2026-09-18 L38 plan-layers-test
test/state.test.ts に planLayers の直接テストを追加（行番号・フェンス内除外・CRLF・閉じないフェンス）
state.ts の公開関数すべてが state.test.ts に現れる

## 2026-09-18 節目
converge: 収束（§2-1〜7・§12-1〜12）
未決: SPEC にキーがない（§2 の原則を §2-1〜7、§12 の基準を §12-1〜12 と呼んだ）。unrequested なし
