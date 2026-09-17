# SPEC — 層序（Soujo）: 中断でき、再開でき、少ない文脈で進める AI コーディング（Claude Code / Codex 共用、TypeScript 実装）

[English](SPEC.md) | **日本語**

正本は英語版 `SPEC.md`。これはその日本語訳。このリポジトリの `.soujo/SPEC.md` は `SPEC.md` へのシンボリックリンク。

## 0. 一言で

Soujo は AI コーディングを **中断でき（interruptible）・再開でき（resumable）・少ない文脈で進められる（low-context）** ものにする。作業は30分以内の層で進めて層ごとにコミットし、状態はすべて短い4ファイルに置く。だからセッションはいつ止まってもよく、次のセッションは Claude Code でも Codex でも、そのファイルだけで続きから始められる。

| 性質 | 要件 | 満たす仕組み |
|---|---|---|
| Interruptible development | どこで止めても、作業も決定も失わない | 1層=1コミット。`soujo close` が途中の作業を `wip:` でコミット。`soujo next check` が再開できない状態を警告（§6） |
| Resumable AI coding | 次のセッションは会話履歴を要らず、もう一方のホストでも、何日・何週間後でもよい | 5行以内の `NEXT.md`（§5）。`soujo resume`。日が空いた後のための `soujo brief` と `節目` エントリ（§5・§6）。両ホストで共有する `skills/` と `.soujo/`（§4） |
| Low-context development | 利用者もモデルも、1画面を超える状態を抱えなくてよい | 4ファイルの行数上限（§5）。質問は1つずつ（§7）。判断の要らない記録の更新は CLI に寄せる（§6） |

Spec-kit の「constitution を置き、仕様→計画→実装→converge」と Superpowers の「作法をスキルで型にする」を、この3つの性質に削ぎ落とし、モデルの自律性は邪魔しない。
本体は TypeScript の CLI `soujo` 1本。Claude Code（Opus 5）と Codex（GPT-6 Astra）は、同じ `skills/` と同じ `.soujo/` 記録を共有し、違いはマニフェストと指示ファイルだけに閉じ込める。

名前の由来：発掘では地層を一枚ずつ剥ぎ、剥いだ層は必ず日誌と図面に残す。剥いだ層は戻せないが、記録があれば誰でも続きができる。

## 1. 課題

| 既存 | 良い点 | 合わない点 |
|---|---|---|
| Spec-kit | 仕様を先に固める規律 | 文書が多く長い。複数フェーズ・複数ファイルの状態を頭で追う必要がある |
| Superpowers | plan→verify→execute を型にする | スキル数が多く、どれが発動したか見えにくい。verify 工程が Opus 5 / Astra の自己検証と二重になる |
| 素の Claude Code / Codex | 自由 | 手順や決定が会話に埋もれる。中断後に「どこまでやったか」を思い出せない |
| 2ホスト併用 | モデルの得意分野を使い分けられる | スキル・指示ファイル・記録が二重になり、どちらが最新か分からなくなる |

## 2. 設計原則（特性 → 原則 → 実装）

次の特性を持つ利用者を想定して設計する。

| 特性 | 原則 | 実装 |
|---|---|---|
| 一度に多くを保持できない | 状態は全部ファイルに外出し | `.soujo/` の4ファイル。会話は使い捨て |
| 同上 | 1画面・1問・1手 | 質問は1つずつ。`NEXT.md` は5行以内。層は30分以内 |
| 構造・対比・類比で理解する | 説明は表・図・対比から | `soujo map` が構造図を出す。選択は比較表で提示 |
| 文章理解は高い | 平易化しない。短く濃く | CLAUDE.md / AGENTS.md の応答規約 |
| セッションが予告なく途切れる | 常に再開可能な状態を保つ | 1層=1コミット。`soujo next check` が再開不能を検知 |
| 使用枠が小さい | 消費を抑える | 検証・再確認の指示を書かない。判断不要な処理は CLI に寄せる |
| 2ホストを併用する | 記録とロジックはモデル非依存 | 機械的に決まる判断は TypeScript CLI に集約。SKILL.md は共有。ホスト差はマニフェストと指示ファイルのみ |

## 3. ユーザーストーリー

1. `/soujo:spec`（Codex では `$spec`）で一問一答のうちに、原則とキー付きの受け入れ基準を含む `SPEC.md` ができる。
2. `/soujo:plan` で、30分以内の「層」の一覧 `PLAN.md` ができる。各層に完了条件が1行ある。
3. `/soujo:go` で次の層が実装・テスト・コミットされ、`LOG.md` と `NEXT.md` が更新される。
4. 最後の層の後、`/soujo:go` は `/soujo:converge` へ引き継ぐ。converge はコードを `SPEC.md` の受け入れ基準と原則に照らし、足りないものを層として `PLAN.md` に足すか、収束したと記録する。
5. 数日〜数週間空けて `/soujo:resume` を打つと短い状況説明が出て（3日以上なら `soujo brief` の5行も）、そのまま続けられる。
6. Claude Code で L3 まで進めた同じリポジトリを Codex で開き、`$resume` → `$go` で L4 が続く。逆も同じ。
7. `/soujo:map` で現在の構造が図になる。`/soujo:review` で見落としが全部列挙される。

## 4. 構成（1リポジトリで両ホスト）

```
Soujo/
├── .claude-plugin/plugin.json        # Claude Code 用マニフェスト（version なし：コミットが版になる）
├── .claude-plugin/marketplace.json   # Claude Code 用マーケットプレイス（source "./"）
├── .codex-plugin/plugin.json         # Codex 用マニフェスト（hooks フィールドは持たない）
├── .agents/plugins/marketplace.json  # Codex 用マーケットプレイス（source.path "./"）
├── skills/                           # 両ホスト共有。commands/ は使わない
│   ├── spec/  plan/  go/  converge/  resume/  map/  review/  close/   （各 SKILL.md）
├── agents/reviewer.md                # Claude Code 用サブエージェント
├── hooks/hooks.json                  # Claude Code 用（SessionStart / Stop）。Codex は信頼されたときだけ実行
├── src/
│   ├── cli.ts        引数解釈と出力
│   ├── state.ts      .soujo/ の解析・整形・検証（純粋関数）
│   ├── files.ts      .soujo/ の探索と読み書き（薄い I/O 層）
│   ├── git.ts        git 呼び出し（薄い層）
│   ├── map.ts        ASCII / Mermaid 図の生成（純粋関数）
│   └── commands/     1コマンド1ファイル。複数のコマンドが使う検査と文言は shared.ts
├── test/                             # node:test（依存ゼロ）
├── dist/                             # tsc 出力。フックが直接呼ぶためコミットする
├── templates/                        # `soujo init` が導入先に複製するファイル
│   ├── CLAUDE.md（Opus 5 版）  AGENTS.md（Astra 版）
│   └── SPEC.md  PLAN.md  LOG.md  NEXT.md
├── CLAUDE.md  AGENTS.md              # このリポジトリ自身の指示（templates の内容＋このリポジトリの節）
├── README.md  SPEC.md  CHANGELOG.md  CONTRIBUTING.md  SECURITY.md  CODE_OF_CONDUCT.md  LICENSE  （＋ .ja.md の日本語訳）
├── .github/                          # Issue フォーム、プルリクエストのテンプレート、CI（npm test）、Dependabot
└── package.json  tsconfig.json  tsconfig.test.json
```

方針：
- **`src/` とスキルの境界。** 機械的に決まる判断・整形・検証は `src/`、対話・モデルが描く図・レビュー（対象の diff の決め方を含む）は SKILL.md に書く。SKILL.md には「いつ何を `soujo` に頼むか」も書く。
- プラグイン直下の CLAUDE.md / AGENTS.md はどちらのホストでも文脈として読まれない。`soujo init` が `templates/` から導入先へ複製する。
- SKILL.md の frontmatter は `name` / `description` のみ。`disable-model-invocation` は使わない（Codex の `validate_plugin.py` が `true` を拒否するため）。
- 実行時に使う文面（CLI の出力、スキル、テンプレート、CLAUDE.md / AGENTS.md）は日本語。利用者向け文書は英語を正本とし、日本語訳を添える。

## 5. 状態ファイル `.soujo/`

| ファイル | 役割 | 上限 | 書く人 |
|---|---|---|---|
| `SPEC.md` | 何を作るか。原則・目的・非目標・受け入れ基準・技術判断。原則はほかの節・完了条件・既存のコードより優先する | 目安100行。原則は7行 | `spec` スキル |
| `PLAN.md` | 層の一覧。`- [ ] 層名 — 完了条件`。コードフェンスの中のチェック項目は例であって層ではない | 1項目1行 | `plan` と `converge` スキル。`soujo layer done` がチェック |
| `LOG.md` | 日誌。`## YYYY-MM-DD 層名`（実在する日付）の下に最大3行。コマンドは追記だけで、例外は過去の月を書庫へ移す `soujo log rotate`。層名が `節目` のエントリは節目：どのフェーズが終わり何が未決かを、`spec` / `plan` / `go` / `converge` スキルがフェーズの区切りで書き、`soujo brief` が示す | 1エントリ3行 | `soujo log add` / `layer done` / `close --note`。`soujo log rotate` が削る |
| `NEXT.md` | 次の1手。**再開時にこれだけ読めばよい** | 5行 | `soujo next set` |
| `LOG-YYYY-MM.md` | `LOG.md` の書庫。1か月分のエントリを `LOG.md` にあった形のまま `# LOG YYYY-MM` の下に置く。読むのは `soujo log rotate` だけ | —（検証しない） | `soujo log rotate` |

