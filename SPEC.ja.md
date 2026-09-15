# SPEC — 層序（Soujo）: 中断でき、再開でき、少ない文脈で進める AI コーディング（Claude Code / Codex 共用、TypeScript 実装）

[English](SPEC.md) | **日本語**

正本は英語版 `SPEC.md`。これはその日本語訳。このリポジトリの `.soujo/SPEC.md` は `SPEC.md` へのシンボリックリンク。

## 0. 一言で

Soujo は AI コーディングを **中断でき（interruptible）・再開でき（resumable）・少ない文脈で進められる（low-context）** ものにする。作業は30分以内の層で進めて層ごとにコミットし、状態はすべて短い4ファイルに置く。だからセッションはいつ止まってもよく、次のセッションは Claude Code でも Codex でも、そのファイルだけで続きから始められる。

| 性質 | 要件 | 満たす仕組み |
|---|---|---|
| Interruptible development | どこで止めても、作業も決定も失わない | 1層=1コミット。`soujo close` が途中の作業を `wip:` でコミット。`soujo next check` が再開できない状態を警告（§6） |
| Resumable AI coding | 次のセッションは会話履歴を要らず、もう一方のホストでもよい | 5行以内の `NEXT.md`（§5）。`soujo resume`。両ホストで共有する `skills/` と `.soujo/`（§4） |
| Low-context development | 利用者もモデルも、1画面を超える状態を抱えなくてよい | 4ファイルの行数上限（§5）。質問は1つずつ（§7）。判断の要らない記録の更新は CLI に寄せる（§6） |

Spec-kit の「仕様→計画→実装」と Superpowers の「作法をスキルで型にする」を、この3つの性質に削ぎ落とし、モデルの自律性は邪魔しない。
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
| 2ホストを併用する | 記録とロジックはモデル非依存 | ロジックは TypeScript CLI に集約。SKILL.md は共有。ホスト差はマニフェストと指示ファイルのみ |

## 3. ユーザーストーリー

1. `/soujo:spec`（Codex では `$spec`）で一問一答のうちに `SPEC.md` ができる。
2. `/soujo:plan` で、30分以内の「層」の一覧 `PLAN.md` ができる。各層に完了条件が1行ある。
3. `/soujo:go` で次の層が実装・テスト・コミットされ、`LOG.md` と `NEXT.md` が更新される。
4. 数日空けて `/soujo:resume` を打つと短い状況説明が出て、そのまま続けられる。
5. Claude Code で L3 まで進めた同じリポジトリを Codex で開き、`$resume` → `$go` で L4 が続く。逆も同じ。
6. `/soujo:map` で現在の構造が図になる。`/soujo:review` で見落としが全部列挙される。

## 4. 構成（1リポジトリで両ホスト）

```
Soujo/
├── .claude-plugin/plugin.json        # Claude Code 用マニフェスト（version なし：コミットが版になる）
├── .claude-plugin/marketplace.json   # Claude Code 用マーケットプレイス（source "./"）
├── .codex-plugin/plugin.json         # Codex 用マニフェスト（hooks フィールドは持たない）
├── .agents/plugins/marketplace.json  # Codex 用マーケットプレイス（source.path "./"）
├── skills/                           # 両ホスト共有。commands/ は使わない
│   ├── spec/  plan/  go/  resume/  map/  review/  close/   （各 SKILL.md）
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
├── templates/                        # soujo init が導入先に複製するファイル
│   ├── CLAUDE.md（Opus 5 版）  AGENTS.md（Astra 版）
│   └── SPEC.md  PLAN.md  LOG.md  NEXT.md
├── CLAUDE.md  AGENTS.md              # このリポジトリ自身の指示（templates の内容＋このリポジトリの節）
├── README.md  SPEC.md  CHANGELOG.md  CONTRIBUTING.md  SECURITY.md  CODE_OF_CONDUCT.md  LICENSE  （＋ .ja.md の日本語訳）
├── .github/                          # Issue フォーム、プルリクエストのテンプレート、CI（npm test）、Dependabot
└── package.json  tsconfig.json  tsconfig.test.json
```

