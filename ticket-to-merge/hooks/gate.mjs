#!/usr/bin/env node
// ticket-to-merge · Stop / SubagentStop gate ("done" means the suite is green)
//
// Active only while the pipeline phase is green | review | fix (see phase.mjs), so ordinary sessions
// never pay for a test run. For SubagentStop it only gates builder agents (implementer / fixer).
// On failure it blocks the stop and feeds back a TRIMMED failure summary (failed test names + first
// assertion lines), not the full Vitest log: that keeps the fix loop's context (and cost) small.
// After 5 consecutive blocks it lets the stop through with a warning, so a stuck agent can't loop forever.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const MAX_BLOCKS = 5;

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* treat as empty */ }
const cwd = input.cwd || process.cwd();
const stateDir = path.join(cwd, '.ticket-to-merge');

let phase = '';
try { phase = readFileSync(path.join(stateDir, 'phase'), 'utf8').trim(); } catch { process.exit(0); }
if (!['green', 'review', 'fix'].includes(phase)) process.exit(0);

if (input.hook_event_name === 'SubagentStop' && !/(implementer|fixer)/i.test(input.agent_type || '')) process.exit(0);
if (!existsSync(path.join(cwd, 'package.json'))) process.exit(0);

let output = '';
let passed = false;
try {
  output = execSync('npm run test:run', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  passed = true;
} catch (err) {
  output = `${err.stdout || ''}\n${err.stderr || ''}`;
}

const countFile = path.join(stateDir, 'gate-count');
if (passed) {
  try { writeFileSync(countFile, '0'); } catch { /* ignore */ }
  process.exit(0);
}

let count = 0;
try { count = parseInt(readFileSync(countFile, 'utf8'), 10) || 0; } catch { /* 0 */ }
count += 1;
try { writeFileSync(countFile, String(count)); } catch { /* ignore */ }

// Trim: keep FAIL lines, assertion messages and the summary; drop stack frames and source excerpts.
const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
const keep = clean.split(/\r?\n/).filter((l) =>
  /^\s*(FAIL|×|✗)|AssertionError|Expected|Received|expected .* to |Error:|Test Files|Tests\s+\d/.test(l));
const summary = [...new Set(keep)].slice(0, 40).join('\n') || clean.split(/\r?\n/).slice(-30).join('\n');

if (count > MAX_BLOCKS) {
  process.stderr.write(`ticket-to-merge gate: suite still failing after ${MAX_BLOCKS} attempts; allowing stop. Report the failure to the user.\n${summary}\n`);
  process.exit(0);
}
process.stderr.write(`Not done: \`npm run test:run\` is failing (gate attempt ${count}/${MAX_BLOCKS}). Fix the implementation, not the tests.\n${summary}\n`);
process.exit(2);