`NEXT.md` の形（CLI が検証する。キーは日本語のまま、区切りは `:` と `：` のどちらも可）：

```
次: <層名>
前提: <直前に終わったこと／依存>
確認: <この層が終わったと判断する方法>
注意: <未解決・地雷。なければ「なし」>
effort: <low|medium|high|xhigh>
```

`SPEC.md` のキー付きの節（見出しはテンプレートが書く日本語のまま。この形から外れた行は `soujo next check` が警告し、この見出しのない SPEC は検査しない）。`## 原則` はこの形の行を7行まで持ち、ほかは持たない。`## 受け入れ基準` はほかの文を持ってよいが、字下げのない項目にはキーを付ける。キー（`P<n>`・`A<n>`）は再利用も振り直しもしない。層が何を閉じるかを名指せるようにするため：

```
## 原則
- P1 <名前> — <判定できる1文>

## 受け入れ基準
- A1 <判定できる1文>
```

## 6. CLI `soujo`

- Node 20+、ESM、**実行時依存ゼロ**（`node:*` のみ）。devDependencies は `typescript` と `@types/node` だけ。
- 出力は常に短く、日本語。標準出力は原則5行以内（`--help` と `map` は超える）。エラーは標準エラーに1行、終了コード1。ホームディレクトリ以下のパスは、出力もエラーも `~` で示し（正規化のどちらの綴りでも、区切りが `\` でも `/` でも、大文字小文字はファイルシステムが無視するときだけ区別せず）、貼り付けた行にユーザー名が残らないようにする。書く前に閉じられたストリーム（`soujo resume` を `head -1` に渡すなど）では `EPIPE` のスタックトレースを出さず静かに終わる。それ以外の書き込みの失敗（ディスクが一杯など）は標準エラーに1行出して終了コード1。案内するコマンドの中の層名は単一引用符で囲んだ1引数（スキルの表記と同じ）にし、`-` で始まる層名の前には `--` を置く。
- どのコマンドも現在のディレクトリが要る（`.soujo/` はそこから探す）。読めないとき（シェルが留まったまま消された、権限が落ちた）、`next check`（`--hook` の有無を問わず）と `next show --hook` はプロジェクトの外と同じに何も出さず終了コード0、ほかのコマンドは1行でその旨を伝えて終了コード1（`ENOENT` 以外は理由の code も添える）。`--help` は影響を受けない。
- どのホストから呼ばれても同じ動作。ホスト判定はしない（`--hook` だけが Claude Code のフック向けの出力に切り替える）。
- `.soujo/` はカレントディレクトリから親へ辿って探し、git のトップレベル（`.git` のあるディレクトリ）で止める。リポジトリの外では、`soujo init` がそこに作るのに合わせてカレントディレクトリだけを見る。
- git は、別のリポジトリを指す環境変数（`git rev-parse --local-env-vars` が挙げるもの：`GIT_DIR`・`GIT_WORK_TREE`・`GIT_INDEX_FILE` など）を外して実行するので、git のフックから起動した `soujo` もカレントディレクトリのリポジトリを扱う。git 管理外とみなすのは git の「not a git repository」のときだけ。それ以外の git の失敗（git がない・設定が壊れている）はエラーで、`resume` と `brief` は git の行に、`next check` はほかの警告と並べて1件の警告に出し、`log add` は git 管理外と同じく HEAD 不明として扱う。
- git の履歴は、ステージやコミットと同じく、プロジェクトのディレクトリを変えたコミットだけを読む（そこでの `git log -- .`）。同じリポジトリの別プロジェクトにある `layer: <層名>` のコミットは `layer done` の判定に数えず、`brief` と `resume` はそれも空のコミットも（最終コミットでも）数えない。層のコミットが追加したファイルもプロジェクトの中だけを示す。状態ファイルの HEAD の中身は HEAD のエントリで読む：パス上の symlink は途中のディレクトリも含めてその時点のリンク先を辿り（Windows ではリンクの文字列を `\` でも区切る）、作業ツリーの今の姿によらないので、`PLAN.md` を symlink の先へ移しても、コミット済みのチェックを未コミット扱いしない。記録が書いたとおりにステージされているかの検証は、symlink の状態ファイルではリンク先に加えて symlink 自身も対象にする。
- `.soujo/` のファイルは、実体の隣に排他的に作った一時ファイルで置き換え、権限を保つ。`init` はすでにあるファイルには何も書かない（`.soujo/` もファイルも全部揃っていれば、ディレクトリは読取り専用でよい）。残りは一時ファイルを置き先へリンクして作る（CLAUDE.md / AGENTS.md も）ので、書きかけのファイルを残さず、既存のものを置き換えない。ハードリンクを張れないファイルシステム（FAT・exFAT・一部の FUSE / SMB マウント）では、置き先へ rename せず、排他的に作ったファイルへ複製する。中断で書きかけが残りうるのはこの場合だけ。それらを書くかコミットするコマンドは、先に中断された書き込みが残した一時ファイルを消す。コミットするコマンドは、`init` だけが書く根の CLAUDE.md / AGENTS.md のものも消す。ただし生存しているプロセスの名前を持つものは、そのプロセスが書いている最中かもしれないので残す。pid がそれを言えるのは、書いた機械と pid 名前空間の中だけ。共有マウント越しでは、その番号を持つプロセスがいる限り残り、その間のコミットは一緒に取り込む。symlink（ファイルのものも `.soujo/` のものも）はプロジェクト内かつ `.git` の外のファイルへだけ辿る。辿り方は1要素ずつで、symlink の後の `..` はその指す先から数える。`.git` はファイルシステムが受け取りうるどの名前でも `.git` とする：大小文字違い、末尾のドットや空白、NTFS のストリーム、8.3 の短縮名、HFS+ が無視するコードポイント。それ以外への読み書きは拒否し、読むのは通常のファイルだけ。`.soujo/` の別の状態ファイルや書庫と同じ実体（symlink・大小文字を区別しないファイルシステムでの大小文字違いのパス・ハードリンク経由）のものは、読み込みも書き込みも拒否する（一方を読むともう一方の中身が返り、一方を書くともう一方に上書きされるため）。壊れた symlink が別のものの作られる場所へ届くものは、書き込みだけを、何か書く前に拒否する。複数を書くコマンド（`layer done`・`log rotate`）が書いたばかりのものへ書き込まないため。
- ホストのプラグインの置き場所（カレントディレクトリの実パスに `.claude` か `.codex` の直下の `plugins` がある。大文字小文字は区別しない。§8 の導入キャッシュとマーケットプレイスの複製がそこにある）では、そこが Soujo の複製かどうかによらず、`soujo` はプロジェクトを見ない：`next check`（`--hook` の有無によらず）と `next show --hook` は Soujo 外と同じ振る舞いで何も出さず、ほかのコマンドは `--hook` なしの `next show` も含め、何も読み書きする前に、作業中のプロジェクトで実行するよう1行で示して終了1。`--help` は対象外。実パスが求まらないときは、求まる最も近い祖先の実パスに残りのパスを付けて判定する。

| コマンド | 動作 | 出力 |
|---|---|---|
| `soujo --help` / `soujo <コマンド> --help` | 使い方の行を標準出力に出して終了0：最初の引数なら全コマンド、コマンドの後ならそのコマンドの1行、2語コマンドの1語目（`next`・`plan`・`log`・`layer`・`map`）の後ならその語で始まるコマンド（後に不明な語が続いても）。`-h` も同じ。`--` より前の単独の引数だけが対象（`--note=--help` や `--` の後は普通の引数）で、ほかの引数より先に判定するので、何も検査・実行しない（`--hook` 付きの `next show` / `next check` でも）。各行はそのコマンドの使い方エラーが示すのと同じ `soujo …` の文字列（`next check` には使い方エラーがない）。不明なコマンドは従来どおり、打たれた名前を示すエラーで、コマンドなし・不明なコマンドのエラーは `soujo --help` を案内する | 1コマンド1行 |
| `soujo init` | templates から `.soujo/` を作り、CLAUDE.md / AGENTS.md がなければ複製する。git 管理下ならトップレベルに作る。既存ファイルは上書きしない。状態ファイルの実体（ファイルか `.soujo/` の symlink の先）がプロジェクトの外、`.git` の中、または別の状態ファイルの壊れた symlink が届く場所なら、何も作らずに拒否。既に同じ実体になっている2つは、既存を置き換えないので、それらを書くコマンドに任せる | 作成したファイル＋作らなかったファイルの1行。git 管理外なら `git init` が要る旨の1行 |
| `soujo next show [--hook]` | `NEXT.md` を表示。ファイルがなければ「NEXT.md なし」。`resume` と `close` はそれを拒否するのに本文だけでは理由が分からないので、行の後に `NEXT.md` 自身の問題（`validateNext`）を挙げる1行を足す（組み方は `next check` と同じ：先頭4件と `ほか<N>件`）。表示する行は5行制限が数える行なので、末尾の空行は警告の指す行として表示され、あって中身が空のファイルは警告だけになる。`--hook` 時は NEXT.md がなければ何も出さない | `NEXT.md` の行数。無効ならもう1行 |
| `soujo next set --layer --premise --check [--caution] [--effort]` | `NEXT.md` を全文書き直す。既定は 注意=`なし`、effort=`medium`。フェーズ `spec` / `plan` / `converge`（前後の空白を除き、大文字小文字も含めて完全一致で比べる）の effort は `high`（§7）：`high` 以外の `--effort` は拒否して何も書かず、エラーは `--effort` を外すよう示す。値は制御文字（§14）を含まない1行。PLAN に層があるとき、PLAN にない層（フェーズを除く）は何も書かずに拒否。PLAN にコードフェンスの閉じ忘れ・空の層名・制御文字を含む層名がある（3つとも行番号で示す）、同じ層名が複数ある、または `spec` / `plan` / `converge` / `節目` という層がある間は、どの層も何も書かずに拒否 | 1行 |
| `soujo next check [--hook]` | NEXT.md がない・無効・PLAN で `[x]` 済みの層か未チェックの層より後ろを指す（`plan` と `converge` はすべての層より後ろ）、PLAN にコードフェンスの閉じ忘れ・空の層名・制御文字を含む層名がある（3つとも行番号で示す）・同じ層名が複数ある・`spec` / `plan` / `converge` / `節目` という層がある、完了条件のない層がある（行番号で示す。ここでは警告、`layer done` では拒否）、その層自体が成り立っているのに `NEXT.md` の `確認:` が PLAN のその層の完了条件と違う（空白の連なりは制御文字も含めて同じと見る。フェーズ・PLAN にない層・PLAN が重複させている層・完了条件のない層、および完了済みか手前を飛ばした層——そちらの警告の方が直す先——は比べない）、`SPEC.md` の `## 原則` が7行を超えるか `- P<n> <名前> — <1文>` でない行を持つ・その `## 受け入れ基準` の字下げのない項目に `A<n>` のキーがない・キーが節の中で重複する（空行・1行の HTML コメント・コードフェンスはこれらの節の行に数えない。行数以外は行番号で示す。この見出しのない SPEC は検査しない）、プロジェクト内に未コミット変更がある（未追跡のディレクトリは `status.showUntrackedFiles` の設定によらず1件と数える。`git status` の出力が 16 MiB を超えたら `N件以上` と出す。`次:` が `spec` / `plan` / `converge` の間は `.soujo/` を数えない。これらのフェーズは記録を書くがコミットしないため）、`soujo log rotate` が2か月分以上のエントリを移せる、または `SPEC.md`・`NEXT.md`・`PLAN.md`・`LOG.md` のどれかを読めない（どれもほかの警告と並べて出し、そのファイルが要る検査だけを外す）ときに警告。行番号の警告は壊れた行の数だけ出るので、1行には先頭4件と `ほか<N>件` を出す。Soujo を使っていないプロジェクトでは無音。`--hook` 時は `{"systemMessage": "..."}`（ホームディレクトリを隠してから組む）。**終了コードは常に0** | 0〜1行 |
| `soujo plan list` | 層の一覧と完了状態。その前に、`PLAN.md` 自体を使えなくしているもの（`validatePlan`。行の作り方は `next check` と同じ）を1行で示す。フェンスの閉じ忘れは以降の層を隠すため | 層数分（無効なら+1行） |
| `soujo plan next` | 最初の未完了層と完了条件。その前に同じ1行 | 2行（無効なら+1行） |
| `soujo log add <層名> --line ...` | `LOG.md` に追記（1〜3行）。`LOG.md` が同じエントリ（日付・層名・行が同じ）で終わり、HEAD にその分がない（リポジトリでない場合を含む）なら、追記せずそう言う。後のコマンドが失敗した一連のコマンドを再実行しても繰り返さないため | 1行 |
| `soujo log rotate [--before YYYY-MM]` | 今月（か `--before`。`YYYY-MM` で月は01〜12）より前の月の日付を持つ `LOG.md` のエントリを、エントリの日付の月ごとに `.soujo/LOG-YYYY-MM.md` へ移す。新しい書庫にも既存の書庫にも、`LOG.md` にある行の形のまま追記する。日付によらず `LOG.md` に残すもの：最初のエントリより前の文、最後のエントリ（`resume` の `前回:` がそのまま出る）、最後の `節目` エントリ（`brief` の `節目:` がそのまま出る）、日付が月を表さないエントリ。その月の書庫にすでにあるエントリは再び足さない。エントリの区別は中身（日付・層名・行）だけで、それがすべてなので、`LOG.md` が一字一句同じエントリを繰り返していればそれぞれ移るが、書庫がすでに持っている写しは追記されずに `LOG.md` から消え、何本あっても1本になる。書庫を先に、`LOG.md` を最後に書き、プロジェクトを `log: rotate <月>` か `log: rotate <最初>..<最後>`（そのコミットで `LOG.md` から消えるエントリの月）でコミットする。次のときは何も書かず（消さず）に拒否：`--before` が月でない／layer done と同じコミット不能条件／書庫の実体がプロジェクトの外、`.git` の中、または別の状態ファイルや書庫と同じ、または書く・コミットする書庫が git に無視されている／止まった rotate のもの以外に未コミットの変更がある：`LOG.md` と既存の書庫の外の変更（残った一時ファイルは除く）、HEAD からエントリを丸ごと消しただけではない `LOG.md`、HEAD にその月のエントリを1つ以上丸ごと足しただけではない変更された書庫、HEAD にない書庫で、エントリより前の文が rotate の書く `# LOG <月>` の見出しでないもの、HEAD の `LOG.md` をどう rotate しても移らない消えたか足されたエントリ（最後のエントリか最後の `節目` エントリ、月を表さない日付、`LOG.md` になかったエントリ）、その月の書庫にない消えたエントリ／止まった rotate のエントリがこの `--before` ではすべては移らない（`前回と同じ --before で再実行する`）。そのため、書き込みかコミットの失敗後の再実行は、途中で書庫を手でコミットしていても、同じ移動を仕上げる。移すものもコミットするものもなければ、残った一時ファイルを消すだけで `移動なし` | 2行：`LOG.md から N件を M書庫へ移動（<月>）` とコミット |
| `soujo layer done <層名> [--note ...]` | PLAN にチェック → LOG 追記 → プロジェクトのディレクトリで `git add -A -- .` と `git commit -m "layer: <層名>" -- .`（サブディレクトリのプロジェクトはそこだけをコミット）。次のときは何も書かずに拒否する：層が PLAN にない・PLAN にコードフェンスの閉じ忘れ・空の層名・制御文字を含む層名がある（3つとも行番号で示す）・同じ層名が複数ある・`spec` / `plan` / `converge` / `節目` という層がある・note が LOG の上限を破るか `中断:` で始まる（`close` 専用）／その層に完了条件がない（コミット済みの判定の後に言う。完了条件を消した後でも、締めた層は「コミット済み」と出るように）／NEXT.md がない・無効・`次:` がまだこの層／git リポジトリでない、`.soujo/` が symlink、状態ファイルの実体（symlink の先）がプロジェクトの外、`.git` の中、または別の状態ファイルや書庫と同じ、merge・rebase・cherry-pick・revert の途中（残った `sequencer/` を含む）、プロジェクト内の競合が未解決（リポジトリのほかの場所の競合は、git がプロジェクトをコミットできるのと同じく止めない）、`.soujo/` のファイルかその symlink の先が git に無視されている、git に無視されていない未追跡ファイルが認証情報のファイル名（`.env.example` 以外の `.env` と `.env.*`、`.npmrc`、`.netrc`、`_netrc`、`.git-credentials`、`.credentials.json`、`auth.json`、`id_rsa`・`id_ed25519`・`id_ecdsa` の鍵とその `.pub`、`*.pem`、`*.key`。ファイルシステムが大小文字を区別しなければ大小文字を問わない。先に `git add` したものはコミットする）、未追跡ファイルの一覧が 16 MiB を超えて残りを読めていない／コミット済み（プロジェクトを変えた `layer: <層名>` のコミットがある、または HEAD の PLAN でチェック済み）。チェックが作業ツリーにだけある（前回が途中で止まった）ときは、HEAD にまだないこの層の完了エントリが LOG のどこにもなければ（`close` の「中断」エントリは数えない）追記してコミットする。SPEC・PLAN・LOG・NEXT が書いたとおりにステージされていない（skip-worktree など）間は何もコミットしない。書いた後の失敗（コミットを止めた git の hook を含む）は記録済みの範囲を示し、原因を直して再実行すれば続きから進む | 1行（追加ファイルを最大5件添える） |
| `soujo resume` | `次: <層>（effort: <e>）確認: <確認>`（NEXT.md）／`前回: <日付> <層> — <1行目>`（LOG.md 末尾エントリ）／`コミット: <hash> <件名>（未コミット N件）`／`再開: /soujo:go（Codex は $go）`。`コミット:` はプロジェクトを変えた最後のコミット（なければ `まだない`）で、件数は `next check` の上限を超えたら `N件以上`。値は層名も含めて60文字で `…` に切る。ただしコマンドの中の層名は切らず、単一引用符で囲む。PLAN に `next set` が拒否する問題がある間は、ほかの案内より先に `次: 不明（PLAN.md が無効: …）` とし、`再開:` は PLAN.md を直して `soujo resume` をやり直すよう示す。NEXT.md がない・読めない・無効・チェック済みの層を指すとき：`次:` は PLAN の次の層、`再開:` に理由と `soujo next set`。全層が完了していれば `/soujo:converge`、層が1つもなければ `/soujo:spec`（SPEC.md がないか、`#` の見出し・空行・HTML コメントしか持たない。どの版のテンプレートもそう）か `/soujo:plan`。NEXT.md が未チェックの層より後ろを指すとき（`次: plan` と `次: converge` を含む）：`次:` はその層、`再開:` は `soujo layer done` を示す。PLAN のチェックが未コミット（layer done が途中）なら `再開:` はその再実行。読めないファイルや git の失敗はその行だけを縮退させる。最終コミットが暦日で3日以上前なら（`brief` が出すローカル時刻の日付で数える）`再開:` の末尾に `・N日ぶり: 先に soujo brief` | 4行 |
| `soujo brief` | 何日も・何週間も離れた後に戻るための現在地。記録から導出し、何も書かない：`進捗: PLAN <完了>/<全体> 層完了・最終 layer: <日付> <層>`（プロジェクトを変えた最新の `layer:` コミット。なければ `なし`）／`以後: layer 後のコミット N件: <件名>`（古い順に最大3件、`resume` と同じく切り、それより多ければ `…`。最終コミットが layer のコミットなら `なし`。最初の layer のコミットより前は全コミットを `最初からのコミット N件`）／`節目: <日付> — <1行目>`（`LOG.md` の最後の `節目` エントリ。なければ `なし`）／`空白: 最終コミットから N日（<日付>）`（ローカル時刻の暦日で数える）／`次: <層>（effort: <e>）確認: <確認>`（`resume` と同じ）。読めないファイルや git の失敗は `resume` と同じくその行だけを縮退させる | 5行 |
| `soujo close [--note ...]` | `--note` を LOG に「中断: ...」で記録 → プロジェクトを `wip: <層名>` でコミット → 再開方法。次のときは何も書かずに終了1：layer done と同じコミット不能条件／layer done が拒否する PLAN の問題（コードフェンスの閉じ忘れ・空の層名や重複した層名・制御文字を含む層名・`spec` / `plan` / `converge` / `節目` という層）／NEXT.md がない・無効・チェック済みの層を指す／PLAN のチェックが未コミット（先に layer done を再実行）／note が空・LOG の上限を破る。SPEC・PLAN・LOG・NEXT が書いたとおりにステージされていない（skip-worktree など）間は何もコミットしない。層は `次:`、ただし `次:` が未チェックの層より後ろを指すとき（next set と layer done の間で止まった）はその未チェックの層。HEAD にまだないその層の「中断」エントリが LOG のどこかにあれば追記せず残すので、コミット失敗後の再実行はコミットだけやり直す | 2行 |
| `soujo map plan` | `PLAN.md` を縦の ASCII 図に（完了 `[x]`／次 `←次`、完了条件を縦線 `\|` の横に）。全層完了なら末尾に `全層完了`。`PLAN.md` を使えなくしているものは `plan list` と同じ1行で図の前に示し、図は変わらず描く | 層数×2行（無効なら+1行） |
| `soujo map code [dir]` | `dir`（既定はプロジェクトのルート、Soujo 外では cwd）の主言語（ファイル数が最多）の相対 import を Mermaid `graph LR` にする。言語は `src/map.ts` の `LANGUAGES` に1行ずつ。import 規則を持つ行（初期は TS/JS）だけを図にし、主言語が規則なし・認識できるファイルがないときは ASCII のディレクトリ木。パッケージとパス別名の import と、固定の文字列1つでない指定（`'./a' + b`）は線にしない。指定の中のエスケープは復号する。指定は最初の `?` か `#` のどちらか早い方で切り、残りの %エンコードを復号する。復号した綴りの次に元の字面も試すので、`d.e.js` も本当に `d%2Ee.js` という名前のファイルも見つかる。パスの比較は、走査したファイルを置いているファイルシステムの流儀に従う（走査したファイル1つに1回だけ問い合わせる）。1つの名前をどちらの正規化形で返すか分からないので常に NFC で比べ、大小文字を畳むのはファイルシステムが畳むときだけ（測れないときはプラットフォームの既定に従う）。したがって図は、そのファイルシステムが解決するとおりになる（別の大小文字で書かれた指定は、ファイルシステムが見つけるなら線になり、見つけないなら線にならない）。どこでも同じ図になるわけではない。拡張子の読み替えは、TypeScript の綴り（`./a.JS` ではなく `./a.js`）で書かれているときだけ行う。指定にない綴りを読み替えで作らない。JSX は `.tsx`・`.jsx`・`.js`・`.mjs`・`.cjs` で読む。要素の本文と引用符付きの属性値からは import を拾わず、コードとして読むのは `{ }` の中だけ。ほかの拡張子では `<x>` は型。値と型の位置を区別しないので、値が始まれる位置に書いた generic な関数型（`type X = <T>(a: T) => T`）は要素を開く。これを閉じるものが無いので、ファイルの終わりでその `<` からコードとして読み直す（読み直す量はファイルの長さまでで、超えたら残りを要素なしで読む）。`node_modules`・`dist`・`build`・`target`・`vendor`・`deps`・`_build`・`__pycache__`・`venv`・`coverage`・ドットで始まるもの・symlink は除外。読めないサブディレクトリとファイルは飛ばして件数を示す。実体のパスがプロジェクト（Soujo 外では cwd）の外にある `dir`（名前はファイルシステムの流儀で比べる）は指定どおり読み、最初の注記でそう示す。ラベルの `"` `#` `&` `<` `>` `]` とバッククォートは実体参照にし、ファイル名でノードが閉じないようにする。上限は走査5000件・1ファイル524288バイト（512 KiB。上限ちょうどのファイルと超えるファイルを見分けるため、もう1バイトだけ読む。切れ目は文字やトークンの途中に来るので、切れたファイルは最後の完全な行までしか解析しない）・ファイル100（つながりの多い順に残す）・線300・木200行で、超えたら注記 | Mermaid か木 |