方針：
- **ロジックは全部 `src/` に置く。** SKILL.md は「いつ何を `soujo` に頼むか」だけを書き、判断や整形を SKILL.md に書かない。
- プラグイン直下の CLAUDE.md / AGENTS.md はどちらのホストでも文脈として読まれない。`soujo init` が `templates/` から導入先へ複製する。
- SKILL.md の frontmatter は `name` / `description` のみ。`disable-model-invocation` は使わない（Codex の `validate_plugin.py` が `true` を拒否するため）。
- 実行時に使う文面（CLI の出力、スキル、テンプレート、CLAUDE.md / AGENTS.md）は日本語。利用者向け文書は英語を正本とし、日本語訳を添える。

## 5. 状態ファイル `.soujo/`

| ファイル | 役割 | 上限 | 書く人 |
|---|---|---|---|
| `SPEC.md` | 何を作るか。目的・非目標・受け入れ基準・技術判断 | 目安100行 | `spec` スキル |
| `PLAN.md` | 層の一覧。`- [ ] 層名 — 完了条件` | 1項目1行 | `plan` スキル。`soujo layer done` がチェック |
| `LOG.md` | 追記専用の日誌。`## YYYY-MM-DD 層名` の下に最大3行 | 1エントリ3行 | `soujo log add` / `layer done` / `close --note` |
| `NEXT.md` | 次の1手。**再開時にこれだけ読めばよい** | 5行 | `soujo next set` |

`NEXT.md` の形（CLI が検証する。キーは日本語のまま、区切りは `:` と `：` のどちらも可）：

```
次: <層名>
前提: <直前に終わったこと／依存>
確認: <この層が終わったと判断する方法>
注意: <未解決・地雷。なければ「なし」>
effort: <low|medium|high|xhigh>
```

## 6. CLI `soujo`

- Node 20+、ESM、**実行時依存ゼロ**（`node:*` のみ）。devDependencies は `typescript` と `@types/node` だけ。
- 出力は常に短く、日本語。標準出力は原則5行以内（`--help` と `map` は超える）。エラーは標準エラーに1行、終了コード1。
- どのホストから呼ばれても同じ動作。ホスト判定はしない（`--hook` だけが Claude Code のフック向けの出力に切り替える）。
- `.soujo/` はカレントディレクトリから親へ辿って探し、git のトップレベル（`.git` のあるディレクトリ）で止める。
- `.soujo/` のファイルは、実体の隣に排他的に作った一時ファイルで置き換え、権限を保つ。`init` はその一時ファイルを置き先へリンクして作る（CLAUDE.md / AGENTS.md も）ので、書きかけのファイルを残さず、既存のものを置き換えない。それらを書くかコミットするコマンドは、先に中断された書き込みが残した一時ファイルを消す。symlink（ファイルのものも `.soujo/` のものも）はプロジェクト内かつ `.git` の外のファイルへだけ辿り、それ以外への読み書きは拒否する。読むのは通常のファイルだけ。

