#!/usr/bin/env node
// Entry point: parses arguments, runs the command, prints its lines to stdout, and turns any error into one stderr line with exit 1.

import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { brief } from './commands/brief.js';
import { close } from './commands/close.js';
import { init } from './commands/init.js';
import { layerDone } from './commands/layer.js';
import { logAdd, logRotate } from './commands/log.js';
import { mapCode, mapPlan } from './commands/map.js';
import { nextCheck, nextSet, nextShow } from './commands/next.js';
import { planList, planNext } from './commands/plan.js';
import { resume } from './commands/resume.js';
import { hideHome, pluginDir } from './files.js';
import { printable } from './state.js';

// usage is what follows "soujo " in the --help line and in the usage error; run gets it too, so each entry spells it once.
interface Command {
  usage: string;
  run: (args: string[], cwd: string, usage: string) => string[];
  /** Whether the call runs inside a host plugin directory too, where it finds no project: the calls of hooks/hooks.json. */
  hook?: (args: string[]) => boolean;
}

const HELP_HINT = '（soujo --help で一覧）';

function usageError(usage: string): Error {
  return new Error(`使い方: soujo ${usage}`);
}

// Exactly count positionals, or from count to max when max is given.
function expectPositionals(positionals: string[], count: number, usage: string, max: number = count): void {
  if (positionals.length < count || positionals.length > max) throw usageError(usage);
}

function noArguments(usage: string, run: (cwd: string) => string[]): Command {
  return {
    usage,
    run: (args, cwd) => {
      const { positionals } = parseArgs({ args, allowPositionals: true });
      expectPositionals(positionals, 0, usage);
      return run(cwd);
    },
  };
}

// Keys are "<word>" or "<word> <word>"; two-word keys are matched first. The order is the order of --help.
const COMMANDS: Record<string, Command> = {
  init: noArguments('init', init),
  'next show': {
    usage: 'next show [--hook]',
    // Without --hook it refuses there, instead of pointing to soujo init, which is refused there too.
    hook: (args) => options(args).includes('--hook'),
    run: (args, cwd, usage) => {
      const { positionals, values } = parseArgs({ args, options: { hook: { type: 'boolean' } }, allowPositionals: true });
      expectPositionals(positionals, 0, usage);
      return nextShow(cwd, values.hook ?? false);
    },
  },
  'next set': {
    usage: 'next set --layer <層> --premise <前提> --check <確認> [--caution <注意>] [--effort low|medium|high|xhigh]',
    run: (args, cwd, usage) => {
      const { positionals, values } = parseArgs({
        args,
        options: {
          layer: { type: 'string' },
          premise: { type: 'string' },
          check: { type: 'string' },
          caution: { type: 'string' },
          effort: { type: 'string' },
        },
        allowPositionals: true,
      });
      expectPositionals(positionals, 0, usage);
      const { layer, premise, check, caution, effort } = values;
      if (layer === undefined || premise === undefined || check === undefined) throw usageError(usage);
      return nextSet(cwd, { layer, premise, check, caution, effort });
    },
  },
  // Hooks call this: unknown arguments are ignored so that it always exits 0, in a host plugin directory too.
  'next check': {
    usage: 'next check [--hook]',
    hook: () => true,
    run: (args, cwd) => {
      const { values } = parseArgs({ args, options: { hook: { type: 'boolean' } }, allowPositionals: true, strict: false });
      return nextCheck(cwd, values.hook === true);
    },
  },
  'plan list': noArguments('plan list', planList),
  'plan next': noArguments('plan next', planNext),
  'log add': {
    usage: 'log add "<層名>" --line <行> [--line <行>]',
    run: (args, cwd, usage) => {
      const { positionals, values } = parseArgs({
        args,
        options: { line: { type: 'string', multiple: true } },
        allowPositionals: true,
      });
      expectPositionals(positionals, 1, usage);
      return logAdd(cwd, positionals[0] ?? '', values.line ?? []);
    },
  },
  'log rotate': {
    usage: 'log rotate [--before YYYY-MM]',
    run: (args, cwd, usage) => {
      const { positionals, values } = parseArgs({ args, options: { before: { type: 'string' } }, allowPositionals: true });
      expectPositionals(positionals, 0, usage);
      return logRotate(cwd, values.before);
    },
  },
  'layer done': {
    usage: 'layer done "<層名>" [--note <1〜3行>]',
    run: (args, cwd, usage) => {
      const { positionals, values } = parseArgs({ args, options: { note: { type: 'string' } }, allowPositionals: true });
      expectPositionals(positionals, 1, usage);
      return layerDone(cwd, positionals[0] ?? '', values.note);
    },
  },
  resume: noArguments('resume', resume),
  brief: noArguments('brief', brief),
  close: {
    usage: 'close [--note <1〜3行>]',
    run: (args, cwd, usage) => {
      const { positionals, values } = parseArgs({ args, options: { note: { type: 'string' } }, allowPositionals: true });
      expectPositionals(positionals, 0, usage);
      return close(cwd, values.note);
    },
  },
  'map plan': noArguments('map plan', mapPlan),
  'map code': {
    usage: 'map code [ディレクトリ]',
    run: (args, cwd, usage) => {
      const { positionals } = parseArgs({ args, allowPositionals: true });
      expectPositionals(positionals, 0, usage, 1);
      return mapCode(cwd, positionals[0]);
    },
  },
};

// Own keys only, so that names like "constructor" or "__proto__" are unknown commands.
function lookup(key: string): Command | undefined {
  return Object.hasOwn(COMMANDS, key) ? COMMANDS[key] : undefined;
}

