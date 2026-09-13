# SPEC — 層序（Soujo）: Claude Code / Codex 共用プラグイン（TypeScript 実装）

[English](SPEC.md) | **日本語**

正本は英語版 `SPEC.md`。これはその日本語訳。このリポジトリの `.soujo/SPEC.md` は `SPEC.md` へのシンボリックリンク。

## 0. 一言で

Spec-kit の「仕様→計画→実装」と Superpowers の「作法をスキルで型にする」を、
**作業記憶に頼らず・いつ中断しても再開でき・モデルの自律性を邪魔しない**形に削ぎ落としたもの。
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
├── .claude-plugin/plugin.json        # Claude Code 用マニフェスト
├── .claude-plugin/marketplace.json   # Claude Code 用マーケットプレイス（source "./"）
├── .codex-plugin/plugin.json         # Codex 用マニフェスト（hooks フィールドは持たない）
├── .agents/plugins/marketplace.json  # Codex 用マーケットプレイス（source.path "./"）
├── skills/                           # 両ホスト共有。commands/ は使わない
│   ├── spec/  plan/  go/  resume/  map/  review/  close/   （各 SKILL.md）
├── agents/reviewer.md                # Claude Code 用サブエージェント
├── hooks/hooks.json                  # Claude Code 専用（SessionStart / Stop）
├── src/
│   ├── cli.ts        引数解釈と出力
│   ├── state.ts      .soujo/ の解析・整形・検証（純粋関数）
│   ├── files.ts      .soujo/ の探索と読み書き（薄い I/O 層）
│   ├── git.ts        git 呼び出し（薄い層）
│   ├── map.ts        ASCII / Mermaid 図の生成（純粋関数）
│   └── commands/     1コマンド1ファイル
├── test/                             # node:test（依存ゼロ）
├── dist/                             # tsc 出力。フックが直接呼ぶためコミットする
├── templates/                        # soujo init が導入先に複製するファイル
│   ├── CLAUDE.md（Opus 5 版）  AGENTS.md（Astra 版）
│   └── SPEC.md  PLAN.md  LOG.md  NEXT.md
├── CLAUDE.md  AGENTS.md              # このリポジトリ自身の指示（templates と同一内容）
├── README.md  SPEC.md  CHANGELOG.md  LICENSE  （＋ .ja.md の日本語訳）
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
- 出力は常に短く、日本語。標準出力は原則5行以内。エラーは標準エラーに1行、終了コード1。
- どのホストから呼ばれても同じ動作。ホスト判定はしない（`--hook` だけが Claude Code のフック向けの出力に切り替える）。
- `.soujo/` はカレントディレクトリから親へ辿って探し、git のトップレベル（`.git` のあるディレクトリ）で止める。

| コマンド | 動作 | 出力 |
|---|---|---|
| `soujo init` | templates から `.soujo/` を作り、CLAUDE.md / AGENTS.md がなければ複製する。git 管理下ならトップレベルに作る。既存ファイルは上書きしない | 作成したファイル＋作らなかったファイルの1行 |
| `soujo next show [--hook]` | `NEXT.md` を表示。なければ「NEXT.md なし」。`--hook` 時は NEXT.md がなければ何も出さない | 5行 |
| `soujo next set --layer --premise --check [--caution] [--effort]` | `NEXT.md` を全文書き直す。既定は 注意=`なし`、effort=`medium`。値は1行 | 1行 |
| `soujo next check [--hook]` | NEXT.md がない・無効・PLAN で `[x]` 済みの層を指す、または未コミット変更があれば警告。Soujo を使っていないプロジェクトでは無音。`--hook` 時は `{"systemMessage": "..."}`。**終了コードは常に0** | 0〜1行 |
| `soujo plan list` | 層の一覧と完了状態 | 層数分 |
| `soujo plan next` | 最初の未完了層と完了条件 | 2行 |
| `soujo log add <層名> --line ...` | `LOG.md` に追記（1〜3行） | 1行 |
| `soujo layer done <層名> [--note ...]` | PLAN にチェック → LOG 追記 → `git add -A` と `git commit -m "layer: <層名>"`。次のときは何も書かずに拒否する：層が PLAN にない・note が LOG の上限を破る／NEXT.md がない・無効・`次:` がまだこの層／merge・rebase・cherry-pick・revert の途中、競合が未解決、`.soujo/` のファイルが git に無視されている／コミット済み（`layer: <層名>` のコミットがある、または HEAD の PLAN でチェック済み）。チェックが作業ツリーにだけある（前回が途中で止まった）ときは、LOG の最後がこの層でなければ追記してコミットする。書いた後の失敗は記録済みの範囲を示し、原因を直して再実行すれば続きから進む | 1行（追加ファイルを最大5件添える） |
| `soujo resume` | `NEXT.md`・`LOG.md` 末尾・`git log -1` からの状況説明＋再開コマンド。NEXT.md がない／無効なら PLAN の次の層を示す | 4行 |
| `soujo close [--note ...]` | `NEXT.md` を検証（無効なら終了1）→ `--note` を LOG に「中断: ...」で記録 → 未コミットがあれば `wip: <層名>` でコミット → 再開方法 | 1〜2行 |
| `soujo map plan` | `PLAN.md` を縦の ASCII 図に（完了 `[x]`／次 `←次`、完了条件を縦線の横に） | 層数×2行 |
| `soujo map code [dir]` | import を走査して Mermaid `graph LR` を出す。言語ごとの import パターンは `src/map.ts` の `LANGUAGES` に1行ずつ（初期は TS/JS）。`node_modules`・`dist`・ドットで始まるものは除外。未対応言語はディレクトリ木にフォールバック | Mermaid |

