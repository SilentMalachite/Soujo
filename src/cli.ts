#!/usr/bin/env node
// Entry point: parses arguments, runs the command, prints its lines to stdout, and turns any error into one stderr line with exit 1.

import { parseArgs } from 'node:util';
import { init } from './commands/init.js';
import { logAdd } from './commands/log.js';
import { planList, planNext } from './commands/plan.js';

type Command = (args: string[], cwd: string) => string[];

function expectPositionals(positionals: string[], count: number, usage: string): void {
  if (positionals.length !== count) throw new Error(`使い方: soujo ${usage}`);
}

function noArguments(usage: string, run: (cwd: string) => string[]): Command {
  return (args, cwd) => {
    const { positionals } = parseArgs({ args, allowPositionals: true });
    expectPositionals(positionals, 0, usage);
    return run(cwd);
  };
}

// Keys are "<word>" or "<word> <word>"; two-word keys are matched first.
const COMMANDS: Record<string, Command> = {
  init: noArguments('init', init),
  'plan list': noArguments('plan list', planList),
  'plan next': noArguments('plan next', planNext),
  'log add': (args, cwd) => {
    const { positionals, values } = parseArgs({
      args,
      options: { line: { type: 'string', multiple: true } },
      allowPositionals: true,
    });
    expectPositionals(positionals, 1, 'log add "<層名>" --line <行> [--line <行>]');
    return logAdd(cwd, positionals[0] ?? '', values.line ?? []);
  },
};

function resolve(argv: string[]): { command: Command; args: string[] } | undefined {
  const [first, second] = argv;
  if (first === undefined) return undefined;
  if (second !== undefined) {
    const command = COMMANDS[`${first} ${second}`];
    if (command) return { command, args: argv.slice(2) };
  }
  const command = COMMANDS[first];
  return command ? { command, args: argv.slice(1) } : undefined;
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const code = (error as NodeJS.ErrnoException).code;
  const quoted = /'([^']+)'/.exec(error.message)?.[1] ?? '';
  if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') return `不明なオプション: ${quoted}`;
  if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') return `オプションの値が不正: ${quoted}`;
  return error.message;
}

function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').trim();
}

function main(argv: string[]): number {
  try {
    const found = resolve(argv);
    if (!found) {
      throw new Error(argv[0] === undefined ? 'コマンドがありません' : `不明なコマンド: ${argv[0]}`);
    }
    const lines = found.command(found.args, process.cwd());
    if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`soujo: ${oneLine(describe(error))}\n`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
