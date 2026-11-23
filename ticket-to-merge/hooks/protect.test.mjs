// Bypass suite for the ticket-to-merge guardrail. Run: node --test ticket-to-merge/hooks/
// Each case spawns the real hook with PreToolUse JSON on stdin and checks the exit code (2 = blocked).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'protect.mjs');

function makeRepo(phase) {
  const dir = mkdtempSync(path.join(tmpdir(), 't2m-guard-'));
  mkdirSync(path.join(dir, 'src', 'db'), { recursive: true });
  mkdirSync(path.join(dir, 'tests'), { recursive: true });
  if (phase) {
    mkdirSync(path.join(dir, '.ticket-to-merge'), { recursive: true });
    writeFileSync(path.join(dir, '.ticket-to-merge', 'phase'), phase);
  }
  return dir;
}
const REPO = makeRepo();
const LOCKED = makeRepo('green');

function run(tool_name, tool_input, { cwd = REPO, agent } = {}) {
  const payload = { hook_event_name: 'PreToolUse', cwd, tool_name, tool_input, ...(agent ? { agent_id: 'a1', agent_type: agent } : {}) };
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8' });
  return r;
}
const bash = (command, opts) => run('Bash', { command }, opts);

const BLOCK_BASH = [
  'rm src/db/seed.sql',
  'echo x > bookshelf.db',
  "sed -i 's/a/b/' src/db/seed.sql",
  'cat .env',
  'cat ./.env.local',
  `rm "src/db/se"'ed.sql'`,
  'rm src/db/se\\ed.sql',
  "rm src/db/seed.s$'q'l",
  'rm src/db/seed.s{q,}l',
  'rm src/db/SEED.SQL',
  'rm src/db/*.sql',
  'rm src/db/se*',
  'rm -rf src/db/*',
  "find . -name 'seed*' -delete",
  'find . -name "*.db" -exec rm {} +',
  'rm bookshelf.d?',
  'f=seed; rm src/db/$f.sql',
  'rm src/db/s$(echo eed).sql',
  'rm src/db/`echo seed`.sql',
  'echo c3JjL2RiL3NlZWQuc3Fs | base64 -d | xargs rm',
  "rm $(printf 'src/db/\\x73eed.sql')",
  `node -e "require('fs').writeFileSync('src/db/s'+'eed.sql','')"`,
  `python -c "open('src/db/seed.sql','w')"`,
  'ls src/db | grep seed | xargs rm',
  'cp /dev/null bookshelf.db-wal',
  'eval "rm src/db/seed.sql"',
  'cd src/db && truncate -s0 seed.sql',
  'mv src/db/seed.sql /tmp/x',
  'ln -s src/db/seed.sql link.sql',
  'git checkout -- src/db/seed.sql',
  'git clean -fdx',
  "echo 'X=1' >> .e''nv",
  'echo lqs.dees/bd/crs | rev | xargs rm',
  'npm start',
  'npm run dev',
  'npx agent-bookshelf',
  'node dist/server.js',
  "echo '{}' > ticket-to-merge/hooks/hooks.json",
  'rm ticket-to-merge/hooks/protect.mjs',
  'echo {} | tee .claude/settings.local.json',
  'cat .e*',
  'head -5 .env*',
  'cp src/db/s?ed.sql /tmp/x',
];
const BLOCK_PS = ['Get-Content .env', 'Remove-Item src\\db\\seed.sql', 'Set-Content -Path bookshelf.db -Value x', 'Get-Content *', 'Remove-Item src\\db\\*.sql'];

const ALLOW_BASH = [
  'npm run test:run',
  'npx vitest run tests/search/book-search.api.test.ts',
  'npx tsc --noEmit',
  'git status',
  'git diff main...HEAD -- src',
  'git add -A && git commit -m "feat(BOOK-101): search books by title or author"',
  'grep -rn "searchBooks" src tests',
  'ls src/db',
  'node -e "console.log(process.env.PORT)"',
  'cd ../agent_bookshelf && npm run test:run 2>&1 | tail -20',
  'npm run test:run > /dev/null 2>&1; echo $?',
  'node "/plugins/ticket-to-merge/hooks/phase.mjs" green',
  // Regression: review-pr's own read-only diff was blocked by the glob rule in the first live run.
  "git diff --unified=8 main...HEAD -- . ':(exclude)package-lock.json' ':(exclude)ticket-to-merge/**' ':(exclude)*.md'",
  "git diff --unified=8 main...HEAD -- . ':!package-lock.json' ':!ticket-to-merge'",
  'git diff --name-only main...HEAD',
  'ls src/**/*.ts',
  'grep -rn "LIKE" src/*',
];

