import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CREDENTIAL_FILE } from '../src/commands/shared.js';
import { packageDir } from '../src/files.js';
import { commitAll, repo } from './helpers.js';

// CLAUDE.md §6: files, commit messages, and tag messages, in every version a ref reaches, carry no credentials, session links, or
// personal data. This file is scanned too: of what its patterns catch, only the made-up values in SYNTHETIC are let through, and
// only in this file, since its fixtures and its earlier versions spell them out.
const SELF = 'test/privacy.test.ts';

const SECRETS: [string, RegExp][] = [
  ['Anthropic のキーかトークン', /sk-ant-[A-Za-z0-9_-]{8,}/g],
  ['OpenAI のキー', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g],
  ['GitHub のトークン', /\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_\w{20,}/g],
  ['Slack のトークン', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['AWS のキー', /\bAKIA[0-9A-Z]{16}\b/g],
  ['秘密鍵', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['JWT', /\beyJ[\w-]{10,}\.[\w-]{10,}\./g],
  ['Claude の認証情報の項目', /"(?:accessToken|refreshToken|oauthAccount)"\s*:/g],
  ['Claude のセッション URL', /claude\.ai\/code\/session_|Claude-Session:/g],
  // Codex cloud tasks (…/codex/tasks/<id>, with any segments between codex and tasks), and ChatGPT conversations and shared links.
  ['Codex のセッション URL', /(?:chatgpt\.com|chat\.openai\.com)\/(?:codex\/(?:[\w-]+\/)*tasks|c|s|share)\/[\w-]+/g],
  // The user name may end the path (cd /Users/name); punctuation around a path is not part of the name. Windows paths ignore case.
  ['ホームディレクトリの絶対パス', /\/Users\/[^/\s`'"(),;]+|\/home\/[^/\s`'"(),;]+|[A-Za-z]:\\[Uu]sers\\/g],
];
// Addresses that identify nobody: GitHub's SSH remote (git@github.com), the Co-Authored-By address of Claude in early commits,
// the sign-off of Dependabot's commits, test fixtures, GitHub's noreply addresses, and image names for high-density screens
// (icon@2x.png). Other hosts' git@ and noreply@ addresses may belong to a person or a company, so they are not allowed.
const ALLOWED_EMAIL =
  /^(?:git@github\.com|noreply@anthropic\.com|support@github\.com)$|@(?:example\.com|users\.noreply\.github\.com)$|@\d+x\.(?:png|jpe?g|gif|webp|svg)$/;
const EMAIL = /[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
const CODEX_URLS = [
  'chatgpt.com/codex/tasks/task_e_0',
  'chatgpt.com/codex/cloud/tasks/task_e_0',
  'chatgpt.com/c/0',
  'chatgpt.com/s/cd_0',
  'chatgpt.com/share/0',
  'chat.openai.com/share/0',
];
// What the fixtures below make up, the trailer the Claude pattern spells out, and the fixtures of earlier versions of this file.
const SYNTHETIC = new Set([
  '/Users/name',
  '/home/name',
  'someone@gmail.com',
  'noreply@gmail.com',
  'git@evil.example',
  'git@company.com',
  'Claude-Session:',
  ...CODEX_URLS,
]);
// File names that hold credentials (CREDENTIAL_FILE, which layer done and close also refuse to take in untracked); .gitignore
// keeps them out of `git add -A`.
const CREDENTIAL_EXAMPLES = [
  '.env',
  '.env.local',
  '.npmrc',
  '.netrc',
  '_netrc',
  '.git-credentials',
  '.credentials.json',
  'auth.json',
  'id_rsa',
  'id_rsa.pub',
  'id_ed25519',
  'id_ed25519.pub',
  'id_ed25519_sk',
  'id_ed25519_sk.pub',
  'id_ecdsa',
  'id_ecdsa.pub',
  'id_ecdsa_sk',
  'id_ecdsa_sk.pub',
  'id_dsa',
  'id_dsa.pub',
  'credentials',
  '.envrc',
  'secrets.yml',
  'secrets.yaml',
  'server.pem',
  'server.key',
  'client.p12',
  'client.pfx',
  'sub/id_rsa',
];

function git(cwd: string, args: string[], input?: string): Buffer {
  return execFileSync('git', args, { cwd, input, maxBuffer: Infinity });
}

function tracked(cwd: string): string[] {
  return git(cwd, ['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean);
}

interface GitObject {
  type: string;
  id: string;
  /** The path a blob was first reached at, or a tag's name. */
  name: string;
  text: string;
}

// Every blob, commit, and tag that a ref reaches: branches, tags, remote-tracking branches, and the stash.
function objects(cwd: string): GitObject[] {
  const listed = git(cwd, ['cat-file', '--batch-check=%(objecttype) %(objectname) %(rest)'], git(cwd, ['rev-list', '--objects', '--all']).toString('utf8'))
    .toString('utf8')
    .split('\n')
    .filter((line) => /^(?:blob|commit|tag) /.test(line));
  const types = listed.map((line) => line.slice(0, line.indexOf(' ')));
  const out = git(cwd, ['cat-file', '--batch=%(objectname) %(objectsize) %(rest)'], listed.map((line) => `${line.slice(line.indexOf(' ') + 1)}\n`).join(''));
  const found: GitObject[] = [];
  for (let at = 0; at < out.length; ) {
    const end = out.indexOf(0x0a, at);
    const header = out.toString('utf8', at, end);
    const [id = '', size = '', ...name] = header.split(' ');
    if (!/^\d+$/.test(size)) throw new Error(`git cat-file: ${header}`);
    const start = end + 1;
    found.push({ type: types[found.length] ?? '', id, name: name.join(' '), text: out.toString('utf8', start, start + Number(size)) });
    at = start + Number(size) + 1;
  }
  return found;
}

// "<where>:<line> <what>" for each line of text that carries a secret pattern or an email address not in ALLOWED_EMAIL.
// A match that is a SYNTHETIC value is let through when the text is a version of this file.
function leaks(where: string, text: string, file = ''): string[] {
  const found: string[] = [];
  const madeUp = (match: string) => file === SELF && SYNTHETIC.has(match);
  text.split('\n').forEach((line, index) => {
    for (const [name, pattern] of SECRETS) {
      if ([...line.matchAll(pattern)].some(([match]) => !madeUp(match))) found.push(`${where}:${index + 1} ${name}`);
    }
    for (const [email] of line.matchAll(EMAIL)) {
      if (!ALLOWED_EMAIL.test(email) && !madeUp(email)) found.push(`${where}:${index + 1} メールアドレス`);
    }
  });
  return found;
}

function fileLeaks(cwd: string): string[] {
  return tracked(cwd).flatMap((file) => leaks(file, readFileSync(join(cwd, file), 'utf8'), file));
}

// A blob is named "<blob id>:<path it was first reached at>".
function blobLeaks(cwd: string): string[] {
  return objects(cwd)
    .filter(({ type }) => type === 'blob')
    .flatMap(({ id, name, text }) => leaks(`${id.slice(0, 12)}:${name}`, text, name));
}

// The message of a commit or a tag follows its header (author, committer, tagger), which ends at the first blank line.
// CI checks out the whole history (fetch-depth: 0) so that every commit is seen; a shallow clone checks fewer.
function messageLeaks(cwd: string): string[] {
  return objects(cwd)
    .filter(({ type }) => type === 'commit' || type === 'tag')
    .flatMap(({ type, id, text }) => {
      const body = text.indexOf('\n\n');
      return body < 0 ? [] : leaks(`${type} ${id.slice(0, 12)}`, text.slice(body + 2));
    });
}

test('no tracked file is a credential file', () => {
  // Compared in lower case, as the CLI compares an untracked name: a tracked .ENV is a credential file too.
  for (const file of tracked(packageDir())) assert.doesNotMatch(basename(file).toLowerCase(), CREDENTIAL_FILE, file);
});

test('.gitignore ignores every kind of credential file, and not .env.example', () => {
  for (const name of CREDENTIAL_EXAMPLES) assert.match(basename(name), CREDENTIAL_FILE, name);
  // The names the CLI meets are not always in lower case, and a file name may hold a line break or be an extension alone.
  for (const name of ['.ENV', 'SECRETS.YAML', 'CLIENT.P12', 'Id_Dsa', '.p12', 'a\nb.pem']) {
    assert.match(basename(name).toLowerCase(), CREDENTIAL_FILE, name);
  }
  assert.doesNotMatch('.env.example', CREDENTIAL_FILE);
  assert.doesNotMatch('README.md'.toLowerCase(), CREDENTIAL_FILE);
  const ignored = git(packageDir(), ['check-ignore', '--no-index', '--', ...CREDENTIAL_EXAMPLES, '.env.example']).toString('utf8');
  assert.deepEqual(ignored.split('\n').filter(Boolean).sort(), [...CREDENTIAL_EXAMPLES].sort());
});

test('tracked files carry no credentials, session links, home paths, or personal email addresses', () => {
  assert.deepEqual(fileLeaks(packageDir()), []);
});

test('no version of a file that a ref reaches carries credentials, session links, home paths, or personal email addresses', () => {
  assert.deepEqual(blobLeaks(packageDir()), []);
});

test('commit and tag messages on every ref carry no credentials, session links, home paths, or personal email addresses', () => {
  assert.deepEqual(messageLeaks(packageDir()), []);
});

test('the patterns catch what they are for and let through what identifies nobody', () => {
  const caught = (line: string) => leaks('x', line).map((leak) => leak.slice('x:1 '.length));
  assert.deepEqual(caught('cd /Users/name'), ['ホームディレクトリの絶対パス']);
  assert.deepEqual(caught('ls /home/name/src'), ['ホームディレクトリの絶対パス']);
  assert.deepEqual(caught('c:\\users\\name'), ['ホームディレクトリの絶対パス']);
  assert.deepEqual(caught('(see /Users/name); then'), ['ホームディレクトリの絶対パス']);
  for (const url of CODEX_URLS) assert.deepEqual(caught(`Task: https://${url}?tab=diff`), ['Codex のセッション URL'], url);
  for (const url of ['https://chatgpt.com/codex', 'https://chatgpt.com/codex/settings/environments', 'https://openai.com/codex/']) {
    assert.deepEqual(caught(url), [], url);
  }
  for (const line of ['mail someone@gmail.com', 'git clone git@evil.example:owner/repo.git', 'git@company.com', 'noreply@gmail.com']) {
    assert.deepEqual(caught(line), ['メールアドレス'], line);
  }
  for (const line of ['git clone git@github.com:owner/repo.git', 'ssh://git@github.com/owner/repo', 'icon@2x.png', 'Signed-off-by: dependabot[bot] <support@github.com>']) {
    assert.deepEqual(caught(line), [], line);
  }
});

// Values that are not SYNTHETIC are put together at run time, so that this file does not spell them out.
test('only the made-up values are let through, and only in this file', () => {
  const home = ['', 'Users', 'someone'].join('/');
  const key = ['sk', 'ant', 'x'.repeat(8)].join('-');
  const email = ['person', 'gmail.com'].join('@');
  assert.deepEqual(leaks(SELF, '(cd /Users/name); mail someone@gmail.com about https://chatgpt.com/c/0', SELF), []);
  assert.deepEqual(leaks('README.md', 'cd /Users/name', 'README.md'), ['README.md:1 ホームディレクトリの絶対パス']);
  assert.deepEqual(leaks(`commit ${SELF}`, 'mail someone@gmail.com'), [`commit ${SELF}:1 メールアドレス`]);
  assert.deepEqual(leaks(SELF, `cd /Users/name ${home}`, SELF), [`${SELF}:1 ホームディレクトリの絶対パス`]);
  assert.deepEqual(leaks(SELF, `${key} ${email}`, SELF), [`${SELF}:1 Anthropic のキーかトークン`, `${SELF}:1 メールアドレス`]);
});

test('the history checks reach deleted files, commits only on another branch, and tag messages', (t) => {
  const dir = repo(t);
  const key = ['sk', 'ant', 'x'.repeat(8)].join('-');
  const home = ['', 'home', 'someone'].join('/');
  const email = ['person', 'gmail.com'].join('@');
  const run = (...args: string[]) => git(dir, args);
  writeFileSync(join(dir, 'a.txt'), `ok\ntoken ${key}\n`);
  commitAll(dir, 'add a');
  rmSync(join(dir, 'a.txt'));
  commitAll(dir, 'remove a');
  run('tag', '-a', 'v1', '-m', `release\n\nby ${email}`);
  run('checkout', '-q', '-b', 'side');
  commitAll(dir, `side\n\nfrom ${home}`);
  run('checkout', '-q', '-');
  const unnamed = (found: string[]) => found.map((leak) => leak.replace(/^(\w+ )?[0-9a-f]{12}/, '$1')).sort();
  assert.deepEqual(fileLeaks(dir), []);
  assert.deepEqual(unnamed(blobLeaks(dir)), [':a.txt:2 Anthropic のキーかトークン']);
  assert.deepEqual(unnamed(messageLeaks(dir)), ['commit :3 ホームディレクトリの絶対パス', 'tag :3 メールアドレス']);
});
