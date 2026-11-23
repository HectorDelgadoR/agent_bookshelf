// Tripwire tests. Every test builds a throwaway git repo under os.tmpdir() and runs attacks there for real;
// nothing here ever touches the project's own files. Run: node --test ticket-to-merge/hooks/tripwire.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TRIPWIRE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tripwire.mjs');
const SEED = '-- seed data\nINSERT INTO books VALUES (1);\n';
const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });

function makeRepo({ trackSeed = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 't2m-trip-'));
  git(dir, 'init', '-q', '-b', 'main');
  mkdirSync(path.join(dir, 'src', 'db'), { recursive: true });
  mkdirSync(path.join(dir, 'scripts'));
  writeFileSync(path.join(dir, 'src', 'db', 'seed.sql'), SEED);
  writeFileSync(path.join(dir, '.gitignore'), 'bookshelf.db\n.env\n.ticket-to-merge/\n');
  writeFileSync(path.join(dir, 'README.md'), 'x\n');
  git(dir, 'add', trackSeed ? '.' : 'README.md');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}
function tripwire(cwd, extra = {}) {
  return spawnSync(process.execPath, [TRIPWIRE], { input: JSON.stringify({ hook_event_name: 'PostToolUse', cwd, tool_name: 'Bash', tool_input: { command: 'x' }, ...extra }), encoding: 'utf8' });
}
const baseline = (cwd) => spawnSync(process.execPath, [TRIPWIRE, '--baseline'], { input: JSON.stringify({ hook_event_name: 'SessionStart', cwd }), encoding: 'utf8' });
// Restores come from `git checkout`, which applies the machine's line-ending setting (CRLF on Windows with
// core.autocrlf), so compare content the way git does: ignoring CR.
const seedOf = (dir) => (existsSync(path.join(dir, 'src', 'db', 'seed.sql')) ? readFileSync(path.join(dir, 'src', 'db', 'seed.sql'), 'utf8').replace(/\r\n/g, '\n') : null);
const python = ['python', 'python3'].find((p) => spawnSync(p, ['--version']).status === 0);

// The second independent review's attack chains: each defeats the PreToolUse text heuristics.
const CHAINS = {
  'array join': { 'scripts/j.js': "require('fs').rmSync(['src/db/se','ed.sql'].join(''))" },
  'spread + reverse': { 'scripts/s.js': "require('fs').rmSync([...'lqs.dees/bd/crs'].reverse().join(''))" },
  '.replace()': { 'scripts/x.js': "require('fs').rmSync('src/db/seXed.sql'.replace('X',''))" },
  'directory listing': { 'scripts/r.js': "const fs=require('fs'); for (const f of fs.readdirSync('src/db')) if (f.endsWith('.sql') && f[0]==='s' && f[1]==='e') fs.rmSync('src/db/'+f)" },
  'path read from a data file': { 'scripts/target.txt': 'src/db/seed.sql', 'scripts/f.js': "const fs=require('fs'); fs.rmSync(fs.readFileSync('scripts/target.txt','utf8').trim())" },
  'two modules': { 'scripts/a.js': 'module.exports = String.fromCharCode(115,114,99,47,100,98,47,115,101,101,100,46,115,113,108)', 'scripts/b.js': "require('fs').rmSync(require('./a.js'))" },
  'overwrite instead of delete': { 'scripts/o.js': "require('fs').writeFileSync(['src/db/se','ed.sql'].join(''), 'DROP TABLE books;')" },
};
const RUN = { 'array join': 'scripts/j.js', 'spread + reverse': 'scripts/s.js', '.replace()': 'scripts/x.js', 'directory listing': 'scripts/r.js', 'path read from a data file': 'scripts/f.js', 'two modules': 'scripts/b.js', 'overwrite instead of delete': 'scripts/o.js' };

for (const [name, files] of Object.entries(CHAINS)) {
  test(`chain "${name}": the attack really changes seed.sql, the tripwire blocks and restores it`, () => {
    const dir = makeRepo();
    for (const [f, content] of Object.entries(files)) writeFileSync(path.join(dir, f), content);
    const ran = spawnSync(process.execPath, [RUN[name]], { cwd: dir, encoding: 'utf8' });
    assert.equal(ran.status, 0, ran.stderr);
    assert.notEqual(seedOf(dir), SEED, 'precondition: the attack changed seed.sql');
    const r = tripwire(dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /BLOCKED by ticket-to-merge tripwire: src\/db\/seed\.sql/);
    assert.equal(seedOf(dir), SEED);
    assert.equal(tripwire(dir).status, 0, 'clean afterwards');
  });
}