| コマンド | 動作 | 出力 |
|---|---|---|
| `soujo --help` / `soujo <コマンド> --help` | 使い方の行を標準出力に出して終了0：最初の引数なら全コマンド、コマンドの後ならそのコマンドの1行、2語コマンドの1語目（`next`・`plan`・`log`・`layer`・`map`）の後ならその語で始まるコマンド（後に不明な語が続いても）。`-h` も同じ。`--` より前の単独の引数だけが対象（`--note=--help` や `--` の後は普通の引数）で、ほかの引数より先に判定するので、何も検査・実行しない（`--hook` 付きの `next show` / `next check` でも）。各行はそのコマンドの使い方エラーが示すのと同じ `soujo …` の文字列（`next check` には使い方エラーがない）。不明なコマンドは従来どおり、打たれた名前を示すエラーで、コマンドなし・不明なコマンドのエラーは `soujo --help` を案内する | 1コマンド1行 |
| `soujo init` | templates から `.soujo/` を作り、CLAUDE.md / AGENTS.md がなければ複製する。git 管理下ならトップレベルに作る。既存ファイルは上書きしない。状態ファイルの実体（ファイルか `.soujo/` の symlink の先）がプロジェクトの外か `.git` の中なら、何も作らずに拒否 | 作成したファイル＋作らなかったファイルの1行。git 管理外なら `git init` が要る旨の1行 |
| `soujo next show [--hook]` | `NEXT.md` を表示。なければ「NEXT.md なし」。`--hook` 時は NEXT.md がなければ何も出さない | 5行 |
| `soujo next set --layer --premise --check [--caution] [--effort]` | `NEXT.md` を全文書き直す。既定は 注意=`なし`、effort=`medium`。層 `spec` / `plan`（前後の空白を除き、大文字小文字も含めて完全一致で比べる）の effort は `high`（§7）：`high` 以外の `--effort` は拒否して何も書かず、エラーは `--effort` を外すよう示す。値は1行。PLAN に層があるとき、PLAN にない層（`spec` / `plan` を除く）は何も書かずに拒否。PLAN に同じ層名が複数あるか `spec` / `plan` という層がある間は、どの層も何も書かずに拒否 | 1行 |
| `soujo next check [--hook]` | NEXT.md がない・無効・PLAN で `[x]` 済みの層か未チェックの層より後ろを指す（`plan` はすべての層より後ろ）、PLAN に同じ層名が複数あるか `spec` / `plan` という層がある、またはプロジェクト内に未コミット変更があれば警告（未追跡のディレクトリは `status.showUntrackedFiles` の設定によらず1件と数える）。Soujo を使っていないプロジェクトでは無音。`--hook` 時は `{"systemMessage": "..."}`。**終了コードは常に0** | 0〜1行 |
| `soujo plan list` | 層の一覧と完了状態 | 層数分 |
| `soujo plan next` | 最初の未完了層と完了条件 | 2行 |
| `soujo log add <層名> --line ...` | `LOG.md` に追記（1〜3行） | 1行 |
| `soujo layer done <層名> [--note ...]` | PLAN にチェック → LOG 追記 → プロジェクトのディレクトリで `git add -A -- .` と `git commit -m "layer: <層名>" -- .`（サブディレクトリのプロジェクトはそこだけをコミット）。次のときは何も書かずに拒否する：層が PLAN にない・PLAN に同じ層名が複数あるか `spec` / `plan` という層がある・note が LOG の上限を破るか `中断:` で始まる（`close` 専用）／NEXT.md がない・無効・`次:` がまだこの層／git リポジトリでない、`.soujo/` が symlink、状態ファイルの実体（symlink の先）がプロジェクトの外か `.git` の中、merge・rebase・cherry-pick・revert の途中（残った `sequencer/` を含む）、競合が未解決、`.soujo/` のファイルかその symlink の先が git に無視されている／コミット済み（`layer: <層名>` のコミットがある、または HEAD の PLAN でチェック済み）。チェックが作業ツリーにだけある（前回が途中で止まった）ときは、HEAD にまだないこの層の完了エントリが LOG のどこにもなければ（`close` の「中断」エントリは数えない）追記してコミットする。PLAN・LOG・NEXT が書いたとおりにステージされていない（skip-worktree など）間は何もコミットしない。書いた後の失敗は記録済みの範囲を示し、原因を直して再実行すれば続きから進む | 1行（追加ファイルを最大5件添える） |
| `soujo resume` | `次: <層>（effort: <e>）確認: <確認>`（NEXT.md）／`前回: <日付> <層> — <1行目>`（LOG.md 末尾エントリ）／`コミット: <hash> <件名>（未コミット N件）`／`再開: /soujo:go（Codex は $go）`。値は層名も含めて60文字で `…` に切る。ただしコマンドの中の層名は切らない。NEXT.md がない・読めない・無効・チェック済みの層を指すとき：`次:` は PLAN の次の層、`再開:` に理由と `soujo next set`。残りの層がなければ `/soujo:spec`（SPEC.md がないかテンプレートのまま）か `/soujo:plan`。NEXT.md が未チェックの層より後ろを指すとき（`次: plan` を含む）：`次:` はその層、`再開:` は `soujo layer done` を示す。PLAN のチェックが未コミット（layer done が途中）なら `再開:` はその再実行。読めないファイルや git の失敗はその行だけを縮退させる | 4行 |
| `soujo close [--note ...]` | `--note` を LOG に「中断: ...」で記録 → プロジェクトを `wip: <層名>` でコミット → 再開方法。次のときは何も書かずに終了1：layer done と同じコミット不能条件／NEXT.md がない・無効・チェック済みの層を指す／PLAN のチェックが未コミット（先に layer done を再実行）／note が空・LOG の上限を破る。PLAN・LOG・NEXT が書いたとおりにステージされていない（skip-worktree など）間は何もコミットしない。層は `次:`、ただし `次:` が未チェックの層より後ろを指すとき（next set と layer done の間で止まった）はその未チェックの層。HEAD にまだないその層の「中断」エントリが LOG のどこかにあれば追記せず残すので、コミット失敗後の再実行はコミットだけやり直す | 2行 |
| `soujo map plan` | `PLAN.md` を縦の ASCII 図に（完了 `[x]`／次 `←次`、完了条件を縦線 `\|` の横に）。全層完了なら末尾に `全層完了` | 層数×2行 |
| `soujo map code [dir]` | `dir`（既定はプロジェクトのルート、Soujo 外では cwd）の主言語（ファイル数が最多）の相対 import を Mermaid `graph LR` にする。言語は `src/map.ts` の `LANGUAGES` に1行ずつ。import 規則を持つ行（初期は TS/JS）だけを図にし、主言語が規則なし・認識できるファイルがないときは ASCII のディレクトリ木。パッケージとパス別名の import と、固定の文字列1つでない指定（`'./a' + b`）は線にしない。指定の中のエスケープは復号する。`node_modules`・`dist`・`build`・`target`・`vendor`・`deps`・`_build`・`__pycache__`・`venv`・`coverage`・ドットで始まるもの・symlink は除外。読めないサブディレクトリとファイルは飛ばして件数を示す。上限は走査5000件・ファイル100（つながりの多い順に残す）・線300・木200行で、超えたら注記 | Mermaid か木 |