`state.ts` の公開関数（純粋関数、それぞれテストあり）：
`contentLines` / `parseNext` / `formatNext` / `validateNext` / `validateSpec` / `specUnwritten` / `parsePlan` / `planLayers` / `validatePlan` / `missingConditions` / `checkMismatch` / `formatItem` / `nextLayer` / `nextStatus` / `newlyDone` / `markDone` / `printable` / `logLines` / `appendLog` / `parseLog` / `lastLog` / `isMonth` / `requireMonth` / `logMonth` / `logMonths` / `rotateLog` / `archiveLog` / `appendedEntries` / `removedEntries` / `lastMilestone` / `daysBetween` / `formatDate`。

## 7. スキル（`skills/`、両ホスト共有）

共通規約：description は1文・狭いトリガー（Astra はスキルが多いと description を切り詰める）。本文は「読むもの → やること → `soujo` に頼むこと → 出力の形」の4節、各節3行以内。「読むもの」の1行目で、`soujo`（PATH 上のコマンド）・git・`.soujo/` は作業中のプロジェクトのもので、スキルの置き場所へ cd したりそこの `.soujo/`・`dist/` を使ったりしない、と示す。その行は `soujo` が見つからないときに止まるかで終える。止まるのはスキルが `soujo` を呼ぶところだけなので、`review` は止まらず、`map` は `plan` と `code` のときだけ止まる。「必ず〜を読め」「テストしろ」「再確認しろ」は書かない（両モデルとも自分でやる）。テストはどんな言い回しでもスキルに書かない：「テストが落ちたまま締めない」も指示の一つとして読まれる。コマンド例の値は単一引用符で書く。形式と `soujo` のコマンド・オプションは `test/skills.test.ts` が検査する。