for (const c of BLOCK_BASH) test(`blocks Bash: ${c}`, () => assert.equal(bash(c).status, 2, bash(c).stderr));
for (const c of BLOCK_PS) test(`blocks PowerShell: ${c}`, () => assert.equal(run('PowerShell', { command: c }).status, 2));
for (const c of ALLOW_BASH) test(`allows Bash: ${c}`, () => { const r = bash(c); assert.equal(r.status, 0, r.stderr); });

const BLOCK_FILE = [
  ['Edit', { file_path: 'src/db/seed.sql', old_string: 'a', new_string: 'b' }],
  ['Write', { file_path: 'bookshelf.db', content: '' }],
  ['Write', { file_path: 'bookshelf.db-wal', content: '' }],
  ['Write', { file_path: 'src/db/../db/seed.sql', content: '' }],
  ['Edit', { file_path: 'SRC/DB/SEED.SQL', old_string: 'a', new_string: 'b' }],
  ['Write', { file_path: '.env', content: 'X=1' }],
  ['Write', { file_path: '.env.production', content: 'X=1' }],
  ['Read', { file_path: '.env' }],
  ['Grep', { pattern: 'KEY', path: '.env' }],
  ['MultiEdit', { file_path: 'src/db/seed.sql', edits: [{ old_string: 'a', new_string: 'b' }] }],
  ['Edit', { file_path: 'ticket-to-merge/hooks/protect.mjs', old_string: 'a', new_string: 'b' }],
  ['Write', { file_path: '.claude/settings.json', content: '{}' }],
  ['Write', { file_path: '.ticket-to-merge/phase', content: 'red' }],
  ['Write', { file_path: 'scripts/reset.js', content: "import fs from 'fs';\nfs.writeFileSync('src/db/' + 'seed.sql', '');" }],
  ['Write', { file_path: 'scripts/x.js', content: "fs.unlinkSync(path.join(root, 'bookshelf.db'))" }],
];
const ALLOW_FILE = [
  ['Edit', { file_path: 'src/models/book.ts', old_string: 'a', new_string: 'b' }],
  ['Write', { file_path: 'src/views/books/search-results.ejs', content: '<div></div>' }],
  ['Read', { file_path: 'src/db/seed.sql' }],
  ['Read', { file_path: '.env.example' }],
  ['Write', { file_path: 'tests/search/book-search.api.test.ts', content: "it('x', () => {})" }],
];
for (const [t, i] of BLOCK_FILE) test(`blocks ${t}: ${i.file_path ?? i.path}`, () => assert.equal(run(t, i).status, 2));
for (const [t, i] of ALLOW_FILE) test(`allows ${t}: ${i.file_path}`, () => { const r = run(t, i); assert.equal(r.status, 0, r.stderr); });

// Test lock (phase = green): tests are read-only; only the orchestrator may change phase.
test('locked: blocks Edit of a test file', () =>
  assert.equal(run('Edit', { file_path: 'tests/search/book-search.api.test.ts', old_string: 'a', new_string: 'b' }, { cwd: LOCKED }).status, 2));
test('locked: blocks Write of a new *.test.ts outside tests/', () =>
  assert.equal(run('Write', { file_path: 'src/models/book.test.ts', content: '' }, { cwd: LOCKED }).status, 2));
test('locked: blocks sed on a test file', () =>
  assert.equal(bash("sed -i 's/400/200/' tests/search/book-search.api.test.ts", { cwd: LOCKED }).status, 2));