`state.ts` の公開関数（純粋関数、それぞれテストあり）：
`parseNext` / `formatNext` / `validateNext` / `parsePlan` / `validatePlan` / `formatItem` / `nextLayer` / `nextStatus` / `newlyDone` / `markDone` / `printable` / `logLines` / `appendLog` / `parseLog` / `lastLog` / `formatDate`。

## 7. スキル（`skills/`、両ホスト共有）

共通規約：description は1文・狭いトリガー（Astra はスキルが多いと description を切り詰める）。本文は「読むもの → やること → `soujo` に頼むこと → 出力の形」の4節、各節3行以内。「読むもの」の1行目で、`soujo`（PATH 上のコマンド）・git・`.soujo/` は作業中のプロジェクトのもので、スキルの置き場所へ cd したりそこの `.soujo/`・`dist/` を使ったりしない、と示す。「必ず〜を読め」「テストしろ」「再確認しろ」は書かない（両モデルとも自分でやる）。コマンド例の値は単一引用符で書く。形式と `soujo` のコマンド・オプションは `test/skills.test.ts` が検査する。

| スキル | 読むもの | やること | 呼ぶ CLI | 出力 | effort |
|---|---|---|---|---|---|
| `spec` | `soujo init` 後の `SPEC.md`。技術の候補を出すときは設定ファイル | 質問1つずつ（答えを受けてから次）・最大7問。各問に番号付きの答え候補。答えるたびに書く。技術スタックは設定ファイルで決まればそれ、決まらなければ質問（既定値を持たない） | `soujo init` → `soujo next set`（次: plan） | `SPEC.md` の骨組みの表1つと init が作ったファイル | high |
| `plan` | `SPEC.md` と既存の `PLAN.md` | 未実装を30分以内の層に分割。依存順。未完了は最大12層。未実装がなければ層を足さず終える | `soujo next set`（`次:` が最初の未完了の層でないときだけ）→ `soujo map plan` | `PLAN.md` と図 | high |
| `go` | `soujo resume` → `NEXT.md` → `SPEC.md` → PLAN の該当層 | `再開:` が go 以外ならそれに従う。層を完了条件まで実装。**終わったら次の層の `NEXT.md` を先に書き（最後の層の後は `次: plan`）、その後 `layer done`**。NEXT が spec / plan を指すならそちらへ | `soujo resume` → `soujo next set` → `soujo layer done` | 結果1文＋変更ファイル | `NEXT.md` の指定 |
| `resume` | — | CLI の出力をそのまま返す | `soujo resume` | 4行 | low |
| `map` | `diff` のときだけ、直近の層の diff とその周辺 | `plan` / `code [dir]` は CLI の図をそのまま示す。`diff` は Before/After を自分で描く | `soujo map` | 図＋5行以内 | medium |
| `review` | 引数の範囲、なければ最新の `layer:` コミットの親から作業ツリーまでの diff（未追跡も含む） | **見つけたものは全部**、表 `# / 場所 / 何が / なぜ / 直し方`。`soujo:reviewer` を起動できれば1体だけ起動し、表を加工せず出す | — | 表 | medium |
| `close` | — | 引数の一言を `--note` に渡す。なければ進んだところを1行にして渡す | `soujo close` | 2行 | low |