| スキル | 読むもの | やること | 呼ぶ CLI | 出力 | effort |
|---|---|---|---|---|---|
| `spec` | `soujo init` 後の `SPEC.md`。技術の候補を出すときは設定ファイル。原則の候補を出すときは設定ファイルとリポジトリが明文化している規約 | 質問1つずつ（答えを受けてから次）・最大7問。各問に番号付きの答え候補。答えるたびに書く。技術スタックは設定ファイルで決まればそれ、決まらなければ質問（既定値を持たない）。原則は、それまでの答え・設定ファイル・明文化された規約から出した候補で1問にして決める。受け入れ基準はキー付きで書き、既存の SPEC で欠けたキー（原則には名前も）は意味を変えずに付ける。原則が決まらなければ、その節は `未定` と書かず空のままにする | `soujo init` → `soujo log add 節目`（SPEC を書いた・原則を変えたらそれも・決まらない原則を含めて何が未決か）→ `soujo next set`（次: plan） | `SPEC.md` の骨組みの表1つと init が作ったファイル | high |
| `plan` | `SPEC.md` と既存の `PLAN.md`（その行は書き換えない） | 未実装を30分以内の層に分割。依存順。未完了は最大12層。未実装がなければ層を足さず終える | `soujo log add 節目`（層を足したときだけ：何層か・何を外したか）→ `soujo next check` → `soujo next set`（未完了の層があって、`NEXT.md` がない・無効か、`次:` が最初の未完了層でないか、その警告が `確認:` を指したときだけ）→ `soujo map plan` | `PLAN.md` と図 | high |
| `go` | `soujo resume` → `NEXT.md` → `SPEC.md` → PLAN の該当層 | `再開:` が go 以外ならそれに従う（`soujo brief` の案内には従わない）。層を完了条件まで実装。原則に反さないと完了条件を満たせないときは、実装せず1問だけ聞く。**終わったら次の層の `NEXT.md` を先に書き（最後の層の後は `次: converge`）、その後 `layer done`。最後の層では `NEXT.md` の前に `節目` エントリを LOG へ書く**。拒否されたコマンドは失敗したところから再実行する。NEXT が spec / plan / converge を指すならそちらへ | `soujo resume` → `soujo log add 節目`（最後の層だけ：層で何ができたか・何が未決か）→ `soujo next set` → `soujo layer done` | 結果1文＋変更ファイル | `NEXT.md` の指定 |
| `converge` | `SPEC.md`（その `A<n>` / `P<n>` の行。なければ基準と原則を持つ節）、`PLAN.md`、プロジェクトのコードのうち `layer:`・`wip:` コミットが変えたものと基準の語（識別子にした語も）で検索して見つかるもの。それより先は読まない | 基準と原則を1つずつ、満たす・`missing`・`partial`・`contradicts` に分け、`path:line` の根拠を付ける（コードが見つからなければ `missing`）。SPEC にも PLAN にもない実装は `unrequested`。SPEC もコードも変えない。キーのない SPEC では SPEC での呼び名（節と番号）をキーの代わりにし、節目の未決の行にキーがないことを書く。差（`missing`・`partial`・`contradicts`）のうち未完了の層の完了条件では解消しないもの（キーの一致は手がかり）を、既存の行を完了・未完了とも変えずに PLAN へ層として足し、完了条件の末尾にキーと種類を付ける（`（A3 partial）`）。原則違反を先に置き、未完了は `plan` と同じく最大12層。`unrequested` と上限を超えた差は層にせず、節目の未決の行に出す | 最初に `soujo next check`：`PLAN.md` についての警告があれば何も足さず、その警告を示す。差か未完了の層が残れば：`soujo log add 節目`（どのキーか・何層足したか・何が未決か）→ `soujo next check` → `soujo next set`（`NEXT.md` がない・無効か、`次:` が最初の未完了層でないか、その警告が `確認:` を指したときだけ）→ `soujo map plan`。どちらもなければ（`unrequested` だけでも）：`soujo log add 節目`（収束：何を照らしたか・何が未決か）→ `soujo next set`（次: plan） | 全部の差の表 `キー / 種類 / 根拠 / 残り`、続けて図・収束の1行・止めた `PLAN.md` の警告のどれか | high |
| `resume` | — | CLI の出力をそのまま返す。`再開:` の行が `・N日ぶり: 先に soujo brief` で終われば、4行の後に `soujo brief` も実行する | `soujo resume` → `soujo brief`（`再開:` の行がそう終わるときだけ） | 4行。`brief` を実行したらその後に5行。`resume` が失敗したらエラーの1行だけで `brief` は実行しない。`brief` が失敗したら4行の後にエラーの1行 | low |
| `map` | `diff` のときだけ、`review` と同じ diff とその周辺 | `plan` / `code [dir]` は CLI の図をそのまま示す。`diff` は Before/After を自分で描く | `soujo map` | 図＋5行以内 | medium |
| `review` | 引数の範囲、なければ直近の層の diff（未追跡も含む）：最新の `layer:` コミットの層の、最も古い `wip: <層>` か `layer: <層>` コミットの親から作業ツリーまで。`layer:` コミットがなければ最も古い `wip:` コミットの親から、それもなければ HEAD から。親や HEAD がなければ最初から。数えるのはプロジェクトを変えたコミットだけで、`soujo close` は層の途中を `wip:` でコミットするのでそれも数える | **見つけたものは全部**、表 `# / 場所 / 何が / なぜ / 直し方`。`SPEC.md` の原則への違反は1件1行で先に出し、そのキー（キーのない SPEC では節と番号）で始める。`soujo:reviewer` を起動できれば1体だけ起動し、diff の写しでなく範囲を渡して（渡した後も作業ツリーは変わるので、reviewer が始めるときに diff を取る）、表を加工せず出す | — | 表 | medium |
| `close` | — | 引数の一言を `--note` に渡す。なければ進んだところを1行にして渡す | `soujo close` | 2行 | low |

