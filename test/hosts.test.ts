import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOOK_GIT_BUDGET } from '../src/commands/next.js';
import { packageDir } from '../src/files.js';
import { commitAll, project, repo, temp } from './helpers.js';

interface Manifest {
  name: string;
  version?: string;
  description: string;
  license: string;
  skills?: string;
  hooks?: unknown;
  interface?: { longDescription?: string };
}

interface ClaudeMarketplace {
  name: string;
  metadata: { description: string };
  plugins: { name: string; source: unknown; description: string; category: string }[];
}

interface CodexMarketplace {
  name: string;
  plugins: { name: string; source: unknown; policy: { installation: string; authentication: string }; category: string }[];
}

interface HookGroup {
  matcher?: string;
  hooks: { type: string; command: string; timeout?: number }[];
}

function read<T>(path: string): T {
  return JSON.parse(readFileSync(join(packageDir(), path), 'utf8')) as T;
}

const HOOKS: Record<string, string> = {
  SessionStart: 'node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" next show --hook',
  Stop: 'node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" next check --hook',
};

// Runs a hook command the way Claude Code does: through the shell, from the session directory, with CLAUDE_PLUGIN_ROOT set.
function runHook(event: string, cwd: string): { status: number | null; stdout: string } {
  // The host substitutes ${CLAUDE_PLUGIN_ROOT} itself before running the command; cmd.exe would leave it as written.
  const command = (HOOKS[event] ?? '').split('${CLAUDE_PLUGIN_ROOT}').join(packageDir());
  const result = spawnSync(command, {
    shell: true,
    cwd,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: packageDir() },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout };
}

// Claude Code versions a git-installed plugin without a version by its commit, so every push reaches `claude plugin update`;
// a fixed version would hide new commits. Codex copies the plugin again on every `codex plugin add`, so it keeps the version.
test('both host manifests carry the name, description, and license of package.json, and only Codex the version', () => {
  const pkg = read<Manifest>('package.json');
  for (const path of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    const manifest = read<Manifest>(path);
    for (const key of ['name', 'description', 'license'] as const) {
      assert.equal(manifest[key], pkg[key], `${path} の ${key}`);
    }
  }
  assert.ok(!Object.hasOwn(read<Manifest>('.claude-plugin/plugin.json'), 'version'));
  assert.ok(!read<ClaudeMarketplace>('.claude-plugin/marketplace.json').plugins.some((plugin) => Object.hasOwn(plugin, 'version')));
  assert.equal(read<Manifest>('.codex-plugin/plugin.json').version, pkg.version);
});

// Claude Code finds hooks/hooks.json by itself (declaring it again is a duplicate), and validate_plugin.py rejects the field.
test('neither manifest declares hooks, and the Codex one names skills/', () => {
  for (const path of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.ok(!Object.hasOwn(read<Manifest>(path), 'hooks'), `${path} に hooks を書かない`);
  }
  assert.equal(read<Manifest>('.codex-plugin/plugin.json').skills, './skills/');
});

// The Codex install page lists the skills in its long description, so a skill added to skills/ is added there too.
test('the Codex manifest names every skill in its long description', () => {
  const skills = readdirSync(join(packageDir(), 'skills')).filter((entry) => !entry.startsWith('.'));
  const text = read<Manifest>('.codex-plugin/plugin.json').interface?.longDescription ?? '';
  const listed = /Skills: ([^.]+)\./.exec(text)?.[1]?.split(', ') ?? [];
  assert.deepEqual([...listed].sort(), skills.map((skill) => `$${skill}`).sort());
});

// Where the repository's instruction files go on past their templates, with a section init does not copy.
const OWN_SECTION: Record<string, string> = {
  'CLAUDE.md': '\n## 8. Soujo 本体（このリポジトリだけ）\n',
  'AGENTS.md': '\n## Soujo 本体（このリポジトリだけ）\n',
};

// When each host asks about a principle, in its own wording: Opus 5 goes on without confirmations otherwise, and Astra is
// told what it may do rather than where to stop.
const ASK: Record<string, string> = {
  'CLAUDE.md': '原則に反さずには完了条件を満たせないときだけ、1問聞く。',
  'AGENTS.md': '原則を守ると完了条件を満たせないときは、その食い違いを1問聞いてよい（依存しない部分は続けてよい）。',
};