`state.ts` の公開関数（純粋関数、それぞれテストあり）：
`parseNext` / `formatNext` / `validateNext` / `parsePlan` / `nextLayer` / `markDone` / `appendLog` / `lastLog` / `formatDate`。

## 7. スキル（`skills/`、両ホスト共有）

共通規約：description は1文・狭いトリガー（Astra はスキルが多いと description を切り詰める）。本文は「読むもの → やること → `soujo` に頼むこと → 出力の形」の4節、各節3行以内。「読むもの」の1行目で、`.soujo/`・`soujo`・git は作業中のプロジェクトのものでスキルの置き場所のものではない、と示す。「必ず〜を読め」「テストしろ」「再確認しろ」は書かない（両モデルとも自分でやる）。

| スキル | 読むもの | やること | 呼ぶ CLI | 出力 | effort |
|---|---|---|---|---|---|
| `spec` | 既存の `SPEC.md`。技術の候補を出すときは設定ファイル | 質問1つずつ・最大7問。各問に番号付きの答え候補。技術スタックは質問して決め、既定値を持たない | `soujo init` → `soujo next set`（次: 計画） | `SPEC.md` と骨組みの表1つ | high |
| `plan` | `SPEC.md` | 30分以内の層に分割。依存順。最大12層 | `soujo next set` → `soujo map plan` | `PLAN.md` と図 | high |
| `go` | `NEXT.md` → `SPEC.md` → PLAN の該当層 | 層を完了条件まで実装。**終わったら次の層の `NEXT.md` を先に書き、その後 `layer done`**。NEXT が spec / plan を指すならそちらへ | `soujo next set` → `soujo layer done` | 結果1文＋変更ファイル | `NEXT.md` の指定 |
| `resume` | — | CLI の出力をそのまま返す | `soujo resume` | 4行 | low |
| `map` | `diff` のときだけ `git diff` | `plan` / `code <dir>` は CLI の図をそのまま示す。`diff` は Before/After を自分で描く | `soujo map` | 図＋5行以内 | medium |
| `review` | 直近の層の diff | **見つけたものは全部**、表 `# / 場所 / 何が / なぜ / 直し方`。使えるホストでは `reviewer` を1体 | — | 表 | medium |
| `close` | — | 引数の一言を `--note` に渡すだけ | `soujo close` | 1〜2行 | low |

`go` が「NEXT を先に書いてから `layer done`」なのは、`layer done` のコミットに次の `NEXT.md` を含めるため。これで `next check` が常に「クリーンな木＋有効な NEXT」で通る。

## 8. ホスト差分

| 項目 | Claude Code（Opus 5） | Codex（GPT-6 Astra） |
|---|---|---|
| マニフェスト | `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json` |
| マーケットプレイス | `.claude-plugin/marketplace.json` | `.agents/plugins/marketplace.json` |
| 呼び出し | `/soujo:go` | `$go` |
| 指示ファイル | `CLAUDE.md`（Opus 5 版） | `AGENTS.md`（Astra 版、**写しではなく別文面**） |
| フック | `hooks/hooks.json`：SessionStart で `next show --hook`、Stop で `next check --hook` | マニフェストに hooks を書けない。`close` スキルと AGENTS.md の「止まる前に `soujo close`」で代替 |
| サブエージェント | `review` が `agents/reviewer.md` を1体だけ起動 | 使わない。`review` は本体が直接行う |
| 同時起動の上限 | `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=2` を README に記載 | 該当なし |
| effort の指定 | 層ごとに `NEXT.md` の値を会話で指示 | `codex -c model_reasoning_effort=<v>` か `~/.codex/config.toml` の `model_reasoning_effort` |
| スキルの読み込み元 | ディレクトリのマーケットプレイスはその場で読む。変更は次のセッションから反映 | 導入時のキャッシュ `~/.codex/plugins/cache/soujo/`。更新は `codex plugin add soujo@soujo` をもう一度 |
| コミット | 通常の権限で可 | `workspace-write` サンドボックスは `.git` に書けない。`layer done` / `close` は承認が要る（`codex exec` なら `--add-dir "$PWD/.git"`）。再実行でコミットだけやり直る |
| 検証の方法 | `claude plugin validate .` | 組み込みの `$plugin-creator` が持つ `validate_plugin.py` |

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