effort 列は人やホストの設定で使う目安（§8）。SKILL.md の frontmatter には書く場所がない。

`go` が「NEXT を先に書いてから `layer done`」なのは、`layer done` のコミットに次の `NEXT.md` を含めるため。これで `next check` が常に「クリーンな木＋有効な NEXT」で通る。

層を足す道は `plan` と `converge` の2つで、どちらも追記だけ：`plan` はコードができる前に SPEC から、`converge` は最後の層の後にコードから足す。`go` → `converge` → `go` の繰り返しは、`converge` が収束を記録して `NEXT.md` を `plan` に向けたら終わり、`plan` は SPEC が変わるまで何も足さない。

## 8. ホスト差分

| 項目 | Claude Code（Opus 5） | Codex（GPT-6 Astra） |
|---|---|---|
| マニフェスト | `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json` |
| マーケットプレイス | `.claude-plugin/marketplace.json` | `.agents/plugins/marketplace.json` |
| 呼び出し | `/soujo:go` | `$go` |
| 指示ファイル | `CLAUDE.md`（Opus 5 版） | `AGENTS.md`（Astra 版、**写しではなく別文面**） |
| フック | `hooks/hooks.json`：SessionStart で `next show --hook`、Stop で `next check --hook` | `validate_plugin.py` は `hooks` フィールドを拒否するが、Codex 0.154 は `hooks/hooks.json` を見つけ、ユーザーが信頼した後だけ実行する（未信頼の `codex exec` では何も動かなかった）。`close` スキルと AGENTS.md の「止まる前に `soujo close`」で代替 |
| サブエージェント | `review` が `agents/reviewer.md` を1体だけ起動 | 使わない。`review` は本体が直接行う |
| 同時起動の上限 | `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=2` を README に記載 | 該当なし |
| effort の指定 | 層ごとに `NEXT.md` の値を会話で指示 | `codex -c model_reasoning_effort=<v>` か `~/.codex/config.toml` の `model_reasoning_effort` |
| GitHub からの導入 | `claude plugin marketplace add SilentMalachite/Soujo` がリポジトリを複製する。`plugin.json` に `version` がないのでコミットが版になり、`claude plugin marketplace update soujo` と `claude plugin update soujo@soujo` で新しいコミットが入る | `codex plugin marketplace add SilentMalachite/Soujo` が Git のスナップショットを持つ。`codex plugin marketplace upgrade soujo` で取り直し、`codex plugin add soujo@soujo` でキャッシュへ複製し直す。ローカルパスから入れたマーケットプレイスでは `upgrade` が失敗する（`` marketplace `soujo` is not configured as a Git marketplace ``、終了コード1）。`codex plugin marketplace remove soujo && codex plugin marketplace add SilentMalachite/Soujo && codex plugin add soujo@soujo` で GitHub 版に切り替える |
| スキルの読み込み元 | ローカルディレクトリのマーケットプレイスはその場で読む：セッションはプラグインをそのディレクトリで並べ、スキルをそこから読み、そこへ足したスキルも入れ直さずに見える。導入時の作業ツリー（未追跡・git 無視のファイルを含み、`.git` は除く）の `~/.claude/plugins/cache/soujo/` への複製は行われ、`claude plugin update` は版（コミット）が同じなら何もしない。`claude --plugin-dir <path>` もその場で読む | 導入時のキャッシュ `~/.codex/plugins/cache/soujo/`（`.git`・`node_modules`・`.soujo/` を含むリポジトリ全体の複製）。更新は `codex plugin add soujo@soujo` をもう一度 |
| コミット | 通常の権限で可 | `workspace-write` サンドボックスは `.git` に書けない。`layer done` / `close` は承認が要る（`codex exec` なら `--add-dir "$PWD/.git"`）。再実行でコミットだけやり直る |
| 検証の方法 | `claude plugin validate .`（マーケットプレイス）と `claude plugin validate .claude-plugin/plugin.json`（プラグイン・agents・hooks） | 組み込みの `$plugin-creator` が持つ `validate_plugin.py` |

## 9. Opus 5 への適合（CLAUDE.md 側）

| 傾向 | 扱い |
|---|---|
| 仕様が揃っていれば途中で止まらず完遂する | `spec` で先に固め、`go` は確認なしで走らせる |
| 既定の応答が長い | 短さの規約。`NEXT.md`/`LOG.md` の行数上限は CLI が強制 |
| 実況が多い | 報告の頻度と形を明示（最初1文・変更時のみ・最後1文） |
| 自己検証・自己修正を自分でやる | 検証ステップ・再確認の指示を書かない |
| 範囲を広げがち | 「頼まれた範囲で完了」を明記。層の完了条件で範囲を固定。`converge` は SPEC が求めていない実装を `unrequested` として示す |
| サブエージェントを起動しやすい | レビュー以外は起動しない |
| 低 effort でも精度が保たれる | resume/close は low、go は層ごとに指定 |
| 「重要なものだけ」と言うと本当に減らす | レビューは全件報告、絞り込みは人 |

## 10. GPT-6 Astra への適合（AGENTS.md 側）

OpenAI の「Rethinking skills and prompts for GPT-6 Astra」（2026-09-11）に沿う。

| 傾向 | 扱い |
|---|---|
| スキルが多いと description を切り詰めて誤選択する | スキルは8つ、description は1文。他のスキル集を同居させない |
| 「毎回これを読め」は文脈を浪費する | 「必ず読め」を AGENTS.md に書かない。読む対象は各スキルの中で条件付きに示す |
| テストや検証は自分でやる | テスト・検証の指示を書かない |
| 最初の実装で戻ってきて、途中で止まりやすい | **完了を先に定義**する：層の完了条件＝止まってよい地点。「完了条件を満たすまで続ける」を明記。最後の層の後は `converge` が全体を SPEC のキー付きの基準に照らす |
| 境界の強い言い方を真に受けて止まりすぎる | 禁止形ではなく許可形で書く：「このリポジトリでの実装・テスト・コミットは許可済み」 |
| 判断が結果を変えるときは非同期で質問しつつ続行する | 質問は1つ・番号付き選択肢、という応答規約だけ与える |
| effort は `model_reasoning_effort` | `NEXT.md` の `effort:` を人が config か `-c` に写す |

