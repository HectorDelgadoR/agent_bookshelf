#!/usr/bin/env node
// ticket-to-merge · tripwire (PostToolUse on Bash|PowerShell, Stop, SessionStart --baseline)
//
// protect.mjs (PreToolUse) blocks obvious and obfuscated attempts by reading the command. Text heuristics can always
// be beaten (a path can be built in endless ways), so this hook checks the RESULT instead: after every shell command it
// verifies the protected files are unchanged and restores them if not, then exits 2 so Claude is told what happened.
//
//   Tracked protected files (src/db/seed.sql, and bookshelf.db-wal / -shm in this repo): compared with the base
//   commit (main, else origin/main, else HEAD) and restored with `git checkout <base> -- <file>`. Comparing with main
//   rather than HEAD means `rm seed.sql && git commit -am x` in one command is caught too.
//   Untracked protected files (bookshelf.db, .env*): compared with a baseline taken at session start
//   (.ticket-to-merge/baseline.json). bookshelf.db is backed up and restored; a new one (e.g. created by starting the
//   server) is deleted. .env* is never copied: only its sha256 is kept, so a change is reported, not restored.
//
// Fails safe: any internal error exits 2 with the error on stderr.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync, appendFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const TRACKED_CANDIDATES = ['src/db/seed.sql', 'bookshelf.db', 'bookshelf.db-wal', 'bookshelf.db-shm'];
const UNTRACKED_DB = ['bookshelf.db', 'bookshelf.db-wal', 'bookshelf.db-shm'];
const isEnv = (name) => /^\.env($|\.)/.test(name) && name !== '.env.example';

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function repoRoot(cwd) {
  const r = git(cwd, 'rev-parse', '--show-toplevel');
  return r.status === 0 ? r.stdout.trim() : null;
}
function baseRef(root) {
  for (const ref of ['main', 'origin/main', 'HEAD']) if (git(root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`).status === 0) return ref;
  return null;
}
const trackedIn = (root, ref, file) => git(root, 'cat-file', '-e', `${ref}:${file}`).status === 0;

// Untracked protected files that exist right now in the repo root, plus the db files (which may not exist yet).
function untrackedProtected(root, ref) {
  const names = new Set(UNTRACKED_DB);
  for (const f of readdirSync(root)) if (isEnv(f)) names.add(f);
  return [...names].filter((f) => !trackedIn(root, ref, f));
}

export function takeBaseline(cwd) {
  const root = repoRoot(cwd); if (!root) return null;
  const ref = baseRef(root); if (!ref || !trackedIn(root, ref, 'src/db/seed.sql')) return null;
  const stateDir = path.join(root, '.ticket-to-merge');
  const backupDir = path.join(stateDir, 'backup');
  mkdirSync(backupDir, { recursive: true });
  const files = {};
  for (const f of untrackedProtected(root, ref)) {
    const abs = path.join(root, f);
    if (!existsSync(abs)) { files[f] = { exists: false }; continue; }
    files[f] = { exists: true, sha256: sha(abs) };
    if (!isEnv(f)) { copyFileSync(abs, path.join(backupDir, f)); files[f].backup = true; } // never copy secrets
  }
  writeFileSync(path.join(stateDir, 'baseline.json'), JSON.stringify({ takenAt: new Date().toISOString(), files }, null, 2));
  return files;
}

// Returns a list of human-readable problems found (and fixed where possible). Empty list = all good.
export function checkAndRestore(cwd) {
  const root = repoRoot(cwd); if (!root) return [];
  const ref = baseRef(root); if (!ref) return [];
  if (!trackedIn(root, ref, 'src/db/seed.sql')) return []; // not this project: stay out of the way
  const problems = [];

  for (const f of TRACKED_CANDIDATES) {
    if (!trackedIn(root, ref, f)) continue;
    const d = git(root, 'diff', '--quiet', ref, '--', f);
    if (d.status === 0) continue;
    const co = git(root, 'checkout', ref, '--', f);
    problems.push(co.status === 0 ? `${f} was modified or deleted and has been restored from ${ref}` : `${f} was modified and could NOT be restored: ${co.stderr.trim()}`);
  }

  const stateDir = path.join(root, '.ticket-to-merge');
  const basePath = path.join(stateDir, 'baseline.json');
  if (!existsSync(basePath)) { takeBaseline(root); return problems; } // first sight of this repo: nothing to compare yet
  const baseline = JSON.parse(readFileSync(basePath, 'utf8')).files || {};
  const names = new Set([...Object.keys(baseline), ...untrackedProtected(root, ref)]);
  for (const f of names) {
    const abs = path.join(root, f);
    const b = baseline[f] || { exists: false };
    const now = existsSync(abs);
    if (!b.exists && now) {
      if (isEnv(f)) { problems.push(`${f} was created; it was left in place, review it`); continue; }
      rmSync(abs, { force: true });
      problems.push(`${f} was created (e.g. by starting the server) and has been removed`);
    } else if (b.exists && (!now || sha(abs) !== b.sha256)) {
      const backup = path.join(stateDir, 'backup', f);
      if (b.backup && existsSync(backup)) { copyFileSync(backup, abs); problems.push(`${f} was ${now ? 'modified' : 'deleted'} and has been restored from the session baseline`); }
      else problems.push(`${f} was ${now ? 'modified' : 'deleted'}; it holds secrets so no copy was kept: restore it yourself`);
    }
  }
  return problems;
}

function log(cwd, entry) {
  try {
    const root = repoRoot(cwd) || cwd;
    const dir = path.join(root, '.ticket-to-merge');
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, 'guardrail.log'), JSON.stringify({ ts: new Date().toISOString(), tripwire: true, ...entry }) + '\n');
  } catch { /* never break the hook on logging */ }
}

function main() {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* use cwd */ }
  const cwd = input.cwd || process.cwd();
  if (process.argv.includes('--baseline')) { takeBaseline(cwd); process.exit(0); }
  if (input.hook_event_name === 'Stop' && input.stop_hook_active) process.exit(0); // avoid loops; PostToolUse already ran
  const problems = checkAndRestore(cwd);
  if (!problems.length) process.exit(0);
  log(cwd, { event: input.hook_event_name, command: input.tool_input?.command, problems });
  process.stderr.write(`BLOCKED by ticket-to-merge tripwire: ${problems.join('; ')}. bookshelf.db, seed.sql and .env must never be touched; don't retry this.\n`);
  process.exit(2);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'));
if (isMain) {
  try { main(); } catch (err) {
    process.stderr.write(`ticket-to-merge tripwire error (failing safe): ${err?.message}\n`);
    process.exit(2);
  }
}