effort 列は人やホストの設定で使う目安（§8）。SKILL.md の frontmatter には書く場所がない。

`go` が「NEXT を先に書いてから `layer done`」なのは、`layer done` のコミットに次の `NEXT.md` を含めるため。これで `next check` が常に「クリーンな木＋有効な NEXT」で通る。

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
| 範囲を広げがち | 「頼まれた範囲で完了」を明記。層の完了条件で範囲を固定 |
| サブエージェントを起動しやすい | レビュー以外は起動しない |
| 低 effort でも精度が保たれる | resume/close は low、go は層ごとに指定 |
| 「重要なものだけ」と言うと本当に減らす | レビューは全件報告、絞り込みは人 |

## 10. GPT-6 Astra への適合（AGENTS.md 側）

OpenAI の「Rethinking skills and prompts for GPT-6 Astra」（2026-09-11）に沿う。

| 傾向 | 扱い |
|---|---|
| スキルが多いと description を切り詰めて誤選択する | スキルは7つ、description は1文。他のスキル集を同居させない |
| 「毎回これを読め」は文脈を浪費する | 「必ず読め」を AGENTS.md に書かない。読む対象は各スキルの中で条件付きに示す |
| テストや検証は自分でやる | テスト・検証の指示を書かない |
| 最初の実装で戻ってきて、途中で止まりやすい | **完了を先に定義**する：層の完了条件＝止まってよい地点。「完了条件を満たすまで続ける」を明記 |
| 境界の強い言い方を真に受けて止まりすぎる | 禁止形ではなく許可形で書く：「このリポジトリでの実装・テスト・コミットは許可済み」 |
| 判断が結果を変えるときは非同期で質問しつつ続行する | 質問は1つ・番号付き選択肢、という応答規約だけ与える |
| effort は `model_reasoning_effort` | `NEXT.md` の `effort:` を人が config か `-c` に写す |

