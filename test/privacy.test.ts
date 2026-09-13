import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { packageDir } from '../src/files.js';

// CLAUDE.md §6: committed files carry no credentials, session links, or personal data. This file holds the patterns, so it is not scanned.
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
  ['ホームディレクトリの絶対パス', /\/Users\/[^/\s`'"]+\/|\/home\/[^/\s`'"]+\/|[A-Z]:\\Users\\/],
];
// Addresses that identify nobody: test fixtures and GitHub's noreply addresses.
const ALLOWED_EMAIL = /@(?:example\.com|users\.noreply\.github\.com)$/;
const EMAIL = /[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
// File names that hold credentials; .gitignore keeps them out of `git add -A`.
const CREDENTIAL_FILE = /^(?:\.env(?:\..+)?|\.npmrc|\.credentials\.json|auth\.json|id_(?:rsa|ed25519|ecdsa)(?:\.pub)?|.+\.(?:pem|key))$/;

function tracked(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: packageDir(), encoding: 'utf8' }).split('\0').filter(Boolean);
}

test('no tracked file is a credential file', () => {
  for (const file of tracked()) assert.doesNotMatch(basename(file), CREDENTIAL_FILE, file);
});

test('tracked files carry no credentials, session links, home paths, or personal email addresses', () => {
  const found: string[] = [];
  for (const file of tracked().filter((file) => file !== SELF)) {
    readFileSync(join(packageDir(), file), 'utf8')
      .split('\n')
      .forEach((line, index) => {
        for (const [name, pattern] of SECRETS) if (pattern.test(line)) found.push(`${file}:${index + 1} ${name}`);
        for (const [email] of line.matchAll(EMAIL)) if (!ALLOWED_EMAIL.test(email)) found.push(`${file}:${index + 1} メールアドレス`);
      });
  }
  assert.deepEqual(found, []);
});