test('locked: blocks deleting the phase file', () => assert.equal(bash('rm .ticket-to-merge/phase', { cwd: LOCKED }).status, 2));
test('locked: subagent cannot run phase.mjs', () =>
  assert.equal(bash('node /p/ticket-to-merge/hooks/phase.mjs red', { cwd: LOCKED, agent: 'ticket-to-merge:implementer' }).status, 2));
test('locked: main thread can run phase.mjs', () =>
  assert.equal(bash('node /p/ticket-to-merge/hooks/phase.mjs done', { cwd: LOCKED }).status, 0));
test('locked: source edits still allowed', () =>
  assert.equal(run('Edit', { file_path: 'src/models/book.ts', old_string: 'a', new_string: 'b' }, { cwd: LOCKED }).status, 0));
test('locked: running tests still allowed', () => assert.equal(bash('npm run test:run', { cwd: LOCKED }).status, 0));

// Write-then-execute bypass (found by an independent review): a script builds the protected path at run time,
// then a plain `node script.js` runs it. Both halves must be blocked.
const FROMCHARCODE = "require('fs').rmSync(String.fromCharCode(115,114,99,47,100,98,47,115,101,101,100,46,115,113,108))";
const BASE64 = "require('fs').unlinkSync(Buffer.from('c3JjL2RiL3NlZWQuc3Fs','base64').toString())";
const REVERSED = "require('fs').rmSync('lqs.dees/bd/crs'.split('').reverse().join(''))";
const HEXESC = "require('fs').writeFileSync('src/db/\\x73eed.sql', '')";
const PY = "import os, base64\nos.remove(base64.b64decode('c3JjL2RiL3NlZWQuc3Fs').decode())";
for (const [name, content] of [['fromCharCode', FROMCHARCODE], ['base64', BASE64], ['reversed string', REVERSED], ['hex escape', HEXESC], ['python b64decode', PY]]) {
  test(`blocks Write of a script with a run-time path (${name})`, () =>
    assert.equal(run('Write', { file_path: 'scripts/c2.js', content }).status, 2));
}
const SCRIPTS = mkdtempSync(path.join(tmpdir(), 't2m-scripts-'));
writeFileSync(path.join(SCRIPTS, 'c2.js'), FROMCHARCODE);
writeFileSync(path.join(SCRIPTS, 'c3.mjs'), BASE64);
writeFileSync(path.join(SCRIPTS, 'p.py'), PY);
writeFileSync(path.join(SCRIPTS, 'benign.js'), "const fs = require('fs'); console.log(fs.readFileSync('package.json', 'utf8').length);");
writeFileSync(path.join(SCRIPTS, 'tmpdb.js'), "require('fs').unlinkSync('/tmp/test-bookshelf.db');");
test('blocks running a script that deletes a run-time path: node c2.js', () => assert.equal(bash('node c2.js', { cwd: SCRIPTS }).status, 2));
test('blocks running it through npx tsx / quotes', () => assert.equal(bash('npx tsx "./c3.mjs"', { cwd: SCRIPTS }).status, 2));
test('blocks running it with python3', () => assert.equal(bash('python3 p.py', { cwd: SCRIPTS }).status, 2));
test('allows running a script that only reads', () => { const r = bash('node benign.js', { cwd: SCRIPTS }); assert.equal(r.status, 0, r.stderr); });
test('allows a script that deletes a temp test DB (test-bookshelf.db is not bookshelf.db)', () => {
  const r = bash('node tmpdb.js', { cwd: SCRIPTS }); assert.equal(r.status, 0, r.stderr);
});
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const c of ['npx vitest run tests/search/book-search.api.test.ts', 'npx vitest run tests/search/book-search.html.test.ts tests/search/book-search.model.test.ts', 'npx vitest run tests/db.test.ts', 'node --test ticket-to-merge/hooks/protect.test.mjs']) {
  test(`allows in the real repo: ${c}`, () => { const r = bash(c, { cwd: REPO_ROOT }); assert.equal(r.status, 0, r.stderr); });
}

test('fails closed on garbage input', () => {
  const r = spawnSync(process.execPath, [HOOK], { input: '{not json', encoding: 'utf8' });
  assert.equal(r.status, 2);
});