// SPEC §14: CLAUDE.md / AGENTS.md and their templates say only that the principles outrank the rest; the principles are in SPEC.
test('CLAUDE.md and AGENTS.md are their templates plus their own section, and say once that the principles outrank the rest', () => {
  for (const [file, own] of Object.entries(OWN_SECTION)) {
    const template = readFileSync(join(packageDir(), 'templates', file), 'utf8');
    const text = readFileSync(join(packageDir(), file), 'utf8');
    const index = text.indexOf(own);
    assert.ok(index !== -1, `${file} に本体の節`);
    assert.equal(text.slice(0, index), template, `${file} の本体の節より上は templates/${file} と同一`);
    for (const [label, whole] of [[`templates/${file}`, template], [file, text]] as const) {
      const lines = whole.split('\n').filter((line) => line.includes('原則'));
      assert.equal(lines.length, 1, `${label} で原則に触れるのは1行`);
      for (const word of ['`.soujo/SPEC.md`', '`## 原則`', 'SPEC のほかの節・PLAN の完了条件・既存のコードより優先する', ASK[file] ?? '']) {
        assert.ok(lines[0]?.includes(word), `${label} の原則の行に ${word}`);
      }
      assert.doesNotMatch(whole, /\bP\d+\b|P<n>/, `${label} に原則そのものを書かない`);
    }
  }
});

// The category is the same word in each host's casing: lower case in Claude Code marketplaces, capitalized in Codex.
test('both marketplaces are named soujo, point at the repository root, and share the description and category', () => {
  const pkg = read<Manifest>('package.json');
  const claude = read<ClaudeMarketplace>('.claude-plugin/marketplace.json');
  assert.equal(claude.name, 'soujo');
  assert.equal(claude.metadata.description, pkg.description);
  assert.deepEqual(
    claude.plugins.map(({ name, source, description, category }) => ({ name, source, description, category })),
    [{ name: 'soujo', source: './', description: pkg.description, category: 'productivity' }],
  );

  const codex = read<CodexMarketplace>('.agents/plugins/marketplace.json');
  assert.equal(codex.name, 'soujo');
  assert.deepEqual(
    codex.plugins.map(({ name, source, policy, category }) => ({ name, source, policy, category })),
    [
      {
        name: 'soujo',
        source: { source: 'local', path: './' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Productivity',
      },
    ],
  );
});

test('hooks/hooks.json runs next show --hook on SessionStart and next check --hook on Stop, without a matcher', () => {
  const { hooks } = read<{ hooks: Record<string, HookGroup[]> }>('hooks/hooks.json');
  assert.deepEqual(Object.keys(hooks).sort(), Object.keys(HOOKS).sort());
  for (const [event, command] of Object.entries(HOOKS)) {
    assert.deepEqual(
      hooks[event]?.map((group) => ({ matcher: group.matcher, hooks: group.hooks.map(({ type, command }) => ({ type, command })) })),
      [{ matcher: undefined, hooks: [{ type: 'command', command }] }],
      event,
    );
  }
});

// The Stop hook is killed by the host after its own timeout, and with it the warning; the git calls end before that.
test('the Stop hook gives git more time than next check spends on it', () => {
  const { hooks } = read<{ hooks: Record<string, HookGroup[]> }>('hooks/hooks.json');
  const timeout = hooks['Stop']?.[0]?.hooks[0]?.timeout;
  assert.equal(typeof timeout, 'number');
  assert.ok((timeout ?? 0) >= HOOK_GIT_BUDGET / 1000 + 5, `Stop timeout ${String(timeout)}s vs budget ${HOOK_GIT_BUDGET / 1000}s`);
});

test('hook commands exit 0: SessionStart prints NEXT.md, Stop prints one systemMessage until the project is resumable', (t) => {
  const next = '次: L1 a\n前提: なし\n確認: x\n注意: なし\neffort: low\n';
  const dir = project(repo(t), { 'NEXT.md': next, 'PLAN.md': '- [ ] L1 a — x\n' });

  assert.deepEqual(runHook('SessionStart', dir), { status: 0, stdout: next });
  const stop = runHook('Stop', dir);
  assert.equal(stop.status, 0);
  assert.deepEqual(JSON.parse(stop.stdout), { systemMessage: 'soujo 警告: 未コミットの変更 1件' });

  commitAll(dir);
  assert.deepEqual(runHook('Stop', dir), { status: 0, stdout: '' });
});

test('SessionStart puts an invalid NEXT.md into the session with the line that says why', (t) => {
  const next = '次: L1 a\n前提: なし\n確認: x\n';
  const dir = project(repo(t), { 'NEXT.md': next, 'PLAN.md': '- [ ] L1 a — x\n' });
  assert.deepEqual(runHook('SessionStart', dir), {
    status: 0,
    stdout: `${next}soujo 警告: 「注意」がない / 「effort」がない\n`,
  });
});

test('hook commands stay silent outside Soujo projects', (t) => {
  const dir = temp(t);
  assert.deepEqual(runHook('SessionStart', dir), { status: 0, stdout: '' });
  assert.deepEqual(runHook('Stop', dir), { status: 0, stdout: '' });
});