2026-09-13 に L12（既存の Python プロジェクトの複製で Claude Code → Codex → Claude Code）で10項目すべてを確認した。詳細は `.soujo/LOG.md`。

| # | 基準 | 状態 |
|---|---|---|
| 1 | `.soujo/` の4ファイルだけで、会話履歴なしに `resume` → `go` が成立する | ✓ |
| 2 | **同じリポジトリで Claude Code → Codex → Claude Code と切り替えても、`.soujo/` の記録が途切れない** | ✓ |
| 3 | `spec` の質問は常に1つずつで、7問以内に `SPEC.md` ができる | ✓（6問） |
| 4 | `go` 1回で、1層が実装・コミットまで到達し、`PLAN.md`/`LOG.md`/`NEXT.md` が更新される | ✓ |
| 5 | `NEXT.md` が5行を超えると `soujo close` が拒否し、`soujo next check` が警告する | ✓ |
| 6 | Claude Code：`NEXT.md` を更新せずに終えると Stop フックが警告する（ブロックはしない） | ✓ |
| 7 | Codex：`$plugin-creator` の `validate_plugin.py` が通る | ✓ |
| 8 | `review` の出力が表形式で、件数を絞っていない | ✓ |
| 9 | `npm test` が通る。`state.ts` の公開関数それぞれに1つ以上のテストがある | ✓ |
| 10 | CLI は実行時依存ゼロで、`npm i -g` または `npm link` 後に `soujo` が PATH から呼べる | ✓ |

## 13. 実装

依存順・各30分以内の12層で実装した。一覧と完了条件は `.soujo/PLAN.md`。当初の10フェーズからの変更は、next と resume/close の分割、スキル作成と実機確認の分割、map をスキルより前へ移したこと（`plan` スキルが `soujo map plan` を呼ぶため）。

## 14. 決定事項と未決事項

決定：
- ライセンスは 0BSD（`soujo init` が作るファイルに著作権表示を要らなくするため）。
- `dist/` はコミットする（フックが `dist/cli.js` を直接呼ぶ）。
- Codex のスキル名は改名しない。Codex 0.154 で `$go` / `$plan` は衝突しなかった。
- 両マーケットプレイスともリポジトリ直下（`"./"`）を指し、どちらも動く。
- SKILL.md に `disable-model-invocation` は書かない（Codex の validator が `true` を拒否。受け入れ基準7を優先）。
- `soujo next check` は `次:` が PLAN で `[x]` 済みの層を指すときも警告する（クリーンな木でも受け入れ基準6を満たすため）。
- `soujo next show --hook` は NEXT.md がなければ無音（Soujo を使わないプロジェクトの文脈を汚さない）。
- `soujo layer done` は NEXT.md がない・無効・まだ締める層を指しているときに拒否する（層のコミットに必ず次の一手を含めるため）。
- Codex 0.154 に `--reasoning-effort` はない。effort は `-c model_reasoning_effort=<v>` で渡す。
- このリポジトリの層名は ASCII（`layer: <層名>` のコミットメッセージを英語に保つ）。

未決：
- `LOG.md` が長くなったときの巻き取り（月ごとに `LOG-YYYY-MM.md` へ退避する `soujo log rotate`）。
- Codex のフック対応が将来マニフェストで有効になったら、Stop 相当を追加する。
- `soujo --help`：両ホストで試されてエラーになった。
- モデルがスキルの置き場所へ `cd` したり、そこの `.soujo/` を読もうとすることがある。ホスト側の保護で止まり、スキルにも警告を入れたが、CLI 側のガードは未対応。
- `spec` スキルが、回答ごとではなく最後にまとめて `SPEC.md` を書きがち。
- 全層完了時の `NEXT.md` にも `effort:` が残る。
- Codex の文脈量：`$go` 1回で入力約69万トークン（大半キャッシュ。主に Codex 全体の文脈）。