## 11. 非目標

- 複数人・複数エージェントの並行開発。
- Spec-kit の完全互換：機能ごとのディレクトリ、`tasks.md`、research 文書、版と同期レポートを持つ独立した constitution、任意のコマンド群。Soujo は constitution を `SPEC.md` の `原則` の節として、converge をフェーズとして取り込む（§7・§14）。
- 会話履歴の検索や要約。記録は `.soujo/` にしか置かない。
- 導入先の言語・フレームワークの選定。プラグインは既定のスタックを持たず、`SPEC.md` とリポジトリの設定から読み取る。
- Gemini CLI / Cursor など第3のホスト対応（SKILL.md 共有で将来可能だが、いまは対象外）。
- CLI の対話 UI。`soujo` は引数を受けて即終了する。

## 12. 受け入れ基準

基準1〜10 は 2026-09-13 に L12 で確認した。`soujo` は `npm link`、プラグインは両ホストに導入（`claude plugin install`・`codex plugin add`）。対象は既存の Python プロジェクト（AgentReview 0.4.0、テストは `unittest`）の複製で、元から独自の `AGENTS.md` があったため `soujo init` は `CLAUDE.md` だけを足し、Codex はそのプロジェクトの `AGENTS.md` のもとで動いた。`spec`・`plan`・L1 を Claude Code、L2 を Codex、L3 を Claude Code で進めた。要約は `.soujo/LOG.md`。基準11・12 は原則と `converge`（L32〜L37）に伴うもので、2026-09-18 に L37 で同じやり方で確認した。`soujo` を `npm link` し直し、両ホストのプラグインを GitHub からそのコミットに更新した後（§8）。AgentReview 0.4.0 の新しい複製で、`spec`・`plan`（4層）・L1〜L3 を Claude Code で進め、その SPEC に基準 A6 を手で足し、その複製2つで最後の層から先をホストごとに進めた。

- Claude Code：`claude -p` に `--permission-mode acceptEdits` と、`soujo`・`git`・`python3` とファイル操作ツールの許可リスト。`spec` は1セッションを `--resume` で4往復、`plan`・L1・`resume`・L3・`review`・Stop フックの確認はそれぞれ新しいセッション。
- Codex：`codex exec`（`workspace-write`、`--add-dir .git`）で `$resume` と L2 の `$go` を別セッションで実行。Soujo のフックは信頼しないまま。
- L37：各ホストで `resume`、`go`（最後の層 L4 と、切り替わった先の `converge`）、`go`（足された層と、再びの `converge`）を、それぞれ新しいセッションで実行。足された層の前に、新しい基準が原則に反するため両ホストの `go` が1問聞き、答えを受けて続けた（`claude -p --resume`・`codex exec … resume`）。収束した Codex のプロジェクトの複製で `$converge` を名指しで実行し、形の崩れた SPEC を置いた複製で `soujo next check` を実行した。
- 基準5・7・9・10 は `soujo close` / `soujo next check`・`validate_plugin.py`・`npm test`・`readlink "$(command -v soujo)"` を直接実行して確認。

| # | 基準 | 状態 |
|---|---|---|
| 1 | `.soujo/` の4ファイルだけで、会話履歴なしに `resume` → `go` が成立する | ✓ `resume` と `go` は毎回新しいセッション（Codex はメモリファイルを検索したが一致なし） |
| 2 | **同じリポジトリで Claude Code → Codex → Claude Code と切り替えても、`.soujo/` の記録が途切れない** | ✓ L1（Claude Code）・L2（Codex）・L3（Claude Code）の `layer:` コミットと LOG が順に並ぶ |
| 3 | `spec` の質問は常に1つずつで、7問以内に `SPEC.md` ができる | ✓ 3問、回答ごとに `SPEC.md` を更新 |
| 4 | `go` 1回で、1層が実装・コミットまで到達し、`PLAN.md`/`LOG.md`/`NEXT.md` が更新される | ✓ 両ホストで |
| 5 | `NEXT.md` が5行を超えると `soujo close` が拒否し、`soujo next check` が警告する | ✓ `close` は終了1で何も書かない。`next check` は警告して終了0 |
| 6 | Claude Code：`NEXT.md` を更新せずに終えると Stop フックが警告する（ブロックはしない） | ✓ 未コミットの変更があるとき、木がクリーンで `次:` がチェック済みの層のときの両方。`systemMessage` だけで、セッションは普通に終わった |
| 7 | Codex：`$plugin-creator` の `validate_plugin.py` が通る | ✓ |
| 8 | `review` の出力が表形式で、件数を絞っていない | ✓ Claude Code のみ：`soujo:reviewer` の8件を順に全部。ただし加工あり（§14） |
| 9 | `npm test` が通る。`state.ts` の公開関数それぞれに1つ以上のテストがある | ✓ L12 時点で171テスト |
| 10 | CLI は実行時依存ゼロで、`npm i -g` または `npm link` 後に `soujo` が PATH から呼べる | ✓ `soujo` はこのリポジトリの `dist/cli.js` を指す |
| 11 | `spec` が7行以内の原則とキー付きの受け入れ基準を書き、その形から外れた `SPEC.md` を `soujo next check` が警告する | ✓ `spec` は7問を1つずつ聞き、形どおりの原則4行と A1〜A5 を書いた（`next check` の警告なし）。原則9行（うち1行は形の崩れ）・重複キー・キーのない基準を持つ SPEC では、`next check` が警告して終了0 |
| 12 | 最後の層の後、両ホストで `resume` → `go` が `converge` を走らせる：差があればキー付きの層を足し、次の `go` がそれを締め、その後の `converge` が収束を記録して `NEXT.md` を `plan` に向ける | ✓ 両ホストで：`go` が L4 を締めて `converge` に切り替わり、`（A6 missing）` で終わる層を足した。次の `go` がそれを締め、その後の `converge` が `converge: 収束` を記録し、PLAN を変えずに `次: plan` にした |

## 13. 実装

依存順・各30分以内の12層で実装した。一覧と完了条件は `.soujo/PLAN.md`。当初の10フェーズからの変更は、next と resume/close の分割、スキル作成と実機確認の分割、map をスキルより前へ移したこと（`plan` スキルが `soujo map plan` を呼ぶため）。受け入れ後の L13〜L15 は、§14 の未決だったもの（決定へ移した）を実装する：`soujo --help`、`次: spec` / `次: plan` の effort、`soujo log rotate`。L16〜L17 は、何日か離れた後に戻るための `soujo brief` と `節目` エントリを足す。L18 は、ホストのプラグインの置き場所での `soujo` の実行を拒否する。L19 は、`resume` スキルが `soujo brief` も実行するようにする（`soujo resume` がそれを指したとき）。L32〜L37 は、Spec-kit の constitution を `SPEC.md` の `原則` の節として、converge を最後の層の後のフェーズとして取り込む（§7・§14）。

## 14. 決定事項と未決事項