## 11. 非目標

- 複数人・複数エージェントの並行開発。
- Spec-kit の完全互換（constitution、research 文書など）。
- 会話履歴の検索や要約。記録は `.soujo/` にしか置かない。
- 導入先の言語・フレームワークの選定。プラグインは既定のスタックを持たず、`SPEC.md` とリポジトリの設定から読み取る。
- Gemini CLI / Cursor など第3のホスト対応（SKILL.md 共有で将来可能だが、いまは対象外）。
- CLI の対話 UI。`soujo` は引数を受けて即終了する。

## 12. 受け入れ基準

2026-09-13 に L12 で10項目すべてを確認した。`soujo` は `npm link`、プラグインは両ホストに導入（`claude plugin install`・`codex plugin add`）。対象は既存の Python プロジェクト（AgentReview 0.4.0、テストは `unittest`）の複製で、元から独自の `AGENTS.md` があったため `soujo init` は `CLAUDE.md` だけを足し、Codex はそのプロジェクトの `AGENTS.md` のもとで動いた。`spec`・`plan`・L1 を Claude Code、L2 を Codex、L3 を Claude Code で進めた。要約は `.soujo/LOG.md`。

- Claude Code：`claude -p` に `--permission-mode acceptEdits` と、`soujo`・`git`・`python3` とファイル操作ツールの許可リスト。`spec` は1セッションを `--resume` で4往復、`plan`・L1・`resume`・L3・`review`・Stop フックの確認はそれぞれ新しいセッション。
- Codex：`codex exec`（`workspace-write`、`--add-dir .git`）で `$resume` と L2 の `$go` を別セッションで実行。Soujo のフックは信頼しないまま。
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

## 13. 実装

依存順・各30分以内の12層で実装した。一覧と完了条件は `.soujo/PLAN.md`。当初の10フェーズからの変更は、next と resume/close の分割、スキル作成と実機確認の分割、map をスキルより前へ移したこと（`plan` スキルが `soujo map plan` を呼ぶため）。受け入れ後の L13・L14 は、§14 の未決だった2件（決定へ移した）を実装する：`soujo --help` と、`次: spec` / `次: plan` の effort。

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
- ステージ・コミット・未コミット件数はプロジェクトのディレクトリに限る（`-- .`）。出力行に制御文字を含めない。
- `soujo next show --hook` は NEXT.md がなければ無音（Soujo を使わないプロジェクトの文脈を汚さない）。
- `soujo layer done` は NEXT.md がない・無効・まだ締める層を指しているときに拒否する（層のコミットに必ず次の一手を含めるため）。
- Codex 0.154 に `--reasoning-effort` はない。effort は `-c model_reasoning_effort=<v>` で渡す。
- このリポジトリの層名は ASCII（`layer: <層名>` のコミットメッセージを英語に保つ）。
- 全層完了後の `NEXT.md` は `次: plan`。`plan` は SPEC に未実装が残っていなければ層を足さずに終える。
- `soujo next set` は PLAN にない層（`spec` / `plan` を除く）を拒否する。層名の写し間違いが `layer done` まで気づかれないのを防ぐため。
- `soujo --help` と `soujo <コマンド> --help` は使い方の行を出し、ほかは何も実行しない（L13）。両ホストが `soujo --help` を試してエラーになったため。また `--help` を付けた書き込みコマンドは、いま不明なオプションとして拒否して何も書かないのと同じく、何も書かないままにするため。
- `soujo next set` は `次: spec` / `次: plan` に `effort: high`（§7 のそのスキルの effort）を書き、ほかの値を拒否する（L14）。最後の層の後の `NEXT.md` に場当たりの effort が残らないため。ほかの手段で書かれた `NEXT.md` は検査しない。
- `次: plan` はすべての層より後ろとみなす。`next set --layer plan` と最後の `layer done` の間で止まって残った未チェックの層を、警告し、`resume` で示し、`close` の対象にするため。`next set` の前で止まった `plan` も同じく示されるが、最初の層へ `soujo next set` すれば直る。
- `layer done` と `close` はコミット前に PLAN・LOG・NEXT が書いたとおりにステージされたかを確かめる。それらを欠いたままコミットすると、`layer done` の再実行はコミット済みとして拒否され、`close` は「中断」エントリのない、または古い `NEXT.md` の `wip:` コミットを残すため。
- git の状態はユーザーの設定によらず同じに読む：未追跡のファイルは `status.showUntrackedFiles` によらず数え、残った `sequencer/` は `git status` と同じく cherry-pick か revert の途中とみなす。
- プラグインも CLI も GitHub から直接入れる（§8）。CLI はアーカイブの URL `https://github.com/SilentMalachite/Soujo/archive/refs/heads/main.tar.gz` から入れる。npm 10 は `github:SilentMalachite/Soujo` を、あとで消す一時的な複製へのリンクとして入れ、入れ直しではその git 依存の準備をやり直して失敗するため。`.claude-plugin/plugin.json` は `version` を持たず、コミットごとに `claude plugin update` が届く。Codex のマニフェストは `package.json` の版を保つ。
- 読み書きはプロジェクトの外に出ない（§6）。取得したリポジトリに仕込まれた symlink で、ふだんの記録操作がユーザーのファイルを上書きしたり、モデルに届くフックの出力や警告に載せたりしうるため。
- 層名は PLAN に1回だけ現れ、`spec` / `plan` にしない：そうでなければ `next set` と `layer done` は拒否し、`next check` は警告する。重複した層は自分の `layer:` コミットを持てず、`次: plan` はフェーズと同名の層を区別できないため。フェーズは PLAN の層と照合しない。
- `templates/CLAUDE.md` / `templates/AGENTS.md` はどのプロジェクトにも当てはまる内容だけを持ち、このリポジトリの写しは末尾に Soujo 本体の節を足す。`soujo init` がどのスタックのプロジェクトにもテンプレートを複製するため。