function resolve(argv: string[]): { command: Command; args: string[] } | undefined {
  const [first, second] = argv;
  // "soujo 'plan list'" as one argument is not a command.
  if (first === undefined || first.includes(' ')) return undefined;
  if (second !== undefined) {
    const command = lookup(`${first} ${second}`);
    if (command) return { command, args: argv.slice(2) };
  }
  const command = lookup(first);
  return command ? { command, args: argv.slice(1) } : undefined;
}

function isHelp(arg: string | undefined): boolean {
  return arg === '--help' || arg === '-h';
}

// The arguments before "--", the only ones that can be options.
function options(args: string[]): string[] {
  const end = args.indexOf('--');
  return end === -1 ? args : args.slice(0, end);
}

// Only an argument of its own before "--" asks for help; "--note=--help" and anything after "--" are ordinary.
function asksHelp(args: string[]): boolean {
  return options(args).some(isHelp);
}

function usageLines(include: (key: string) => boolean): string[] {
  return Object.entries(COMMANDS)
    .filter(([key]) => include(key))
    .map(([, command]) => `soujo ${command.usage}`);
}

// Usage lines for "soujo --help", "soujo <command> --help", or "soujo <first word> --help", or undefined.
// Decided before any other argument, so that asking for help never validates or runs a command.
function help(argv: string[], found: ReturnType<typeof resolve>): string[] | undefined {
  const [first] = argv;
  if (isHelp(first)) return usageLines(() => true);
  if (found) return asksHelp(found.args) ? [`soujo ${found.command.usage}`] : undefined;
  if (first === undefined) return undefined;
  // An unknown word after the first word is ignored: "soujo next foo --help" still lists the next commands.
  const group = usageLines((key) => key.startsWith(`${first} `));
  return group.length > 0 && asksHelp(argv.slice(1)) ? group : undefined;
}

// The unknown command as typed: both words when the first word starts two-word commands.
function unknownCommand(argv: string[]): string {
  const [first = '', second] = argv;
  const grouped = Object.keys(COMMANDS).some((key) => key.startsWith(`${first} `));
  const name = grouped && second !== undefined && !second.startsWith('-') ? `${first} ${second}` : first;
  return `不明なコマンド「${name}」${HELP_HINT}`;
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const code = (error as NodeJS.ErrnoException).code;
  const quoted = /'([^']+)'/.exec(error.message)?.[1] ?? '';
  if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') return `不明なオプション: ${quoted}`;
  // "--note - x" leaves the value looking like an option; the value has to be attached with "=".
  const dashed = /use '(--[\w-]+)=/.exec(error.message)?.[1];
  if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' && dashed !== undefined) {
    return `オプションの値が「-」で始まる: ${dashed}=<値> の形で書く`;
  }
  if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') return `オプションの値が不正: ${quoted}`;
  return error.message;
}

function oneLine(text: string): string {
  return text
    .split('\n')
    .map((line) => printable(line).trim())
    .filter((line) => line !== '')
    .join(' ');
}

// A host plugin directory holds a copy of Soujo with this repository's .soujo/ (SPEC §6): calls other than the hooks' refuse
// there before reading or writing anything, so that resume never shows those records and init or a commit never lands in the copy.
function run(found: NonNullable<ReturnType<typeof resolve>>, cwd: string): string[] {
  const plugin = found.command.hook?.(found.args) ? undefined : pluginDir(cwd);
  if (plugin !== undefined) throw new Error(`プラグインの置き場所（${plugin}）では実行しない: 作業中のプロジェクトで実行する`);
  return found.command.run(found.args, cwd, found.command.usage);
}

const NO_CWD = '作業ディレクトリを読めない（消えていないか確かめ、別のディレクトリで実行する）';

// The current directory is gone or unreadable when this fails; every command needs it, since .soujo/ is searched from there.
function currentDir(): string | undefined {
  try {
    return process.cwd();
  } catch {
    return undefined;
  }
}

// Runs the command, or says why there is none to run. Without a current directory the hooks' calls print nothing, as they
// do outside a project, so that a removed directory does not make them fail; every other command says so and exits 1.
function execute(argv: string[], found: ReturnType<typeof resolve>): string[] {
  if (found === undefined) throw new Error(argv.length === 0 ? `コマンドがありません${HELP_HINT}` : unknownCommand(argv));
  const cwd = currentDir();
  if (cwd === undefined) {
    if (found.command.hook?.(found.args) === true) return [];
    throw new Error(NO_CWD);
  }
  return run(found, cwd);
}

/**
 * Writes one finished output. An error event of a stream with no listener would be an uncaught exception with a stack
 * trace: a closed pipe (`soujo resume | head -1`) has to end the run quietly, and a failed write cannot be reported
 * through the stream that failed anyway.
 */
function write(stream: NodeJS.WriteStream, text: string): void {
  stream.on('error', () => {});
  try {
    stream.write(text);
  } catch {
    // Lost with the stream.
  }
}

// Where the file system ignores letter case, the home directory can be spelled in either case in the same message.
const FOLD_CASE = process.platform === 'darwin' || process.platform === 'win32';

// The home directory as an error shows it; unknown when the environment has none, which leaves the error as it is.
function home(): string | undefined {
  try {
    return homedir();
  } catch {
    return undefined;
  }
}

function main(argv: string[]): number {
  try {
    const found = resolve(argv);
    const lines = help(argv, found) ?? execute(argv, found);
    // Values from files can carry CR or other controls; each returned line stays one terminal line.
    if (lines.length > 0) write(process.stdout, `${lines.map(printable).join('\n')}\n`);
    return 0;
  } catch (error) {
    write(process.stderr, `soujo: ${hideHome(oneLine(describe(error)), home(), FOLD_CASE)}\n`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
