import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { packageDir } from '../src/files.js';

// CLAUDE.md §6: committed files and commit messages carry no credentials, session links, or personal data. This file holds the patterns, so it is not scanned.
const SELF = 'test/privacy.test.ts';

const SECRETS: [string, RegExp][] = [
  ['Anthropic のキーかトークン', /sk-ant-[A-Za-z0-9_-]{8,}/],
  ['OpenAI のキー', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ['GitHub のトークン', /\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_\w{20,}/],
  ['Slack のトークン', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['AWS のキー', /\bAKIA[0-9A-Z]{16}\b/],
  ['秘密鍵', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['JWT', /\beyJ[\w-]{10,}\.[\w-]{10,}\./],
  ['Claude の認証情報の項目', /"(?:accessToken|refreshToken|oauthAccount)"\s*:/],
  ['Claude のセッション URL', /claude\.ai\/code\/session_|Claude-Session:/],
  // The user name may end the path (cd /Users/name); Windows paths ignore case.
  ['ホームディレクトリの絶対パス', /\/Users\/[^/\s`'"]+|\/home\/[^/\s`'"]+|[A-Za-z]:\\[Uu]sers\\/],
];
// Addresses that identify nobody: GitHub's SSH remote (git@github.com), the Co-Authored-By address of Claude in early commits,
// the sign-off of Dependabot's commits, test fixtures, GitHub's noreply addresses, and image names for high-density screens
// (icon@2x.png). Other hosts' git@ and noreply@ addresses may belong to a person or a company, so they are not allowed.
const ALLOWED_EMAIL =
  /^(?:git@github\.com|noreply@anthropic\.com|support@github\.com)$|@(?:example\.com|users\.noreply\.github\.com)$|@\d+x\.(?:png|jpe?g|gif|webp|svg)$/;
const EMAIL = /[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
// File names that hold credentials; .gitignore keeps them out of `git add -A`. .env.example is a template without values.
const CREDENTIAL_FILE =
  /^(?:\.env(?:\.(?!example$).+)?|\.npmrc|\.netrc|_netrc|\.git-credentials|\.credentials\.json|auth\.json|id_(?:rsa|ed25519(?:_sk)?|ecdsa(?:_sk)?)(?:\.pub)?|.+\.(?:pem|key))$/;
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
  'server.pem',
  'server.key',
  'sub/id_rsa',
];

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: packageDir(), encoding: 'utf8' });
}

function tracked(): string[] {
  return git(['ls-files', '-z']).split('\0').filter(Boolean);
}

// "<label>:<line> <what>" for each line of text that carries a secret pattern or an email address not in ALLOWED_EMAIL.
function leaks(label: string, text: string): string[] {
  const found: string[] = [];
  text.split('\n').forEach((line, index) => {
    for (const [name, pattern] of SECRETS) if (pattern.test(line)) found.push(`${label}:${index + 1} ${name}`);
    for (const [email] of line.matchAll(EMAIL)) if (!ALLOWED_EMAIL.test(email)) found.push(`${label}:${index + 1} メールアドレス`);
  });
  return found;
}

test('no tracked file is a credential file', () => {
  for (const file of tracked()) assert.doesNotMatch(basename(file), CREDENTIAL_FILE, file);
});

test('.gitignore ignores every kind of credential file, and not .env.example', () => {
  for (const name of CREDENTIAL_EXAMPLES) assert.match(basename(name), CREDENTIAL_FILE, name);
  assert.doesNotMatch('.env.example', CREDENTIAL_FILE);
  const ignored = git(['check-ignore', '--no-index', '--', ...CREDENTIAL_EXAMPLES, '.env.example']);
  assert.deepEqual(ignored.split('\n').filter(Boolean).sort(), [...CREDENTIAL_EXAMPLES].sort());
});

test('tracked files carry no credentials, session links, home paths, or personal email addresses', () => {
  const found = tracked()
    .filter((file) => file !== SELF)
    .flatMap((file) => leaks(file, readFileSync(join(packageDir(), file), 'utf8')));
  assert.deepEqual(found, []);
});

// CI checks out the whole history (fetch-depth: 0) so that every commit message is seen; a shallow clone checks fewer.
test('commit messages carry no credentials, session links, home paths, or personal email addresses', () => {
  const found = git(['log', '-z', '--format=%h%n%B'])
    .split('\0')
    .filter(Boolean)
    .flatMap((commit) => {
      const [hash = '', ...body] = commit.split('\n');
      return leaks(`commit ${hash}`, body.join('\n'));
    });
  assert.deepEqual(found, []);
});

test('the patterns catch what they are for and let through what identifies nobody', () => {
  const caught = (line: string) => leaks('x', line).map((leak) => leak.slice('x:1 '.length));
  assert.deepEqual(caught('cd /Users/name'), ['ホームディレクトリの絶対パス']);
  assert.deepEqual(caught('ls /home/name/src'), ['ホームディレクトリの絶対パス']);
  assert.deepEqual(caught('c:\\users\\name'), ['ホームディレクトリの絶対パス']);
  for (const line of ['mail someone@gmail.com', 'git clone git@evil.example:owner/repo.git', 'git@company.com', 'noreply@gmail.com']) {
    assert.deepEqual(caught(line), ['メールアドレス'], line);
  }
  for (const line of ['git clone git@github.com:owner/repo.git', 'ssh://git@github.com/owner/repo', 'icon@2x.png', 'Signed-off-by: dependabot[bot] <support@github.com>']) {
    assert.deepEqual(caught(line), [], line);
  }
});