未決：
- `LOG.md` が長くなったときの巻き取り（月ごとに `LOG-YYYY-MM.md` へ退避する `soujo log rotate`）。
- Codex 0.154 はユーザーが信頼すると `hooks/hooks.json` を実行する（`~/.codex/config.toml` の `[hooks.state]`）。そこで `${CLAUDE_PLUGIN_ROOT}` が展開されるか、`systemMessage` が表示されるかは未確認。
- モデルがスキルの置き場所へ `cd` したり、そこの `.soujo/` を読もうとすることがある。ホスト側の保護で止まり、スキルにも警告を入れたが、CLI 側のガードは未対応。
- `spec` スキルが、回答ごとではなく最後にまとめて `SPEC.md` を書きがち（L12 では再現せず）。
- `spec` / `plan` はコミットしない。最初の `layer done` までは `.soujo/` の変更が未コミットで、Stop フックが毎回警告する。
- Codex の文脈量：`$go` 1回で入力約30万〜69万トークン（大半キャッシュ。主に Codex 全体の文脈）。L12 では無関係なグローバルスキルも読み、Codex のメモリファイルを検索した。
- Claude Code の `review` は `soujo:reviewer` の指摘を順に全部残したが、返った表を加工せずに出さなかった（§7）：パスを短くし、セルを言い換え、句をいくつか落とし、前置きの1文を足した。
- `soujo:reviewer` は場所の列に絶対パスを書く。`agents/reviewer.md` は `path:line` としか指定していない。
- Bash の許可リストのもとで、`spec` の最初のコマンド（`command -v soujo && soujo init; ls; …`）が1回拒否され、モデルは単独のコマンドでやり直した。
- `go`（L3）は、既存のテストが求めたため、導入先 SPEC の範囲外の `CHANGELOG.ja.md` も変えた。報告はしたが SPEC は直さなかった。
