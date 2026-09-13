# Soujo（層序）

[English](README.md) | **日本語**

Claude Code と Codex で使う、いつ中断しても再開できる「仕様 → 計画 → 層」の進め方。状態はすべて `.soujo/` の4ファイルにあるので、会話履歴なしで続けられる。同じホストでも、もう一方のホストでも。

発掘では地層（層）を順番（序）に1枚ずつ剥がし、剥がした層を記録する。記録があれば、誰でも発掘を引き継げる。

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

1. `soujo` CLI。両ホストで必須：スキルは PATH の `soujo` を呼ぶ（プラグイン内の `dist/cli.js` を使うのはフックだけ）。実行時依存はなく `dist/` もコミット済みなので、ビルドは要らない：

   ```sh
   git clone https://github.com/SilentMalachite/Soujo.git
   cd Soujo
   npm link          # または: npm i -g .
   command -v soujo
   ```

2. Claude Code：

   ```sh
   claude plugin marketplace add /path/to/Soujo
   claude plugin install soujo@soujo
   ```

   導入時に作業ツリーが Claude Code のプラグインキャッシュへ複製され、`claude plugin update` はバージョンが同じなら何もしない。変更を取り込んだら `claude plugin uninstall soujo@soujo` のあと入れ直す。

3. Codex：

   ```sh
   codex plugin marketplace add /path/to/Soujo
   codex plugin add soujo@soujo
   ```

   Codex も導入時のキャッシュからスキルを読む。変更を取り込んだら `codex plugin add soujo@soujo` をもう一度。

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

`soujo` は引数を受けて終了する。出力は通常数行の日本語（`map` は図）、エラーは標準エラーに1行で終了コード1。詳しい動作：[SPEC.ja.md §6](SPEC.ja.md#6-cli-soujo)。

| コマンド | 動作 |
|---|---|
| `soujo init` | `.soujo/`（と CLAUDE.md / AGENTS.md）を上書きせずに作る |
| `soujo next show [--hook]` | `NEXT.md` を出す。`--hook` は SessionStart フック用 |
| `soujo next set --layer '<層>' --premise '<前提>' --check '<確認>' [--caution '<注意>'] [--effort <low\|medium\|high\|xhigh>]` | `NEXT.md` を書き換える |
| `soujo next check [--hook]` | 再開できない状態を警告する。終了コードは常に0。`--hook` は Stop フック用 |
| `soujo plan list` / `soujo plan next` | 層と状態 / 次の層 |
| `soujo log add '<層>' --line '<行>' [--line '<行>']` | `LOG.md` に1〜3行を追記 |
| `soujo layer done '<層>' [--note '<メモ>']` | PLAN の層にチェック → LOG に追記 → `layer: <層>` でコミット |
| `soujo resume` | 4行の現在地 |
| `soujo close [--note '<メモ>']` | 中断を記録 → `wip: <層>` でコミット |
| `soujo map plan` / `soujo map code [<ディレクトリ>]` | 計画の ASCII 図 / import の Mermaid 図かディレクトリ木 |

## 開発

```sh
npm install
npm run build   # フックが dist/cli.js を呼ぶので dist/ はコミットする
npm test        # node:test。dist/ が古いときも落ちる
claude --plugin-dir .   # 導入せずに作業ツリーのプラグインを試す
```

開発の規約は [CLAUDE.md](CLAUDE.md)（Claude Code）と [AGENTS.md](AGENTS.md)（Codex）。文面が違うのは意図的。変更履歴は [CHANGELOG.ja.md](CHANGELOG.ja.md)。

## ライセンス

[0BSD](LICENSE)