決定：
- ライセンスは 0BSD（`soujo init` が作るファイルに著作権表示を要らなくするため）。
- `dist/` はコミットする（フックが `dist/cli.js` を直接呼ぶ）。
- Codex のスキル名は改名しない。Codex 0.154 で `$go` / `$plan` は衝突しなかった。
- 両ホストともスキルは `soujo:<スキル>`、Claude Code はエージェントを `soujo:reviewer` で並べるので、`/review` や `/resume` などの組み込みと名前は重ならない。実行したのは `resume` だけ：`/soujo:resume` は組み込みの `/resume` ではなくスキルを動かし、Codex は `$resume` を `soujo:resume` に解決する。
- `claude plugin validate .` が見るのはマーケットプレイスだけ。プラグイン本体（agents・hooks を含む）は `claude plugin validate .claude-plugin/plugin.json` で、`--strict` なしで通す。ルートの CLAUDE.md への警告は意図通り（§4）。
- 両マーケットプレイスともリポジトリ直下（`"./"`）を指し、どちらも動く。
- SKILL.md に `disable-model-invocation` は書かない（Codex の validator が `true` を拒否。受け入れ基準7を優先）。
- `soujo next check` は `次:` が PLAN で `[x]` 済みの層を指すときも警告する（クリーンな木でも受け入れ基準6を満たすため）。
- `soujo close` は PLAN のチェックが未コミットなら拒否する。途中で止まった layer done が `wip:` ではなく自身の `layer:` コミットで終わるようにするため。
- ステージ・コミット・未コミット件数・未解決の競合の検査はプロジェクトのディレクトリに限る（`-- .`）。ほかの場所に競合が残っていても git はプロジェクトをコミットできるため。merge・rebase・cherry-pick・revert の途中は場所によらず拒否する。出力行に制御文字を含めない。
- `soujo next show --hook` は NEXT.md がなければ無音（Soujo を使わないプロジェクトの文脈を汚さない）。
- `soujo layer done` は NEXT.md がない・無効・まだ締める層を指しているときに拒否する（層のコミットに必ず次の一手を含めるため）。
- Codex 0.154 に `--reasoning-effort` はない。effort は `-c model_reasoning_effort=<v>` で渡す。
- このリポジトリの層名は ASCII（`layer: <層名>` のコミットメッセージを英語に保つ）。
- 全層完了後の `NEXT.md` は `次: converge`。`converge` が差を見つけなければ `次: plan` にし、`plan` は SPEC に未実装が残っていなければ層を足さずに終える。
- `soujo next set` は PLAN にない層（フェーズを除く）を拒否する。層名の写し間違いが `layer done` まで気づかれないのを防ぐため。
- `soujo --help` と `soujo <コマンド> --help` は使い方の行を出し、ほかは何も実行しない（L13）。両ホストが `soujo --help` を試してエラーになったため。また `--help` を付けた書き込みコマンドは、いま不明なオプションとして拒否して何も書かないのと同じく、何も書かないままにするため。
- `soujo next set` は `次: spec` / `次: plan`（L14）と `次: converge`（L32）に `effort: high`（§7 のそのスキルの effort）を書き、ほかの値を拒否する。最後の層の後の `NEXT.md` に場当たりの effort が残らないため。ほかの手段で書かれた `NEXT.md` は検査しない。
- `soujo log rotate` は `LOG.md` の過去の月のエントリを、位置ではなくエントリの日付で `LOG-YYYY-MM.md` へ `LOG.md` にある形のまま移し、最後のエントリと最後の `節目` エントリは必ず残す（L15・L17 レビュー）。`resume` は `前回:` を、`brief` は `節目:` を `LOG.md` から読み、状態を示すコマンドは書庫を読まないため。`layer done` には組み込まず手で実行し、ほかの未コミットの変更があれば拒否する。`commitRecords` がプロジェクト全体をステージするため。止まった rotate の変更だけは例外にする。Codex の sandbox は承認なしにコミットできず、再実行は拒否ではなく仕上げるべきだから。例外は rotate が書くもの（`LOG.md` から消したエントリ、書庫に足したエントリ）だけを認めるので、手の編集や消した書庫が `log: rotate` としてコミットされることはない。`uncommittedLogs` はエントリを中身で比べるので、移した後の `LOG.md` が `layer done` / `close` に未コミットのエントリと見えることはない。書庫の名前は `LOG-<月>.md` で月は `state.ts` が検査し、状態ファイルの名前はパスを作る前に必ず検査するので、書庫も4つの状態ファイルと同じくプロジェクト内に留める検査を通して読み書きする。エントリを区別するものも中身だけで、そのために写しを1本失う場合がある：その月の書庫にすでに同じエントリがあると、`LOG.md` に残っている同じエントリは追記されずに消え、2本が1本になる。書庫の未コミットの写しだけを別に数える案は、この設計が約束する「書庫を手でコミットした後の再実行」を拒否してしまうし、一字一句同じエントリは読み手にとって2度読む値打ちがない。
- 何日も・何週間も離れた後に戻るには、`NEXT.md`（次の一手）と `LOG.md`（全部の記録）の間の数行が要る。`soujo brief` は事実（進捗・最終 layer 後のコミット・空白・次の一手）を記録から導出するので、新たに保守するものはない。理由は、スキルがフェーズの区切り（`spec` が SPEC を書いたとき・`plan` が層を足したとき・最後の層を終える `go` の `next set` の前）に書く `節目` エントリと、この節の決定に置く（L16〜L17）。5つ目の状態ファイルは作らず、`resume` の4行も変えない（3日以上空いたときに `brief` を指すだけ）。`resume` スキルはその案内に従い、4行の後に `brief` の5行を返すので、何週間ぶりの再開も1つのスキルで済む。`go` は4行だけを読むまま（L19）。PLAN の `節目` という層は `spec` / `plan` と同じく拒否する（下記）。その層の完了エントリが節目に見えるため。`soujo log add` は、HEAD にない最後のエントリと同じものを再び足さない。スキルは `log add 節目` の直後に `next set` を実行し、`next set` が拒否された後に両方を再実行すると節目が2つになるため。
- `次: plan` と `次: converge` はすべての層より後ろとみなす。`next set --layer converge` と最後の `layer done` の間で止まって残った未チェックの層を、警告し、`resume` で示し、`close` の対象にするため。層を足した後、`next set` の前で止まった `plan` や `converge` も同じく示されるが、足した最初の層へ `soujo next set` すれば直る。
- `layer done` と `close` はコミット前に SPEC・PLAN・LOG・NEXT が書いたとおりにステージされたかを確かめる。それらを欠いたままコミットすると、`layer done` の再実行はコミット済みとして拒否され、`close` は「中断」エントリのない、または古い `NEXT.md` の `wip:` コミットを残し、スキルが直した `SPEC.md` は黙ってその層から漏れるため。
- git の状態はユーザーの設定によらず同じに読む：未追跡のファイルは `status.showUntrackedFiles` によらず数え、残った `sequencer/` は `git status` と同じく cherry-pick か revert の途中とみなす。
- プラグインも CLI も GitHub から直接入れる（§8）。CLI はアーカイブの URL `https://github.com/SilentMalachite/Soujo/archive/refs/heads/main.tar.gz` から入れる。npm 10 は `github:SilentMalachite/Soujo` を、あとで消す一時的な複製へのリンクとして入れ、入れ直しではその git 依存の準備をやり直して失敗するため。`.claude-plugin/plugin.json` は `version` を持たず、コミットごとに `claude plugin update` が届く。Codex のマニフェストは `package.json` の版を保つ。
- 読み書きはプロジェクトの外に出ない（§6）。取得したリポジトリに仕込まれた symlink で、ふだんの記録操作がユーザーのファイルを上書きしたり、モデルに届くフックの出力や警告に載せたりしうるため。
- 層名は PLAN に1回だけ現れ、`spec` / `plan` / `converge` / `節目` にしない：そうでなければ `next set` と `layer done` は拒否し、`next check` は警告する。重複した層は自分の `layer:` コミットを持てず、`次:` のフェーズは同名の層と区別できず、`brief` は `節目` という層の完了エントリを節目と取り違えるため。フェーズは PLAN の層と照合しない。
- 層名は空でなく制御文字を含まず、層には完了条件がある。前の2つは行番号で示す：どちらもメッセージに引用して返せず、貼っても一致せず、直す対象は行そのものだから。3つ目も行番号で示し、`layer done` が拒否する：締める基準のない層は次の `NEXT.md` の `確認:` を空にするから。`next check` は警告に留める：規則より前に書かれた `PLAN.md` でも再開でき、`layer done` に至る30分の作業より前にその層を示せるから。コードフェンスの中のチェック項目はそもそも層ではない：人やほかのツールが `PLAN.md` に書いた書式の例を層として数えたりチェックしたりすると以後の層がすべてずれるから。閉じ忘れたフェンスはファイルの終わりまで飲み込むので、その行を示して報告する：飲み込まれた層が何も言われずに消えないように。例の入れ物はフェンスだけ：4スペース以上字下げした項目も、HTML コメントの中の項目も、層として数える。区切りの後に何もない層（`- [ ] L2 state —`。完了条件を書き忘れる最も自然な形）は、区切りを層名に含めず、完了条件なしとして扱う。
- `NEXT.md` の `確認:` と、その層の `PLAN.md` の完了条件は、同じことを2つのファイルに書いている。`NEXT.md` はそれだけで再開できるファイルで、`PLAN.md` は条件を決める場所だから。`next set` が一方を他方へ写し、その後どちらかを直せば離れる。違えば `next check` が警告し、`plan` スキルは `PLAN.md` を書き直した後にそれを走らせる。計画が持たなくなった条件で層を締めないため。空白の連なりは同じと見るので、詰め直しや折り返しは違いにならない。揃える約束のないところは比べない：フェーズ・`PLAN.md` にない層・重複している層・完了条件のない層、および完了済みか手前を飛ばした層（そちらの警告の方が直す先）。写さずに言い換えた `--check` はその層の間ずっと警告になるが、それが拒否しない代償である。完了条件は文であり、`next set` には言い換えと別の約束の区別がつかない。
- 制御文字とは、C0 制御（U+0000〜U+001F。タブ・CR・LF を含む）・DEL（U+007F）・C1 制御（U+0080〜U+009F。Latin-1 として解釈する端末がエスケープ列と取る）・行区切り（U+2028/2029）。出力行・`LOG.md` の行・`NEXT.md` の値・`log add` と `layer done` が受ける層名は、すべてこの範囲で判定する。`NEXT.md` の値に含まれていれば置き換えずに拒否する（`次:` は `wip:` コミットの件名になるため）。
- `templates/CLAUDE.md` / `templates/AGENTS.md` はどのプロジェクトにも当てはまる内容だけを持ち、このリポジトリの写しは末尾に Soujo 本体の節を足す。`soujo init` がどのスタックのプロジェクトにもテンプレートを複製するため。
- `soujo` はホストのプラグインの置き場所では動かない（L18・§6）。`~/.claude/plugins/` と `~/.codex/plugins/` の下の導入キャッシュとマーケットプレイスの複製には、このリポジトリが `.soujo/` ごと（Codex のキャッシュと Claude Code のマーケットプレイスの複製は `.git` も）入っていて、モデルがそこへ `cd` したりその `.soujo/` を読もうとしたりすることがあり、ホスト側の保護とスキルの警告でしか止まっていなかった。そこで `resume` すればこのリポジトリの記録が出て、`init` やコミットは複製に入る。検査はカレントディレクトリの実パスで行うので、複製への symlink も捕まえる。macOS と Windows のファイルシステムは通常大文字小文字を区別しないので、判定でも区別しない。複製のファイルをほかのツールで読むのは CLI の届く範囲外。`next show --hook` / `next check` は Soujo 外と同じく無音にし、そこで開いたセッションでフックがエラーにならないようにする。`--hook` なしの `next show` は、そこでは拒否される `soujo init` を案内せず、拒否する。ホストがその場で読む checkout（ローカルディレクトリのマーケットプレイス、`claude --plugin-dir`）は普通のプロジェクトで、拒否しない。
- コミットはリポジトリの git hook を通す（`--no-verify` を付けない）。秘密情報の検査のようにコミット内容を守る hook は、層と `wip:` のコミットも守るべきだから。hook が拒めば記録を書いた後にコミットが失敗し、エラーがそう示すので、原因を直して再実行すればコミットされる。
- `layer done`・`close`・`log rotate` はプロジェクト全体をステージするので、git に無視されていない未追跡ファイルに認証情報のファイル名があれば、何も書く前に拒否する。`.gitignore` は利用者のもので、書き忘れがあると鍵が履歴に入るため。名前はこのリポジトリのプライバシーテストが検査するものと同じ。追跡済みのファイルと `git add` したファイルは利用者の選択としてコミットする。
- リポジトリの外では `.soujo/` をカレントディレクトリでだけ探す（§6）。`soujo init` が作る場所に合わせ、親へ辿るとホームディレクトリに作った `.soujo/` がその下の全ディレクトリのプロジェクトになるため。
- 離れていた日数（`resume` の `N日ぶり`、`brief` の `空白`）はローカル時刻の暦日で数える。`formatDate` が出す日付と同じにし、日数と横に出す日付が食い違わないように。
- CI は Ubuntu・macOS に加えて Windows でもテストを走らせる。パスの比較・symlink・別名の `.git`・プラグインディレクトリ・`headState` を守るテストは Windows では自分を skip するので、そのファイルシステムのために書いた経路だけが試されないままだった。
- 未コミット件数は `git status` の出力を 16 MiB までしか読まず、超えたら `N件以上` と出す。巨大な作業ツリーで Stop hook のメモリを埋めないように。認証情報の検査が読む未追跡ファイルの一覧も同じ上限で、超えたら `layer done`・`close`・`log rotate` は拒否する（残りに認証情報のファイル名があっても見ていないため）。ほかの git の出力は、長い履歴に要る 256 MiB を上限のままにする。打ち切りで半分になったものは数えず、1件も丸ごと読めなかったときも1件と数えるので、`0件以上` とは出ない。
- git のファイル一覧は NUL 区切り（`-z`）で読む。ファイル名は改行を含みうるが、行の出力ではそれを引用して2行に割ってしまう。rename は元のパスを別のレコードとして出すが、それは1つの変更の一部。
- git の呼び出しはどれも120秒で打ち切り、ほかの git の失敗と同じ1行で伝える。`commit.gpgSign` の pinentry が読む先を持たないときや、戻らない hook があるときに、`soujo` を呼んだセッションを止めたままにしないため（CLI 側が終わるだけでは終わらない）。
- 認証情報のファイル名に鍵の `.pub` も入れる。公開鍵自体は秘密ではないが、同じ名前で秘密鍵の隣にあり、`git add -A` がそれを拾うなら、そのディレクトリはコミットするつもりのものではない。
- 文の始まりの `{` はブロックとして読む。ラベルや `case` / `default` の後も同じで、対応する `}` の後の `/` は除算ではなく正規表現の始まりになる（`src/map.ts`）。それ以外の `:`（オブジェクトリテラル・条件演算子・型注釈）は値を後に置く。
- `soujo map code` はプロジェクトの外の `dir` も指定どおり読み、最初の注記でそう示す。`map` スキルはユーザーが名指ししたときだけ渡す。
- Spec-kit の constitution は、5つ目の状態ファイルではなく `SPEC.md` の `原則` の節にする（L32〜L37）：`- P<n> <名前> — <1文>` を7行まで。ほかの節・完了条件・既存のコードより優先する。こうすると規則は `go` が再開時にもともと読むファイルにあり、判定できる7行なら関門の工程なしに毎層で当てはめられる：`go` は原則に反さないと完了条件を満たせないとき1問だけ聞き、`reviewer` は原則を最初に見て、`converge` は違反を先頭に置く。Spec-kit の semver と同期レポートは持たない：原則を変えるのは `spec` の対話だけで、何を変えたかは `brief` が示すその `節目` エントリに書く。CLAUDE.md / AGENTS.md とそのテンプレートは「原則がほかより優先する」とだけ書き、原則そのものは SPEC の1か所にだけ書く。
- 原則と受け入れ基準はキー（`P<n>`・`A<n>`）を持ち、再利用も振り直しもしない。`converge` が足す層が何を閉じるかを名指し（`（A3 partial）`）、後の `converge` が計画済みの差を見分けられるようにするため。`next check` は、形の違う原則の行・7行を超える原則・キーのない字下げなしの基準・重複したキーを警告し、拒否はしない。既存の SPEC でも再開できるように。欠けたキー（原則なら名前も）は `spec` スキルが意味を変えずに付ける。読むのはテンプレートの日本語の見出しだけ（§5）。CLI が `NEXT.md` のキーを字面で読むのと同じ。それを持たない SPEC（このリポジトリの英語の SPEC など）は検査せず、`converge` は節ごとに読む。
- Spec-kit の converge は、最後の層の後のフェーズ `次: converge` にする（L32〜L37）。各層は自分の完了条件で確かめられ、その総和を SPEC に照らすのはここだけなので、§2 が外した検証の工程ではない。`plan` が読まないコードを読み、費用も大きいので、`plan` のモードではなく独立したフェーズにする。書くのは PLAN・LOG・NEXT だけ：層を追記するだけなら、チェック済みの行とその `layer:` コミットの意味は変わらず、SPEC とコードを変えるのは `spec` と `go` だけのままになる。`unrequested` の実装は層にしない。残す（SPEC を変える）か消すかは利用者が決めることだから。全層が完了して `NEXT.md` が使えないとき、`resume` は `converge` を示す。SPEC にあって PLAN が受け取らなかったものも `converge` が見つける。`SPEC.md` のテンプレートは原則とともに変わるので、`resume` は`#` の見出し・空行・HTML コメントしか持たない SPEC を、どの版のテンプレートから複製されたものでも未作成とみなす。
- `$converge` は Codex の組み込みと衝突しない（L37）：Codex のシステムスキルは `imagegen`・`openai-docs`・`plugin-creator`・`review-agent`・`skill-creator`・`skill-installer` で、`$converge` は `soujo:converge` を読み込んだ。

