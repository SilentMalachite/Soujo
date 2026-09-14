# Soujo（層序）

[English](README.md) | **日本語**

[![CI](https://github.com/SilentMalachite/Soujo/actions/workflows/ci.yml/badge.svg)](https://github.com/SilentMalachite/Soujo/actions/workflows/ci.yml) [![TypeScript](https://img.shields.io/github/package-json/dependency-version/SilentMalachite/Soujo/dev/typescript?logo=typescript&logoColor=white&color=3178C6)](https://www.typescriptlang.org/) [![License](https://img.shields.io/github/license/SilentMalachite/Soujo)](LICENSE)

**中断できる開発・再開できる AI コーディング・少ない文脈で進める開発** — Claude Code と Codex で使う「仕様 → 計画 → 層」の進め方。

AI とのコーディングは途中で途切れる。使用上限、圧縮された文脈、会議、一日の終わり、もう一方のホストへの移動。計画と決定が会話の中にしかないと、次のセッションはそれを組み立て直すところから始まる。Soujo はそれを `.soujo/` の短い4ファイルに置き、層を終えるたびにコミットする。だから次のセッションは、どちらのホストでも、ファイルだけで続きから始められる。

| | 意味 | Soujo のやり方 |
|---|---|---|
| Interruptible development（中断できる開発） | いつ止めても、作業も決定も失わない | 30分以内の層ごとに1コミット。`close` が途中の作業を `wip:` でコミット |
| Resumable AI coding（再開できる AI コーディング） | 新しいセッションは、どちらのホストでも会話履歴を要らない | `NEXT.md`（5行以内）が次の一手を示し、`resume` が4行の現在地を出す |
| Low-context development（少ない文脈で進める開発） | 人もモデルも、多くを覚えておかなくてよい | 各ファイルに行数の上限。質問は1つずつ。記録の更新は CLI が担う |

名前の由来：発掘では地層（層）を順番（序）に1枚ずつ剥がし、剥がした層を記録する。記録があれば、誰でも発掘を引き継げる。

設計と決定事項：[SPEC.ja.md](SPEC.ja.md)。

## 仕組み

```
/soujo:spec → /soujo:plan → /soujo:go → /soujo:go → … → /soujo:plan（層が尽きたら）
                                 ↑ 中断後は /soujo:resume ・ 止まる前に /soujo:close
```

| スキル | Claude Code | Codex | 結果 |
|---|---|---|---|
| spec | `/soujo:spec` | `$spec` | 1問ずつ（最大7問）→ `.soujo/SPEC.md` |
| plan | `/soujo:plan` | `$plan` | 30分以内の層、各1行の完了条件 → `.soujo/PLAN.md` |
| go | `/soujo:go` | `$go` | 次の層を実装し、次の `NEXT.md` を書いて `layer: <層>` でコミット |
| resume | `/soujo:resume` | `$resume` | 4行：次の層・前回のログ・最新コミット・再開方法 |
| close | `/soujo:close` | `$close` | `中断: …` をログに残し `wip: <層>` でコミット |
| map | `/soujo:map` | `$map` | 計画の図、import のグラフ、直近の層の Before/After |
| review | `/soujo:review` | `$review` | 指定した範囲（なければ直近の層。未コミットの変更を含む）の指摘を絞らず全部1つの表で |

| ファイル | 中身 | 上限 |
|---|---|---|
| `SPEC.md` | 目的・非目標・受け入れ基準・技術判断 | 約100行 |
| `PLAN.md` | `- [ ] <層> — <完了条件>` | 1層1行 |
| `LOG.md` | 追記だけの作業日誌 | 1エントリ3行 |
| `NEXT.md` | 次の一手。再開にはこれだけ読めばよい | 5行 |

実行時の文言（CLI の出力・スキル・テンプレート）は日本語。

## 必要なもの

- Node.js 20 以上と git
- Claude Code（2.1.270 で確認）と Codex CLI（0.154 で確認）の一方または両方

## 導入

すべて GitHub から直接入れる。複製（clone）は要らない。

1. `soujo` CLI。両ホストで必須：スキルは PATH の `soujo` を呼ぶ（プラグイン内の `dist/cli.js` を使うのはフックだけ）。実行時依存はなく `dist/` もコミット済みなので、ビルドは要らない：

   ```sh
   npm install -g https://github.com/SilentMalachite/Soujo/archive/refs/heads/main.tar.gz
   command -v soujo
   ```

   `github:SilentMalachite/Soujo` ではなくこのアーカイブの URL を使う。npm 10 はその形を、あとで消す一時的な複製へのリンクとして入れ、入れ直すと失敗する。

2. Claude Code：

   ```sh
   claude plugin marketplace add SilentMalachite/Soujo
   claude plugin install soujo@soujo
   ```

3. Codex：

   ```sh
   codex plugin marketplace add SilentMalachite/Soujo
   codex plugin add soujo@soujo
   ```

更新は次を実行して新しいセッションを始める。スキルは同じコミットの CLI を前提にするので、CLI とプラグインは一緒に更新する：

```sh
npm install -g https://github.com/SilentMalachite/Soujo/archive/refs/heads/main.tar.gz
claude plugin marketplace update soujo && claude plugin update soujo@soujo
codex plugin marketplace upgrade soujo && codex plugin add soujo@soujo
```

Claude Code のプラグインは `version` を書いていないので、新しいコミットがそのまま更新になる。Codex は `codex plugin add` のたびに導入キャッシュへ複製し直す。

## 始め方

git リポジトリの中で `/soujo:spec`（Codex は `$spec`）。`soujo init` が `.soujo/` と、なければ `CLAUDE.md`・`AGENTS.md` を作る。既存のファイルは上書きしない。

`spec` と `plan` はコミットしないので、最初の `/soujo:go` がコミットするまで Claude Code の Stop フックが未コミットの変更を警告する。

## ホストごとの注意

| | Claude Code | Codex |
|---|---|---|
| フック | SessionStart で `NEXT.md` を文脈に入れ、Stop で `NEXT.md` がない・無効・PLAN と食い違う、または未コミットの変更があるときに警告する（止めない） | 頼らない。止まる前に `$close`。Codex は信頼した後だけ `hooks/hooks.json` を実行するが、未確認なので信頼しないでおく |
| effort | `/soujo:go` の前に、`NEXT.md` の `effort:` を見て会話で自分で設定 | `codex -c model_reasoning_effort=<low\|medium\|high\|xhigh>` か `~/.codex/config.toml` の `model_reasoning_effort` |
| コミット | 通常の権限で可 | `workspace-write` サンドボックスは `.git` に書けない。`soujo layer done` / `soujo close` の昇格を承認する（`codex exec` は `--add-dir "$PWD/.git"`）。再実行はコミットだけをやり直す |
| サブエージェント | `review` が `soujo:reviewer` を1体だけ起動。`export CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=2` で並列数を抑える | 使わない |

## CLI

`soujo` は引数を受けて終了する。出力は通常数行の日本語（`map` は図、`--help` は1コマンド1行の使い方）、エラーは標準エラーに1行で終了コード1。詳しい動作：[SPEC.ja.md §6](SPEC.ja.md#6-cli-soujo)。

| コマンド | 動作 |
|---|---|
| `soujo --help` / `soujo next set --help` | 全コマンド / 1コマンドの使い方の行。`next`・`plan`・`log`・`layer`・`map` の1語だけに付けるとその語で始まるコマンドの行。ほかは何も実行しない |
| `soujo init` | `.soujo/`（と CLAUDE.md / AGENTS.md）を上書きせずに作る |
| `soujo next show [--hook]` | `NEXT.md` を出す。`--hook` は SessionStart フック用 |
| `soujo next set --layer '<層>' --premise '<前提>' --check '<確認>' [--caution '<注意>'] [--effort <low\|medium\|high\|xhigh>]` | `NEXT.md` を書き換える。`spec` / `plan` の effort は常に `high` |
| `soujo next check [--hook]` | 再開できない状態を警告する。終了コードは常に0。`--hook` は Stop フック用 |
| `soujo plan list` / `soujo plan next` | 層と状態 / 次の層 |
| `soujo log add '<層>' --line '<行>' [--line '<行>']` | `LOG.md` に1〜3行を追記 |
| `soujo layer done '<層>' [--note '<メモ>']` | PLAN の層にチェック → LOG に追記 → `layer: <層>` でコミット |
| `soujo resume` | 4行の現在地 |
| `soujo close [--note '<メモ>']` | 中断を記録 → `wip: <層>` でコミット |
| `soujo map plan` / `soujo map code [<ディレクトリ>]` | 計画の ASCII 図 / import の Mermaid 図かディレクトリ木 |

## 開発

```sh
git clone https://github.com/SilentMalachite/Soujo.git
cd Soujo
npm install
npm run build   # フックが dist/cli.js を呼ぶので dist/ はコミットする
npm test        # node:test。dist/ が古いときも落ちる
claude --plugin-dir .   # 導入せずに作業ツリーのプラグインを試す
```

GitHub からの導入の代わりに作業ツリーを使うなら、そこで `npm link`・`claude plugin marketplace add ./`・`codex plugin marketplace add ./` を実行し、上と同じくプラグインを入れる（どちらも名前が `soujo` なので、先に GitHub のマーケットプレイスを外す）。`.` ではなく `./` と書く（Claude Code は `.` を受け付けない）。両ホストとも複製の絶対パスを保存する。Claude Code のセッションは複製からその場でプラグインを読み、Codex は変更のたびに `codex plugin add soujo@soujo` をもう一度。

コントリビュートの方法は [CONTRIBUTING.ja.md](CONTRIBUTING.ja.md)、エージェント向けの規約は [CLAUDE.md](CLAUDE.md)（Claude Code）と [AGENTS.md](AGENTS.md)（Codex）。文面が違うのは意図的。変更履歴は [CHANGELOG.ja.md](CHANGELOG.ja.md)。セキュリティの問題は [SECURITY.ja.md](SECURITY.ja.md) のとおりに報告する。

## ライセンス

[0BSD](LICENSE)