test('chain "python join": blocked and restored', { skip: !python && 'python not installed' }, () => {
  const dir = makeRepo();
  writeFileSync(path.join(dir, 'scripts', 'p.py'), "import os\nos.remove(''.join(['src/db/se','ed.sql']))\n");
  assert.equal(spawnSync(python, ['scripts/p.py'], { cwd: dir }).status, 0);
  assert.equal(seedOf(dir), null);
  assert.equal(tripwire(dir).status, 2);
  assert.equal(seedOf(dir), SEED);
});

test('a deletion committed in the same command (branch off main) is restored from main', () => {
  const dir = makeRepo();
  git(dir, 'checkout', '-q', '-b', 'feature');
  rmSync(path.join(dir, 'src', 'db', 'seed.sql'));
  git(dir, 'commit', '-q', '-am', 'remove seed');
  assert.equal(seedOf(dir), null);
  assert.equal(tripwire(dir).status, 2);
  assert.equal(seedOf(dir), SEED);
});

test('also runs at Stop (catches background commands), but not when stop_hook_active', () => {
  const dir = makeRepo();
  writeFileSync(path.join(dir, 'src', 'db', 'seed.sql'), 'tampered');
  assert.equal(tripwire(dir, { hook_event_name: 'Stop', stop_hook_active: true }).status, 0);
  assert.equal(tripwire(dir, { hook_event_name: 'Stop' }).status, 2);
  assert.equal(seedOf(dir), SEED);
});

test('nothing changed -> exit 0', () => assert.equal(tripwire(makeRepo()).status, 0));
test('not a git repo -> exit 0', () => assert.equal(tripwire(mkdtempSync(path.join(tmpdir(), 't2m-nogit-'))).status, 0));
test('seed.sql not tracked (another project) -> exit 0, nothing touched', () => {
  const dir = makeRepo({ trackSeed: false });
  writeFileSync(path.join(dir, 'src', 'db', 'seed.sql'), 'whatever');
  assert.equal(tripwire(dir).status, 0);
  assert.equal(seedOf(dir), 'whatever');
});
test('ordinary edits elsewhere are ignored', () => {
  const dir = makeRepo();
  writeFileSync(path.join(dir, 'README.md'), 'changed\n');
  mkdirSync(path.join(dir, 'src', 'models'));
  writeFileSync(path.join(dir, 'src', 'models', 'book.ts'), 'export {}\n');
  assert.equal(tripwire(dir).status, 0);
});

// Untracked protected files, compared with the session baseline.
test('a new bookshelf.db (e.g. the server was started) is removed', () => {
  const dir = makeRepo();
  assert.equal(baseline(dir).status, 0);
  writeFileSync(path.join(dir, 'bookshelf.db'), 'SQLite format 3');
  const r = tripwire(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /bookshelf\.db was created/);
  assert.equal(existsSync(path.join(dir, 'bookshelf.db')), false);
});
test('an existing bookshelf.db that is overwritten or deleted is restored from the baseline backup', () => {
  const dir = makeRepo();
  writeFileSync(path.join(dir, 'bookshelf.db'), 'original-db');
  baseline(dir);
  writeFileSync(path.join(dir, 'bookshelf.db'), 'tampered');
  assert.equal(tripwire(dir).status, 2);
  assert.equal(readFileSync(path.join(dir, 'bookshelf.db'), 'utf8'), 'original-db');
  rmSync(path.join(dir, 'bookshelf.db'));
  assert.equal(tripwire(dir).status, 2);
  assert.equal(readFileSync(path.join(dir, 'bookshelf.db'), 'utf8'), 'original-db');
});
test('.env changes are reported but never copied (secrets)', () => {
  const dir = makeRepo();
  writeFileSync(path.join(dir, '.env'), 'API_KEY=secret');
  baseline(dir);
  assert.equal(existsSync(path.join(dir, '.ticket-to-merge', 'backup', '.env')), false);
  assert.doesNotMatch(readFileSync(path.join(dir, '.ticket-to-merge', 'baseline.json'), 'utf8'), /secret/);
  writeFileSync(path.join(dir, '.env'), 'API_KEY=changed');
  const r = tripwire(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\.env was modified/);
});
test('same baseline, nothing changed -> exit 0', () => {
  const dir = makeRepo();
  writeFileSync(path.join(dir, 'bookshelf.db'), 'db');
  baseline(dir);
  assert.equal(tripwire(dir).status, 0);
});