未決：
- Codex 0.154 はユーザーが信頼すると `hooks/hooks.json` を実行する（`~/.codex/config.toml` の `[hooks.state]`）。そこで `${CLAUDE_PLUGIN_ROOT}` が展開されるか、`systemMessage` が表示されるかは未確認。
- `spec` スキルが、回答ごとではなく最後にまとめて `SPEC.md` を書きがち（L12 では再現せず）。
- `spec` / `plan` / `converge` はコミットしない。次の `layer done` までは、それらが変えた `.soujo/` が未コミットのままで、差のなかった `converge` の後は SPEC が変わって層が締まるまでそれが続く。そこで `next check` は、`次:` がこの3つのどれかの間、件数から `.soujo/` を外す。フェーズがコミットしないつもりの記録について Stop フックが黙るように。それ以外の場所の変更は今までどおり警告し、数えるのはそれだけ。フェーズの記録をコミットするコマンドがあれば待ち自体をなくせるが、層ではないコミットが増える。
- `converge` の文脈量（L37）：Codex では `$converge` 単独で入力48.8万トークン（キャッシュ44.3万）、`converge` を続けた `$go` で69.1万（キャッシュ64.1万）。Claude Code では `converge` を続けた `go` が35ターンでキャッシュから123万トークンを読んだ（ターンの合計）。
- `converge` の判定は毎回同じとは限らない（L37）：収束した Codex の複製でもう一度 `$converge` を実行すると、コピー設置から `agent-review --version` を起動すると `.pyc` が書かれることを見つけ、前回はテストが書き込みを抑えていたため met とした原則（ファイルを書かない）に反するとして層を足した。収束の後の `converge` が層を足すことがある。
- Claude Code の `converge` は、`soujo init` が足した `CLAUDE.md` を `unrequested` に挙げた（L37）。Codex は挙げなかった。スキルは `unrequested` をコードについて定めている。
- Codex は、拒否されたコマンドの後の `converge` の順を守らないことがあった（L37）：2回とも節目の `log add` に、スキルが定める2行を超えて met の一覧を足し、拒否された（3行まで）。1巡目はそのコマンドを直して再実行してから先へ進んだが、2巡目は先に `next set --layer plan` を実行し、節目はその後に残した。その間で止まっていれば、節目のない `次: plan` が残った。
- Codex の文脈量：`$go` 1回で入力約30万〜69万トークン（大半キャッシュ。主に Codex 全体の文脈）。L12 では無関係なグローバルスキルも読み、Codex のメモリファイルを検索した。
- Claude Code の `review` は `soujo:reviewer` の指摘を順に全部残したが、返った表を加工せずに出さなかった（§7）：パスを短くし、セルを言い換え、句をいくつか落とし、前置きの1文を足した。
- `soujo:reviewer` は場所の列に絶対パスを書いていた。`agents/reviewer.md` に「作業ツリーからの相対 `path:line`。絶対パスは書かない」と書いた（`review` は表を加工せずそのまま出すため）。
- Bash の許可リストのもとで、`spec` の最初のコマンド（`command -v soujo && soujo init; ls; …`）が1回拒否され、モデルは単独のコマンドでやり直した（L37 でも同じ）。
- `go`（L3）は、既存のテストが求めたため、導入先 SPEC の範囲外の `CHANGELOG.ja.md` も変えた。報告はしたが SPEC は直さなかった。
