import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageDir } from '../src/files.js';
import { commitAll, project, repo, temp } from './helpers.js';

interface Manifest {
  name: string;
  version: string;
  description: string;
  license: string;
  skills?: string;
  hooks?: unknown;
}

interface ClaudeMarketplace {
  name: string;
  plugins: { name: string; source: unknown }[];
}

interface CodexMarketplace {
  name: string;
  plugins: { name: string; source: unknown; policy: { installation: string; authentication: string }; category: string }[];
}

interface HookGroup {
  matcher?: string;
  hooks: { type: string; command: string }[];
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
  const result = spawnSync(HOOKS[event] ?? '', {
    shell: true,
    cwd,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: packageDir() },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout };
}

test('both host manifests carry the name, version, description, and license of package.json', () => {
  const pkg = read<Manifest>('package.json');
  for (const path of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    const manifest = read<Manifest>(path);
    for (const key of ['name', 'version', 'description', 'license'] as const) {
      assert.equal(manifest[key], pkg[key], `${path} の ${key}`);
    }
  }
});

test('.codex-plugin/plugin.json has no hooks field and names skills/', () => {
  const manifest = read<Manifest>('.codex-plugin/plugin.json');
  assert.ok(!Object.hasOwn(manifest, 'hooks'), 'Codex のマニフェストに hooks を書かない');
  assert.equal(manifest.skills, './skills/');
});

test('both marketplaces are named soujo and point at the repository root', () => {
  const claude = read<ClaudeMarketplace>('.claude-plugin/marketplace.json');
  assert.equal(claude.name, 'soujo');
  assert.deepEqual(
    claude.plugins.map(({ name, source }) => ({ name, source })),
    [{ name: 'soujo', source: './' }],
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

test('hook commands stay silent outside Soujo projects', (t) => {
  const dir = temp(t);
  assert.deepEqual(runHook('SessionStart', dir), { status: 0, stdout: '' });
  assert.deepEqual(runHook('Stop', dir), { status: 0, stdout: '' });
});
